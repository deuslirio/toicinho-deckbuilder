import { useCallback, useMemo, useRef, useState } from 'react';
import type { IndexedCard } from '../lib/types';
import { buildLibrary, type CardInstance } from '../lib/goldfish';

type Row = { card: IndexedCard; qty: number; board: 'main' | 'side' };
type FieldCard = CardInstance & { x: number; y: number; z: number };

interface Game {
  library: CardInstance[];
  hand: CardInstance[];
  field: FieldCard[];
  drawn: number;
  mulligans: number;
}
const EMPTY: Game = { library: [], hand: [], field: [], drawn: 0, mulligans: 0 };

const CW = 150;
const CH = Math.round((CW * 680) / 488); // proporção da carta de Magic
const HAND_MULT = 1.2; // a mão começa um pouco maior que o campo
const OPENING = 7;

export function Playmat({ rows, lang }: { rows: Row[]; lang: 'pt' | 'en' }) {
  // library/hand/field/... num único estado -> todas as mutações são updaters puros
  // (evita cartas duplicadas com o double-invoke do StrictMode)
  const [game, setGame] = useState<Game>(EMPTY);
  const [started, setStarted] = useState(false);
  const [zoom, setZoom] = useState(1);

  const fieldRef = useRef<HTMLDivElement>(null);
  const zRef = useRef(1);
  const nextZ = () => (zRef.current += 1);

  const clampZoom = (v: number) => Math.max(0.4, Math.min(1.8, Math.round(v * 100) / 100));

  // client px -> coordenadas "de mundo" do campo (independem do zoom)
  const worldPos = (clientX: number, clientY: number, r: DOMRect) => {
    const w = r.width / zoom;
    const h = r.height / zoom;
    return {
      x: clamp((clientX - r.left) / zoom - CW / 2, 0, w - CW),
      y: clamp((clientY - r.top) / zoom - CH / 2, 0, h - CH),
    };
  };

  const deckSize = useMemo(
    () => rows.filter((r) => r.board === 'main').reduce((s, r) => s + r.qty, 0),
    [rows],
  );

  const reset = useCallback(
    (mull: number) => {
      const lib = buildLibrary(rows);
      setGame({
        library: lib.slice(OPENING),
        hand: lib.slice(0, OPENING),
        field: [],
        drawn: 0,
        mulligans: mull,
      });
      setStarted(true);
    },
    [rows],
  );

  const draw = (n = 1) =>
    setGame((g) => {
      const take = g.library.slice(0, n);
      if (!take.length) return g;
      return {
        ...g,
        library: g.library.slice(take.length),
        hand: [...g.hand, ...take],
        drawn: g.drawn + take.length,
      };
    });

  const bottomFromHand = (uid: string) =>
    setGame((g) => {
      const inst = g.hand.find((c) => c.uid === uid);
      if (!inst) return g;
      return { ...g, hand: g.hand.filter((c) => c.uid !== uid), library: [...g.library, inst] };
    });

  const fieldToHand = (uid: string) =>
    setGame((g) => {
      const inst = g.field.find((c) => c.uid === uid);
      if (!inst) return g;
      return {
        ...g,
        field: g.field.filter((c) => c.uid !== uid),
        hand: [...g.hand, { uid: inst.uid, card: inst.card }],
      };
    });

  const dropFromHand = (uid: string, clientX: number, clientY: number) => {
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return;
    const inField =
      clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    if (!inField) return; // soltou fora: volta pra mão (no-op)
    const { x, y } = worldPos(clientX, clientY, r);
    const z = nextZ();
    setGame((g) => {
      const inst = g.hand.find((c) => c.uid === uid);
      if (!inst) return g;
      return {
        ...g,
        hand: g.hand.filter((c) => c.uid !== uid),
        field: [...g.field, { ...inst, x, y, z }],
      };
    });
  };

  const moveOnField = (uid: string, clientX: number, clientY: number) => {
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return;
    if (clientY > r.bottom) {
      fieldToHand(uid);
      return;
    }
    const { x, y } = worldPos(clientX, clientY, r);
    const z = nextZ();
    setGame((g) => ({
      ...g,
      field: g.field.map((c) => (c.uid === uid ? { ...c, x, y, z } : c)),
    }));
  };

  const handName = (c: IndexedCard) => (lang === 'pt' && c.namePt ? c.namePt : c.name);

  if (!started) {
    return (
      <div className="playmat empty-mat">
        <p>Embaralha o main ({deckSize} cartas) e compra uma mão de {OPENING}.</p>
        <button type="button" className="big" onClick={() => reset(0)} disabled={deckSize < OPENING}>
          {deckSize < OPENING ? 'Deck pequeno demais' : 'Comprar mão inicial'}
        </button>
      </div>
    );
  }

  const { library, hand, field, drawn, mulligans } = game;
  const mullTarget = OPENING - mulligans;

  return (
    <div className="playmat">
      <div className="playmat-bar">
        <button type="button" onClick={() => reset(0)}>Nova mão</button>
        <button type="button" onClick={() => reset(mulligans + 1)} disabled={mulligans >= OPENING - 1}>
          Mulligan
        </button>
        <button type="button" onClick={() => draw(1)} disabled={library.length === 0}>
          Comprar
        </button>
        <span className="pm-info">
          Grimório <strong>{library.length}</strong> · compras <strong>{drawn}</strong>
          {mulligans > 0 && (
            <>
              {' '}· mulligan <strong>{mulligans}</strong>
              {hand.length > mullTarget && (
                <span className="hint"> — devolva {hand.length - mullTarget} ao fundo</span>
              )}
            </>
          )}
        </span>
        <span className="zoom-ctl">
          <button type="button" onClick={() => setZoom((z) => clampZoom(z - 0.15))} title="Menos zoom">−</button>
          <button type="button" onClick={() => setZoom(1)} title="100%">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom((z) => clampZoom(z + 0.15))} title="Mais zoom">+</button>
        </span>
      </div>

      <div className="field" ref={fieldRef}>
        <div className="field-inner" style={{ '--z': zoom } as React.CSSProperties}>
          <button
            type="button"
            className="deck-pile"
            onClick={() => draw(1)}
            title="Comprar carta"
            disabled={library.length === 0}
          >
            <span className="deck-count">{library.length}</span>
            <span className="deck-label">grimório</span>
          </button>
          {field.map((c) => (
            <DragCard
              key={c.uid}
              src={c.card.img}
              alt={c.card.name}
              scale={zoom}
              style={{ left: c.x, top: c.y, zIndex: c.z, position: 'absolute' }}
              onDragEnd={(x, y) => moveOnField(c.uid, x, y)}
              onDoubleClick={() => fieldToHand(c.uid)}
            />
          ))}
          {field.length === 0 && <p className="field-hint">arraste cartas da mão pra cá</p>}
        </div>
      </div>

      <div className="hand" style={{ height: CH * HAND_MULT * zoom + 22 }}>
        {hand.map((c) => (
          <DragCard
            key={c.uid}
            src={c.card.img}
            alt={handName(c.card)}
            label={handName(c.card)}
            w={CW * HAND_MULT * zoom}
            h={CH * HAND_MULT * zoom}
            onDragEnd={(x, y) => dropFromHand(c.uid, x, y)}
            onDoubleClick={() => bottomFromHand(c.uid)}
          />
        ))}
        {hand.length === 0 && <p className="field-hint">mão vazia</p>}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function DragCard({
  src,
  alt,
  label,
  style,
  scale = 1,
  w = CW,
  h = CH,
  onDragEnd,
  onDoubleClick,
}: {
  src: string | null;
  alt: string;
  label?: string;
  style?: React.CSSProperties;
  scale?: number;
  w?: number;
  h?: number;
  onDragEnd: (clientX: number, clientY: number) => void;
  onDoubleClick?: () => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className={`pm-card${drag ? ' dragging' : ''}`}
      style={{
        width: w,
        height: h,
        ...style,
        // o elemento pode estar dentro de um container com scale(scale); dividir
        // mantém o card colado no cursor durante o arraste
        transform: drag ? `translate(${drag.dx / scale}px, ${drag.dy / scale}px)` : undefined,
      }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        setDrag({ dx: 0, dy: 0 });
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y });
      }}
      onPointerUp={(e) => {
        if (start.current) {
          const moved =
            Math.abs(e.clientX - start.current.x) + Math.abs(e.clientY - start.current.y);
          if (moved > 4) onDragEnd(e.clientX, e.clientY);
        }
        start.current = null;
        setDrag(null);
      }}
      onDoubleClick={onDoubleClick}
    >
      {src ? <img src={src} alt={alt} draggable={false} /> : <span className="pm-fallback">{alt}</span>}
      {label && <span className="pm-label">{label}</span>}
    </div>
  );
}
