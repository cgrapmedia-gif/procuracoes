'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { Campo, mensagemErro, useToast } from '@/components/ui';

/** Manutenção: apagar todas as procurações e documentos (por exemplo, os de teste, antes de começar a produção). */
export default function Manutencao() {
  const toast = useToast(); const qc = useQueryClient();
  const total = useQuery({ queryKey: ['poas', 'total'], queryFn: () => api<{ total: number }>('/poas?limite=1') });
  const [f, setF] = useState({ motivo: '', confirmacao: '', reiniciarNumeracao: true }); const [a, setA] = useState(false);
  const [rep, setRep] = useState<{ verificadas: number; regeneradas: number; digitalizacoesEmFalta: string[]; erros: string[] } | null>(null); const [aReparar, setAR] = useState(false);
  async function reparar() { setAR(true); try { setRep(await api('/admin/repair-documents', { method: 'POST' })); } catch (e) { toast(mensagemErro(e), true); } finally { setAR(false); } }
  const [feito, setFeito] = useState<{ apagadas: number; ficheiros: number; numeracaoReiniciada: boolean } | null>(null);
  async function apagar() {
    setA(true);
    try { const r = await api<{ apagadas: number; ficheiros: number; numeracaoReiniciada: boolean }>('/admin/purge-poas', { body: f }); setFeito(r); setF({ motivo: '', confirmacao: '', reiniciarNumeracao: true }); qc.invalidateQueries(); toast(`${r.apagadas} procurações apagadas.`); }
    catch (e) { toast(mensagemErro(e), true); } finally { setA(false); }
  }
  return (
    <Casca migalhas={['Administração', 'Manutenção']}>
      <main className="conteudo" style={{ maxWidth: 760 }}>
        <div><h1>Manutenção</h1><span className="muted">Operações irreversíveis, reservadas a administradores. Ficam registadas na auditoria, que nunca é apagada.</span></div>
        <section className="cartao"><div className="corpo">
          <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icone n="escudo" t={18} />Verificar e reparar documentos</h2>
          <p style={{ margin: 0 }}>Confirma que o PDF de cada procuração emitida está guardado. Os que se perderam (por exemplo, quando o servidor guardava ficheiros em disco temporário) são gerados de novo a partir do registo congelado na emissão: o texto é exactamente o mesmo. Cada reparação fica na auditoria.</p>
          {rep && <div className={`aviso ${rep.erros.length ? 'atencao' : 'ok'}`} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <span>Verificadas {rep.verificadas} procurações; <b>{rep.regeneradas}</b> PDF regenerados.</span>
            {rep.digitalizacoesEmFalta.length > 0 && <span className="small">Digitalizações assinadas em falta (voltar a carregar no passo Arquivo): {rep.digitalizacoesEmFalta.join(', ')}</span>}
            {rep.erros.length > 0 && <span className="small">Erros: {rep.erros.join('; ')}</span>}
          </div>}
          <button className="btn primario" style={{ alignSelf: 'flex-start' }} disabled={aReparar} onClick={reparar}>{aReparar ? 'A verificar…' : 'Verificar e reparar agora'}</button>
        </div></section>
        <section className="cartao" style={{ borderColor: 'var(--carmim)' }}><div className="corpo">
          <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icone n="lixo" t={18} cor="var(--carmim)" />Apagar todas as procurações</h2>
          <p style={{ margin: 0 }}>Apaga <b>{total.data?.total ?? '…'}</b> procurações (rascunhos, emitidas, canceladas e arquivadas) e todos os seus documentos: PDF, DOCX e digitalizações assinadas. Pessoas, poderes, modelos e utilizadores <b>não</b> são apagados.</p>
          <p className="small muted" style={{ margin: 0 }}>Para apagar só uma, abra-a e use o botão «Apagar».</p>
          {feito && <div className="aviso ok">Apagadas {feito.apagadas} procurações e {feito.ficheiros} ficheiros.{feito.numeracaoReiniciada ? ' A numeração recomeça em 000001.' : ''}</div>}
          <Campo rotulo="Motivo" obrigatorio><input className="entrada" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ex.: limpeza dos documentos de teste antes da produção" /></Campo>
          <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={f.reiniciarNumeracao} onChange={(e) => setF({ ...f, reiniciarNumeracao: e.target.checked })} />Reiniciar a numeração (a próxima procuração volta a ser a n.º 1 do ano)</label>
          <Campo rotulo="Para confirmar, escreva APAGAR TUDO" obrigatorio><input className="entrada mono" value={f.confirmacao} onChange={(e) => setF({ ...f, confirmacao: e.target.value })} /></Campo>
          <button className="btn perigo" style={{ alignSelf: 'flex-start' }} disabled={a || f.confirmacao !== 'APAGAR TUDO' || f.motivo.trim().length < 5} onClick={apagar}>{a ? 'A apagar…' : 'Apagar todas as procurações'}</button>
        </div></section>
      </main>
    </Casca>
  );
}
