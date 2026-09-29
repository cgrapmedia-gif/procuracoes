# Auditoria técnica — Plataforma de Procurações

Auditoria feita por uma equipa sénior multidisciplinar: arquitectura, full-stack, Next.js, NestJS, PostgreSQL, cloud, segurança, UX/UI institucional, documentos PDF/DOCX, DevOps, QA, gestão documental e processos consulares.

**Princípios seguidos:**
- nenhuma funcionalidade foi removida;
- nenhuma tecnologia foi trocada por preferência;
- só se mexeu na arquitectura onde havia uma razão concreta.

Cada problema indica o **estado**:
- ✅ corrigido nesta entrega;
- 🟡 mitigado ou aceite, com justificação;
- 🔜 recomendado para a fase seguinte.

---

## 1. Resumo executivo

A base técnica é **sólida e adequada ao fim**.

- **Motor de domínio partilhado:** o mesmo código gera o texto na pré-visualização do browser e no servidor. O resultado é igual no ecrã, no PDF e no DOCX.
- **Integridade na base de dados:**
  - procurações emitidas imutáveis;
  - auditoria encadeada por hash;
  - versões de poderes e modelos congeladas.
- **Dados pessoais cifrados**, com pesquisa por índice cego.

Os problemas encontrados eram sobretudo de **acabamento** e de **manutenção de dependências**:

1. **Um bug de interface grave e transversal:** nos formulários em gaveta e em janela, o foco saltava depois de cada tecla. Só se conseguia escrever uma letra, na criação de utilizadores, pessoas, entidades e outros.
2. **Dependências com vulnerabilidades publicadas**, uma delas crítica (Next.js).
3. **Controlos de conta incompletos:** palavra-passe temporária sem troca obrigatória, e um administrador conseguia desactivar-se a si próprio.
4. **Escala da lista de pessoas:** 412 870 registos numa lista sem paginação.

Os quatro ficaram corrigidos nesta entrega. Ficam por fazer, sobretudo, **2FA**, **rotação da chave de cifra** e **monitorização centralizada** (secções 8 e 13).

---

## 2. Arquitectura actual

```
Browser ──HTTPS──▶ Next.js 15 (Vercel)  ──/api/v1 + segredo do proxy──▶ NestJS 11 (Render, Docker + Chromium)
                   · React 19, TanStack Query                            · Drizzle ORM ──TLS──▶ PostgreSQL 17 (Neon)
                   · middleware = proxy mesma origem                     · Playwright/Chromium → PDF; docx → DOCX
                   · @proc/core no browser (texto em tempo real)         · S3 (Cloudflare R2) ou disco local
                                                                         · @proc/core (mesmo motor)
```

| Camada | Tecnologia | Avaliação |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, TanStack Query, dnd-kit | correcto; mantido |
| Backend | NestJS 11 (Express 5), Zod, Throttler, Helmet | correcto; **actualizado de 10 para 11** por segurança |
| Motor de domínio | pacote `@proc/core` (TypeScript puro): templates sem `eval`, concordância, extensos, regras, AST do documento | ponto mais forte do projecto; mantido |
| Base de dados | PostgreSQL 17 (Neon), Drizzle 0.45, 9 migrações SQL, triggers de integridade, `pg_trgm` | correcto; **Drizzle actualizado** por segurança |
| Documentos | HTML → PDF (Chromium headless, sem rede, sem JS); DOCX (`docx`); `pdf-lib` para o rodapé da última página | correcto |
| Autenticação | argon2id; JWT de 15 min em memória; refresh opaco em cookie httpOnly SameSite=Strict com rotação e detecção de reutilização; bloqueio após 5 falhas | correcto; **acrescentada a palavra-passe temporária** |
| Autorização | RBAC com 27 permissões e 5 perfis | correcto |
| Armazenamento | S3-compatível (R2) ou local, chaves aleatórias, sem URLs públicas, SHA-256 verificado no download | correcto |
| Configuração | variáveis validadas com Zod no arranque; `render.yaml`; `vercel.json`; Docker | correcto |
| CI/CD | GitHub Actions (testes e cópia de segurança semanal); deploy automático em Render e Vercel | correcto |

---

## 3. Funcionalidades implementadas

**Procurações:**
- assistente em 10 passos, com gravação automática e controlo de concorrência;
- várias partes (N outorgantes e N procuradores);
- concordância de género e número;
- construtor de poderes com arrastar e largar e motor de regras;
- 22 tipos de campo, com validação de IBAN, NIF e BI;
- texto em tempo real;
- checklist de emissão;
- estados: rascunho → revisão → validada → emitida → assinada → arquivada / cancelada;
- **emissão directa** (perfil Emissor);
- duplicação;
- digitalização assinada;
- **apagar** (uma ou todas, com auditoria).

**Documentos:**
- PDF fiel ao modelo do posto: moldura, traços, insígnia, rodapé só na última página, filetes configuráveis, sem marca de água nos emitidos;
- DOCX editável;
- snapshot cifrado com hash, sem regeneração depois de emitido;
- pré-visualização HTML e PDF de rascunho.

**Parametrização:**
- editor de modelos com pré-visualização ao vivo (letra, espaçamentos, margens, cabeçalho, filetes, textos, assinaturas, rodapé);
- dados do posto, oficiantes, textos dos documentos de identificação, numeração.

**Catálogo:**
- 144 poderes e cláusulas, versionados;
- importação CSV/Excel/JSON;
- publicação em lote e exportação.

**Pessoas:**
- dados sensíveis cifrados;
- pesquisa tolerante (ordem das palavras, acentos, erros de escrita);
- importação no ecrã (até 5 000) e **importação em massa** (412 870 em cerca de 2 minutos);
- aceita registos incompletos, com avisos.

**Administração:**
- utilizadores e perfis;
- auditoria com verificação de integridade;
- painel;
- exportações;
- manutenção.

---

## 4. Funcionalidades incompletas

| # | Funcionalidade | Estado | Nota |
|---|---|---|---|
| I1 | Troca obrigatória da palavra-passe temporária | ✅ | antes era só recomendada |
| I2 | Editar utilizador (nome, perfis) na interface | ✅ | a API já o permitia |
| I3 | Paginação da lista de pessoas | ✅ | indispensável com 412 870 registos |
| I4 | Tamanho do texto das assinaturas | ✅ | novo parâmetro no editor |
| I5 | Verificação pública da autenticidade (QR/código) | 🔜 | o código de verificação já existe; falta a página pública |
| I6 | Fusão de pessoas duplicadas | 🔜 | necessária depois da importação: 280 mil registos sem BI podem repetir pessoas |
| I7 | Autenticação de dois factores (TOTP) | 🔜 | ver segurança |
| I8 | Rotação da chave de cifra (`DATA_ENC_KEY`) | 🔜 | ver segurança |
| I9 | Ecrã para tipos de procuração e poderes sugeridos | 🔜 | hoje por SQL (N8 do guia) |
| I10 | Política de retenção (eliminação automática após N anos) | 🔜 | depende de decisão do Consulado |
| I11 | Filetes verticais livres no DOCX | 🟡 | limitação do formato Word por parágrafos; o PDF emitido é o documento oficial |

---

## 5. Bugs

| # | Gravidade | Descrição | Estado |
|---|---|---|---|
| B1 | **Crítica (UX)** | **Diálogos perdiam o foco a cada tecla.** Afectava a criação de utilizadores, as palavras-passe, a nova pessoa, a nova entidade e os oficiantes. Causa: o efeito de foco dependia de uma função recriada a cada render e voltava a pôr o foco no botão «Fechar». | ✅ o foco só é posto ao abrir; Tab fica dentro do diálogo; Esc fecha; ao fechar, o foco regressa ao ponto de origem. Há um teste de browser que escreve o nome inteiro |
| B2 | Alta | Criar um utilizador com email já existente dava um erro genérico | ✅ 409 com mensagem clara |
| B3 | Alta | Um administrador podia desactivar-se ou retirar-se de administrador, e ficar sem acesso | ✅ bloqueado |
| B4 | Média | Lista de pessoas sem paginação (só as 20 mais recentes) | ✅ |
| B5 | Média | Instalação com duas versões do NestJS em simultâneo (lockfile) | ✅ lockfile limpo |
| B6 | Baixa | Formulário de utilizador sem validação até submeter | ✅ validação em tempo real e erros por campo |
| B7 | Baixa | Pessoas sem documento apareciam com o campo vazio na lista | ✅ indicação «sem documento» e «sexo por indicar» |

Bugs corrigidos em entregas anteriores, confirmados nesta auditoria:
- a importação JSON perdia as regras;
- a numeração ignorava a configuração depois do primeiro número do ano;
- o armazenamento falhava por falta de permissões (EACCES) no Render;
- o seed/bootstrap não funcionava no Windows com Node 24.

---

## 6. Código duplicado

Análise automática (jscpd, blocos de 60 ou mais tokens):
- **0,77 %** de linhas duplicadas;
- **8 clones** pequenos, em 122 ficheiros.

É um valor baixo. Os casos relevantes:

- **Normalização de texto** (acentos e maiúsculas) repetida em `SeletorEntidade`, no construtor e na API. É inofensiva: são 1 a 2 linhas cada. 🔜 Centralizar em `@proc/core` quando se mexer nesses ficheiros.
- **Selectores e editores dos modelos** (`Num`, `EditorFilete`) estão no mesmo ficheiro de propósito, para o editor ser autónomo. 🟡 Aceite.

---

## 7. Dependências

`npm audit` (só produção):

- **Antes:** 13 vulnerabilidades (1 crítica, 5 altas).
  - Next.js com execução remota de código;
  - NestJS, Multer e body-parser com negação de serviço;
  - Drizzle com injecção SQL em identificadores.
- **Depois:** 4, nenhuma crítica.

| Pacote | Antes | Depois | Razão |
|---|---|---|---|
| next | 15.5.4 | **15.5.26** | CVE crítico (RCE); mesma série, sem alterações de código |
| @nestjs/* | 10.4 | **11.2** | DoS em multer/body-parser e injecção; os 33 testes da API passam com Express 5 |
| drizzle-orm / drizzle-kit | 0.36 / 0.28 | **0.45 / 0.31** | injecção SQL em identificadores |
| sharp | — | actualizado | vulnerabilidades em libvips (vem com o Next) |

As que ficam foram avaliadas:
- **postcss:** está dentro do Next e só corre na compilação, sobre CSS do próprio projecto; não é explorável em execução. 🟡 Desaparece com o Next 16, a planear.
- **uuid:** está dentro do exceljs e só afecta as funções v3/v5/v6 com `buf`, que não são usadas. 🟡

**Dependências desnecessárias:** nenhuma (depcheck). Todas as bibliotecas têm uso: `pdf-lib` (rodapé), `papaparse` e `exceljs` (importações), `playwright-core` (PDF), `@dnd-kit` (ordenar poderes).

---

## 8. Segurança

**Já estava correcto (mantido):**
- **Palavras-passe e sessões:** argon2id, bloqueio após 5 falhas, limite de pedidos no login, JWT curto em memória, refresh em cookie httpOnly SameSite=Strict com rotação e detecção de reutilização.
- **Navegador e acesso à API:** CSP estrita (sem `unsafe-eval`), Helmet, anti-CSRF (`X-Requested-With`), API só acessível através do frontend (segredo do proxy).
- **Dados:** cifra AES-256-GCM dos dados pessoais, índice cego (HMAC) para pesquisa, templates sem `eval`, PDF gerado sem rede e sem JavaScript.
- **Integridade:** auditoria com cadeia de hashes; triggers que impedem alterar documentos emitidos, mesmo por SQL directo.
- **Ficheiros e exportações:** hashes verificados no download, protecção contra injecção de fórmulas nos CSV, limites de tamanho nos uploads.

| # | Risco | Estado |
|---|---|---|
| S1 | Dependências vulneráveis (secção 7) | ✅ |
| S2 | Palavra-passe inicial definida pelo administrador ficava em uso para sempre | ✅ troca obrigatória, **imposta no servidor**: até ser alterada, a API recusa tudo excepto alterar a palavra-passe e sair |
| S3 | Consultas à ficha de uma pessoa não ficavam registadas (RGPD) | ✅ cada abertura da ficha completa fica na auditoria (`PESSOA_CONSULTAR`) |
| S4 | Auto-desactivação do administrador | ✅ |
| S5 | Sem 2FA | 🔜 TOTP obrigatório para Administrador, Validador e Emissor |
| S6 | Rotação da `DATA_ENC_KEY` | 🔜 script de recifragem com duas chaves activas durante a transição |
| S7 | Sessão de 7 dias | 🔜 reduzir para 12 h num posto consular (`REFRESH_TTL_DAYS`) e acrescentar expiração por inactividade |
| S8 | Limite de pedidos em memória (uma instância) | 🟡 adequado a uma instância; passar para Redis (Upstash) ao escalar |
| S9 | Digitalizações carregadas sem antivírus | 🔜 verificação com ClamAV (ou serviço equivalente) antes de guardar |
| S10 | Logs sem centralização nem alertas de erro | 🔜 Sentry (ou equivalente) e logs estruturados |
| S11 | Planos gratuitos (Neon, Render, Vercel Hobby) | 🟡 aceitável para arrancar; para produção definitiva, planos pagos (retenção de cópias, sem suspensão, licença) |

---

## 9. UX/UI

| # | Problema | Estado |
|---|---|---|
| U1 | Foco dos diálogos (B1) | ✅ |
| U2 | Formulário de utilizador pobre | ✅ refeito: validação ao vivo, regras da palavra-passe visíveis, **gerar palavra-passe forte**, mostrar e copiar, perfis com descrição do que cada um faz, estado de cada conta (activo, bloqueado, temporária, inactivo), filtro, editar, confirmação antes de desactivar |
| U3 | Lista de pessoas sem páginas nem indicação de registos incompletos | ✅ |
| U4 | Tamanho do texto das assinaturas fixo | ✅ parâmetro no editor |
| U5 | A pré-visualização do editor de modelos não pagina | 🟡 mostra uma folha contínua; a paginação exacta vê-se no PDF |
| U6 | Assistente pensado para ecrã largo | 🔜 revisão para tablet |
| U7 | Acessibilidade sem verificação automática | 🔜 axe-core nos testes de browser |
| U8 | Pesquisa global da barra de topo só procura procurações | 🔜 acrescentar pessoas |

---

## 10. Arquitectura

| # | Observação | Decisão |
|---|---|---|
| A1 | Monorepo com o motor partilhado | **Manter**: é o que garante que ecrã, PDF e DOCX coincidem |
| A2 | PDF gerado dentro do pedido (síncrono) | **Manter** para o volume de um posto (cerca de 0,06 s por emissão com o Chromium aberto). 🔜 Fila de trabalhos só se houver emissões em massa |
| A3 | Uma instância da API (limite de pedidos e Chromium em memória) | 🟡 correcto para a fase 1 |
| A4 | Proxy Vercel → Render | **Manter**: dá mesma origem, cookies seguros e a API fechada ao exterior. 🔜 Validar o limite de tamanho de upload na Vercel com uma digitalização real (há uma nota no guia) |
| A5 | Estrutura multi-posto (coluna `org_id`) | **Manter**: permite outros postos consulares no futuro sem reescrever |
| A6 | Lockfile frágil com workspaces (versões duplicadas) | ✅ corrigido. 🔜 Instalar sempre com `npm ci` no CI |

---

## 11. Melhorias possíveis sem reescrever (roadmap)

**Fase 1 — concluída nesta entrega:**
- B1 a B7;
- S1 a S4;
- U1 a U4;
- dependências;
- testes novos: palavra-passe temporária, email duplicado, auto-protecção, foco dos formulários.

**Fase 2 — segurança e operação (2 a 4 semanas):**
1. 2FA (TOTP) para perfis com poder de emissão.
2. Sessão de 12 h e expiração por inactividade.
3. Sentry e logs estruturados; alertas de falha de cópia de segurança.
4. Antivírus nas digitalizações.
5. Script de rotação da chave de cifra.
6. Página pública de verificação (QR no documento, sem dados pessoais).

**Fase 3 — gestão documental (4 a 8 semanas):**
1. Fusão de pessoas duplicadas, com sugestões por nome, data de nascimento e telefone.
2. Política de retenção e eliminação automática, com relatório.
3. Ecrã de tipos de procuração e poderes sugeridos.
4. Estatísticas por tipo, período e oficiante; exportações em PDF.
5. Acessibilidade (axe) e versão para tablet.

---

## 12. Testes (QA)

| Conjunto | Número | Estado |
|---|---|---|
| Motor de domínio (unitários) | 73 | ✅ |
| API (end-to-end contra PostgreSQL real) | 33 | ✅ |
| Browser (Playwright, fluxos completos) | 8 | ✅ |

Nesta entrega entraram testes para:
- o **foco do formulário** (escreve o nome inteiro sem perder o foco);
- a **palavra-passe temporária** (a API recusa tudo até ser alterada);
- o **email duplicado** (409);
- a **auto-desactivação** do administrador (recusada);
- as **dependências actualizadas** (NestJS 11, Drizzle 0.45 e Next 15.5.26 com todos os testes a passar).

---

## 13. Pontos para decisão do Consulado

1. **2FA obrigatório:** para que perfis?
2. **Duração da sessão:** 12 h, ou outra?
3. **Prazo de conservação:** quanto tempo guardar procurações e digitalizações?
4. **Verificação pública:** incluir QR no documento? Isso altera o modelo visual.
5. **Planos pagos:** quando passar Neon, Render e Vercel para planos pagos (cópias com retenção longa, sem suspensão, licença institucional)?
