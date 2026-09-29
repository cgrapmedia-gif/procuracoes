'use client';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Casca } from '@/components/Casca';
import { Campo, mensagemErro } from '@/components/ui';

export default function Conta() {
  const { utilizador, sair } = useAuth();
  const [f, setF] = useState({ actual: '', nova: '', repetir: '' }); const [erro, setErro] = useState(''); const [ok, setOk] = useState(false); const [a, setA] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro('');
    if (f.nova !== f.repetir) { setErro('As duas palavras-passe novas não coincidem.'); return; }
    setA(true);
    try { await api('/auth/password', { method: 'PUT', body: { actual: f.actual, nova: f.nova } }); setOk(true); setTimeout(() => sair(), 2500); }
    catch (x) { setErro(mensagemErro(x)); } finally { setA(false); }
  }
  return (
    <Casca migalhas={['A minha conta']}>
      <main className="conteudo" style={{ maxWidth: 560 }}>
        <div><h1>A minha conta</h1><span className="muted">{utilizador?.nome}, {utilizador?.email}</span></div>
        {utilizador?.trocarPassword && <div className="aviso atencao" role="status">A sua palavra-passe é temporária (foi criada ou redefinida por um administrador). Defina uma palavra-passe pessoal para continuar.</div>}
        <form className="cartao" onSubmit={enviar}><div className="corpo">
          <h2>Alterar palavra-passe</h2>
          {ok ? <div className="aviso ok">Palavra-passe alterada. Por segurança, vai entrar novamente.</div> : <>
            {erro && <div className="aviso erro" role="alert">{erro}</div>}
            <Campo rotulo="Palavra-passe actual" obrigatorio><input className="entrada" type="password" autoComplete="current-password" required value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} /></Campo>
            <Campo rotulo="Nova palavra-passe" obrigatorio ajuda="Mínimo 12 caracteres, com maiúscula, minúscula e dígito."><input className="entrada" type="password" autoComplete="new-password" required value={f.nova} onChange={(e) => setF({ ...f, nova: e.target.value })} /></Campo>
            <Campo rotulo="Repetir nova palavra-passe" obrigatorio><input className="entrada" type="password" autoComplete="new-password" required value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} /></Campo>
            <button className="btn primario" disabled={a}>{a ? 'A alterar…' : 'Alterar palavra-passe'}</button>
          </>}
        </div></form>
      </main>
    </Casca>
  );
}
