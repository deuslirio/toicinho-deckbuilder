import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { normalUrl } from '../lib/img';

interface PreviewState {
  url: string;
  price: number | null;
  x: number;
  y: number;
}

interface PreviewApi {
  bind: (small: string | null, price?: number | null) => {
    onMouseEnter: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
  };
}

const noop = () => ({ onMouseEnter() {}, onMouseMove() {}, onMouseLeave() {} });
const Ctx = createContext<PreviewApi>({ bind: noop });

export const useCardPreview = () => useContext(Ctx);

const W = 244;
const H = 340;

export function CardPreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PreviewState | null>(null);
  const urlRef = useRef<string | null>(null);
  const priceRef = useRef<number | null>(null);

  const place = useCallback((e: React.MouseEvent) => {
    const pad = 16;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    if (x + W + pad > window.innerWidth) x = e.clientX - W - pad;
    if (y + H + pad > window.innerHeight) y = window.innerHeight - H - pad;
    if (y < pad) y = pad;
    setState((s) => (urlRef.current ? { url: urlRef.current, price: priceRef.current, x, y } : s));
  }, []);

  const bind = useCallback(
    (small: string | null, price: number | null = null) => ({
      onMouseEnter: (e: React.MouseEvent) => {
        urlRef.current = normalUrl(small);
        priceRef.current = price;
        if (urlRef.current) place(e);
      },
      onMouseMove: place,
      onMouseLeave: () => {
        urlRef.current = null;
        priceRef.current = null;
        setState(null);
      },
    }),
    [place],
  );

  return (
    <Ctx.Provider value={{ bind }}>
      {children}
      {state && (
        <div className="card-preview" style={{ left: state.x, top: state.y, width: W }}>
          <img src={state.url} alt="" />
          {state.price != null && <span className="card-preview-price">${state.price.toFixed(2)}</span>}
        </div>
      )}
    </Ctx.Provider>
  );
}
