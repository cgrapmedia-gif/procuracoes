'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dataPT } from '@/lib/formato';
import { Estado } from '@/lib/tipos';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { EstadoBadge, Giro } from '@/components/ui';

interface Dash { totais: Record<string, number>; porMes: { mes: string; total: number }[]; porTipo: { tipo: string; total: number }[]; topPoderes: { codigo: string; nome: string; total: number }[] }
interface Lista { total: number; itens: { id: string; numero: string | null; estado: Estado; dataActo: string; tipo: string; outorgantes: string; actualizadaEm: string }[] }
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function Indicador({ rotulo, valor, nota, cor }: { rotulo: string; valor: number | string; nota?: string; cor?: string }) {
  return <div className="cartao"><div className="corpo" style={{ gap: 4 }}><span className="small muted">{rotulo}</span><span style={{ fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 600, color: cor }}>{valor}</span>{nota && <span className="small muted">{nota}</span>}</div></div>;
}

export default function Painel() {
  const { utilizador, pode } = useAuth();
  const d = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dash>('/dashboard') });
  const recentes = useQuery({ queryKey: ['poas', 'recentes'], queryFn: () => api<Lista>('/poas?limite=6') });
  const revisao = useQuery({ queryKey: ['poas', 'EM_REVISAO'], queryFn: () => api<Lista>('/poas?estado=EM_REVISAO&limite=5'), enabled: pode('poa.validate') });
  const meus = useQuery({ queryKey: ['poas', 'meus-rascunhos'], queryFn: () => api<Lista>('/poas?estado=RASCUNHO&minhas=true&limite=5'), enabled: pode('poa.edit') });
  const validadas = useQuery({ queryKey: ['poas', 'VALIDADA'], queryFn: () => api<Lista>('/poas?estado=VALIDADA&limite=5'), enabled: pode('poa.issue') });
  const t = d.data?.totais;
  const max = Math.max(1, ...(d.data?.porMes.map((m) => m.total) ?? [1]));
  const totalTipos = d.data?.porTipo.reduce((a, b) => a + b.total, 0) || 1;
  const hora = new Date().getHours();
  return (
    <Casca migalhas={['Painel']}>
      <main className="conteudo">
        <div className="cabecalho">
          <div><h1>{hora < 13 ? 'Bom dia' : hora < 20 ? 'Boa tarde' : 'Boa noite'}, {utilizador?.nome.split(' ')[0]}</h1><span className="muted">{new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
          {pode('poa.create') && <Link className="btn primario" href="/procuracoes/nova"><Icone n="mais" t={16} />Nova procuração</Link>}
        </div>
        {!t ? <Giro /> : (
          <div className="grelha" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Indicador rotulo="Total" valor={t.total} />
            <Indicador rotulo="Rascunhos" valor={t.rascunhos} />
            <Indicador rotulo="Em revisão" valor={t.emRevisao} cor="var(--ambar)" />
            <Indicador rotulo="Emitidas" valor={t.emitidas} cor="var(--verde)" />
            <Indicador rotulo="Canceladas" valor={t.canceladas} cor="var(--carmim)" />
            <Indicador rotulo="Este mês" valor={t.esteMes} nota={`${t.esteAno} este ano`} />
          </div>
        )}
        <div className="grelha" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
          <section className="cartao"><div className="corpo">
            <h2>Procurações por mês</h2>
            {d.data && d.data.porMes.length === 0 && <p className="muted">Ainda não há procurações.</p>}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200 }} role="img" aria-label="Gráfico de barras de procurações por mês">
              {d.data?.porMes.map((m, i, a) => (
                <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span className="small muted">{m.total}</span>
                  <div style={{ width: '70%', maxWidth: 34, height: Math.max(4, (m.total / max) * 150), background: i === a.length - 1 ? 'var(--carmim)' : '#CFC4B2', borderRadius: '4px 4px 0 0' }} />
                  <span className="small muted">{MESES[Number(m.mes.slice(5)) - 1]}</span>
                </div>
              ))}
            </div>
          </div></section>
          <section className="cartao"><div className="corpo">
            <h2>Por tipo</h2>
            {d.data?.porTipo.map((x) => (
              <div key={x.tipo} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{x.tipo}</span><span className="muted">{x.total}</span></div>
                <div style={{ height: 8, background: '#EEEAE2', borderRadius: 4 }}><div style={{ height: 8, width: `${(x.total / totalTipos) * 100}%`, background: 'var(--tinta)', borderRadius: 4 }} /></div>
              </div>
            ))}
          </div></section>
        </div>
        <div className="grelha" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
          <section className="cartao"><div className="corpo">
            <h2>Actividade recente</h2>
            <table className="tabela"><tbody>
              {recentes.data?.itens.map((p) => (
                <tr key={p.id}><td className="mono">{p.numero ?? <span className="muted">sem número</span>}</td><td><Link href={`/procuracoes/${p.id}`}>{p.outorgantes || 'Sem outorgante'}</Link></td><td className="muted">{p.tipo}</td><td><EstadoBadge e={p.estado} /></td><td className="muted" style={{ textAlign: 'right' }}>{dataPT(p.dataActo)}</td></tr>
              ))}
            </tbody></table>
          </div></section>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!!meus.data?.total && (
              <section className="cartao"><div className="corpo">
                <h2>Continuar onde parou</h2>
                {meus.data.itens.map((p) => (
                  <Link key={p.id} href={`/procuracoes/${p.id}`} className="btn" style={{ justifyContent: 'space-between', height: 'auto', padding: '10px 14px', whiteSpace: 'normal', textAlign: 'left' }}>
                    <span><b style={{ fontWeight: 600 }}>{p.outorgantes || 'Sem outorgante'}</b><br /><span className="small muted">{p.tipo} · actualizado {dataPT(p.actualizadaEm)}</span></span><Icone n="seta" t={16} />
                  </Link>
                ))}
              </div></section>
            )}
            {(revisao.data?.total || validadas.data?.total) ? (
              <section className="cartao"><div className="corpo">
                <h2>Requer a sua atenção</h2>
                {!!revisao.data?.total && <Link className="btn" style={{ justifyContent: 'space-between' }} href="/procuracoes?estado=EM_REVISAO">{revisao.data.total} a aguardar validação<Icone n="seta" t={16} /></Link>}
                {!!validadas.data?.total && <Link className="btn" style={{ justifyContent: 'space-between' }} href="/procuracoes?estado=VALIDADA">{validadas.data.total} prontas para emitir<Icone n="seta" t={16} /></Link>}
              </div></section>
            ) : null}
            <section className="cartao"><div className="corpo">
              <h2>Poderes mais usados</h2>
              {d.data?.topPoderes.length === 0 && <p className="muted small">Aparecem depois das primeiras emissões.</p>}
              {d.data?.topPoderes.slice(0, 5).map((p) => <div key={p.codigo} style={{ display: 'flex', gap: 8, fontSize: 13.5 }}><span style={{ flex: 1 }}>{p.nome}</span><b>{p.total}</b></div>)}
            </div></section>
          </div>
        </div>
      </main>
    </Casca>
  );
}
