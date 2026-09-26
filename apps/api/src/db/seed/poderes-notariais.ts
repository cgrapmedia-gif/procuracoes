/**
 * Catálogo alargado — poderes habituais nas procurações lavradas em notários e conservatórias em Portugal
 * (imobiliário, banca, Autoridade Tributária, Segurança Social, registos, heranças, sociedades, condomínio,
 * automóveis, serviços, nacionalidade e migração, correspondência).
 * Textos ILUSTRATIVOS redigidos para este catálogo: entram como rascunho e têm de ser revistos pelo jurídico antes de publicar.
 */
import type { PoderDemo } from './poderes-demo';

type F = NonNullable<PoderDemo['campos']>[number];
const t = (chave: string, rotulo: string, obrigatorio = true): F => ({ chave, rotulo, tipo: 'TEXTO', obrigatorio });
const ent = (chave: string, rotulo: string, obrigatorio = true): F => ({ chave, rotulo, tipo: 'ENTIDADE', obrigatorio });
const pes = (chave: string, rotulo: string): F => ({ chave, rotulo, tipo: 'PESSOA', obrigatorio: true });
const moe = (chave: string, rotulo: string, obrigatorio = true, moeda = 'EUR'): F => ({ chave, rotulo, tipo: 'MOEDA', obrigatorio, moeda });
const dat = (chave: string, rotulo: string, obrigatorio = true): F => ({ chave, rotulo, tipo: 'DATA', obrigatorio });
const IMV: F = { chave: 'imovel', rotulo: 'Imóvel', tipo: 'IMOVEL', obrigatorio: true };
const VEI: F = { chave: 'veiculo', rotulo: 'Veículo', tipo: 'VEICULO', obrigatorio: true };
const EMP: F = { chave: 'empresa', rotulo: 'Sociedade', tipo: 'EMPRESA', obrigatorio: true };
const REQ = (c: string) => ({ tipo: 'REQUER' as const, alvoCodigo: c });
const SUG = (c: string) => ({ tipo: 'SUGERE' as const, alvoCodigo: c });
const INC = (c: string) => ({ tipo: 'INCOMPATIVEL' as const, alvoCodigo: c });
const OG = '{{flex outorgantes "o outorgante" "a outorgante" "os outorgantes" "as outorgantes"}}';
const DOG = '{{flex outorgantes "do outorgante" "da outorgante" "dos outorgantes" "das outorgantes"}}';

/** Categorias novas (as restantes já existem no catálogo base). */
export const CATEGORIAS_NOVAS: [string, string][] = [
  ['CONDOMINIO', 'Condomínio'],
  ['SERVICOS', 'Água, electricidade, gás e telecomunicações'],
  ['CORRESPONDENCIA', 'Correspondência e CTT'],
  ['NACIONALIDADE', 'Nacionalidade, migração e legalizações'],
  ['DOACOES', 'Doações'],
  ['SAUDE_EDUCACAO', 'Saúde e educação'],
];

const p = (codigo: string, categoria: string, nome: string, texto: string, extra: Partial<PoderDemo> = {}): PoderDemo =>
  ({ codigo, categoria, nome, descricao: extra.descricao ?? nome, texto, ...extra });

export const PODERES_NOTARIAIS: PoderDemo[] = [
  // ─── Imobiliário ───────────────────────────────────────────────────────────
  p('IMOV-101', 'IMOBILIARIOS', 'Comprar quaisquer imóveis', `comprar, pelo preço e condições que entender, quaisquer prédios urbanos ou rústicos, ou fracções autónomas, situados em {{local}}, pagar o preço, receber quitação e outorgar e assinar as respectivas escrituras ou documentos particulares autenticados`, { campos: [t('local', 'Local (concelho, cidade ou país)')], regras: [SUG('IMOV-110'), SUG('FISC-110'), SUG('REG-002')] }),
  p('IMOV-102', 'IMOBILIARIOS', 'Vender quaisquer imóveis', `vender, pelo preço e condições que entender, quaisquer prédios urbanos ou rústicos, ou fracções autónomas, de que ${OG} seja ou venha a ser proprietári{{flex outorgantes "o" "a" "os" "as"}}, receber o preço, dar quitação e outorgar e assinar as respectivas escrituras ou documentos particulares autenticados`, { regras: [SUG('IMOV-004'), SUG('IMOV-005'), SUG('FISC-110')] }),
  p('IMOV-103', 'IMOBILIARIOS', 'Compra com crédito à habitação', `comprar o {{imovel}}, pelo preço de {{preco}}, e contrair junto do {{banco}} um empréstimo até ao montante de {{montante}}, destinado à sua aquisição, constituindo a favor da instituição mutuante hipoteca sobre o mesmo imóvel, aceitando as cláusulas e condições do contrato e assinando o documento complementar e demais documentos necessários`, { campos: [IMV, moe('preco', 'Preço'), ent('banco', 'Instituição bancária'), moe('montante', 'Montante máximo do empréstimo')], regras: [SUG('SEG-101'), SUG('FISC-110')] }),
  p('IMOV-104', 'IMOBILIARIOS', 'Distrate e cancelamento de hipoteca', `requerer e outorgar o distrate da hipoteca que onera o {{imovel}}, receber o respectivo título e requerer o cancelamento do registo na conservatória do registo predial competente`, { campos: [IMV] }),
  p('IMOV-105', 'IMOBILIARIOS', 'Permuta de imóveis', `permutar o {{imovel}} por outro imóvel, nas condições que entender, pagando ou recebendo tornas, e outorgar a respectiva escritura`, { campos: [IMV] }),
  p('IMOV-106', 'IMOBILIARIOS', 'Constituir propriedade horizontal', `constituir o regime de propriedade horizontal sobre o {{imovel}}, fixando as fracções autónomas, as partes comuns e a permilagem, e aprovar o respectivo regulamento do condomínio`, { campos: [IMV] }),
  p('IMOV-107', 'IMOBILIARIOS', 'Usufruto', `{{accao}} o direito de usufruto sobre o {{imovel}}, nas condições que entender`, { campos: [{ chave: 'accao', rotulo: 'Acção', tipo: 'RADIO', obrigatorio: true, opcoes: [{ valor: 'constituir', rotulo: 'constituir' }, { valor: 'reservar', rotulo: 'reservar' }, { valor: 'renunciar', rotulo: 'renunciar a' }] }, IMV] }),
  p('IMOV-108', 'IMOBILIARIOS', 'Direito de preferência', `{{accao}} o direito de preferência na alienação do {{imovel}}`, { campos: [{ chave: 'accao', rotulo: 'Acção', tipo: 'RADIO', obrigatorio: true, opcoes: [{ valor: 'exercer', rotulo: 'exercer' }, { valor: 'renunciar', rotulo: 'renunciar a' }] }, IMV] }),
  p('IMOV-109', 'IMOBILIARIOS', 'Justificação notarial', `outorgar escritura de justificação notarial para estabelecimento do trato sucessivo ou reatamento do registo relativo ao {{imovel}}, prestando as declarações necessárias`, { campos: [IMV], regras: [SUG('REG-002')] }),
  p('IMOV-110', 'IMOBILIARIOS', 'Licenças e processos camarários', `requerer, junto da câmara municipal de {{concelho}}, licenças, autorizações e comunicações prévias de obras, de utilização e de ocupação, plantas, certidões e alvarás, apresentar projectos, pagar taxas e acompanhar os respectivos processos`, { campos: [t('concelho', 'Concelho')] }),
  p('IMOV-111', 'IMOBILIARIOS', 'Certificado energético e ficha técnica', `requerer e obter o certificado energético, a ficha técnica da habitação e demais documentos exigidos para a transmissão ou arrendamento do {{imovel}}`, { campos: [IMV] }),
  p('IMOV-112', 'IMOBILIARIOS', 'Mediação imobiliária', `celebrar contrato de mediação imobiliária, com ou sem regime de exclusividade, com {{mediadora}}, para a venda ou arrendamento do {{imovel}}`, { campos: [ent('mediadora', 'Mediadora imobiliária'), IMV] }),
  p('IMOV-113', 'IMOBILIARIOS', 'Cancelar ónus e encargos', `requerer o cancelamento de quaisquer ónus, encargos, penhoras ou registos provisórios que incidam sobre o {{imovel}}, receber os documentos e pagar os emolumentos devidos`, { campos: [IMV] }),
  p('IMOV-114', 'IMOBILIARIOS', 'Dação em cumprimento', `dar em cumprimento o {{imovel}}, para extinção da dívida para com {{credor}}, outorgando a respectiva escritura`, { campos: [IMV, t('credor', 'Credor')] }),

  // ─── Arrendamento ──────────────────────────────────────────────────────────
  p('ARR-101', 'ARRENDAMENTO', 'Gerir arrendamentos', `gerir e administrar os imóveis ${DOG} dados de arrendamento, celebrar, renovar, alterar e fazer cessar contratos, fixar e actualizar rendas, receber rendas e cauções e passar os respectivos recibos, incluindo os recibos electrónicos no Portal das Finanças`, { regras: [SUG('ARR-102')] }),
  p('ARR-102', 'ARRENDAMENTO', 'Comunicar contratos à Autoridade Tributária', 'comunicar à Autoridade Tributária e Aduaneira os contratos de arrendamento e as suas alterações, liquidar e pagar o imposto do selo e emitir os recibos de renda electrónicos'),
  p('ARR-103', 'ARRENDAMENTO', 'Despejo e cobrança de rendas', 'intentar e acompanhar procedimentos especiais de despejo, injunções e acções para cobrança de rendas em atraso, junto do Balcão do Arrendatário e do Senhorio e dos tribunais, podendo constituir mandatário', { regras: [SUG('JUD-005')] }),

  // ─── Condomínio ────────────────────────────────────────────────────────────
  p('COND-101', 'CONDOMINIO', 'Representar em assembleias de condóminos', `representar ${OG} nas assembleias de condóminos do prédio sito em {{morada_predio}}, discutir e votar quaisquer deliberações, aprovar contas e orçamentos e integrar a administração do condomínio`, { campos: [t('morada_predio', 'Morada do prédio')] }),
  p('COND-102', 'CONDOMINIO', 'Pagar quotas e impugnar deliberações', 'pagar as quotas e contribuições de condomínio, requerer declarações de dívida e impugnar deliberações da assembleia de condóminos', { regras: [SUG('COND-101')] }),

  // ─── Banca (Portugal e estrangeiro) ────────────────────────────────────────
  p('BANC-101', 'BANCARIOS', 'Abrir e gerir contas em bancos portugueses', `abrir, movimentar e encerrar contas de depósito à ordem e a prazo em nome ${DOG} em quaisquer instituições de crédito com sede ou sucursal em Portugal, depositar e levantar quantias, requisitar cheques e cartões e aderir aos serviços de banca electrónica`),
  p('BANC-102', 'BANCARIOS', 'Aplicações financeiras', 'subscrever, resgatar, transferir e vender depósitos a prazo, certificados, fundos de investimento, obrigações, acções e outros valores mobiliários, dando as ordens necessárias', { regras: [SUG('BANC-101')] }),
  p('BANC-103', 'BANCARIOS', 'Cofre de aluguer', `aceder ao cofre de aluguer n.º {{cofre}} no {{banco}}, abri-lo, retirar e depositar o seu conteúdo e resolver o respectivo contrato`, { campos: [t('cofre', 'N.º do cofre'), ent('banco', 'Instituição bancária')] }),
  p('BANC-104', 'BANCARIOS', 'Transferências para o estrangeiro', `ordenar transferências de fundos, nacionais e internacionais, das contas ${DOG}, até ao montante de {{limite}} por operação, e prestar as declarações exigidas pela regulamentação cambial`, { campos: [moe('limite', 'Limite por operação')] }),
  p('BANC-105', 'BANCARIOS', 'Prestar fiança ou aval', `prestar fiança ou aval, em nome ${DOG}, a favor de {{beneficiario}}, até ao montante de {{montante}}`, { campos: [t('beneficiario', 'Beneficiário'), moe('montante', 'Montante máximo')] }),
  p('BANC-106', 'BANCARIOS', 'Central de Responsabilidades de Crédito', 'requerer junto do Banco de Portugal o mapa de responsabilidades de crédito e quaisquer informações constantes das bases de dados do Banco de Portugal'),
  p('BANC-107', 'BANCARIOS', 'Renegociar e liquidar créditos', `negociar, renegociar, amortizar e liquidar total ou parcialmente os empréstimos contraídos por ${OG} junto do {{banco}}, assinar os aditamentos contratuais e requerer as declarações de dívida`, { campos: [ent('banco', 'Instituição bancária')] }),

  // ─── Autoridade Tributária ─────────────────────────────────────────────────
  p('FISC-101', 'FISCAIS', 'Portal das Finanças e senha de acesso', `requerer a senha de acesso ao Portal das Finanças em nome ${DOG}, receber a correspondência respectiva e utilizar o portal para todos os actos aqui previstos`),
  p('FISC-102', 'FISCAIS', 'Declaração de IRS', `preencher, submeter e corrigir as declarações de IRS ${DOG}, relativas aos anos que entender, e requerer reembolsos`, { regras: [SUG('FISC-101')] }),
  p('FISC-103', 'FISCAIS', 'Representante fiscal', `exercer as funções de representante fiscal ${DOG} em Portugal, recebendo as notificações e cumprindo as obrigações declarativas perante a Autoridade Tributária e Aduaneira`),
  p('FISC-104', 'FISCAIS', 'Alterar domicílio fiscal', `requerer a alteração do domicílio fiscal ${DOG} junto da Autoridade Tributária e Aduaneira`),
  p('FISC-105', 'FISCAIS', 'Pagar impostos e obter certidões', 'pagar quaisquer impostos, taxas e coimas, nomeadamente IMI, IMT, IUC e imposto do selo, requerer planos prestacionais e obter certidões de situação tributária regularizada'),
  p('FISC-106', 'FISCAIS', 'Reclamações, recursos e benefícios fiscais', 'apresentar reclamações graciosas, recursos hierárquicos, pedidos de revisão oficiosa e de isenção ou benefícios fiscais, e acompanhar os respectivos processos'),
  p('FISC-107', 'FISCAIS', 'Actualizar a matriz predial', 'apresentar declarações para inscrição ou actualização de prédios na matriz (Modelo 1 do IMI), requerer avaliações e segundas avaliações e reclamar das matrizes'),
  p('FISC-108', 'FISCAIS', 'Início e cessação de actividade', `declarar o início, alteração ou cessação de actividade ${DOG} junto da Autoridade Tributária e Aduaneira e emitir facturas e recibos electrónicos`),
  p('FISC-110', 'FISCAIS', 'IMT e imposto do selo em transmissões', 'liquidar e pagar o IMT e o imposto do selo devidos em transmissões de imóveis, requerer isenções e apresentar as declarações necessárias'),

  // ─── Segurança Social e pensões ────────────────────────────────────────────
  p('LAB-101', 'LABORAIS', 'Segurança Social Directa', `requerer o acesso à Segurança Social Directa em nome ${DOG}, o número de identificação de segurança social (NISS) e declarações de situação contributiva`),
  p('LAB-102', 'LABORAIS', 'Pensões em Portugal', `requerer pensões de velhice, invalidez ou sobrevivência junto do Instituto da Segurança Social e da Caixa Geral de Aposentações, acompanhar os processos, fazer prova de vida e receber as prestações`),
  p('LAB-103', 'LABORAIS', 'Subsídio por morte e despesas de funeral', 'requerer o subsídio por morte, o reembolso de despesas de funeral e as prestações por morte devidas, e receber os respectivos montantes'),
  p('LAB-104', 'LABORAIS', 'Rescisão e créditos laborais', `negociar e assinar a cessação do contrato de trabalho ${DOG} com {{empregador}}, receber os créditos laborais, requerer a declaração de situação de desemprego e dar quitação`, { campos: [t('empregador', 'Entidade empregadora')] }),

  // ─── Registos ──────────────────────────────────────────────────────────────
  p('REG-101', 'REGISTOS', 'Transcrição de actos de registo civil estrangeiros', `requerer a transcrição, no registo civil português, do assento de {{acto}} ${DOG} lavrado no estrangeiro, instruindo o processo com os documentos necessários`, { campos: [{ chave: 'acto', rotulo: 'Acto', tipo: 'LISTA', obrigatorio: true, opcoes: [{ valor: 'nascimento', rotulo: 'nascimento' }, { valor: 'casamento', rotulo: 'casamento' }, { valor: 'obito', rotulo: 'óbito' }] }] }),
  p('REG-102', 'REGISTOS', 'Divórcio por mútuo consentimento', `requerer e acompanhar o processo de divórcio por mútuo consentimento ${DOG} junto de conservatória do registo civil, apresentar os acordos exigidos por lei e prestar as declarações necessárias, com poderes especiais para o efeito`),
  p('REG-103', 'REGISTOS', 'Registo automóvel', 'requerer, junto de qualquer conservatória ou através do Automóvel Online, o registo de propriedade, de ónus e de cancelamentos relativos a veículos, e obter certificados de matrícula'),
  p('REG-104', 'REGISTOS', 'Certidões permanentes e informações', 'requerer certidões, certidões permanentes, informações e fotocópias de quaisquer registos civis, prediais, comerciais e automóveis'),
  p('REG-105', 'REGISTOS', 'Registo do beneficiário efectivo', 'efectuar e actualizar a declaração do registo central do beneficiário efectivo (RCBE) relativa às entidades de que {{flex outorgantes "o outorgante" "a outorgante" "os outorgantes" "as outorgantes"}} seja sócio, gerente ou beneficiário'),

  // ─── Heranças ──────────────────────────────────────────────────────────────
  p('HER-101', 'HERANCAS', 'Aceitar herança', `aceitar, pura e simplesmente ou a benefício de inventário, a herança aberta por óbito de {{falecido}}`, { campos: [t('falecido', 'Nome do falecido')], regras: [INC('HER-003'), SUG('HER-001'), SUG('HER-104')] }),
  p('HER-102', 'HERANCAS', 'Cabeça-de-casal', `exercer as funções de cabeça-de-casal da herança aberta por óbito de {{falecido}}, administrar os bens, receber rendimentos e créditos e prestar contas`, { campos: [t('falecido', 'Nome do falecido')] }),
  p('HER-103', 'HERANCAS', 'Processo de inventário', `requerer, intervir e acompanhar o processo de inventário para partilha da herança de {{falecido}}, em cartório notarial ou tribunal, licitar, aceitar ou reclamar da relação de bens e aprovar o mapa da partilha`, { campos: [t('falecido', 'Nome do falecido')], regras: [SUG('JUD-005')] }),
  p('HER-104', 'HERANCAS', 'Participação de óbito à Autoridade Tributária', `apresentar a participação de transmissões gratuitas (imposto do selo) por óbito de {{falecido}}, com a relação de bens, e pagar o imposto devido`, { campos: [t('falecido', 'Nome do falecido')] }),
  p('HER-105', 'HERANCAS', 'Receber valores da herança', `receber, de quaisquer instituições de crédito, seguradoras e entidades públicas ou privadas, os saldos, valores e bens pertencentes à herança de {{falecido}}, e dar quitação`, { campos: [t('falecido', 'Nome do falecido')] }),
  p('HER-106', 'HERANCAS', 'Vender bens da herança', `vender, pelo preço e condições que entender, os bens móveis e imóveis que integram a herança de {{falecido}}, receber o preço e outorgar as respectivas escrituras`, { campos: [t('falecido', 'Nome do falecido')], regras: [REQ('HER-101')] }),

  // ─── Judiciais ─────────────────────────────────────────────────────────────
  p('JUD-101', 'JUDICIAIS', 'Injunções e cobranças', 'apresentar requerimentos de injunção e intentar acções para cobrança de dívidas, acompanhando-as até final'),
  p('JUD-102', 'JUDICIAIS', 'Insolvências e reclamação de créditos', `reclamar créditos ${DOG} em processos de insolvência ou execução, representar nas assembleias de credores e votar planos de insolvência ou de recuperação`),
  p('JUD-103', 'JUDICIAIS', 'Julgados de paz e mediação', `representar ${OG} em julgados de paz, sistemas de mediação e centros de arbitragem, transigir e assinar acordos`),

  // ─── Sociedades e empresas ─────────────────────────────────────────────────
  p('SOC-101', 'SOCIETARIOS', 'Constituir sociedade (Empresa na Hora / Online)', `constituir uma sociedade comercial, subscrever e realizar o capital em nome ${DOG}, aprovar o pacto social, designar gerentes ou administradores e requerer o certificado de admissibilidade de firma`, { regras: [SUG('REG-003'), SUG('REG-105')] }),
  p('SOC-102', 'SOCIETARIOS', 'Nomear e destituir gerentes', `nomear, reconduzir e destituir gerentes ou administradores da {{empresa}}, fixar as respectivas remunerações e aceitar ou apresentar renúncias`, { campos: [EMP] }),
  p('SOC-103', 'SOCIETARIOS', 'Alterar o pacto social', `deliberar e outorgar alterações ao pacto social da {{empresa}}, nomeadamente aumento ou redução de capital, alteração da sede, do objecto ou da firma`, { campos: [EMP] }),
  p('SOC-104', 'SOCIETARIOS', 'Dissolver e liquidar sociedade', `deliberar a dissolução e a liquidação da {{empresa}}, aprovar as contas finais e requerer o encerramento da matrícula`, { campos: [EMP] }),
  p('EMP-101', 'EMPRESARIAIS', 'Concursos e contratos públicos', `representar ${OG} em procedimentos de contratação pública, apresentar propostas, prestar cauções e assinar os respectivos contratos`),

  // ─── Automóveis ────────────────────────────────────────────────────────────
  p('AUTO-101', 'AUTOMOVEIS', 'IUC, inspecções e documentos do veículo', 'pagar o imposto único de circulação, apresentar o {{veiculo}} a inspecção periódica, requerer segunda via do certificado de matrícula e tratar de todos os assuntos administrativos relativos ao veículo', { campos: [VEI] }),
  p('AUTO-102', 'AUTOMOVEIS', 'Importar e legalizar veículo', 'importar, desalfandegar e legalizar o {{veiculo}}, pagar o imposto sobre veículos e demais encargos, e requerer a respectiva matrícula', { campos: [VEI] }),
  p('AUTO-103', 'AUTOMOVEIS', 'Levantar veículo apreendido ou rebocado', 'levantar o {{veiculo}} de qualquer parque de remoção ou entidade que o detenha, pagar as despesas devidas e assinar os documentos necessários', { campos: [VEI] }),
  p('AUTO-104', 'AUTOMOVEIS', 'Cancelar matrícula (abate)', 'requerer o cancelamento da matrícula do {{veiculo}}, entregá-lo a operador de gestão de resíduos e receber o certificado de destruição', { campos: [VEI], regras: [INC('AUTO-001')] }),

  // ─── Seguros ───────────────────────────────────────────────────────────────
  p('SEG-101', 'SEGUROS', 'Seguros associados a crédito', 'celebrar os contratos de seguro de vida e multirriscos exigidos pela instituição mutuante e indicar esta como beneficiária'),
  p('SEG-102', 'SEGUROS', 'Resgatar seguros e PPR', `requerer o resgate, total ou parcial, de seguros de vida, planos de poupança-reforma e produtos financeiros equivalentes de que ${OG} seja titular, e receber os respectivos montantes`),

  // ─── Serviços (água, luz, gás, telecomunicações) ───────────────────────────
  p('SERV-101', 'SERVICOS', 'Contratos de fornecimento', `celebrar, alterar, transferir a titularidade e denunciar contratos de fornecimento de água, electricidade, gás, telecomunicações e internet relativos ao imóvel sito em {{morada}}`, { campos: [t('morada', 'Morada do imóvel')] }),
  p('SERV-102', 'SERVICOS', 'Reclamações e pagamentos de serviços', 'apresentar reclamações, pedir segundas vias de facturas, pagar e acordar planos de pagamento relativos a quaisquer serviços contratados'),

  // ─── Correspondência ───────────────────────────────────────────────────────
  p('CORR-101', 'CORRESPONDENCIA', 'Levantar correspondência e encomendas', `levantar, nos CTT e em quaisquer operadores postais, a correspondência registada, encomendas e vales postais dirigidos a ${OG}, e assinar os respectivos avisos de recepção`),
  p('CORR-102', 'CORRESPONDENCIA', 'Alterar morada e reencaminhamento', `requerer a alteração de morada e o reencaminhamento da correspondência ${DOG} junto dos CTT e de quaisquer entidades`),

  // ─── Nacionalidade, migração e legalizações ────────────────────────────────
  p('NAC-101', 'NACIONALIDADE', 'Processo de nacionalidade portuguesa', `requerer a atribuição ou aquisição da nacionalidade portuguesa ${DOG} junto da Conservatória dos Registos Centrais ou de outro serviço competente, instruir e acompanhar o processo e receber as respectivas notificações`),
  p('NAC-102', 'NACIONALIDADE', 'Agência para a Integração, Migrações e Asilo (AIMA)', `representar ${OG} junto da AIMA, marcar atendimentos, entregar e levantar documentos e acompanhar processos de autorização de residência, na medida em que a lei não exija a presença pessoal`),
  p('NAC-103', 'NACIONALIDADE', 'Legalizações e apostilas', 'requerer a legalização, a aposição de apostila e a tradução certificada de quaisquer documentos, junto das entidades portuguesas, angolanas e estrangeiras competentes'),
  p('NAC-104', 'NACIONALIDADE', 'Representação perante embaixadas e consulados', `representar ${OG} perante embaixadas e postos consulares, requerer e levantar documentos, certidões e declarações`),

  // ─── Doações ───────────────────────────────────────────────────────────────
  p('DOA-101', 'DOACOES', 'Doar imóvel', `doar a {{donatario}} o {{imovel}}, com ou sem reserva de usufruto, e outorgar a respectiva escritura`, { campos: [pes('donatario', 'Donatário'), IMV] }),
  p('DOA-102', 'DOACOES', 'Aceitar doação', `aceitar, em nome ${DOG}, a doação de {{bem}} feita por {{doador}}, e outorgar a respectiva escritura ou documento`, { campos: [t('bem', 'Bem doado'), t('doador', 'Doador')] }),
  p('DOA-103', 'DOACOES', 'Doar quantias em dinheiro', `doar a {{donatario}} a quantia de {{montante}}, e assinar os documentos necessários`, { campos: [pes('donatario', 'Donatário'), moe('montante', 'Montante')] }),

  // ─── Saúde e educação ──────────────────────────────────────────────────────
  p('SAU-101', 'SAUDE_EDUCACAO', 'Serviço Nacional de Saúde', `inscrever ${OG} num centro de saúde, requerer o número de utente, levantar relatórios, exames e receitas e tratar de assuntos administrativos junto de estabelecimentos de saúde`),
  p('EDU-101', 'SAUDE_EDUCACAO', 'Matrículas e assuntos escolares', 'efectuar matrículas e renovações de matrícula, requerer equivalências, certificados e diplomas e tratar de assuntos administrativos junto de estabelecimentos de ensino'),

  // ─── Cláusulas ─────────────────────────────────────────────────────────────
  { codigo: 'CL-262', tipo: 'CLAUSULA', categoria: 'CLAUSULAS', nome: 'Referência ao artigo 262.º do Código Civil', descricao: 'Fórmula presente em muitas procurações do posto.', texto: 'A presente procuração é outorgada nos termos do artigo 262.º do Código Civil.' },
  { codigo: 'CL-NCM', tipo: 'CLAUSULA', categoria: 'CLAUSULAS', nome: 'Negócio consigo mesmo', descricao: 'Autorização expressa (art. 261.º do Código Civil).', texto: `{{flex procuradores "O procurador fica autorizado" "A procuradora fica autorizada" "Os procuradores ficam autorizados" "As procuradoras ficam autorizadas"}} a celebrar negócios consigo mesmo, nos termos do artigo 261.º do Código Civil.` },
  { codigo: 'CL-REV', tipo: 'CLAUSULA', categoria: 'CLAUSULAS', nome: 'Revogação de procurações anteriores', descricao: 'Revoga procurações anteriores para os mesmos fins.', texto: 'Ficam revogadas todas as procurações anteriormente outorgadas para os mesmos fins.' },
  { codigo: 'CL-DISP', tipo: 'CLAUSULA', categoria: 'CLAUSULAS', nome: 'Dispensa de prestação de contas', descricao: 'Dispensa o dever de prestar contas.', texto: `{{flex procuradores "O procurador fica dispensado" "A procuradora fica dispensada" "Os procuradores ficam dispensados" "As procuradoras ficam dispensadas"}} de prestar contas.`, regras: [INC('CL-CONTAS')] },
  { codigo: 'CL-ASSINA', tipo: 'CLAUSULA', categoria: 'CLAUSULAS', nome: 'Poderes instrumentais gerais', descricao: 'Fórmula de fecho com os poderes instrumentais habituais.', texto: 'Para os fins indicados, poderá requerer, declarar, pagar, receber, dar quitação, assinar e praticar tudo quanto for necessário ao bom e cabal cumprimento do presente mandato.' },
];
