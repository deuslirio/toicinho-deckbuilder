import MiniSearch from 'minisearch';
import type { CardIndexFile, IndexedCard } from '../lib/types';

let cache: {
  cards: IndexedCard[];
  byId: Map<string, IndexedCard>;
  search: MiniSearch<IndexedCard>;
  meta: { generatedAt: string; count: number };
} | null = null;

/** Remove acentos para busca tolerante (pt: "raio" acha "Raio", "sebiju" ~ "Seiba"...). */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export async function loadCardIndex() {
  if (cache) return cache;

  const url = `${import.meta.env.BASE_URL}data/cards.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não consegui carregar o índice de cartas (${res.status}).`);
  const file: CardIndexFile = await res.json();

  const byId = new Map(file.cards.map((c) => [c.id, c]));

  const search = new MiniSearch<IndexedCard>({
    fields: ['name', 'namePt', 'typeLine'],
    storeFields: ['id'],
    extractField: (doc, field) => {
      const v = (doc as unknown as Record<string, unknown>)[field];
      return typeof v === 'string' ? fold(v) : '';
    },
    searchOptions: {
      prefix: true,
      fuzzy: 0.15,
      boost: { name: 3, namePt: 3, typeLine: 1 },
      combineWith: 'AND',
    },
  });
  search.addAll(file.cards);

  cache = {
    cards: file.cards,
    byId,
    search,
    meta: { generatedAt: file.generatedAt, count: file.count },
  };
  return cache;
}

export function queryCards(
  index: NonNullable<typeof cache>,
  raw: string,
  limit = 60,
): IndexedCard[] {
  const q = raw.trim();
  if (!q) return [];
  const hits = index.search.search(fold(q));
  const out: IndexedCard[] = [];
  for (const h of hits) {
    const card = index.byId.get(h.id as string);
    if (card) out.push(card);
    if (out.length >= limit) break;
  }
  return out;
}
