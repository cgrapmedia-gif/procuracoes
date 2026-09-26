import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Browser, chromium } from 'playwright-core';
import { PDFDocument, rgb } from 'pdf-lib';
import { DocumentoRenderizado, htmlRodape, renderizarHtml } from '@proc/core';
import { config } from '../config';

const ARGS_BASE = ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'];
/** Modo para máquinas com pouca memória (ex.: Render gratuito, 512 MB): um só processo, sem extras. */
const ARGS_BAIXA_MEMORIA = ['--single-process', '--no-zygote', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--disable-default-apps', '--mute-audio', '--no-first-run', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=96'];

/**
 * PDF via Chromium headless: o mesmo HTML da pré-visualização => fidelidade total.
 * Rede desligada durante a renderização (nenhum recurso externo é carregado).
 * PDF_BAIXA_MEMORIA=true: abre o Chromium só durante cada geração e fecha-o a seguir (liberta a memória).
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly log = new Logger('PDF');
  private browser?: Promise<Browser>;
  private readonly baixaMemoria = process.env.PDF_BAIXA_MEMORIA === 'true';

  private lancar(): Promise<Browser> {
    return chromium.launch({ executablePath: config().CHROMIUM_PATH, args: this.baixaMemoria ? [...ARGS_BASE, ...ARGS_BAIXA_MEMORIA] : ARGS_BASE, timeout: 60_000 });
  }

  private obterBrowser(): Promise<Browser> {
    if (!this.browser) {
      const p = this.lancar();
      this.browser = p;
      // Se o Chromium morrer (ex.: falta de memória), a próxima emissão volta a lançá-lo em vez de falhar para sempre.
      p.then((b) => b.on('disconnected', () => { if (this.browser === p) this.browser = undefined; })).catch(() => { if (this.browser === p) this.browser = undefined; });
    }
    return this.browser;
  }

  async gerar(doc: DocumentoRenderizado, rodapeExtra = ''): Promise<Buffer> {
    const browser = this.baixaMemoria ? await this.lancar() : await this.obterBrowser();
    const soNoFim = !!doc.rodapeBloco?.apenasUltimaPagina;
    const reserva = soNoFim ? (doc.rodapeBloco?.alturaReservadaCm ?? 2.6) : 0;
    try {
      const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true });
      try {
        const page = await ctx.newPage();
        await page.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
        await page.setContent(renderizarHtml(doc, { paraImpressao: true, reservaFinalCm: reserva }), { waitUntil: 'load' });
        const m = doc.pagina.margens;
        // Rodapé em todas as páginas (e/ou linha de controlo): pelo mecanismo do Chromium
        const comControlo = !!doc.rodape || doc.paginacao;
        const rodapeTodas = !soNoFim && !!doc.rodapeBloco;
        const corpo = await page.pdf({
          format: 'A4', printBackground: true, displayHeaderFooter: rodapeTodas || comControlo, preferCSSPageSize: false,
          margin: { top: `${m.topo}cm`, right: `${m.direita}cm`, bottom: `${m.fundo}cm`, left: `${m.esquerda}cm` },
          headerTemplate: '<span></span>',
          // O Chromium não aplica os estilos da página ao rodapé: tudo em linha; imagens em data URI.
          footerTemplate: `<div style="width:100%;box-sizing:border-box;padding:0 ${m.direita}cm 0 ${m.esquerda}cm;-webkit-print-color-adjust:exact">${htmlRodape(soNoFim ? { ...doc, rodapeBloco: undefined } : doc, rodapeExtra, true)}</div>`,
        });
        if (!soNoFim) return corpo;

        // Modelo do posto: rodapé institucional só na última página (fim do documento).
        const pagRod = await ctx.newPage();
        await pagRod.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body>
          <div style="position:fixed;left:${m.esquerda}cm;right:${m.direita}cm;bottom:0.6cm">${htmlRodape({ ...doc, rodape: '', paginacao: false })}</div></body></html>`, { waitUntil: 'load' });
        const rodPdf = await pagRod.pdf({ format: 'A4', printBackground: false, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
        const final = await PDFDocument.load(corpo);
        const [embutida] = await final.embedPdf(rodPdf, [0]);
        const ultima = final.getPage(final.getPageCount() - 1);
        const { width, height } = ultima.getSize();
        // Tapa a moldura na zona do rodapé (como no modelo em Word) e desenha o rodapé por cima
        ultima.drawRectangle({ x: 0, y: 0, width, height: (reserva / 2.54) * 72, color: rgb(1, 1, 1) });
        ultima.drawPage(embutida, { x: 0, y: 0, width, height });
        return Buffer.from(await final.save());
      } finally { await ctx.close().catch(() => undefined); }
    } catch (e) {
      this.log.error(`Falha a gerar PDF${this.baixaMemoria ? ' (modo baixa memória)' : ''}: ${(e as Error).message}`);
      throw e;
    } finally {
      if (this.baixaMemoria) await browser.close().catch(() => undefined);
    }
  }

  async onModuleDestroy() { if (this.browser) await (await this.browser).close().catch(() => undefined); }
}
