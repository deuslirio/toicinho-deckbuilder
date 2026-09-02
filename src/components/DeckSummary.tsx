import { useMemo } from 'react';
import type { IndexedCard } from '../lib/types';
import { checkDeck, banlistMeta, TOICINHO } from '../formats/toicinho';

interface Row {
  card: IndexedCard;
  qty: number;
  board: 'main' | 'side';
}

export function DeckSummary({ rows }: { rows: Row[] }) {
  const report = useMemo(
    () => checkDeck(rows.map((r) => ({ card: r.card, qty: r.qty, board: r.board }))),
    [rows],
  );

  const curve = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0, 0, 0]; // 0,1,2,3,4,5,6+
    for (const r of rows) {
      if (r.board !== 'main') continue;
      if (/\bLand\b/.test(r.card.typeLine)) continue;
      const i = Math.min(6, Math.floor(r.card.cmc));
      buckets[i] += r.qty;
    }
    return buckets;
  }, [rows]);

  const colorPips = useMemo(() => {
    const c: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const r of rows) {
      if (r.board !== 'main') continue;
      for (const col of r.card.colors) if (col in c) c[col] += r.qty;
    }
    return c;
  }, [rows]);

  const maxCurve = Math.max(1, ...curve);

  return (
    <aside className="summary">
      <div className={report.legal ? 'legal-badge ok' : 'legal-badge no'}>
        {report.legal ? '✓ Deck legal no Toicinho' : `✗ ${report.violations.length} problema(s)`}
      </div>

      <div className="stat-line">
        <strong>{report.counts.main}</strong> main · <strong>{report.counts.side}</strong> side ·{' '}
        <strong>{report.counts.unique}</strong> únicas
        {report.counts.main < TOICINHO.deckMin && (
          <span className="hint"> (mín. {TOICINHO.deckMin})</span>
        )}
      </div>

      <h3>Curva de mana</h3>
      <div className="curve">
        {curve.map((n, i) => (
          <div key={i} className="curve-col">
            <div className="bar" style={{ height: `${(n / maxCurve) * 100}%` }} />
            <span className="curve-n">{n}</span>
            <span className="curve-l">{i === 6 ? '6+' : i}</span>
          </div>
        ))}
      </div>

      <h3>Cores</h3>
      <div className="pips">
        {Object.entries(colorPips).map(([c, n]) => (
          <span key={c} className={`pip p-${c}`}>
            {c} {n}
          </span>
        ))}
      </div>

      {report.violations.length > 0 && (
        <>
          <h3>Ilegalidades</h3>
          <ul className="violations">
            {report.violations.map((v, i) => (
              <li key={i}>{v.message}</li>
            ))}
          </ul>
        </>
      )}
      {report.warnings.length > 0 && (
        <>
          <h3>Avisos</h3>
          <ul className="warnings">
            {report.warnings.map((v, i) => (
              <li key={i}>{v.message}</li>
            ))}
          </ul>
        </>
      )}

      <p className="banlist-meta">
        Banlist: {banlistMeta.count} cartas · atualizada em {banlistMeta.generatedAt} ·{' '}
        <a href={banlistMeta.source} target="_blank" rel="noreferrer">
          fonte
        </a>
      </p>
    </aside>
  );
}
