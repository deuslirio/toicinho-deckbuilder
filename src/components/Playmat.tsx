import { useCallback, useMemo, useRef, useState } from 'react';
import type { IndexedCard } from '../lib/types';
import { buildLibrary, type CardInstance } from '../lib/goldfish';

type Row = { card: IndexedCard; qty: number; board: 'main' | 'side' };
type FieldCard = CardInstance & { x: number; y: number; z: number };

const CW = 150;
const CH = Math.round((CW * 680) / 488); // 209 — proporção da carta
const OPENING = 7;

export function Playmat({ rows, lang }: { rows: Row[]; lang: 'pt' | 'en' }) {
  const [library, setLibrary] = useState<CardInstance[]>([]);
  const [hand, setHand] = useState<CardInstance[]>([]);
  const [field, setField] = useState<FieldCard[]>([]);
  const [drawn, setDrawn] = useState(0);
  const [mulligans, setMulligans] = useState(0);
  const [started, setStarted] = useState(false);
  const [zoom, setZoom] = useState(1);

  const fieldRef = useRef<HTMLDivElement>(null);
  const zRef = useRef(1);
  const nextZ = () => (zRef.current += 1);

  const clampZoom = (v: number) => Math.max(0.4, Math.min(1.8, Math.round(v * 100) / 100));

  // client px -> coordenadas "de mundo" do campo (que independem do zoom)
  const toWorld = (clientX: number, clientY: number, r: DOMRect) => ({
    x: (clientX - r.left) / zoom,
    y: (clientY - r.top) / zoom,
    w: r.width / zoom,
    h: r.height / zoom,
  });

  const deckSize = useMemo(
    () => rows.filter((r) => r.board === 'main').reduce((s, r) => s + r.qty, 0),
    [rows],
  );

  const reset = useCallback(
    (mull: number) => {
      const lib = buildLibrary(rows);
      setHand(lib.slice(0, OPENING));
      setLibrary(lib.slice(OPENING));
      setField([]);
      setDrawn(0);
      setMulligans(mull);
      setStarted(true);
    },
    [rows],
  );

  const draw = (n = 1) => {
    setLibrary((lib) => {
      const take = lib.slice(0, n);
      if (take.length) {
        setHand((h) => [...h, ...take]);
        setDrawn((d) => d + take.length);
      }
      return lib.slice(take.length);
    });
  };

  const handName = (c: IndexedCard) => (lang === 'pt' && c.namePt ? c.namePt : c.name);

  // hand -> field (ou -> topo da mão) conforme onde soltou
  const dropFromHand = (uid: string, clientX: number, clientY: number) => {
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return;
    const inField = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    if (!inField) return; // soltou fora: volta pra mão (no-op)
    setHand((h) => {
      const inst = h.find((c) => c.uid === uid);
      if (!inst) return h;
      const w = toWorld(clientX, clientY, r);
      const x = clamp(w.x - CW / 2, 0, w.w - CW);
      const y = clamp(w.y - CH / 2, 0, w.h - CH);
      setField((f) => [...f, { ...inst, x, y, z: nextZ() }]);
      return h.filter((c) => c.uid !== uid);
    });
  };

  const moveOnField = (uid: string, clientX: number, clientY: number) => {
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return;
    // soltou abaixo do campo → volta pra mão
    if (clientY > r.bottom) {
      setField((f) => {
        const inst = f.find((c) => c.uid === uid);
        if (inst) setHand((h) => [...h, { uid: inst.uid, card: inst.card }]);
        return f.filter((c) => c.uid !== uid);
      });
      return;
    }
    const w = toWorld(clientX, clientY, r);
    setField((f) =>
      f.map((c) =>
        c.uid === uid
          ? {
              ...c,
              x: clamp(w.x - CW / 2, 0, w.w - CW),
              y: clamp(w.y - CH / 2, 0, w.h - CH),
              z: nextZ(),
            }
          : c,
      ),
    );
  };

  const bottomFromHand = (uid: string) =>
    setHand((h) => {
      const inst = h.find((c) => c.uid === uid);
      if (inst) setLibrary((lib) => [...lib, inst]);
      return h.filter((c) => c.uid !== uid);
    });

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
              onDoubleClick={() =>
                setField((f) => {
                  setHand((h) => [...h, { uid: c.uid, card: c.card }]);
                  return f.filter((x) => x.uid !== c.uid);
                })
              }
            />
          ))}
          {field.length === 0 && <p className="field-hint">arraste cartas da mão pra cá</p>}
        </div>
      </div>

      <div className="hand">
        {hand.map((c) => (
          <DragCard
            key={c.uid}
            src={c.card.img}
            alt={handName(c.card)}
            label={handName(c.card)}
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
  onDragEnd,
  onDoubleClick,
}: {
  src: string | null;
  alt: string;
  label?: string;
  style?: React.CSSProperties;
  scale?: number;
  onDragEnd: (clientX: number, clientY: number) => void;
  onDoubleClick?: () => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className={`pm-card${drag ? ' dragging' : ''}`}
      style={{
        width: CW,
        height: CH,
        ...style,
        // o elemento está dentro de um container com scale(scale); dividir mantém
        // o card colado no cursor durante o arraste
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
