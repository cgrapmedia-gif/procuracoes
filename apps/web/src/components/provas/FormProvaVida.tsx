'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CARTOES_PROVA_VIDA, ENTIDADES_PROVA_VIDA } from '@proc/core/browser';
import { api } from '@/lib/api';
import { Icone } from '../Icone';
import { PessoaGaveta } from '../PessoaForm';
import { SeletorPessoa } from '../SeletorPessoa';
import { Campo } from '../ui';

export interface ValoresProvaVida {
  pessoaId: string; pessoaNome: string; dataActo: string; oficianteId: string; modalidade: 'REFORMA' | 'SOBREVIVENCIA'; entidade: string;
  cartao: { tipo: string; numero: string }; falecido: { nome: string; sexo: 'M' | 'F'; numero: string };
  dependentes: { pessoaId: string; nome: string; relacao: 'FILHO' | 'TUTELADO' | 'NETO' | 'OUTRO'; relacaoTexto?: string }[];
}
export const VAZIO_PV = (oficianteId = ''): ValoresProvaVida => ({ pessoaId: '', pessoaNome: '', dataActo: new Date().toISOString().slice(0, 10), oficianteId, modalidade: 'REFORMA', entidade: ENTIDADES_PROVA_VIDA[0], cartao: { tipo: CARTOES_PROVA_VIDA[0], numero: '' }, falecido: { nome: '', sexo: 'M', numero: '' }, dependentes: [] });

/** Corpo do pedido à API a partir do formulário. */
export const paraApi = (v: ValoresProvaVida) => ({
  pessoaId: v.pessoaId, dataActo: v.dataActo, oficianteId: v.oficianteId || null, modalidade: v.modalidade, entidade: v.entidade,
  cartao: v.cartao.numero.trim() ? v.cartao : null,
  falecido: v.modalidade === 'SOBREVIVENCIA' && v.falecido.nome.trim() ? v.falecido : null,
  dependentes: v.modalidade === 'SOBREVIVENCIA' ? v.dependentes.map((d) => ({ pessoaId: d.pessoaId, relacao: d.relacao, relacaoTexto: d.relacaoTexto ?? null })) : [],
});

/** Formulário da prova de vida (uma só página: quem, para quem, que pensão). */
export function FormProvaVida({ v, mudar, editavel, aoMudarPessoa }: { v: ValoresProvaVida; mudar: (v: ValoresProvaVida) => void; editavel: boolean; aoMudarPessoa?: () => void }) {
  const ofs = useQuery({ queryKey: ['officers'], queryFn: () => api<{ id: string; nome: string; cargo: string }[]>('/officers') });
  const [gaveta, setG] = useState<{ aberta: boolean; id?: string; nome?: string; alvo: 'requerente' | 'dependente' }>({ aberta: false, alvo: 'requerente' });
  const set = (p: Partial<ValoresProvaVida>) => mudar({ ...v, ...p });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <fieldset disabled={!editavel} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="cartao"><div className="corpo">
          <h3>Quem comparece</h3>
          {v.pessoaId
            ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b style={{ flex: 1, fontWeight: 600 }}>{v.pessoaNome}</b>
                {editavel && <button type="button" className="btn pequeno" onClick={() => set({ pessoaId: '', pessoaNome: '' })}>Trocar</button>}</div>
            : <SeletorPessoa rotulo="Pesquisar requerente" aoEscolher={(p) => set({ pessoaId: p.id, pessoaNome: p.nomeCompleto })} aoCriar={(nome) => setG({ aberta: true, nome, alvo: 'requerente' })} />}
          <span className="small muted">A idade, o estado civil, a naturalidade e a morada vêm da ficha da pessoa.</span>
          <div className="linha-form">
            <Campo rotulo="Data" obrigatorio><input className="entrada" type="date" value={v.dataActo} onChange={(e) => set({ dataActo: e.target.value })} /></Campo>
            <Campo rotulo="Assina" obrigatorio><select className="entrada" value={v.oficianteId} onChange={(e) => set({ oficianteId: e.target.value })}><option value="">Escolher…</option>{ofs.data?.map((o) => <option key={o.id} value={o.id}>{o.nome}, {o.cargo}</option>)}</select></Campo>
          </div>
        </div></section>
        <section className="cartao"><div className="corpo">
          <h3>Pensão e entidade</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['REFORMA', 'Pensão de reforma'], ['SOBREVIVENCIA', 'Pensão de sobrevivência']] as const).map(([m, r]) => <button key={m} type="button" className="pilula" aria-pressed={v.modalidade === m} onClick={() => set({ modalidade: m })}>{r}</button>)}
          </div>
          <Campo rotulo="Destina-se a" obrigatorio ajuda="Escolha da lista ou escreva outra entidade.">
            <input className="entrada" list="entidades-pv" value={v.entidade} onChange={(e) => set({ entidade: e.target.value })} />
            <datalist id="entidades-pv">{ENTIDADES_PROVA_VIDA.map((e) => <option key={e} value={e} />)}</datalist>
          </Campo>
          <div className="linha-form">
            <Campo rotulo="Cartão" opcional={v.modalidade === 'SOBREVIVENCIA'}><input className="entrada" list="cartoes-pv" value={v.cartao.tipo} onChange={(e) => set({ cartao: { ...v.cartao, tipo: e.target.value } })} /><datalist id="cartoes-pv">{CARTOES_PROVA_VIDA.map((e) => <option key={e} value={e} />)}</datalist></Campo>
            <Campo rotulo="N.º do cartão" opcional={v.modalidade === 'SOBREVIVENCIA'}><input className="entrada mono" value={v.cartao.numero} onChange={(e) => set({ cartao: { ...v.cartao, numero: e.target.value } })} /></Campo>
          </div>
        </div></section>
        {v.modalidade === 'SOBREVIVENCIA' && (
          <section className="cartao"><div className="corpo">
            <h3>Sobrevivência</h3>
            <div className="linha-form">
              <Campo rotulo="Nome do falecido (assegurado)" obrigatorio><input className="entrada" value={v.falecido.nome} onChange={(e) => set({ falecido: { ...v.falecido, nome: e.target.value } })} /></Campo>
              <Campo rotulo="Sexo do falecido"><select className="entrada" value={v.falecido.sexo} onChange={(e) => set({ falecido: { ...v.falecido, sexo: e.target.value as 'M' } })}><option value="M">Masculino («do malogrado»)</option><option value="F">Feminino («da malograda»)</option></select></Campo>
              <Campo rotulo="N.º de segurado" opcional><input className="entrada mono" value={v.falecido.numero} onChange={(e) => set({ falecido: { ...v.falecido, numero: e.target.value } })} /></Campo>
            </div>
            <h3 style={{ marginTop: 6 }}>Menores ou tutelados que comparecem</h3>
            <span className="small muted">Se existirem, são eles os beneficiários («com as suas filhas menores…», «beneficiárias do malogrado…»).</span>
            {v.dependentes.map((d, i) => (
              <div key={d.pessoaId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <b style={{ flex: 1, fontWeight: 500 }}>{d.nome}</b>
                <select className="entrada" style={{ width: 180 }} value={d.relacao} onChange={(e) => set({ dependentes: v.dependentes.map((x, j) => (j === i ? { ...x, relacao: e.target.value as 'FILHO' } : x)) })}><option value="FILHO">Filho(a) menor</option><option value="TUTELADO">Tutelado(a)</option><option value="NETO">Neto(a) menor</option></select>
                {editavel && <button type="button" className="btn icone" aria-label="Retirar" onClick={() => set({ dependentes: v.dependentes.filter((_, j) => j !== i) })}><Icone n="lixo" t={14} /></button>}
              </div>
            ))}
            {editavel && <SeletorPessoa rotulo="Acrescentar menor ou tutelado" excluir={[v.pessoaId, ...v.dependentes.map((d) => d.pessoaId)]} aoEscolher={(p) => set({ dependentes: [...v.dependentes, { pessoaId: p.id, nome: p.nomeCompleto, relacao: 'FILHO' }] })} aoCriar={(nome) => setG({ aberta: true, nome, alvo: 'dependente' })} />}
          </div></section>
        )}
      </fieldset>
      {(v.pessoaId || v.dependentes.length > 0) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {v.pessoaId && <button type="button" className="btn pequeno fantasma" onClick={() => setG({ aberta: true, id: v.pessoaId, alvo: 'requerente' })}><Icone n="lapis" t={14} />Dados de {v.pessoaNome.split(' ')[0]}</button>}
          {v.dependentes.map((d) => <button key={d.pessoaId} type="button" className="btn pequeno fantasma" onClick={() => setG({ aberta: true, id: d.pessoaId, alvo: 'dependente' })}><Icone n="lapis" t={14} />Dados de {d.nome.split(' ')[0]}</button>)}
        </div>
      )}
      <PessoaGaveta aberta={gaveta.aberta} pessoaId={gaveta.id} nomeInicial={gaveta.nome} fechar={() => setG({ aberta: false, alvo: 'requerente' })}
        aoGuardar={(p) => {
          const existente = !!gaveta.id;
          setG({ aberta: false, alvo: 'requerente' });
          if (existente) { aoMudarPessoa?.(); return; }
          if (gaveta.alvo === 'requerente') set({ pessoaId: p.id, pessoaNome: p.nomeCompleto });
          else set({ dependentes: [...v.dependentes, { pessoaId: p.id, nome: p.nomeCompleto, relacao: 'FILHO' }] });
        }} />
    </div>
  );
}
