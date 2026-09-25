# Plataforma de Procurações — Passo a passo para produção

Este guia põe a plataforma em produção, do zero até à primeira procuração real. Segue **um único caminho**, sem alternativas:

| Componente | Escolha |
|---|---|
| Base de dados | **Neon**, região AWS Europe Central 1 (Frankfurt), branch `main` |
| Servidor | VPS **Ubuntu 24.04 LTS** na UE, 2 vCPU, **4 GB RAM**, 40 GB disco |
| Execução | Docker + Docker Compose |
| HTTPS | Caddy (certificados Let's Encrypt automáticos) |
| Documentos PDF/DOCX | **Cloudflare R2**, jurisdição UE, bucket privado |
| Cópias de segurança | Neon (restauro no tempo) + cópia semanal cifrada para um segundo bucket R2 |

**Como ler este guia**
- Cada passo tem um número (ex.: **B3**). Faça-os por ordem, sem saltar nenhum.
- `$` = comando no **servidor**. `PC$` = comando no **seu computador**. Copie cada comando inteiro.
- `<…>` = valor seu. Substitua incluindo os sinais `<` e `>`.
- ✅ **Verificação** = o que tem de ver antes de avançar. Se não vir, pare e consulte a secção **Z**.

---

## A. Preparação (antes de tocar no servidor)

### A1. Folha de valores

Copie esta tabela para um documento **privado** e vá preenchendo. Todos os passos seguintes referem-se a ela.

| # | Valor | Onde o obtém | Preenchido |
|---|---|---|---|
| V1 | Domínio da aplicação (ex.: `procuracoes.exemplo.ao`) | responsável do domínio | |
| V2 | IP público do servidor | fornecedor do VPS (B1) | |
| V3 | Neon, `main`, **pooled**, role `neondb_owner` | A3 | |
| V4 | Neon, `main`, **direct**, role `neondb_owner` | A3 | |
| V5 | Neon, `main`, **pooled**, role `procuracoes_app` | E2 | |
| V6 | R2 Account ID | A5 | |
| V7 | R2 Access Key ID (documentos) | A6 | |
| V8 | R2 Secret Access Key (documentos) | A6 | |
| V9 | R2 Access Key ID (cópias de segurança) | A7 | |
| V10 | R2 Secret Access Key (cópias de segurança) | A7 | |
| V11 | Email e nome do administrador | entidade | |
| V12 | Nome e cargo do oficiante principal | entidade | |
| V13 | Morada oficial completa do posto | entidade | |

Todos os segredos (senhas, chaves, URLs com senha) vão para o **gestor de senhas da entidade**, nunca para email, WhatsApp ou documentos partilhados.

### A2. Criar o projecto Neon

1. Abra <https://console.neon.tech> e crie conta com o email **institucional**.
2. Clique **New Project** e preencha:
   - **Project name:** `procuracoes`
   - **Postgres version:** `17`
   - **Cloud provider:** AWS
   - **Region:** `Europe Central 1 (Frankfurt)`
   - **Database name:** `neondb`
3. Clique **Create project**.
4. Escolha um plano pago: **Billing → Change plan**. O plano gratuito suspende a base e tem retenção de histórico curta, o que não serve para produção.
5. Em **Branches**, abra `main` → menu **⋯** → **Set as protected**.
6. Em **Settings → Storage** (ou **Instant restore**, conforme a versão da consola), ponha a **history retention** no máximo que o plano permitir, idealmente 30 dias.
7. Em **Branches → main → Computes → Edit**:
   - **Scale to zero:** desligado, se o plano permitir;
   - **Autoscaling:** mínimo 0,5 CU, máximo 2 CU.

   Clique **Save**.

✅ **Verificação:** o branch `main` aparece com o cadeado de protegido.

### A3. Obter as ligações ao Neon (V3, V4)

1. No painel do projecto, clique **Connect**.
2. Seleccione **Branch** `main`, **Database** `neondb`, **Role** `neondb_owner`.
3. Com **Connection pooling ligado**, copie a string → **V3**. O host contém `-pooler`.
4. Com **Connection pooling desligado**, copie a string → **V4**. O host **não** contém `-pooler`.

Ambas terminam em `?sslmode=require&channel_binding=require`. Mantenha o texto exactamente como está.

### A4. Domínio

No gestor de DNS do domínio, crie um registo:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `procuracoes` (a parte antes do domínio) | V2 (IP do servidor, quando o tiver em B1) | 300 |

Faça este passo **depois** do B1, quando tiver o IP.

### A5. Cloudflare R2 — bucket dos documentos

1. Entre em <https://dash.cloudflare.com> → **R2 Object Storage**. Active o R2 se for a primeira vez (pede meio de pagamento).
2. Copie o **Account ID** mostrado à direita → **V6**.
3. Clique **Create bucket**:
   - **Name:** `procuracoes-documentos`
   - **Location:** **Specify jurisdiction** → **European Union (EU)**
   - **Default storage class:** Standard

   Clique **Create bucket**.
4. Dentro do bucket → **Settings** → confirme **Public access: Disabled** (é o padrão; nunca o ligue).
5. Crie o segundo bucket, igual: `procuracoes-backups`, jurisdição **EU**.

> Buckets com jurisdição UE têm um endpoint próprio: `https://<V6>.eu.r2.cloudflarestorage.com`. Repare no `.eu`.

### A6. Chave R2 para a aplicação (V7, V8)

1. **R2 → Manage API tokens → Create API token**.
2. Preencha:
   - **Token name:** `procuracoes-app`
   - **Permissions:** **Object Read & Write**
   - **Specify bucket(s):** apenas `procuracoes-documentos`
   - **TTL:** Forever
3. **Create API Token**. Copie **Access Key ID** → **V7** e **Secret Access Key** → **V8**. O segredo só é mostrado esta vez.

### A7. Chave R2 para as cópias de segurança (V9, V10)

Repita A6 com:
- **Token name:** `procuracoes-backups`
- **Permissions:** Object Read & Write
- **Bucket:** apenas `procuracoes-backups`

Copie para **V9** e **V10**.

### A8. Tipo de letra institucional

1. No seu computador, abra <https://fonts.google.com/specimen/Merriweather> → **Get font** → **Download all**.
2. Descompacte o ficheiro. Na pasta `static/` guarde **`Merriweather-Regular.ttf`**, **`Merriweather-Bold.ttf`** e **`Merriweather-Italic.ttf`**. Os nomes podem variar ligeiramente entre versões; escolha os equivalentes Regular, Bold e Italic.

---

## B. Servidor

### B1. Contratar o VPS

Num fornecedor com datacenter na UE (Hetzner, OVHcloud, Scaleway, DigitalOcean Frankfurt/Amesterdão, AWS Lightsail Frankfurt…):
- **Imagem:** Ubuntu 24.04 LTS
- **Recursos:** 2 vCPU, 4 GB RAM, 40 GB SSD
- **Autenticação:** chave SSH

Se ainda não tem chave SSH no seu computador:

```bash
PC$ ssh-keygen -t ed25519 -C "procuracoes-admin"
PC$ cat ~/.ssh/id_ed25519.pub
```

Cole o conteúdo da chave **pública** no painel do fornecedor quando criar o servidor.

Anote o IP → **V2**. Agora faça o passo **A4** (DNS).

### B2. Primeira entrada e utilizador administrativo

```bash
PC$ ssh root@<V2>
```

No servidor, como root:

```bash
$ adduser --gecos "" admin
$ usermod -aG sudo admin
$ mkdir -p /home/admin/.ssh
$ cp /root/.ssh/authorized_keys /home/admin/.ssh/
$ chown -R admin:admin /home/admin/.ssh
$ chmod 700 /home/admin/.ssh && chmod 600 /home/admin/.ssh/authorized_keys
$ exit
```

O `adduser` pede uma palavra-passe: guarde-a no gestor de senhas (é pedida pelo `sudo`).

```bash
PC$ ssh admin@<V2>
```

✅ **Verificação:** entrou como `admin` sem pedir palavra-passe SSH.

### B3. Fechar o acesso SSH a root e a palavras-passe

```bash
$ sudo tee /etc/ssh/sshd_config.d/99-endurecimento.conf > /dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
$ sudo systemctl restart ssh
```

✅ **Verificação:** **sem fechar a sessão actual**, abra outro terminal e confirme `PC$ ssh admin@<V2>`. Só depois feche a primeira sessão.

### B4. Actualizações, hora, utilitários

```bash
$ sudo apt update && sudo apt -y full-upgrade
$ sudo apt -y install unzip jq ufw fail2ban unattended-upgrades rclone
$ sudo timedatectl set-timezone Europe/Lisbon
$ sudo dpkg-reconfigure -plow unattended-upgrades
```

Responda **Yes** às actualizações automáticas de segurança.

```bash
$ sudo reboot
```

Espere um minuto e volte a entrar: `PC$ ssh admin@<V2>`.

### B5. Memória de troca (evita falhas no build)

```bash
$ sudo fallocate -l 2G /swapfile
$ sudo chmod 600 /swapfile
$ sudo mkswap /swapfile && sudo swapon /swapfile
$ echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

✅ **Verificação:** `free -h` mostra `Swap: 2.0Gi`.

### B6. Firewall

```bash
$ sudo ufw default deny incoming
$ sudo ufw default allow outgoing
$ sudo ufw allow OpenSSH
$ sudo ufw allow 80/tcp
$ sudo ufw allow 443/tcp
$ sudo ufw enable
```

Responda `y`.

✅ **Verificação:** `sudo ufw status` mostra apenas 22, 80 e 443 como ALLOW.

### B7. Docker

```bash
$ sudo apt -y install ca-certificates curl
$ sudo install -m 0755 -d /etc/apt/keyrings
$ sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
$ sudo chmod a+r /etc/apt/keyrings/docker.asc
$ echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
$ sudo apt update
$ sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
$ sudo usermod -aG docker admin
```

Rotação dos logs dos contentores (evita encher o disco):

```bash
$ sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
$ sudo systemctl restart docker
$ exit
```

Volte a entrar (para o grupo `docker` ter efeito): `PC$ ssh admin@<V2>`.

✅ **Verificação:** `docker run --rm hello-world` mostra "Hello from Docker!".

### B8. Caddy (HTTPS)

```bash
$ sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
$ sudo apt update && sudo apt -y install caddy
```

✅ **Verificação:** `caddy version` mostra v2.x.

---

## C. Instalar a aplicação

### C1. Enviar o código e as fontes

No seu computador, na pasta onde estão os ficheiros:

```bash
PC$ scp procuracoes-plataformas.zip admin@<V2>:/tmp/
PC$ scp Merriweather-Regular.ttf Merriweather-Bold.ttf Merriweather-Italic.ttf admin@<V2>:/tmp/
```

No servidor:

```bash
$ sudo mkdir -p /opt && sudo unzip -q /tmp/procuracoes-plataformas.zip -d /opt
$ sudo chown -R admin:admin /opt/procuracoes
$ cp /tmp/Merriweather-*.ttf /opt/procuracoes/infra/fonts/
$ cd /opt/procuracoes && ls
```

✅ **Verificação:** vê `apps  docker-compose.neon.yml  docs  infra  package.json  packages …` e `ls infra/fonts` mostra os três `.ttf`.

### C2. Criar o ficheiro de configuração de produção

Introduza os valores **sem que apareçam no ecrã**. Cada `read` espera que cole o valor e carregue Enter:

```bash
$ cd /opt/procuracoes
$ read -rsp 'V3 (Neon pooled, neondb_owner): ' V3; echo
$ read -rsp 'V4 (Neon direct, neondb_owner): ' V4; echo
$ read -rp  'V6 (R2 Account ID): ' V6
$ read -rsp 'V7 (R2 Access Key ID documentos): ' V7; echo
$ read -rsp 'V8 (R2 Secret documentos): ' V8; echo
```

Crie o ficheiro (as chaves de cifra são geradas neste momento):

```bash
$ umask 077
$ cat > apps/api/.env <<EOF
NODE_ENV=production
PORT=3001
DATABASE_URL="${V3}"
DATABASE_URL_DIRECT="${V4}"
DB_POOL_MAX=10
DB_CONNECT_TIMEOUT_MS=15000
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
JWT_TTL_SECONDS=900
REFRESH_TTL_DAYS=7
DATA_ENC_KEY=$(openssl rand -base64 32 | tr -d '\n')
DATA_BIDX_KEY=$(openssl rand -base64 48 | tr -d '\n')
CORS_ORIGIN=https://<V1>
STORAGE_DRIVER=s3
S3_ENDPOINT=https://${V6}.eu.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=procuracoes-documentos
S3_ACCESS_KEY=${V7}
S3_SECRET_KEY=${V8}
S3_SSE=none
S3_CONDITIONAL_WRITES=false
CHROMIUM_PATH=/usr/bin/chromium
SEGREGACAO_FUNCOES=true
TRUST_PROXY_HOPS=1
EOF
$ unset V3 V4 V7 V8
$ nano apps/api/.env
```

No `nano`, substitua `<V1>` na linha `CORS_ORIGIN` pelo domínio. Grave com **Ctrl+O**, **Enter**, e saia com **Ctrl+X**.

```bash
$ chmod 600 apps/api/.env
$ cp apps/api/.env /opt/procuracoes/.env.producao.bak && chmod 600 /opt/procuracoes/.env.producao.bak
```

**Guarde as três chaves no gestor de senhas agora.** Sem `DATA_ENC_KEY`, os dados pessoais cifrados ficam irrecuperáveis.

```bash
$ grep -E '^(JWT_SECRET|DATA_ENC_KEY|DATA_BIDX_KEY)=' apps/api/.env
```

Copie as três linhas para o gestor de senhas, com o título "Procurações — chaves de produção". Depois limpe o ecrã: `clear`.

✅ **Verificação:** `grep -c '=' apps/api/.env` mostra `23` e `ls -l apps/api/.env` mostra `-rw-------`.

### C3. Construir as imagens

```bash
$ cd /opt/procuracoes
$ docker compose -f docker-compose.neon.yml build
```

Demora 5–15 minutos na primeira vez.

✅ **Verificação:** termina sem `ERROR` e `docker images | grep procuracoes` mostra `procuracoes-api` e `procuracoes-web`.

---

## D. Primeiro arranque

### D1. Arrancar os serviços

```bash
$ docker compose -f docker-compose.neon.yml up -d
$ docker compose -f docker-compose.neon.yml logs api | tail -20
```

✅ **Verificação:** nos logs aparece `Migrações aplicadas.` e depois `API em http://localhost:3001/api/v1`.

### D2. Confirmar a saúde

```bash
$ sleep 20
$ docker compose -f docker-compose.neon.yml ps
$ curl -s http://127.0.0.1:3001/api/v1/health; echo
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login
```

✅ **Verificação:** `api` aparece `(healthy)`, a saúde devolve `{"estado":"ok","bd":true,…}` e o frontend responde `200`.

### D3. Confirmar a base de dados

```bash
$ DIRECT=$(grep '^DATABASE_URL_DIRECT=' apps/api/.env | cut -d= -f2- | tr -d '"')
$ docker run --rm postgres:17 psql "$DIRECT" -tA -c "select count(*) from pg_tables where schemaname='public';" -c "select count(*) from pg_trigger where not tgisinternal;"
```

✅ **Verificação:** devolve `29` (tabelas) e `9` (triggers de integridade).

### D4. Criar a organização e o administrador

```bash
$ read -rsp 'Palavra-passe inicial do administrador (mín. 12, maiúscula, minúscula, dígito): ' BOOTPW; echo
$ docker compose -f docker-compose.neon.yml run --rm \
  -e BOOT_ORG_CODE="CGA-PORTO" \
  -e BOOT_ORG_NAME="Consulado Geral no Porto" \
  -e BOOT_ORG_FULLNAME="Consulado Geral da República de Angola no Porto" \
  -e BOOT_ORG_ADDRESS="<V13>" \
  -e BOOT_ORG_CITY="Porto" \
  -e BOOT_ADMIN_EMAIL="<V11 email>" \
  -e BOOT_ADMIN_NAME="<V11 nome>" \
  -e BOOT_ADMIN_PASSWORD="$BOOTPW" \
  -e BOOT_OFFICER_NAME="<V12 nome>" \
  -e BOOT_OFFICER_TITLE="<V12 cargo, ex.: Vice-Cônsul>" \
  -e BOOT_NUM_PREFIX="PROC" \
  api node dist/db/seed/bootstrap.js
$ unset BOOTPW
```

✅ **Verificação:** a última linha diz `Organização CGA-PORTO criada. Entre com <email>. …`

A morada `<V13>` aparece no documento tal como a escrever. Use o formato das procurações actuais, por exemplo: "Rua …, n.º …, freguesia de …, Código Postal …, concelho do Porto".

---

## E. Endurecer o acesso à base de dados

### E1. Criar o role da aplicação

Na consola Neon: **Branches → main → Roles → New role** → nome `procuracoes_app` → **Create**. Copie a palavra-passe para o gestor de senhas.

### E2. Dar-lhe só os privilégios necessários

```bash
$ cd /opt/procuracoes
$ DIRECT=$(grep '^DATABASE_URL_DIRECT=' apps/api/.env | cut -d= -f2- | tr -d '"')
$ docker run --rm -i postgres:17 psql "$DIRECT" -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO procuracoes_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO procuracoes_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO procuracoes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO procuracoes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO procuracoes_app;
SQL
```

✅ **Verificação:** a saída mostra `GRANT` (×3) e `ALTER DEFAULT PRIVILEGES` (×2), sem `ERROR`.

Na consola Neon: **Connect** → Branch `main`, Role **`procuracoes_app`**, **Connection pooling ligado** → copie → **V5**.

### E3. Pôr a aplicação a usar o role limitado

```bash
$ nano apps/api/.env
```

Substitua **apenas** o valor da linha `DATABASE_URL="…"` pelo **V5**, mantendo as aspas. **Não altere** `DATABASE_URL_DIRECT`: as migrações continuam a correr com o dono do esquema. Grave e saia.

```bash
$ docker compose -f docker-compose.neon.yml up -d --force-recreate api
$ sleep 25 && curl -s http://127.0.0.1:3001/api/v1/health; echo
$ docker compose -f docker-compose.neon.yml logs api | grep -i "role\|permission" | tail -5
```

✅ **Verificação:** a saúde devolve `"estado":"ok"` e a pesquisa nos logs não encontra `permission denied`.

---

## F. HTTPS e acesso público

### F1. Configurar o Caddy

```bash
$ sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
<V1> {
	encode zstd gzip
	request_body {
		max_size 25MB
	}
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}
	reverse_proxy 127.0.0.1:3000
	log {
		output file /var/log/caddy/procuracoes.log {
			roll_size 20MiB
			roll_keep 10
		}
	}
}
EOF
$ sudo sed -i "s/<V1>/procuracoes.exemplo.ao/" /etc/caddy/Caddyfile
```

No `sed`, substitua `procuracoes.exemplo.ao` pelo seu **V1**. Depois:

```bash
$ sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
$ sudo caddy validate --config /etc/caddy/Caddyfile
$ sudo systemctl reload caddy
```

✅ **Verificação:** `caddy validate` diz `Valid configuration`. Aguarde 1 minuto e depois, no computador:

```bash
PC$ curl -s https://<V1>/api/v1/health
```

Deve devolver `{"estado":"ok",…}` com cadeado HTTPS válido (sem `-k`).

### F2. Porque não há outras portas abertas

- A API (3001) e o frontend (3000) só escutam em `127.0.0.1`, definido no `docker-compose.neon.yml`.
- O Caddy recebe o tráfego externo em 443 e ignora cabeçalhos `X-Forwarded-For` falsificados vindos da Internet.
- O Next.js passa o IP real à API. Por isso `TRUST_PROXY_HOPS=1` está correcto: o limite de tentativas de login e a auditoria registam o IP verdadeiro de cada utilizador.

✅ **Verificação:**

```bash
PC$ curl -s -m 5 http://<V2>:3001/api/v1/health || echo "fechado (correcto)"
```

---

## G. Configuração institucional

### G1. Primeiro acesso e troca da palavra-passe

1. Abra `https://<V1>` no browser.
2. Entre com o email **V11** e a palavra-passe inicial.
3. Clique nas **iniciais** no canto inferior esquerdo → **A minha conta** → **Alterar palavra-passe**.
4. A sessão termina; entre com a nova palavra-passe.

### G2. Criar os utilizadores

**Utilizadores → Novo utilizador**, uma conta nominal por pessoa:

| Perfil | Quem |
|---|---|
| Operador | atendimento: prepara as procurações |
| Validador | Vice-Cônsul ou funcionário designado: revê, emite, cancela |
| Consulta | só leitura |
| Administrador | no máximo 2 pessoas |

Para cada conta:
1. Defina uma palavra-passe **temporária**.
2. Comunique-a por canal seguro (pessoalmente ou por telefone).
3. Peça à pessoa que a altere no primeiro acesso (G1, passo 3).

### G3. Obter um token para as operações por linha de comandos

Os passos G4 e G5 ainda não têm ecrã próprio e usam a API.

```bash
$ read -rp 'Email do administrador: ' ADM
$ read -rsp 'Palavra-passe: ' PW; echo
$ TOKEN=$(curl -s https://<V1>/api/v1/auth/login -H 'content-type: application/json' \
    -d "$(jq -n --arg e "$ADM" --arg p "$PW" '{email:$e,password:$p}')" | jq -r .accessToken)
$ unset PW
$ echo ${TOKEN:0:12}
```

✅ **Verificação:** mostra 12 caracteres (início do token). Se mostrar `null`, a palavra-passe está errada.

O token vale 15 minutos. Se um comando devolver `401`, repita o G3.

### G4. Oficiantes adicionais

O oficiante principal já foi criado no D4. Para cada outro (ex.: Cônsul-Geral):

```bash
$ curl -s -X POST https://<V1>/api/v1/officers -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"nome":"<Nome completo>","cargo":"Cônsul-Geral"}' | jq .
```

✅ **Verificação:** devolve o registo com `"id"`.

### G5. Entidades (bancos, conservatórias, tribunais…)

Um comando por entidade. Use as denominações oficiais completas, porque aparecem no documento:

```bash
$ curl -s -X POST https://<V1>/api/v1/entities -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"tipo":"BANCO","nome":"<Denominação oficial>, S.A.","sigla":"<SIGLA>"}' | jq .
```

Tipos válidos: `BANCO`, `CONSERVATORIA`, `TRIBUNAL`, `SEGURANCA_SOCIAL`, `ADMIN_TRIBUTARIA`, `OPERADORA`, `SEGURADORA`.

Confirme a lista:

```bash
$ curl -s https://<V1>/api/v1/entities -H "Authorization: Bearer $TOKEN" | jq -r '.[] | "\(.type)\t\(.name)"'
```

### G6. Revisão jurídica do modelo documental

1. Exporte o modelo em texto corrido (usado por 7 dos 9 tipos):

```bash
$ cd /opt/procuracoes
$ TID=$(curl -s https://<V1>/api/v1/templates -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.code=="CONSULAR_PROSA") | .id')
$ curl -s https://<V1>/api/v1/templates/$TID/versions -H "Authorization: Bearer $TOKEN" | jq '.[0].definition' > modelo-prosa.json
$ jq -r '.blocos[] | select(.texto) | .texto' modelo-prosa.json
```

2. Envie o texto mostrado ao responsável jurídico.
3. Se houver alterações, edite `nano modelo-prosa.json`. Altere **apenas** o texto dentro das aspas dos campos `"texto"`. Não mexa nas partes `{{…}}`.
4. Publique a nova versão:

```bash
$ VID=$(jq -n --slurpfile d modelo-prosa.json '{definicao:$d[0], nota:"Revisão jurídica inicial"}' \
    | curl -s -X POST https://<V1>/api/v1/templates/$TID/versions -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d @- | jq -r .id)
$ echo $VID
$ curl -s -X POST https://<V1>/api/v1/templates/$TID/versions/$VID/publish -H "Authorization: Bearer $TOKEN" | jq .
```

✅ **Verificação:** a publicação devolve `{"publicado":2}`.

5. Repita para `CONSULAR_LISTA` (tipos Geral e Empresarial), trocando `CONSULAR_PROSA` e o nome do ficheiro.

### G7. Catálogo de poderes

1. No computador, tenha à mão o ficheiro `docs/catalogo-inicial.json` do projecto.
2. Na aplicação: **Centro de Poderes → Importar → Escolher ficheiro** → seleccione `catalogo-inicial.json`.

   ✅ **Verificação:** "Linhas 61 · Novos 61 · Duplicados 0 · Com erros 0".

3. Clique **Importar 61 poderes**. Entram como **rascunho**: nenhum fica visível para os operadores.
4. Em **Centro de Poderes**, active **Só por publicar**.
5. Para **cada** poder, com o responsável jurídico:
   1. abra o poder;
   2. reveja o **Texto jurídico**, os **Campos** e as **Regras** (a caixa da direita tem de mostrar "Variáveis e campos coerentes");
   3. na **Descrição**, apague `[A VALIDAR PELO JURÍDICO] `;
   4. em **Nota da alteração**, escreva por exemplo `Aprovado por <nome>, <data>`;
   5. carregue em **Guardar e publicar**.
6. Poderes que a entidade não use: deixe-os por publicar, ou abra-os e carregue em **Desactivar**.

✅ **Verificação:** com **Só por publicar** activo, a lista fica vazia (ou só com os desactivados).

### G8. Sugestões por tipo de procuração (opcional)

O bootstrap deixa os tipos sem poderes sugeridos. Para que, ao criar por exemplo uma *Procuração Bancária*, apareçam logo os poderes habituais:

```bash
$ DIRECT=$(grep '^DATABASE_URL_DIRECT=' apps/api/.env | cut -d= -f2- | tr -d '"')
$ docker run --rm -i postgres:17 psql "$DIRECT" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE poa_types SET suggested_power_codes = '{BANC-001,BANC-002,BANC-007}' WHERE code = 'BANCARIA';
UPDATE poa_types SET suggested_power_codes = '{IMOV-001,IMOV-004,REG-002}' WHERE code = 'IMOVEL_VENDA';
UPDATE poa_types SET suggested_power_codes = '{JUD-001,JUD-004,JUD-005}' WHERE code = 'JUDICIAL';
SQL
```

Use só códigos de poderes **publicados** no G7.

---

## H. Ensaio geral e entrada em produção

O ensaio é feito numa **cópia** da base de produção, para não consumir números reais nem deixar procurações de teste.

### H1. Criar a cópia

Na consola Neon: **Branches → Create branch**
- **Name:** `ensaio`
- **Parent:** `main`
- **Include data up to:** Current point in time

Clique **Create**. Depois **Connect** → branch `ensaio`, role `neondb_owner`, e copie a string pooled e a direct.

### H2. Apontar temporariamente a aplicação para a cópia

```bash
$ cd /opt/procuracoes
$ cp apps/api/.env apps/api/.env.producao
$ nano apps/api/.env
```

Faça três alterações:
- `DATABASE_URL="…"` → pooled do `ensaio`;
- `DATABASE_URL_DIRECT="…"` → direct do `ensaio`;
- `STORAGE_DRIVER=s3` → `STORAGE_DRIVER=local`, e acrescente a linha `STORAGE_LOCAL_DIR=/tmp/ensaio`.

Grave e saia. Depois:

```bash
$ docker compose -f docker-compose.neon.yml up -d --force-recreate api
$ sleep 25 && curl -s http://127.0.0.1:3001/api/v1/health; echo
```

### H3. Ensaiar

Com um operador e um validador reais, emita **5 a 10 procurações** com dados reais de exemplo:
- uma bancária;
- uma com dois outorgantes;
- uma com duas procuradoras (concordância no feminino plural);
- uma de menor;
- uma de venda de imóvel;
- uma com poder personalizado.

Compare cada PDF, lado a lado, com uma procuração actual do mesmo tipo: cabeçalho, traços, concordâncias, datas por extenso, assinaturas e paginação.

Registe as correcções necessárias e faça-as na produção (G6/G7), não na cópia.

### H4. Voltar à produção

```bash
$ cd /opt/procuracoes
$ cp apps/api/.env.producao apps/api/.env && rm apps/api/.env.producao
$ docker compose -f docker-compose.neon.yml up -d --force-recreate api
$ sleep 25 && curl -s http://127.0.0.1:3001/api/v1/health; echo
$ DIRECT=$(grep '^DATABASE_URL_DIRECT=' apps/api/.env | cut -d= -f2- | tr -d '"')
$ docker run --rm postgres:17 psql "$DIRECT" -tAc "select count(*) from powers_of_attorney;"
```

✅ **Verificação:** a última linha mostra `0` (a produção não tem procurações de ensaio). Na consola Neon, apague o branch `ensaio`.

### H5. Abrir ao serviço

1. Comunique aos utilizadores o endereço `https://<V1>`.
2. Nas primeiras duas semanas, mantenha em paralelo o procedimento anterior para os casos excepcionais.
3. Registe a data de entrada em produção.

---

## I. Cópias de segurança automáticas

### I1. Chave de cifra das cópias

```bash
$ sudo sh -c 'openssl rand -base64 48 > /root/.backup-pass && chmod 600 /root/.backup-pass'
$ sudo cat /root/.backup-pass
```

Copie o valor para o gestor de senhas, com o título "Procurações — chave das cópias". Depois `clear`.

### I2. Credenciais do bucket de cópias

```bash
$ read -rp  'V6 (R2 Account ID): ' V6
$ read -rsp 'V9: ' V9; echo
$ read -rsp 'V10: ' V10; echo
$ sudo tee /root/.backup-r2 > /dev/null <<EOF
RCLONE_CONFIG_R2_TYPE=s3
RCLONE_CONFIG_R2_PROVIDER=Cloudflare
RCLONE_CONFIG_R2_ACCESS_KEY_ID=${V9}
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=${V10}
RCLONE_CONFIG_R2_ENDPOINT=https://${V6}.eu.r2.cloudflarestorage.com
RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
EOF
$ sudo chmod 600 /root/.backup-r2
$ unset V9 V10
```

### I3. Script de cópia

```bash
$ sudo tee /usr/local/bin/backup-procuracoes > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
DIR=/var/backups/procuracoes
mkdir -p "$DIR"
FICH="$DIR/procuracoes-$(date +%F).dump.enc"
DIRECT=$(grep '^DATABASE_URL_DIRECT=' /opt/procuracoes/apps/api/.env | cut -d= -f2- | tr -d '"')
docker run --rm postgres:17 pg_dump "$DIRECT" --format=custom --no-owner --no-privileges \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:/root/.backup-pass -out "$FICH"
set -a; . /root/.backup-r2; set +a
rclone copy "$FICH" r2:procuracoes-backups/base-de-dados/
find "$DIR" -name 'procuracoes-*.dump.enc' -mtime +56 -delete
echo "$(date -Is) OK $(du -h "$FICH" | cut -f1)" >> /var/log/backup-procuracoes.log
EOF
$ sudo chmod 700 /usr/local/bin/backup-procuracoes
$ sudo /usr/local/bin/backup-procuracoes
$ sudo tail -1 /var/log/backup-procuracoes.log
```

✅ **Verificação:** a última linha diz `… OK <tamanho>` e o ficheiro aparece no bucket `procuracoes-backups` do Cloudflare.

### I4. Agendar (domingo às 02:30)

```bash
$ echo '30 2 * * 0 root /usr/local/bin/backup-procuracoes >> /var/log/backup-procuracoes.log 2>&1' | sudo tee /etc/cron.d/backup-procuracoes
```

### I5. Cópia da configuração

Guarde uma cópia cifrada do `.env` fora do servidor:

```bash
$ sudo openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:/root/.backup-pass -in /opt/procuracoes/apps/api/.env -out /tmp/env-producao.enc
$ sudo sh -c 'set -a; . /root/.backup-r2; set +a; rclone copy /tmp/env-producao.enc r2:procuracoes-backups/configuracao/' && sudo rm /tmp/env-producao.enc
$ rm -f /opt/procuracoes/.env.producao.bak
```

---

## J. Monitorização

### J1. Monitor externo

Num serviço de monitorização (UptimeRobot, Better Stack, ou o da entidade), crie:
- **Tipo:** HTTP(s), com palavra-chave
- **URL:** `https://<V1>/api/v1/health`
- **Palavra-chave esperada:** `"ok"`
- **Intervalo:** 1–5 minutos
- **Alertas:** email do administrador e do responsável de TI

### J2. Verificações periódicas

| Quando | O quê | Como |
|---|---|---|
| Diariamente (automático) | disponibilidade | monitor J1 |
| Semanalmente | cópia feita | `sudo tail -3 /var/log/backup-procuracoes.log` |
| Mensalmente | integridade da auditoria | aplicação → **Auditoria → Verificar integridade** |
| Mensalmente | espaço e memória | `df -h /` e `free -h` |
| Mensalmente | consumo Neon | consola Neon → **Monitoring** |
| Trimestralmente | teste de restauro | secção K3 |

---

## K. Manutenção

### K1. Actualizar a aplicação para uma nova versão

```bash
PC$ scp procuracoes-<nova-versao>.zip admin@<V2>:/tmp/
```

No servidor:

```bash
$ cd /opt
$ sudo cp -a procuracoes procuracoes-anterior
$ sudo unzip -oq /tmp/procuracoes-<nova-versao>.zip -d /opt
$ sudo chown -R admin:admin /opt/procuracoes
$ cp /opt/procuracoes-anterior/apps/api/.env /opt/procuracoes/apps/api/.env
$ cp /opt/procuracoes-anterior/infra/fonts/*.ttf /opt/procuracoes/infra/fonts/
$ cd /opt/procuracoes
$ docker tag procuracoes-api:latest procuracoes-api:anterior
$ docker tag procuracoes-web:latest procuracoes-web:anterior
$ docker compose -f docker-compose.neon.yml build
$ docker compose -f docker-compose.neon.yml up -d
$ sleep 30 && curl -s http://127.0.0.1:3001/api/v1/health; echo
```

✅ **Verificação:** saúde `ok` e aplicação a funcionar no browser. Depois apague a pasta anterior: `sudo rm -rf /opt/procuracoes-anterior`.

**Se a versão nova tiver migrações de base de dados**, antes de tudo isto:
1. Crie o branch `ensaio` (H1).
2. Aplique a actualização primeiro com o `.env` apontado ao `ensaio` (H2).
3. Confirme que tudo funciona. Só então faça o K1 em produção.

### K2. Voltar à versão anterior (se a nova falhar)

```bash
$ cd /opt/procuracoes
$ docker tag procuracoes-api:anterior procuracoes-api:latest
$ docker tag procuracoes-web:anterior procuracoes-web:latest
$ docker compose -f docker-compose.neon.yml up -d --no-build --force-recreate
```

Se a versão nova tiver alterado a base de dados, faça também o K3 para o instante anterior à actualização.

### K3. Restaurar a base de dados

**Caso 1 — erro recente, dentro da janela de retenção do Neon** (ex.: dados apagados há 2 horas):
1. Consola Neon → **Branches** → `main` → **Restore**.
2. Escolha a data e hora **anteriores** ao problema e confirme. O Neon guarda o estado substituído como branch de segurança.
3. `docker compose -f docker-compose.neon.yml restart api`

**Caso 2 — a partir da cópia semanal:**

```bash
$ sudo ls /var/backups/procuracoes/
$ sudo openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/root/.backup-pass -in /var/backups/procuracoes/procuracoes-<data>.dump.enc -out /tmp/restauro.dump
```

Na consola Neon, crie um branch `restauro` a partir de `main` (**Create branch**, parent `main`). Copie a string **direct** desse branch para uma variável e esvazie-o. O comando apaga os dados **só** desse branch; confirme que o host é o do `restauro`:

```bash
$ read -rsp 'Direct do branch restauro: ' REST; echo
$ docker run --rm postgres:17 psql "$REST" -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
$ docker run --rm -v /tmp:/tmp postgres:17 pg_restore --no-owner --no-privileges -d "$REST" /tmp/restauro.dump
$ docker run --rm postgres:17 psql "$REST" -tAc "select count(*) from powers_of_attorney;"
$ sudo rm /tmp/restauro.dump
```

Verifique os dados no branch `restauro`. Para o tornar produção:
1. Consola Neon → branch `restauro` → **Set as default**.
2. Repita o **E2** com a direct do `restauro`: a cópia não inclui os privilégios.
3. Actualize `DATABASE_URL` e `DATABASE_URL_DIRECT` com os hosts do novo branch.
4. `docker compose -f docker-compose.neon.yml up -d --force-recreate api`

**Teste trimestral (obrigatório):**
1. Faça o Caso 2 para um branch `teste-restauro`.
2. Confirme `select count(*) from powers_of_attorney;`.
3. Apague o branch.

### K4. Rodar palavras-passe e chaves

| O quê | Passos |
|---|---|
| Senha `procuracoes_app` (Neon) | Consola → Roles → `procuracoes_app` → Reset password → actualize `DATABASE_URL` (E3) → `docker compose -f docker-compose.neon.yml up -d --force-recreate api` |
| Senha `neondb_owner` | igual, na linha `DATABASE_URL_DIRECT` |
| Chave R2 da aplicação | crie novo token (A6) → actualize `S3_ACCESS_KEY`/`S3_SECRET_KEY` → recrie a API → emita uma procuração de teste no ensaio → revogue o token antigo |
| `JWT_SECRET` | `openssl rand -base64 48` → substitua no `.env` → recrie a API. Todos voltam a entrar |
| `DATA_ENC_KEY`, `DATA_BIDX_KEY` | **não rodar** (os dados cifrados ficariam ilegíveis) |

Depois de qualquer rotação, repita o **I5**.

### K5. Utilizador que sai da entidade

**Utilizadores** → **Desactivar**. As sessões terminam de imediato. Não apague: a auditoria mantém o nome associado aos actos praticados.

### K6. Utilizador que esqueceu a palavra-passe ou ficou bloqueado

**Utilizadores** → **Redefinir palavra-passe** → temporária → comunique por canal seguro. A conta é desbloqueada.

---

## Z. Se algo não correr como descrito

| Passo | Sintoma | Causa e solução |
|---|---|---|
| C3 | `Killed` ou `JavaScript heap out of memory` | pouca memória: confirmar B5 (swap) ou usar servidor com 4 GB |
| C3 | erro a descarregar pacotes | sem saída para a Internet: `curl -I https://registry.npmjs.org` |
| D1 | `Configuração inválida: …` | linha em falta ou mal escrita no `.env`; a mensagem indica qual |
| D1 | `ETIMEDOUT` / `timeout expired` | IP Allow no Neon a bloquear o servidor (retirar ou acrescentar V2), ou firewall de saída na porta 5432 |
| D1 | `self-signed certificate` / `SSL` | URL alterado: copie de novo da consola Neon, entre aspas |
| D1 | `password authentication failed` | senha errada no URL: copie de novo da consola Neon (A3) |
| D3 | 0 tabelas | as migrações não correram: `docker compose -f docker-compose.neon.yml logs api \| head -40` |
| D4 | `Variáveis BOOT_* em falta ou inválidas` | a mensagem indica qual; a palavra-passe precisa de 12+ caracteres com maiúscula, minúscula e dígito |
| E3 | `permission denied for table …` | GRANT do E2 não aplicado ou aplicado antes das migrações: repetir o E2 |
| F1 | o certificado não é emitido | DNS ainda sem propagar (`dig +short <V1>` tem de mostrar V2) ou portas 80/443 fechadas no fornecedor |
| G1 | a sessão cai ao recarregar a página | aceder sempre por `https://<V1>`, nunca pelo IP |
| G3 | `TOKEN` = `null` | email ou palavra-passe errados, ou conta bloqueada por 5 falhas (esperar 15 min ou K6) |
| G7 | erros na importação | a tabela indica a linha e o motivo; corrija o ficheiro e importe de novo |
| emissão | "PDF: Executable doesn't exist" | imagem sem Chromium: repetir C3 sem cache: `docker compose -f docker-compose.neon.yml build --no-cache api` |
| emissão | erro de armazenamento | V7/V8 errados, token sem acesso ao bucket, ou endpoint sem `.eu` |
| I3 | `pg_dump: server version mismatch` | a imagem tem de ser da mesma versão do Neon: `postgres:17` para Postgres 17 |
| qualquer | a aplicação não responde | `docker compose -f docker-compose.neon.yml ps` e `… logs --tail 100 api web`; `sudo systemctl status caddy` |

---

## Lista final (assinar antes de abrir ao serviço)

- [ ] A2: branch `main` protegido; retenção de histórico no máximo; scale-to-zero desligado
- [ ] A5: buckets R2 na jurisdição UE, acesso público desligado
- [ ] B3: SSH só por chave, root desactivado
- [ ] B6: firewall só com 22, 80 e 443
- [ ] C2: chaves de produção guardadas no gestor de senhas
- [ ] D2: API `healthy`; D3: 29 tabelas e 9 triggers
- [ ] E3: aplicação a usar `procuracoes_app`
- [ ] F1: HTTPS válido; F2: portas 3000/3001 inacessíveis de fora
- [ ] G1: palavra-passe inicial do administrador alterada
- [ ] G2: contas nominais criadas, sem contas partilhadas
- [ ] G4/G5: oficiantes e entidades com denominações oficiais
- [ ] G6: modelo documental aprovado pelo jurídico (nome e data: ______)
- [ ] G7: catálogo revisto e publicado (nome e data: ______)
- [ ] H3/H4: ensaio concluído e PDF aprovado; produção sem procurações de teste
- [ ] I3: primeira cópia de segurança no bucket; I4: agendamento activo; I5: configuração copiada
- [ ] J1: monitor externo activo e alertas testados
- [ ] K3: primeiro teste de restauro agendado (data: ______)
- [ ] Tratamento de dados registado no inventário RGPD e prazo de conservação definido

Responsável técnico: __________________  Data: ____/____/______

Responsável pelo serviço: __________________  Data: ____/____/______
