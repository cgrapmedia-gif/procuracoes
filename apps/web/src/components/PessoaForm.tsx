'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { biAngolaValido, codigoPostalPTValido, emailValido } from '@proc/core/browser';
import { ApiError, api } from '@/lib/api';
import { Campo, Gaveta, mensagemErro } from './ui';

export interface PessoaCompleta {
  id?: string; nomeCompleto: string; sexo: 'M' | 'F'; dataNascimento?: string | null; nacionalidade: string; naturalidade?: string | null;
  estadoCivil?: string | null; conjuge?: string | null; regimeBens?: string | null; profissao?: string | null;
  documento: { tipo: string; numero: string; dataEmissao?: string | null; validade?: string | null; vitalicio: boolean };
  nif?: string | null; morada?: { linha: string; codigoPostal?: string; localidade?: string; concelho?: string; provincia?: string; pais?: string } | null;
  telefone?: string | null; email?: string | null; observacoes?: string | null;
}
const VAZIA: PessoaCompleta = { nomeCompleto: '', sexo: 'F', nacionalidade: 'angolana', documento: { tipo: 'BI_AO', numero: '', vitalicio: false }, morada: { linha: '', pais: 'Portugal' } };
const ESTADOS_CIVIS = [['SOLTEIRO', 'Solteiro(a)'], ['CASADO', 'Casado(a)'], ['DIVORCIADO', 'Divorciado(a)'], ['VIUVO', 'Viúvo(a)'], ['SEPARADO', 'Separado(a) judicialmente'], ['UNIAO_FACTO', 'União de facto']];

/** Gaveta de criação/edição de pessoa. Detecta duplicados pelo documento de identificação (409 do servidor) e oferece reutilizar. */
export function PessoaGaveta({ aberta, fechar, pessoaId, aoGuardar, nomeInicial }: { aberta: boolean; fechar: () => void; pessoaId?: string; nomeInicial?: string; aoGuardar: (p: { id: string; nomeCompleto: string; sexo: 'M' | 'F' }) => void }) {
  const [p, setP] = useState<PessoaCompleta>(VAZIA);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState('');
  const [existente, setExistente] = useState<{ id: string; nome: string } | null>(null);
  const [aGuardar, setAG] = useState(false);
  const tipos = useQuery({ queryKey: ['tipos-doc'], queryFn: () => api<{ code: string; name: string }[]>('/identity-document-types') });
  useEffect(() => {
    if (!aberta) return;
    setErros({}); setErroGeral(''); setExistente(null);
    if (pessoaId) api<PessoaCompleta>(`/persons/${pessoaId}`).then((x) => setP({ ...VAZIA, ...x, morada: x.morada ?? VAZIA.morada })); else setP({ ...VAZIA, nomeCompleto: nomeInicial ?? '' });
  }, [aberta, pessoaId, nomeInicial]);
  const set = (patch: Partial<PessoaCompleta>) => setP((x) => ({ ...x, ...patch }));
  const setDoc = (patch: Partial<PessoaCompleta['documento']>) => setP((x) => ({ ...x, documento: { ...x.documento, ...patch } }));
  const setMor = (patch: Partial<NonNullable<PessoaCompleta['morada']>>) => setP((x) => ({ ...x, morada: { linha: '', ...x.morada, ...patch } }));

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (p.nomeCompleto.trim().length < 3) e.nome = 'Indique o nome completo.';
    if (!p.documento.numero.trim()) e.doc = 'Indique o número do documento.';
    else if (p.documento.tipo === 'BI_AO' && !biAngolaValido(p.documento.numero)) e.doc = 'Formato do BI angolano: 9 dígitos, 2 letras, 3 dígitos (ex.: 000000000LA000).';
    if (!p.documento.vitalicio && !p.documento.validade) e.validade = 'Indique a validade ou marque como vitalício.';
    if (p.email && !emailValido(p.email)) e.email = 'Email inválido.';
    if (p.morada?.codigoPostal && p.morada.pais === 'Portugal' && !codigoPostalPTValido(p.morada.codigoPostal)) e.cp = 'Formato 0000-000.';
    setErros(e);
    return Object.keys(e).length === 0;
  }
  async function guardar(ev?: FormEvent) {
    ev?.preventDefault();
    if (!validar()) return;
    setAG(true); setErroGeral('');
    const limpa = { ...p, morada: p.morada?.linha ? p.morada : null, id: undefined };
    for (const k of ['dataNascimento', 'naturalidade', 'estadoCivil', 'conjuge', 'regimeBens', 'profissao', 'nif', 'telefone', 'email', 'observacoes'] as const) if (!limpa[k]) (limpa as Record<string, unknown>)[k] = null;
    if (!limpa.documento.dataEmissao) limpa.documento = { ...limpa.documento, dataEmissao: null };
    try {
      const r = pessoaId ? await api<{ id: string }>(`/persons/${pessoaId}`, { method: 'PUT', body: limpa }) : await api<{ id: string }>('/persons', { body: limpa });
      aoGuardar({ id: r.id, nomeCompleto: p.nomeCompleto, sexo: p.sexo }); fechar();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body.existente) setExistente(e.body.existente as { id: string; nome: string });
      else setErroGeral(mensagemErro(e));
    } finally { setAG(false); }
  }
  return (
    <Gaveta titulo={pessoaId ? 'Editar pessoa' : 'Nova pessoa'} aberta={aberta} fechar={fechar}
      rodape={<><button className="btn fantasma" onClick={fechar}>Cancelar</button><button className="btn primario" onClick={() => guardar()} disabled={aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar pessoa'}</button></>}>
      <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {erroGeral && <div className="aviso erro" role="alert">{erroGeral}</div>}
        {existente && <div className="aviso atencao"><span style={{ flex: 1 }}>Já existe uma pessoa com este documento: <b>{existente.nome}</b>.</span><button type="button" className="btn pequeno" onClick={() => { aoGuardar({ id: existente.id, nomeCompleto: existente.nome, sexo: p.sexo }); fechar(); }}>Usar esta pessoa</button></div>}
        <Campo rotulo="Nome completo" obrigatorio erro={erros.nome}><input className="entrada" value={p.nomeCompleto} onChange={(e) => set({ nomeCompleto: e.target.value })} aria-invalid={!!erros.nome} /></Campo>
        <div className="linha-form">
          <Campo rotulo="Sexo" obrigatorio ajuda="Determina a concordância no texto (procurador/procuradora)."><select className="entrada" value={p.sexo} onChange={(e) => set({ sexo: e.target.value as 'M' | 'F' })}><option value="F">Feminino</option><option value="M">Masculino</option></select></Campo>
          <Campo rotulo="Nacionalidade" obrigatorio ajuda="Forma feminina: angolana, portuguesa…"><input className="entrada" value={p.nacionalidade} onChange={(e) => set({ nacionalidade: e.target.value })} /></Campo>
        </div>
        <div className="linha-form">
          <Campo rotulo="Estado civil" opcional><select className="entrada" value={p.estadoCivil ?? ''} onChange={(e) => set({ estadoCivil: e.target.value || null })}><option value="">—</option>{ESTADOS_CIVIS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
          <Campo rotulo="Profissão" opcional><input className="entrada" value={p.profissao ?? ''} onChange={(e) => set({ profissao: e.target.value })} /></Campo>
        </div>
        {p.estadoCivil === 'CASADO' && <div className="linha-form">
          <Campo rotulo="Cônjuge" opcional><input className="entrada" value={p.conjuge ?? ''} onChange={(e) => set({ conjuge: e.target.value })} /></Campo>
          <Campo rotulo="Regime de bens" opcional><input className="entrada" placeholder="comunhão de adquiridos" value={p.regimeBens ?? ''} onChange={(e) => set({ regimeBens: e.target.value })} /></Campo>
        </div>}
        <Campo rotulo="Naturalidade" opcional><input className="entrada" placeholder="Município de …, Província de …" value={p.naturalidade ?? ''} onChange={(e) => set({ naturalidade: e.target.value })} /></Campo>
        <h3>Documento de identificação</h3>
        <div className="linha-form">
          <Campo rotulo="Tipo" obrigatorio><select className="entrada" value={p.documento.tipo} onChange={(e) => setDoc({ tipo: e.target.value })}>{tipos.data?.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Campo>
          <Campo rotulo="Número" obrigatorio erro={erros.doc}><input className="entrada mono" value={p.documento.numero} onChange={(e) => setDoc({ numero: e.target.value.toUpperCase() })} aria-invalid={!!erros.doc} /></Campo>
        </div>
        <div className="linha-form">
          <Campo rotulo="Data de emissão" opcional><input className="entrada" type="date" value={p.documento.dataEmissao ?? ''} onChange={(e) => setDoc({ dataEmissao: e.target.value })} /></Campo>
          <Campo rotulo="Válido até" erro={erros.validade}><input className="entrada" type="date" disabled={p.documento.vitalicio} value={p.documento.validade ?? ''} onChange={(e) => setDoc({ validade: e.target.value })} /></Campo>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={p.documento.vitalicio} onChange={(e) => setDoc({ vitalicio: e.target.checked, validade: e.target.checked ? null : p.documento.validade })} />Documento vitalício</label>
        <Campo rotulo="NIF" opcional ajuda="Guardado cifrado; pesquisável por valor exacto."><input className="entrada mono" value={p.nif ?? ''} onChange={(e) => set({ nif: e.target.value })} /></Campo>
        <h3>Morada</h3>
        <Campo rotulo="Morada" opcional><input className="entrada" value={p.morada?.linha ?? ''} onChange={(e) => setMor({ linha: e.target.value })} /></Campo>
        <div className="linha-form">
          <Campo rotulo="Código postal" opcional erro={erros.cp}><input className="entrada" value={p.morada?.codigoPostal ?? ''} onChange={(e) => setMor({ codigoPostal: e.target.value })} /></Campo>
          <Campo rotulo="Localidade" opcional><input className="entrada" value={p.morada?.localidade ?? ''} onChange={(e) => setMor({ localidade: e.target.value })} /></Campo>
        </div>
        <div className="linha-form">
          <Campo rotulo="Província" opcional><input className="entrada" value={p.morada?.provincia ?? ''} onChange={(e) => setMor({ provincia: e.target.value })} /></Campo>
          <Campo rotulo="País" opcional><input className="entrada" value={p.morada?.pais ?? ''} onChange={(e) => setMor({ pais: e.target.value })} /></Campo>
        </div>
        <div className="linha-form">
          <Campo rotulo="Telefone" opcional><input className="entrada" type="tel" value={p.telefone ?? ''} onChange={(e) => set({ telefone: e.target.value })} /></Campo>
          <Campo rotulo="Email" opcional erro={erros.email}><input className="entrada" type="email" value={p.email ?? ''} onChange={(e) => set({ email: e.target.value })} /></Campo>
        </div>
        <button type="submit" hidden />
      </form>
    </Gaveta>
  );
}
