'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, descarregar } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { FormProvaVida, ValoresProvaVida, paraApi } from '@/components/provas/FormProvaVida';
import { Campo, Gaveta, Giro, Modal, mensagemErro, useToast } from '@/components/ui';

interface Det {
  id: string; numero: string | null; estado: 'RASCUNHO' | 'EMITIDA' | 'CANCELADA'; dataActo: string; oficianteId: string | null; lockVersion: number; motivoCancelamento: string | null;
  pessoaId: string; requerente: { id: string; nome: string }; modalidade: 'REFORMA' | 'SOBREVIVENCIA'; entidade: string;
  cartao: { tipo: string; numero: string } | null; falecido: { nome: string; sexo?: 'M' | 'F' | null; numero?: string | null } | null;
  dependentes: { pessoaId: string; nome: string; relacao: 'FILHO' | 'TUTELADO' | 'NETO' | 'OUTRO' }[];
  ajustesTexto: { indice: number; original: string; texto: string }[]; pendencias: string[]; renovadaDe: string | null;
}
const deDetalhe = (d: Det): ValoresProvaVida => ({
  pessoaId: d.pessoaId, pessoaNome: d.requerente.nome, dataActo: String(d.dataActo).slice(0, 10), oficianteId: d.oficianteId ?? '', modalidade: d.modalidade, entidade: d.entidade,
  cartao: d.cartao ?? { tipo: 'Cartão de Beneficiário do INSS', numero: '' }, falecido: { nome: d.falecido?.nome ?? '', sexo: d.falecido?.sexo ?? 'M', numero: d.falecido?.numero ?? '' },
  dependentes: d.dependentes.map((x) => ({ pessoaId: x.pessoaId, nome: x.nome, relacao: x.relacao })),
});

export default function ProvaVida({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { pode } = useAuth(); const qc = useQueryClient(); const toast = useToast(); const router = useRouter();
  const det = useQuery({ queryKey: ['declaracao', id], queryFn: () => api<Det>(`/declaracoes/${id}`) });
  const [v, setV] = useState<ValoresProvaVida | null>(null); const [alterado, setAlt] = useState(false);
  const [html, setHtml] = useState<string | null>(null); const [ocupado, setOc] = useState<string | null>(null);
  const [modal, setModal] = useState<'emitir' | 'cancelar' | 'apagar' | null>(null); const [motivo, setMotivo] = useState('');
  const [ed, setEd] = useState<{ aberto: boolean; blocos: { indice: number; tipo: string; original: string }[]; textos: Record<number, string> }>({ aberto: false, blocos: [], textos: {} });
  const d = det.data;
  const editavel = d?.estado === 'RASCUNHO' && pode('decl.create');
  useEffect(() => { if (d && !alterado) setV(deDetalhe(d)); }, [d, alterado]);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ['declaracao', id] }); api<string>(`/declaracoes/${id}/preview.html`).then(setHtml).catch(() => setHtml('')); };
  useEffect(() => { if (d) api<string>(`/declaracoes/${id}/preview.html`).then(setHtml).catch((e) => setHtml(`<p style="font-family:sans-serif;color:#8C1D18">${mensagemErro(e)}</p>`)); }, [id, d?.lockVersion]); // eslint-disable-line

  async function guardar(ajustesTexto?: Det['ajustesTexto']) {
    if (!v || !d) return;
    setOc('guardar');
    try { await api(`/declaracoes/${id}`, { method: 'PUT', body: { ...paraApi(v), lockVersion: d.lockVersion, ...(ajustesTexto ? { ajustesTexto } : {}) } }); setAlt(false); toast('Guardado.'); recarregar(); }
    catch (e) { toast(mensagemErro(e), true); } finally { setOc(null); }
  }
  async function accao(tipo: 'emitir' | 'cancelar' | 'apagar' | 'renovar') {
    setOc(tipo);
    try {
      if (tipo === 'emitir') { const r = await api<{ numero: string }>(`/declaracoes/${id}/emitir`, { method: 'POST' }); toast(`Declaração n.º ${r.numero} emitida.`); recarregar(); }
      if (tipo === 'cancelar') { await api(`/declaracoes/${id}/cancelar`, { body: { motivo } }); toast('Declaração cancelada.'); recarregar(); }
      if (tipo === 'apagar') { await api(`/declaracoes/${id}`, { method: 'DELETE', body: { motivo: motivo || 'rascunho' } }); toast('Apagada.'); router.push('/provas-de-vida'); }
      if (tipo === 'renovar') { const r = await api<{ id: string }>(`/declaracoes/${id}/renovar`, { method: 'POST' }); toast('Nova prova de vida criada com os mesmos dados e a data de hoje.'); router.push(`/provas-de-vida/${r.id}`); }
    } catch (e) { toast(mensagemErro(e), true); } finally { setOc(null); setModal(null); setMotivo(''); }
  }
  async function abrirEditor() {
    try { const b = await api<{ blocos: { indice: number; tipo: string; original: string }[]; ajustes: Det['ajustesTexto'] }>(`/declaracoes/${id}/blocos`); setEd({ aberto: true, blocos: b.blocos, textos: Object.fromEntries(b.blocos.map((x) => [x.indice, b.ajustes.find((a) => a.indice === x.indice)?.texto ?? x.original])) }); }
    catch (e) { toast(mensagemErro(e), true); }
  }
  const nomeFicheiro = (t: string) => `Prova_de_Vida_${(d?.numero ?? '').replace(/\//g, '-')}_${(d?.requerente.nome ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9-]+/g, '_')}.${t}`;

  if (!d || !v) return <Casca migalhas={['Provas de vida', '…']}><main className="conteudo"><Giro /></main></Casca>;
  return (
    <Casca migalhas={['Provas de vida', d.numero ?? 'Rascunho']}>
      <main className="conteudo">
        <div className="cabecalho">
          <div><h1>Prova de vida {d.numero ? <span className="mono">n.º {d.numero}</span> : ''}</h1>
            <span className="muted">{d.requerente.nome} · {d.modalidade === 'SOBREVIVENCIA' ? 'pensão de sobrevivência' : 'pensão de reforma'} · {d.entidade}</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {d.estado === 'EMITIDA' && pode('document.download') && <>
              <button className="btn primario" disabled={ocupado === 'pdf'} onClick={() => { setOc('pdf'); descarregar(`/declaracoes/${id}/ficheiro/pdf`, nomeFicheiro('pdf')).catch((e) => toast(mensagemErro(e), true)).finally(() => setOc(null)); }}><Icone n="descarregar" t={16} />PDF</button>
              <button className="btn" disabled={ocupado === 'docx'} onClick={() => { setOc('docx'); descarregar(`/declaracoes/${id}/ficheiro/docx`, nomeFicheiro('docx')).catch((e) => toast(mensagemErro(e), true)).finally(() => setOc(null)); }}><Icone n="descarregar" t={16} />Word</button>
            </>}
            {d.estado !== 'RASCUNHO' && pode('decl.create') && <button className="btn" onClick={() => accao('renovar')}><Icone n="copiar" t={16} />Renovar (nova com data de hoje)</button>}
            {d.estado === 'EMITIDA' && pode('decl.issue') && <button className="btn fantasma" onClick={() => setModal('cancelar')}>Cancelar</button>}
            {(d.estado === 'RASCUNHO' ? pode('decl.create') : pode('poa.purge')) && <button className="btn fantasma" onClick={() => setModal('apagar')}><Icone n="lixo" t={16} />Apagar</button>}
          </div>
        </div>
        {d.estado === 'CANCELADA' && <div className="aviso erro">Cancelada: {d.motivoCancelamento}</div>}
        <div className="grelha" style={{ gridTemplateColumns: 'minmax(360px, 520px) minmax(0, 1fr)', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FormProvaVida v={v} mudar={(x) => { setV(x); setAlt(true); }} editavel={!!editavel} aoMudarPessoa={recarregar} />
            {editavel && (
              <section className="cartao"><div className="corpo">
                {alterado && <div className="aviso atencao small">Há alterações por guardar.</div>}
                {!alterado && d.pendencias.length > 0 && <div className="aviso atencao" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}><b>Para emitir falta:</b>{d.pendencias.map((p) => <span key={p} className="small">• {p}</span>)}</div>}
                {!alterado && d.pendencias.length === 0 && <div className="aviso ok small">Tudo pronto para emitir.</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" disabled={!alterado || !!ocupado} onClick={() => guardar()}>{ocupado === 'guardar' ? 'A guardar…' : 'Guardar'}</button>
                  <button className="btn" disabled={alterado} onClick={abrirEditor}><Icone n="lapis" t={15} />Editar o texto</button>
                  {pode('decl.issue') && <button className="btn primario" disabled={alterado || d.pendencias.length > 0 || !!ocupado} onClick={() => setModal('emitir')}>Emitir</button>}
                </div>
                {!pode('decl.issue') && <span className="small muted">A emissão é feita por quem tem esse perfil (validador, emissor ou administrador).</span>}
              </div></section>
            )}
          </div>
          <div style={{ position: 'sticky', top: 80 }}>
            {html === null ? <Giro /> : <iframe title="Pré-visualização da prova de vida" sandbox="" srcDoc={html} style={{ width: '100%', height: 'calc(100vh - 150px)', border: 0, borderRadius: 12, background: '#E6E1D7' }} />}
          </div>
        </div>
        <Modal titulo={modal === 'emitir' ? 'Emitir prova de vida' : modal === 'cancelar' ? 'Cancelar declaração' : 'Apagar declaração'} aberta={!!modal} fechar={() => setModal(null)}
          rodape={<><button className="btn fantasma" onClick={() => setModal(null)}>Voltar</button><button className={`btn ${modal === 'emitir' ? 'primario' : 'perigo'}`} disabled={!!ocupado || (modal !== 'emitir' && d.estado !== 'RASCUNHO' && motivo.trim().length < 5)} onClick={() => accao(modal!)}>{ocupado ? 'A processar…' : modal === 'emitir' ? 'Emitir' : modal === 'cancelar' ? 'Cancelar declaração' : 'Apagar'}</button></>}>
          {modal === 'emitir' && <p style={{ margin: 0 }}>Atribui o número seguinte (ex.: <span className="mono">620/10.05/CGRAP/{new Date().getFullYear()}</span>) e gera o PDF. Depois de emitida, o conteúdo não muda; para o ano seguinte use «Renovar».</p>}
          {modal !== 'emitir' && d.estado !== 'RASCUNHO' && <Campo rotulo="Motivo" obrigatorio><input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>}
          {modal === 'apagar' && d.estado === 'RASCUNHO' && <p style={{ margin: 0 }}>O rascunho é apagado.</p>}
        </Modal>
        <Gaveta titulo="Editar o texto da declaração" aberta={ed.aberto} fechar={() => setEd({ aberto: false, blocos: [], textos: {} })}
          rodape={<><button className="btn fantasma" onClick={() => setEd({ aberto: false, blocos: [], textos: {} })}>Cancelar</button><button className="btn primario" onClick={() => { const aj = ed.blocos.filter((b) => (ed.textos[b.indice] ?? b.original).trim() !== b.original.trim()).map((b) => ({ indice: b.indice, original: b.original, texto: ed.textos[b.indice] })); setEd({ aberto: false, blocos: [], textos: {} }); guardar(aj); }}>Aplicar</button></>}>
          <div className="aviso info small">Use <b>**texto**</b> para negrito. Se depois mudar os dados, o parágrafo afectado volta ao texto gerado.</div>
          {ed.blocos.map((b) => <Campo key={b.indice} rotulo={b.tipo === 'titulo' ? 'Título' : `Parágrafo ${b.indice}`}><textarea className="entrada" style={{ minHeight: Math.min(320, 60 + b.original.length / 3), fontFamily: 'var(--serif)', fontSize: 13.5, lineHeight: 1.6 }} value={ed.textos[b.indice] ?? b.original} onChange={(e) => setEd((x) => ({ ...x, textos: { ...x.textos, [b.indice]: e.target.value } }))} /></Campo>)}
        </Gaveta>
      </main>
    </Casca>
  );
}
