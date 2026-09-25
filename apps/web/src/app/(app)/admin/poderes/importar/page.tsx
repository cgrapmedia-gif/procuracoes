'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { mensagemErro, useToast } from '@/components/ui';

interface Resultado { loteId: string; total: number; novos: number; duplicados: number; erros: number; resultados: { linha: number; codigo: string; estado: 'NOVO' | 'DUPLICADO' | 'ERRO'; erros: string[] }[] }
const MODELO_CSV = 'codigo;categoria;nome;descricao;tipo;texto;campos;regras;exclusivo;tipos_permitidos\nEXEMPLO-001;OUTROS;Nome do poder;Descrição curta;PODER;tratar de {{assunto}} junto de {{entidade}};"[{""chave"":""assunto"",""rotulo"":""Assunto"",""tipo"":""TEXTO"",""obrigatorio"":true},{""chave"":""entidade"",""rotulo"":""Entidade"",""tipo"":""TEXTO"",""obrigatorio"":true}]";SUGERE:ADM-003;false;\n';

export default function Importar() {
  const toast = useToast();
  const [res, setRes] = useState<Resultado | null>(null); const [aEnviar, setA] = useState(false); const [erro, setErro] = useState(''); const [feito, setFeito] = useState<{ criados: number; publicados: number } | null>(null);
  const [filtro, setFiltro] = useState<'TODOS' | 'NOVO' | 'DUPLICADO' | 'ERRO'>('TODOS');
  async function enviar(f: File) {
    const fd = new FormData(); fd.append('ficheiro', f); setA(true); setErro(''); setRes(null); setFeito(null);
    try { setRes(await api<Resultado>('/powers/import/preview', { form: fd })); } catch (e) { setErro(mensagemErro(e)); } finally { setA(false); }
  }
  async function confirmar() {
    if (!res) return; setA(true);
    try { const r = await api<{ criados: number; publicados: number }>(`/powers/import/${res.loteId}/commit`, { method: 'POST' }); setFeito(r); toast(`${r.criados} poderes importados.`); } catch (e) { toast(mensagemErro(e), true); } finally { setA(false); }
  }
  const baixarModelo = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + MODELO_CSV], { type: 'text/csv' })); a.download = 'modelo-importacao-poderes.csv'; a.click(); };
  const linhas = res?.resultados.filter((r) => filtro === 'TODOS' || r.estado === filtro) ?? [];
  return (
    <Casca migalhas={['Administração', 'Centro de Poderes', 'Importar']}>
      <main className="conteudo" style={{ maxWidth: 1100 }}>
        <div className="cabecalho"><div><Link href="/admin/poderes" className="small">Centro de Poderes</Link><h1>Importar poderes</h1><span className="muted">CSV, Excel (.xlsx) ou JSON. Nada é criado antes de confirmar: primeiro vê o que é novo, duplicado ou tem erros.</span></div>
          <button className="btn" onClick={baixarModelo}><Icone n="descarregar" t={16} />Modelo CSV</button></div>
        <label className="cartao" style={{ padding: 32, borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'center' }}>
          <Icone n="carregar" t={28} />
          <b style={{ fontWeight: 600 }}>{aEnviar ? 'A validar…' : 'Escolher ficheiro'}</b>
          <span className="small muted">Até 5 000 poderes por lote, 10 MB. Colunas: codigo, categoria, nome, texto, campos (JSON), regras (ex.: REQUER:BANC-001;SUGERE:REG-002)…</span>
          <input type="file" accept=".csv,.xlsx,.json" className="sr" onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
        </label>
        {erro && <div className="aviso erro" role="alert">{erro}</div>}
        {feito && <div className="aviso ok">Importação concluída: {feito.criados} criados, {feito.publicados} publicados. <Link href="/admin/poderes">Ver catálogo</Link></div>}
        {res && !feito && <>
          <div className="grelha" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {([['TODOS', 'Linhas', res.total, undefined], ['NOVO', 'Novos', res.novos, 'var(--verde)'], ['DUPLICADO', 'Duplicados', res.duplicados, 'var(--ambar)'], ['ERRO', 'Com erros', res.erros, 'var(--carmim)']] as const).map(([k, r, n, cor]) => (
              <button key={k} className="cartao" onClick={() => setFiltro(k)} aria-pressed={filtro === k} style={{ padding: 16, textAlign: 'left', cursor: 'pointer', borderColor: filtro === k ? 'var(--tinta)' : undefined }}><span className="small muted">{r}</span><br /><span style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 600, color: cor }}>{n}</span></button>
            ))}
          </div>
          <section className="cartao" style={{ overflow: 'hidden' }}>
            <table className="tabela"><thead><tr><th>Linha</th><th>Código</th><th>Resultado</th><th>Detalhe</th></tr></thead>
              <tbody>{linhas.slice(0, 500).map((l) => <tr key={l.linha}><td>{l.linha}</td><td className="mono">{l.codigo || '—'}</td><td><span className={`estado ${l.estado === 'NOVO' ? 'EMITIDA' : l.estado === 'DUPLICADO' ? 'EM_REVISAO' : 'CANCELADA'}`}>{l.estado === 'NOVO' ? 'Novo' : l.estado === 'DUPLICADO' ? 'Duplicado' : 'Erro'}</span></td><td className="small">{l.erros.join('; ')}</td></tr>)}</tbody></table>
          </section>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            <span className="small muted">Só as {res.novos} linhas novas e válidas serão importadas, numa única operação.</span>
            <button className="btn primario" disabled={aEnviar || res.novos === 0} onClick={confirmar}>Importar {res.novos} poderes</button>
          </div>
        </>}
      </main>
    </Casca>
  );
}
