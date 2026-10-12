'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Campo } from '../ui';
import { Rascunho } from './rascunho';

/** Data, local e oficiante (quem assina) — alteráveis enquanto a procuração é rascunho. */
export function DadosActo({ r, actualizar, editavel, oficiantes }: { r: Rascunho; actualizar: (fn: (x: Rascunho) => Rascunho) => void; editavel: boolean; oficiantes: { id: string; nome: string; cargo: string }[] }) {
  const tipos = useQuery({ queryKey: ['poa-types'], queryFn: () => api<{ codigo: string; nome: string }[]>('/poa-types') });
  return (
    <section className="cartao" style={{ maxWidth: 900 }}><div className="corpo">
      <h3>Dados do acto</h3>
      <Campo rotulo="Tipo de procuração" obrigatorio ajuda="Define os poderes propostos no passo 4 e o modelo do documento. Pode mudar enquanto for rascunho.">
        <select className="entrada" disabled={!editavel} value={r.tipoCodigo} onChange={(e) => actualizar((x) => ({ ...x, tipoCodigo: e.target.value }))}>
          {tipos.data?.map((t) => <option key={t.codigo} value={t.codigo}>{t.nome}</option>)}
        </select>
      </Campo>
      <div className="linha-form">
        <Campo rotulo="Data do acto" obrigatorio><input className="entrada" type="date" disabled={!editavel} value={r.dataActo} onChange={(e) => actualizar((x) => ({ ...x, dataActo: e.target.value }))} /></Campo>
        <Campo rotulo="Local" obrigatorio><input className="entrada" disabled={!editavel} value={r.local} onChange={(e) => actualizar((x) => ({ ...x, local: e.target.value }))} /></Campo>
        <Campo rotulo="Oficiante (quem assina)" obrigatorio ajuda="Nomes e cargos geridos em Modelos documentais → Dados do posto e oficiantes.">
          <select className="entrada" disabled={!editavel} value={r.oficianteId ?? ''} onChange={(e) => actualizar((x) => ({ ...x, oficianteId: e.target.value || null }))}>
            <option value="">Escolher…</option>{oficiantes.map((o) => <option key={o.id} value={o.id}>{o.nome}, {o.cargo}</option>)}
          </select>
        </Campo>
      </div>
    </div></section>
  );
}
