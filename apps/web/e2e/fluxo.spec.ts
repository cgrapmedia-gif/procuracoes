import { expect, Page, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const PASS = 'Demo#Procuracoes2026';
const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const foto = async (p: Page, nome: string) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${nome}.png`, fullPage: false }); };

async function entrar(page: Page, quem: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(`${quem}@demo.local`);
  await page.getByLabel('Palavra-passe').fill(PASS);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Bom dia|Boa tarde|Boa noite/);
}
async function guardado(page: Page) { await expect(page.getByRole('status').filter({ hasText: /^Guardado$/ })).toBeVisible({ timeout: 10_000 }); }
const seguinte = (page: Page, nome: string) => page.getByRole('link', { name: nome, exact: true }).last().click();

let poaUrl = '';

test.describe.serial('Ciclo completo no browser', () => {
  test('operador cria uma procuração bancária com o assistente', async ({ page }) => {
    await entrar(page, 'operador');
    await foto(page, '01-painel');
    await page.getByRole('link', { name: 'Nova procuração' }).first().click();
    await page.getByLabel('Procuração Bancária').check();
    await foto(page, '02-tipo');
    await page.getByRole('button', { name: 'Criar e identificar o outorgante' }).click();

    // Etapa 2: outorgante (pesquisa sem acentos)
    await page.getByRole('combobox', { name: 'Pesquisar outorgante' }).fill('amelia');
    await page.getByRole('option', { name: /Amélia Demo Cardoso/ }).click();
    await expect(page.getByText('Amélia Demo Cardoso').first()).toBeVisible();
    await seguinte(page, 'Procuradores');

    // Etapa 3: duas procuradoras, actuação conjunta
    for (const n of ['Helena', 'Kátia']) { await page.getByRole('combobox', { name: 'Pesquisar procuradores' }).fill(n); await page.getByRole('option', { name: new RegExp(n) }).click(); }
    await page.getByRole('radio', { name: 'Sempre conjuntamente' }).click();
    await guardado(page);
    await foto(page, '03-procuradores');
    await seguinte(page, 'Poderes');

    // Etapa 4: Power Builder — dependência em falta, corrigida com um clique
    await page.getByRole('button', { name: /Movimentação de conta bancária/ }).first().click();
    await page.getByRole('button', { name: 'Adicionar poder' }).click();
    await expect(page.getByText(/exige o poder BANC-001/)).toBeVisible();
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(page.getByText(/exige o poder BANC-001/)).toHaveCount(0);
    await page.getByPlaceholder(/Pesquisar poderes/).fill('assinar e levantar');
    await page.getByRole('button', { name: /Assinar e levantar documentos/ }).first().click();
    await page.getByRole('button', { name: 'Adicionar poder' }).click();
    // reordenar: representação bancária (adicionada em 2.º) passa para 1.º
    const lista = page.getByRole('complementary', { name: 'Procuração em construção' });
    await lista.getByRole('button', { name: 'Mover para cima' }).nth(1).click();
    await expect(lista.locator('.escolhido').first()).toContainText('Representação junto de instituição bancária');
    await guardado(page);
    await foto(page, '04-construtor');
    await seguinte(page, 'Configuração');

    // Etapa 5: campos dinâmicos com validação imediata
    // o primeiro poder com campos já vem aberto
    // banco que ainda não existe: acrescentado sem sair da procuração
    await page.getByRole('combobox', { name: 'Banco' }).fill('Banco Novo de Teste, S.A.');
    await page.getByRole('button', { name: /Acrescentar «Banco Novo de Teste, S.A.»/ }).click();
    const modal = page.getByRole('dialog', { name: 'Nova entidade' });
    await modal.getByLabel(/^Sigla/).fill('bnt');
    await modal.getByRole('button', { name: 'Acrescentar e usar' }).click();
    await expect(page.getByText('BNT – Banco Novo de Teste, S.A.')).toBeVisible();
    await page.getByRole('button', { name: /Movimentação de conta bancária/ }).click();
    await page.getByLabel(/^IBAN/).fill('AO06004400006729503110102');
    await expect(page.getByText('IBAN inválido.')).toBeVisible();
    await page.getByLabel(/^IBAN/).fill('AO98004400006729503110102');
    await expect(page.getByText('IBAN inválido.')).toHaveCount(0);
    for (const o of ['movimentar e actualizar a conta', 'fazer depósitos', 'fazer levantamentos']) await page.getByLabel(o).check();
    await page.getByLabel(/^Limite por operação/).fill('1500000');
    await expect(page.getByText('Kz 1.500.000,00 (um milhão e quinhentos mil kwanzas)').first()).toBeVisible();
    await expect(page.locator('.texto-juridico').first()).toContainText('representar a outorgante junto do BNT – BANCO NOVO DE TESTE, S.A.');
    await guardado(page);
    await foto(page, '05-configuracao');
    await seguinte(page, 'Cláusulas');

    // Etapa 6: cláusula de validade
    await page.getByRole('button', { name: /Prazo de validade/ }).first().click();
    await page.getByRole('button', { name: 'Adicionar cláusula' }).click();
    await guardado(page);
    await seguinte(page, 'Revisão');

    // Etapa 7: checklist
    await expect(page.getByRole('heading', { name: 'Pronta para submeter' })).toBeVisible();
    await foto(page, '06-revisao');
    await seguinte(page, 'Pré-visualização');

    // Etapa 8: documento real gerado pelo motor
    const doc = page.frameLocator('iframe[title="Pré-visualização da procuração"]');
    await expect(doc.locator('body')).toContainText('suas bastantes procuradoras');
    await expect(doc.locator('body')).toContainText('que deverão actuar sempre conjuntamente');
    await foto(page, '07-previa');
    await seguinte(page, 'Emissão');

    // Etapa 9: submeter
    await page.getByRole('button', { name: 'Submeter para revisão' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submeter para revisão' }).click();
    await expect(page.locator('.estado').first()).toHaveText('Em revisão');
    poaUrl = page.url().replace(/\?.*$/, '');
  });

  test('validador valida e emite; documentos ficam disponíveis', async ({ page }) => {
    await entrar(page, 'validador');
    await expect(page.getByRole('link', { name: /a aguardar validação/ })).toBeVisible();
    await page.goto(`${poaUrl}?etapa=9`);
    await page.getByRole('button', { name: 'Validar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Validar' }).click();
    await expect(page.locator('.estado').first()).toHaveText('Validada');
    await page.getByRole('button', { name: 'Emitir procuração' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Emitir procuração' }).click();
    await expect(page.getByText(/Número PROC-\d{4}-\d{6}/)).toBeVisible({ timeout: 20_000 });
    await foto(page, '08-emitida');
    await seguinte(page, 'Arquivo');
    await expect(page.getByText('PDF emitido')).toBeVisible();
    await expect(page.getByText('DOCX editável')).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descarregar' }).first().click()]);
    expect(dl.suggestedFilename()).toMatch(/^PROC-\d{4}-\d{6}\.(pdf|docx)$/);
    await foto(page, '09-arquivo');
  });

  test('operador não consegue editar a procuração emitida', async ({ page }) => {
    await entrar(page, 'operador');
    await page.goto(`${poaUrl}?etapa=4`);
    await expect(page.getByText(/o conteúdo está bloqueado/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar poder' })).toHaveCount(0);
  });

  test('administrador edita um poder no Centro de Poderes (validação ao vivo e versões)', async ({ page }) => {
    await entrar(page, 'admin');
    await page.getByRole('link', { name: 'Centro de Poderes' }).click();
    await page.getByRole('link', { name: 'Levantamento de cartão e códigos' }).click();
    const texto = page.getByLabel(/^Texto jurídico/);
    await texto.fill('solicitar e levantar cartões junto do {{banco_inexistente}}');
    await expect(page.getByText(/banco_inexistente.*não corresponde a nenhum campo/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar e publicar' })).toBeDisabled();
    await texto.fill('solicitar e levantar cartões de débito e de crédito e os respectivos códigos secretos');
    await page.getByLabel(/^Nota da alteração/).fill('Revisão de redacção (teste)');
    await page.getByRole('button', { name: 'Guardar e publicar' }).click();
    await expect(page.getByText(/Versão 2 publicada/)).toBeVisible();
    await page.getByRole('tab', { name: /Versões/ }).click();
    await expect(page.getByText('Retirada')).toBeVisible();
    await foto(page, '10-centro-poderes');
  });

  test('importação de poderes com pré-visualização', async ({ page }) => {
    await entrar(page, 'admin');
    await page.goto('/admin/poderes/importar');
    const csv = 'codigo;categoria;nome;texto\nWEB-001;OUTROS;Importado pelo browser;praticar actos de teste\nBANC-001;BANCARIOS;Duplicado;xxx yyy\nWEB-002;NAO_EXISTE;Com erro;x';
    await page.locator('input[type=file]').setInputFiles({ name: 'poderes.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByRole('button', { name: 'Importar 1 poderes' })).toBeVisible();
    await foto(page, '11-importacao');
    await page.getByRole('button', { name: 'Importar 1 poderes' }).click();
    await expect(page.getByText(/Importação concluída: 1 criados/)).toBeVisible();
  });

  test('auditoria íntegra', async ({ page }) => {
    await entrar(page, 'admin');
    await page.goto('/admin/auditoria');
    await page.getByRole('button', { name: 'Verificar integridade' }).click();
    await expect(page.getByText(/Cadeia íntegra/)).toBeVisible();
  });
});
