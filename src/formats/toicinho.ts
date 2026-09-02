// Regras do formato Toicinho (Bacon Arcano).
// Fonte oficial: https://www.baconarcano.com/blog/toicinho e /blog/banidas
//
// - Limite de cópias POR RARIDADE (não é o 4-of padrão):
//     comum 3 · incomum 3 · rara 2 · mítica 1
// - Lendária (qualquer carta com "Legendary" no tipo): 1 cópia, ignora a raridade.
// - Pool: da Quarta Edição (1995) ao set mais recente.
// - Inválidas: cartas com "Commander" / "Zona de Comando" / "Draft" na caixa de regras.
//   (marcado como poolLegal=false no índice de cartas)
// - Deck: mínimo 60 cartas no main; sideboard de até 15.
// - Banlist única (sem restritas), atualizada em src/formats/toicinho.banlist.json.

import type { IndexedCard, Rarity } from '../lib/types';
import banlistFile from './toicinho.banlist.json';
import rarityOverridesFile from './toicinho.rarity-overrides.json';

const RARITY_OVERRIDES = rarityOverridesFile.overrides as Record<string, Rarity>;

/** Raridade usada pelas regras: override manual da organização, senão a do índice. */
export function effectiveRarity(card: IndexedCard): Rarity {
  return RARITY_OVERRIDES[card.name] ?? card.rarity;
}

export const TOICINHO = {
  name: 'Toicinho',
  deckMin: 60,
  sideboardMax: 15,
  copyLimitByRarity: {
    common: 3,
    uncommon: 3,
    rare: 2,
    mythic: 1,
    special: 1, // raridade fora do padrão — tratada como 1 e sinalizada
    bonus: 1,
  } satisfies Record<Rarity, number>,
} as const;

/** Cartas com "um deck pode ter qualquer quantidade de cartas com este nome". */
const ANY_NUMBER = new Set<string>([
  'Persistent Petitioners',
  'Rat Colony',
  'Relentless Rats',
  'Shadowborn Apostle',
  'Seven Dwarves',
  'Dragon’s Approach',
  'Nazgûl',
  'Templar Knight',
  'Slime Against Humanity',
]);

export const BANNED_NAMES: ReadonlySet<string> = new Set(
  (banlistFile.banned as { name: string }[]).map((b) => normalize(b.name)),
);

export const banlistMeta = {
  source: banlistFile.source,
  generatedAt: banlistFile.generatedAt,
  count: banlistFile.count,
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[’‘´`]/g, "'").trim();
}

export function isBasicLand(card: IndexedCard): boolean {
  return /\bBasic\b.*\bLand\b/.test(card.typeLine);
}

export function isBanned(card: IndexedCard): boolean {
  // casa tanto pelo nome completo (cartas de duas faces) quanto pela face da frente
  if (BANNED_NAMES.has(normalize(card.name))) return true;
  const front = card.name.split(' // ')[0];
  return front !== card.name && BANNED_NAMES.has(normalize(front));
}

/** Máximo de cópias da carta permitido no deck (main + side somados). */
export function copyLimit(card: IndexedCard): number {
  if (isBasicLand(card) || ANY_NUMBER.has(card.name)) return Infinity;
  if (card.legendary) return 1;
  return TOICINHO.copyLimitByRarity[effectiveRarity(card)] ?? 1;
}

export type ViolationCode =
  | 'BANNED'
  | 'OUT_OF_POOL'
  | 'OVER_COPY_LIMIT'
  | 'DECK_TOO_SMALL'
  | 'SIDEBOARD_TOO_BIG'
  | 'SPECIAL_RARITY';

export interface Violation {
  code: ViolationCode;
  cardId?: string;
  cardName?: string;
  message: string;
}

export interface LegalityResult {
  legal: boolean;
  violations: Violation[];
  warnings: Violation[];
  counts: { main: number; side: number; unique: number };
}

interface Counted {
  card: IndexedCard;
  main: number;
  side: number;
}

export function checkDeck(
  entries: { card: IndexedCard; qty: number; board: 'main' | 'side' }[],
): LegalityResult {
  const byId = new Map<string, Counted>();
  for (const e of entries) {
    const c = byId.get(e.card.id) ?? { card: e.card, main: 0, side: 0 };
    c[e.board] += e.qty;
    byId.set(e.card.id, c);
  }

  const violations: Violation[] = [];
  const warnings: Violation[] = [];
  let main = 0;
  let side = 0;

  for (const { card, main: m, side: s } of byId.values()) {
    main += m;
    side += s;
    const total = m + s;

    if (isBanned(card)) {
      violations.push({
        code: 'BANNED',
        cardId: card.id,
        cardName: card.name,
        message: `${card.name} está na banlist do Toicinho.`,
      });
    }
    if (!card.poolLegal) {
      violations.push({
        code: 'OUT_OF_POOL',
        cardId: card.id,
        cardName: card.name,
        message: `${card.name} está fora do pool (anterior à 4ª Edição ou menciona Commander/Draft).`,
      });
    }
    const limit = copyLimit(card);
    if (total > limit) {
      violations.push({
        code: 'OVER_COPY_LIMIT',
        cardId: card.id,
        cardName: card.name,
        message: `${card.name}: ${total} cópias, máximo ${limit} (${limitReason(card)}).`,
      });
    }
    const rar = effectiveRarity(card);
    if ((rar === 'special' || rar === 'bonus') && !card.legendary) {
      warnings.push({
        code: 'SPECIAL_RARITY',
        cardId: card.id,
        cardName: card.name,
        message: `${card.name} tem raridade "${rar}"; tratada como limite 1 — confirme com a organização.`,
      });
    }
  }

  if (main < TOICINHO.deckMin) {
    violations.push({
      code: 'DECK_TOO_SMALL',
      message: `Deck com ${main} cartas no main; mínimo ${TOICINHO.deckMin}.`,
    });
  }
  if (side > TOICINHO.sideboardMax) {
    violations.push({
      code: 'SIDEBOARD_TOO_BIG',
      message: `Sideboard com ${side} cartas; máximo ${TOICINHO.sideboardMax}.`,
    });
  }

  return {
    legal: violations.length === 0,
    violations,
    warnings,
    counts: { main, side, unique: byId.size },
  };
}

function limitReason(card: IndexedCard): string {
  if (card.legendary) return 'lendária';
  const label: Record<string, string> = {
    common: 'comum', uncommon: 'incomum', rare: 'rara', mythic: 'mítica',
    special: 'especial', bonus: 'especial',
  };
  const r = effectiveRarity(card);
  return label[r] ?? r;
}
