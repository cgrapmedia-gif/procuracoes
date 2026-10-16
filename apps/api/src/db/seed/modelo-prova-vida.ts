import { DefinicaoModelo } from '@proc/core';
import { INSIGNIA_PNG, RODAPE_GOVERNO_PNG } from './imagens-posto';
import { CONTACTOS_POSTO } from './modelo-consular';

/**
 * Declaração de PROVA DE VIDA — reproduz as declarações emitidas pelo posto em 2026:
 * cabeçalho com insígnia, «D E C L A R A Ç Ã O N.º …/10.05/CGRAP/AAAA.» sublinhado, texto corrido fechado com traços,
 * data a negrito, assinatura do Cônsul Geral (rótulo, nome, qualidade) e rodapé institucional em todas as páginas.
 * Tudo editável em Modelos documentais.
 */
export const modeloProvaVida = (): DefinicaoModelo => ({
  pagina: { formato: 'A4', margens: { topo: 0.64, direita: 2.27, fundo: 2.6, esquerda: 3.0 } },
  tipografia: { fonte: 'Merriweather', tamanho: 13, entrelinha: 1.5, espacoParagrafo: 12, tamanhoTitulo: 12, espacoAssinaturas: 26, tamanhoAssinaturas: 13 },
  preenchimento: { activo: true, caracter: '-' },
  poderes: { modo: 'PROSA', separador: '; ', ultimoSeparador: '; e ' },
  marcaAguaRascunho: true,
  cabecalho: {
    logotipo: INSIGNIA_PNG, logotipoLarguraCm: 2.05,
    linhas: [
      { texto: 'REPÚBLICA DE ANGOLA', negrito: true, tamanho: 10.5, fonte: "'Pragati Narrow', 'Arial Narrow', Arial, sans-serif" },
      { texto: '{{posto.nome}}', tamanho: 9 },
    ],
  },
  blocos: [
    { tipo: 'titulo', texto: 'D E C L A R A Ç Ã O  N.º {{documento.numero}}.', sublinhado: true },
    {
      tipo: 'paragrafo', preencher: true,
      texto: '-----O Consulado Geral da República de Angola no Porto declara, que no dia {{documento.data}}, junto dos serviços consulares, {{comparencia}}.-----Esta declaração destina-se a ser presente {{aoEntidade}}, para efeito de manutenção do direito à pensão de {{pensao}}.-----Por ser verdade e me ter sido solicitada, mandei passar a presente nos termos da alínea d), do n.º 2 do Artigo 2.º, do Despacho n.º 56-O/92 de 04 de Setembro, que vai por mim assinada e autenticada com o carimbo a óleo em uso neste Consulado Geral.',
    },
    { tipo: 'paragrafo', preencher: false, texto: '-----**Consulado Geral da República de Angola no Porto, aos {{documento.data}}.**' },
    { tipo: 'assinaturas', itens: [{ rotulo: '{{signatario.rotulo}}', nome: '{{signatario.nome}}', qualidade: '{{signatario.qualidade}}', semLinha: true }] },
  ],
  rodape: { texto: '', paginacao: false, bloco: { contactos: CONTACTOS_POSTO, corBarra: '#E30613', imagem: RODAPE_GOVERNO_PNG, imagemAlturaCm: 1.05, tamanho: 6, apenasUltimaPagina: false } },
});
