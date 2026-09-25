/** Renderizador DOCX editável (biblioteca docx). Traços de preenchimento via tabulação direita com guia de hífenes. */
import { AlignmentType, Document, Footer, ImageRun, LineRuleType, Packer, PageNumber, Paragraph, TabStopType, TextRun } from 'docx';
import { BlocoDoc, DocumentoRenderizado, Run } from './documento';

const cm = (x: number) => Math.round((x / 2.54) * 1440); // twips
const AL = { ESQUERDA: AlignmentType.LEFT, CENTRO: AlignmentType.CENTER, DIREITA: AlignmentType.RIGHT, JUSTIFICADO: AlignmentType.JUSTIFIED } as const;

export async function renderizarDocx(doc: DocumentoRenderizado): Promise<Buffer> {
  const t = doc.tipografia;
  const size = t.tamanho * 2;
  const larguraUtil = cm(21 - doc.pagina.margens.esquerda - doc.pagina.margens.direita);
  const spacing = { line: Math.round(240 * t.entrelinha), lineRule: LineRuleType.AUTO, after: 120 };

  const tr = (r: Run) => new TextRun({ text: r.marcador ? r.texto : r.texto, bold: r.negrito, highlight: r.marcador ? 'yellow' : undefined, font: t.fonte, size });
  // Tabulação direita na margem com guia de hífenes: suportada por Word e LibreOffice (w:ptab não é suportado pelo LibreOffice).
  const leaderTxt = doc.preenchimento.caracter === '.' ? 'dot' : doc.preenchimento.caracter === '_' ? 'underscore' : 'hyphen';
  const tabFill = [{ type: TabStopType.RIGHT, position: larguraUtil, leader: leaderTxt as 'hyphen' }];
  const fill = () => new TextRun({ text: '\t', font: t.fonte, size });

  const paras: Paragraph[] = [];
  if (doc.cabecalho.logotipo?.startsWith('data:image/png;base64,')) {
    const data = Buffer.from(doc.cabecalho.logotipo.split(',')[1], 'base64');
    paras.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data, transformation: { width: 64, height: 64 } })] }));
  }
  for (const l of doc.cabecalho.linhas) paras.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.texto, bold: l.negrito, font: t.fonte, size: (l.tamanho ?? t.tamanho) * 2 })] }));
  paras.push(new Paragraph({ children: [] }));

  const bloco = (b: BlocoDoc): Paragraph[] => {
    switch (b.tipo) {
      case 'titulo':
        if (!b.preencher) return [new Paragraph({ alignment: AlignmentType.CENTER, spacing, children: [new TextRun({ text: b.texto, bold: true, font: t.fonte, size })] })];
        // "------TÍTULO------": tabulação central + direita, ambas com guia
        return [new Paragraph({
          spacing,
          tabStops: [{ type: TabStopType.CENTER, position: Math.round(larguraUtil / 2), leader: 'hyphen' }, { type: TabStopType.RIGHT, position: larguraUtil, leader: 'hyphen' }],
          children: [new TextRun({ text: `\t${b.texto}\t`, bold: true, font: t.fonte, size })],
        })];
      case 'paragrafo':
        return [new Paragraph({ alignment: AL[b.alinhamento], tabStops: b.preencher ? tabFill : undefined, spacing: { ...spacing, before: b.espacoAntes ? b.espacoAntes * 20 : undefined }, children: [...b.runs.map(tr), ...(b.preencher ? [fill()] : [])] })];
      case 'alinea':
        return [new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing, indent: { left: 567, hanging: 567 }, tabStops: [{ type: TabStopType.LEFT, position: 567 }, ...(b.preencher ? tabFill : [])], children: [new TextRun({ text: `${b.marcador}\t`, font: t.fonte, size }), ...b.runs.map(tr), ...(b.preencher ? [fill()] : [])] })];
      case 'espaco': return [new Paragraph({ spacing: { before: b.altura * 20 }, children: [] })];
      case 'assinaturas':
        return b.itens.flatMap((i, idx) => [
          new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { before: idx === 0 ? 480 : 360 }, children: [new TextRun({ text: i.rotulo, bold: true, font: t.fonte, size })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, keepNext: !!i.nome || idx < b.itens.length - 1, spacing: { before: 480 }, children: [new TextRun({ text: '_'.repeat(38), font: t.fonte, size })] }),
          ...(i.nome ? [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: idx < b.itens.length - 1, children: [new TextRun({ text: i.nome, bold: true, font: t.fonte, size })] })] : []),
        ]);
    }
  };
  for (const b of doc.blocos) paras.push(...bloco(b));

  const rodape = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: doc.rodape, font: t.fonte, size: 16, color: '555555' }),
    ...(doc.paginacao ? [new TextRun({ children: ['   ·   Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], font: t.fonte, size: 16, color: '555555' })] : []),
  ] })] });

  const d = new Document({
    creator: 'Plataforma de Procurações', title: doc.rodape,
    styles: { default: { document: { run: { font: t.fonte, size } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: cm(doc.pagina.margens.topo), right: cm(doc.pagina.margens.direita), bottom: cm(doc.pagina.margens.fundo), left: cm(doc.pagina.margens.esquerda) } } },
      footers: { default: rodape },
      children: paras,
    }],
  });
  return Packer.toBuffer(d);
}
