import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Browser, BrowserContext, Page, chromium } from 'playwright-core';
import { PDFDocument, rgb } from 'pdf-lib';
import { DocumentoRenderizado, htmlRodape, renderizarHtml } from '@proc/core';
import { config } from '../config';

const ARGS_BASE = ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'];
/** Modo para máquinas com pouca memória (ex.: Render gratuito, 512 MB): um só processo, sem extras. */
const ARGS_BAIXA_MEMORIA = ['--single-process', '--no-zygote', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--disable-default-apps', '--mute-audio', '--no-first-run', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=96'];

/**
 * PDF via Chromium headless: o mesmo HTML da pré-visualização => fidelidade total.
 * Rede desligada durante a renderização (nenhum recurso externo é carregado).
 *
 * Rapidez:
 *  - o Chromium fica aberto entre emissões e fecha-se após PDF_INACTIVIDADE_S segundos sem uso (por omissão 180);
 *  - no modo de pouca memória (PDF_BAIXA_MEMORIA=true, processo único) reutiliza-se a mesma página
 *    (fechar o contexto terminaria o processo) e as gerações são feitas uma de cada vez;
 *  - o rodapé institucional (igual em todas as procurações do mesmo modelo) é gerado uma vez e reutilizado.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly log = new Logger('PDF');
  private readonly baixaMemoria = process.env.PDF_BAIXA_MEMORIA === 'true';
  private browser?: Promise<Browser>;
  private persistente?: Promise<{ ctx: BrowserContext; corpo: Page; rodape: Page }>;
  private fila: Promise<unknown> = Promise.resolve();
  private fecho?: ReturnType<typeof setTimeout>;
  private readonly cacheRodape = new Map<string, Buffer>();

  private obterBrowser(): Promise<Browser> {
    if (!this.browser) {
      const p = chromium.launch({ executablePath: config().CHROMIUM_PATH, args: this.baixaMemoria ? [...ARGS_BASE, ...ARGS_BAIXA_MEMORIA] : ARGS_BASE, timeout: 60_000 });
      this.browser = p;
      // Se o Chromium morrer (ex.: falta de memória), a próxima emissão volta a lançá-lo em vez de falhar para sempre.
      p.then((b) => b.on('disconnected', () => { if (this.browser === p) { this.browser = undefined; this.persistente = undefined; } }))
        .catch(() => { if (this.browser === p) { this.browser = undefined; this.persistente = undefined; } });
    }
    return this.browser;
  }

  private async novaPagina(ctx: BrowserContext): Promise<Page> {
    const page = await ctx.newPage();
    await page.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    return page;
  }

  /** Páginas a usar nesta geração (e como as libertar no fim). */
  private async paginas(): Promise<{ corpo: Page; rodape: () => Promise<Page>; libertar: () => Promise<void> }> {
    const browser = await this.obterBrowser();
    if (this.baixaMemoria) {
      if (!this.persistente) {
        this.persistente = (async () => { const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true }); return { ctx, corpo: await this.novaPagina(ctx), rodape: await this.novaPagina(ctx) }; })();
        this.persistente.catch(() => { this.persistente = undefined; });
      }
      const p = await this.persistente;
      return { corpo: p.corpo, rodape: async () => p.rodape, libertar: async () => undefined };
    }
    const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true });
    return { corpo: await this.novaPagina(ctx), rodape: () => this.novaPagina(ctx), libertar: () => ctx.close().catch(() => undefined) };
  }

  private agendarFecho() {
    clearTimeout(this.fecho);
    this.fecho = setTimeout(() => {
      const b = this.browser; this.browser = undefined; this.persistente = undefined;
      b?.then((x) => x.close()).catch(() => undefined);
    }, Number(process.env.PDF_INACTIVIDADE_S ?? 180) * 1000);
    this.fecho.unref?.();
  }

  /** Arranca o Chromium antecipadamente (ex.: ao abrir a pré-visualização), para a emissão seguinte ser imediata. */
  aquecer() { this.obterBrowser().then(() => this.agendarFecho()).catch(() => undefined); }

  gerar(doc: DocumentoRenderizado, rodapeExtra = ''): Promise<Buffer> {
    // No modo de processo único as gerações fazem-se uma de cada vez (partilham a mesma página)
    const tarefa = this.fila.then(() => this.gerarAgora(doc, rodapeExtra), () => this.gerarAgora(doc, rodapeExtra));
    this.fila = tarefa.catch(() => undefined);
    return tarefa;
  }

  private async gerarAgora(doc: DocumentoRenderizado, rodapeExtra: string): Promise<Buffer> {
    clearTimeout(this.fecho);
    const soNoFim = !!doc.rodapeBloco?.apenasUltimaPagina;
    const reserva = soNoFim ? (doc.rodapeBloco?.alturaReservadaCm ?? 2.6) : 0;
    let pags: Awaited<ReturnType<PdfService['paginas']>> | undefined;
    try {
      pags = await this.paginas();
      const page = pags.corpo;
      await page.setContent(renderizarHtml(doc, { paraImpressao: true, reservaFinalCm: reserva }), { waitUntil: 'load' });
      const m = doc.pagina.margens;
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

      // Rodapé institucional só na última página (fim do documento)
      const htmlRod = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body>
        <div style="position:fixed;left:${m.esquerda}cm;right:${m.direita}cm;bottom:0.6cm">${htmlRodape({ ...doc, rodape: '', paginacao: false })}</div></body></html>`;
      let rodPdf = this.cacheRodape.get(htmlRod);
      if (!rodPdf) {
        const pr = await pags.rodape();
        await pr.setContent(htmlRod, { waitUntil: 'load' });
        rodPdf = await pr.pdf({ format: 'A4', printBackground: false, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
        if (this.cacheRodape.size > 20) this.cacheRodape.clear();
        this.cacheRodape.set(htmlRod, rodPdf);
      }
      const final = await PDFDocument.load(corpo);
      const [embutida] = await final.embedPdf(rodPdf, [0]);
      const ultima = final.getPage(final.getPageCount() - 1);
      const { width, height } = ultima.getSize();
      // Tapa a moldura na zona do rodapé (como no modelo em Word) e desenha o rodapé por cima
      ultima.drawRectangle({ x: 0, y: 0, width, height: (reserva / 2.54) * 72, color: rgb(1, 1, 1) });
      ultima.drawPage(embutida, { x: 0, y: 0, width, height });
      return Buffer.from(await final.save());
    } catch (e) {
      this.log.error(`Falha a gerar PDF${this.baixaMemoria ? ' (modo baixa memória)' : ''}: ${(e as Error).message.split('\n')[0]}`);
      this.persistente = undefined;
      throw e;
    } finally {
      await pags?.libertar();
      this.agendarFecho();
    }
  }

  async onModuleDestroy() {
    clearTimeout(this.fecho);
    if (this.browser) await (await this.browser).close().catch(() => undefined);
  }
}
