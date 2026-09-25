const P: Record<string, string> = {
  painel: 'M3 11l9-7 9 7M5 10v10h14V10',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  mais: 'M12 5v14M5 12h14',
  pessoas: 'M9 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3.5 3.5 0 010 7M18 14c2 .8 3 3 3 6',
  camadas: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  modelo: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  escudo: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  utilizadores: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  pesquisa: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5',
  cima: 'M12 19V5M6 11l6-6 6 6', baixo: 'M12 5v14M6 13l6 6 6-6', x: 'M6 6l12 12M18 6L6 18',
  pega: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  estrela: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  certo: 'M5 12l4.5 4.5L19 7', alerta: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  ligacao: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  proibido: 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM6 6l12 12', ideia: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z',
  carregar: 'M12 16V4M7 9l5-5 5 5M4 20h16', descarregar: 'M12 4v12M7 11l5 5 5-5M4 20h16', olho: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  copiar: 'M8 8h12v12H8zM16 8V4H4v12h4', relogio: 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 7v5l3 2', seta: 'M9 6l6 6-6 6', voltar: 'M15 6l-6 6 6 6',
  sair: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3', historico: 'M3 12a9 9 0 103-6.7M3 4v5h5M12 8v4l3 2', lapis: 'M4 20h4L20 8l-4-4L4 16zM13 7l4 4',
  lixo: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
};
export function Icone({ n, t = 18, cor = 'currentColor', traco = 1.7 }: { n: keyof typeof P | string; t?: number; cor?: string; traco?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[n] ?? ''} />
    </svg>
  );
}
export function Selo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="#B58B34" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#B58B34" strokeWidth="1" />
      <path d="M11 20l5-10 5 10M12.8 16.5h6.4" fill="none" stroke="#E9DDBF" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
