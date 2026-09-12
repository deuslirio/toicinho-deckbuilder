import { useEffect, useState } from 'react';
import type { IndexedCard, Board } from '../lib/types';
import { copyLimit, isBanned } from '../formats/toicinho';
import { useCardPreview } from './CardPreview';

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
  const preview = useCardPreview();
  const priced = rows.reduce((s, r) => s + (r.card.priceUsd ?? 0) * r.qty, 0);
  return (
    <section className="deck-col">
      <h2>
        {title} <span className="count">{total}{priced > 0 && ` · $${priced.toFixed(2)}`}</span>
      </h2>
      <ul>
        {rows.map(({ card, qty }) => {
          const limit = copyLimit(card);
          const over = qty > limit;
          const name = lang === 'pt' && card.namePt ? card.namePt : card.name;
          return (
            <li key={card.id} className={over || isBanned(card) || !card.poolLegal ? 'row bad' : 'row'}>
              <QtyInput qty={qty} onCommit={(n) => onQty(card.id, board, n)} />
              {card.img && (
                <img className="row-thumb" src={card.img} alt="" loading="lazy" width={24} height={33} />
              )}
              <span className="row-name" {...preview.bind(card.img, card.priceUsd)}>
                {card.legendary && (
                  <span className="legendary-mark" title="Lendária">
                    ★
                  </span>
                )}
                {name}
              </span>
              <span className="row-meta">{card.manaCost}</span>
              {card.priceUsd != null && (
                <span className="row-price" title={`$${card.priceUsd.toFixed(2)} / un.`}>
                  ${(card.priceUsd * qty).toFixed(2)}
                </span>
              )}
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

/**
 * Campo de quantidade com estado local próprio: digitar não aplica nada
 * direto no deck a cada tecla (senão, no celular, apagar pra trocar o
 * número passa por "vazio" → vira 0 → a carta some no meio da digitação).
 * Só confirma no blur ou Enter.
 */
function QtyInput({ qty, onCommit }: { qty: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(qty));
  useEffect(() => setText(String(qty)), [qty]);

  const commit = () => {
    const n = Math.max(0, Math.floor(Number(text)) || 0);
    setText(String(n));
    if (n !== qty) onCommit(n);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
