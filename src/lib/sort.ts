// Ordem padrão de exibição das cartas: terrenos primeiro, depois raridade
// crescente (comum → incomum → rara → mítica). Usada no editor (colunas
// Main/Sideboard) e na exportação de texto, pra ficarem sempre iguais.
import type { IndexedCard } from './types';

const RARITY_ORDER: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  mythic: 4,
  special: 5,
  bonus: 6,
};

export function isLand(card: IndexedCard): boolean {
  return /\bLand\b/.test(card.typeLine);
}

export function compareCards(a: IndexedCard, b: IndexedCard): number {
  const groupA = isLand(a) ? 0 : (RARITY_ORDER[a.rarity] ?? 99);
  const groupB = isLand(b) ? 0 : (RARITY_ORDER[b.rarity] ?? 99);
  if (groupA !== groupB) return groupA - groupB;
  return a.cmc - b.cmc || a.name.localeCompare(b.name, 'en');
}
