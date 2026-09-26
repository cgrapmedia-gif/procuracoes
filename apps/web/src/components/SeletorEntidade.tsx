'use client';
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefEntidade } from '@proc/core/browser';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Icone } from './Icone';
import { Campo, Modal, mensagemErro } from './ui';

interface Entidade { id: string; type: string; name: string; shortName: string | null }
export const TIPOS_ENTIDADE: [string, string][] = [
  ['BANCO', 'Instituição bancária'], ['CONSERVATORIA', 'Conservatória / registos'], ['TRIBUNAL', 'Tribunal'], ['SEGURANCA_SOCIAL', 'Segurança social'],
  ['ADMIN_TRIBUTARIA', 'Administração tributária'], ['OPERADORA', 'Operadora de telecomunicações'], ['SEGURADORA', 'Seguradora'],
  ['EMPRESA', 'Empresa'], ['SERVICO_PUBLICO', 'Serviço público'], ['OUTRA', 'Outra'],
];
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Escolha de entidade com pesquisa e criação no momento (sem sair da procuração).
 * Se a entidade já existir (mesmo tipo e nome ou sigla), o servidor devolve a existente em vez de duplicar.
 */
export function SeletorEntidade({ tipo, valor, mudar, desactivado, rotulo }: { tipo: string; valor?: RefEntidade; mudar: (v: RefEntidade | undefined) => void; desactivado?: boolean; rotulo: string }) {
  const { pode } = useAuth(); const qc = useQueryClient();
  const lista = useQuery({ queryKey: ['entities', tipo], queryFn: () => api<Entidade[]>(`/entities${tipo ? `?tipo=${tipo}` : ''}`) });
  const [q, setQ] = useState(''); const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState<{ aberta: boolean; tipo: string; nome: string; sigla: string; erro: string; aGravar: boolean }>({ aberta: false, tipo: tipo || 'OUTRA', nome: '', sigla: '', erro: '', aGravar: false });
  const ref = useRef<HTMLInputElement>(null);
  const filtradas = useMemo(() => (lista.data ?? []).filter((e) => !q.trim() || norm(`${e.name} ${e.shortName ?? ''}`).includes(norm(q.trim()))).slice(0, 12), [lista.data, q]);
  const escolher = (e: Entidade) => { mudar({ id: e.id, nome: e.name, sigla: e.shortName ?? undefined }); setQ(''); setAberto(false); };

  async function criar() {
    setNova((x) => ({ ...x, erro: '', aGravar: true }));
    try {
      const e = await api<Entidade & { existente: boolean }>('/entities', { body: { tipo: nova.tipo, nome: nova.nome, sigla: nova.sigla || undefined } });
      await qc.invalidateQueries({ queryKey: ['entities'] });
      escolher(e);
      setNova((x) => ({ ...x, aberta: false, aGravar: false, erro: e.existente ? '' : '' }));
    } catch (e) { setNova((x) => ({ ...x, aGravar: false, erro: mensagemErro(e) })); }
  }

  if (valor?.id) {
    return (
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 42, padding: '6px 12px', border: '1px solid var(--linha-forte)', borderRadius: 8, background: 'var(--folha)' }}>
        <b style={{ flex: 1, fontWeight: 600 }}>{valor.sigla ? `${valor.sigla} – ` : ''}{valor.nome}</b>
        {!desactivado && <button type="button" className="btn pequeno" onClick={() => { mudar(undefined); setTimeout(() => ref.current?.focus(), 0); }}>Trocar</button>}
      </span>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <label className="pesquisa" style={{ width: '100%', margin: 0, background: 'var(--folha)', height: 42 }}>
        <Icone n="pesquisa" t={16} /><span className="sr">{rotulo}</span>
        <input ref={ref} type="search" disabled={desactivado} placeholder="Pesquisar pelo nome ou sigla" value={q} role="combobox" aria-expanded={aberto}
          onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)} onChange={(e) => { setQ(e.target.value); setAberto(true); }} />
      </label>
      {aberto && (
        <ul role="listbox" style={{ position: 'absolute', top: 46, left: 0, right: 0, margin: 0, padding: 6, listStyle: 'none', background: 'var(--folha)', border: '1px solid var(--linha)', borderRadius: 10, boxShadow: '0 8px 24px rgba(22,24,29,.12)', zIndex: 10, maxHeight: 300, overflow: 'auto' }}>
          {filtradas.map((e) => (
            <li key={e.id} role="option" aria-selected="false">
              <button type="button" className="item-poder" onMouseDown={(ev) => ev.preventDefault()} onClick={() => escolher(e)}>
                <span style={{ flex: 1 }}>{e.shortName && <b style={{ fontWeight: 600 }}>{e.shortName} – </b>}{e.name}</span>
              </button>
            </li>
          ))}
          {filtradas.length === 0 && <li className="small muted" style={{ padding: '8px 10px' }}>Nenhuma entidade encontrada{q ? ` para «${q}»` : ''}.</li>}
          {pode('entity.create') && (
            <li>
              <button type="button" className="item-poder" style={{ color: 'var(--carmim)', fontWeight: 600 }} onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => { setNova({ aberta: true, tipo: tipo || 'OUTRA', nome: q.trim(), sigla: '', erro: '', aGravar: false }); setAberto(false); }}>
                <Icone n="mais" t={15} />{q.trim() ? `Acrescentar «${q.trim()}»` : 'Acrescentar nova entidade'}
              </button>
            </li>
          )}
        </ul>
      )}
      <Modal titulo="Nova entidade" aberta={nova.aberta} fechar={() => setNova((x) => ({ ...x, aberta: false }))}
        rodape={<><button className="btn fantasma" onClick={() => setNova((x) => ({ ...x, aberta: false }))}>Cancelar</button><button className="btn primario" disabled={nova.aGravar || nova.nome.trim().length < 3} onClick={criar}>{nova.aGravar ? 'A gravar…' : 'Acrescentar e usar'}</button></>}>
        <p className="small muted" style={{ margin: 0 }}>Fica disponível para todas as procurações. O nome aparece no documento em maiúsculas e negrito, com a sigla à frente.</p>
        {nova.erro && <div className="aviso erro" role="alert">{nova.erro}</div>}
        <Campo rotulo="Tipo" obrigatorio><select className="entrada" value={nova.tipo} onChange={(e) => setNova((x) => ({ ...x, tipo: e.target.value }))}>{TIPOS_ENTIDADE.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
        <Campo rotulo="Nome oficial completo" obrigatorio ajuda="Ex.: Banco Angolano de Investimento, S.A."><input className="entrada" value={nova.nome} onChange={(e) => setNova((x) => ({ ...x, nome: e.target.value }))} autoFocus /></Campo>
        <Campo rotulo="Sigla" opcional ajuda="Ex.: BAI. No documento: «BAI – BANCO ANGOLANO DE INVESTIMENTO, S.A.»"><input className="entrada" value={nova.sigla} onChange={(e) => setNova((x) => ({ ...x, sigla: e.target.value.toUpperCase() }))} /></Campo>
        {nova.nome.trim().length >= 3 && <div className="texto-juridico" style={{ fontSize: 13 }}>… junto da instituição bancária <b>{(nova.sigla ? `${nova.sigla} – ` : '') + nova.nome.trim().toLocaleUpperCase('pt')}</b>, …</div>}
      </Modal>
    </div>
  );
}
