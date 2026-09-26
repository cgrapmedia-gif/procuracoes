/** Renderizador DOCX editável (biblioteca docx). Traços de preenchimento via tabulação direita com guia de hífenes. */
import {
  AlignmentType, BorderStyle, Document, Footer, ImageRun, LineRuleType, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
} from 'docx';
import { BlocoDoc, DocumentoRenderizado, Run } from './documento';

const cm = (x: number) => Math.round((x / 2.54) * 1440); // twips
const pxDeCm = (x: number) => Math.round((x / 2.54) * 96);
const AL = { ESQUERDA: AlignmentType.LEFT, CENTRO: AlignmentType.CENTER, DIREITA: AlignmentType.RIGHT, JUSTIFICADO: AlignmentType.JUSTIFIED } as const;

/** Lê largura/altura de um PNG em data URI (para manter a proporção). */
function png(dataUri?: string): { data: Buffer; w: number; h: number } | null {
  if (!dataUri?.startsWith('data:image/png;base64,')) return null;
  const data = Buffer.from(dataUri.split(',')[1], 'base64');
  if (data.length < 24) return null;
  return { data, w: data.readUInt32BE(16), h: data.readUInt32BE(20) };
}
const SEM_BORDA = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

export async function renderizarDocx(doc: DocumentoRenderizado): Promise<Buffer> {
  const t = doc.tipografia;
  const size = t.tamanho * 2;
  const larguraUtil = cm(21 - doc.pagina.margens.esquerda - doc.pagina.margens.direita);
  const spacing = { line: Math.round(240 * t.entrelinha), lineRule: LineRuleType.AUTO, after: Math.round((t.espacoParagrafo ?? 6) * 20) };
  // Moldura: bordas esquerda/direita nos parágrafos do corpo (como no modelo em Word do posto)
  const esp = Math.round((doc.moldura?.espessura ?? 1.5) * 8);
  const border = doc.moldura?.activa ? { left: { style: BorderStyle.SINGLE, size: esp, space: 4, color: 'auto' }, right: { style: BorderStyle.SINGLE, size: esp, space: 4, color: 'auto' } } : undefined;

  const tr = (r: Run) => new TextRun({ text: r.texto, bold: r.negrito, highlight: r.marcador ? 'yellow' : undefined, font: t.fonte, size });
  const leaderTxt = doc.preenchimento.caracter === '.' ? 'dot' : doc.preenchimento.caracter === '_' ? 'underscore' : 'hyphen';
  const tabFill = [{ type: TabStopType.RIGHT, position: larguraUtil, leader: leaderTxt as 'hyphen' }];
  const fill = () => new TextRun({ text: '\t', font: t.fonte, size });

  const paras: (Paragraph | Table)[] = [];
  const logo = png(doc.cabecalho.logotipo);
  if (logo) {
    const w = pxDeCm(doc.cabecalho.logotipoLarguraCm ?? 1.7);
    paras.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: logo.data, transformation: { width: w, height: Math.round((w * logo.h) / logo.w) } })] }));
  }
  for (const l of doc.cabecalho.linhas) paras.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.texto, bold: l.negrito, font: l.fonte?.split(',')[0].replace(/['"]/g, '').trim() || t.fonte, size: (l.tamanho ?? t.tamanho) * 2 })] }));
  paras.push(new Paragraph({ children: [] }));

  const bloco = (b: BlocoDoc): Paragraph[] => {
    switch (b.tipo) {
      case 'titulo':
        if (!b.preencher) return [new Paragraph({ border, alignment: AlignmentType.CENTER, spacing, children: [new TextRun({ text: b.texto, bold: true, font: t.fonte, size })] })];
        return [new Paragraph({
          border, spacing,
          tabStops: [{ type: TabStopType.CENTER, position: Math.round(larguraUtil / 2), leader: 'hyphen' }, { type: TabStopType.RIGHT, position: larguraUtil, leader: 'hyphen' }],
          children: [new TextRun({ text: `\t${b.texto}\t`, bold: true, font: t.fonte, size })],
        })];
      case 'paragrafo':
        return [new Paragraph({ border, alignment: AL[b.alinhamento], tabStops: b.preencher ? tabFill : undefined, spacing: { ...spacing, before: b.espacoAntes ? b.espacoAntes * 20 : undefined }, children: [...b.runs.map(tr), ...(b.preencher ? [fill()] : [])] })];
      case 'alinea':
        return [new Paragraph({ border, alignment: AlignmentType.JUSTIFIED, spacing, indent: { left: 567, hanging: 567 }, tabStops: [{ type: TabStopType.LEFT, position: 567 }, ...(b.preencher ? tabFill : [])], children: [new TextRun({ text: `${b.marcador}\t`, font: t.fonte, size }), ...b.runs.map(tr), ...(b.preencher ? [fill()] : [])] })];
      case 'espaco': return [new Paragraph({ border, spacing: { before: b.altura * 20 }, children: [] })];
      case 'assinaturas':
        return b.itens.flatMap((i, idx) => {
          const al = i.alinhamento === 'ESQUERDA' ? AlignmentType.LEFT : AlignmentType.CENTER;
          return [
            new Paragraph({ border, alignment: al, keepNext: true, keepLines: true, spacing: { before: idx === 0 ? 480 : 360 }, children: [new TextRun({ text: i.rotulo, bold: true, font: t.fonte, size })] }),
            new Paragraph({ border, alignment: al, keepNext: !!i.nome || idx < b.itens.length - 1, spacing: { before: 480 }, children: [new TextRun({ text: '_'.repeat(i.alinhamento === 'ESQUERDA' ? 26 : 38), font: t.fonte, size })] }),
            ...(i.nome ? [new Paragraph({ border, alignment: al, keepNext: idx < b.itens.length - 1, children: [new TextRun({ text: i.nome, bold: true, font: t.fonte, size })] })] : []),
          ];
        });
    }
  };
  for (const b of doc.blocos) paras.push(...bloco(b));

  // Rodapé: bloco institucional (contactos | imagem) + linha de controlo
  const rb = doc.rodapeBloco;
  const blocoRodape: Table[] = [];
  if (rb) {
    const img = png(rb.imagem);
    const corBarra = (rb.corBarra ?? '#E30613').replace('#', '');
    const tam = (rb.tamanho ?? 6) * 2;
    const contactos = rb.contactos.map((c) => new Paragraph({ spacing: { after: 0, line: 240 }, border: { left: { style: BorderStyle.SINGLE, size: 8, space: 6, color: corBarra } }, children: [new TextRun({ text: c, font: 'Calibri', size: tam })] }));
    const hImg = pxDeCm(rb.imagemAlturaCm ?? 1.1);
    blocoRodape.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA, insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA },
      rows: [new TableRow({ children: [
        new TableCell({ width: { size: 55, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: contactos }),
        new TableCell({ width: { size: 45, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: img ? [new ImageRun({ type: 'png', data: img.data, transformation: { height: hImg, width: Math.round((hImg * img.w) / img.h) } })] : [] })] }),
      ] })],
    }));
  }
  const controlo = doc.rodape || doc.paginacao ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: doc.rodape, font: t.fonte, size: 13, color: '666666' }),
    ...(doc.paginacao ? [new TextRun({ children: ['   ·   Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], font: t.fonte, size: 13, color: '666666' })] : []),
  ] })] : [];
  // Modelo do posto: rodapé só no fim do documento (a seguir às assinaturas), sem numeração
  const soNoFim = !!rb?.apenasUltimaPagina;
  if (soNoFim) paras.push(new Paragraph({ spacing: { before: 720 }, children: [] }), ...blocoRodape);
  const filhosRodape: (Paragraph | Table)[] = soNoFim ? controlo : [...blocoRodape, ...controlo];

  const d = new Document({
    creator: 'Plataforma de Procurações', title: doc.rodape,
    styles: { default: { document: { run: { font: t.fonte, size } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: cm(doc.pagina.margens.topo), right: cm(doc.pagina.margens.direita), bottom: cm(doc.pagina.margens.fundo), left: cm(doc.pagina.margens.esquerda), footer: cm(0.5) } } },
      ...(filhosRodape.length ? { footers: { default: new Footer({ children: filhosRodape }) } } : {}),
      children: paras,
    }],
  });
  return Packer.toBuffer(d);
}
