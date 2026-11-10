export const GAMES = {
  megasena: { name: 'Mega-Sena', short: 'Mega', min: 6, max: 20, first: 1, last: 60, drawn: 6, color: '#07864d', soft: '#e6f3eb' },
  megadavirada: { name: 'Mega da Virada', short: 'Virada', min: 6, max: 20, first: 1, last: 60, drawn: 6, color: '#087345', soft: '#e8f2df' },
  lotofacil: { name: 'Lotofácil', short: 'Lotofácil', min: 15, max: 20, first: 1, last: 25, drawn: 15, color: '#8d258d', soft: '#f4e8f4' },
  quina: { name: 'Quina', short: 'Quina', min: 5, max: 15, first: 1, last: 80, drawn: 5, color: '#35339c', soft: '#ecebfa' },
  lotomania: { name: 'Lotomania', short: 'Lotomania', min: 50, max: 50, first: 0, last: 99, drawn: 20, color: '#b75600', soft: '#fff0df' },
  duplasena: { name: 'Dupla Sena', short: 'Dupla', min: 6, max: 15, first: 1, last: 50, drawn: 6, color: '#a42e49', soft: '#f9e8ed' },
};
export function validateNumbers(game, numbers) {
  const g = GAMES[game];
  return !!g && Array.isArray(numbers) && numbers.length >= g.min && numbers.length <= g.max
    && new Set(numbers).size === numbers.length
    && numbers.every(n => Number.isInteger(n) && n >= g.first && n <= g.last);
}
export function choose(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) return 0n;
  let value = 1n;
  for (let i = 1; i <= Math.min(k, n - k); i++) value = value * BigInt(n - i + 1) / BigInt(i);
  return value;
}
export function jackpotOdds(game, count) {
  const g = GAMES[game];
  if (!g || !Number.isInteger(count) || count < g.min || count > g.max) return null;
  return Number(choose(g.last - g.first + 1, g.drawn)) / Number(choose(count, g.drawn));
}
export function randomInt(max) {
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error('Intervalo inválido');
  const limit = Math.floor(4294967296 / max) * max;
  const array = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(array); } while (array[0] >= limit);
  return array[0] % max;
}
export function generateNumbers(game, count) {
  const g = GAMES[game];
  if (!g || !Number.isInteger(count) || count < g.min || count > g.max) throw new Error('Quantidade inválida');
  const pool = Array.from({ length: g.last - g.first + 1 }, (_, i) => i + g.first);
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function weekBounds(date = new Date()) {
  const today = new Date(localDate(date) + 'T12:00:00Z');
  const offset = (today.getUTCDay() + 6) % 7;
  today.setUTCDate(today.getUTCDate() - offset);
  const start = today.toISOString().slice(0, 10);
  today.setUTCDate(today.getUTCDate() + 6);
  return { start, end: today.toISOString().slice(0, 10) };
}
export function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0); }
export function dateLabel(date) { return date ? date.split('-').reverse().join('/') : '—'; }
export function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export function financialSummary(bets, month) {
  const rows = bets.filter(b => b.bet_date.startsWith(month));
  return { cost: rows.reduce((s, b) => s + Number(b.cost), 0), prizes: rows.reduce((s, b) => s + Number(b.prize_received || 0), 0), count: rows.length };
}
