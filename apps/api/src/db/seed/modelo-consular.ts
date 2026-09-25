import { DefinicaoModelo } from '@proc/core';

/**
 * Modelo institucional DEMO — reproduz a ESTRUTURA observada nas 1 189 procurações analisadas
 * (cabeçalho, título com traços, comparência perante o oficiante, verificação de identidade, "E POR ELE FOI DITO",
 * constituição de procurador, poderes, encerramento, leitura, assinaturas). Texto sujeito a validação jurídica.
 */
const O = (ms: string, fs: string, mp: string, fp: string) => `{{flex outorgantes "${ms}" "${fs}" "${mp}" "${fp}"}}`;

export const modeloConsular = (modo: 'PROSA' | 'LISTA'): DefinicaoModelo => ({
  pagina: { formato: 'A4', margens: { topo: 2, direita: 2.3, fundo: 2.2, esquerda: 2.5 } },
  tipografia: { fonte: 'Merriweather', tamanho: 12, entrelinha: 1.5 },
  preenchimento: { activo: true, caracter: '-' },
  poderes: modo === 'PROSA' ? { modo: 'PROSA', separador: '; ', ultimoSeparador: '; e ' } : { modo: 'LISTA', numeracao: 'a)' },
  cabecalho: { linhas: [{ texto: 'REPÚBLICA DE ANGOLA', negrito: true }, { texto: '{{posto.nome}}' }] },
  blocos: [
    { tipo: 'titulo', texto: 'PROCURAÇÃO', preencher: true },
    { tipo: 'paragrafo', texto: `No dia {{documento.dataExtenso}}, neste {{posto.nomeCompleto}}, sito na {{posto.morada}}, perante mim, **{{upper oficiante.nome}}**, {{oficiante.cargo}}, com plenos poderes, ${O('compareceu como outorgante', 'compareceu como outorgante', 'compareceram como outorgantes', 'compareceram como outorgantes')}: {{outorgantesIdentificacao}}.` },
    { tipo: 'paragrafo', texto: `VERIFIQUEI A IDENTIDADE ${O('DO OUTORGANTE', 'DA OUTORGANTE', 'DOS OUTORGANTES', 'DAS OUTORGANTES')}, ${O('pelo mencionado documento que me foi apresentado e o restituí', 'pelo mencionado documento que me foi apresentado e o restituí', 'pelos mencionados documentos que me foram apresentados e os restituí', 'pelos mencionados documentos que me foram apresentados e os restituí')}.` },
    { tipo: 'paragrafo', texto: `E POR ${O('ELE', 'ELA', 'ELES', 'ELAS')} FOI DITO:` },
    {
      tipo: 'paragrafo',
      texto: `Que, pelo presente instrumento, ${O('constitui', 'constitui', 'constituem', 'constituem')} {{flex procuradores "seu bastante procurador" "sua bastante procuradora" "seus bastantes procuradores" "suas bastantes procuradoras"}} {{procuradoresIdentificacao}}{{#if formaActuacao}}, {{formaActuacao}}{{/if}}, a quem ${O('confere', 'confere', 'conferem', 'conferem')} os poderes necessários para, em nome e representação ${O('do outorgante', 'da outorgante', 'dos outorgantes', 'das outorgantes')}` + (modo === 'PROSA' ? ', {{poderes}}.' : ':'),
    },
    ...(modo === 'LISTA' ? [{ tipo: 'poderes' as const }] : []),
    { tipo: 'paragrafo', texto: '{{clausulas}}', seExiste: 'clausulas' },
    { tipo: 'paragrafo', texto: `ASSIM O ${O('DISSE E OUTORGOU', 'DISSE E OUTORGOU', 'DISSERAM E OUTORGARAM', 'DISSERAM E OUTORGARAM')}.` },
    { tipo: 'paragrafo', texto: `${O('Ao outorgante', 'À outorgante', 'Aos outorgantes', 'Às outorgantes')} fiz, em voz alta e na sua presença, a leitura e a explicação do conteúdo desta procuração.` },
    { tipo: 'assinaturas', itens: [{ rotulo: O('O OUTORGANTE', 'A OUTORGANTE', 'OS OUTORGANTES', 'AS OUTORGANTES') }, { rotulo: '{{upper oficiante.cargo}}', nome: '{{upper oficiante.nome}}' }] },
  ],
  rodape: { texto: '{{documento.numero}}', paginacao: true },
});
