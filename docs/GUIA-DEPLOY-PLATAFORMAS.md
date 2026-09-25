# Plataforma de Procurações — Deploy em plataformas (GitHub · Neon · Render · Vercel · Cloudflare R2)

Este guia põe a plataforma em produção **sem gerir servidores**, com a mesma família de serviços do FuelOps.

| Peça | Plataforma | Função |
|---|---|---|
| Código e automatismos | **GitHub** (repositório privado + Actions) | versões, testes automáticos em cada alteração, cópia de segurança semanal |
| Base de dados | **Neon** (Postgres 17, Frankfurt) | dados, restauro a qualquer instante, cópias instantâneas para ensaios |
| API (NestJS + Chromium para PDF) | **Render** (Docker, Frankfurt) | lógica, emissão, geração de PDF/DOCX |
| Frontend (Next.js) | **Vercel** | aplicação que os utilizadores abrem; reencaminha `/api/v1` para o Render |
| Documentos emitidos e cópias | **Cloudflare R2** (jurisdição UE) | PDF/DOCX/digitalizações e cópias cifradas da base |
| Vigilância | **UptimeRobot** | alerta se a aplicação deixar de responder |

```
Utilizador ──HTTPS──▶ Vercel (Next.js) ──/api/v1 + segredo──▶ Render (API) ──SSL──▶ Neon (Postgres)
                                                                    └──────────▶ Cloudflare R2 (documentos)
GitHub ──push──▶ CI (testes) ──ok──▶ Render e Vercel fazem deploy automático
GitHub Actions (domingo) ──pg_dump cifrado──▶ R2 (procuracoes-backups)
```

**Como ler este guia**
- Siga os passos por ordem (A1, A2, …) sem saltar nenhum.
- `PC$` = comando no seu computador. No Windows use o **Git Bash**, que vem com o Git, para os comandos serem iguais.
- `<…>` = valor seu. Substitua incluindo `<` e `>`.
- ✅ **Verificação** = o que tem de ver antes de avançar. Se não vir, veja a secção **Z**.
- Nos painéis do Render, da Vercel e do GitHub **nunca ponha aspas** à volta dos valores. As aspas só se usam no terminal.

---

## A. Folha de valores

Copie para o gestor de senhas da entidade e preencha à medida que avança.

| # | Valor | Obtido em |
|---|---|---|
| V1 | Domínio da aplicação (ex.: `procuracoes.consulado-exemplo.org`) | responsável do domínio |
| V2 | Nome da organização no GitHub | C2 |
| V3 | Neon `main` · **pooled** · `neondb_owner` | D3 |
| V4 | Neon `main` · **direct** · `neondb_owner` | D3 |
| V5 | Neon `main` · **pooled** · `procuracoes_app` | I3 |
| V6 | Neon `main` · **direct** · `procuracoes_backup` | I3 |
| V7 | Cloudflare Account ID | E1 |
| V8 / V9 | R2 chave da aplicação (Access Key ID / Secret) | E3 |
| V10 / V11 | R2 chave das cópias (Access Key ID / Secret) | E4 |
| V12 | `DATA_ENC_KEY` | F1 |
| V13 | `DATA_BIDX_KEY` | F1 |
| V14 | `PROXY_SECRET` | F1 |
| V15 | `BACKUP_PASS` | F1 |
| V16 | URL do Render (ex.: `https://procuracoes-api.onrender.com`) | G3 |
| V17 | Email, nome e palavra-passe inicial do administrador | entidade |
| V18 | Nome e cargo do oficiante principal | entidade |
| V19 | Morada oficial completa do posto | entidade |

---

## B. Contas

Crie todas com o **email institucional** e active a autenticação em dois passos (2FA) em cada uma.

| Plataforma | Endereço | Plano para produção |
|---|---|---|
| GitHub | <https://github.com> | Free chega (repositório privado + Actions) |
| Neon | <https://console.neon.tech> | pago (Launch ou superior): retenção de histórico e sem suspensão |
| Render | <https://dashboard.render.com> | serviço **Standard** (2 GB RAM, necessário para o Chromium) |
| Vercel | <https://vercel.com> | **Pro**: o plano Hobby só permite uso não comercial/pessoal |
| Cloudflare | <https://dash.cloudflare.com> | R2 pago por uso |
| UptimeRobot | <https://uptimerobot.com> | Free chega |

---

## C. Código no GitHub

### C1. Preparar o computador

Instale o **Node.js 22 LTS** (<https://nodejs.org>) e o **Git** (<https://git-scm.com>). Abra o **Git Bash** (Windows) ou o **Terminal** (macOS/Linux):

```bash
PC$ node -v
PC$ git --version
PC$ git config --global user.name "<O seu nome>"
PC$ git config --global user.email "<email institucional>"
```

✅ **Verificação:** o Node mostra `v22.x`.

### C2. Organização e repositório

1. GitHub → **+** (canto superior direito) → **New organization** → plano **Free** → nome, ex.: `consulado-porto-ti` → **V2**.
2. Na organização → **Repositories → New repository**:
   - **Name:** `procuracoes`
   - **Visibility:** **Private**
   - **não** marque README, .gitignore nem licença.

   Clique **Create repository**.

### C3. Enviar o código

```bash
PC$ cd ~/Documentos
PC$ unzip procuracoes-plataformas.zip
PC$ cd procuracoes
PC$ git init -b main
PC$ git add .
PC$ git commit -m "Plataforma de Procurações — versão inicial"
PC$ git remote add origin https://github.com/<V2>/procuracoes.git
PC$ git push -u origin main
```

Se o `push` pedir credenciais, use o *login* pelo browser que o Git abre.

✅ **Verificação:** no GitHub, o repositório mostra as pastas `apps`, `packages`, `docs`, `.github` e os ficheiros `render.yaml` e `README.md`. Confirme que **não** há nenhum ficheiro `.env`.

### C4. O CI arranca sozinho

GitHub → repositório → **Actions**: o fluxo **CI** está a correr. Testa o motor, a API contra um PostgreSQL temporário e compila tudo.

✅ **Verificação:** ao fim de 5–10 minutos fica **verde** (✓).

### C5. Proteger o ramo `main`

Repositório → **Settings → Branches → Add branch ruleset** (ou *Add rule*):
- **Name:** `main`; **Target branches:** *Include default branch*
- ✓ **Require a pull request before merging**
- ✓ **Require status checks to pass** → acrescente **testes**
- ✓ **Block force pushes**

Clique **Create**. A partir daqui, as alterações entram por *pull request* com o CI verde.

---

## D. Neon

### D1. Projecto

1. Console Neon → **New Project**:
   - **Name:** `procuracoes`
   - **Postgres version:** **17**
   - **Cloud:** AWS
   - **Region:** **Europe Central 1 (Frankfurt)**
   - **Database:** `neondb`

   Clique **Create**.
2. **Billing** → plano pago.

### D2. Protecção e retenção

1. **Branches** → `main` → **⋯** → **Set as protected**.
2. **Settings** → *history retention* / *instant restore* → o máximo do plano (idealmente 30 dias).
3. **Branches → main → Computes → Edit**:
   - **Scale to zero:** desligado;
   - **Autoscaling:** 0,5 a 2 CU.

   Clique **Save**.

✅ **Verificação:** `main` aparece com cadeado.

### D3. Ligações do dono (V3, V4)

**Connect** → Branch `main`, Database `neondb`, Role `neondb_owner`:
- **Connection pooling ligado** → copie → **V3** (o host contém `-pooler`);
- **Connection pooling desligado** → copie → **V4**.

---

## E. Cloudflare R2

### E1. Activar

Cloudflare → **R2 Object Storage** → active. Copie o **Account ID** → **V7**.

### E2. Buckets

**Create bucket** duas vezes, ambos com **Location → Specify jurisdiction → European Union (EU)**:
- `procuracoes-documentos`
- `procuracoes-backups`

Em cada bucket → **Settings** → confirme **Public access: Disabled**.

No bucket `procuracoes-backups` → **Settings → Object lifecycle rules → Add rule**:
- **Name:** `apagar-antigas`
- **Prefix:** `base-de-dados/`
- **Delete objects after:** 180 days

Clique **Save**.

O endpoint dos buckets UE é `https://<V7>.eu.r2.cloudflarestorage.com` (repare no `.eu`).

### E3. Chave da aplicação (V8, V9)

**R2 → Manage API tokens → Create API token**:
- **Token name:** `procuracoes-app`
- **Permissions:** Object Read & Write
- **Specify bucket(s):** só `procuracoes-documentos`
- **TTL:** Forever

**Create**. Copie o **Access Key ID** → **V8** e a **Secret Access Key** → **V9**. O segredo só é mostrado esta vez.

### E4. Chave das cópias (V10, V11)

Repita o E3 com nome `procuracoes-backups`, permissões **Object Read & Write**, bucket só `procuracoes-backups` → **V10**, **V11**.

---

## F. Segredos

### F1. Gerar

No Git Bash / Terminal:

```bash
PC$ echo "V12 DATA_ENC_KEY  = $(openssl rand -base64 32)"
PC$ echo "V13 DATA_BIDX_KEY = $(openssl rand -base64 48)"
PC$ echo "V14 PROXY_SECRET  = $(openssl rand -hex 32)"
PC$ echo "V15 BACKUP_PASS   = $(openssl rand -base64 48)"
```

Copie cada valor (só a parte depois do `=`, sem espaços) para o gestor de senhas. Depois limpe o ecrã: `clear`.

- **V12 é insubstituível:** sem ela, os n.º de documento, NIF e contactos cifrados ficam ilegíveis. Guarde também uma cópia offline (papel num cofre ou pen cifrada).
- **V15 é necessária** para abrir as cópias de segurança.

---

## G. API no Render

### G1. Criar a partir do Blueprint

1. Render → **New +** → **Blueprint**.
2. **Connect GitHub** → autorize **apenas** o repositório `<V2>/procuracoes`.
3. Seleccione `procuracoes`. O Render lê o `render.yaml` e mostra o serviço **procuracoes-api** (Docker, Frankfurt, Standard).
4. Preencha os valores pedidos, **sem aspas**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | **V3** (temporário: passa a V5 no passo I4) |
| `DATABASE_URL_DIRECT` | **V4** |
| `DATA_ENC_KEY` | **V12** |
| `DATA_BIDX_KEY` | **V13** |
| `PROXY_SECRET` | **V14** |
| `CORS_ORIGIN` | `https://<V1>` |
| `S3_ENDPOINT` | `https://<V7>.eu.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY` | **V8** |
| `S3_SECRET_KEY` | **V9** |

5. **Apply**.

O Render constrói a imagem (8–15 minutos) e, antes de a pôr no ar, corre as migrações (*pre-deploy*: `node dist/db/migrate.js`).

### G2. Acompanhar o primeiro deploy

Render → **procuracoes-api** → **Events** / **Logs**.

✅ **Verificação:**
- nos logs do *pre-deploy* aparece `Migrações aplicadas.`;
- nos logs do serviço aparece `API em http://localhost:10000/api/v1`;
- o estado do deploy fica **Live**.

### G3. Endereço e testes

Copie o URL do serviço (topo da página, ex.: `https://procuracoes-api.onrender.com`) → **V16**.

```bash
PC$ curl -s <V16>/api/v1/health; echo
PC$ curl -s -o /dev/null -w "%{http_code}\n" <V16>/api/v1/poas
```

✅ **Verificação:**
- o primeiro devolve `{"estado":"ok","bd":true,…}`;
- o segundo devolve **403**: a API recusa pedidos que não venham pelo frontend.

### G4. Deploy só depois do CI

Render → **procuracoes-api** → **Settings → Build & Deploy → Auto-Deploy** → **After CI Checks Pass** → **Save**.

### G5. Confirmar a base de dados

Console Neon → **SQL Editor** (branch `main`, database `neondb`) → cole e **Run**:

```sql
select
  (select count(*) from pg_tables where schemaname = 'public') as tabelas,
  (select count(*) from pg_trigger where not tgisinternal) as triggers;
```

✅ **Verificação:** `tabelas = 29`, `triggers = 9`.

---

## H. Organização e primeiro administrador

Corre uma única vez, a partir do seu computador, directamente contra o Neon.

### H1. Preparar

```bash
PC$ cd ~/Documentos/procuracoes
PC$ npm ci
PC$ npm run build -w @proc/core
```

### H2. Executar

```bash
PC$ read -rsp 'Cole V4 (Neon direct, neondb_owner): ' DATABASE_URL_DIRECT; echo; export DATABASE_URL_DIRECT
PC$ read -rsp 'Palavra-passe inicial do administrador: ' BOOT_ADMIN_PASSWORD; echo; export BOOT_ADMIN_PASSWORD
PC$ export BOOT_ORG_CODE='CGA-PORTO'
PC$ export BOOT_ORG_NAME='Consulado Geral no Porto'
PC$ export BOOT_ORG_FULLNAME='Consulado Geral da República de Angola no Porto'
PC$ export BOOT_ORG_ADDRESS='<V19>'
PC$ export BOOT_ORG_CITY='Porto'
PC$ export BOOT_ADMIN_EMAIL='<V17 email>'
PC$ export BOOT_ADMIN_NAME='<V17 nome>'
PC$ export BOOT_OFFICER_NAME='<V18 nome>'
PC$ export BOOT_OFFICER_TITLE='<V18 cargo, ex.: Vice-Cônsul>'
PC$ export BOOT_NUM_PREFIX='PROC'
PC$ npm run db:bootstrap -w @proc/api
PC$ unset DATABASE_URL_DIRECT BOOT_ADMIN_PASSWORD
```

- A palavra-passe precisa de 12+ caracteres, com maiúscula, minúscula e dígito.
- `<V19>` aparece no documento tal como escrever. Use o formato das procurações actuais: "Rua …, n.º …, freguesia de …, Código Postal …, concelho do Porto".

✅ **Verificação:** a última linha diz `Organização CGA-PORTO criada. Entre com <email>. …`

---

## I. Roles da base de dados com privilégios mínimos

Até aqui a API usa o dono da base. Passa a usar um role que só lê e escreve dados; as cópias de segurança usam um role só de leitura.

### I1. Criar os roles

Console Neon → **Branches → main → Roles → New role**:
- `procuracoes_app` → **Create** → guarde a palavra-passe;
- `procuracoes_backup` → **Create** → guarde a palavra-passe.

### I2. Dar os privilégios

**SQL Editor** (branch `main`) → cole tudo → **Run**:

```sql
-- Aplicação: ler e escrever dados, nada mais
GRANT USAGE ON SCHEMA public TO procuracoes_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO procuracoes_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO procuracoes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO procuracoes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO procuracoes_app;

-- Cópias de segurança: só leitura (inclui o registo das migrações)
GRANT USAGE ON SCHEMA public, drizzle TO procuracoes_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public, drizzle TO procuracoes_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public, drizzle TO procuracoes_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT ON TABLES TO procuracoes_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT ON SEQUENCES TO procuracoes_backup;
```

✅ **Verificação:** "Statement executed successfully", sem erros.

### I3. Ligações dos novos roles (V5, V6)

**Connect**, branch `main`:
- Role `procuracoes_app`, **pooling ligado** → **V5**;
- Role `procuracoes_backup`, **pooling desligado** → **V6**.

### I4. Pôr a API a usar o role limitado

1. Render → **procuracoes-api** → **Environment** → `DATABASE_URL` → **Edit** → cole **V5** → **Save, rebuild, and deploy**.
2. Não altere `DATABASE_URL_DIRECT`: as migrações continuam a correr com o dono.

✅ **Verificação:** o deploy fica **Live** e `curl -s <V16>/api/v1/health` devolve `"estado":"ok"`.

---

## J. Frontend na Vercel

### J1. Importar o projecto

1. Vercel → **Add New… → Project** → **Import Git Repository** → autorize a organização **V2** (só o repositório `procuracoes`) → **Import**.
2. Configure:
   - **Project Name:** `procuracoes`
   - **Framework Preset:** Next.js
   - **Root Directory:** **Edit** → `apps/web` → **Continue**

   Os comandos de instalação e build vêm de `apps/web/vercel.json`; não os altere.
3. **Environment Variables**. Para cada variável, deixe marcado **apenas Production** e desmarque Preview e Development:

| Key | Value |
|---|---|
| `API_URL` | **V16** (sem `/` no fim) |
| `PROXY_SECRET` | **V14** (o mesmo do Render) |
| `NEXT_TELEMETRY_DISABLED` | `1` |

   Só *Production*, para que as pré-visualizações de outros ramos nunca falem com a base de produção.
4. **Deploy**.

✅ **Verificação:** ao fim de 3–6 minutos aparece "Congratulations". Abra o endereço `https://procuracoes-<…>.vercel.app/login`: deve ver o ecrã de entrada.

### J2. Confirmar a ligação ponta a ponta

```bash
PC$ curl -s https://<endereço .vercel.app>/api/v1/health; echo
```

✅ **Verificação:** `{"estado":"ok",…}`. O pedido passou pela Vercel e chegou ao Render com o segredo.

### J3. Região e protecção

- Vercel → Project → **Settings → Functions** → confirme a região **Frankfurt (fra1)** (vem do `vercel.json`).
- **Settings → Deployment Protection** → **Vercel Authentication** para *Preview Deployments* (as pré-visualizações ficam só para a equipa).

---

## K. Domínio próprio

1. Vercel → Project → **Settings → Domains** → **Add** → `<V1>` → **Add**.
2. A Vercel indica o registo DNS a criar, normalmente:

| Tipo | Nome | Valor |
|---|---|---|
| CNAME | `procuracoes` | `cname.vercel-dns.com` |

3. Crie-o no gestor de DNS do domínio. Aguarde até a Vercel mostrar **Valid Configuration** (minutos a algumas horas).
4. Render → **Environment** → confirme `CORS_ORIGIN=https://<V1>` → **Save and deploy**.

✅ **Verificação:** `https://<V1>/login` abre com cadeado válido.

---

## L. Confirmar o IP real dos utilizadores

O limite de tentativas de login e a auditoria usam o IP de quem acede. Com Vercel → Render, o valor correcto é `TRUST_PROXY_HOPS=2` (já definido no `render.yaml`). Confirme:

1. No computador, abra <https://ifconfig.me> e anote o seu IP público.
2. Em `https://<V1>/login`, tente entrar **uma vez** com o email **V17** e uma palavra-passe **errada**.
3. Neon → **SQL Editor**:

```sql
select actor_ip, at from audit_logs where action = 'AUTH_FALHA' order by id desc limit 1;
```

✅ **Verificação:** `actor_ip` é igual ao seu IP.

- Se mostrar um IP da Vercel ou do Render, mude `TRUST_PROXY_HOPS` no Render para `3` e repita.
- Se mostrar um valor inventado ou vazio, use `1` e repita.

---

## M. GitHub: cópias de segurança automáticas

### M1. Segredos do repositório

GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**, um de cada vez:

| Name | Secret |
|---|---|
| `NEON_BACKUP_URL` | **V6** |
| `BACKUP_PASS` | **V15** |
| `R2_BACKUP_ACCESS_KEY` | **V10** |
| `R2_BACKUP_SECRET_KEY` | **V11** |
| `R2_ENDPOINT` | `https://<V7>.eu.r2.cloudflarestorage.com` |

### M2. Primeira cópia (manual)

**Actions → Cópia de segurança semanal → Run workflow → Run workflow**.

✅ **Verificação:**
- o fluxo fica verde e o resumo mostra `Cópia enviada: procuracoes-AAAA-MM-DD.dump.enc (…)`;
- no Cloudflare, o bucket `procuracoes-backups` tem o ficheiro em `base-de-dados/`.

A partir daqui corre sozinho todos os domingos às 02:30 UTC.

- O ficheiro está cifrado com **V15**. Sem ela não é possível restaurar.
- O GitHub desactiva tarefas agendadas em repositórios sem actividade durante 60 dias. Um *commit* de manutenção por trimestre evita-o, ou reactive em **Actions**.

---

## N. Configuração institucional

### N1. Primeiro acesso

1. Abra `https://<V1>`, entre com **V17**.
2. Clique nas **iniciais** (canto inferior esquerdo) → **A minha conta** → **Alterar palavra-passe**. A sessão termina; entre com a nova.

### N2. Utilizadores

**Utilizadores → Novo utilizador**, uma conta nominal por pessoa. Palavra-passe temporária comunicada por canal seguro; cada pessoa altera-a no primeiro acesso (N1, passo 2).

| Perfil | Quem |
|---|---|
| Operador | atendimento |
| Validador | Vice-Cônsul ou funcionário designado |
| Consulta | só leitura |
| Administrador | no máximo 2 pessoas |

### N3. Token para operações por linha de comandos

Os passos N4–N6 ainda não têm ecrã e usam a API **através do domínio** (passam pelo proxy da Vercel com o segredo). Precisa de `jq`:
- macOS: `brew install jq`
- Windows: `winget install jqlang.jq` e reabrir o Git Bash
- Linux: `sudo apt install jq`

```bash
PC$ API=https://<V1>/api/v1
PC$ read -rp 'Email do administrador: ' ADM
PC$ read -rsp 'Palavra-passe: ' PW; echo
PC$ TOKEN=$(curl -s $API/auth/login -H 'content-type: application/json' -d "$(jq -n --arg e "$ADM" --arg p "$PW" '{email:$e,password:$p}')" | jq -r .accessToken); unset PW
PC$ echo ${TOKEN:0:12}
```

✅ **Verificação:** mostra 12 caracteres (não `null`). O token vale 15 minutos; se aparecer `401`, repita.

### N4. Oficiantes adicionais

O oficiante principal já foi criado no H2. Para cada outro:

```bash
PC$ curl -s -X POST $API/officers -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
      -d '{"nome":"<Nome completo>","cargo":"Cônsul-Geral"}' | jq .
```

### N5. Entidades

Um comando por entidade, com a denominação oficial completa:

```bash
PC$ curl -s -X POST $API/entities -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
      -d '{"tipo":"BANCO","nome":"<Denominação oficial>, S.A.","sigla":"<SIGLA>"}' | jq .
PC$ curl -s $API/entities -H "Authorization: Bearer $TOKEN" | jq -r '.[] | "\(.type)\t\(.name)"'
```

Tipos: `BANCO`, `CONSERVATORIA`, `TRIBUNAL`, `SEGURANCA_SOCIAL`, `ADMIN_TRIBUTARIA`, `OPERADORA`, `SEGURADORA`.

### N6. Revisão jurídica do modelo documental

```bash
PC$ cd ~/Documentos/procuracoes
PC$ TID=$(curl -s $API/templates -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.code=="CONSULAR_PROSA") | .id')
PC$ curl -s $API/templates/$TID/versions -H "Authorization: Bearer $TOKEN" | jq '.[0].definition' > modelo-prosa.json
PC$ jq -r '.blocos[] | select(.texto) | .texto' modelo-prosa.json
```

1. Envie o texto ao responsável jurídico.
2. Se houver alterações, edite `modelo-prosa.json`: só o conteúdo dos campos `"texto"`, sem mexer nas partes `{{…}}`.
3. Publique:

```bash
PC$ VID=$(jq -n --slurpfile d modelo-prosa.json '{definicao:$d[0], nota:"Revisão jurídica inicial"}' \
      | curl -s -X POST $API/templates/$TID/versions -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d @- | jq -r .id)
PC$ curl -s -X POST $API/templates/$TID/versions/$VID/publish -H "Authorization: Bearer $TOKEN" | jq .
PC$ rm modelo-prosa.json
```

✅ **Verificação:** `{"publicado":2}`.

Repita para `CONSULAR_LISTA` (tipos Geral e Empresarial).

### N7. Catálogo de poderes

1. Aplicação → **Centro de Poderes → Importar** → ficheiro `docs/catalogo-inicial.json` do projecto.

   ✅ **Verificação:** "Linhas 61 · Novos 61 · Duplicados 0 · Com erros 0".

2. **Importar 61 poderes**. Entram em rascunho, invisíveis para os operadores.
3. **Centro de Poderes** → **Só por publicar**. Para cada poder, com o jurídico:
   1. reveja texto, campos e regras (à direita tem de aparecer "Variáveis e campos coerentes");
   2. na descrição, apague `[A VALIDAR PELO JURÍDICO] `;
   3. em **Nota da alteração**, escreva `Aprovado por <nome>, <data>`;
   4. **Guardar e publicar**.
4. Poderes que não serão usados: abra e **Desactivar**.

✅ **Verificação:** com **Só por publicar** activo, a lista fica vazia.

### N8. Poderes sugeridos por tipo (opcional)

Neon → **SQL Editor**, só com códigos **publicados**:

```sql
UPDATE poa_types SET suggested_power_codes = '{BANC-001,BANC-002,BANC-007}' WHERE code = 'BANCARIA';
UPDATE poa_types SET suggested_power_codes = '{IMOV-001,IMOV-004,REG-002}'  WHERE code = 'IMOVEL_VENDA';
UPDATE poa_types SET suggested_power_codes = '{JUD-001,JUD-004,JUD-005}'    WHERE code = 'JUDICIAL';
```

---

## O. Ensaio geral e abertura

O ensaio usa uma **cópia** da base: não gasta números reais nem deixa procurações de teste.

### O1. Cópia da base

Neon → **Branches → Create branch**: **Name** `ensaio`, **Parent** `main`, *current point in time* → **Create**.

**Connect** → branch `ensaio`, role `neondb_owner`: copie a **pooled** e a **direct**.

### O2. Apontar a API para a cópia

Render → **procuracoes-api** → **Environment** → **Edit**:
- `DATABASE_URL` → pooled do `ensaio`;
- `DATABASE_URL_DIRECT` → direct do `ensaio`;
- `STORAGE_DRIVER` → `local`;
- **Add Environment Variable**: `STORAGE_LOCAL_DIR` = `/tmp/ensaio`.

Clique **Save and deploy** e espere pelo estado **Live**.

### O3. Ensaiar

Com um operador e um validador reais, emita **5 a 10 procurações** com dados de exemplo:
- uma bancária;
- uma com dois outorgantes;
- uma com duas procuradoras;
- uma de menor;
- uma de venda de imóvel;
- uma com poder personalizado.

Carregue também uma **digitalização assinada de ~15 MB**, para confirmar que ficheiros grandes passam pela Vercel.

Compare os PDF com procurações actuais do mesmo tipo. As correcções fazem-se depois em produção (N6/N7), não na cópia.

### O4. Voltar à produção

Render → **Environment**:
- `DATABASE_URL` → **V5**;
- `DATABASE_URL_DIRECT` → **V4**;
- `STORAGE_DRIVER` → `s3`;
- apague `STORAGE_LOCAL_DIR`.

Clique **Save and deploy**.

Neon → **SQL Editor** (branch **main**):

```sql
select count(*) from powers_of_attorney;
```

✅ **Verificação:** `0`. Depois, Neon → branch `ensaio` → **⋯ → Delete**.

### O5. Abrir ao serviço

1. Comunique `https://<V1>` aos utilizadores.
2. Mantenha o procedimento antigo em paralelo durante 2 semanas.
3. Registe a data de entrada em produção.

---

## P. Vigilância

### P1. UptimeRobot

**Add New Monitor**:
- **Type:** HTTP(s) – Keyword
- **URL:** `https://<V1>/api/v1/health`
- **Keyword:** `"ok"` (*exists*)
- **Interval:** 5 min
- **Alert contacts:** administrador e TI

### P2. Alertas das plataformas

- **Render** → Account → **Notifications** → *Deploy failed* e *Service unhealthy* por email.
- **Vercel** → Settings → **Notifications** → *Deployment failed*.
- **Neon** → Settings → alertas de consumo, se o plano os tiver.
- **GitHub** → perfil → **Settings → Notifications → Actions** → *Only notify for failed workflows*.

### P3. Rotina

| Quando | O quê |
|---|---|
| Semanal | Actions → a cópia de domingo ficou verde |
| Mensal | Aplicação → **Auditoria → Verificar integridade** |
| Mensal | consumo em Neon, Render, Vercel e R2 |
| Trimestral | teste de restauro (Q4) |

---

## Q. Manutenção

### Q1. Publicar uma nova versão do código

1. No computador, crie um ramo, altere e envie:
   ```bash
   PC$ git switch -c melhoria-x
   PC$ git add . && git commit -m "…" && git push -u origin melhoria-x
   ```
2. GitHub → **Compare & pull request** → aguarde o CI verde → **Merge**.
3. O resto é automático:
   - **Render** espera pelo CI, corre as migrações (*pre-deploy*) e só depois troca para a versão nova, sem interrupção;
   - **Vercel** publica o frontend.

✅ **Verificação:** Render e Vercel com o novo deploy **Live/Ready**; `https://<V1>/api/v1/health` com `ok`.

**Alterações que mudam a base de dados** (ficheiros novos em `apps/api/drizzle/`): antes do *merge*, ensaie num branch Neon. Crie `ensaio` (O1) e, no computador, no ramo da alteração:

```bash
PC$ read -rsp 'Direct do branch ensaio: ' DATABASE_URL_DIRECT; echo; export DATABASE_URL_DIRECT
PC$ npm run build -w @proc/core && npm run db:migrate
PC$ unset DATABASE_URL_DIRECT
```

Se correr bem, faça o *merge* e apague o branch `ensaio`.

### Q2. Voltar atrás

- **API:** Render → **procuracoes-api → Events** → deploy anterior → **Rollback**.
- **Frontend:** Vercel → **Deployments** → deploy anterior → **⋯ → Instant Rollback**.
- Se a versão desfeita tiver alterado a base de dados, restaure também a base (Q3, caso 1) para o instante anterior ao deploy.

### Q3. Restaurar a base de dados

**Caso 1 — dentro da janela de retenção** (erro recente):
1. Neon → **Branches → main → Restore**.
2. Escolha data e hora **anteriores** ao problema → confirme. O Neon guarda o estado substituído num branch de segurança.
3. Render → **Manual Deploy → Restart service**.

**Caso 2 — a partir da cópia semanal:**
1. Cloudflare → `procuracoes-backups` → `base-de-dados/` → descarregue o ficheiro `.dump.enc` pretendido.
2. Decifre e restaure num branch novo. Precisa de Docker no computador, ou de `pg_restore` 17:

   ```bash
   PC$ read -rsp 'BACKUP_PASS (V15): ' BP; echo
   PC$ openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BP -in procuracoes-<data>.dump.enc -out restauro.dump; unset BP
   ```

3. Neon → **Create branch** `restauro` (parent `main`) → copie a **direct** (dono):

   ```bash
   PC$ read -rsp 'Direct do branch restauro: ' R; echo
   PC$ docker run --rm postgres:17 psql "$R" -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   PC$ docker run --rm -v "$PWD":/w postgres:17 pg_restore --no-owner --no-privileges -d "$R" /w/restauro.dump
   PC$ rm restauro.dump; unset R
   ```

4. Confira os dados no **SQL Editor** do branch `restauro`.
5. Para o tornar produção:
   1. Neon → `restauro` → **Set as default**;
   2. repita o **I2** nesse branch;
   3. obtenha as novas ligações (D3/I3);
   4. actualize `DATABASE_URL` e `DATABASE_URL_DIRECT` no Render e o segredo `NEON_BACKUP_URL` no GitHub.

### Q4. Teste de restauro trimestral

1. Faça o **Caso 2** para um branch `teste-restauro`.
2. Confirme `select count(*) from powers_of_attorney;`.
3. Apague o branch.
4. Registe a data.

### Q5. Rodar palavras-passe e chaves

| O quê | Como |
|---|---|
| `procuracoes_app` | Neon → Roles → Reset password → novo V5 → Render `DATABASE_URL` → Save and deploy |
| `neondb_owner` | idem → Render `DATABASE_URL_DIRECT` |
| `procuracoes_backup` | idem → GitHub secret `NEON_BACKUP_URL` |
| R2 app | novo token (E3) → Render `S3_ACCESS_KEY`/`S3_SECRET_KEY` → deploy → teste de emissão → revogar o antigo |
| `PROXY_SECRET` | `openssl rand -hex 32` → Vercel (Production) **e** Render com o mesmo valor → redeploy de ambos |
| `JWT_SECRET` | Render → Environment → **Generate** → Save and deploy (todos voltam a entrar) |
| `DATA_ENC_KEY`, `DATA_BIDX_KEY` | **não rodar** |

### Q6. Pessoas

- **Saída:** Utilizadores → **Desactivar** (as sessões terminam; a auditoria mantém o nome).
- **Esquecimento ou bloqueio:** **Redefinir palavra-passe**.

---

## Z. Problemas e soluções

| Onde | Sintoma | Solução |
|---|---|---|
| C4 | CI vermelho em "API" | abrir o passo nos logs; as mensagens dos testes indicam o ponto exacto |
| G2 | build falha com memória | confirmar plano **Standard** no Render |
| G2 | *pre-deploy* falha: `password authentication failed` | V4 mal copiado: copie de novo, **sem aspas** |
| G2 | `Configuração inválida: …` | variável em falta ou vazia no Render; a mensagem diz qual |
| G2 | `DATA_ENC_KEY: 32 bytes em base64` | gerar com `openssl rand -base64 32`, sem espaços |
| G3 | health não responde | ver **Logs**; o primeiro arranque do Chromium pode levar 30–60 s |
| G3 | `/poas` devolve 401 em vez de 403 | `PROXY_SECRET` não definido no Render |
| I4 | `permission denied for table …` | repetir o **I2** |
| J1 | build Vercel: `Cannot find module '@proc/core'` | **Root Directory** tem de ser `apps/web`; não sobrepor os comandos do `vercel.json` |
| J2 | health pela Vercel devolve 403 | `PROXY_SECRET` diferente entre Vercel e Render, ou não marcado em *Production* → corrigir e **Redeploy** na Vercel |
| J2 | 404 ou erro 5xx | `API_URL` errado ou com `/` no fim |
| K | domínio sem certificado | registo DNS por propagar: verificar na Vercel → Domains |
| L | IP errado na auditoria | ajustar `TRUST_PROXY_HOPS` (L) |
| N1 | a sessão cai ao recarregar a página | aceder sempre pelo mesmo domínio (`<V1>`), com HTTPS |
| N3 | `TOKEN` = `null` | credenciais erradas ou conta bloqueada (15 min) → Q6 |
| O3 | digitalização de 15 MB falha (413 ou erro de rede) | causa provável: limite de tamanho do pedido no proxy da Vercel. Teste com 4 MB; se passar, fixe essa regra (digitalizar a 150–200 dpi, em tons de cinzento) e comunique-a aos operadores |
| emissão | "Executable doesn't exist" | confirmar `CHROMIUM_PATH=/usr/bin/chromium` no Render |
| emissão | erro de armazenamento | V8/V9 errados, token sem o bucket certo, ou endpoint sem `.eu` |
| M2 | cópia falha `server version mismatch` | o fluxo usa `postgres:17`; confirmar Postgres 17 no Neon (D1) |
| M2 | cópia falha `permission denied` | repetir o **I2** (parte das cópias) |
| geral | primeiro pedido lento após inactividade | *scale to zero* do Neon ligado (D2) |

---

## Lista final (assinar antes de abrir ao serviço)

- [ ] B: 2FA activo em GitHub, Neon, Render, Vercel e Cloudflare
- [ ] C3: repositório privado e sem ficheiros `.env`; C4: CI verde; C5: `main` protegido
- [ ] D2: Neon `main` protegido, retenção máxima, sem *scale to zero*
- [ ] E2: buckets R2 na UE, acesso público desligado, regra de ciclo de vida nas cópias
- [ ] F1: V12 e V15 no gestor de senhas **e** em cópia offline
- [ ] G3: `/health` ok e acesso directo à API → 403; G4: deploy só após CI
- [ ] G5: 29 tabelas, 9 triggers
- [ ] I4: API a usar `procuracoes_app`
- [ ] J1: variáveis só em *Production*; J2: ligação ponta a ponta ok
- [ ] K: domínio próprio com HTTPS
- [ ] L: IP real confirmado na auditoria
- [ ] M2: primeira cópia no R2
- [ ] N1: palavra-passe inicial alterada; N2: contas nominais
- [ ] N4/N5: oficiantes e entidades reais
- [ ] N6: modelo aprovado pelo jurídico (nome/data: ______)
- [ ] N7: catálogo revisto e publicado (nome/data: ______)
- [ ] O3/O4: ensaio aprovado; produção com 0 procurações de teste; branch `ensaio` apagado
- [ ] P1: monitor activo e alerta testado; P2: notificações de falha activas
- [ ] Tratamento de dados registado no inventário RGPD; prazo de conservação definido

Responsável técnico: __________________  Data: ____/____/______

Responsável pelo serviço: __________________  Data: ____/____/______
