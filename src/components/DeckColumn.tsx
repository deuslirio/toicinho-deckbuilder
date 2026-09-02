import type { IndexedCard, Board } from '../lib/types';
import { copyLimit, isBanned } from '../formats/toicinho';

interface Row {
  card: IndexedCard;
  qty: number;
}

interface Props {
  title: string;
  board: Board;
  rows: Row[];
  total: number;
  lang: 'pt' | 'en';
  onQty: (id: string, board: Board, qty: number) => void;
  onMove: (id: string, from: Board, to: Board) => void;
}

export function DeckColumn({ title, board, rows, total, lang, onQty, onMove }: Props) {
  const other: Board = board === 'main' ? 'side' : 'main';
  return (
    <section className="deck-col">
      <h2>
        {title} <span className="count">{total}</span>
      </h2>
      <ul>
        {rows.map(({ card, qty }) => {
          const limit = copyLimit(card);
          const over = qty > limit;
          const name = lang === 'pt' && card.namePt ? card.namePt : card.name;
          return (
            <li key={card.id} className={over || isBanned(card) || !card.poolLegal ? 'row bad' : 'row'}>
              <input
                type="number"
                min={0}
                value={qty}
                onChange={(e) => onQty(card.id, board, Math.max(0, Number(e.target.value)))}
              />
              <span className="row-name">{name}</span>
              <span className="row-meta">{card.manaCost}</span>
              <button type="button" title={`Mover para ${other}`} onClick={() => onMove(card.id, board, other)}>
                ⇄
              </button>
              <button type="button" title="Remover" onClick={() => onQty(card.id, board, 0)}>
                ×
              </button>
            </li>
          );
        })}
        {rows.length === 0 && <li className="empty">vazio</li>}
      </ul>
    </section>
  );
}
