# Plataforma de Procurações — Guia de implementação passo a passo

Este guia leva a plataforma do ficheiro `.zip` até produção, com a base de dados alojada no **Neon** (PostgreSQL serverless). Cobre todos os componentes, nesta ordem:

| Parte | O quê | Tempo indicativo |
|---|---|---|
| 1 | Pré-requisitos e contas | 30 min |
| 2 | Base de dados Neon (projecto, branches, ligações) | 30 min |
| 3 | Código-fonte e ambiente local | 20 min |
| 4 | Configuração e segredos | 15 min |
| 5 | Base de dados: migrações e dados iniciais | 10 min |
| 6 | Backend (API) — arranque e verificação módulo a módulo | 30 min |
| 7 | Frontend — arranque e percurso completo de uma procuração | 30 min |
| 8 | Testes automáticos | 15 min |
| 9 | Armazenamento de documentos (S3 / R2 / MinIO) | 30 min |
| 10 | Deployment em produção | 1–2 h |
| 11 | Primeira configuração institucional | 1–2 dias (inclui revisão jurídica) |
| 12 | Operação, cópias de segurança e actualizações | — |
| 13 | Lista de verificação antes de entrar em produção | — |
| 14 | Resolução de problemas | — |
| 15 | Referência (variáveis, scripts, permissões, componentes) | — |

Convenções: comandos a executar no terminal aparecem em blocos de código. `<…>` indica um valor seu. Todos os comandos partem da **raiz do projecto** (`procuracoes/`), salvo indicação.

---

## Parte 1 — Pré-requisitos e contas

### 1.1 Software no computador de desenvolvimento

| Software | Versão | Para quê | Verificar |
|---|---|---|---|
| Node.js | 22 LTS (mínimo 20) | API, frontend, scripts | `node -v` |
| npm | 10+ (vem com o Node) | dependências | `npm -v` |
| Git | recente | controlo de versões | `git --version` |
| psql (cliente PostgreSQL) | 16 ou 17 | verificar a base de dados | `psql --version` |
| Chromium / Google Chrome | recente | gerar PDF e testes de browser | ver 3.4 |
| Docker + Docker Compose | recente | deployment (Parte 10) | `docker --version` |
| OpenSSL | qualquer | gerar segredos | `openssl version` |

Windows: use **WSL2 (Ubuntu)**. Todos os comandos deste guia são de Linux/macOS.

### 1.2 Contas necessárias

1. **Neon** — base de dados. <https://neon.tech> (há plano gratuito para desenvolvimento; para produção use um plano pago, pela retenção de histórico e por não suspender o compute).
2. **Armazenamento S3-compatível** para os PDF/DOCX emitidos — uma de: AWS S3, Cloudflare R2, ou MinIO no vosso servidor (Parte 9).
3. **Alojamento** da API e do frontend — um servidor Linux com Docker (recomendado para uma entidade pública) ou uma plataforma gerida (Parte 10).
4. **Domínio** com HTTPS, por exemplo `procuracoes.<dominio-do-posto>`.

> Dados pessoais: escolha regiões na **União Europeia** (Neon: AWS Europe/Frankfurt; S3: Frankfurt, Paris ou Irlanda) e registe o tratamento no inventário RGPD da entidade.

---

## Parte 2 — Base de dados Neon

### 2.1 Criar o projecto

1. Entre na consola Neon → **New Project**.
2. Preencha:
   - **Project name:** `procuracoes`
   - **Postgres version:** 17 (ou 16 — ambas suportadas)
   - **Region:** **AWS Europe Central 1 (Frankfurt)** — a mais próxima de Portugal.
   - **Database name:** `neondb` (pode manter).
3. Crie o projecto. O Neon cria automaticamente o branch **`main`** e o role **`neondb_owner`**.

### 2.2 Criar os branches (ambientes)

Um branch Neon é uma cópia independente e instantânea da base de dados. Use três:

| Branch | Uso | Dados |
|---|---|---|
| `main` | **produção** | reais |
| `dev` | desenvolvimento e homologação | DEMO |
| `test` | testes automáticos (é **apagado** a cada execução) | DEMO |

Na consola: **Branches → Create branch**, *parent* `main`, nome `dev`. Repita para `test`.

Pela linha de comandos (alternativa):

```bash
npx neonctl auth                                   # abre o browser para autenticar
npx neonctl branches create --name dev
npx neonctl branches create --name test
```

### 2.3 Obter as connection strings

Para **cada branch** precisa de **duas** strings. Na consola: seleccione o branch → **Connect**:

- Com **Connection pooling ligado** → *pooled*. O host contém `-pooler`. É usada pela **aplicação** (`DATABASE_URL`).
- Com **Connection pooling desligado** → *direct*. O host não contém `-pooler`. É usada pelas **migrações** e pelos scripts administrativos (`DATABASE_URL_DIRECT`).

Exemplo (valores fictícios):

```
pooled: postgresql://neondb_owner:SENHA@ep-lucky-sun-a1b2c3d4-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
direct: postgresql://neondb_owner:SENHA@ep-lucky-sun-a1b2c3d4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

Porquê duas? O pooler do Neon (PgBouncer, modo transacção) permite muitas ligações leves à aplicação. As migrações e os scripts de arranque criam funções, triggers e extensões, e correm melhor numa ligação directa.

> A aplicação é compatível com o pooler: usa bloqueios transaccionais (`pg_advisory_xact_lock`, `SELECT … FOR UPDATE`) e consultas sem *prepared statements* nomeados.

### 2.4 Testar a ligação

```bash
psql "<direct do branch dev>" -c "select version();"
psql "<direct do branch dev>" -c "create extension if not exists pg_trgm; select extname from pg_extension;"
```

A extensão `pg_trgm` (pesquisa de nomes por semelhança) é suportada pelo Neon; as migrações criam-na automaticamente, este passo só confirma as permissões.

### 2.5 Definições recomendadas do projecto

Na consola, **Settings** do projecto / **Computes** de cada branch:

| Definição | Desenvolvimento (`dev`, `test`) | Produção (`main`) |
|---|---|---|
| Scale to zero (suspensão) | ligado (poupa recursos) | **desligado** se o plano permitir — evita o primeiro pedido lento após inactividade |
| Tamanho do compute | mínimo | 1–2 CU com autoscaling |
| History retention (restauro no tempo) | mínimo | o máximo que o plano permitir (ex.: 7–30 dias) |
| Protected branch | — | **proteger `main`** (impede eliminação acidental) |
| IP Allow | — | restringir aos IP do servidor da API, se o plano permitir |

### 2.6 (Opcional, recomendado em produção) Role de aplicação com privilégios mínimos

Por omissão tudo corre com `neondb_owner`. Para separar quem **altera o esquema** (migrações) de quem **usa os dados** (API):

1. Consola → branch `main` → **Roles → New role** → `procuracoes_app` (guarde a senha).
2. Depois de correr as migrações (Parte 5), execute com a ligação **directa** do `neondb_owner`:

```sql
GRANT USAGE ON SCHEMA public TO procuracoes_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO procuracoes_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO procuracoes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO procuracoes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO procuracoes_app;
```

3. Use `procuracoes_app` em `DATABASE_URL` (pooled) e mantenha `neondb_owner` só em `DATABASE_URL_DIRECT`, disponível apenas no momento de correr migrações.

Os triggers de integridade (versões imutáveis, auditoria *append-only*, procurações emitidas bloqueadas) aplicam-se a qualquer role, incluindo o dono.

---

## Parte 3 — Código-fonte e ambiente local

### 3.1 Extrair e pôr sob controlo de versões

```bash
unzip procuracoes-plataformas.zip
cd procuracoes
git init
git add .
git commit -m "Plataforma de Procurações — versão inicial"
```

O `.gitignore` já exclui `node_modules`, `dist`, `.next`, `.env` e os ficheiros de armazenamento local. **Nunca** faça commit de ficheiros `.env`.

Crie um repositório **privado** (GitHub, GitLab ou servidor Git interno) e envie o código:

```bash
git remote add origin <url-do-repositorio-privado>
git push -u origin main
```

### 3.2 Estrutura do projecto

```
procuracoes/
├── packages/core/          Motor de domínio (TypeScript puro, sem I/O) — partilhado por API e frontend
│   ├── src/extenso.ts        números, datas e valores por extenso (pt-AO/pt-PT)
│   ├── src/genero.ts         concordância de género e número ("seu procurador/sua procuradora")
│   ├── src/validadores.ts    NIF PT/AO, BI angolano, IBAN, código postal…
│   ├── src/campos.ts         22 tipos de campo: validação e formatação jurídica
│   ├── src/template.ts       motor de templates seguro (interpretador, sem eval)
│   ├── src/partes.ts         identificação das pessoas no documento
│   ├── src/poderes.ts        poderes versionados e composição (prosa / alíneas)
│   ├── src/regras.ts         motor de regras e sugestões
│   ├── src/workflow.ts       estados e transições
│   ├── src/documento.ts      construção do documento (AST) e checklist de emissão
│   ├── src/render-html.ts    HTML (pré-visualização e PDF)
│   └── src/render-docx.ts    DOCX editável
├── apps/api/               Backend NestJS
│   ├── drizzle/              migrações SQL (0000 esquema, 0001 triggers de integridade)
│   ├── src/db/               esquema, ligação (Neon), migrate, seed DEMO, bootstrap de produção
│   ├── src/auth/             login, refresh com rotação, logout
│   ├── src/powers/           Centro de Poderes e importação
│   ├── src/persons/          pessoas (dados sensíveis cifrados)
│   ├── src/poa/              procurações, regras, pré-visualização, emissão
│   ├── src/catalog/          tipos, oficiantes, entidades, modelos, procurações recorrentes
│   ├── src/documents/        PDF (Chromium) e armazenamento (S3/local)
│   ├── src/dashboard/        painel, auditoria, exportações
│   ├── src/admin/            utilizadores e perfis
│   └── test/                 testes end-to-end da API
├── apps/web/               Frontend Next.js
│   ├── src/app/              páginas (login, painel, procurações, assistente, pessoas, administração)
│   ├── src/components/       casca, UI, assistente (Power Builder, campos dinâmicos…)
│   ├── src/lib/              cliente da API, sessão, tipos
│   └── e2e/                  testes de browser (Playwright)
├── docs/                   arquitectura, análise do corpus, este guia, catálogo inicial, ecrãs
├── docker-compose.yml        ambiente local completo (PostgreSQL + MinIO + API + web)
└── docker-compose.neon.yml   produção/homologação com Neon
```

### 3.3 Instalar dependências

```bash
node -v                      # deve mostrar v22.x (ou v20.x)
npm ci                       # instala todas as dependências do monorepo, exactamente como no package-lock.json
npm run build -w @proc/core  # compila o motor de domínio (necessário antes de API e web)
```

### 3.4 Chromium para gerar PDF

A API gera os PDF com Chromium em modo *headless*. Escolha uma opção:

- **Linux (Debian/Ubuntu):** `sudo apt install chromium fonts-dejavu-core fonts-liberation2` → caminho `/usr/bin/chromium`
- **macOS:** Google Chrome instalado → `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Qualquer sistema:** `npx playwright install chromium` → o caminho aparece no fim da instalação

Guarde o caminho para `CHROMIUM_PATH` (Parte 4). Em Docker não precisa: a imagem já inclui o Chromium.

**Tipo de letra institucional:** as procurações actuais usam **Merriweather** (licença SIL OFL, gratuita). Instale-a no sistema (ou coloque os `.ttf` em `infra/fonts/` para a imagem Docker) para o PDF ficar tipograficamente igual aos documentos existentes. Sem ela é usado Georgia/Liberation Serif.

---

## Parte 4 — Configuração e segredos

### 4.1 Gerar os segredos

```bash
echo "JWT_SECRET=$(openssl rand -base64 48)"
echo "DATA_ENC_KEY=$(openssl rand -base64 32)"
echo "DATA_BIDX_KEY=$(openssl rand -base64 48)"
```

| Segredo | Função | Cuidado |
|---|---|---|
| `JWT_SECRET` | assina as sessões (15 min) | mudar termina todas as sessões |
| `DATA_ENC_KEY` | cifra AES-256 de n.º de documento, NIF, telefone, email, observações e snapshots das procurações emitidas | **perdê-la = perder esses dados**. Guardar em cofre com cópia offline |
| `DATA_BIDX_KEY` | índice cego para pesquisar por NIF/BI sem os guardar em claro | mudar obriga a recalcular os índices |

Use **segredos diferentes** para `dev` e para produção. Guarde os de produção num gestor de segredos (Bitwarden/Vaultwarden, 1Password, HashiCorp Vault, cofre do fornecedor de cloud).

### 4.2 Ficheiro da API

```bash
cp apps/api/.env.example apps/api/.env
```

Edite `apps/api/.env` para **desenvolvimento** (branch `dev`):

```ini
NODE_ENV=development
PORT=3001
DATABASE_URL="<pooled do branch dev>"
DATABASE_URL_DIRECT="<direct do branch dev>"
TEST_DATABASE_URL="<direct do branch test>"
JWT_SECRET=<gerado>
DATA_ENC_KEY=<gerado>
DATA_BIDX_KEY=<gerado>
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./.storage
CHROMIUM_PATH=<caminho do passo 3.4>
SEGREGACAO_FUNCOES=true
```

Os URLs do Neon têm de ficar **entre aspas**: contêm `&`, que a shell interpretaria.

A API valida a configuração ao arrancar e recusa-se a iniciar se faltar algo, indicando exactamente o quê.

### 4.3 Ficheiro do frontend

```bash
cp apps/web/.env.example apps/web/.env.local
```

Em desenvolvimento o valor por omissão (`API_URL=http://localhost:3001`) serve. O frontend reencaminha `/api/v1/*` para a API, por isso ambos ficam na mesma origem e o cookie de sessão funciona sem CORS.

### 4.4 Carregar as variáveis no terminal

Os scripts de base de dados lêem as variáveis do ambiente:

```bash
set -a; . apps/api/.env; set +a
```

Repita este comando em cada terminal novo onde vá correr comandos da API.

---

## Parte 5 — Base de dados: migrações e dados iniciais

### 5.1 Aplicar as migrações

```bash
npm run db:migrate
# → "Migrações aplicadas."
```

O script usa `DATABASE_URL_DIRECT`. Cria:

- **29 tabelas** (organizações, utilizadores, perfis, permissões, sessões, oficiantes, pessoas, entidades, categorias, poderes e versões, modelos e versões, tipos, numeração, procurações, partes, poderes da procuração, valores de campos, histórico, documentos, procurações recorrentes, importações, auditoria, configurações);
- índices (incluindo pesquisa por semelhança de nomes);
- **triggers de integridade**: versões publicadas imutáveis, procurações emitidas imutáveis, partes/poderes só alteráveis em rascunho, auditoria, documentos e histórico *append-only*.

Verifique:

```bash
psql "$DATABASE_URL_DIRECT" -c "\dt"
psql "$DATABASE_URL_DIRECT" -c "select tgname, tgrelid::regclass from pg_trigger where not tgisinternal order by 2;"
```

Deve ver 9 triggers (`power_versions_imutavel`, `poa_protegida`, `audit_logs_append_only`, …).

### 5.2 Escolher os dados iniciais

| Ambiente | Comando | O que cria |
|---|---|---|
| **Desenvolvimento / formação** (`dev`) | `npm run db:seed` | Tudo DEMO: 4 utilizadores de teste, 24 categorias, 61 poderes/cláusulas ilustrativos, 9 tipos, 10 pessoas fictícias, entidades fictícias, modelos, uma procuração recorrente |
| **Produção** (`main`) | `npm run db:bootstrap` | Só a estrutura institucional: organização, perfis e permissões, **o primeiro administrador**, oficiante, tipos de documento de identificação, 24 categorias, 2 modelos documentais, 9 tipos de procuração, numeração. **Catálogo de poderes vazio** |

**Para já (desenvolvimento):**

```bash
npm run db:seed
# → "Seed DEMO aplicado: 24 categorias, 61 poderes/cláusulas, 9 tipos, 10 pessoas. Password DEMO: Demo#Procuracoes2026"
```

Nunca corra o seed DEMO no branch `main`. O bootstrap de produção está descrito na Parte 11.

---

## Parte 6 — Backend (API)

### 6.1 Arrancar em desenvolvimento

```bash
set -a; . apps/api/.env; set +a      # variáveis carregadas (4.4)
npm run dev:api
# → "API em http://localhost:3001/api/v1"
```

O modo `dev` recompila automaticamente quando altera ficheiros.

### 6.2 Verificação módulo a módulo

Abra outro terminal. Cada passo confirma um componente.

**1. Saúde (API + base de dados Neon)**

```bash
curl -s localhost:3001/api/v1/health
# {"estado":"ok","bd":true,"latenciaBdMs":…}
```

Se o compute do Neon estava suspenso, o primeiro pedido pode demorar 1–3 s. É normal.

**2. Autenticação**

```bash
TOKEN=$(curl -s localhost:3001/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@demo.local","password":"Demo#Procuracoes2026"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -s localhost:3001/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
```

Deve devolver o utilizador com as permissões. Cinco senhas erradas seguidas bloqueiam a conta durante 15 minutos.

**3. Centro de Poderes**

```bash
curl -s "localhost:3001/api/v1/powers?q=imóvel" -H "Authorization: Bearer $TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).itens.map(p=>p.codigo+" "+p.nome).join("\n")'
```

**4. Pessoas (pesquisa por BI via índice cego)**

```bash
curl -s "localhost:3001/api/v1/persons?q=900000001LA001" -H "Authorization: Bearer $TOKEN"
```

O número aparece mascarado (`900•••001`). Na base de dados está cifrado:

```bash
psql "$DATABASE_URL_DIRECT" -c "select full_name, left(doc_number_enc, 30) from persons limit 3;"
```

**5. Procurações e emissão**

A forma mais simples de testar o ciclo completo é pelo frontend (Parte 7) ou pelos testes automáticos (Parte 8). Pela API, o percurso é:

```
POST /poas                        → cria rascunho
PUT  /poas/:id                    → partes, poderes ordenados e valores
GET  /poas/:id/check              → regras, checklist e sugestões
GET  /poas/:id/preview.pdf        → PDF de rascunho
POST /poas/:id/transitions        → {"accao":"SUBMETER"} → VALIDAR (outro utilizador) → EMITIR
GET  /documents/:id/download      → PDF/DOCX emitido (verifica o hash)
```

**6. Auditoria íntegra**

```bash
curl -s localhost:3001/api/v1/audit/verify -H "Authorization: Bearer $TOKEN"
# {"integra":true,"registos":…}
```

### 6.3 Mapa da API

Referência completa em `docs/ARQUITECTURA.md` §4. Resumo:

| Área | Endpoints principais | Permissão |
|---|---|---|
| Saúde | `GET health` | pública |
| Sessão | `POST auth/login`, `auth/refresh`, `auth/logout`, `GET auth/me` | — |
| Poderes | `GET/POST powers`, `PUT powers/:id`, `PUT powers/:id/draft`, `POST powers/:id/publish`, `…/duplicate`, `…/activate`, `…/deactivate`, `…/favorite` | `power.*` |
| Importação | `POST powers/import/preview`, `POST powers/import/:lote/commit` | `power.import` |
| Pessoas | `GET/POST persons`, `GET/PUT persons/:id` | `person.*` |
| Catálogos | `GET poa-types`, `GET/POST officers`, `GET/POST entities`, `GET identity-document-types` | vários |
| Modelos | `GET templates`, `GET/POST templates/:id/versions`, `POST …/versions/:vid/publish` | `template.*` |
| Procurações | `GET/POST poas`, `GET/PUT poas/:id`, `GET poas/:id/check`, `…/preview.html`, `…/preview.pdf`, `POST …/transitions`, `…/duplicate`, `…/signed-scan` | `poa.*` |
| Documentos | `GET documents/:id/download` | `document.download` |
| Gestão | `GET dashboard`, `GET audit`, `GET audit/verify`, `GET exports/poas`, `GET/POST/PUT admin/users`, `GET admin/roles` | vários |

---

## Parte 7 — Frontend

### 7.1 Arrancar

Com a API a correr (6.1), noutro terminal:

```bash
npm run dev:web
```

Abra <http://localhost:3000>.

### 7.2 Contas de demonstração

Palavra-passe comum: `Demo#Procuracoes2026`

| Email | Perfil | Pode |
|---|---|---|
| `admin@demo.local` | Administrador | tudo |
| `operador@demo.local` | Operador | criar e editar rascunhos, submeter |
| `validador@demo.local` | Validador | validar, emitir, cancelar, arquivar |
| `consulta@demo.local` | Consulta | ver e descarregar |

### 7.3 Percurso completo de uma procuração (teste de aceitação manual)

**Como `operador@demo.local`:**

1. **Painel → Nova procuração** (etapa 1). Escolha *Procuração Bancária*, confirme a data, o local e o oficiante → **Criar e identificar o outorgante**.
2. **Outorgante** (etapa 2). Pesquise `amelia` (sem acento) → escolha *Amélia Demo Cardoso*. Para uma pessoa nova use **Nova pessoa**; se o documento já existir, o sistema oferece reutilizar a pessoa em vez de a duplicar.
3. **Procuradores** (etapa 3). Acrescente *Helena* e *Kátia* → **Sempre conjuntamente**.
4. **Poderes** (etapa 4, *Power Builder*).
   - Escolha *Movimentação de conta bancária* → **Adicionar poder**. O motor de regras avisa que falta a *Representação junto de instituição bancária*; carregue em **Adicionar** para corrigir.
   - Reordene arrastando a pega ⋮⋮, com as setas, ou com o teclado (Espaço + setas).
5. **Configuração** (etapa 5). Escolha o banco, escreva um IBAN errado (ex.: `AO06004400006729503110102`) e veja o erro imediato. Corrija para `AO98004400006729503110102`, marque as operações e escreva o limite `1500000`: aparece "Kz 1.500.000,00 (um milhão e quinhentos mil kwanzas)". À direita, o **texto em tempo real** já diz "representar a outorgante…".
6. **Cláusulas** (etapa 6). Acrescente *Prazo de validade*.
7. **Revisão** (etapa 7). Todos os itens da checklist a verde.
8. **Pré-visualização** (etapa 8). Veja o documento com "suas bastantes procuradoras" e "que deverão actuar sempre conjuntamente". **Abrir PDF de rascunho** mostra o PDF com marca de água.
9. **Emissão** (etapa 9) → **Submeter para revisão**.

**Como `validador@demo.local`:**

10. No painel aparece "1 a aguardar validação" → abra-a → **Emissão** → **Validar** → **Emitir procuração**. É atribuído o número `PROC-2026-000001`.
11. **Arquivo** (etapa 10). Descarregue o PDF e o DOCX, carregue a versão assinada (PDF) e consulte o histórico.

**Como `operador@demo.local` outra vez:**

12. Abra a mesma procuração: o conteúdo está bloqueado. Use **Duplicar como novo rascunho** para criar outra a partir desta.

**Como `admin@demo.local`:**

13. **Centro de Poderes** → abra um poder → altere o texto → **Guardar e publicar**. Nos **Versões** vê a anterior como *Retirada*. A procuração emitida no passo 10 continua com o texto antigo.
14. **Auditoria → Verificar integridade**.

---

## Parte 8 — Testes automáticos

### 8.1 Motor de domínio (69 testes, sem base de dados)

```bash
npm test -w @proc/core
```

### 8.2 API contra o Neon (25 testes)

Os testes **apagam e recriam** a base indicada em `TEST_DATABASE_URL`: use sempre o branch `test`, **nunca** `main`. O script recusa URLs que contenham "prod".

```bash
set -a; . apps/api/.env; set +a
echo $TEST_DATABASE_URL        # confirme que é o branch test
npm test -w @proc/api
```

Sem `TEST_DATABASE_URL`, os testes usam um PostgreSQL local (base `procuracoes_test`).

### 8.3 Browser (6 testes Playwright)

Precisam da API e do frontend a correr sobre uma base **com o seed DEMO** (por exemplo o branch `dev` acabado de recriar).

```bash
npx playwright install chromium            # uma vez
# terminal 1: npm run dev:api
# terminal 2: npm run build -w @proc/web && npm run start -w @proc/web
# terminal 3:
npm run test:e2e
```

Para guardar capturas de ecrã: `SHOTS_DIR=./capturas npm run test:e2e`.

Os testes criam procurações e alteram o catálogo. Para voltar a correr sobre dados limpos, esvazie o branch `dev` e volte a aplicar migrações e seed:

```bash
psql "$DATABASE_URL_DIRECT" -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run db:migrate && npm run db:seed
```

Confirme antes que `DATABASE_URL_DIRECT` aponta para `dev`. Este comando apaga todos os dados do branch.

---

## Parte 9 — Armazenamento de documentos

Em desenvolvimento os ficheiros ficam em `apps/api/.storage`. Em produção use armazenamento S3-compatível **privado**. A API nunca expõe URLs públicas: cada download passa pela API, que verifica a permissão, confirma o hash SHA-256 e regista na auditoria.

### Opção A — AWS S3

1. Crie o bucket `procuracoes-<posto>` na região `eu-central-1`.
2. Mantenha **Block all public access** ligado.
3. Ligue **Versioning** e **Default encryption (SSE-S3)**.
4. Opcional, para documentos emitidos: **Object Lock** em modo *Compliance* com a retenção legal definida.
5. Crie um utilizador IAM só para a aplicação, com esta política:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject"],
    "Resource": "arn:aws:s3:::procuracoes-<posto>/*"
  }]
}
```

6. Configure:

```ini
STORAGE_DRIVER=s3
S3_ENDPOINT=
S3_REGION=eu-central-1
S3_BUCKET=procuracoes-<posto>
S3_ACCESS_KEY=<…>
S3_SECRET_KEY=<…>
S3_SSE=AES256
S3_CONDITIONAL_WRITES=true
```

### Opção B — Cloudflare R2

1. Crie o bucket (jurisdição **EU**).
2. Crie um *API token* com permissão *Object Read & Write* limitada ao bucket.
3. Configure:

```ini
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=procuracoes
S3_SSE=none
S3_CONDITIONAL_WRITES=true
```

O R2 cifra sempre em repouso e não aceita o cabeçalho de cifra do S3, por isso `S3_SSE=none`.

### Opção C — MinIO no vosso servidor

O `docker-compose.yml` já inclui MinIO e cria o bucket privado com versionamento.

```ini
S3_ENDPOINT=http://minio:9000
S3_REGION=eu-west-1
```

Garanta cópias de segurança do volume `minio`.

**Verificação:** emita uma procuração de teste e confirme que o objecto aparece no bucket com um nome aleatório (`poa/2026/09/<uuid>.pdf`) e que o download pela aplicação funciona.

---

## Parte 10 — Deployment em produção

Requisitos comuns a todas as opções:

- a API corre em contentor com Chromium (o `apps/api/Dockerfile` trata disso);
- o frontend reencaminha `/api/v1` para a API. `API_URL` tem de estar definido **no build** do frontend;
- tudo servido em **HTTPS** (os cookies de sessão são `Secure` em produção);
- **só `main`** do Neon em produção.

### Opção A (recomendada para a entidade) — servidor próprio com Docker

1. **Servidor:** Linux (Ubuntu 24.04 LTS), 2 vCPU, 4 GB RAM, 20 GB disco. Instale Docker e o plugin Compose.

2. **Código:**

```bash
git clone <repositorio-privado> /opt/procuracoes && cd /opt/procuracoes
```

3. **Configuração de produção:**

```bash
cp apps/api/.env.example apps/api/.env
chmod 600 apps/api/.env
```

Edite `apps/api/.env` com:
- `NODE_ENV=production`;
- as ligações **`main`** do Neon (`DATABASE_URL` pooled, `DATABASE_URL_DIRECT` direct);
- os segredos de **produção**;
- a configuração S3 (Parte 9);
- `CHROMIUM_PATH=/usr/bin/chromium`.

4. **Construir e arrancar** (as migrações correm automaticamente antes da API):

```bash
docker compose -f docker-compose.neon.yml up -d --build
docker compose -f docker-compose.neon.yml ps       # a API deve ficar "healthy"
curl -s localhost:3001/api/v1/health
```

5. **Criar a organização e o primeiro administrador** — uma única vez. Veja a Parte 11, passo 11.1.

6. **HTTPS com Caddy** (certificados automáticos). Em `/etc/caddy/Caddyfile`:

```
procuracoes.<dominio> {
    encode gzip
    reverse_proxy 127.0.0.1:3000
    request_body { max_size 25MB }
}
```

Depois: `sudo systemctl reload caddy`.

Com nginx: `proxy_pass http://127.0.0.1:3000;`, `client_max_body_size 25m;`, certificado Let's Encrypt, e os cabeçalhos `X-Forwarded-For` e `X-Forwarded-Proto`.

7. **Firewall:** abra apenas as portas 22 (restrita), 80 e 443. As portas 3000 e 3001 ficam ligadas só a `127.0.0.1`, como no compose.

### Opção B — plataformas geridas

**API** em Render, Railway ou Fly.io, como *Docker service*:

- Dockerfile: `apps/api/Dockerfile`, *build context* = raiz do repositório.
- Variáveis: as do `apps/api/.env` de produção.
- *Start command:* `sh -c "node dist/db/migrate.js && node dist/main.js"`.
- *Health check path:* `/api/v1/health`.
- Região: Frankfurt, junto ao Neon.

**Frontend** na Vercel:

- *Root directory:* `apps/web`.
- *Build command:* `cd ../.. && npm ci && npm run build -w @proc/core && npm run build -w @proc/web`.
- Variável de ambiente `API_URL=https://<url-publico-da-api>` (necessária **no build**).
- Região das *functions*: Frankfurt (`fra1`).

A Vercel **não** serve para a API: não inclui Chromium e as funções *serverless* não mantêm o pool de ligações.

Nesta opção os pedidos chegam à API através do proxy do Next.js. O limite de pedidos por IP passa a ver o IP do proxy; se precisar de limitação por utilizador final, prefira a Opção A.

### 10.1 Actualizações de versão (procedimento seguro com branches Neon)

1. **Branch de ensaio:** no Neon, crie um branch a partir de `main` (ex.: `ensaio-2026-10`). É uma cópia instantânea dos dados reais.
2. **Ensaie a migração:** corra a nova versão contra esse branch (`DATABASE_URL_DIRECT=<ensaio> npm run db:migrate`) e teste.
3. **Aplique em produção:**
   ```bash
   git pull && docker compose -f docker-compose.neon.yml up -d --build
   ```
   As migrações correm no arranque.
4. **Limpe:** apague o branch de ensaio.
5. **Se algo correr mal:** use o *restore* do Neon para o instante anterior (**Branches → main → Restore**), dentro da janela de retenção.

---

## Parte 11 — Primeira configuração institucional (produção)

### 11.1 Criar a organização e o primeiro administrador

No servidor (Opção A):

```bash
docker compose -f docker-compose.neon.yml run --rm \
  -e BOOT_ORG_CODE=CGA-PORTO \
  -e BOOT_ORG_NAME="Consulado Geral no Porto" \
  -e BOOT_ORG_FULLNAME="Consulado Geral da República de Angola no Porto" \
  -e BOOT_ORG_ADDRESS="<morada oficial completa do posto>" \
  -e BOOT_ORG_CITY="Porto" \
  -e BOOT_ADMIN_EMAIL="<email do administrador>" \
  -e BOOT_ADMIN_NAME="<nome>" \
  -e BOOT_ADMIN_PASSWORD="<mínimo 12 caracteres, com maiúscula, minúscula e dígito>" \
  -e BOOT_OFFICER_NAME="<nome do oficiante>" \
  -e BOOT_OFFICER_TITLE="Vice-Cônsul" \
  api node dist/db/seed/bootstrap.js
```

Em desenvolvimento, o equivalente é preencher as variáveis `BOOT_*` no `.env` e correr `npm run db:bootstrap`.

O script:
- é idempotente: não faz nada se a organização já existir;
- regista a operação na auditoria;
- deixa o catálogo de poderes vazio (próximo passo).

Por segurança, apague do histórico da shell a linha com a palavra-passe e altere-a no primeiro acesso.

### 11.2 Utilizadores e perfis

Entre como administrador → **Utilizadores** → **Novo utilizador**. Crie as contas nominais (nunca partilhadas):

| Perfil | Para quem |
|---|---|
| Operador | quem atende e prepara as procurações |
| Validador | quem revê e emite — o Vice-Cônsul ou outro funcionário designado |
| Consulta | quem só precisa de ver e descarregar |
| Administrador | 1–2 pessoas: gestão do catálogo, utilizadores e modelos |

A **segregação de funções** está ligada: quem redige não pode validar a própria procuração. Para a desligar num posto com um só funcionário: `SEGREGACAO_FUNCOES=false` (decisão a registar formalmente).

### 11.3 Oficiantes e entidades

Enquanto não há ecrã próprio (previsto na Fase 3), use a API com o token do administrador (ver 6.2, passo 2, com as credenciais de produção):

```bash
API=https://procuracoes.<dominio>/api/v1

curl -s -X POST $API/officers -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"nome":"<Nome completo>","cargo":"Cônsul-Geral"}'

curl -s -X POST $API/entities -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"tipo":"BANCO","nome":"<Denominação oficial do banco>","sigla":"<sigla>"}'
```

Tipos de entidade reconhecidos pelos campos dos poderes: `BANCO`, `CONSERVATORIA`, `TRIBUNAL`, `SEGURANCA_SOCIAL`, `ADMIN_TRIBUTARIA`, `OPERADORA`, `SEGURADORA`.

### 11.4 Rever o modelo documental

**Modelos documentais** mostra a estrutura instalada, derivada das procurações actuais do Consulado:
- comparência perante o oficiante;
- verificação de identidade;
- "E POR ELE FOI DITO";
- poderes;
- encerramento e leitura;
- assinaturas.

Peça ao responsável jurídico que reveja cada bloco. Para publicar uma nova versão do modelo:

1. `GET /templates/:id/versions` → copie a `definition` da versão actual.
2. Edite os textos.
3. `POST /templates/:id/versions` com `{ "definicao": …, "nota": "Revisão jurídica de <data>" }`.
4. `POST /templates/:id/versions/:vid/publish`.

As procurações já emitidas nunca mudam. Os rascunhos existentes mantêm a versão com que nasceram.

### 11.5 Catálogo de poderes

1. **Centro de Poderes → Importar** → escolha `docs/catalogo-inicial.json`.
   - São 61 poderes e cláusulas com os padrões mais frequentes das 1 189 procurações analisadas (banca, conservatórias, tribunais, imóveis, menores, heranças…).
   - Entram como **rascunho**, marcados "[A VALIDAR PELO JURÍDICO]".
2. Confirme a importação. Nada fica disponível para os operadores até ser publicado.
3. Em **Centro de Poderes**, use o filtro **Só por publicar**. Para cada poder:
   1. o jurídico revê o texto, os campos e as regras;
   2. ajuste o que for preciso — a validação ao vivo indica variáveis sem campo e vice-versa;
   3. retire a marca "[A VALIDAR…]" da descrição;
   4. **Guardar e publicar**.
4. Para textos próprios da entidade: prepare uma folha Excel ou CSV com as colunas `codigo, categoria, nome, descricao, tipo, texto, campos, regras, exclusivo, tipos_permitidos` (use o **Modelo CSV** do ecrã de importação) e importe.

### 11.6 Numeração

O bootstrap configura `PROC-<ano>-<6 dígitos>` (ou `PROC-<série>-<ano>-…` se definiu `BOOT_NUM_SERIE`). A sequência:
- é por ano e por organização;
- é atribuída só na emissão;
- nunca repete nem deixa lacunas.

### 11.7 Ensaio geral antes de abrir ao público

1. No Neon, crie o branch `ensaio` a partir de `main`.
2. Aponte uma instância de teste da aplicação para esse branch.
3. Emita 5–10 procurações reais de exemplo e compare o PDF com os documentos actuais.
4. Apague o branch quando terminar.

---

## Parte 12 — Operação

### 12.1 Cópias de segurança

| Componente | Mecanismo | Frequência |
|---|---|---|
| Base de dados | **Neon history/restore** (restauro a qualquer instante dentro da janela de retenção) | contínuo |
| Base de dados (fora do Neon) | `pg_dump` cifrado para armazenamento separado | semanal |
| Documentos | versionamento do bucket + Object Lock (S3) / cópia do volume (MinIO) | contínuo |
| Segredos | cópia offline cifrada de `DATA_ENC_KEY`, `DATA_BIDX_KEY`, `JWT_SECRET` | a cada alteração |

Cópia semanal (o `pg_dump` tem de ser da mesma versão maior do Postgres do Neon, ex.: 17):

```bash
pg_dump "$DATABASE_URL_DIRECT" --format=custom --no-owner \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -out procuracoes-$(date +%F).dump.enc -pass file:/root/.backup-pass
```

**Teste de restauro** trimestral: crie um branch Neon a partir de um instante passado, aponte uma instância de teste para ele e confirme que os documentos abrem.

### 12.2 Monitorização

- `GET /api/v1/health` a cada minuto (Uptime Kuma, Better Stack ou a monitorização da entidade).
- **Monitoring** na consola Neon: ligações, CPU e armazenamento.
- Logs: `docker compose -f docker-compose.neon.yml logs -f api`.
- Auditoria: **Auditoria → Verificar integridade**, mensalmente.

### 12.3 Rotação de segredos

- **`JWT_SECRET`:** altere e reinicie a API. Todos os utilizadores voltam a entrar.
- **Senha do Neon:** consola → **Roles → Reset password**. Actualize o `.env` e reinicie.
- **Chaves S3:** crie a nova, actualize, reinicie e só então revogue a antiga.
- **`DATA_ENC_KEY` e `DATA_BIDX_KEY`:** não rodar sem o script de recifragem (previsto na Fase 3).

---

## Parte 13 — Lista de verificação antes de produção

- [ ] Branch `main` protegido, com retenção de histórico adequada e scale-to-zero desligado
- [ ] `DATABASE_URL` (pooled) e `DATABASE_URL_DIRECT` (direct) do branch **main**; role de aplicação com privilégios mínimos (2.6)
- [ ] Segredos de produção gerados de novo, guardados em cofre, com cópia offline de `DATA_ENC_KEY`
- [ ] `NODE_ENV=production`, HTTPS activo, portas 3000/3001 não expostas
- [ ] Bucket privado, versionado e cifrado; download testado
- [ ] **Nenhum dado DEMO** em produção: `select count(*) from persons where is_demo;` → 0
- [ ] Administrador inicial com senha alterada; contas nominais criadas; segregação de funções ligada
- [ ] Oficiantes e entidades reais registados
- [ ] Modelo documental revisto e aprovado pelo jurídico
- [ ] Catálogo de poderes revisto e publicado; poderes DEMO não publicados
- [ ] Merriweather instalada; PDF comparado com os documentos actuais
- [ ] Ensaio geral feito (11.7); procedimento de restauro testado
- [ ] Monitorização de `/health` activa
- [ ] Tratamento de dados registado no inventário RGPD; política de retenção definida

---

## Parte 14 — Resolução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Configuração inválida: DATABASE_URL…` ao arrancar | variável em falta ou mal formada | ver a mensagem; carregar o `.env` (4.4) |
| `timeout expired` / `ETIMEDOUT` no primeiro pedido | compute Neon suspenso a acordar | normal em `dev`; subir `DB_CONNECT_TIMEOUT_MS`; em produção desligar scale-to-zero |
| `self-signed certificate` / erro SSL | proxy corporativo a interceptar TLS | ligar a partir de rede sem intercepção; não desligar a verificação em produção |
| `sorry, too many clients already` | demasiadas ligações directas | a aplicação deve usar o URL **pooled**; baixar `DB_POOL_MAX` |
| Migração falha com erro de *prepared statement* ou *advisory lock* | migração a correr pelo pooler | usar `DATABASE_URL_DIRECT` sem `-pooler` |
| `permission denied for schema public` | role de aplicação sem GRANT | executar o SQL da secção 2.6 |
| `Procuração … já emitida: conteúdo imutável` | tentativa de alterar uma emitida (também por SQL) | comportamento correcto: cancelar e duplicar |
| PDF falha: `Executable doesn't exist` | Chromium em falta | definir `CHROMIUM_PATH` (3.4) ou usar a imagem Docker |
| PDF com letra diferente | Merriweather não instalada | 3.4 / `infra/fonts` |
| Login funciona mas a sessão cai ao recarregar a página | cookie não guardado: HTTP em produção ou domínios diferentes | usar HTTPS e aceder sempre pelo domínio do frontend (proxy `/api/v1`) |
| 401 em ciclo após inactividade | refresh token expirado (7 dias) ou revogado | entrar novamente; ajustar `REFRESH_TTL_DAYS` se necessário |
| Upload da digitalização falha com 413 | limite do proxy | `request_body max_size` (Caddy) / `client_max_body_size` (nginx) ≥ 25 MB |
| R2: `NotImplemented` ao emitir | cabeçalho de cifra S3 | `S3_SSE=none` |
| Fornecedor S3 rejeita `If-None-Match` | escritas condicionais não suportadas | `S3_CONDITIONAL_WRITES=false` |
| Testes da API recusam arrancar | `TEST_DATABASE_URL` contém "prod" | usar o branch `test` |
| Fontes do Google não carregam na rede do posto | bloqueio de rede | normal: são usadas alternativas; servir as fontes a partir de `apps/web/public` |

---

## Parte 15 — Referência

### 15.1 Variáveis de ambiente da API

| Variável | Obrigatória | Por omissão | Descrição |
|---|---|---|---|
| `DATABASE_URL` | sim | — | Neon pooled (aplicação) |
| `DATABASE_URL_DIRECT` | recomendada | = `DATABASE_URL` | Neon direct (migrações, bootstrap, seed) |
| `TEST_DATABASE_URL` | não | PostgreSQL local | branch `test` (apagado pelos testes) |
| `DB_POOL_MAX` | não | 10 | ligações por instância da API |
| `DB_CONNECT_TIMEOUT_MS` | não | 15000 | tolerância ao arranque do compute |
| `JWT_SECRET` | sim | — | ≥ 32 caracteres |
| `JWT_TTL_SECONDS` | não | 900 | duração do token de acesso |
| `REFRESH_TTL_DAYS` | não | 7 | duração da sessão |
| `DATA_ENC_KEY` | sim | — | 32 bytes em base64 |
| `DATA_BIDX_KEY` | sim | — | ≥ 32 caracteres |
| `STORAGE_DRIVER` | não | `local` | `local` ou `s3` |
| `S3_*` | com `s3` | — | ver Parte 9 |
| `CHROMIUM_PATH` | fora de Docker | — | executável do Chromium |
| `SEGREGACAO_FUNCOES` | não | `true` | autor não valida a própria procuração |
| `CORS_ORIGIN` | não | `http://localhost:3000` | só se a API for chamada de outro domínio |
| `BOOT_*` | só no bootstrap | — | ver 11.1 |

Frontend: `API_URL` (lida **no build**).

### 15.2 Scripts npm

| Onde | Comando | Faz |
|---|---|---|
| raiz | `npm ci` | instala tudo |
| raiz | `npm run build` | compila core, API e web |
| raiz | `npm run db:migrate` | aplica migrações (ligação directa) |
| raiz | `npm run db:seed` | dados DEMO (só dev/test) |
| `apps/api` | `npm run db:bootstrap` | primeira instalação de produção |
| `apps/api` | `npm run db:export-catalog` | regenera `docs/catalogo-inicial.json` |
| raiz | `npm run dev:api` / `npm run dev:web` | desenvolvimento |
| raiz | `npm test` | testes do core e da API |
| raiz | `npm run test:e2e` | testes de browser |

### 15.3 Perfis e permissões

| Permissão | Admin | Operador | Validador | Consulta |
|---|:-:|:-:|:-:|:-:|
| `power.read` | ✓ | ✓ | ✓ | ✓ |
| `power.manage`, `power.publish`, `power.import` | ✓ | | | |
| `person.read` | ✓ | ✓ | ✓ | ✓ |
| `person.manage` | ✓ | ✓ | | |
| `poa.read` | ✓ | ✓ | ✓ | ✓ |
| `poa.create`, `poa.edit`, `poa.submit` | ✓ | ✓ | | |
| `poa.validate`, `poa.issue`, `poa.cancel`, `poa.archive` | ✓ | | ✓ | |
| `poa.custom_power` | ✓ | | | |
| `document.download` | ✓ | ✓ | ✓ | ✓ |
| `template.read` | ✓ | ✓ | ✓ | |
| `template.manage`, `template.publish`, `catalog.manage`, `user.manage` | ✓ | | | |
| `audit.read`, `export.run` | ✓ | | ✓ | |

### 15.4 Como cada componente foi implementado (para quem vai manter o código)

| Componente | Onde | Pontos-chave |
|---|---|---|
| Motor de domínio | `packages/core` | TypeScript puro, sem I/O; usado pela API e pelo browser; 69 testes |
| Templates | `core/src/template.ts` | sintaxe Handlebars validada (só helpers aprovados) e executada por **interpretador próprio, sem eval**; variável em falta = erro; sem acesso a protótipos |
| Concordância | `core/src/genero.ts` | `{{flex procuradores "seu bastante procurador" "sua bastante procuradora" "seus bastantes procuradores" "suas bastantes procuradoras"}}` |
| Regras | `core/src/regras.ts` | REQUER, INCOMPATIVEL, SUGERE, exclusivo, tipos permitidos, versão desactualizada; correcções propostas |
| Documento | `core/src/documento.ts` + `render-html.ts` + `render-docx.ts` | um AST → HTML (pré-visualização e PDF) e DOCX; traços de preenchimento em CSS e em tabulação com guia |
| Esquema | `api/src/db/schema.ts` + `drizzle/*.sql` | versões imutáveis, snapshot cifrado na emissão, triggers de integridade |
| Ligação Neon | `api/src/db/conexao.ts` | SSL verificado, `channel_binding`, pooled vs direct, tolerância ao arranque a frio |
| Sessão | `api/src/auth` | argon2id, bloqueio após falhas, JWT curto em memória, refresh opaco em cookie httpOnly com rotação e detecção de reutilização |
| Emissão | `api/src/poa/emissao.service.ts` | transacção única: revalidação → número → snapshot → PDF+DOCX → hashes → armazenamento → auditoria |
| Auditoria | `api/src/common/audit.service.ts` | *append-only* com cadeia de hashes verificável |
| Frontend | `apps/web` | Next.js 15; mesma origem via proxy; CSP estrita; assistente com gravação automática e `lockVersion`; Power Builder com dnd-kit acessível |

Detalhe completo das decisões: `docs/ARQUITECTURA.md`. Estatísticas do arquivo existente: `docs/ANALISE-CORPUS.md`.
