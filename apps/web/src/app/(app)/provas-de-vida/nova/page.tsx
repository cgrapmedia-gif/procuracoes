'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Casca } from '@/components/Casca';
import { FormProvaVida, VAZIO_PV, ValoresProvaVida, paraApi } from '@/components/provas/FormProvaVida';
import { mensagemErro } from '@/components/ui';

export default function NovaProvaVida() {
  const router = useRouter();
  const [v, setV] = useState<ValoresProvaVida>(VAZIO_PV()); const [erro, setErro] = useState(''); const [a, setA] = useState(false);
  async function criar() {
    setA(true); setErro('');
    try { const r = await api<{ id: string }>('/declaracoes', { body: paraApi(v) }); router.push(`/provas-de-vida/${r.id}`); }
    catch (e) { setErro(mensagemErro(e)); setA(false); }
  }
  return (
    <Casca migalhas={['Provas de vida', 'Nova']}>
      <main className="conteudo" style={{ maxWidth: 860 }}>
        <div><h1>Nova prova de vida</h1><span className="muted">Preencha e continue: a seguir vê o documento e emite.</span></div>
        {erro && <div className="aviso erro" role="alert">{erro}</div>}
        <FormProvaVida v={v} mudar={setV} editavel />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primario" disabled={!v.pessoaId || !v.entidade.trim() || a} onClick={criar}>{a ? 'A criar…' : 'Continuar'}</button></div>
      </main>
    </Casca>
  );
}
