'use client';
import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DefinicaoCampo, RegraPoder, TIPOS_CAMPO, renderizarPoder, verificarDefinicaoPoder } from '@proc/core/browser';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dataHoraPT } from '@/lib/formato';
import { Categoria, PoderCatalogo } from '@/lib/tipos';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { Campo, Giro, Modal, mensagemErro, useToast } from '@/components/ui';

interface Versao { id: string; versionNo: number; status: 'RASCUNHO' | 'PUBLICADA' | 'RETIRADA'; text: string; altText: string | null; fields: DefinicaoCampo[]; rules: RegraPoder[]; exclusive: boolean; allowedTypes: string[]; changeNote: string | null; createdAt: string; publishedAt: string | null }
interface Detalhe { id: string; code: string; kind: 'PODER' | 'CLAUSULA'; name: string; description: string | null; active: boolean; required: boolean; sort: number; usageCount: number; currentVersionId: string | null; categoria: Categoria; versoes: Versao[] }
interface Forma { codigo: string; tipo: 'PODER' | 'CLAUSULA'; categoriaCodigo: string; nome: string; descricao: string; texto: string; textoAlternativo: string; campos: DefinicaoCampo[]; regras: RegraPoder[]; exclusivo: boolean; tiposPermitidos: string[]; notaAlteracao: string }
const VAZIO: Forma = { codigo: '', tipo: 'PODER', categoriaCodigo: '', nome: '', descricao: '', texto: '', textoAlternativo: '', campos: [], regras: [], exclusivo: false, tiposPermitidos: [], notaAlteracao: '' };
const ROT_TIPO: Record<string, string> = { TEXTO: 'Texto', TEXTO_LONGO: 'Texto longo', NUMERO: 'Número', MOEDA: 'Moeda', DATA: 'Data', DATA_VALIDADE: 'Data de validade', MORADA: 'Morada', CODIGO_POSTAL: 'Código postal', NIF: 'NIF', NUM_IDENTIFICACAO: 'N.º identificação', IBAN: 'IBAN', TELEFONE: 'Telefone', EMAIL: 'Email', LISTA: 'Lista', SELECCAO_MULTIPLA: 'Selecção múltipla', CHECKBOX: 'Checkbox', RADIO: 'Opção única', ENTIDADE: 'Entidade', PESSOA: 'Pessoa', IMOVEL: 'Imóvel', VEICULO: 'Veículo', EMPRESA: 'Empresa' };
const EXEMPLO: Record<string, unknown> = { TEXTO: 'Exemplo', TEXTO_LONGO: 'Texto de exemplo', NUMERO: 3, MOEDA: 1500000, DATA: '2026-12-31', DATA_VALIDADE: '2027-12-31', CODIGO_POSTAL: '4000-000', NIF: '999999990', NUM_IDENTIFICACAO: '000000000LA000', IBAN: 'AO98004400006729503110102', TELEFONE: '+351 900 000 000', EMAIL: 'exemplo@example.test', CHECKBOX: true, ENTIDADE: { id: 'x', nome: 'Banco Demo Alfa, S.A.' }, PESSOA: { id: 'x', nome: 'Pessoa Exemplo' }, IMOVEL: { tipo: 'prédio urbano', morada: 'Rua Exemplo, 1', artigoMatricial: '1234' }, VEICULO: { marca: 'Marca', matricula: 'AA-00-00' }, EMPRESA: { denominacao: 'Empresa Exemplo, Lda.' }, MORADA: { linha: 'Rua Exemplo, 1', localidade: 'Porto' } };

export default function EditorPoder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const novo = id === 'novo';
  const router = useRouter(); const qc = useQueryClient(); const toast = useToast(); const { pode } = useAuth();
  const det = useQuery({ queryKey: ['poder', id], queryFn: () => api<Detalhe>(`/powers/${id}`), enabled: !novo });
  const cats = useQuery({ queryKey: ['categorias'], queryFn: () => api<Categoria[]>('/power-categories') });
  const tipos = useQuery({ queryKey: ['poa-types'], queryFn: () => api<{ codigo: string; nome: string }[]>('/poa-types') });
  const catalogo = useQuery({ queryKey: ['catalogo-todos'], queryFn: () => api<{ itens: PoderCatalogo[] }>('/powers?limite=200&activos=todos').then((x) => x.itens) });
  const [f, setF] = useState<Forma>(VAZIO); const [aba, setAba] = useState<'conteudo' | 'campos' | 'regras' | 'versoes'>('conteudo');
  const [aGuardar, setAG] = useState(false); const [erroSrv, setErroSrv] = useState<string[]>([]); const [dup, setDup] = useState<{ aberta: boolean; codigo: string }>({ aberta: false, codigo: '' });
  const ultima = det.data?.versoes[0];
  useEffect(() => {
    if (!det.data || !ultima) return;
    setF({ codigo: det.data.code, tipo: det.data.kind, categoriaCodigo: det.data.categoria.code, nome: det.data.name, descricao: det.data.description ?? '', texto: ultima.text, textoAlternativo: ultima.altText ?? '', campos: ultima.fields, regras: ultima.rules, exclusivo: ultima.exclusive, tiposPermitidos: ultima.allowedTypes, notaAlteracao: '' });
  }, [det.data, ultima]);
  useEffect(() => { if (novo && cats.data?.[0] && !f.categoriaCodigo) setF((x) => ({ ...x, categoriaCodigo: cats.data![0].code })); }, [novo, cats.data, f.categoriaCodigo]);
  const set = (p: Partial<Forma>) => setF((x) => ({ ...x, ...p }));
  const errosDef = useMemo(() => verificarDefinicaoPoder({ texto: f.texto, textoAlternativo: f.textoAlternativo || undefined, campos: f.campos }), [f.texto, f.textoAlternativo, f.campos]);
  const exemplo = useMemo(() => {
    try {
      const valores = Object.fromEntries(f.campos.map((c) => [c.chave, c.opcoes?.length ? (c.tipo === 'SELECCAO_MULTIPLA' ? c.opcoes.slice(0, 2).map((o) => o.valor) : c.opcoes[0].valor) : EXEMPLO[c.tipo]])) as never;
      const pessoa = { sexo: 'F' as const, nome: 'Exemplo' };
      return renderizarPoder({ instanciaId: 'x', valores, versao: { poderId: 'x', versaoId: 'x', numeroVersao: 1, codigo: f.codigo, nome: f.nome, categoria: '', texto: f.texto, campos: f.campos, regras: [] } }, { outorgante: pessoa, outorgantes: [pessoa], procuradores: [{ sexo: 'M', nome: 'X' }], procurador: { sexo: 'M' }, documento: {}, posto: {} });
    } catch (e) { return `Não é possível pré-visualizar: ${(e as Error).message}`; }
  }, [f]);
  const conteudo = { texto: f.texto, textoAlternativo: f.textoAlternativo || null, campos: f.campos, regras: f.regras, exclusivo: f.exclusivo, tiposPermitidos: f.tiposPermitidos, notaAlteracao: f.notaAlteracao || undefined };
  async function guardar(publicar = false) {
    setAG(true); setErroSrv([]);
    try {
      let pid = id;
      if (novo) { const r = await api<{ id: string }>('/powers', { body: { ...conteudo, codigo: f.codigo, tipo: f.tipo, categoriaCodigo: f.categoriaCodigo, nome: f.nome, descricao: f.descricao || undefined } }); pid = r.id; }
      else {
        await api(`/powers/${id}`, { method: 'PUT', body: { nome: f.nome, descricao: f.descricao || null, categoriaCodigo: f.categoriaCodigo } });
        const alterado = !ultima || ultima.text !== f.texto || (ultima.altText ?? '') !== f.textoAlternativo || JSON.stringify(ultima.fields) !== JSON.stringify(f.campos) || JSON.stringify(ultima.rules) !== JSON.stringify(f.regras) || ultima.exclusive !== f.exclusivo || JSON.stringify(ultima.allowedTypes) !== JSON.stringify(f.tiposPermitidos);
        if (alterado) await api(`/powers/${id}/draft`, { method: 'PUT', body: conteudo });
      }
      if (publicar) { const r = await api<{ versao: number }>(`/powers/${pid}/publish`, { method: 'POST' }); toast(`Versão ${r.versao} publicada.`); } else toast('Rascunho guardado.');
      qc.invalidateQueries({ queryKey: ['poder', pid] }); qc.invalidateQueries({ queryKey: ['admin-poderes'] }); qc.invalidateQueries({ queryKey: ['catalogo'] });
      if (novo) router.replace(`/admin/poderes/${pid}`);
    } catch (e) { const m = mensagemErro(e); setErroSrv([m]); toast(m, true); } finally { setAG(false); }
  }
  async function alternarActivo() { try { await api(`/powers/${id}/${det.data!.active ? 'deactivate' : 'activate'}`, { method: 'POST' }); qc.invalidateQueries({ queryKey: ['poder', id] }); } catch (e) { toast(mensagemErro(e), true); } }
  async function duplicar() { try { const r = await api<{ id: string }>(`/powers/${id}/duplicate`, { body: { codigo: dup.codigo } }); router.push(`/admin/poderes/${r.id}`); } catch (e) { toast(mensagemErro(e), true); } }
  const actualizarCampo = (i: number, p: Partial<DefinicaoCampo>) => set({ campos: f.campos.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  if (!novo && !det.data) return <Casca migalhas={['Administração', 'Centro de Poderes']}><main className="conteudo"><Giro /></main></Casca>;
  const temRascunho = ultima?.status === 'RASCUNHO';
  const podeGravar = pode('power.manage');
  return (
    <Casca migalhas={['Administração', 'Centro de Poderes', novo ? 'Novo poder' : f.codigo]}>
      <main className="conteudo">
        <div className="cabecalho">
          <div><Link href="/admin/poderes" className="small">Centro de Poderes</Link><h1>{novo ? 'Novo poder' : f.nome}</h1>
            {!novo && det.data && <span className="muted">{det.data.code}, {det.data.categoria.name}, {det.data.active ? 'activo' : 'desactivado'}, usado {det.data.usageCount} vezes{temRascunho ? `. Rascunho da v${ultima!.versionNo} por publicar.` : ''}</span>}</div>
          {!novo && podeGravar && <><button className="btn fantasma" onClick={() => setDup({ aberta: true, codigo: `${f.codigo}-B` })}><Icone n="copiar" t={16} />Duplicar</button><button className="btn" onClick={alternarActivo}>{det.data?.active ? 'Desactivar' : 'Activar'}</button></>}
        </div>
        {erroSrv.length > 0 && <div className="aviso erro" role="alert">{erroSrv.join(' ')}</div>}
        <div style={{ display: 'flex', gap: 22, borderBottom: '1px solid var(--linha)' }} role="tablist">
          {([['conteudo', 'Conteúdo jurídico'], ['campos', `Campos (${f.campos.length})`], ['regras', `Regras (${f.regras.length})`], ...(novo ? [] : [['versoes', `Versões (${det.data?.versoes.length ?? 0})`]])] as [typeof aba, string][]).map(([k, r]) => (
            <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} style={{ height: 42, background: 'none', border: 0, borderBottom: `2px solid ${aba === k ? 'var(--carmim)' : 'transparent'}`, fontWeight: aba === k ? 600 : 400, cursor: 'pointer', color: aba === k ? 'var(--tinta)' : 'var(--mudo)' }}>{r}</button>
          ))}
        </div>
        <div className="grelha" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {aba === 'conteudo' && <>
              <div className="linha-form">
                <Campo rotulo="Código" obrigatorio ajuda="Estável entre versões. Ex.: BANC-010"><input className="entrada mono" disabled={!novo} value={f.codigo} onChange={(e) => set({ codigo: e.target.value.toUpperCase() })} /></Campo>
                <Campo rotulo="Categoria" obrigatorio><select className="entrada" value={f.categoriaCodigo} onChange={(e) => set({ categoriaCodigo: e.target.value })}>{cats.data?.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Campo>
                <Campo rotulo="Tipo" obrigatorio><select className="entrada" disabled={!novo} value={f.tipo} onChange={(e) => set({ tipo: e.target.value as 'PODER' })}><option value="PODER">Poder</option><option value="CLAUSULA">Cláusula final</option></select></Campo>
              </div>
              <Campo rotulo="Nome" obrigatorio><input className="entrada" value={f.nome} onChange={(e) => set({ nome: e.target.value })} /></Campo>
              <Campo rotulo="Descrição" opcional ajuda="Mostrada aos operadores no construtor."><input className="entrada" value={f.descricao} onChange={(e) => set({ descricao: e.target.value })} /></Campo>
              <Campo rotulo="Texto jurídico" obrigatorio ajuda={<>Variáveis entre chavetas duplas, ex.: {'{{banco}}'}. Concordância: {'{{flex outorgantes "o outorgante" "a outorgante" "os outorgantes" "as outorgantes"}}'}</>}>
                <textarea className="entrada mono" style={{ minHeight: 150 }} value={f.texto} onChange={(e) => set({ texto: e.target.value })} aria-invalid={errosDef.length > 0} />
              </Campo>
              <Campo rotulo="Texto alternativo" opcional ajuda="Redacção alternativa aprovada, escolhida pelo operador na configuração."><textarea className="entrada mono" value={f.textoAlternativo} onChange={(e) => set({ textoAlternativo: e.target.value })} /></Campo>
              {!novo && <Campo rotulo="Nota da alteração" opcional ajuda="Fica registada na versão (ex.: motivo da revisão jurídica)."><input className="entrada" value={f.notaAlteracao} onChange={(e) => set({ notaAlteracao: e.target.value })} /></Campo>}
            </>}
            {aba === 'campos' && <>
              {f.campos.map((c, i) => (
                <div key={i} className="cartao"><div className="corpo">
                  <div className="linha-form">
                    <Campo rotulo="Variável" obrigatorio><input className="entrada mono" value={c.chave} onChange={(e) => actualizarCampo(i, { chave: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></Campo>
                    <Campo rotulo="Rótulo" obrigatorio><input className="entrada" value={c.rotulo} onChange={(e) => actualizarCampo(i, { rotulo: e.target.value })} /></Campo>
                    <Campo rotulo="Tipo" obrigatorio><select className="entrada" value={c.tipo} onChange={(e) => actualizarCampo(i, { tipo: e.target.value as DefinicaoCampo['tipo'] })}>{TIPOS_CAMPO.map((t) => <option key={t} value={t}>{ROT_TIPO[t]}</option>)}</select></Campo>
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={c.obrigatorio} onChange={(e) => actualizarCampo(i, { obrigatorio: e.target.checked })} />Obrigatório</label>
                    {c.tipo === 'MOEDA' && <select className="entrada" style={{ width: 120 }} aria-label="Moeda" value={c.moeda ?? 'AOA'} onChange={(e) => actualizarCampo(i, { moeda: e.target.value })}><option>AOA</option><option>EUR</option><option>USD</option></select>}
                    {['NIF', 'NUM_IDENTIFICACAO'].includes(c.tipo) && <select className="entrada" style={{ width: 160 }} aria-label="País" value={c.validacao?.pais ?? ''} onChange={(e) => actualizarCampo(i, { validacao: { ...c.validacao, pais: (e.target.value || undefined) as 'AO' } })}><option value="">Qualquer país</option><option value="AO">Angola</option><option value="PT">Portugal</option></select>}
                    <span style={{ flex: 1 }} />
                    <button className="btn icone" aria-label="Subir" disabled={i === 0} onClick={() => { const a = [...f.campos]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ campos: a }); }}><Icone n="cima" t={15} /></button>
                    <button className="btn icone" aria-label="Remover campo" onClick={() => set({ campos: f.campos.filter((_, j) => j !== i) })}><Icone n="lixo" t={15} /></button>
                  </div>
                  {['LISTA', 'RADIO', 'SELECCAO_MULTIPLA'].includes(c.tipo) && (
                    <Campo rotulo="Opções" ajuda="Uma por linha, no formato valor|texto inserido no documento">
                      <textarea className="entrada mono" value={(c.opcoes ?? []).map((o) => `${o.valor}|${o.rotulo}`).join('\n')} onChange={(e) => actualizarCampo(i, { opcoes: e.target.value.split('\n').filter(Boolean).map((l) => { const [v, ...r] = l.split('|'); return { valor: v.trim(), rotulo: (r.join('|') || v).trim() }; }) })} />
                    </Campo>
                  )}
                </div></div>
              ))}
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => set({ campos: [...f.campos, { chave: `campo_${f.campos.length + 1}`, rotulo: 'Novo campo', tipo: 'TEXTO', obrigatorio: true }] })}><Icone n="mais" t={16} />Acrescentar campo</button>
            </>}
            {aba === 'regras' && <>
              <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={f.exclusivo} onChange={(e) => set({ exclusivo: e.target.checked })} />Exclusivo: não pode ser combinado com outros poderes</label>
              <fieldset className="campo" style={{ border: 0, padding: 0 }}><legend style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Disponível nos tipos de procuração</legend>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{tipos.data?.map((t) => { const on = f.tiposPermitidos.includes(t.codigo); return <button key={t.codigo} type="button" className="pilula" aria-pressed={on} onClick={() => set({ tiposPermitidos: on ? f.tiposPermitidos.filter((x) => x !== t.codigo) : [...f.tiposPermitidos, t.codigo] })}>{t.nome}</button>; })}</div>
                <span className="small muted">Sem nenhum seleccionado, fica disponível em todos.</span></fieldset>
              {f.regras.map((rg, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="entrada" style={{ width: 170 }} aria-label="Tipo de regra" value={rg.tipo} onChange={(e) => set({ regras: f.regras.map((x, j) => (j === i ? { ...x, tipo: e.target.value as RegraPoder['tipo'] } : x)) })}><option value="REQUER">Exige</option><option value="INCOMPATIVEL">Incompatível com</option><option value="SUGERE">Sugere</option></select>
                  <select className="entrada" aria-label="Poder alvo" value={rg.alvoCodigo} onChange={(e) => set({ regras: f.regras.map((x, j) => (j === i ? { ...x, alvoCodigo: e.target.value } : x)) })}><option value="">Escolher poder…</option>{catalogo.data?.filter((p) => p.codigo !== f.codigo).map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo}: {p.nome}</option>)}</select>
                  <button className="btn icone" aria-label="Remover regra" onClick={() => set({ regras: f.regras.filter((_, j) => j !== i) })}><Icone n="lixo" t={15} /></button>
                </div>
              ))}
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => set({ regras: [...f.regras, { tipo: 'SUGERE', alvoCodigo: '' }] })}><Icone n="mais" t={16} />Acrescentar regra</button>
              <p className="small muted" style={{ margin: 0 }}>As sugestões do construtor vêm só destas relações. Nenhum poder é sugerido por inferência automática.</p>
            </>}
            {aba === 'versoes' && det.data && (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {det.data.versoes.map((v) => (
                  <li key={v.id} className="cartao"><div className="corpo" style={{ gap: 6 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><b>Versão {v.versionNo}</b><span className={`estado ${v.status === 'PUBLICADA' ? 'EMITIDA' : v.status === 'RASCUNHO' ? 'EM_REVISAO' : 'ARQUIVADA'}`}>{v.status === 'PUBLICADA' ? 'Publicada' : v.status === 'RASCUNHO' ? 'Rascunho' : 'Retirada'}</span><span className="small muted">{v.publishedAt ? `publicada ${dataHoraPT(v.publishedAt)}` : `criada ${dataHoraPT(v.createdAt)}`}</span></div>
                    {v.changeNote && <span className="small">{v.changeNote}</span>}
                    <p className="texto-juridico" style={{ fontSize: 12.5, fontFamily: 'var(--mono)' }}>{v.text}</p>
                  </div></li>
                ))}
              </ol>
            )}
          </div>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 80 }}>
            <section className="cartao"><div className="corpo">
              <h3>Pré-visualização com dados de exemplo</h3>
              <p className="texto-juridico" style={{ fontSize: 13 }}>{exemplo}</p>
              {errosDef.length ? <div className="aviso erro" style={{ flexDirection: 'column', gap: 4 }}>{errosDef.map((e) => <span key={e}>{e}</span>)}</div> : <span className="small" style={{ color: 'var(--verde)', display: 'flex', gap: 6 }}><Icone n="certo" t={14} traco={2.2} />Variáveis e campos coerentes</span>}
            </div></section>
            {podeGravar && <section className="cartao"><div className="corpo">
              <p className="small muted" style={{ margin: 0 }}>{novo ? 'O poder nasce como rascunho v1.' : `Publicar ${temRascunho ? `a v${ultima!.versionNo}` : 'as alterações como nova versão'} retira a versão actual para novas procurações. As emitidas não mudam.`}</p>
              <button className="btn" disabled={aGuardar || errosDef.length > 0} onClick={() => guardar(false)}>Guardar rascunho</button>
              {pode('power.publish') && <button className="btn primario" disabled={aGuardar || errosDef.length > 0 || f.regras.some((r) => !r.alvoCodigo)} onClick={() => guardar(true)}><Icone n="certo" t={16} />Guardar e publicar</button>}
            </div></section>}
          </aside>
        </div>
        <Modal titulo="Duplicar poder" aberta={dup.aberta} fechar={() => setDup((x) => ({ ...x, aberta: false }))} rodape={<><button className="btn fantasma" onClick={() => setDup((x) => ({ ...x, aberta: false }))}>Cancelar</button><button className="btn primario" onClick={duplicar}>Duplicar</button></>}>
          <Campo rotulo="Código do novo poder" obrigatorio><input className="entrada mono" value={dup.codigo} onChange={(e) => setDup((x) => ({ ...x, codigo: e.target.value.toUpperCase() }))} /></Campo>
        </Modal>
      </main>
    </Casca>
  );
}
