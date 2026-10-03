'use client';
import { DESIGNACOES_LOCALIDADE, DefinicaoCampo, DesignacaoLocalidade, Imovel, Morada, RefEntidade, ValorCampo, Veiculo, Empresa, formatarIban, moedaCompleta, validarCampo } from '@proc/core/browser';
import { SeletorPessoa } from '../SeletorPessoa';
import { SeletorEntidade } from '../SeletorEntidade';
import { PessoaGaveta } from '../PessoaForm';
import { useState } from 'react';
import { Campo } from '../ui';
import { Icone } from '../Icone';

const TIPO_ENTRADA: Partial<Record<DefinicaoCampo['tipo'], string>> = { DATA: 'date', DATA_VALIDADE: 'date', EMAIL: 'email', TELEFONE: 'tel', NUMERO: 'number', MOEDA: 'number' };
const TIPO_ENTIDADE: Record<string, string> = { banco: 'BANCO', conservatoria: 'CONSERVATORIA', tribunal: 'TRIBUNAL', instituto: 'SEGURANCA_SOCIAL', administracao: 'ADMIN_TRIBUTARIA', operadora: 'OPERADORA', seguradora: 'SEGURADORA' };

function Sub({ campos, valor, mudar }: { campos: [string, string, boolean?][]; valor: Record<string, string | undefined>; mudar: (v: Record<string, string>) => void }) {
  return (
    <div className="linha-form" style={{ padding: 12, border: '1px solid var(--linha)', borderRadius: 8, background: '#FBFAF7' }}>
      {campos.map(([k, r, obr]) => <label key={k} className="campo"><span style={{ fontSize: 12.5 }}>{r}{obr && <span className="obrig"> *</span>}</span><input className="entrada" value={valor[k] ?? ''} onChange={(e) => mudar({ ...(valor as Record<string, string>), [k]: e.target.value })} /></label>)}
    </div>
  );
}

/** Um campo de poder, com controlo adequado ao tipo e validação imediata (a mesma função que o servidor usa). */
export function CampoDinamico({ def, valor, mudar, dataActo, desactivado }: { def: DefinicaoCampo; valor: ValorCampo; mudar: (v: ValorCampo) => void; dataActo: string; desactivado?: boolean }) {
  const erros = valor === undefined ? [] : validarCampo(def, valor, { dataActo });
  const erro = erros[0]?.replace(`${def.rotulo}: `, '');
  const tipoEnt = TIPO_ENTIDADE[def.chave] ?? '';
  const props = { rotulo: def.rotulo, obrigatorio: def.obrigatorio, opcional: !def.obrigatorio, erro, ajuda: def.ajuda };
  const s = typeof valor === 'string' || typeof valor === 'number' ? String(valor) : '';
  switch (def.tipo) {
    case 'TEXTO_LONGO': return <Campo {...props}><textarea className="entrada" disabled={desactivado} value={s} aria-invalid={!!erro} onChange={(e) => mudar(e.target.value)} /></Campo>;
    case 'LISTA': return <Campo {...props}><select className="entrada" disabled={desactivado} value={s} onChange={(e) => mudar(e.target.value || undefined)}><option value="">Escolher…</option>{def.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></Campo>;
    case 'RADIO': return (
      <fieldset className="campo" style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{def.rotulo}{def.obrigatorio && <span className="obrig"> *</span>}</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{def.opcoes?.map((o) => <label key={o.valor} className="pilula" style={{ cursor: 'pointer' }}><input type="radio" name={def.chave} disabled={desactivado} checked={valor === o.valor} onChange={() => mudar(o.valor)} />{o.rotulo}</label>)}</div></fieldset>);
    case 'SELECCAO_MULTIPLA': {
      const sel = Array.isArray(valor) ? (valor as string[]) : [];
      return (
        <fieldset className="campo" style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{def.rotulo}{def.obrigatorio && <span className="obrig"> *</span>}</legend>
          <div className="grelha" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
            {def.opcoes?.map((o) => { const on = sel.includes(o.valor); return <label key={o.valor} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 38, padding: '6px 12px', border: `1px solid ${on ? 'var(--tinta)' : 'var(--linha-forte)'}`, borderRadius: 8, background: on ? '#F3F0EA' : 'var(--folha)', fontSize: 13 }}><input type="checkbox" disabled={desactivado} checked={on} onChange={() => mudar(on ? sel.filter((x) => x !== o.valor) : def.opcoes!.map((y) => y.valor).filter((y) => y === o.valor || sel.includes(y)))} />{o.rotulo}</label>; })}
          </div>{erro && <span className="erro" role="alert" style={{ fontSize: 12, color: 'var(--carmim)' }}>{erro}</span>}</fieldset>);
    }
    case 'CHECKBOX': return <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" disabled={desactivado} checked={!!valor} onChange={(e) => mudar(e.target.checked)} />{def.rotulo}</label>;
    case 'ENTIDADE': {
      const v = valor as RefEntidade | undefined;
      return <Campo {...props} ajuda={def.ajuda ?? 'Se não estiver na lista, acrescente-a sem sair da procuração.'}><SeletorEntidade tipo={tipoEnt} rotulo={def.rotulo} valor={v} desactivado={desactivado} mudar={(x) => mudar(x)} /></Campo>;
    }
    case 'PESSOA': return <CampoPessoa def={def} valor={valor as RefEntidade | undefined} mudar={mudar} desactivado={desactivado} props={props} />;
    case 'MORADA': {
      const m = (valor as unknown as Morada) ?? { linha: '' };
      return <div className="campo"><span>{def.rotulo}</span>
        <Sub campos={[['linha', 'Morada', true], ['codigoPostal', 'Código postal']]} valor={(valor as unknown as Record<string, string>) ?? {}} mudar={(v) => mudar(v as unknown as Morada)} />
        <div className="linha-form">
          <label className="campo"><span>Tipo de localidade</span><select className="entrada" disabled={desactivado} value={m.designacao ?? 'CONCELHO'} onChange={(e) => mudar({ ...m, designacao: e.target.value as DesignacaoLocalidade } as unknown as ValorCampo)}>{DESIGNACOES_LOCALIDADE.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
          <label className="campo"><span>{DESIGNACOES_LOCALIDADE.find(([v]) => v === (m.designacao ?? 'CONCELHO'))?.[1]}</span><input className="entrada" disabled={desactivado} value={m.concelho ?? m.localidade ?? ''} onChange={(e) => mudar({ ...m, concelho: e.target.value, localidade: undefined } as unknown as ValorCampo)} /></label>
        </div>
        <Sub campos={[['provincia', 'Província'], ['pais', 'País']]} valor={(valor as unknown as Record<string, string>) ?? {}} mudar={(v) => mudar(v as unknown as Morada)} /></div>;
    }
    case 'IMOVEL': return <div className="campo"><span>{def.rotulo}{def.obrigatorio && <span className="obrig"> *</span>}</span><Sub campos={[['tipo', 'Tipo (ex.: prédio urbano)'], ['morada', 'Localização', true], ['freguesia', 'Freguesia'], ['concelho', 'Concelho'], ['artigoMatricial', 'Artigo matricial'], ['conservatoria', 'Conservatória'], ['descricaoPredial', 'Descrição predial n.º']]} valor={(valor as unknown as Record<string, string>) ?? {}} mudar={(v) => mudar(v as unknown as Imovel)} />{erro && <span className="erro">{erro}</span>}</div>;
    case 'VEICULO': return <div className="campo"><span>{def.rotulo}</span><Sub campos={[['marca', 'Marca', true], ['modelo', 'Modelo'], ['matricula', 'Matrícula', true], ['quadro', 'N.º de quadro']]} valor={(valor as unknown as Record<string, string>) ?? {}} mudar={(v) => mudar(v as unknown as Veiculo)} />{erro && <span className="erro">{erro}</span>}</div>;
    case 'EMPRESA': return <div className="campo"><span>{def.rotulo}</span><Sub campos={[['denominacao', 'Denominação', true], ['nif', 'NIF'], ['sede', 'Sede'], ['matricula', 'Matrícula']]} valor={(valor as unknown as Record<string, string>) ?? {}} mudar={(v) => mudar(v as unknown as Empresa)} />{erro && <span className="erro">{erro}</span>}</div>;
    default: {
      const ajuda = def.tipo === 'MOEDA' && s && !erro ? moedaCompleta(Number(s), def.moeda ?? 'AOA') : def.tipo === 'IBAN' && s && !erro ? formatarIban(s) : def.ajuda;
      return <Campo {...props} ajuda={ajuda}><input className={`entrada${['IBAN', 'NIF', 'NUM_IDENTIFICACAO'].includes(def.tipo) ? ' mono' : ''}`} disabled={desactivado} type={TIPO_ENTRADA[def.tipo] ?? 'text'} step={def.tipo === 'MOEDA' ? '0.01' : undefined} value={s} aria-invalid={!!erro}
        onChange={(e) => mudar(e.target.value === '' ? undefined : def.tipo === 'NUMERO' || def.tipo === 'MOEDA' ? Number(e.target.value) : e.target.value)} /></Campo>;
    }
  }
}

/** Campo PESSOA (ex.: menor): pesquisa de pessoas existentes ou registo de uma nova, sem sair da procuração. */
function CampoPessoa({ def, valor, mudar, desactivado, props }: { def: DefinicaoCampo; valor?: RefEntidade; mudar: (v: ValorCampo) => void; desactivado?: boolean; props: { rotulo: string; obrigatorio: boolean; opcional: boolean; erro?: string; ajuda?: string } }) {
  const [gaveta, setGaveta] = useState(false); const [nome, setNome] = useState('');
  return (
    <Campo {...props}>
      {valor?.id
        ? <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b style={{ fontWeight: 500 }}>{valor.nome}</b>{!desactivado && <button type="button" className="btn pequeno" onClick={() => mudar(undefined)}>Trocar</button>}</span>
        : <span style={{ display: 'flex', gap: 8 }}><span style={{ flex: 1 }}><SeletorPessoa rotulo={`Pesquisar ${def.rotulo.toLowerCase()}`} aoEscolher={(p) => mudar({ id: p.id, nome: p.nomeCompleto })} aoCriar={(n) => { setNome(n); setGaveta(true); }} /></span>{!desactivado && <button type="button" className="btn" style={{ height: 44 }} onClick={() => setGaveta(true)}><Icone n="mais" t={15} />Nova pessoa</button>}</span>}
      <PessoaGaveta aberta={gaveta} nomeInicial={nome} fechar={() => setGaveta(false)} aoGuardar={(p) => mudar({ id: p.id, nome: p.nomeCompleto })} />
    </Campo>
  );
}
