import type { IndexedCard } from './types';

export interface CardInstance {
  uid: string;
  card: IndexedCard;
}

let seq = 0;

/** Expande o main (qty → instâncias individuais) para uma pilha embaralhável. */
export function buildLibrary(
  rows: { card: IndexedCard; qty: number; board: 'main' | 'side' }[],
): CardInstance[] {
  const lib: CardInstance[] = [];
  for (const r of rows) {
    if (r.board !== 'main') continue;
    for (let i = 0; i < r.qty; i++) lib.push({ uid: `c${seq++}`, card: r.card });
  }
  return shuffle(lib);
}

/** Fisher–Yates, retorna um novo array. */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
