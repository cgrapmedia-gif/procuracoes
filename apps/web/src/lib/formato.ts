export const dataPT = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('pt-PT') : '—');
export const dataHoraPT = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const hojeISO = () => new Date().toISOString().slice(0, 10);
export const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const uid = () => Math.random().toString(36).slice(2, 10);
