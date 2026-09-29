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

/**
 * Gestão de foco dos diálogos (gaveta e modal):
 *  - o foco vai para o 1.º campo do corpo SÓ quando o diálogo abre (antes, cada tecla re-disparava o efeito e o foco
 *    saltava para o botão «Fechar» — só se conseguia escrever uma letra);
 *  - Tab/Shift+Tab ficam dentro do diálogo; Esc fecha; ao fechar, o foco volta ao elemento que o abriu.
 */
function useDialogo(aberta: boolean, fechar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  useEffect(() => {
    if (!aberta) return;
    const anterior = document.activeElement as HTMLElement | null;
    const focaveis = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? []);
    const primeiro = ref.current?.querySelector<HTMLElement>('.corpo input:not([disabled]), .corpo select:not([disabled]), .corpo textarea:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    (primeiro ?? focaveis()[0])?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); fecharRef.current(); return; }
      if (e.key !== 'Tab') return;
      const f = focaveis(); if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); anterior?.focus?.(); };
  }, [aberta]);
  return ref;
}

export function Gaveta({ titulo, aberta, fechar, children, rodape }: { titulo: string; aberta: boolean; fechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  const ref = useDialogo(aberta, fechar);
  if (!aberta) return null;
  return (
    <div className="gaveta-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="gaveta" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <header><h2 style={{ flex: 1 }}>{titulo}</h2><button type="button" className="btn icone fantasma" onClick={fechar} aria-label="Fechar"><Icone n="x" /></button></header>
        <div className="corpo">{children}</div>
        {rodape && <footer>{rodape}</footer>}
      </div>
    </div>
  );
}

export function Modal({ titulo, aberta, fechar, children, rodape }: { titulo: string; aberta: boolean; fechar: () => void; children: ReactNode; rodape: ReactNode }) {
  const ref = useDialogo(aberta, fechar);
  if (!aberta) return null;
  return (
    <div className="modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <h2>{titulo}</h2><div className="corpo" style={{ display: 'contents' }}>{children}</div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{rodape}</div>
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
