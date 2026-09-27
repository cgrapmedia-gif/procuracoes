'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { mensagemErro, useToast } from '@/components/ui';

interface Resultado { loteId: string; total: number; novos: number; duplicados: number; erros: number; resultados: { linha: number; nome: string; documento: string; estado: 'NOVO' | 'DUPLICADO' | 'ERRO'; erros: string[]; avisos?: string[] }[] }
const MODELO = 'Nome;Sexo;Data de nascimento;Nacionalidade;Naturalidade;Estado civil;Cônjuge;Regime de bens;Profissão;Tipo de documento;BI;Data de emissão;Validade;Vitalício;NIF;Morada;Código postal;Localidade;Concelho;Província;País;Telefone;Email\n'
  + 'Maria Exemplo da Silva;F;15/03/1990;angolana;Município de Baía Farta, Província de Benguela;casada;João Exemplo;comunhão de adquiridos;enfermeira;Bilhete de Identidade;000000000LA000;01/02/2024;31/01/2034;não;;Rua de Exemplo, 66;4000-000;Porto;Porto;;Portugal;+351 900 000 000;maria@exemplo.test\n';

export default function ImportarPessoas() {
  const toast = useToast(); const qc = useQueryClient();
  const [res, setRes] = useState<Resultado | null>(null); const [a, setA] = useState(false); const [erro, setErro] = useState(''); const [feito, setFeito] = useState<{ criados: number; ignorados: number } | null>(null);
  const [filtro, setFiltro] = useState<'TODOS' | 'NOVO' | 'DUPLICADO' | 'ERRO'>('TODOS');
  async function enviar(f: File) {
    const fd = new FormData(); fd.append('ficheiro', f); setA(true); setErro(''); setRes(null); setFeito(null);
    try { setRes(await api<Resultado>('/persons/import/preview', { form: fd })); } catch (e) { setErro(mensagemErro(e)); } finally { setA(false); }
  }
  async function confirmar() {
    if (!res) return; setA(true);
    try { const r = await api<{ criados: number; ignorados: number }>(`/persons/import/${res.loteId}/commit`, { method: 'POST' }); setFeito(r); qc.invalidateQueries({ queryKey: ['persons'] }); toast(`${r.criados} pessoas importadas.`); }
    catch (e) { toast(mensagemErro(e), true); } finally { setA(false); }
  }
  const modelo = () => { const x = document.createElement('a'); x.href = URL.createObjectURL(new Blob(['\uFEFF' + MODELO], { type: 'text/csv' })); x.download = 'modelo-importacao-pessoas.csv'; x.click(); };
  const linhas = res?.resultados.filter((r) => filtro === 'TODOS' || r.estado === filtro) ?? [];
  return (
    <Casca migalhas={['Pessoas', 'Importar']}>
      <main className="conteudo" style={{ maxWidth: 1100 }}>
        <div className="cabecalho">
          <div><Link href="/pessoas" className="small">Pessoas</Link><h1>Importar pessoas</h1>
            <span className="muted">CSV, Excel (.xlsx) ou JSON. Nada é gravado antes de confirmar. As pessoas que já existem (mesmo documento) não são duplicadas. Os números de documento, NIF e contactos ficam cifrados.</span></div>
          <button className="btn" onClick={modelo}><Icone n="descarregar" t={16} />Modelo Excel/CSV</button>
        </div>
        <div className="aviso info" style={{ flexDirection: 'column', gap: 4 }}>
          <b>Como preparar o ficheiro</b>
          <span className="small">Uma pessoa por linha, com cabeçalhos na 1.ª linha (maiúsculas e acentos não importam). Só o <b>Nome</b> é indispensável: pessoas sem BI, com BI de formato não habitual ou sem sexo entram na mesma, com aviso (completam-se antes de emitir). Para ficheiros com dezenas de milhares de pessoas use o importador em massa (ver guia). Datas como 15/03/1990 ou 1990-03-15. Tipo de documento: Bilhete de Identidade (por omissão), Passaporte, Cartão de Cidadão ou Título de Residência.</span>
        </div>
        <label className="cartao" style={{ padding: 32, borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'center' }}>
          <Icone n="carregar" t={28} /><b style={{ fontWeight: 600 }}>{a ? 'A validar…' : 'Escolher ficheiro'}</b><span className="small muted">Até 5 000 pessoas por lote, 10 MB (CSV do Excel em português é reconhecido)</span>
          <input type="file" accept=".csv,.xlsx,.json" className="sr" onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
        </label>
        {erro && <div className="aviso erro" role="alert">{erro}</div>}
        {feito && <div className="aviso ok">Importação concluída: {feito.criados} pessoas criadas{feito.ignorados ? `, ${feito.ignorados} ignoradas (já existiam)` : ''}. <Link href="/pessoas">Ver pessoas</Link></div>}
        {res && !feito && <>
          <div className="grelha" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {([['TODOS', 'Linhas', res.total, undefined], ['NOVO', 'Novas', res.novos, 'var(--verde)'], ['DUPLICADO', 'Já existentes', res.duplicados, 'var(--ambar)'], ['ERRO', 'Com erros', res.erros, 'var(--carmim)']] as const).map(([k, r, n, cor]) => (
              <button key={k} className="cartao" onClick={() => setFiltro(k)} aria-pressed={filtro === k} style={{ padding: 16, textAlign: 'left', cursor: 'pointer', borderColor: filtro === k ? 'var(--tinta)' : undefined }}><span className="small muted">{r}</span><br /><span style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 600, color: cor }}>{n}</span></button>
            ))}
          </div>
          <section className="cartao" style={{ overflow: 'hidden' }}>
            <table className="tabela"><thead><tr><th>Linha</th><th>Nome</th><th>Documento</th><th>Resultado</th><th>Detalhe</th></tr></thead>
              <tbody>{linhas.slice(0, 500).map((l) => <tr key={l.linha}><td>{l.linha}</td><td>{l.nome}</td><td className="mono">{l.documento}</td><td><span className={`estado ${l.estado === 'NOVO' ? 'EMITIDA' : l.estado === 'DUPLICADO' ? 'EM_REVISAO' : 'CANCELADA'}`}>{l.estado === 'NOVO' ? 'Nova' : l.estado === 'DUPLICADO' ? 'Já existe' : 'Erro'}</span></td><td className="small">{[...l.erros, ...(l.avisos ?? [])].join('; ')}</td></tr>)}</tbody></table>
          </section>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            <span className="small muted">Só as {res.novos} linhas novas e válidas são importadas. Corrija as linhas com erro no ficheiro e importe-o de novo.</span>
            <button className="btn primario" disabled={a || res.novos === 0} onClick={confirmar}>Importar {res.novos} pessoas</button>
          </div>
        </>}
      </main>
    </Casca>
  );
}
