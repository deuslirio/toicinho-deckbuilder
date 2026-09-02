import { useEffect, useMemo, useRef, useState } from 'react';
import type { IndexedCard } from '../lib/types';
import { queryCards, loadCardIndex } from '../data/cards';
import { isBanned, copyLimit, effectiveRarity } from '../formats/toicinho';

type Index = Awaited<ReturnType<typeof loadCardIndex>>;

interface Props {
  index: Index;
  onAdd: (card: IndexedCard, board: 'main' | 'side') => void;
}

export function CardSearch({ index, onAdd }: Props) {
  const [q, setQ] = useState('');
  const [lang, setLang] = useState<'pt' | 'en'>('pt');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<number>();

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDebounced(q), 150);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  const results = useMemo(
    () => queryCards(index, debounced, 80),
    [index, debounced],
  );

  return (
    <div className="search">
      <div className="search-bar">
        <input
          autoFocus
          placeholder="Buscar carta (português ou inglês)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className="lang-toggle"
          onClick={() => setLang((l) => (l === 'pt' ? 'en' : 'pt'))}
          title="Idioma exibido"
        >
          {lang === 'pt' ? 'PT' : 'EN'}
        </button>
      </div>

      <ul className="results">
        {results.map((card) => {
          const banned = isBanned(card);
          const outOfPool = !card.poolLegal;
          const limit = copyLimit(card);
          const primary = lang === 'pt' && card.namePt ? card.namePt : card.name;
          const secondary = lang === 'pt' && card.namePt ? card.name : card.namePt;
          return (
            <li key={card.id} className={banned || outOfPool ? 'result illegal' : 'result'}>
              {card.img && (
                <img src={card.img} alt="" loading="lazy" width={46} height={64} />
              )}
              <div className="result-body">
                <div className="result-name">
                  {primary}
                  {secondary && <span className="alt"> · {secondary}</span>}
                </div>
                <div className="result-meta">
                  <span className="mana">{card.manaCost}</span>
                  <span>{card.typeLine}</span>
                  <span className={`rarity r-${effectiveRarity(card)}`} title={`impressão: ${card.set.toUpperCase()}`}>
                    {effectiveRarity(card)} ({card.set.toUpperCase()})
                  </span>
                  {banned && <span className="tag banned">banida</span>}
                  {!banned && outOfPool && <span className="tag pool">fora do pool</span>}
                  {!banned && !outOfPool && (
                    <span className="tag limit">
                      máx {limit === Infinity ? '∞' : limit}
                    </span>
                  )}
                </div>
              </div>
              <div className="result-actions">
                <button type="button" disabled={banned || outOfPool} onClick={() => onAdd(card, 'main')}>
                  + Main
                </button>
                <button type="button" disabled={banned || outOfPool} onClick={() => onAdd(card, 'side')}>
                  + Side
                </button>
              </div>
            </li>
          );
        })}
        {debounced && results.length === 0 && <li className="empty">Nada encontrado.</li>}
      </ul>
    </div>
  );
}
