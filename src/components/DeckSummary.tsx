import { useMemo } from 'react';
import type { IndexedCard } from '../lib/types';
import { checkDeck, banlistMeta, TOICINHO } from '../formats/toicinho';
import { COLORS, COLOR_LABEL, countPips, type ColorKey } from '../lib/mana';

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

  // Devoção: total de símbolos de mana colorida no main (ponderado pela quantidade).
  // Serve para dimensionar quantos terrenos de cada cor o deck precisa.
  const devotion = useMemo(() => {
    const d: Record<ColorKey, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const r of rows) {
      if (r.board !== 'main' || !r.card.manaCost) continue;
      const pips = countPips(r.card.manaCost);
      for (const c of COLORS) d[c] += pips[c] * r.qty;
    }
    return d;
  }, [rows]);

  const devotionTotal = COLORS.reduce((s, c) => s + devotion[c], 0);
  const maxDevotion = Math.max(1, ...COLORS.map((c) => devotion[c]));
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

      <h3>Devoção {devotionTotal > 0 && <span className="h3-note">{devotionTotal} símbolos</span>}</h3>
      {devotionTotal === 0 ? (
        <p className="empty">sem cartas coloridas no main</p>
      ) : (
        <div className="devotion">
          {COLORS.filter((c) => devotion[c] > 0).map((c) => (
            <div key={c} className="dev-row" title={COLOR_LABEL[c]}>
              <span className={`pip p-${c}`}>{c}</span>
              <div className="dev-track">
                <div className={`dev-bar b-${c}`} style={{ width: `${(devotion[c] / maxDevotion) * 100}%` }} />
              </div>
              <span className="dev-n">
                {devotion[c]}
                <span className="dev-pct"> {Math.round((devotion[c] / devotionTotal) * 100)}%</span>
              </span>
            </div>
          ))}
        </div>
      )}

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
