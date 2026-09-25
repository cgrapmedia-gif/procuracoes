'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, descarregar } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bytes, dataHoraPT, dataPT } from '@/lib/formato';
import { DetalheProcuracao, ESTADOS, Verificacao } from '@/lib/tipos';
import { Icone } from '../Icone';
import { Campo, EstadoBadge, Giro, Modal, Vazio, mensagemErro, useToast } from '../ui';
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
export function EtapaPrevia({ id, versao }: { id: string; versao: number }) {
  const [html, setHtml] = useState<string | null>(null); const [erro, setErro] = useState(''); const toast = useToast();
  useEffect(() => { setHtml(null); setErro(''); api<string>(`/poas/${id}/preview.html`).then(setHtml).catch((e) => setErro(mensagemErro(e))); }, [id, versao]);
  return (
    <div className="previa">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="small muted">A pré-visualização mostra o texto final. A paginação exacta está no PDF.</span>
        <button className="btn pequeno" onClick={() => descarregar(`/poas/${id}/preview.pdf`, 'pre-visualizacao.pdf', true).catch((e) => toast(mensagemErro(e), true))}><Icone n="olho" t={15} />Abrir PDF de rascunho</button>
      </div>
      {erro ? <div className="aviso erro">{erro}</div> : html === null ? <Giro /> : <iframe title="Pré-visualização da procuração" sandbox="" srcDoc={html} />}
    </div>
  );
}

const ROTULO_ACCAO: Record<string, { rotulo: string; classe: string; motivo?: boolean; texto: string }> = {
  SUBMETER: { rotulo: 'Submeter para revisão', classe: 'primario', texto: 'A procuração fica bloqueada para edição e segue para validação por outro utilizador.' },
  VALIDAR: { rotulo: 'Validar', classe: 'primario', texto: 'Confirma que o conteúdo foi revisto. Depois de validada pode ser emitida.' },
  EMITIR: { rotulo: 'Emitir procuração', classe: 'primario', texto: 'Atribui o número definitivo e gera o PDF e o DOCX. A partir daqui o conteúdo não pode ser alterado.' },
  DEVOLVER: { rotulo: 'Devolver para correcção', classe: '', motivo: true, texto: 'Volta a rascunho para o autor corrigir. Indique o que deve ser corrigido.' },
  CANCELAR: { rotulo: 'Cancelar procuração', classe: '', motivo: true, texto: 'O cancelamento fica registado no histórico e na auditoria. A procuração não é apagada.' },
  ARQUIVAR: { rotulo: 'Arquivar', classe: '', texto: 'Passa ao arquivo. Continua disponível para consulta.' },
};

export function EtapaEmissao({ id, det, v, aoMudar }: { id: string; det: DetalheProcuracao; v?: Verificacao; aoMudar: () => void }) {
  const [conf, setConf] = useState<string | null>(null); const [motivo, setMotivo] = useState(''); const [aExecutar, setA] = useState(false);
  const toast = useToast(); const qc = useQueryClient();
  const accoes = (v?.accoes ?? []).filter((a) => a !== 'REGISTAR_ASSINATURA');
  async function executar() {
    if (!conf) return; setA(true);
    try {
      const r = await api<{ numero?: string }>(`/poas/${id}/transitions`, { body: { accao: conf, motivo: motivo || undefined } });
      toast(conf === 'EMITIR' ? `Procuração emitida com o número ${r.numero}.` : `${ROTULO_ACCAO[conf].rotulo}: concluído.`);
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
            {accoes.map((a) => <button key={a} className={`btn ${ROTULO_ACCAO[a]?.classe ?? ''}`} onClick={() => setConf(a)} disabled={a === 'SUBMETER' && !!v && !v.pronta}>{ROTULO_ACCAO[a]?.rotulo ?? a}</button>)}
          </div>
        )}
      </div></section>
      <Modal titulo={conf ? ROTULO_ACCAO[conf].rotulo : ''} aberta={!!conf} fechar={() => setConf(null)}
        rodape={<><button className="btn fantasma" onClick={() => setConf(null)}>Voltar</button><button className={`btn ${conf === 'CANCELAR' ? 'escuro' : 'primario'}`} disabled={aExecutar || (!!conf && !!ROTULO_ACCAO[conf].motivo && motivo.trim().length < 3)} onClick={executar}>{aExecutar ? 'A processar…' : conf ? ROTULO_ACCAO[conf].rotulo : ''}</button></>}>
        {conf && <p style={{ margin: 0 }}>{ROTULO_ACCAO[conf].texto}</p>}
        {conf && ROTULO_ACCAO[conf].motivo && <Campo rotulo="Motivo" obrigatorio><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>}
      </Modal>
    </div>
  );
}

export function EtapaArquivo({ id, det, aoMudar }: { id: string; det: DetalheProcuracao; aoMudar: () => void }) {
  const { pode } = useAuth(); const toast = useToast(); const [aCarregar, setA] = useState(false);
  const nomes = { PDF: 'PDF emitido', DOCX: 'DOCX editável', DIGITALIZACAO_ASSINADA: 'Digitalização assinada' };
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
        {det.documentos.length === 0 ? <Vazio>Os documentos são gerados na emissão.</Vazio> : det.documentos.map((d) => (
          <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--linha)' }}>
            <Icone n="doc" />
            <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{nomes[d.tipo]}</b><br /><span className="small muted">{bytes(d.tamanho)}, {dataHoraPT(d.criadoEm)}, SHA-256 {d.sha256.slice(0, 12)}…</span></span>
            {pode('document.download') && <button className="btn pequeno" onClick={() => descarregar(`/documents/${d.id}/download`, `${det.numero ?? 'procuracao'}.${d.tipo === 'DOCX' ? 'docx' : 'pdf'}`).catch((e) => toast(mensagemErro(e), true))}><Icone n="descarregar" t={15} />Descarregar</button>}
          </div>
        ))}
        {det.estado === 'EMITIDA' && pode('poa.issue') && (
          <label className="btn" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
            <Icone n="carregar" t={16} />{aCarregar ? 'A carregar…' : 'Carregar versão assinada (PDF)'}
            <input type="file" accept="application/pdf" className="sr" onChange={(e) => e.target.files?.[0] && carregarAssinada(e.target.files[0])} />
          </label>
        )}
        {det.contentHash && <p className="small muted" style={{ margin: 0 }}>Hash do conteúdo emitido: <span className="mono">{det.contentHash}</span></p>}
        {pode('poa.create') && <button className="btn fantasma" style={{ alignSelf: 'flex-start' }} onClick={duplicar}><Icone n="copiar" t={16} />Duplicar como novo rascunho</button>}
      </div></section>
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
