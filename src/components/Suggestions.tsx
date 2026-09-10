import { useEffect, useMemo, useRef, useState } from 'react';
import type { IndexedCard } from '../lib/types';
import type { loadCardIndex } from '../data/cards';
import { isBanned } from '../formats/toicinho';
import { fetchSynergy, fetchCombos, type Combo } from '../lib/edhrec';
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
  maxLift: number; // maior lift entre as recomendações (sinergia de pico)
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
  const [rawCombos, setRawCombos] = useState<Combo[]>([]);
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
      setRawCombos([]);
      setProgress(null);
      return;
    }
    const id = ++runId.current;
    const map = new Map<string, Agg>();
    const comboMap = new Map<string, Combo>();
    setProgress({ done: 0, total: sources.length });

    (async () => {
      for (let i = 0; i < sources.length; i++) {
        if (runId.current !== id) return;
        const src = sources[i];
        const [entries, combos] = await Promise.all([
          fetchSynergy(src.name),
          fetchCombos(src.name),
        ]);
        for (const e of entries) {
          const card = byName.get(nameKey(e.name));
          if (!card) continue;
          let a = map.get(card.id);
          if (!a) {
            a = { card, count: 0, liftSum: 0, maxLift: 0, sources: [] };
            map.set(card.id, a);
          }
          a.count += 1;
          a.liftSum += e.lift;
          a.maxLift = Math.max(a.maxLift, e.lift);
          if (a.sources.length < 4) a.sources.push(displayName(src, lang));
        }
        for (const c of combos) {
          const key = c.cards.map(nameKey).sort().join('|');
          if (!comboMap.has(key)) comboMap.set(key, c);
        }
        if (runId.current === id) setProgress({ done: i + 1, total: sources.length });
      }
      if (runId.current !== id) return;
      setRaw([...map.values()]);
      setRawCombos([...comboMap.values()]);
      setProgress(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // Filtra/ordena — re-roda a cada mudança no deck (ex.: você adicionou uma sugestão).
  const aggs = useMemo(() => {
    // "abrangência" (nº de cartas que recomendam) + bônus por sinergia de pico alta
    // (High Lift Cards do EDHREC) — assim um combo/sinergia forte de uma carta só sobe.
    const score = (a: Agg) => a.count + (a.maxLift >= 10 ? 1 : 0) + (a.maxLift >= 25 ? 1 : 0);
    return raw
      .filter(
        (a) =>
          (a.count >= 2 || a.maxLift >= 10) && // 2+ recomendações OU uma sinergia forte
          !inDeck.has(a.card.id) &&
          a.card.poolLegal &&
          !isBanned(a.card) &&
          !GENERIC_RAMP.test(a.card.name) &&
          a.card.colorIdentity.every((c) => deckColors.has(c)),
      )
      .sort((x, y) => score(y) - score(x) || y.liftSum - x.liftSum)
      .slice(0, MAX_RESULTS);
  }, [raw, inDeck, deckColors]);

  // Combos: quais você já tem completos e quais estão a 1–2 cartas de fechar.
  const combos = useMemo(() => {
    const legal = (c: IndexedCard) =>
      c.poolLegal && !isBanned(c) && c.colorIdentity.every((x) => deckColors.has(x));
    const out: {
      key: string;
      have: IndexedCard[];
      missing: IndexedCard[];
      decks: number;
    }[] = [];
    for (const combo of rawCombos) {
      const resolved = combo.cards.map((n) => byName.get(nameKey(n)));
      if (resolved.some((c) => !c)) continue; // alguma peça fora do nosso índice
      const cards = resolved as IndexedCard[];
      const have = cards.filter((c) => inDeck.has(c.id));
      const missing = cards.filter((c) => !inDeck.has(c.id));
      if (have.length === 0 || missing.length > 2) continue;
      if (missing.some((c) => !legal(c))) continue;
      out.push({
        key: combo.cards.map(nameKey).sort().join('|'),
        have,
        missing,
        decks: combo.decks,
      });
    }
    return out
      .sort((a, b) => a.missing.length - b.missing.length || b.decks - a.decks)
      .slice(0, 12);
  }, [rawCombos, inDeck, deckColors, byName]);

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
        Combos que você está perto de fechar e cartas que costumam ser jogadas junto com as do
        seu deck (dados do EDHREC — meta de Commander). Filtrado pro que é legal no Toicinho e
        cabe nas suas cores; cartas que mencionam Comandante ficam de fora.
      </p>

      {progress && (
        <p className="suggest-progress">
          Analisando {progress.done}/{progress.total} cartas…
        </p>
      )}

      {aggs.length === 0 && combos.length === 0 && !progress && (
        <p className="suggest-progress">Nada de novo — o EDHREC não sugeriu nada legal fora do deck.</p>
      )}

      {combos.length > 0 && (
        <>
          <h3 className="suggest-h">Combos</h3>
          <ul className="combo-list">
            {combos.map((c) => (
              <li key={c.key} className={c.missing.length === 0 ? 'combo done' : 'combo'}>
                <span className="combo-cards">
                  {c.have.map((card) => (
                    <span key={card.id} className="chip have" {...preview.bind(card.img, card.priceUsd)}>
                      {displayName(card, lang)}
                    </span>
                  ))}
                  {c.missing.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className="chip miss"
                      title={`Adicionar ${card.name}${card.priceUsd != null ? ` — $${card.priceUsd.toFixed(2)}` : ''}`}
                      {...preview.bind(card.img, card.priceUsd)}
                      onClick={() => onAdd(card)}
                    >
                      + {displayName(card, lang)}
                    </button>
                  ))}
                </span>
                <span className="combo-status">
                  {c.missing.length === 0
                    ? 'você já tem'
                    : `falta ${c.missing.length}`}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="suggest-h">Sinergia</h3>
        </>
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
                <div className="suggest-name">
                  {name}
                  {a.maxLift >= 15 && <span className="hi-syn" title={`lift ${a.maxLift.toFixed(0)}`}> ★</span>}
                </div>
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
