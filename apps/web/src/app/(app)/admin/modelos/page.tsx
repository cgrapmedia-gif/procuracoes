'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dataHoraPT } from '@/lib/formato';
import { Casca } from '@/components/Casca';
import { Giro } from '@/components/ui';

interface Modelo { id: string; code: string; name: string; currentVersionId: string | null; isDemo: boolean }
interface Versao { id: string; versionNo: number; status: string; definition: { blocos: { tipo: string; texto?: string }[]; tipografia: { fonte: string; tamanho: number; entrelinha: number }; poderes: { modo: string }; pagina: { margens: Record<string, number> } }; changeNote: string | null; publishedAt: string | null; createdAt: string }

export default function Modelos() {
  const lista = useQuery({ queryKey: ['templates'], queryFn: () => api<Modelo[]>('/templates') });
  const [sel, setSel] = useState<string | null>(null);
  const id = sel ?? lista.data?.[0]?.id;
  const versoes = useQuery({ queryKey: ['template-versions', id], queryFn: () => api<Versao[]>(`/templates/${id}/versions`), enabled: !!id });
  const v = versoes.data?.[0];
  return (
    <Casca migalhas={['Administração', 'Modelos documentais']}>
      <main className="conteudo">
        <div className="cabecalho"><div><h1>Modelos documentais</h1><span className="muted">Estrutura do documento emitido. Cada tipo de procuração usa um modelo; os modelos são versionados como os poderes.</span></div></div>
        <div className="grelha" style={{ gridTemplateColumns: '300px minmax(0, 1fr)', alignItems: 'start' }}>
          <nav className="cartao" style={{ padding: 8 }} aria-label="Modelos">{lista.data?.map((m) => <button key={m.id} className="item-poder" aria-current={id === m.id} onClick={() => setSel(m.id)}><span><b style={{ fontWeight: 500 }}>{m.name}</b><br /><span className="small muted mono">{m.code}</span></span></button>)}</nav>
          {!v ? <Giro /> : (
            <section className="cartao"><div className="corpo">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><h2 style={{ flex: 1 }}>Versão {v.versionNo}</h2><span className="small muted">{v.publishedAt ? `publicada ${dataHoraPT(v.publishedAt)}` : 'rascunho'}</span></div>
              <p className="small muted" style={{ margin: 0 }}>{v.definition.tipografia.fonte} {v.definition.tipografia.tamanho} pt, entrelinha {v.definition.tipografia.entrelinha}; poderes em {v.definition.poderes.modo === 'PROSA' ? 'texto corrido' : 'alíneas'}; margens {Object.values(v.definition.pagina.margens).join(' / ')} cm.</p>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {v.definition.blocos.map((b, i) => <li key={i}><span className="small muted">{b.tipo}</span>{b.texto && <p className="texto-juridico" style={{ fontSize: 12, fontFamily: 'var(--mono)', marginTop: 4 }}>{b.texto}</p>}</li>)}
              </ol>
              <div className="aviso info">A edição visual de modelos está prevista para a fase seguinte. Nesta versão, novas versões são criadas pela API (POST /templates/:id/versions) e publicadas por quem tem essa permissão.</div>
            </div></section>
          )}
        </div>
      </main>
    </Casca>
  );
}
