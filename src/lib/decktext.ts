// Importação/exportação de decklists em texto ("3 Lightning Bolt" / "3 Raio").
// Resolve nomes PT ou EN para o oracle_id do índice.

import type { Deck, DeckEntry, IndexedCard } from './types';
import { compareCards } from './sort';

function buildNameMap(cards: IndexedCard[]) {
  const map = new Map<string, string>(); // nome normalizado -> id
  const norm = (s: string) => s.toLowerCase().replace(/[’‘´`]/g, "'").replace(/\s+/g, ' ').trim();
  for (const c of cards) {
    map.set(norm(c.name), c.id);
    const front = c.name.split(' // ')[0];
    if (front !== c.name) map.set(norm(front), c.id);
    if (c.namePt) {
      map.set(norm(c.namePt), c.id);
      const ptFront = c.namePt.split(' // ')[0];
      if (ptFront !== c.namePt) map.set(norm(ptFront), c.id);
    }
  }
  return { map, norm };
}

const LINE = /^\s*(?:(\d+)\s*x?\s+)?(.+?)\s*$/i;

export interface ParseResult {
  deck: Deck;
  unresolved: string[];
}

export function parseDeckText(text: string, cards: IndexedCard[]): ParseResult {
  const { map, norm } = buildNameMap(cards);
  const deck: Deck = { name: 'Deck importado', main: [], side: [] };
  const unresolved: string[] = [];
  let board: 'main' | 'side' = 'main';

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    if (/^(sideboard|side ?board|reserva)\b/i.test(line)) {
      board = 'side';
      continue;
    }
    const m = line.match(LINE);
    if (!m) continue;
    const qty = m[1] ? parseInt(m[1], 10) : 1;
    const name = m[2].replace(/\s*\([A-Z0-9]{2,5}\)\s*\d*\s*$/i, ''); // tira "(SET) 123"
    const id = map.get(norm(name));
    if (!id) {
      unresolved.push(line);
      continue;
    }
    const list = deck[board];
    const existing = list.find((e) => e.id === id);
    if (existing) existing.qty += qty;
    else list.push({ id, qty });
  }
  return { deck, unresolved };
}

export function deckToText(deck: Deck, byId: Map<string, IndexedCard>, lang: 'pt' | 'en'): string {
  const line = (id: string, qty: number) => {
    const c = byId.get(id);
    if (!c) return `${qty} ${id}`;
    const name = lang === 'pt' && c.namePt ? c.namePt : c.name;
    return `${qty} ${name}`;
  };
  // mesma ordem do editor (terrenos, depois raridade) — entradas sem carta
  // no índice ficam no fim, na ordem em que estavam.
  const sorted = (list: DeckEntry[]) =>
    [...list].sort((a, b) => {
      const ca = byId.get(a.id);
      const cb = byId.get(b.id);
      if (!ca || !cb) return ca ? -1 : cb ? 1 : 0;
      return compareCards(ca, cb);
    });
  const out = sorted(deck.main).map((e) => line(e.id, e.qty));
  if (deck.side.length) {
    out.push('', 'Sideboard');
    out.push(...sorted(deck.side).map((e) => line(e.id, e.qty)));
  }
  return out.join('\n');
}
