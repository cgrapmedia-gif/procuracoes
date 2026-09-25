# Análise do corpus de procurações existentes

Foram analisados **1 189 documentos .docx** do arquivo enviado (`Procuração.zip`, 1 296 ficheiros, dos quais 107 eram ficheiros temporários do Word `~$…` e foram ignorados). Este relatório contém **apenas estatísticas agregadas**: nenhum dado pessoal dos documentos foi copiado para o código, para o seed ou para a documentação.

## Estrutura documental observada (modelo de facto)

Todos os documentos seguem a mesma estrutura notarial, que foi reproduzida no modelo DEMO `CONSULAR_PROSA`:

1. Cabeçalho "REPÚBLICA DE ANGOLA / Consulado Geral no Porto" (com insígnia em ~77% da amostra).
2. Título "PROCURAÇÃO" ladeado de traços.
3. Comparência: data por extenso, local do posto, oficiante ("perante mim, …, Vice-Cônsul, com plenos poderes") e identificação completa do(s) outorgante(s).
4. "VERIFIQUEI A IDENTIDADE DO OUTORGANTE…".
5. "E POR ELE FOI DITO:".
6. Constituição de procurador(es) e poderes, em texto corrido.
7. Cláusulas (substabelecimento, validade, art.º 262.º do Código Civil…).
8. "ASSIM O DISSE E OUTORGOU" + leitura em voz alta.
9. Assinaturas (outorgante e oficiante).

Tipografia dominante: Merriweather 12 pt, justificado, entrelinha 1,5, A4. **Traços de preenchimento** no fim dos parágrafos (prática anti-acrescento) — suportado pelo motor em PDF (CSS) e em DOCX (tabulação com guia).

## Frequência temática (documentos que mencionam)

| Tema | Docs | % |
|---|---:|---:|
| Banca (contas, IBAN, cartões) | 629 | 53% |
| Conservatórias / registo civil / certidões | 437 | 37% |
| Tribunais / advogados | 170 | 14% |
| Substabelecimento | 168 | 14% |
| Fiscal (AGT, Finanças) | 162 | 14% |
| Imóveis | 144 | 12% |
| Menores | 137 | 12% |
| Empresas / sociedades | 132 | 11% |
| Heranças / habilitação | 90 | 8% |
| Passaporte | 86 | 7% |
| Segurança social (INSS) | 83 | 7% |
| Telecomunicações | 83 | 7% |
| Casamento | 78 | 7% |
| Irrevogabilidade | 36 | 3% |
| Veículos | 13 | 1% |

O catálogo DEMO (56 poderes + 5 cláusulas) cobre estes temas com textos **genéricos e ilustrativos**.

## Problemas encontrados que a plataforma elimina

| Problema no processo actual | Evidência | Resposta da plataforma |
|---|---|---|
| Erros de concordância de género | 9 documentos com "sua bastante **procurador**" | Motor de concordância (`flex`) a partir do sexo registado |
| Grafia do cargo do oficiante inconsistente | 10 variantes ("Vice-cônsul", "Vice Cônsul", "Vice- Cônsul"…) | Entidade `officers` com cargo normalizado |
| Reutilização de ficheiros de outras pessoas | nome de ficheiro ≠ outorgante no conteúdo; ficheiros "- Cópia - Cópia" | Duplicação controlada com novo número; histórico |
| Concordância de "o restituí/a restituí" inconsistente | ambas as formas presentes | Texto fixo no modelo, com plural automático |
| Margens diferentes entre documentos | ≥5 combinações de margens na amostra | Margens definidas no modelo versionado |
| Sem numeração nem controlo de versões | — | Numeração atómica sem lacunas; versões imutáveis |
| Vários outorgantes num só acto | 19 documentos (1,6%) | Modelo de dados suporta N outorgantes desde o início |
| Outorgante em representação de empresa | presente | Campo "qualidade" do outorgante |

Volume: ~600 documentos com data de 2026 até Setembro — justifica numeração, pesquisa e dashboard.
