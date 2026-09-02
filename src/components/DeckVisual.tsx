import { useMemo } from 'react';
import type { IndexedCard } from '../lib/types';
import { isBanned } from '../formats/toicinho';
import { useCardPreview } from './CardPreview';

type Row = { card: IndexedCard; qty: number; board: 'main' | 'side' };

const COL_W = 186;
const CARD_H = Math.round((COL_W * 680) / 488); // proporção da carta de Magic

const isLand = (c: IndexedCard) => /\bLand\b/.test(c.typeLine) && !/\bCreature\b/.test(c.typeLine);

interface Pile {
  key: string;
  label: string;
  cards: { card: IndexedCard; qty: number }[];
  count: number;
}

function pilesFor(rows: Row[], board: 'main' | 'side'): Pile[] {
  const buckets = new Map<string, { card: IndexedCard; qty: number }[]>();
  for (const r of rows) {
    if (r.board !== board || r.qty <= 0) continue;
    const key = isLand(r.card) ? 'L' : String(Math.min(7, Math.floor(r.card.cmc)));
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push({ card: r.card, qty: r.qty });
  }
  const order = ['0', '1', '2', '3', '4', '5', '6', '7', 'L'];
  const piles: Pile[] = [];
  for (const key of order) {
    const cards = buckets.get(key);
    if (!cards) continue;
    cards.sort((a, b) => a.card.name.localeCompare(b.card.name, 'en'));
    piles.push({
      key,
      label: key === 'L' ? 'Terrenos' : key === '7' ? '7+' : key,
      cards,
      count: cards.reduce((s, c) => s + c.qty, 0),
    });
  }
  return piles;
}

export function DeckVisual({ rows, lang }: { rows: Row[]; lang: 'pt' | 'en' }) {
  const main = useMemo(() => pilesFor(rows, 'main'), [rows]);
  const side = useMemo(() => pilesFor(rows, 'side'), [rows]);
  const total = main.reduce((s, p) => s + p.count, 0);

  if (total === 0) {
    return <div className="visual empty">Deck vazio — adicione cartas no Editor.</div>;
  }

  return (
    <div className="visual">
      <div className="visual-scroll">
        {main.map((p) => (
          <VisualPile key={p.key} pile={p} lang={lang} />
        ))}
      </div>
      {side.length > 0 && (
        <>
          <h3 className="visual-side-h">Sideboard</h3>
          <div className="visual-scroll">
            {side.map((p) => (
              <VisualPile key={p.key} pile={p} lang={lang} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VisualPile({ pile, lang }: { pile: Pile; lang: 'pt' | 'en' }) {
  const preview = useCardPreview();
  const flat = pile.cards.flatMap(({ card, qty }) =>
    Array.from({ length: qty }, (_, i) => ({ card, k: `${card.id}-${i}` })),
  );
  const step = flat.length > 12 ? 22 : flat.length > 8 ? 30 : 40;

  return (
    <div className="vpile" style={{ width: COL_W }}>
      <div className="vpile-head">
        <span>{pile.label}</span>
        <span className="vpile-n">{pile.count}</span>
      </div>
      <div className="vpile-stack" style={{ height: (flat.length - 1) * step + CARD_H }}>
        {flat.map(({ card, k }, i) => {
          const bad = isBanned(card) || !card.poolLegal;
          const name = lang === 'pt' && card.namePt ? card.namePt : card.name;
          return (
            <div
              key={k}
              className={`vcard${bad ? ' bad' : ''}`}
              style={{ top: i * step, zIndex: i, width: COL_W, height: CARD_H }}
              {...preview.bind(card.img)}
            >
              {card.img ? (
                <img src={card.img} alt={name} loading="lazy" draggable={false} />
              ) : (
                <span className="vcard-fallback">{name}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
