export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';

/** Uma carta única (por oracle_id) do índice gerado em scripts/build-card-index.mjs. */
export interface IndexedCard {
  id: string;
  name: string;
  namePt: string | null;
  set: string;
  released: string;
  rarity: Rarity;
  cmc: number;
  manaCost: string;
  typeLine: string;
  colors: string[];
  colorIdentity: string[];
  legendary: boolean;
  /** URL da imagem "small" do Scryfall; troque /small/ por /normal/ para a grande. */
  img: string | null;
  /** true se está no pool do Toicinho (4ª Edição+, sem menção a Commander/Draft). */
  poolLegal: boolean;
}

export interface CardIndexFile {
  generatedAt: string;
  scryfallBulk: string;
  count: number;
  cards: IndexedCard[];
}

export type Board = 'main' | 'side';

export interface DeckEntry {
  id: string;
  qty: number;
}

export interface Deck {
  name: string;
  main: DeckEntry[];
  side: DeckEntry[];
}

export interface BanlistFile {
  format: string;
  source: string;
  generatedAt: string;
  count: number;
  banned: { name: string; color: string; oracleId: string }[];
}
