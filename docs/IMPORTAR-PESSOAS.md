# Importar a lista de pessoas (registo consular) para a plataforma

O importador em massa lê o ficheiro no seu computador e grava directamente na base de dados do Neon.
Serve para ficheiros grandes (centenas de milhares de linhas). O ecrã **Pessoas → Importar** aceita até 5 000 linhas.

## O que acontece a cada linha

| Situação | O que acontece |
|---|---|
| BI com formato normal | entra com o BI |
| BI com formato não habitual (ex.: `752/2024`, `N2252653`) | entra com o número tal como está, com aviso |
| Sem BI (ou valores sem conteúdo, como `0` ou `**//**/*`) | entra sem documento |
| BI repetido noutra linha do ficheiro | a 1.ª linha fica com o BI; as seguintes entram sem documento e com o número nas observações |
| BI que já existe na plataforma | a linha é ignorada (a pessoa já existe) |
| Sem sexo | entra com «sexo por indicar» |
| Sem nome | entra como «SEM NOME (linha N)» |

- **Cifra:** BI, NIF, telefones, emails e observações ficam cifrados.
- **Emissão:** a plataforma não deixa emitir uma procuração enquanto os dados de uma das partes estiverem incompletos (BI, validade, sexo, nacionalidade).
- **Relatório:** no fim é gerado um ficheiro `relatorio-importacao-pessoas-AAAA-MM-DD.csv`, na mesma pasta do ficheiro importado, com as linhas que têm avisos ou foram ignoradas.

## Antes de começar

1. A actualização 5 tem de estar instalada e o Render **Live**. É nesse deploy que correm as migrações que aceitam pessoas sem BI.
2. Tenha à mão:
   - a ligação **direct** do Neon do branch onde vai importar (`main` em produção);
   - **`DATA_ENC_KEY`** e **`DATA_BIDX_KEY`**: **as mesmas que estão no Render** (Render → Environment → ícone do olho).

   Com chaves diferentes, a plataforma não consegue ler nem pesquisar os dados importados.
3. **Espaço:** as 412 870 pessoas ocupam cerca de 233 MB. Confirme na consola do Neon (Settings → Plan) que o plano tem espaço suficiente.

## Passo a passo (PowerShell, uma linha de cada vez)

```powershell
cd C:\procuracoes
$env:DATABASE_URL_DIRECT = 'COLAR-DIRECT-DO-NEON'
$env:DATA_ENC_KEY = 'COLAR-DO-RENDER'
$env:DATA_BIDX_KEY = 'COLAR-DO-RENDER'
$env:JWT_SECRET = 'importacao-local-nao-usado-0123456789abcdef'
```

**1. Simulação (não grava nada):**

```powershell
npm run db:importar-pessoas -w @proc/api -- "C:\Users\...\pessoas-convertido.csv" --simular
```

✅ No fim aparece uma tabela com o total, os inseridos, os sem documento, etc. Confirme que os números fazem sentido.

**2. Importação real (cerca de 2 minutos para 412 870 pessoas):**

```powershell
npm run db:importar-pessoas -w @proc/api -- "C:\Users\...\pessoas-convertido.csv"
```

**3. Limpar as chaves do terminal:**

```powershell
Remove-Item Env:DATABASE_URL_DIRECT, Env:DATA_ENC_KEY, Env:DATA_BIDX_KEY, Env:JWT_SECRET
```

**4. Na aplicação**, vá a **Pessoas** e pesquise por um nome e por um BI que conheça.

Pode importar tanto o ficheiro convertido (`pessoas-convertido.csv`) como o original (`Lista_de_PEssoas.csv`): o importador reconhece os dois.
Se correr o importador duas vezes, as pessoas **com BI** não são duplicadas. As **sem BI** seriam inseridas de novo, porque não há como as reconhecer. Por isso, importe só uma vez.

## Se precisar de recomeçar

Para apagar só as pessoas importadas antes de haver procurações, execute no Neon (**SQL Editor**):

```sql
DELETE FROM persons WHERE id NOT IN (SELECT person_id FROM poa_parties);
```

Isto apaga todas as pessoas que não estão em nenhuma procuração.
