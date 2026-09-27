'use client';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlocoModelo, DadosProcuracao, DefinicaoModelo, Filete, construirDocumento, renderizarHtml } from '@proc/core/browser';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dataHoraPT } from '@/lib/formato';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { Campo, Giro, Modal, mensagemErro, useToast } from '@/components/ui';

interface Modelo { id: string; code: string; name: string; currentVersionId: string | null }
interface Versao { id: string; versionNo: number; status: string; definition: DefinicaoModelo; changeNote: string | null; publishedAt: string | null; createdAt: string }
interface Posto { nome: string; nomeCompleto: string; morada: string; cidade: string }
interface Oficiante { id: string; nome: string; cargo: string; activo: boolean }

const FONTES = [['Merriweather', 'Merriweather (modelo do posto)'], ['Times New Roman', 'Times New Roman'], ['Arial', 'Arial'], ['DejaVu Serif', 'DejaVu Serif']];
const VARIAVEIS = ['{{documento.dataExtenso}}', '{{documento.local}}', '{{posto.nome}}', '{{posto.nomeCompleto}}', '{{posto.morada}}', '{{oficiante.nome}}', '{{oficiante.cargo}}', '{{outorgantesIdentificacao}}', '{{procuradoresIdentificacao}}', '{{formaActuacao}}', '{{poderes}}', '{{clausulas}}', '{{upper …}}', '{{flex outorgantes "o" "a" "os" "as"}}', '**negrito**'];
const FILETE_OMISSAO: Filete = { activo: true, cor: '#E30613', espessuraPt: 1, larguraPct: 100 };

/** Dados fictícios para a pré-visualização em tempo real. */
function amostra(posto?: Posto, ofi?: Oficiante): DadosProcuracao {
  const pessoa = (id: string, nome: string, sexo: 'M' | 'F') => ({ id, nomeCompleto: nome, sexo, nacionalidade: 'angolana', estadoCivil: 'SOLTEIRO' as const, naturalidade: 'Município de Baía Farta, Província de Benguela', documento: { tipo: 'BI_AO', numero: '000000000LA000', dataEmissao: '2024-04-24', validade: '2034-04-23' }, morada: { linha: 'Rua de Exemplo, 66', codigoPostal: '4000-000', localidade: 'Porto', pais: 'Portugal' } });
  return {
    numero: 'PROC-0000-000000', dataActo: new Date().toISOString().slice(0, 10), local: posto?.cidade ?? 'Porto', tipoProcuracao: { codigo: 'BANCARIA', nome: 'Procuração Bancária' },
    posto: { nome: posto?.nome ?? 'Consulado Geral no Porto', nomeCompleto: posto?.nomeCompleto ?? 'Consulado Geral da República de Angola', morada: posto?.morada ?? 'Rua …' },
    oficiante: { nome: ofi?.nome ?? 'Nome do Oficiante', cargo: ofi?.cargo ?? 'Vice-cônsul' },
    outorgantes: [{ pessoa: pessoa('a', 'Maria Exemplo da Silva', 'F') }], procuradores: [pessoa('b', 'João Exemplo Santos', 'M')], formaActuacao: 'ISOLADAMENTE',
    poderes: [{ instanciaId: '1', valores: { banco: { id: 'x', nome: 'Banco de Exemplo, S.A.', sigla: 'BEX' } }, versao: { poderId: 'x', versaoId: 'x', numeroVersao: 1, codigo: 'EX', nome: 'Exemplo', categoria: '', texto: 'junto da instituição bancária {{banco}}, qualquer das suas dependências, podendo praticar todos os actos necessários e convenientes relativamente à sua conta bancária', campos: [{ chave: 'banco', rotulo: 'Banco', tipo: 'ENTIDADE', obrigatorio: true }], regras: [] } }],
    clausulas: [], demo: false,
  };
}

function Seccao({ titulo, children, aberta = false }: { titulo: string; children: ReactNode; aberta?: boolean }) {
  const [a, setA] = useState(aberta);
  return (
    <section className="cartao">
      <h3 style={{ margin: 0 }}><button onClick={() => setA(!a)} aria-expanded={a} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600 }}>{titulo}<Icone n={a ? 'baixo' : 'seta'} t={16} /></button></h3>
      {a && <div style={{ padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--linha)', paddingTop: 16 }}>{children}</div>}
    </section>
  );
}
const Num = ({ rotulo, valor, mudar, passo = 0.1, min = 0, max = 50, unidade }: { rotulo: string; valor: number | undefined; mudar: (v: number) => void; passo?: number; min?: number; max?: number; unidade: string }) => (
  <Campo rotulo={`${rotulo} (${unidade})`}><input className="entrada" type="number" step={passo} min={min} max={max} value={valor ?? ''} onChange={(e) => mudar(Number(e.target.value))} /></Campo>
);
function EditorFilete({ rotulo, f, mudar }: { rotulo: string; f?: Filete; mudar: (f: Filete) => void }) {
  const v = f ?? { ...FILETE_OMISSAO, activo: false };
  return (
    <fieldset style={{ border: '1px solid var(--linha)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 4px' }}>{rotulo}</legend>
      <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={v.activo} onChange={(e) => mudar({ ...v, activo: e.target.checked })} />Mostrar filete</label>
      {v.activo && <div className="linha-form">
        <Campo rotulo="Cor"><input className="entrada" type="color" value={v.cor} onChange={(e) => mudar({ ...v, cor: e.target.value })} style={{ padding: 4 }} /></Campo>
        <Num rotulo="Espessura" unidade="pt" valor={v.espessuraPt} passo={0.25} min={0.25} max={6} mudar={(x) => mudar({ ...v, espessuraPt: x })} />
        <Num rotulo="Largura" unidade="% da linha" valor={v.larguraPct} passo={5} min={5} max={100} mudar={(x) => mudar({ ...v, larguraPct: x })} />
      </div>}
    </fieldset>
  );
}
const lerPng = (f: File) => new Promise<string>((res, rej) => { if (f.type !== 'image/png') return rej(new Error('Use uma imagem PNG.')); const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Não foi possível ler a imagem')); r.readAsDataURL(f); });

export default function Modelos() {
  const { pode } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const lista = useQuery({ queryKey: ['templates'], queryFn: () => api<Modelo[]>('/templates') });
  const [sel, setSel] = useState<string | null>(null);
  const tpl = lista.data?.find((m) => m.id === (sel ?? lista.data?.[0]?.id));
  const versoes = useQuery({ queryKey: ['template-versions', tpl?.id], queryFn: () => api<Versao[]>(`/templates/${tpl!.id}/versions`), enabled: !!tpl });
  const posto = useQuery({ queryKey: ['organization'], queryFn: () => api<Posto>('/organization') });
  const oficiantes = useQuery({ queryKey: ['officers', 'todos'], queryFn: () => api<Oficiante[]>('/officers?todos=true') });
  const actual = versoes.data?.find((v) => v.id === tpl?.currentVersionId) ?? versoes.data?.[0];
  const [def, setDef] = useState<DefinicaoModelo | null>(null);
  const [nota, setNota] = useState(''); const [aGravar, setAG] = useState(false); const [erro, setErro] = useState('');
  useEffect(() => { if (actual) setDef(structuredClone(actual.definition)); }, [actual]);
  const alterado = !!def && !!actual && JSON.stringify(def) !== JSON.stringify(actual.definition);
  const editavel = pode('template.manage') && pode('template.publish');

  const previa = useMemo(() => {
    if (!def) return '';
    try {
      const html = renderizarHtml(construirDocumento(def, amostra(posto.data, oficiantes.data?.find((o) => o.activo)), { preVisualizacao: false }));
      return html.replace('<head>', '<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Pragati+Narrow:wght@400;700&display=swap"><style>body{background:#E6E1D7}.folha{zoom:0.72;margin:16px auto !important}</style>');
    } catch (e) { return `<p style="font-family:sans-serif;color:#8C1D18;padding:16px">Erro no modelo: ${(e as Error).message.replace(/</g, '&lt;')}</p>`; }
  }, [def, posto.data, oficiantes.data]);

  const up = (fn: (d: DefinicaoModelo) => void) => setDef((d) => { if (!d) return d; const n = structuredClone(d); fn(n); return n; });
  const bloco = (i: number, patch: Partial<BlocoModelo>) => up((d) => { d.blocos[i] = { ...d.blocos[i], ...patch } as BlocoModelo; });

  async function publicar() {
    if (!def || !tpl) return; setAG(true); setErro('');
    try {
      const v = await api<{ id: string }>(`/templates/${tpl.id}/versions`, { body: { definicao: def, nota: nota || 'Ajustes no editor de modelos' } });
      await api(`/templates/${tpl.id}/versions/${v.id}/publish`, { method: 'POST' });
      toast('Nova versão do modelo publicada. As próximas procurações já a usam.'); setNota('');
      await qc.invalidateQueries({ queryKey: ['templates'] }); await qc.invalidateQueries({ queryKey: ['template-versions', tpl.id] });
    } catch (e) { setErro(mensagemErro(e)); } finally { setAG(false); }
  }

  return (
    <Casca migalhas={['Administração', 'Modelos documentais']}>
      <main className="conteudo">
        <div className="cabecalho">
          <div><h1>Modelos documentais</h1><span className="muted">Tudo o que aparece no documento emitido: página, letra, espaçamentos, cabeçalho, filetes, textos, assinaturas e rodapé. As procurações já emitidas nunca mudam.</span></div>
          <div style={{ display: 'flex', gap: 8 }}>{lista.data?.map((m) => <button key={m.id} className="pilula" aria-pressed={tpl?.id === m.id} onClick={() => setSel(m.id)}>{m.name}</button>)}</div>
        </div>
        {!def ? <Giro /> : (
          <div className="grelha" style={{ gridTemplateColumns: 'minmax(360px, 520px) minmax(0, 1fr)', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!editavel && <div className="aviso info">Consulta: só administradores com permissão de modelos podem alterar.</div>}
              <fieldset disabled={!editavel} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Seccao titulo="Letra e espaçamentos" aberta>
                  <Campo rotulo="Tipo de letra"><select className="entrada" value={def.tipografia.fonte} onChange={(e) => up((d) => { d.tipografia.fonte = e.target.value; })}>{FONTES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
                  <div className="linha-form">
                    <Num rotulo="Tamanho do texto" unidade="pt" valor={def.tipografia.tamanho} passo={0.5} min={8} max={18} mudar={(v) => up((d) => { d.tipografia.tamanho = v; })} />
                    <Num rotulo="Tamanho do título" unidade="pt" valor={def.tipografia.tamanhoTitulo ?? def.tipografia.tamanho} passo={0.5} min={8} max={24} mudar={(v) => up((d) => { d.tipografia.tamanhoTitulo = v; })} />
                    <Num rotulo="Entrelinha" unidade="×" valor={def.tipografia.entrelinha} passo={0.05} min={1} max={3} mudar={(v) => up((d) => { d.tipografia.entrelinha = v; })} />
                    <Num rotulo="Espaço entre parágrafos" unidade="pt" valor={def.tipografia.espacoParagrafo ?? 6} passo={1} min={0} max={30} mudar={(v) => up((d) => { d.tipografia.espacoParagrafo = v; })} />
                    <Num rotulo="Espaço entre assinaturas" unidade="pt" valor={def.tipografia.espacoAssinaturas ?? 22} passo={2} min={0} max={80} mudar={(v) => up((d) => { d.tipografia.espacoAssinaturas = v; })} />
                  </div>
                </Seccao>
                <Seccao titulo="Página, moldura e traços">
                  <div className="linha-form">
                    {(['topo', 'fundo', 'esquerda', 'direita'] as const).map((k) => <Num key={k} rotulo={`Margem ${k}`} unidade="cm" valor={def.pagina.margens[k]} passo={0.05} min={0.3} max={6} mudar={(v) => up((d) => { d.pagina.margens[k] = v; })} />)}
                  </div>
                  <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={!!def.moldura?.activa} onChange={(e) => up((d) => { d.moldura = { activa: e.target.checked, espessura: d.moldura?.espessura ?? 1.5 }; })} />Moldura (linhas verticais à esquerda e à direita)</label>
                  {def.moldura?.activa && <Num rotulo="Espessura da moldura" unidade="pt" valor={def.moldura.espessura ?? 1.5} passo={0.25} min={0.25} max={6} mudar={(v) => up((d) => { d.moldura = { activa: true, espessura: v }; })} />}
                  <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={def.preenchimento.activo} onChange={(e) => up((d) => { d.preenchimento.activo = e.target.checked; })} />Traços a fechar os parágrafos</label>
                  <Campo rotulo="Carácter de preenchimento"><select className="entrada" value={def.preenchimento.caracter} onChange={(e) => up((d) => { d.preenchimento.caracter = e.target.value as '-'; })}><option value="-">Traço (-)</option><option value=".">Ponto (.)</option><option value="_">Sublinhado (_)</option></select></Campo>
                </Seccao>
                <Seccao titulo="Cabeçalho">
                  <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={!!def.cabecalho.logotipo} onChange={(e) => { if (!e.target.checked) up((d) => { d.cabecalho.logotipo = undefined; }); else if (actual?.definition.cabecalho.logotipo) up((d) => { d.cabecalho.logotipo = actual.definition.cabecalho.logotipo; }); }} />Mostrar insígnia</label>
                  <div className="linha-form">
                    <Num rotulo="Largura da insígnia" unidade="cm" valor={def.cabecalho.logotipoLarguraCm ?? 2} passo={0.05} min={0.5} max={6} mudar={(v) => up((d) => { d.cabecalho.logotipoLarguraCm = v; })} />
                    <Campo rotulo="Substituir imagem (PNG)"><input className="entrada" type="file" accept="image/png" onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { const u = await lerPng(f); up((d) => { d.cabecalho.logotipo = u; }); } catch (x) { toast(mensagemErro(x), true); } }} /></Campo>
                  </div>
                  {def.cabecalho.linhas.map((l, i) => (
                    <div key={i} className="linha-form" style={{ alignItems: 'end' }}>
                      <Campo rotulo={`Linha ${i + 1}`}><input className="entrada" value={l.texto} onChange={(e) => up((d) => { d.cabecalho.linhas[i].texto = e.target.value; })} /></Campo>
                      <Num rotulo="Tamanho" unidade="pt" valor={l.tamanho ?? def.tipografia.tamanho} passo={0.5} min={6} max={20} mudar={(v) => up((d) => { d.cabecalho.linhas[i].tamanho = v; })} />
                      <label style={{ display: 'flex', gap: 8, height: 42, alignItems: 'center' }}><input type="checkbox" checked={!!l.negrito} onChange={(e) => up((d) => { d.cabecalho.linhas[i].negrito = e.target.checked; })} />Negrito</label>
                    </div>
                  ))}
                  <EditorFilete rotulo="Filete do cabeçalho" f={def.cabecalho.filete} mudar={(f) => up((d) => { d.cabecalho.filete = f; })} />
                </Seccao>
                <Seccao titulo="Textos do documento">
                  <p className="small muted" style={{ margin: 0 }}>Variáveis disponíveis: {VARIAVEIS.map((v) => <code key={v} className="mono" style={{ marginRight: 6 }}>{v}</code>)}</p>
                  {def.blocos.map((b, i) => {
                    if (b.tipo === 'titulo') return <Campo key={i} rotulo="Título"><input className="entrada" value={b.texto} onChange={(e) => bloco(i, { texto: e.target.value })} /></Campo>;
                    if (b.tipo === 'paragrafo') return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <Campo rotulo={`Parágrafo ${i}`}><textarea className="entrada mono" style={{ minHeight: 70, fontSize: 12 }} value={b.texto} onChange={(e) => bloco(i, { texto: e.target.value })} /></Campo>
                        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                          <label style={{ display: 'flex', gap: 6 }}><input type="checkbox" checked={b.preencher ?? def.preenchimento.activo} onChange={(e) => bloco(i, { preencher: e.target.checked })} />fechar com traços</label>
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>alinhamento <select value={b.alinhamento ?? 'JUSTIFICADO'} onChange={(e) => bloco(i, { alinhamento: e.target.value as 'JUSTIFICADO' })}><option value="JUSTIFICADO">justificado</option><option value="ESQUERDA">à esquerda</option><option value="CENTRO">centrado</option></select></label>
                        </div>
                      </div>
                    );
                    if (b.tipo === 'poderes') return <div key={i} className="aviso info">Aqui entram os poderes em alíneas (modelo de lista).</div>;
                    if (b.tipo === 'assinaturas') return b.itens.map((it, j) => (
                      <div key={`${i}-${j}`} className="linha-form" style={{ alignItems: 'end' }}>
                        <Campo rotulo={`Assinatura ${j + 1}: rótulo`}><input className="entrada mono" value={it.rotulo} onChange={(e) => up((d) => { const bb = d.blocos[i]; if (bb.tipo === 'assinaturas') bb.itens[j].rotulo = e.target.value; })} /></Campo>
                        <Campo rotulo="Posição"><select className="entrada" value={it.alinhamento ?? 'CENTRO'} onChange={(e) => up((d) => { const bb = d.blocos[i]; if (bb.tipo === 'assinaturas') bb.itens[j].alinhamento = e.target.value as 'CENTRO'; })}><option value="ESQUERDA">à esquerda</option><option value="CENTRO">ao centro</option></select></Campo>
                      </div>
                    ));
                    return null;
                  })}
                </Seccao>
                <Seccao titulo="Rodapé e numeração">
                  {def.rodape.bloco ? <>
                    <Campo rotulo="Onde aparece"><select className="entrada" value={def.rodape.bloco.apenasUltimaPagina ? 'ultima' : 'todas'} onChange={(e) => up((d) => { d.rodape.bloco!.apenasUltimaPagina = e.target.value === 'ultima'; })}><option value="ultima">Só no fim do documento (última página)</option><option value="todas">Em todas as páginas</option></select></Campo>
                    <Campo rotulo="Contactos (uma linha por linha)"><textarea className="entrada" value={def.rodape.bloco.contactos.join('\n')} onChange={(e) => up((d) => { d.rodape.bloco!.contactos = e.target.value.split('\n'); })} /></Campo>
                    <div className="linha-form">
                      <Num rotulo="Tamanho dos contactos" unidade="pt" valor={def.rodape.bloco.tamanho ?? 6} passo={0.5} min={4} max={12} mudar={(v) => up((d) => { d.rodape.bloco!.tamanho = v; })} />
                      <Num rotulo="Altura dos logótipos" unidade="cm" valor={def.rodape.bloco.imagemAlturaCm ?? 1.05} passo={0.05} min={0.3} max={4} mudar={(v) => up((d) => { d.rodape.bloco!.imagemAlturaCm = v; })} />
                      <Campo rotulo="Cor da barra dos contactos"><input className="entrada" type="color" style={{ padding: 4 }} value={def.rodape.bloco.corBarra ?? '#E30613'} onChange={(e) => up((d) => { d.rodape.bloco!.corBarra = e.target.value; })} /></Campo>
                      <Num rotulo="Espaço reservado no fim" unidade="cm" valor={def.rodape.bloco.alturaReservadaCm ?? 2.9} passo={0.1} min={1} max={8} mudar={(v) => up((d) => { d.rodape.bloco!.alturaReservadaCm = v; })} />
                    </div>
                    <Campo rotulo="Substituir logótipos do rodapé (PNG)"><input className="entrada" type="file" accept="image/png" onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { const u = await lerPng(f); up((d) => { d.rodape.bloco!.imagem = u; }); } catch (x) { toast(mensagemErro(x), true); } }} /></Campo>
                    <EditorFilete rotulo="Filete do rodapé" f={def.rodape.bloco.filete} mudar={(f) => up((d) => { d.rodape.bloco!.filete = f; })} />
                  </> : <p className="muted small" style={{ margin: 0 }}>Este modelo não tem bloco de rodapé institucional.</p>}
                  <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={def.rodape.paginacao} onChange={(e) => up((d) => { d.rodape.paginacao = e.target.checked; })} />Numeração de páginas</label>
                  <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={!!def.rodape.texto} onChange={(e) => up((d) => { d.rodape.texto = e.target.checked ? '{{documento.numero}}' : ''; })} />Número da procuração e código de verificação no rodapé</label>
                </Seccao>
                <Seccao titulo="Poderes no texto">
                  <Campo rotulo="Forma"><select className="entrada" value={def.poderes.modo} onChange={(e) => up((d) => { d.poderes.modo = e.target.value as 'PROSA'; })}><option value="PROSA">Texto corrido</option><option value="LISTA">Alíneas (exige bloco de poderes no modelo)</option></select></Campo>
                  {def.poderes.modo === 'PROSA' && <div className="linha-form">
                    <Campo rotulo="Separador"><input className="entrada mono" value={def.poderes.separador ?? '; '} onChange={(e) => up((d) => { d.poderes.separador = e.target.value; })} /></Campo>
                    <Campo rotulo="Antes do último"><input className="entrada mono" value={def.poderes.ultimoSeparador ?? '; e '} onChange={(e) => up((d) => { d.poderes.ultimoSeparador = e.target.value; })} /></Campo>
                  </div>}
                </Seccao>
                <DadosPosto />
              </fieldset>
              {editavel && (
                <div className="cartao"><div className="corpo">
                  {erro && <div className="aviso erro">{erro}</div>}
                  <Campo rotulo="Nota da alteração" opcional><input className="entrada" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: letra 12,5 e filete mais fino" /></Campo>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" disabled={!alterado} onClick={() => actual && setDef(structuredClone(actual.definition))}>Repor</button>
                    <button className="btn primario" disabled={!alterado || aGravar} onClick={publicar}>{aGravar ? 'A publicar…' : 'Publicar nova versão'}</button>
                  </div>
                  <span className="small muted">Versão em uso: v{actual?.versionNo}{actual?.publishedAt ? `, publicada ${dataHoraPT(actual.publishedAt)}` : ''}. Cada publicação cria uma versão nova; as anteriores ficam guardadas.</span>
                </div></div>
              )}
            </div>
            <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="small muted">Pré-visualização em tempo real com dados de exemplo. A paginação exacta vê-se no PDF de uma procuração.</span>
              <iframe title="Pré-visualização do modelo" sandbox="" srcDoc={previa} style={{ width: '100%', height: 'calc(100vh - 150px)', border: 0, borderRadius: 12, background: '#E6E1D7' }} />
            </div>
          </div>
        )}
      </main>
    </Casca>
  );
}

/** Dados do posto (aparecem no documento) e oficiantes. */
function DadosPosto() {
  const { pode } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const posto = useQuery({ queryKey: ['organization'], queryFn: () => api<Posto>('/organization') });
  const ofs = useQuery({ queryKey: ['officers', 'todos'], queryFn: () => api<Oficiante[]>('/officers?todos=true') });
  const [p, setP] = useState<Posto | null>(null);
  const [novo, setNovo] = useState<{ aberta: boolean; nome: string; cargo: string }>({ aberta: false, nome: '', cargo: 'Vice-cônsul' });
  useEffect(() => { if (posto.data) setP(posto.data); }, [posto.data]);
  const gerir = pode('catalog.manage');
  async function gravar() { try { await api('/organization', { method: 'PUT', body: p }); toast('Dados do posto actualizados.'); qc.invalidateQueries({ queryKey: ['organization'] }); } catch (e) { toast(mensagemErro(e), true); } }
  async function oficiante(o: Oficiante, patch: Partial<Oficiante>) { try { await api(`/officers/${o.id}`, { method: 'PUT', body: patch }); qc.invalidateQueries({ queryKey: ['officers'] }); } catch (e) { toast(mensagemErro(e), true); } }
  async function criarOficiante() { try { await api('/officers', { body: { nome: novo.nome, cargo: novo.cargo } }); setNovo({ aberta: false, nome: '', cargo: 'Vice-cônsul' }); qc.invalidateQueries({ queryKey: ['officers'] }); } catch (e) { toast(mensagemErro(e), true); } }
  if (!p) return null;
  return (
    <Seccao titulo="Dados do posto e oficiantes">
      <fieldset disabled={!gerir} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Campo rotulo="Nome no cabeçalho ({{posto.nome}})"><input className="entrada" value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} /></Campo>
        <Campo rotulo="Nome completo no texto ({{posto.nomeCompleto}})"><input className="entrada" value={p.nomeCompleto} onChange={(e) => setP({ ...p, nomeCompleto: e.target.value })} /></Campo>
        <Campo rotulo="Morada no texto ({{posto.morada}})" ajuda="Começa depois de «sito na …»"><textarea className="entrada" value={p.morada} onChange={(e) => setP({ ...p, morada: e.target.value })} /></Campo>
        <Campo rotulo="Cidade"><input className="entrada" value={p.cidade} onChange={(e) => setP({ ...p, cidade: e.target.value })} /></Campo>
        {gerir && <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={gravar}>Guardar dados do posto</button>}
        <h3 style={{ marginTop: 8 }}>Oficiantes</h3>
        {ofs.data?.map((o) => (
          <div key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, opacity: o.activo ? 1 : 0.55 }}>
            <span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{o.nome}</b>, {o.cargo}</span>
            {gerir && <button className="btn pequeno" onClick={() => oficiante(o, { activo: !o.activo })}>{o.activo ? 'Desactivar' : 'Activar'}</button>}
          </div>
        ))}
        {gerir && <button className="btn pequeno" style={{ alignSelf: 'flex-start' }} onClick={() => setNovo({ ...novo, aberta: true })}><Icone n="mais" t={14} />Novo oficiante</button>}
      </fieldset>
      <Modal titulo="Novo oficiante" aberta={novo.aberta} fechar={() => setNovo({ ...novo, aberta: false })} rodape={<><button className="btn fantasma" onClick={() => setNovo({ ...novo, aberta: false })}>Cancelar</button><button className="btn primario" disabled={novo.nome.length < 3} onClick={criarOficiante}>Acrescentar</button></>}>
        <Campo rotulo="Nome completo" obrigatorio><input className="entrada" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Campo>
        <Campo rotulo="Cargo (como aparece no texto)" obrigatorio ajuda="Ex.: Vice-cônsul, Cônsul-Geral"><input className="entrada" value={novo.cargo} onChange={(e) => setNovo({ ...novo, cargo: e.target.value })} /></Campo>
      </Modal>
    </Seccao>
  );
}
