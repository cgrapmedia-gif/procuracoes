'use client';
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dataHoraPT } from '@/lib/formato';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { Giro, mensagemErro, useToast } from '@/components/ui';

interface Registo { a: { id: number; at: string; action: string; entity: string; entityId: string | null; changes: unknown; metadata: unknown; actorIp: string | null; hash: string }; actor: string | null }

export default function Auditoria() {
  const toast = useToast(); const [entidade, setEnt] = useState(''); const [verif, setVerif] = useState<{ integra: boolean; registos?: number; quebraNoRegisto?: number } | null>(null); const [aberto, setAberto] = useState<number | null>(null);
  const lista = useQuery({ queryKey: ['audit', entidade], queryFn: () => api<Registo[]>(`/audit?limite=200${entidade ? `&entidade=${entidade}` : ''}`) });
  async function verificar() { try { setVerif(await api('/audit/verify')); } catch (e) { toast(mensagemErro(e), true); } }
  return (
    <Casca migalhas={['Administração', 'Auditoria']}>
      <main className="conteudo">
        <div className="cabecalho"><div><h1>Auditoria</h1><span className="muted">Registo append-only encadeado por hashes: qualquer alteração directa na base de dados é detectada.</span></div>
          <button className="btn" onClick={verificar}><Icone n="escudo" t={16} />Verificar integridade</button></div>
        {verif && (verif.integra ? <div className="aviso ok">Cadeia íntegra: {verif.registos} registos verificados.</div> : <div className="aviso erro">Cadeia quebrada no registo {verif.quebraNoRegisto}. Contacte o responsável de segurança.</div>)}
        <section className="cartao" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 16 }}><select className="entrada" style={{ width: 240 }} aria-label="Entidade" value={entidade} onChange={(e) => setEnt(e.target.value)}><option value="">Todas as entidades</option>{['poa', 'power', 'power_version', 'person', 'user', 'document', 'template_version', 'import_batch'].map((x) => <option key={x}>{x}</option>)}</select></div>
          {lista.isLoading ? <div style={{ padding: 16 }}><Giro /></div> : (
            <table className="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>Acção</th><th>Entidade</th><th /></tr></thead>
              <tbody>{lista.data?.map(({ a, actor }) => (<Fragment key={a.id}>
                <tr><td className="muted">{dataHoraPT(a.at)}</td><td>{actor ?? 'sistema'}</td><td className="mono">{a.action}</td><td className="mono small">{a.entity} {a.entityId?.slice(0, 8)}</td>
                  <td style={{ textAlign: 'right' }}>{(a.changes || a.metadata) ? <button className="btn pequeno fantasma" aria-expanded={aberto === a.id} onClick={() => setAberto(aberto === a.id ? null : a.id)}>Detalhe</button> : null}</td></tr>
                {aberto === a.id && <tr><td colSpan={5}><pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', background: 'var(--papel)', padding: 12, borderRadius: 8, fontSize: 12 }}>{JSON.stringify({ alteracoes: a.changes, metadados: a.metadata, ip: a.actorIp, hash: a.hash }, null, 2)}</pre></td></tr>}
              </Fragment>))}</tbody></table>
          )}
        </section>
      </main>
    </Casca>
  );
}
