/** Gera docs/catalogo-inicial.json (formato de importação do Centro de Poderes) a partir do catálogo DEMO. */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PODERES } from './poderes-demo';

const saida = PODERES.map((p) => ({
  codigo: p.codigo, categoria: p.categoria, tipo: p.tipo ?? 'PODER', nome: p.nome,
  descricao: `[A VALIDAR PELO JURÍDICO] ${p.descricao}`, texto: p.texto, textoAlternativo: p.textoAlternativo,
  campos: p.campos ?? [], regras: p.regras ?? [], exclusivo: !!p.exclusivo, tiposPermitidos: p.tiposPermitidos ?? [],
  publicar: false, // entram como RASCUNHO: cada texto tem de ser revisto e publicado
}));
const destino = path.resolve(__dirname, '../../../../../docs/catalogo-inicial.json');
writeFileSync(destino, JSON.stringify(saida, null, 2));
console.log(`${saida.length} poderes escritos em ${destino}`);
