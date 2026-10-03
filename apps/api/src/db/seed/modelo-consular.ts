import { DefinicaoModelo } from '@proc/core';
import { INSIGNIA_PNG, RODAPE_GOVERNO_PNG } from './imagens-posto';

/**
 * Modelo documental do Consulado Geral da República de Angola no Porto, reproduzindo o formato
 * das procurações emitidas pelo posto (Word de referência de Setembro de 2026):
 *  - cabeçalho só na 1.ª página: insígnia, "REPÚBLICA DE ANGOLA" e "Consulado Geral no Porto" (9 pt);
 *  - moldura: linhas verticais à esquerda e à direita do texto em todas as páginas;
 *  - cada troço num parágrafo que começa com traços e fecha com traços até ao fim da linha;
 *  - nomes das partes e das entidades em maiúsculas e negrito;
 *  - assinatura do outorgante à esquerda e do oficiante ao centro;
 *  - rodapé com contactos do posto (barra vermelha) e símbolos do Governo de Angola / MIREX, só no fim do documento;
 *  - sem numeração de páginas.
 */
const O = (ms: string, fs: string, mp: string, fp: string) => `{{flex outorgantes "${ms}" "${fs}" "${mp}" "${fp}"}}`;
const T = '-----'; // separador entre troços do texto corrido
/** Filete vermelho do papel timbrado (cabeçalho e rodapé). Largura, cor e espessura ajustáveis no editor de modelos. */
const FILETE_VERMELHO = { activo: true, cor: '#E30613', espessuraPt: 1, larguraPct: 100 };

export const CONTACTOS_POSTO = [
  'Rua Dr. Carlos Cal Brandão 132/138',
  '4050-160 Porto - Portugal',
  'Telf.: (+351) 222 058 902',
  'Fax:   (+351) 222 050 228',
  'consuladogangola@mail.telepac.pt • www.consuladogeralangola-porto.pt',
];

export const modeloConsular = (modo: 'PROSA' | 'LISTA'): DefinicaoModelo => {
  // Cada troço é um parágrafo que começa com "-----" e fecha com traços até ao fim da linha (como no Word do posto)
  const P = (texto: string, extra: Partial<{ seExiste: string }> = {}) => ({ tipo: 'paragrafo' as const, texto: `${T}${texto}`, preencher: true, ...extra });
  const constituicao =
    `**Que,** pelo presente instrumento, ${O('constitui', 'constitui', 'constituem', 'constituem')} {{flex procuradores "seu bastante procurador" "sua bastante procuradora" "seus bastantes procuradores" "suas bastantes procuradoras"}} {{procuradoresIdentificacao}}{{#if formaActuacao}}, {{formaActuacao}}{{/if}}, a quem`;
  // «{{naturezaPoderes}}» = natureza escolhida na procuração (de representação, especiais, gerais, forenses…)
  const formula = `${O('confere', 'confere', 'conferem', 'conferem')} {{naturezaPoderes}} para`;

  return {
    // Margens até à moldura (o texto fica 0,25 cm para dentro, como as bordas do Word): texto a 2,54 / 2,30 cm
    pagina: { formato: 'A4', margens: { topo: 0.8, direita: 2.05, fundo: 1.2, esquerda: 2.29 } },
    tipografia: { fonte: 'Merriweather', tamanho: 12, entrelinha: 1.5, espacoParagrafo: 0, tamanhoTitulo: 12, espacoAssinaturas: 40 },
    preenchimento: { activo: true, caracter: '-' },
    moldura: { activa: true, espessura: 1.5 },
    poderes: modo === 'PROSA' ? { modo: 'PROSA', separador: '; ', ultimoSeparador: '; e ' } : { modo: 'LISTA', numeracao: 'a)' },
    cabecalho: {
      logotipo: INSIGNIA_PNG,
      logotipoLarguraCm: 2.05,
      filete: FILETE_VERMELHO,
      linhas: [
        { texto: 'REPÚBLICA DE ANGOLA', negrito: true, tamanho: 10.5, fonte: "'Pragati Narrow', 'Arial Narrow', Arial, sans-serif" },
        { texto: '{{posto.nome}}', tamanho: 9 },
      ],
    },
    blocos: [
      { tipo: 'titulo', texto: 'PROCURAÇÃO', preencher: true },
      P(`No dia {{documento.dataExtenso}}, neste {{posto.nomeCompleto}}, sito na {{posto.morada}}, perante mim, **{{upper oficiante.nome}}**, {{oficiante.cargo}}, com plenos poderes, ${O('compareceu como outorgante', 'compareceu como outorgante', 'compareceram como outorgantes', 'compareceram como outorgantes')}:`),
      P('{{outorgantesIdentificacao}}.'),
      P(`**VERIFIQUEI A IDENTIDADE ${O('DO OUTORGANTE', 'DA OUTORGANTE', 'DOS OUTORGANTES', 'DAS OUTORGANTES')}**, ${O('pelo mencionado documento que me foi apresentado e o restituí', 'pelo mencionado documento que me foi apresentado e a restituí', 'pelos mencionados documentos que me foram apresentados e os restituí', 'pelos mencionados documentos que me foram apresentados e as restituí')}.`),
      P(`**E POR ${O('ELE', 'ELA', 'ELES', 'ELAS')} FOI DITO**:`),
      // Se o texto dos poderes já traz a fórmula («confere os mais amplos poderes…», catálogo do posto), não se repete
      ...(modo === 'PROSA' ? [P(`${constituicao} {{#if poderesComAbertura}}{{poderes}}{{else}}${formula}, {{poderes}}{{/if}}`)] : [P(`${constituicao} ${formula}:`), { tipo: 'poderes' as const }]),
      P('{{clausulas}}', { seExiste: 'clausulas' }),
      P(`**ASSIM O ${O('DISSE E OUTORGOU', 'DISSE E OUTORGOU', 'DISSERAM E OUTORGARAM', 'DISSERAM E OUTORGARAM')}**`),
      P(`${O('Ao outorgante', 'À outorgante', 'Aos outorgantes', 'Às outorgantes')} fiz, em voz alta e na sua presença a leitura e a explicação do conteúdo desta procuração.`),
      {
        tipo: 'assinaturas',
        itens: [
          { rotulo: O('O OUTORGANTE', 'A OUTORGANTE', 'OS OUTORGANTES', 'AS OUTORGANTES'), alinhamento: 'ESQUERDA' },
          { rotulo: 'O {{upper oficiante.cargo}}', nome: '{{upper oficiante.nome}}' },
        ],
      },
    ],
    // Sem numeração de páginas nem linha de controlo; rodapé institucional só no fim do documento
    rodape: {
      texto: '',
      paginacao: false,
      bloco: { contactos: CONTACTOS_POSTO, corBarra: '#E30613', imagem: RODAPE_GOVERNO_PNG, imagemAlturaCm: 1.05, tamanho: 6, apenasUltimaPagina: true, alturaReservadaCm: 2.9, filete: FILETE_VERMELHO },
    },
  };
};
