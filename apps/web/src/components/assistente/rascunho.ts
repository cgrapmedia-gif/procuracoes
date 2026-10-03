'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PoderSeleccionado, VersaoPoder } from '@proc/core/browser';
import { ApiError, api } from '@/lib/api';
import { uid } from '@/lib/formato';
import { DetalheProcuracao, FormaActuacao, ItemRascunho, Parte, PoderCatalogo } from '@/lib/tipos';

export interface Rascunho {
  dataActo: string; local: string; oficianteId: string | null; formaActuacao: FormaActuacao; formaActuacaoPersonalizada: string | null; naturezaPoderes: string | null;
  outorgantes: Parte[]; procuradores: Parte[]; itens: ItemRascunho[];
}

export function deDetalhe(d: DetalheProcuracao): Rascunho {
  return {
    dataActo: d.dataActo, local: d.local, oficianteId: d.oficianteId, formaActuacao: d.formaActuacao, formaActuacaoPersonalizada: d.formaActuacaoPersonalizada, naturezaPoderes: d.naturezaPoderes ?? null,
    outorgantes: d.outorgantes.map((o) => ({ pessoaId: o.id, nome: o.nome, sexo: o.sexo, qualidade: o.qualidade })),
    procuradores: d.procuradores.map((p) => ({ pessoaId: p.id, nome: p.nome, sexo: p.sexo })),
    itens: d.poderes.map((p) => ({
      uid: p.instanciaId, versaoId: p.personalizado ? undefined : p.versaoId, codigo: p.codigo, nome: p.nome, versao: p.versao, clausula: !!p.clausula,
      usarAlternativo: p.usarAlternativo, campos: p.campos, valores: p.valores ?? {}, personalizado: p.personalizado ? { nome: p.nome, texto: p.textoPersonalizado ?? '' } : undefined,
    })),
  };
}

export function novoItem(p: PoderCatalogo): ItemRascunho {
  return { uid: uid(), versaoId: p.versaoId, codigo: p.codigo, nome: p.nome, versao: p.versao, clausula: p.tipo === 'CLAUSULA', usarAlternativo: false, campos: p.campos, valores: {} };
}

/** Converte o rascunho para o formato do motor de regras (@proc/core), usando o catálogo para as regras. */
export function paraMotor(itens: ItemRascunho[], catalogo: Map<string, PoderCatalogo>): PoderSeleccionado[] {
  return itens.map((i) => {
    const c = catalogo.get(i.codigo);
    const versao: VersaoPoder = {
      poderId: c?.id ?? i.codigo, versaoId: i.versaoId ?? i.uid, numeroVersao: i.versao, codigo: i.codigo, nome: i.nome, categoria: c?.categoria ?? '',
      texto: c?.texto ?? (i.personalizado?.texto ?? ''), textoAlternativo: c?.textoAlternativo ?? undefined, campos: i.campos, regras: c?.regras ?? [], exclusivo: c?.exclusivo, tiposPermitidos: c?.tiposPermitidos,
    };
    return { instanciaId: i.uid, versao, valores: i.valores, usarAlternativo: i.usarAlternativo, personalizado: !!i.personalizado };
  });
}

type Estado = 'guardado' | 'por-guardar' | 'a-guardar' | 'conflito' | 'erro';

/** Estado do rascunho com gravação automática (PUT com lockVersion, debounce). Voltar atrás nunca perde dados. */
export function useRascunho(id: string, detalhe: DetalheProcuracao | undefined, editavel: boolean, aoGuardar: () => void) {
  const [r, setR] = useState<Rascunho | null>(null);
  const [estado, setEstado] = useState<Estado>('guardado');
  const [erro, setErro] = useState('');
  const lock = useRef<number>(0);
  const sujo = useRef(false);
  useEffect(() => { if (detalhe && !r) { setR(deDetalhe(detalhe)); lock.current = detalhe.lockVersion; } }, [detalhe, r]);

  const guardar = useCallback(async (x: Rascunho) => {
    if (!editavel || !x.outorgantes.length || !x.procuradores.length) { setEstado(x.outorgantes.length && x.procuradores.length ? 'guardado' : 'por-guardar'); return; }
    setEstado('a-guardar');
    try {
      const res = await api<{ lockVersion: number }>(`/poas/${id}`, { method: 'PUT', body: {
        lockVersion: lock.current, dataActo: x.dataActo, local: x.local, oficianteId: x.oficianteId, formaActuacao: x.formaActuacao, formaActuacaoPersonalizada: x.formaActuacaoPersonalizada, naturezaPoderes: x.naturezaPoderes,
        outorgantes: x.outorgantes.map((o) => ({ pessoaId: o.pessoaId, qualidade: o.qualidade || null })), procuradores: x.procuradores.map((p) => ({ pessoaId: p.pessoaId })),
        poderes: x.itens.map((i) => (i.personalizado && !i.versaoId ? { personalizado: i.personalizado } : { versaoId: i.versaoId!, usarAlternativo: i.usarAlternativo, valores: i.valores })),
      } });
      lock.current = res.lockVersion; setEstado('guardado'); setErro(''); aoGuardar();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setEstado('conflito');
      else { setEstado('erro'); setErro(e instanceof ApiError ? [e.message, ...e.erros].join(' — ') : 'Não foi possível guardar.'); }
    }
  }, [id, editavel, aoGuardar]);

  useEffect(() => {
    if (!r || !sujo.current) return;
    setEstado('por-guardar');
    const t = setTimeout(() => { sujo.current = false; guardar(r); }, 700);
    return () => clearTimeout(t);
  }, [r, guardar]);

  const actualizar = useCallback((fn: (x: Rascunho) => Rascunho) => { if (!editavel) return; sujo.current = true; setR((x) => (x ? fn(x) : x)); }, [editavel]);
  return { r, actualizar, estado, erro, guardarJa: () => r && guardar(r) };
}
