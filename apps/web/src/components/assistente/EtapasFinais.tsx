'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, descarregar } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bytes, dataHoraPT, dataPT } from '@/lib/formato';
import { DetalheProcuracao, ESTADOS, Verificacao } from '@/lib/tipos';
import { Icone } from '../Icone';
import { Campo, EstadoBadge, Gaveta, Giro, Modal, Vazio, mensagemErro, useToast } from '../ui';
import type { Rascunho } from './rascunho';
import { ETAPAS } from './Etapas';

const ETAPA_DE: Record<string, number> = { outorgante: 2, procurador: 3, documentos: 2, actuacao: 3, poderes: 4, regras: 5, data: 1, oficiante: 1 };

export function EtapaRevisao({ id, det, v, oficiante }: { id: string; det: DetalheProcuracao; v?: Verificacao; oficiante?: string }) {
  if (!v) return <Giro />;
  const erros = v.problemas.filter((p) => p.severidade === 'ERRO'); const avisos = v.problemas.filter((p) => p.severidade === 'AVISO');
  const poderes = det.poderes.filter((p) => !p.clausula); const clausulas = det.poderes.filter((p) => p.clausula);
  return (
    <div className="grelha" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <section className="cartao"><div className="corpo">
        <h2>{v.pronta ? 'Pronta para submeter' : 'Falta resolver'}</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {v.checklist.map((c) => (
            <li key={c.chave} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: c.ok ? 'var(--verde-suave)' : 'var(--carmim-suave)' }}><Icone n={c.ok ? 'certo' : 'x'} t={12} traco={2.6} cor={c.ok ? 'var(--verde)' : 'var(--carmim)'} /></span>
              <span style={{ flex: 1 }}>{c.rotulo}{c.detalhe && <span className="small muted"><br />{c.detalhe}</span>}</span>
              {!c.ok && ETAPA_DE[c.chave] && <Link className="small" href={ETAPA_DE[c.chave] === 1 ? `/procuracoes/${id}?etapa=2` : `/procuracoes/${id}?etapa=${ETAPA_DE[c.chave]}`}>Corrigir em {ETAPAS[ETAPA_DE[c.chave] - 1]}</Link>}
            </li>
          ))}
        </ul>
        {erros.length > 0 && <div className="aviso erro" style={{ flexDirection: 'column', gap: 4 }}>{erros.map((e, i) => <span key={i}>{e.mensagem}</span>)}</div>}
        {avisos.length > 0 && <div className="aviso atencao" style={{ flexDirection: 'column', gap: 4 }}>{avisos.map((e, i) => <span key={i}>{e.mensagem}</span>)}</div>}
      </div></section>
      <section className="cartao"><div className="corpo">
        <h2>Resumo</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px 12px', margin: 0, fontSize: 13.5 }}>
          <dt className="muted">Tipo</dt><dd style={{ margin: 0 }}>{det.tipo.nome}</dd>
          <dt className="muted">Data e local</dt><dd style={{ margin: 0 }}>{dataPT(det.dataActo)}, {det.local}</dd>
          <dt className="muted">Oficiante</dt><dd style={{ margin: 0 }}>{oficiante ?? '—'}</dd>
          <dt className="muted">Outorgante(s)</dt><dd style={{ margin: 0 }}>{det.outorgantes.map((o) => o.nome).join(', ') || '—'}</dd>
          <dt className="muted">Procurador(es)</dt><dd style={{ margin: 0 }}>{det.procuradores.map((o) => o.nome).join(', ') || '—'}{det.procuradores.length > 1 && <span className="muted"> ({det.formaActuacao.toLowerCase().replace(/_/g, ' ')})</span>}</dd>
          <dt className="muted">Poderes</dt><dd style={{ margin: 0 }}><ol style={{ margin: 0, paddingLeft: 18 }}>{poderes.map((p) => <li key={p.instanciaId}>{p.nome}</li>)}</ol></dd>
          <dt className="muted">Cláusulas</dt><dd style={{ margin: 0 }}>{clausulas.map((p) => p.nome).join('; ') || 'Nenhuma'}</dd>
        </dl>
      </div></section>
    </div>
  );
}

/** Pré-visualização: HTML gerado pelo mesmo motor do PDF, num iframe sem scripts (sandbox) e com CSP no servidor. */
interface Blocos { blocos: { indice: number; tipo: string; original: string }[]; ajustes: { indice: number; original: string; texto: string }[]; desactualizados: number }

/** Pré-visualização + edição do texto completo (ajustes manuais guardados na procuração). */
export function EtapaPrevia({ id, versao, editavel, actualizar }: { id: string; versao: number; editavel?: boolean; actualizar?: (fn: (x: Rascunho) => Rascunho) => void }) {
  const [html, setHtml] = useState<string | null>(null); const [erro, setErro] = useState(''); const toast = useToast();
  const [ed, setEd] = useState<{ aberto: boolean; dados: Blocos | null; textos: Record<number, string> }>({ aberto: false, dados: null, textos: {} });
  useEffect(() => { setHtml(null); setErro(''); api<string>(`/poas/${id}/preview.html`).then(setHtml).catch((e) => setErro(mensagemErro(e))); }, [id, versao]);
  async function abrirEditor() {
    try {
      const d = await api<Blocos>(`/poas/${id}/blocos`);
      setEd({ aberto: true, dados: d, textos: Object.fromEntries(d.blocos.map((b) => [b.indice, d.ajustes.find((a) => a.indice === b.indice)?.texto ?? b.original])) });
      if (d.desactualizados) toast(`${d.desactualizados} ajuste(s) anterior(es) deixaram de se aplicar porque o texto gerado mudou.`, true);
    } catch (e) { toast(mensagemErro(e), true); }
  }
  function guardar() {
    if (!ed.dados || !actualizar) return;
    const ajustes = ed.dados.blocos.filter((b) => (ed.textos[b.indice] ?? b.original).trim() !== b.original.trim()).map((b) => ({ indice: b.indice, original: b.original, texto: ed.textos[b.indice] }));
    actualizar((x) => ({ ...x, ajustesTexto: ajustes }));
    setEd({ aberto: false, dados: null, textos: {} });
    toast(ajustes.length ? `${ajustes.length} parágrafo(s) ajustado(s). A pré-visualização actualiza-se em instantes.` : 'Sem ajustes: o documento usa o texto gerado.');
  }
  return (
    <div className="previa">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="small muted">A pré-visualização mostra o texto final. A paginação exacta está no PDF.</span>
        <button className="btn pequeno" onClick={() => descarregar(`/poas/${id}/preview.pdf`, 'pre-visualizacao.pdf', true).catch((e) => toast(mensagemErro(e), true))}><Icone n="olho" t={15} />Abrir PDF de rascunho</button>
        {editavel && actualizar && <button className="btn pequeno primario" onClick={abrirEditor}><Icone n="lapis" t={15} />Editar o texto</button>}
      </div>
      {erro ? <div className="aviso erro">{erro}</div> : html === null ? <Giro /> : <iframe title="Pré-visualização da procuração" sandbox="" srcDoc={html} />}
      <Gaveta titulo="Editar o texto da procuração" aberta={ed.aberto} fechar={() => setEd({ aberto: false, dados: null, textos: {} })}
        rodape={<><button className="btn fantasma" onClick={() => setEd({ aberto: false, dados: null, textos: {} })}>Cancelar</button><button className="btn primario" onClick={guardar}>Aplicar ajustes</button></>}>
        <div className="aviso info small">Pode alterar qualquer parágrafo. Use <b>**texto**</b> para negrito. Os ajustes ficam nesta procuração e passam ao documento emitido. Se depois mudar pessoas ou poderes, o parágrafo afectado volta ao texto gerado (para não emitir dados desactualizados).</div>
        {ed.dados?.blocos.map((b) => {
          const mudou = (ed.textos[b.indice] ?? b.original).trim() !== b.original.trim();
          return (
            <div key={b.indice} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <b style={{ fontWeight: 600 }}>{b.tipo === 'titulo' ? 'Título' : b.tipo === 'alinea' ? 'Alínea' : `Parágrafo ${b.indice}`}</b>
                {mudou && <><span style={{ color: 'var(--ambar)', fontWeight: 600 }}>ajustado</span><button className="btn pequeno fantasma" onClick={() => setEd((x) => ({ ...x, textos: { ...x.textos, [b.indice]: b.original } }))}>Repor original</button></>}
              </span>
              <textarea className="entrada" style={{ minHeight: Math.min(320, 60 + b.original.length / 3), fontFamily: 'var(--serif)', fontSize: 13.5, lineHeight: 1.6, borderColor: mudou ? 'var(--ambar)' : undefined }}
                value={ed.textos[b.indice] ?? b.original} onChange={(e) => setEd((x) => ({ ...x, textos: { ...x.textos, [b.indice]: e.target.value } }))} />
            </div>
          );
        })}
      </Gaveta>
    </div>
  );
}

const ROTULO_ACCAO: Record<string, { rotulo: string; classe: string; motivo?: boolean; texto: string }> = {
  SUBMETER: { rotulo: 'Submeter para revisão', classe: 'primario', texto: 'A procuração fica bloqueada para edição e segue para validação por outro utilizador.' },
  VALIDAR: { rotulo: 'Validar', classe: 'primario', texto: 'Confirma que o conteúdo foi revisto. Depois de validada pode ser emitida.' },
  EMITIR: { rotulo: 'Emitir procuração', classe: 'primario', texto: 'Atribui o número definitivo e gera o PDF e o DOCX. A partir daqui o conteúdo não pode ser alterado.' },
  EMITIR_DIRECTO: { rotulo: 'Emitir directamente', classe: 'primario', texto: 'Emite já, sem revisão por outro utilizador (o seu perfil permite-o). Atribui o número definitivo e gera o PDF e o DOCX. A emissão fica registada em seu nome na auditoria. Depois de emitida, pode corrigir com «Corrigir e reemitir».' },
  DEVOLVER: { rotulo: 'Devolver para correcção', classe: '', motivo: true, texto: 'Volta a rascunho para o autor corrigir. Indique o que deve ser corrigido.' },
  CANCELAR: { rotulo: 'Cancelar procuração', classe: '', motivo: true, texto: 'O cancelamento fica registado no histórico e na auditoria. A procuração não é apagada.' },
  ARQUIVAR: { rotulo: 'Arquivar', classe: '', texto: 'Passa ao arquivo. Continua disponível para consulta.' },
};

export function EtapaEmissao({ id, det, v, aoMudar }: { id: string; det: DetalheProcuracao; v?: Verificacao; aoMudar: () => void }) {
  const [conf, setConf] = useState<string | null>(null); const [motivo, setMotivo] = useState(''); const [aExecutar, setA] = useState(false);
  const toast = useToast(); const qc = useQueryClient();
  // Com emissão directa disponível, aparece primeiro; submeter/validar continuam possíveis
  const accoes = (v?.accoes ?? []).filter((a) => a !== 'REGISTAR_ASSINATURA').sort((a, b) => (a === 'EMITIR_DIRECTO' ? -1 : b === 'EMITIR_DIRECTO' ? 1 : 0));
  async function executar() {
    if (!conf) return; setA(true);
    try {
      const r = await api<{ numero?: string }>(`/poas/${id}/transitions`, { body: { accao: conf, motivo: motivo || undefined } });
      toast(conf === 'EMITIR' || conf === 'EMITIR_DIRECTO' ? `Procuração emitida com o número ${r.numero}.` : `${ROTULO_ACCAO[conf].rotulo}: concluído.`);
      setConf(null); setMotivo(''); qc.invalidateQueries({ queryKey: ['poas'] }); aoMudar();
    } catch (e) { toast(mensagemErro(e), true); } finally { setA(false); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
      <section className="cartao"><div className="corpo">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><h2 style={{ flex: 1 }}>Estado actual</h2><EstadoBadge e={det.estado} /></div>
        {det.numero && <p style={{ margin: 0 }}>Número <b className="mono" style={{ fontSize: 15 }}>{det.numero}</b>{det.codigoVerificacao && <span className="muted">, código de verificação {det.codigoVerificacao.slice(0, 4)}-{det.codigoVerificacao.slice(4)}</span>}</p>}
        {det.estado === 'RASCUNHO' && v && !v.pronta && <div className="aviso atencao">Há pendências na revisão. <Link href={`/procuracoes/${id}?etapa=7`}>Ver revisão</Link></div>}
        {accoes.length === 0 ? <p className="muted" style={{ margin: 0 }}>Não há acções disponíveis para o seu perfil neste estado.</p> : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {accoes.map((a) => <button key={a} className={`btn ${a === 'EMITIR_DIRECTO' || accoes[0] === a ? ROTULO_ACCAO[a]?.classe ?? '' : ''}`} onClick={() => setConf(a)} disabled={(a === 'SUBMETER' || a === 'EMITIR_DIRECTO') && !!v && !v.pronta}>{ROTULO_ACCAO[a]?.rotulo ?? a}</button>)}
          </div>
        )}
      </div></section>
      <Modal titulo={conf ? ROTULO_ACCAO[conf].rotulo : ''} aberta={!!conf} fechar={() => setConf(null)}
        rodape={<><button className="btn fantasma" onClick={() => setConf(null)}>Voltar</button><button className={`btn ${conf === 'CANCELAR' ? 'escuro' : 'primario'}`} disabled={aExecutar || (!!conf && !!ROTULO_ACCAO[conf].motivo && motivo.trim().length < 3)} onClick={executar}>{aExecutar ? (conf?.startsWith('EMITIR') ? 'A gerar o documento…' : 'A processar…') : conf ? ROTULO_ACCAO[conf].rotulo : ''}</button></>}>
        {conf && <p style={{ margin: 0 }}>{ROTULO_ACCAO[conf].texto}</p>}
        {conf && ROTULO_ACCAO[conf].motivo && <Campo rotulo="Motivo" obrigatorio><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>}
      </Modal>
    </div>
  );
}

export function EtapaArquivo({ id, det, aoMudar }: { id: string; det: DetalheProcuracao; aoMudar: () => void }) {
  const { pode } = useAuth(); const toast = useToast(); const [aCarregar, setA] = useState(false);
  const [aBaixar, setAB] = useState<string | null>(null);
  const [rect, setRect] = useState({ aberta: false, motivo: '' });
  // Sem acentos nem espaços, para funcionar em qualquer sistema (Windows, email, pen)
  const nomeFicheiro = (t: string) => `Procuracao_${det.numero}_${(det.outorgantes[0]?.nome ?? 'outorgante').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9-]+/g, '_')}${t === 'assinada' ? '_assinada' : ''}.${t === 'docx' ? 'docx' : 'pdf'}`;
  async function baixar(t: string) {
    setAB(t);
    try { await descarregar(`/poas/${id}/ficheiro/${t}`, nomeFicheiro(t)); } catch (e) { toast(mensagemErro(e), true); } finally { setAB(null); }
  }
  async function rectificar() {
    try { const r = await api<{ id: string; existente: boolean }>(`/poas/${id}/rectificar`, { body: { motivo: rect.motivo } }); toast(r.existente ? 'Já existe uma correcção em curso: a abrir.' : 'Rascunho de correcção criado. Ajuste e emita: ficará com o mesmo número e o sufixo -R1.'); window.location.href = `/procuracoes/${r.id}?etapa=2`; }
    catch (e) { toast(mensagemErro(e), true); }
  }
  async function carregarAssinada(f: File) {
    const fd = new FormData(); fd.append('ficheiro', f); setA(true);
    try { await api(`/poas/${id}/signed-scan`, { form: fd }); toast('Digitalização registada. Procuração assinada.'); aoMudar(); } catch (e) { toast(mensagemErro(e), true); } finally { setA(false); }
  }
  async function duplicar() {
    try { const r = await api<{ id: string; descartados: string[] }>(`/poas/${id}/duplicate`, { method: 'POST' }); toast(r.descartados.length ? `Duplicada. Não copiados: ${r.descartados.join(', ')}` : 'Duplicada como novo rascunho.'); window.location.href = `/procuracoes/${r.id}?etapa=2`; }
    catch (e) { toast(mensagemErro(e), true); }
  }
  return (
    <div className="grelha" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <section className="cartao"><div className="corpo">
        <h2>Documentos</h2>
        {det.rectificadaPor && <div className="aviso atencao">Esta procuração foi corrigida: <a href={`/procuracoes/${det.rectificadaPor.id}`}>{det.rectificadaPor.numero ?? 'rectificação em curso'}</a>.</div>}
        {!det.numero ? <Vazio>Os documentos ficam disponíveis depois da emissão.</Vazio> : (
          <>
            {([['pdf', 'PDF da procuração', 'O documento oficial emitido.'], ['docx', 'Word (DOCX)', 'Cópia editável do mesmo texto.'], ...(det.documentos.some((d) => d.tipo === 'DIGITALIZACAO_ASSINADA') ? [['assinada', 'Digitalização assinada', 'Versão assinada e digitalizada.']] : [])] as [string, string, string][]).map(([t, rot, desc]) => (
              <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--linha)' }}>
                <Icone n="doc" />
                <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{rot}</b><br /><span className="small muted">{desc}</span></span>
                {pode('document.download') && <button className="btn pequeno" disabled={aBaixar === t} onClick={() => baixar(t)}><Icone n="descarregar" t={15} />{aBaixar === t ? 'A preparar…' : 'Descarregar'}</button>}
              </div>
            ))}
            <span className="small muted">O nome do ficheiro inclui o número e o outorgante: <span className="mono">{nomeFicheiro('pdf')}</span></span>
          </>
        )}
        {(det.estado === 'EMITIDA' || det.estado === 'ASSINADA') && pode('poa.issue') && (
          <label className="btn" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
            <Icone n="carregar" t={16} />{aCarregar ? 'A carregar…' : det.estado === 'ASSINADA' ? 'Substituir digitalização assinada (PDF)' : 'Carregar versão assinada (PDF)'}
            <input type="file" accept="application/pdf" className="sr" onChange={(e) => e.target.files?.[0] && carregarAssinada(e.target.files[0])} />
          </label>
        )}
        {['EMITIDA', 'ASSINADA', 'ARQUIVADA'].includes(det.estado) && !det.rectificadaPor && pode('poa.create') && (
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setRect({ aberta: true, motivo: '' })}><Icone n="lapis" t={16} />Corrigir e reemitir</button>
        )}
        {det.contentHash && <p className="small muted" style={{ margin: 0 }}>Hash do conteúdo emitido: <span className="mono">{det.contentHash}</span></p>}
        {pode('poa.create') && <button className="btn fantasma" style={{ alignSelf: 'flex-start' }} onClick={duplicar}><Icone n="copiar" t={16} />Duplicar como novo rascunho</button>}
      </div></section>
      <Modal titulo="Corrigir e reemitir" aberta={rect.aberta} fechar={() => setRect({ aberta: false, motivo: '' })} rodape={<><button className="btn fantasma" onClick={() => setRect({ aberta: false, motivo: '' })}>Cancelar</button><button className="btn primario" disabled={rect.motivo.trim().length < 5} onClick={rectificar}>Criar correcção</button></>}>
        <p style={{ margin: 0 }}>É criado um rascunho igual a esta procuração, para corrigir. Ao emitir, fica com o número <b className="mono">{det.numero?.replace(/-R\d+$/, '')}-R…</b> e esta procuração é cancelada automaticamente («substituída pela rectificação»). O original fica guardado no arquivo e na auditoria.</p>
        <Campo rotulo="Motivo da correcção" obrigatorio><input className="entrada" value={rect.motivo} onChange={(e) => setRect({ ...rect, motivo: e.target.value })} placeholder="Ex.: erro no número do BI do procurador" autoFocus /></Campo>
      </Modal>
      <section className="cartao"><div className="corpo">
        <h2>Histórico</h2>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {det.historico.map((h) => (
            <li key={h.id} style={{ display: 'flex', gap: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--tinta)', marginTop: 6, flexShrink: 0 }} />
              <span><b style={{ fontWeight: 500 }}>{ESTADOS[h.toStatus]}</b> <span className="muted">por {h.actor}, {dataHoraPT(h.at)}</span>{h.reason && <><br /><span className="small">Motivo: {h.reason}</span></>}</span>
            </li>
          ))}
        </ol>
      </div></section>
    </div>
  );
}
