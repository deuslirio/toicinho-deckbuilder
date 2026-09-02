import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Board, Deck, DeckEntry } from '../lib/types';

const EMPTY: Deck = { name: 'Novo deck', main: [], side: [] };

interface DeckState {
  deck: Deck;
  setName: (name: string) => void;
  add: (id: string, board?: Board, qty?: number) => void;
  setQty: (id: string, board: Board, qty: number) => void;
  move: (id: string, from: Board, to: Board) => void;
  clear: () => void;
  replace: (deck: Deck) => void;
}

function bump(list: DeckEntry[], id: string, delta: number): DeckEntry[] {
  const i = list.findIndex((e) => e.id === id);
  if (i === -1) return delta > 0 ? [...list, { id, qty: delta }] : list;
  const qty = list[i].qty + delta;
  if (qty <= 0) return list.filter((e) => e.id !== id);
  return list.map((e) => (e.id === id ? { ...e, qty } : e));
}

export const useDeck = create<DeckState>()(
  persist(
    (set) => ({
      deck: EMPTY,
      setName: (name) => set((s) => ({ deck: { ...s.deck, name } })),
      add: (id, board = 'main', qty = 1) =>
        set((s) => ({ deck: { ...s.deck, [board]: bump(s.deck[board], id, qty) } })),
      setQty: (id, board, qty) =>
        set((s) => {
          const cur = s.deck[board].find((e) => e.id === id)?.qty ?? 0;
          return { deck: { ...s.deck, [board]: bump(s.deck[board], id, qty - cur) } };
        }),
      move: (id, from, to) =>
        set((s) => {
          const qty = s.deck[from].find((e) => e.id === id)?.qty ?? 0;
          if (!qty) return s;
          return {
            deck: {
              ...s.deck,
              [from]: bump(s.deck[from], id, -qty),
              [to]: bump(s.deck[to], id, qty),
            },
          };
        }),
      clear: () => set({ deck: EMPTY }),
      replace: (deck) => set({ deck }),
    }),
    { name: 'toicinho-deck' },
  ),
);

// ---- Compartilhamento por URL (#d=<base64 do deck>) --------------------------

export function encodeDeck(deck: Deck): string {
  const compact = {
    n: deck.name,
    m: deck.main.map((e) => [e.id, e.qty]),
    s: deck.side.map((e) => [e.id, e.qty]),
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
}

export function decodeDeck(hash: string): Deck | null {
  try {
    const c = JSON.parse(decodeURIComponent(escape(atob(hash))));
    return {
      name: typeof c.n === 'string' ? c.n : 'Deck importado',
      main: (c.m ?? []).map(([id, qty]: [string, number]) => ({ id, qty })),
      side: (c.s ?? []).map(([id, qty]: [string, number]) => ({ id, qty })),
    };
  } catch {
    return null;
  }
}

export function readDeckFromUrl(): Deck | null {
  const m = window.location.hash.match(/[#&]d=([^&]+)/);
  return m ? decodeDeck(m[1]) : null;
}

export function shareUrl(deck: Deck): string {
  return `${window.location.origin}${window.location.pathname}#d=${encodeDeck(deck)}`;
}
