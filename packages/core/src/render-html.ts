/** Renderizador HTML (pré-visualização no browser e fonte do PDF via Chromium). Todo o texto é escapado. */
import { BlocoDoc, DocumentoRenderizado, Run } from './documento';

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ALIGN = { ESQUERDA: 'left', CENTRO: 'center', DIREITA: 'right', JUSTIFICADO: 'justify' } as const;

function runs(rs: Run[]): string {
  return rs.map((r) => {
    const t = escapeHtml(r.texto);
    if (r.marcador) return `<mark class="ph">${t}</mark>`;
    return r.negrito ? `<strong>${t}</strong>` : t;
  }).join('');
}

function bloco(b: BlocoDoc): string {
  switch (b.tipo) {
    case 'titulo': return `<h1 class="titulo${b.preencher ? ' fill-2' : ''}"><span>${escapeHtml(b.texto)}</span></h1>`;
    case 'paragrafo': return `<p class="${b.preencher ? 'fill' : ''}" style="text-align:${ALIGN[b.alinhamento]};${b.espacoAntes ? `margin-top:${b.espacoAntes}pt` : ''}">${runs(b.runs)}</p>`;
    case 'alinea': return `<p class="alinea${b.preencher ? ' fill' : ''}"><span class="mk">${escapeHtml(b.marcador)}</span>${runs(b.runs)}</p>`;
    case 'espaco': return `<div style="height:${b.altura}pt"></div>`;
    case 'assinaturas': return `<section class="assinaturas">${b.itens.map((i) => `<div class="ass${i.alinhamento === 'ESQUERDA' ? ' esq' : ''}"><div class="rot">${escapeHtml(i.rotulo)}</div><div class="linha"></div>${i.nome ? `<div class="nome">${escapeHtml(i.nome)}</div>` : ''}</div>`).join('')}</section>`;
  }
}

export interface OpcoesHtml {
  /** Inclui @page e margens (para PDF). Na pré-visualização em ecrã, simula a folha. */
  paraImpressao?: boolean;
  /** Espaço a reservar depois das assinaturas (cm), para o rodapé da última página. */
  reservaFinalCm?: number;
}

export function renderizarHtml(doc: DocumentoRenderizado, opts: OpcoesHtml = {}): string {
  const m = doc.pagina.margens;
  const t = doc.tipografia;
  const traco = doc.preenchimento.caracter.repeat(400);
  const esp = doc.moldura?.espessura ?? 1.5;
  const fontes = `'${t.fonte}', ${t.fontesAlternativas ?? "Georgia, 'Liberation Serif', 'DejaVu Serif', serif"}`;
  const css = `
  @page { size: A4; ${opts.paraImpressao ? '' : `margin: ${m.topo}cm ${m.direita}cm ${m.fundo}cm ${m.esquerda}cm;`} }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${fontes}; font-size: ${t.tamanho}pt; line-height: ${t.entrelinha}; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .folha { ${opts.paraImpressao ? '' : `width: 21cm; min-height: 29.7cm; margin: 24px auto; padding: ${m.topo}cm ${m.direita}cm ${m.fundo}cm ${m.esquerda}cm; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.06);`} position: relative; }
  header.cab { text-align: center; margin-bottom: 14pt; position: relative; z-index: 2; background: #fff; padding-bottom: 6pt; }
  .mold { position: ${opts.paraImpressao ? 'fixed' : 'absolute'}; top: ${opts.paraImpressao ? '0' : `${m.topo}cm`}; bottom: ${opts.paraImpressao ? '0' : `${m.fundo}cm`}; width: 0; border-left: ${esp}pt solid #111; z-index: 1; }
  .mold.esq { left: ${opts.paraImpressao ? '0' : `${m.esquerda}cm`}; }
  .mold.dir { right: ${opts.paraImpressao ? '0' : `${m.direita}cm`}; }
  .com-moldura .corpo-doc { padding: 0 7pt; }
  .corpo-doc { position: relative; z-index: 2; }
  .rod-ecra { margin-top: 24pt; }
  header.cab img { height: 64px; display: block; margin: 0 auto 6px; }
  header.cab div { line-height: 1.3; }
  p { margin: 0 0 ${t.espacoParagrafo ?? 6}pt; hyphens: manual; text-align-last: left; orphans: 2; widows: 2; }
  /* Traços de preenchimento (prática notarial): ocupam o resto da última linha, impedindo acrescentos. */
  /* inline-block de largura zero: não altera a quebra de linha nem a justificação; o excesso é cortado pela margem. */
  p.fill { overflow: hidden; }
  p.fill::after { content: "${traco}"; display: inline-block; width: 0; white-space: nowrap; overflow: visible; vertical-align: baseline; letter-spacing: 0.5px; }
  h1.titulo { font-size: ${t.tamanhoTitulo ?? t.tamanho}pt; font-weight: 700; text-align: center; margin: 6pt 0 ${t.espacoParagrafo ?? 10}pt; letter-spacing: 1px; line-height: ${t.entrelinha}; }
  h1.fill-2 { display: flex; align-items: baseline; gap: 2px; }
  h1.fill-2::before, h1.fill-2::after { content: "${traco}"; flex: 1 1 0; min-width: 0; overflow: hidden; white-space: nowrap; font-weight: 400; }
  p.alinea { padding-left: 2em; text-indent: -2em; }
  p.alinea .mk { display: inline-block; width: 2em; text-indent: 0; }
  mark.ph { background: #fff3bf; color: #7a5b00; border-radius: 2px; padding: 0 2px; }
  section.assinaturas { break-inside: avoid; page-break-inside: avoid; margin-top: 18pt; padding-bottom: ${opts.reservaFinalCm ?? 0}cm; display: flex; flex-direction: column; align-items: center; gap: ${t.espacoAssinaturas ?? 22}pt; }
  .ass { text-align: center; font-weight: 700; width: 70%; }
  .ass.esq { align-self: flex-start; text-align: left; width: 45%; }
  .ass.esq .linha { margin: 0; }
  .ass .linha { border-bottom: 1px solid #111; height: 34pt; margin: 0 10%; }
  .ass .nome { margin-top: 4pt; }
  .marca { position: fixed; top: 45%; left: 0; right: 0; text-align: center; transform: rotate(-30deg); font-size: 34pt; font-weight: 700; color: rgba(160, 20, 20, .10); pointer-events: none; z-index: 10; font-family: sans-serif; }
  `;
  const cab = `<header class="cab">${doc.cabecalho.logotipo ? `<img alt="" src="${escapeHtml(doc.cabecalho.logotipo)}" style="${doc.cabecalho.logotipoLarguraCm ? `width:${doc.cabecalho.logotipoLarguraCm}cm;height:auto;` : ''}">` : ''}${doc.cabecalho.linhas.map((l) => `<div style="${l.negrito ? 'font-weight:700;' : ''}${l.tamanho ? `font-size:${l.tamanho}pt;` : ''}${l.fonte ? `font-family:${escapeHtml(l.fonte)};` : ''}">${escapeHtml(l.texto)}</div>`).join('')}${htmlFilete(doc.cabecalho.filete, '5pt 0 0')}</header>`;
  // Moldura: linhas fixas repetem-se em todas as páginas impressas; o cabeçalho (fundo branco) tapa-as na 1.ª página.
  const moldura = doc.moldura?.activa ? `<div class="mold esq"></div><div class="mold dir"></div>` : '';
  const rodapeEcra = !opts.paraImpressao && (doc.rodapeBloco || doc.rodape || doc.paginacao) ? `<footer class="rod-ecra">${htmlRodape(doc)}</footer>` : '';
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${doc.marcaAgua ? `<div class="marca">${escapeHtml(doc.marcaAgua)}</div>` : ''}<main class="folha${doc.moldura?.activa ? ' com-moldura' : ''}">${moldura}${cab}<div class="corpo-doc">${doc.blocos.map(bloco).join('\n')}</div>${rodapeEcra}</main></body></html>`;
}


/** Rodapé institucional (contactos + imagem) e linha de controlo (número, verificação, página). Usado no ecrã e no PDF. */
export function htmlRodape(doc: DocumentoRenderizado, extra = '', paginas = false): string {
  const b = doc.rodapeBloco;
  const t = b?.tamanho ?? 6;
  // Sem número nem paginação no modelo => sem linha de controlo (o modelo do posto não a tem)
  const comControlo = !!doc.rodape || doc.paginacao;
  const controlo = !comControlo ? '' : [doc.rodape, extra].filter(Boolean).map(escapeHtml).join(' · ') + (doc.paginacao && paginas ? ' · Página <span class="pageNumber"></span> de <span class="totalPages"></span>' : '');
  const bloco = b ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%">
    <div style="border-left:1.5px solid ${escapeHtml(b.corBarra ?? '#E30613')};padding-left:6px;font-family:Calibri,'Carlito',Arial,sans-serif;font-size:${t}pt;line-height:1.3;color:#111">${b.contactos.map(escapeHtml).join('<br>')}</div>
    ${b.imagem ? `<img alt="" src="${escapeHtml(b.imagem)}" style="height:${b.imagemAlturaCm ?? 1.1}cm;width:auto">` : ''}
  </div>` : '';
  return `${b?.filete?.activo ? htmlFilete(b.filete, '0 0 5px') : ''}${bloco}${controlo ? `<div style="font-family:Georgia,serif;font-size:6.5pt;color:#666;text-align:center;margin-top:3px">${controlo}</div>` : ''}`;
}

/** Filete horizontal centrado (cabeçalho/rodapé). */
export function htmlFilete(f: { activo: boolean; cor: string; espessuraPt: number; larguraPct: number } | undefined, margem: string): string {
  if (!f?.activo) return '';
  return `<div style="height:0;border-top:${f.espessuraPt}pt solid ${escapeHtml(f.cor)};width:${Math.min(100, Math.max(5, f.larguraPct))}%;margin:${margem};margin-left:auto;margin-right:auto;-webkit-print-color-adjust:exact;print-color-adjust:exact"></div>`;
}
