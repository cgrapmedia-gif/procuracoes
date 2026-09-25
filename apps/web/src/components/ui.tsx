'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { ESTADOS, Estado } from '@/lib/tipos';
import { Icone } from './Icone';

export function EstadoBadge({ e }: { e: Estado }) { return <span className={`estado ${e}`}>{ESTADOS[e]}</span>; }
export function Giro({ rotulo = 'A carregar' }: { rotulo?: string }) { return <span className="giro" role="status" aria-label={rotulo} />; }

export function Campo({ rotulo, obrigatorio, ajuda, erro, children, opcional }: { rotulo: string; obrigatorio?: boolean; opcional?: boolean; ajuda?: ReactNode; erro?: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{rotulo}{obrigatorio && <span className="obrig"> *</span>}{opcional && <span className="muted" style={{ fontWeight: 400 }}> (opcional)</span>}</span>
      {children}
      {erro ? <span className="erro" role="alert"><Icone n="alerta" t={13} />{erro}</span> : ajuda ? <span className="ajuda">{ajuda}</span> : null}
    </label>
  );
}

export function Gaveta({ titulo, aberta, fechar, children, rodape }: { titulo: string; aberta: boolean; fechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberta) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [aberta, fechar]);
  if (!aberta) return null;
  return (
    <div className="gaveta-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="gaveta" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <header><h2 style={{ flex: 1 }}>{titulo}</h2><button className="btn icone fantasma" onClick={fechar} aria-label="Fechar"><Icone n="x" /></button></header>
        <div className="corpo">{children}</div>
        {rodape && <footer>{rodape}</footer>}
      </div>
    </div>
  );
}

export function Modal({ titulo, aberta, fechar, children, rodape }: { titulo: string; aberta: boolean; fechar: () => void; children: ReactNode; rodape: ReactNode }) {
  useEffect(() => {
    if (!aberta) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [aberta, fechar]);
  if (!aberta) return null;
  return (
    <div className="modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>{children}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{rodape}</div>
      </div>
    </div>
  );
}

type Toast = { id: number; msg: string; erro?: boolean };
const ToastCtx = createContext<(msg: string, erro?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast[]>([]);
  const mostrar = useCallback((msg: string, erro?: boolean) => {
    const id = Date.now() + Math.random();
    setT((x) => [...x, { id, msg, erro }]);
    setTimeout(() => setT((x) => x.filter((y) => y.id !== id)), erro ? 7000 : 3500);
  }, []);
  return <ToastCtx.Provider value={mostrar}>{children}<div className="toasts" aria-live="polite">{t.map((x) => <div key={x.id} className={`toast${x.erro ? ' erro' : ''}`}>{x.msg}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);
export const mensagemErro = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.erros].join(' — ') : e instanceof Error ? e.message : 'Erro inesperado');

export function Vazio({ children }: { children: ReactNode }) { return <div className="vazio">{children}</div>; }
