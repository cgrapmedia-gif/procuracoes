'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { hojeISO } from '@/lib/formato';
import { Casca } from '@/components/Casca';
import { Campo, mensagemErro } from '@/components/ui';
import { Etapas } from '@/components/assistente/Etapas';

interface Tipo { codigo: string; nome: string; descricao: string | null; sugeridos: string[] }
interface Modelo { id: string; name: string; scope: 'PESSOAL' | 'INSTITUCIONAL'; items: { codigo: string }[] }

/** Etapa 1: tipo de procuração. Cria o rascunho e segue para o construtor. */
export default function Nova() {
  const router = useRouter();
  const tipos = useQuery({ queryKey: ['poa-types'], queryFn: () => api<Tipo[]>('/poa-types') });
  const oficiantes = useQuery({ queryKey: ['officers'], queryFn: () => api<{ id: string; nome: string; cargo: string }[]>('/officers') });
  const modelos = useQuery({ queryKey: ['saved-models'], queryFn: () => api<Modelo[]>('/saved-models') });
  const [tipo, setTipo] = useState(''); const [data, setData] = useState(hojeISO()); const [local, setLocal] = useState('Porto');
  const [ofi, setOfi] = useState(''); const [modelo, setModelo] = useState(''); const [erro, setErro] = useState(''); const [aCriar, setA] = useState(false);
  useEffect(() => { if (!ofi && oficiantes.data?.[0]) setOfi(oficiantes.data[0].id); }, [oficiantes.data, ofi]);
  async function criar(e: FormEvent) {
    e.preventDefault(); if (!tipo) { setErro('Escolha o tipo de procuração.'); return; }
    setA(true); setErro('');
    try { const r = await api<{ id: string }>('/poas', { body: { tipoCodigo: tipo, dataActo: data, local, oficianteId: ofi || undefined, modeloGuardadoId: modelo || undefined } }); router.push(`/procuracoes/${r.id}?etapa=2`); }
    catch (x) { setErro(mensagemErro(x)); setA(false); }
  }
  return (
    <Casca migalhas={['Procurações', 'Nova procuração']}>
      <div className="assistente-topo"><h1>Nova procuração</h1><Etapas actual={1} /></div>
      <main className="conteudo">
        <form onSubmit={criar} style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980 }}>
          {erro && <div className="aviso erro" role="alert">{erro}</div>}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend><h2 style={{ marginBottom: 12 }}>Tipo de procuração</h2></legend>
            <div className="grelha" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {tipos.data?.map((t) => (
                <label key={t.codigo} className="cartao" style={{ padding: 16, display: 'flex', gap: 12, cursor: 'pointer', borderColor: tipo === t.codigo ? 'var(--tinta)' : undefined, boxShadow: tipo === t.codigo ? '0 0 0 1px var(--tinta)' : undefined }}>
                  <input type="radio" name="tipo" value={t.codigo} checked={tipo === t.codigo} onChange={() => setTipo(t.codigo)} style={{ marginTop: 3 }} />
                  <span><b style={{ fontWeight: 600 }}>{t.nome}</b><br /><span className="small muted">{t.sugeridos.length ? `${t.sugeridos.length} poderes sugeridos` : 'Poderes à escolha'}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="cartao"><div className="corpo">
            <h2>Dados do acto</h2>
            <div className="linha-form">
              <Campo rotulo="Data do acto" obrigatorio><input className="entrada" type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Campo>
              <Campo rotulo="Local" obrigatorio><input className="entrada" value={local} onChange={(e) => setLocal(e.target.value)} required /></Campo>
              <Campo rotulo="Oficiante" obrigatorio><select className="entrada" value={ofi} onChange={(e) => setOfi(e.target.value)}>{oficiantes.data?.map((o) => <option key={o.id} value={o.id}>{o.nome}, {o.cargo}</option>)}</select></Campo>
            </div>
            <Campo rotulo="Partir de uma procuração recorrente" opcional ajuda="Carrega os poderes do modelo; pode acrescentar ou retirar depois.">
              <select className="entrada" value={modelo} onChange={(e) => setModelo(e.target.value)}><option value="">Nenhuma — começar do zero</option>{modelos.data?.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.scope === 'PESSOAL' ? 'pessoal' : 'institucional'}, {m.items.length} poderes)</option>)}</select>
            </Campo>
          </div></div>
          <div className="rodape-assistente"><span /><button className="btn primario" disabled={aCriar}>{aCriar ? 'A criar…' : 'Criar e identificar o outorgante'}</button></div>
        </form>
      </main>
    </Casca>
  );
}
