# Passagem a produção (primeira fase)

Este guia parte da instalação de teste actual e deixa a mesma plataforma pronta para uso real, sem dados de demonstração:

- **Frontend:** Vercel
- **API:** Render (`procuracoes-api-teste`)
- **Base de dados:** Neon, branch `test`, com dados DEMO

Tempo indicativo: 1 a 2 horas, sem contar a revisão jurídica do catálogo.

> **O que muda:**
> - a base passa a ser o branch **`main`** do Neon, vazio e só com dados reais;
> - os documentos passam a ser guardados no **Cloudflare R2**;
> - as chaves de segurança passam a ser **novas**.
>
> O branch `test` fica guardado. Pode voltar a ele para ensaios, apontando de novo o Render para lá.

---

## 1. Armazenamento permanente dos documentos (obrigatório)

No teste, os PDF ficavam em `/tmp` e perdiam-se quando o Render adormecia. Em produção isso não pode acontecer.

1. Cloudflare → **R2** → active (o plano gratuito inclui 10 GB).
2. **Create bucket** → nome `procuracoes-documentos` → **Location: European Union (EU)** → **Create**. Confirme **Public access: Disabled**.
3. **Manage API tokens → Create API token**:
   - **Permissions:** Object Read & Write;
   - **Bucket:** só `procuracoes-documentos`.

   Guarde no gestor de senhas o **Account ID**, o **Access Key ID** e a **Secret Access Key**.

## 2. Chaves novas de produção

No Git Bash:

```bash
openssl rand -base64 32   # DATA_ENC_KEY
openssl rand -base64 48   # DATA_BIDX_KEY
openssl rand -hex 32      # PROXY_SECRET
```

Guarde os três valores no gestor de senhas **e** numa cópia offline. Sem a `DATA_ENC_KEY`, os números de documento, NIF e contactos ficam ilegíveis.

## 3. Base de dados de produção (Neon, branch `main`)

1. Neon → **Branches → main → ⋯ → Set as protected**.
2. **Connect** → branch **main**, role `neondb_owner`:
   - com **pooling ligado**, copie a ligação (**pooled**);
   - com **pooling desligado**, copie a ligação (**direct**).

## 4. Apontar o Render para produção

Render → **procuracoes-api-teste** → **Environment**. Altere ou acrescente estas variáveis, **sem aspas**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | pooled do `main` |
| `DATABASE_URL_DIRECT` | direct do `main` |
| `DATA_ENC_KEY` | nova (passo 2) |
| `DATA_BIDX_KEY` | nova (passo 2) |
| `PROXY_SECRET` | novo (passo 2) |
| `JWT_SECRET` | botão **Generate** |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | `https://<Account ID>.eu.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | `procuracoes-documentos` |
| `S3_ACCESS_KEY` | Access Key ID |
| `S3_SECRET_KEY` | Secret Access Key |
| `S3_SSE` | `none` |
| `S3_CONDITIONAL_WRITES` | `false` |
| `PDF_BAIXA_MEMORIA` | `true` |

Apague a variável `STORAGE_LOCAL_DIR`. Depois clique **Save, rebuild, and deploy**.

✅ **Verificação:**
- nos **Logs** aparece `Migrações aplicadas.` e depois `API em http://localhost:10000/api/v1`;
- `https://<endereço>.onrender.com/api/v1/health` responde `"estado":"ok"`.

Na **Vercel**: **Settings → Environment Variables** → `PROXY_SECRET` = o **mesmo** valor novo → **Save** → **Deployments → Redeploy**.

## 5. Criar a organização real e o primeiro administrador

No PowerShell, em `C:\procuracoes`, **uma linha de cada vez**. Use a ligação **direct do `main`**.

```powershell
$env:DATABASE_URL_DIRECT = 'COLAR-DIRECT-DO-MAIN'
$env:BOOT_ORG_CODE      = 'CGA-PORTO'
$env:BOOT_ORG_NAME      = 'Consulado Geral no Porto'
$env:BOOT_ORG_FULLNAME  = 'Consulado Geral da República de Angola'
$env:BOOT_ORG_ADDRESS   = 'Rua Dr. Carlos Cal Brandão, n.º 132-138, freguesia de Cedofeita, Código Postal 4050-160 concelho de Porto'
$env:BOOT_ORG_CITY      = 'Porto'
$env:BOOT_ADMIN_EMAIL   = 'o.seu.email@…'
$env:BOOT_ADMIN_NAME    = 'O Seu Nome'
$env:BOOT_ADMIN_PASSWORD = 'PalavraPasseForte2026'
$env:BOOT_OFFICER_NAME  = 'NOME COMPLETO DO VICE-CÔNSUL'
$env:BOOT_OFFICER_TITLE = 'Vice-cônsul'
$env:BOOT_NUM_PREFIX    = 'PROC'
npm run db:bootstrap -w @proc/api
Remove-Item Env:DATABASE_URL_DIRECT, Env:BOOT_ADMIN_PASSWORD
```

✅ `Organização CGA-PORTO criada. …`

- **Morada (`BOOT_ORG_ADDRESS`):** é o texto que aparece a seguir a «sito na …».
- **Nome do oficiante (`BOOT_OFFICER_NAME`):** aparece como está no texto e na assinatura.

Os três valores podem ser corrigidos depois na aplicação (passo 6).

## 6. Parametrizar o documento (na aplicação)

Entre em `https://<endereço>.vercel.app` com o administrador.

1. Iniciais (canto inferior esquerdo) → **A minha conta** → **altere a palavra-passe**.
2. **Modelos documentais**. Tudo o que muda aqui fica em vigor para as procurações criadas a seguir.
   - **Dados do posto e oficiantes:**
     - nome no cabeçalho, nome completo e morada;
     - oficiantes: **Editar** o nome e o cargo (ex.: «Vice-cônsul»), **Novo oficiante** para o Cônsul-Geral e outros.
   - **Letra e espaçamentos:** tamanho, entrelinha, espaço entre parágrafos e entre assinaturas.
   - **Página, moldura e traços:** margens, espessura da moldura, traços.
   - **Cabeçalho:** insígnia, linhas e **filete vermelho** (mostrar ou não, cor, espessura, largura).
   - **Textos do documento:** cada parágrafo e as assinaturas.
   - **Rodapé e numeração:** contactos, logótipos, filete, rodapé só no fim ou em todas as páginas, numeração.
   - **Documentos de identificação no texto:** por exemplo, «Bilhete de Identidade n.º …, emitido pela …».
   - **Numeração das procurações:** prefixo, série e dígitos.

   Carregue em **Publicar nova versão** depois de cada conjunto de ajustes.
3. **Centro de Poderes → Importar** → `docs\catalogo-inicial.json`. São 144 poderes e cláusulas, que entram em rascunho. Reveja-os com o jurídico, seleccione e **Publicar seleccionados**.
4. **Utilizadores:**
   - crie as contas nominais;
   - dê o perfil **Emissor autónomo** a quem faz a procuração completa sem validação;
   - dê **Operador** e **Validador** a quem trabalha em dois passos.
5. **Pessoas → Importar**, se tiver uma lista de pessoas em Excel. Use o modelo que a página disponibiliza.

## 7. Primeira procuração real

1. Faça uma procuração com dados reais e emita-a.
2. Compare o PDF com o documento em Word, lado a lado.
3. Se algo diferir (espaço, tamanho, filete), ajuste em **Modelos documentais** e publique. As procurações já emitidas mantêm o aspecto com que foram emitidas.

## 8. Cópias de segurança (recomendado desde o primeiro dia)

- **Neon:** consegue restaurar a base a um instante anterior. No plano gratuito essa janela é curta; confirme a duração em **Settings**.
- **Cópia semanal cifrada no R2, pelo GitHub:**
  1. Configure-a como na parte **M** do `GUIA-DEPLOY-PLATAFORMAS.md`.
  2. Crie o role só de leitura `procuracoes_backup` (parte **I** desse guia).
  3. Crie um segundo bucket, `procuracoes-backups`.

## Limites do plano gratuito a conhecer

| Plataforma | Limite | Efeito |
|---|---|---|
| Render (Free) | adormece após 15 min sem uso; 512 MB de memória | o primeiro acesso do dia demora cerca de 1 minuto; o modo `PDF_BAIXA_MEMORIA` mantém a geração de PDF dentro da memória |
| Neon (Free) | armazenamento e janela de restauro reduzidos | suficiente para começar; ter a cópia semanal activa |
| Vercel (Hobby) | licença para uso pessoal ou não comercial | para uso institucional definitivo, passar ao plano **Pro** |
| Cloudflare R2 | 10 GB gratuitos | milhares de procurações |

Quando decidir tornar a plataforma definitiva:
- passe o Render para **Starter**, que não adormece;
- passe a Vercel para **Pro**;
- passe o Neon para um plano pago com retenção maior.

Não é preciso mudar código nem reinstalar nada.
