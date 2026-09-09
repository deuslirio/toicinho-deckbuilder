import { useEffect, useMemo, useRef, useState } from 'react';
import type { IndexedCard } from '../lib/types';
import type { loadCardIndex } from '../data/cards';
import { isBanned } from '../formats/toicinho';
import { fetchSynergy } from '../lib/edhrec';
import { useCardPreview } from './CardPreview';

type Index = Awaited<ReturnType<typeof loadCardIndex>>;
type Row = { card: IndexedCard; qty: number; board: 'main' | 'side' };

const MAX_SOURCES = 40;
const MAX_RESULTS = 30;
const isLand = (c: IndexedCard) => /\bLand\b/.test(c.typeLine) && !/\bCreature\b/.test(c.typeLine);

// ramp genérico que o EDHREC recomenda pra quase tudo (hábito de Commander) — ruído
const GENERIC_RAMP = /^(marble|sky|fire|charcoal|moss) diamond$|medallion$|^mind stone$|^fellwar stone$|^guardian idol$|^worn powerstone$|^star compass$|^prismatic lens$|^coldsteel heart$|^thought vessel$|^everflowing chalice$/i;

interface Agg {
  card: IndexedCard;
  count: number; // quantas cartas do deck recomendam
  liftSum: number;
  sources: string[];
}

export function Suggestions({
  index,
  rows,
  lang,
  onAdd,
}: {
  index: Index;
  rows: Row[];
  lang: 'pt' | 'en';
  onAdd: (card: IndexedCard) => void;
}) {
  const preview = useCardPreview();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [raw, setRaw] = useState<Agg[]>([]);
  const runId = useRef(0);

  const byName = useMemo(() => {
    const m = new Map<string, IndexedCard>();
    for (const c of index.cards) {
      m.set(nameKey(c.name), c);
      const front = c.name.split(' // ')[0];
      if (front !== c.name) m.set(nameKey(front), c);
      if (c.namePt) m.set(nameKey(c.namePt), c);
    }
    return m;
  }, [index]);

  // identidade de cor do deck (pega ability colors também — filtra bem manarocks/duais
  // de fora das cores, tipo "Rakdos Signet" num deck branco)
  const deckColors = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) for (const c of r.card.colorIdentity) s.add(c);
    return s;
  }, [rows]);

  const inDeck = useMemo(
    () => new Set(rows.map((r) => r.card.id)),
    [rows],
  );

  const sources = useMemo(() => {
    const seen = new Set<string>();
    const list: IndexedCard[] = [];
    for (const r of rows) {
      if (r.board !== 'main' || isLand(r.card) || seen.has(r.card.id)) continue;
      seen.add(r.card.id);
      list.push(r.card);
    }
    return list.slice(0, MAX_SOURCES);
  }, [rows]);

  const sourceKey = sources.map((c) => c.id).sort().join(',');

  // Busca no EDHREC + agrega (só re-roda quando as cartas-fonte mudam).
  useEffect(() => {
    if (sources.length === 0) {
      setRaw([]);
      setProgress(null);
      return;
    }
    const id = ++runId.current;
    const map = new Map<string, Agg>();
    setProgress({ done: 0, total: sources.length });

    (async () => {
      for (let i = 0; i < sources.length; i++) {
        if (runId.current !== id) return;
        const src = sources[i];
        const entries = await fetchSynergy(src.name);
        for (const e of entries) {
          const card = byName.get(nameKey(e.name));
          if (!card) continue;
          let a = map.get(card.id);
          if (!a) {
            a = { card, count: 0, liftSum: 0, sources: [] };
            map.set(card.id, a);
          }
          a.count += 1;
          a.liftSum += e.lift;
          if (a.sources.length < 4) a.sources.push(displayName(src, lang));
        }
        if (runId.current === id) setProgress({ done: i + 1, total: sources.length });
      }
      if (runId.current !== id) return;
      setRaw([...map.values()]);
      setProgress(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // Filtra/ordena — re-roda a cada mudança no deck (ex.: você adicionou uma sugestão).
  const aggs = useMemo(
    () =>
      raw
        .filter(
          (a) =>
            a.count >= 2 && // recomendada por >= 2 cartas do deck (corta o ruído de nicho)
            !inDeck.has(a.card.id) &&
            a.card.poolLegal &&
            !isBanned(a.card) &&
            !GENERIC_RAMP.test(a.card.name) &&
            a.card.colorIdentity.every((c) => deckColors.has(c)),
        )
        .sort((x, y) => y.count - x.count || y.liftSum - x.liftSum)
        .slice(0, MAX_RESULTS),
    [raw, inDeck, deckColors],
  );

  if (sources.length === 0) {
    return (
      <div className="suggest empty">
        Adicione cartas ao <strong>main</strong> pra ver sugestões de sinergia.
      </div>
    );
  }

  return (
    <div className="suggest">
      <p className="suggest-note">
        Cartas que costumam ser jogadas junto com as do seu deck (dados do EDHREC — meta de
        Commander). Já filtrado pro que é legal no Toicinho e cabe nas suas cores; cartas que
        mencionam Comandante ficam de fora.
      </p>

      {progress && (
        <p className="suggest-progress">
          Analisando {progress.done}/{progress.total} cartas…
        </p>
      )}

      {aggs.length === 0 && !progress && (
        <p className="suggest-progress">Nada de novo — o EDHREC não sugeriu nada legal fora do deck.</p>
      )}

      <div className="suggest-grid">
        {aggs.map((a) => {
          const name = displayName(a.card, lang);
          return (
            <div key={a.card.id} className="suggest-card">
              <div className="suggest-img" {...preview.bind(a.card.img, a.card.priceUsd)}>
                {a.card.img ? <img src={a.card.img} alt={name} loading="lazy" /> : <span>{name}</span>}
              </div>
              <div className="suggest-body">
                <div className="suggest-name">{name}</div>
                <div className="suggest-meta">
                  <strong>{a.count}</strong> {a.count === 1 ? 'carta recomenda' : 'cartas recomendam'}
                  {a.card.priceUsd != null && <span className="price"> · ${a.card.priceUsd.toFixed(2)}</span>}
                </div>
                <div className="suggest-src" title={a.sources.join(', ')}>
                  via {a.sources.slice(0, 2).join(', ')}
                  {a.count > 2 && ` +${a.count - 2}`}
                </div>
              </div>
              <button type="button" onClick={() => onAdd(a.card)}>
                + Main
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function displayName(c: IndexedCard, lang: 'pt' | 'en') {
  return lang === 'pt' && c.namePt ? c.namePt : c.name;
}

/** chave de lookup tolerante a aspa reta vs curva */
function nameKey(name: string) {
  return name.toLowerCase().replace(/[’]/g, "'");
}
