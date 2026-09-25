# Plataforma de Procurações

Criação, gestão, emissão e arquivo de procurações a partir de um **catálogo modular e versionado de poderes** e de **modelos documentais** institucionais.

- **Deploy em plataformas — GitHub, Neon, Render, Vercel, Cloudflare R2 (recomendado para a 1.ª fase):** [`docs/GUIA-DEPLOY-PLATAFORMAS.md`](docs/GUIA-DEPLOY-PLATAFORMAS.md)
- Passo a passo para produção em servidor próprio (Neon + Ubuntu + Docker + Caddy + R2): [`docs/GUIA-PRODUCAO.md`](docs/GUIA-PRODUCAO.md)
- Guia de implementação geral (desenvolvimento, testes e opções): [`docs/GUIA-IMPLEMENTACAO.md`](docs/GUIA-IMPLEMENTACAO.md)
- Arquitectura e decisões: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Análise das 1 189 procurações existentes: [`docs/ANALISE-CORPUS.md`](docs/ANALISE-CORPUS.md)
- Documentos de exemplo gerados (dados fictícios): [`docs/exemplos/`](docs/exemplos)

## Requisitos
Node 22+, PostgreSQL 16 (extensão `pg_trgm`), Chromium (ou Docker).

## Arranque rápido (local)

```bash
npm ci
cp apps/api/.env.example apps/api/.env          # preencher segredos:
#   JWT_SECRET=$(openssl rand -base64 48)
#   DATA_ENC_KEY=$(openssl rand -base64 32)
#   DATA_BIDX_KEY=$(openssl rand -base64 48)
#   CHROMIUM_PATH=/caminho/para/chromium
docker compose up -d db minio minio-init         # ou um PostgreSQL local
set -a; . apps/api/.env; set +a
npm run build -w @proc/core
npm run db:migrate
npm run db:seed                                  # dados DEMO
npm run dev:api                                  # API em http://localhost:3001/api/v1
npm run dev:web                                  # aplicação em http://localhost:3000
```

O frontend reencaminha `/api/v1` para a API (variável `API_URL`, por omissão `http://localhost:3001`), por isso ambos ficam na mesma origem.

Tudo em Docker: criar `.env` na raiz com os segredos e `docker compose up --build` (web em :3000, API em :3001).

## Testes
```bash
npm test -w @proc/core     # 69 testes unitários do motor
npm test -w @proc/api      # 26 testes e2e de API (TEST_DATABASE_URL = branch Neon "test", ou PostgreSQL local)
npm run test:e2e           # 6 testes de browser (Playwright) — com API e web a correr sobre uma BD com seed DEMO
```

## Credenciais DEMO
`admin@demo.local`, `operador@demo.local`, `validador@demo.local`, `consulta@demo.local` — password `Demo#Procuracoes2026`.

## Exemplo rápido (API)
```bash
TOKEN=$(curl -s localhost:3001/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"operador@demo.local","password":"Demo#Procuracoes2026"}' | jq -r .accessToken)
curl -s "localhost:3001/api/v1/powers?q=imóvel" -H "Authorization: Bearer $TOKEN" | jq '.itens[].nome'
```

> Os textos jurídicos do seed são **ilustrativos (DEMO)** e não foram validados juridicamente.
