import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCardIndex } from './data/cards';
import type { IndexedCard } from './lib/types';
import { useDeck, readDeckFromUrl, copyText, encodeDeck } from './store/deck';
import { parseDeckText, deckToText } from './lib/decktext';
import { CardSearch } from './components/CardSearch';
import { DeckColumn } from './components/DeckColumn';
import { DeckSummary } from './components/DeckSummary';
import { CardPreviewProvider } from './components/CardPreview';
import { Playmat } from './components/Playmat';
import { DeckVisual } from './components/DeckVisual';
import './index.css';

type Index = Awaited<ReturnType<typeof loadCardIndex>>;

export default function App() {
  const [index, setIndex] = useState<Index | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Idioma de exibição — padrão inglês. A busca aceita PT e EN independente disso.
  const [lang, setLang] = useState<'pt' | 'en'>('en');
  const toggleLang = () => setLang((l) => (l === 'pt' ? 'en' : 'pt'));
  const [showText, setShowText] = useState(false);
  const [view, setViewState] = useState<'editor' | 'visual' | 'mesa'>(() => {
    const fromUrl = window.location.hash.match(/[#&]v=(editor|visual|mesa)/)?.[1];
    if (fromUrl) return fromUrl as 'editor' | 'visual' | 'mesa';
    try {
      const v = localStorage.getItem('toicinho-view');
      return v === 'visual' || v === 'mesa' ? v : 'editor';
    } catch {
      return 'editor';
    }
  });
  const setView = (v: 'editor' | 'visual' | 'mesa') => {
    setViewState(v);
    try {
      localStorage.setItem('toicinho-view', v);
    } catch {
      /* ignore */
    }
  };
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  const { deck, add, setQty, move, setName, clear, replace } = useDeck();

  useEffect(() => {
    loadCardIndex().then(setIndex).catch((e) => setError(String(e.message ?? e)));
  }, []);

  // deck compartilhado por URL tem prioridade no primeiro load
  const hydrated = useRef(false);
  useEffect(() => {
    const shared = readDeckFromUrl();
    if (shared) replace(shared);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mantém a URL (#d=deck&v=aba) sempre em dia, sem poluir o histórico
  useEffect(() => {
    if (!hydrated.current) return;
    const t = window.setTimeout(() => {
      const parts: string[] = [];
      if (deck.main.length || deck.side.length) parts.push(`d=${encodeDeck(deck)}`);
      if (view !== 'editor') parts.push(`v=${view}`);
      const next = parts.length ? `#${parts.join('&')}` : window.location.pathname;
      history.replaceState(null, '', next);
    }, 200);
    return () => window.clearTimeout(t);
  }, [deck, view]);

  const rows = useMemo(() => {
    if (!index) return [];
    const build = (list: { id: string; qty: number }[], board: 'main' | 'side') =>
      list
        .map((e) => {
          const card = index.byId.get(e.id);
          return card ? { card, qty: e.qty, board } : null;
        })
        .filter(Boolean) as { card: IndexedCard; qty: number; board: 'main' | 'side' }[];
    return [...build(deck.main, 'main'), ...build(deck.side, 'side')];
  }, [index, deck]);

  const mainRows = rows.filter((r) => r.board === 'main').sort(sortRows);
  const sideRows = rows.filter((r) => r.board === 'side').sort(sortRows);

  if (error) return <div className="fatal">Erro: {error}</div>;
  if (!index) return <div className="loading">Carregando índice de cartas…</div>;

  return (
    <CardPreviewProvider>
    <div className="app">
      <header>
        <h1>Toicinho Deckbuilder</h1>
        <input
          className="deck-name"
          value={deck.name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="header-actions">
          <div className="view-switch">
            {(['editor', 'visual', 'mesa'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? 'on' : ''}
                onClick={() => setView(v)}
              >
                {v === 'editor' ? 'Editor' : v === 'visual' ? 'Visual' : 'Mesa'}
              </button>
            ))}
          </div>
          <button type="button" onClick={toggleLang}>
            Idioma: {lang.toUpperCase()}
          </button>
          <button type="button" onClick={() => setShowText((v) => !v)}>
            Importar/Exportar
          </button>
          <button
            type="button"
            onClick={async () => {
              showToast(
                (await copyText(window.location.href)) ? 'Link copiado' : 'Link na barra de endereço',
              );
            }}
          >
            Copiar link
          </button>
          <button type="button" className="danger" onClick={clear}>
            Limpar
          </button>
        </div>
      </header>

      {showText && (
        <TextIO
          index={index}
          onImport={(text) => {
            const { deck: d, unresolved } = parseDeckText(text, index.cards);
            replace({ ...d, name: deck.name });
            if (unresolved.length) alert(`Não reconhecidas:\n${unresolved.join('\n')}`);
            setShowText(false);
          }}
          exportText={deckToText(deck, index.byId, lang)}
        />
      )}

      {view === 'mesa' ? (
        <Playmat rows={rows} lang={lang} />
      ) : view === 'visual' ? (
        <DeckVisual rows={rows} lang={lang} />
      ) : (
        <main>
          <CardSearch
            index={index}
            lang={lang}
            onToggleLang={toggleLang}
            onAdd={(card, board) => add(card.id, board)}
          />

          <div className="deck">
            <DeckColumn
              title="Main"
              board="main"
              rows={mainRows}
              total={mainRows.reduce((a, r) => a + r.qty, 0)}
              lang={lang}
              onQty={setQty}
              onMove={move}
            />
            <DeckColumn
              title="Sideboard"
              board="side"
              rows={sideRows}
              total={sideRows.reduce((a, r) => a + r.qty, 0)}
              lang={lang}
              onQty={setQty}
              onMove={move}
            />
          </div>

          <DeckSummary rows={rows} />
        </main>
      )}

      <footer>
        Índice gerado em {index.meta.generatedAt} · {index.meta.count} cartas · dados do{' '}
        <a href="https://scryfall.com" target="_blank" rel="noreferrer">
          Scryfall
        </a>
        . Formato Toicinho da{' '}
        <a href="https://www.baconarcano.com" target="_blank" rel="noreferrer">
          Bacon Arcano
        </a>
        .
      </footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
    </CardPreviewProvider>
  );
}

function sortRows(
  a: { card: IndexedCard; qty: number },
  b: { card: IndexedCard; qty: number },
) {
  return a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name, 'en');
}

function TextIO({
  index,
  onImport,
  exportText,
}: {
  index: Index;
  onImport: (text: string) => void;
  exportText: string;
}) {
  const [text, setText] = useState(exportText);
  useEffect(() => setText(exportText), [exportText]);
  void index;
  return (
    <div className="textio">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        spellCheck={false}
        placeholder={'3 Lightning Bolt\n1 Raio\n\nSideboard\n2 Pyroblast'}
      />
      <div>
        <button type="button" onClick={() => onImport(text)}>
          Importar este texto
        </button>
      </div>
    </div>
  );
}
