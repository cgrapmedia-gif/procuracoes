'use client';
import Link from 'next/link';
import { Suspense, use, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Categoria, DetalheProcuracao, PoderCatalogo, Verificacao } from '@/lib/tipos';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { EstadoBadge, Giro } from '@/components/ui';
import { ETAPAS, Etapas } from '@/components/assistente/Etapas';
import { useRascunho } from '@/components/assistente/rascunho';
import { EtapaPartes } from '@/components/assistente/EtapaPartes';
import { Construtor } from '@/components/assistente/Construtor';
import { EtapaConfiguracao } from '@/components/assistente/EtapaConfiguracao';
import { EtapaArquivo, EtapaEmissao, EtapaPrevia, EtapaRevisao } from '@/components/assistente/EtapasFinais';

const ESTADO_GRAVACAO = { guardado: 'Guardado', 'por-guardar': 'Alterações por guardar', 'a-guardar': 'A guardar…', conflito: 'Alterada noutro posto', erro: 'Erro ao guardar' } as const;

function Assistente({ id }: { id: string }) {
  const sp = useSearchParams(); const qc = useQueryClient(); const { pode } = useAuth();
  const det = useQuery({ queryKey: ['poa', id], queryFn: () => api<DetalheProcuracao>(`/poas/${id}`) });
  const editavel = det.data?.estado === 'RASCUNHO' && pode('poa.edit');
  const etapa = Math.min(10, Math.max(2, Number(sp.get('etapa') ?? (det.data && det.data.estado !== 'RASCUNHO' ? 9 : 2))));
  const catalogo = useQuery({ queryKey: ['catalogo', det.data?.tipo.codigo], queryFn: () => api<{ itens: PoderCatalogo[] }>(`/powers?limite=200&tipoProcuracao=${det.data!.tipo.codigo}`).then((x) => x.itens), enabled: !!det.data });
  const clausulasQ = useQuery({ queryKey: ['catalogo', 'CLAUSULA'], queryFn: () => api<{ itens: PoderCatalogo[] }>('/powers?limite=200&tipo=CLAUSULA').then((x) => x.itens) });
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => api<Categoria[]>('/power-categories') });
  const oficiantes = useQuery({ queryKey: ['officers'], queryFn: () => api<{ id: string; nome: string; cargo: string }[]>('/officers') });
  const verif = useQuery({ queryKey: ['check', id], queryFn: () => api<Verificacao>(`/poas/${id}/check`), enabled: etapa >= 7 });
  const aoGuardar = useCallback(() => { qc.invalidateQueries({ queryKey: ['poa', id] }); qc.invalidateQueries({ queryKey: ['check', id] }); }, [qc, id]);
  const { r, actualizar, estado, erro } = useRascunho(id, det.data, !!editavel, aoGuardar);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ['poa', id] }); qc.invalidateQueries({ queryKey: ['check', id] }); };

  if (det.isError) return <main className="conteudo"><div className="aviso erro">Procuração não encontrada ou sem acesso.</div></main>;
  if (!det.data || !r || !catalogo.data || !categorias.data) return <main className="conteudo"><Giro /></main>;
  const d = det.data;
  const todos = [...catalogo.data, ...(clausulasQ.data ?? []).filter((c) => !catalogo.data.some((x) => x.codigo === c.codigo))];
  const ofi = oficiantes.data?.find((o) => o.id === (r.oficianteId ?? d.oficianteId));
  const passo = (n: number) => `/procuracoes/${id}?etapa=${n}`;
  const largo = etapa === 4 || etapa === 6;

  return (
    <>
      <div className="assistente-topo">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1>{d.tipo.nome}</h1><EstadoBadge e={d.estado} />{d.numero && <span className="mono" style={{ fontSize: 14 }}>{d.numero}</span>}
              {editavel && <span className={`small ${estado === 'erro' || estado === 'conflito' ? '' : 'muted'}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: estado === 'erro' || estado === 'conflito' ? 'var(--carmim)' : undefined }} role="status"><Icone n="relogio" t={14} />{ESTADO_GRAVACAO[estado]}</span>}
            </div>
            <span className="muted">{r.outorgantes.length ? `Outorgante: ${r.outorgantes.map((o) => o.nome).join(', ')}` : 'Outorgante por identificar'}{r.procuradores.length ? ` · Procurador(es): ${r.procuradores.map((o) => o.nome).join(', ')}` : ''}</span>
          </div>
          {etapa < 8 && <Link className="btn" href={passo(8)}><Icone n="olho" t={16} />Pré-visualizar</Link>}
        </div>
        {!editavel && d.estado === 'RASCUNHO' && <div className="aviso info">Modo de consulta: o seu perfil não pode editar rascunhos.</div>}
        {d.estado !== 'RASCUNHO' && etapa < 7 && <div className="aviso info">Procuração em {d.estado.toLowerCase().replace('_', ' ')}: o conteúdo está bloqueado.</div>}
        {estado === 'conflito' && <div className="aviso erro"><span style={{ flex: 1 }}>Esta procuração foi alterada noutro posto. Recarregue para continuar sem perder o trabalho do outro utilizador.</span><button className="btn pequeno" onClick={() => window.location.reload()}>Recarregar</button></div>}
        {estado === 'erro' && <div className="aviso erro">{erro}</div>}
        <Etapas actual={etapa} id={id} bloqueadas={d.estado !== 'RASCUNHO'} />
      </div>
      <main className={largo ? '' : 'conteudo'} style={largo ? { display: 'flex', flexDirection: 'column' } : undefined}>
        {etapa === 2 && <EtapaPartes papel="outorgantes" r={r} actualizar={actualizar} editavel={!!editavel} />}
        {etapa === 3 && <EtapaPartes papel="procuradores" r={r} actualizar={actualizar} editavel={!!editavel} />}
        {etapa === 4 && <Construtor r={r} actualizar={actualizar} catalogo={todos} categorias={categorias.data} tipoCodigo={d.tipo.codigo} editavel={!!editavel} />}
        {etapa === 5 && <EtapaConfiguracao r={r} actualizar={actualizar} catalogo={todos} editavel={!!editavel} />}
        {etapa === 6 && <>
          <Construtor r={r} actualizar={actualizar} catalogo={todos} categorias={categorias.data} tipoCodigo={d.tipo.codigo} editavel={!!editavel} clausulas />
          {r.itens.some((i) => i.clausula && i.campos.length) && <div className="conteudo"><h2>Configurar cláusulas</h2><EtapaConfiguracao r={r} actualizar={actualizar} catalogo={todos} editavel={!!editavel} clausulas /></div>}
        </>}
        {etapa === 7 && <EtapaRevisao id={id} det={d} v={verif.data} oficiante={ofi ? `${ofi.nome}, ${ofi.cargo}` : undefined} />}
        {etapa === 8 && <EtapaPrevia id={id} versao={d.lockVersion} />}
        {etapa === 9 && <EtapaEmissao id={id} det={d} v={verif.data} aoMudar={recarregar} />}
        {etapa === 10 && <EtapaArquivo id={id} det={d} aoMudar={recarregar} />}
        <div className="rodape-assistente" style={{ padding: largo ? '16px 32px 32px' : undefined }}>
          {etapa > 2 ? <Link className="btn" href={passo(etapa - 1)}><Icone n="voltar" t={16} />{ETAPAS[etapa - 2]}</Link> : <span />}
          {etapa < 10 && <Link className="btn primario" href={passo(etapa + 1)}>{ETAPAS[etapa]}<Icone n="seta" t={16} /></Link>}
        </div>
      </main>
    </>
  );
}

export default function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Casca migalhas={['Procurações', 'Procuração']}><Suspense><Assistente id={id} /></Suspense></Casca>;
}
