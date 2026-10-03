/** Converte o catálogo do posto (JSON ou Excel) para o formato de importação: npm run db:converter-catalogo -w @proc/api -- entrada.json saida.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { ImportService } from '../../powers/import.service';
(async () => {
  const [entrada, saida] = process.argv.slice(2);
  const linhas = await (Object.create(ImportService.prototype) as ImportService).lerFicheiro(entrada, readFileSync(entrada));
  writeFileSync(saida, JSON.stringify(linhas, null, 2));
  console.log(`${linhas.length} poderes escritos em ${saida}`);
})();
