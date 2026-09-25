/**
 * Motor de regras dos poderes. Determinístico: só usa relações configuradas no catálogo.
 * Não "decide" juridicamente — sinaliza, sugere e bloqueia a emissão quando há erros.
 */
import { validarCampo } from './campos';
import { PoderSeleccionado, VersaoPoder } from './poderes';

export type Severidade = 'ERRO' | 'AVISO' | 'INFO';
export interface Problema {
  severidade: Severidade;
  codigo: 'CAMPO' | 'REQUER' | 'INCOMPATIVEL' | 'EXCLUSIVO' | 'TIPO' | 'DUPLICADO' | 'PERSONALIZADO' | 'VERSAO_DESACTUALIZADA';
  instanciaId?: string;
  campo?: string;
  mensagem: string;
  correccao?: { accao: 'ADICIONAR' | 'REMOVER' | 'ACTUALIZAR_VERSAO'; codigo: string };
}

export interface ContextoRegras {
  tipoProcuracao: string;
  dataActo?: string;
  /** Versões mais recentes publicadas por código — para avisar quando um rascunho usa versão antiga. */
  versoesActuais?: Record<string, number>;
}

export function avaliarRegras(seleccao: PoderSeleccionado[], ctx: ContextoRegras): Problema[] {
  const out: Problema[] = [];
  const codigos = new Set(seleccao.map((s) => s.versao.codigo));

  for (const s of seleccao) {
    const v = s.versao;
    // Campos
    for (const c of v.campos) for (const m of validarCampo(c, s.valores[c.chave], { dataActo: ctx.dataActo }))
      out.push({ severidade: 'ERRO', codigo: 'CAMPO', instanciaId: s.instanciaId, campo: c.chave, mensagem: `${v.nome} — ${m}` });
    // Tipo de procuração
    if (v.tiposPermitidos?.length && !v.tiposPermitidos.includes(ctx.tipoProcuracao))
      out.push({ severidade: 'ERRO', codigo: 'TIPO', instanciaId: s.instanciaId, mensagem: `"${v.nome}" não está disponível para este tipo de procuração.` });
    // Exclusividade
    if (v.exclusivo && seleccao.length > 1)
      out.push({ severidade: 'ERRO', codigo: 'EXCLUSIVO', instanciaId: s.instanciaId, mensagem: `"${v.nome}" é exclusivo e não pode ser combinado com outros poderes.` });
    // Relações
    for (const r of v.regras) {
      if (r.tipo === 'REQUER' && !codigos.has(r.alvoCodigo))
        out.push({ severidade: 'ERRO', codigo: 'REQUER', instanciaId: s.instanciaId, mensagem: r.mensagem ?? `"${v.nome}" exige o poder ${r.alvoCodigo}.`, correccao: { accao: 'ADICIONAR', codigo: r.alvoCodigo } });
      if (r.tipo === 'INCOMPATIVEL' && codigos.has(r.alvoCodigo))
        out.push({ severidade: 'ERRO', codigo: 'INCOMPATIVEL', instanciaId: s.instanciaId, mensagem: r.mensagem ?? `"${v.nome}" é incompatível com ${r.alvoCodigo}.`, correccao: { accao: 'REMOVER', codigo: r.alvoCodigo } });
    }
    if (s.personalizado)
      out.push({ severidade: 'AVISO', codigo: 'PERSONALIZADO', instanciaId: s.instanciaId, mensagem: `"${v.nome}" é um poder personalizado, fora do catálogo aprovado — requer validação.` });
    const actual = ctx.versoesActuais?.[v.codigo];
    if (actual && actual > v.numeroVersao)
      out.push({ severidade: 'AVISO', codigo: 'VERSAO_DESACTUALIZADA', instanciaId: s.instanciaId, mensagem: `"${v.nome}" usa a v${v.numeroVersao}; existe a v${actual}.`, correccao: { accao: 'ACTUALIZAR_VERSAO', codigo: v.codigo } });
  }
  // Duplicados sem campos (o mesmo poder duas vezes só faz sentido com parâmetros distintos)
  const vistos = new Map<string, string>();
  for (const s of seleccao) {
    const chave = s.versao.codigo + JSON.stringify(s.valores);
    if (vistos.has(chave)) out.push({ severidade: 'AVISO', codigo: 'DUPLICADO', instanciaId: s.instanciaId, mensagem: `"${s.versao.nome}" está repetido com os mesmos dados.` });
    vistos.set(chave, s.instanciaId);
  }
  // Regras de incompatibilidade são simétricas mesmo que só configuradas num sentido: dedup por par
  return deduplicarIncompat(out);
}

function deduplicarIncompat(p: Problema[]): Problema[] { return p.filter((x, i) => p.findIndex((y) => y.mensagem === x.mensagem && y.instanciaId === x.instanciaId) === i); }

/** Sugestões: poderes relacionados (SUGERE) e dependências (REQUER) ainda não seleccionados, ordenados por relevância. */
export function sugerirPoderes(seleccao: PoderSeleccionado[], catalogo: Map<string, VersaoPoder>): { codigo: string; nome: string; motivo: string; peso: number }[] {
  const escolhidos = new Set(seleccao.map((s) => s.versao.codigo));
  const acc = new Map<string, { codigo: string; nome: string; motivo: string; peso: number }>();
  for (const s of seleccao) for (const r of s.versao.regras) {
    if (r.tipo === 'INCOMPATIVEL' || escolhidos.has(r.alvoCodigo)) continue;
    const alvo = catalogo.get(r.alvoCodigo);
    if (!alvo) continue;
    const peso = r.tipo === 'REQUER' ? 10 : 1;
    const ex = acc.get(r.alvoCodigo);
    if (ex) ex.peso += peso;
    else acc.set(r.alvoCodigo, { codigo: alvo.codigo, nome: alvo.nome, motivo: r.tipo === 'REQUER' ? `Exigido por "${s.versao.nome}"` : `Relacionado com "${s.versao.nome}"`, peso });
  }
  return [...acc.values()].sort((a, b) => b.peso - a.peso);
}
