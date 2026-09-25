/**
 * Dados de DEMONSTRAÇÃO. Idempotente: não faz nada se a organização DEMO já existir.
 * Todas as pessoas, entidades e textos são FICTÍCIOS e marcados is_demo = true.
 */
import 'reflect-metadata';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { criarPool, urlDirecta } from '../conexao';
import { TIPOS_DOCUMENTO_OMISSAO } from '@proc/core';
import * as s from '../schema';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { Utilizador } from '../../common/http';
import { hashPassword } from '../../auth/auth.service';
import { PowersService } from '../../powers/powers.service';
import { PersonsService, PessoaDto } from '../../persons/persons.service';
import { CATEGORIAS, PODERES } from './poderes-demo';
import { modeloConsular } from './modelo-consular';
import type { Db } from '../db.module';

export const PASSWORD_DEMO = 'Demo#Procuracoes2026';

export const PERMISSOES: [string, string][] = [
  ['power.read', 'Consultar catálogo de poderes'], ['power.manage', 'Criar/editar poderes (rascunho)'], ['power.publish', 'Publicar versões de poderes'], ['power.import', 'Importar poderes'],
  ['person.read', 'Consultar pessoas'], ['person.manage', 'Criar/editar pessoas'],
  ['poa.read', 'Consultar procurações'], ['poa.create', 'Criar procurações'], ['poa.edit', 'Editar rascunhos'], ['poa.submit', 'Submeter para revisão'], ['poa.validate', 'Validar/devolver'],
  ['poa.issue', 'Emitir e registar assinatura'], ['poa.cancel', 'Cancelar'], ['poa.archive', 'Arquivar'], ['poa.custom_power', 'Usar poderes personalizados'],
  ['document.download', 'Descarregar documentos'], ['template.read', 'Consultar modelos'], ['template.manage', 'Editar modelos'], ['template.publish', 'Publicar modelos'],
  ['catalog.manage', 'Gerir entidades, tipos e modelos institucionais'], ['user.manage', 'Gerir utilizadores e perfis'], ['audit.read', 'Consultar auditoria'], ['export.run', 'Exportar dados'],
];
export const PERFIS: Record<string, { nome: string; perms: string[] | 'todas' }> = {
  ADMINISTRADOR: { nome: 'Administrador', perms: 'todas' },
  OPERADOR: { nome: 'Operador', perms: ['power.read', 'person.read', 'person.manage', 'poa.read', 'poa.create', 'poa.edit', 'poa.submit', 'document.download', 'template.read'] },
  VALIDADOR: { nome: 'Validador', perms: ['power.read', 'person.read', 'poa.read', 'poa.validate', 'poa.issue', 'poa.cancel', 'poa.archive', 'document.download', 'template.read', 'audit.read', 'export.run'] },
  CONSULTA: { nome: 'Consulta', perms: ['power.read', 'person.read', 'poa.read', 'document.download'] },
};

export const TIPOS_POA: [string, string, 'PROSA' | 'LISTA', string[]][] = [
  ['GERAL', 'Procuração Geral', 'LISTA', ['GER-001', 'CL-VAL']],
  ['ESPECIAL', 'Procuração Especial', 'PROSA', []],
  ['BANCARIA', 'Procuração Bancária', 'PROSA', ['BANC-001', 'BANC-002', 'BANC-007']],
  ['IMOVEL_VENDA', 'Procuração para Venda de Imóvel', 'PROSA', ['IMOV-001', 'IMOV-004', 'REG-002']],
  ['IMOVEL_COMPRA', 'Procuração para Compra de Imóvel', 'PROSA', ['IMOV-002', 'REG-002', 'FISC-001']],
  ['EMPRESARIAL', 'Procuração Empresarial', 'LISTA', ['EMP-001', 'SOC-002']],
  ['ADMINISTRATIVA', 'Procuração para Representação Administrativa', 'PROSA', ['ADM-001', 'ADM-003', 'ADM-004']],
  ['AUTOMOVEL', 'Procuração Automóvel', 'PROSA', ['AUTO-001']],
  ['JUDICIAL', 'Procuração Judicial (Forense)', 'PROSA', ['JUD-001', 'JUD-004', 'JUD-005']],
];

const morada = (linha: string, cp: string, loc: string) => ({ linha, codigoPostal: cp, localidade: loc, pais: 'Portugal' });
const bi = (n: string, validade = '2033-05-10') => ({ tipo: 'BI_AO', numero: n, dataEmissao: '2023-05-11', validade, vitalicio: false });
const PESSOAS: (PessoaDto & { papel: 'O' | 'P' })[] = [
  { papel: 'O', nomeCompleto: 'Amélia Demo Cardoso', sexo: 'F', nacionalidade: 'angolana', naturalidade: 'Município de Demo Norte, Província de Luanda', estadoCivil: 'CASADO', conjuge: 'Bernardo Demo Cardoso', regimeBens: 'comunhão de adquiridos', documento: bi('900000001LA001'), nif: '900000001LA001', morada: morada('Rua Fictícia da Demonstração, n.º 10, 2.º Esq.', '4000-001', 'Porto'), email: 'amelia.demo@example.test' },
  { papel: 'O', nomeCompleto: 'Carlos Demo Mateus', sexo: 'M', nacionalidade: 'angolana', naturalidade: 'Município de Demo Sul, Província de Benguela', estadoCivil: 'SOLTEIRO', profissao: 'engenheiro', documento: bi('900000002BA002'), morada: morada('Avenida Exemplo, n.º 200', '4100-002', 'Porto') },
  { papel: 'O', nomeCompleto: 'Domingas Demo Neto', sexo: 'F', nacionalidade: 'angolana', naturalidade: 'Município de Demo, Província do Huambo', estadoCivil: 'VIUVO', documento: bi('900000003HO003', '2031-01-01'), morada: morada('Travessa do Teste, n.º 3', '4450-003', 'Matosinhos') },
  { papel: 'O', nomeCompleto: 'Eduardo Demo Lopes', sexo: 'M', nacionalidade: 'angolana', naturalidade: 'Município de Demo, Província de Malanje', estadoCivil: 'DIVORCIADO', profissao: 'empresário', documento: { tipo: 'BI_AO', numero: '900000004ME004', dataEmissao: '2018-11-15', vitalicio: true }, morada: morada('Rua Simulada, n.º 44', '3200-004', 'Lousã') },
  { papel: 'O', nomeCompleto: 'Fernanda Demo Pires', sexo: 'F', nacionalidade: 'portuguesa', estadoCivil: 'SOLTEIRO', documento: { tipo: 'CC_PT', numero: '99999999 9 ZZ9', validade: '2030-12-31', vitalicio: false }, nif: '999999990', morada: morada('Praça Modelo, n.º 5', '4050-005', 'Porto') },
  { papel: 'P', nomeCompleto: 'Gaspar Demo Tavares', sexo: 'M', nacionalidade: 'angolana', naturalidade: 'Município de Demo, Província de Luanda', estadoCivil: 'CASADO', documento: bi('900000011LA011'), morada: { linha: 'Rua 1, Bairro Demo, casa s/n', concelho: 'Viana', provincia: 'Luanda', pais: 'Angola' } },
  { papel: 'P', nomeCompleto: 'Helena Demo Vaz', sexo: 'F', nacionalidade: 'angolana', naturalidade: 'Município de Demo, Província de Luanda', estadoCivil: 'SOLTEIRO', profissao: 'advogada', documento: bi('900000012LA012'), morada: { linha: 'Bloco 9, Apartamento 2, Bairro Exemplo', provincia: 'Luanda', pais: 'Angola' } },
  { papel: 'P', nomeCompleto: 'Isabel Demo Gomes', sexo: 'F', nacionalidade: 'angolana', estadoCivil: 'CASADO', documento: bi('900000013BE013'), morada: { linha: 'Rua da Demonstração, n.º 13', provincia: 'Benguela', pais: 'Angola' } },
  { papel: 'P', nomeCompleto: 'João Demo Sebastião', sexo: 'M', nacionalidade: 'angolana', estadoCivil: 'SOLTEIRO', documento: bi('900000014HO014', '2025-06-30'), morada: { linha: 'Avenida Exemplo, n.º 14', provincia: 'Huambo', pais: 'Angola' } }, // BI EXPIRADO: demonstra o alerta
  { papel: 'P', nomeCompleto: 'Kátia Demo Fernandes', sexo: 'F', nacionalidade: 'angolana', estadoCivil: 'SOLTEIRO', profissao: 'contabilista', documento: bi('900000015LA015'), morada: { linha: 'Rua do Teste, n.º 15', provincia: 'Luanda', pais: 'Angola' } },
];

async function main() {
  const pool = criarPool(urlDirecta(), { max: 2, aplicacao: 'procuracoes-seed' });
  const db = drizzle(pool, { schema: s }) as unknown as Db;
  if ((await db.select().from(s.organizations).where(eq(s.organizations.code, 'DEMO'))).length) { console.log('Seed já aplicado.'); await pool.end(); return; }

  const audit = new AuditService();
  const crypto = new CryptoService();
  const powersSvc = new PowersService(db, audit);
  const personsSvc = new PersonsService(db, crypto, audit);

  await db.transaction(async (tx) => {
    const [org] = await tx.insert(s.organizations).values({ code: 'DEMO', name: 'Consulado Geral no Porto (DEMO)', fullName: 'Consulado Geral da República de Angola (ambiente de DEMONSTRAÇÃO)', address: 'Rua de Demonstração, n.º 1, freguesia de Exemplo, Código Postal 4000-000, concelho do Porto', city: 'Porto', isDemo: true }).returning();
    await tx.insert(s.permissions).values(PERMISSOES.map(([code, description]) => ({ code, description })));
    const roleIds: Record<string, string> = {};
    for (const [code, p] of Object.entries(PERFIS)) {
      const [r] = await tx.insert(s.roles).values({ code, name: p.nome, system: true }).returning();
      roleIds[code] = r.id;
      const perms = p.perms === 'todas' ? PERMISSOES.map(([c]) => c) : p.perms;
      await tx.insert(s.rolePermissions).values(perms.map((permissionCode) => ({ roleId: r.id, permissionCode })));
    }
    const pwd = await hashPassword(PASSWORD_DEMO);
    const userIds: Record<string, string> = {};
    for (const [perfil, email, nome] of [['ADMINISTRADOR', 'admin@demo.local', 'Administrador DEMO'], ['OPERADOR', 'operador@demo.local', 'Operador DEMO'], ['VALIDADOR', 'validador@demo.local', 'Validador DEMO'], ['CONSULTA', 'consulta@demo.local', 'Consulta DEMO']]) {
      const [u] = await tx.insert(s.users).values({ orgId: org.id, email, name: nome, passwordHash: pwd }).returning();
      await tx.insert(s.userRoles).values({ userId: u.id, roleId: roleIds[perfil] });
      userIds[perfil] = u.id;
    }
    const admin: Utilizador = { id: userIds.ADMINISTRADOR, orgId: org.id, nome: 'Seed', permissoes: [] };
    await tx.insert(s.officers).values([
      { orgId: org.id, name: 'Oficial de Demonstração', title: 'Vice-Cônsul', userId: userIds.VALIDADOR },
      { orgId: org.id, name: 'Cônsul de Demonstração', title: 'Cônsul-Geral' },
    ]);
    await tx.insert(s.identityDocumentTypes).values(TIPOS_DOCUMENTO_OMISSAO.map((t) => ({ code: t.codigo, name: t.nome, template: t.modelo })));
    await tx.insert(s.entities).values([
      ['BANCO', 'Banco Demo Alfa, S.A.', 'BDA'], ['BANCO', 'Banco Demo Beta, S.A.', 'BDB'], ['BANCO', 'Banco Demo Gama, S.A.', 'BDG'],
      ['CONSERVATORIA', 'Conservatória do Registo Civil de Demonstração', null], ['TRIBUNAL', 'Tribunal Provincial de Demonstração', null],
      ['SEGURANCA_SOCIAL', 'Instituto de Segurança Social (DEMO)', 'ISS-D'], ['ADMIN_TRIBUTARIA', 'Administração Tributária (DEMO)', 'AT-D'],
      ['OPERADORA', 'Operadora Móvel Demo', null], ['SEGURADORA', 'Seguradora Demo', null],
    ].map(([type, name, shortName]) => ({ orgId: org.id, type: type!, name: name!, shortName, isDemo: true })));

    let ordem = 0;
    for (const [code, name] of CATEGORIAS) await tx.insert(s.powerCategories).values({ code, name, sort: ordem++ });

    // Poderes em duas fases (regras cruzadas): cria todos, depois publica.
    const criados: { id: string; versaoId: string }[] = [];
    ordem = 0;
    for (const p of PODERES) {
      criados.push(await powersSvc.criar({
        codigo: p.codigo, tipo: p.tipo ?? 'PODER', categoriaCodigo: p.categoria, nome: p.nome, descricao: `[DEMO — texto ilustrativo, sem validação jurídica] ${p.descricao}`,
        obrigatorio: false, ordem: ordem++, texto: p.texto, textoAlternativo: p.textoAlternativo, campos: (p.campos ?? []) as never, regras: p.regras ?? [], exclusivo: !!p.exclusivo, tiposPermitidos: p.tiposPermitidos ?? [], notaAlteracao: 'Carga inicial DEMO',
      }, admin, { demo: true, tx }));
    }
    for (const c of criados) await powersSvc.publicarVersao(tx, c.id, c.versaoId, admin);

    // Demonstração de versionamento: BANC-003 ganha v2 (a v1 fica RETIRADA, mas continua válida para documentos que a usaram).
    const [banc3] = await tx.select().from(s.powers).where(eq(s.powers.code, 'BANC-003'));
    const [v2] = await tx.insert(s.powerVersions).values({ powerId: banc3.id, versionNo: 2, text: 'actualizar os dados cadastrais, as fichas de assinatura e os contactos associados às contas, assinando todos os formulários necessários', fields: [], rules: [{ tipo: 'REQUER', alvoCodigo: 'BANC-001' }], changeNote: 'DEMO: redacção revista (v2)', createdBy: admin.id }).returning();
    await powersSvc.publicarVersao(tx, banc3.id, v2.id, admin);

    const templates: Record<string, string> = {};
    for (const modo of ['PROSA', 'LISTA'] as const) {
      const [t] = await tx.insert(s.documentTemplates).values({ code: `CONSULAR_${modo}`, name: `Modelo consular — poderes em ${modo === 'PROSA' ? 'texto corrido' : 'alíneas'} (DEMO)`, isDemo: true }).returning();
      const [v] = await tx.insert(s.templateVersions).values({ templateId: t.id, versionNo: 1, status: 'PUBLICADA', definition: modeloConsular(modo), changeNote: 'Estrutura derivada do corpus analisado', contentHash: CryptoService.sha256(JSON.stringify(modeloConsular(modo))), createdBy: admin.id, publishedBy: admin.id, publishedAt: new Date() }).returning();
      await tx.update(s.documentTemplates).set({ currentVersionId: v.id }).where(eq(s.documentTemplates.id, t.id));
      templates[modo] = t.id;
    }
    ordem = 0;
    for (const [code, name, modo, sugeridos] of TIPOS_POA) await tx.insert(s.poaTypes).values({ code, name, templateId: templates[modo], suggestedPowerCodes: sugeridos, sort: ordem++, isDemo: true });

    for (const p of PESSOAS) { const { papel: _p, ...dto } = p; await personsSvc.criar(dto, admin, { demo: true, tx }); }

    await tx.insert(s.savedModels).values({ orgId: org.id, scope: 'INSTITUCIONAL', name: 'Representação bancária + fiscal + administrativa (DEMO)', items: [{ codigo: 'BANC-001' }, { codigo: 'BANC-002' }, { codigo: 'FISC-001' }, { codigo: 'ADM-001' }, { codigo: 'ADM-003' }, { codigo: 'OUT-001' }, { codigo: 'CL-VAL' }], isDemo: true });
    await tx.insert(s.settings).values({ orgId: org.id, key: 'numeracao', value: { padrao: '{PREFIXO}-{ANO}-{SEQ}', prefixo: 'PROC', serie: '', digitos: 6 } });
    await audit.log(tx, admin, 'SEED_DEMO', 'organization', org.id, { poderes: PODERES.length, categorias: CATEGORIAS.length, pessoas: PESSOAS.length });
  });
  console.log(`Seed DEMO aplicado: ${CATEGORIAS.length} categorias, ${PODERES.length} poderes/cláusulas, ${TIPOS_POA.length} tipos, ${PESSOAS.length} pessoas. Password DEMO: ${PASSWORD_DEMO}`);
  await pool.end();
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
