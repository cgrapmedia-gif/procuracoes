import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Browser, chromium } from 'playwright-core';
import { DocumentoRenderizado, escapeHtml, renderizarHtml } from '@proc/core';
import { config } from '../config';

/**
 * PDF via Chromium headless: o mesmo HTML da pré-visualização => fidelidade total.
 * Rede desligada durante a renderização (nenhum recurso externo é carregado).
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private browser?: Promise<Browser>;

  private obterBrowser(): Promise<Browser> {
    this.browser ??= chromium.launch({ executablePath: config().CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
    return this.browser;
  }

  async gerar(doc: DocumentoRenderizado, rodapeExtra = ''): Promise<Buffer> {
    const browser = await this.obterBrowser();
    const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true });
    try {
      const page = await ctx.newPage();
      await page.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
      await page.setContent(renderizarHtml(doc, { paraImpressao: true }), { waitUntil: 'load' });
      const m = doc.pagina.margens;
      const rodape = [doc.rodape, rodapeExtra].filter(Boolean).map(escapeHtml).join(' · ');
      return await page.pdf({
        format: 'A4', printBackground: true, displayHeaderFooter: true, preferCSSPageSize: false,
        margin: { top: `${m.topo}cm`, right: `${m.direita}cm`, bottom: `${m.fundo}cm`, left: `${m.esquerda}cm` },
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#555;font-family:Georgia,serif;text-align:center;padding:0 1cm">${rodape}${doc.paginacao ? ' · Página <span class="pageNumber"></span> de <span class="totalPages"></span>' : ''}</div>`,
      });
    } finally { await ctx.close(); }
  }

  async onModuleDestroy() { if (this.browser) await (await this.browser).close(); }
}
