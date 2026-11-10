import { GAMES, localDate, weekBounds } from './core.js';
import { MEGA_VIRADA_ANNOUNCEMENT } from './special-announcements.js';

export const SOURCE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/';
export const RESULT_GAMES = ['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena'];
const TYPES = { megasena: 'MEGA_SENA', lotofacil: 'LOTOFACIL', quina: 'QUINA', lotomania: 'LOTOMANIA', duplasena: 'DUPLA_SENA' };
const HITS = { megasena: [6, 5, 4], lotofacil: [15, 14, 13, 12, 11], quina: [5, 4, 3, 2], lotomania: [20, 19, 18, 17, 16, 15, 0], duplasena: [6, 5, 4, 3, 6, 5, 4, 3] };
const CACHE_KEY = 'loteria-resultados-v1';
export function specialEstimate(entry, now = new Date()) {
  const announcement = MEGA_VIRADA_ANNOUNCEMENT;
  const today = localDate(now);
  if (today < announcement.published || today > announcement.drawDate || entry?.latest?.contest >= announcement.contest) return null;
  const next = entry?.latest?.next;
  if (next?.contest === announcement.contest && next?.date === announcement.drawDate && Number.isFinite(next.estimate) && next.estimate > 0 && !entry.stale) {
    return { ...announcement, estimate: next.estimate, qualifier: '', kind: 'api', source: SOURCE + 'megasena', consultedAt: entry.fetchedAt };
  }
  return { ...announcement, kind: 'announcement' };
}
function positiveInt(value) { return Number.isInteger(value) && value > 0; }
function nonnegative(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
export function parseCaixaDate(value) {
  if (typeof value !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null;
  const [day, month, year] = value.split('/');
  const iso = `${year}-${month}-${day}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
function drawNumbers(value, game) {
  const g = GAMES[game];
  if (!Array.isArray(value) || value.length !== g.drawn || value.some(n => !/^\d{1,2}$/.test(String(n)))) throw new Error('Dezenas oficiais incompletas');
  const numbers = value.map(Number).sort((a, b) => a - b);
  if (new Set(numbers).size !== numbers.length || numbers.some(n => !Number.isInteger(n) || n < g.first || n > g.last)) throw new Error('Dezenas oficiais inválidas');
  return numbers;
}
export function normalizeResult(raw, game) {
  if (!TYPES[game] || raw?.tipoJogo !== TYPES[game] || !positiveInt(raw.numero)) throw new Error('Modalidade ou concurso inválido na fonte');
  const date = parseCaixaDate(raw.dataApuracao);
  if (!date) throw new Error('Data inválida na fonte');
  const draws = [drawNumbers(raw.listaDezenas, game)];
  if (game === 'duplasena') draws.push(drawNumbers(raw.listaDezenasSegundoSorteio, game));
  if (!Array.isArray(raw.listaRateioPremio) || raw.listaRateioPremio.length !== HITS[game].length) throw new Error('Rateio ainda não disponível ou incompleto');
  const tiers = [...raw.listaRateioPremio].sort((a, b) => a.faixa - b.faixa).map((tier, index) => {
    if (tier.faixa !== index + 1 || Number.parseInt(tier.descricaoFaixa, 10) !== HITS[game][index] || !Number.isInteger(tier.numeroDeGanhadores) || tier.numeroDeGanhadores < 0 || nonnegative(tier.valorPremio) === null) throw new Error('Estrutura de rateio inválida');
    return { draw: game === 'duplasena' && index >= 4 ? 2 : 1, hits: HITS[game][index], winners: tier.numeroDeGanhadores, prize: tier.valorPremio };
  });
  return {
    contest: raw.numero, date, draws, tiers,
    previous: positiveInt(raw.numeroConcursoAnterior) && raw.numeroConcursoAnterior < raw.numero ? raw.numeroConcursoAnterior : null,
    accumulated: typeof raw.acumulado === 'boolean' ? raw.acumulado : null,
    next: { contest: positiveInt(raw.numeroConcursoProximo) ? raw.numeroConcursoProximo : null, date: parseCaixaDate(raw.dataProximoConcurso), estimate: nonnegative(raw.valorEstimadoProximoConcurso), carryover: nonnegative(raw.valorAcumuladoProximoConcurso) },
    specialReserve: nonnegative(raw.valorAcumuladoConcursoEspecial),
    special: raw.indicadorConcursoEspecial === 2,
    source: SOURCE + game + '/' + raw.numero,
    cities: Array.isArray(raw.listaMunicipioUFGanhadores) ? raw.listaMunicipioUFGanhadores.filter(c => typeof c.municipio === 'string' && c.municipio.trim() && typeof c.uf === 'string' && c.uf.length === 2 && positiveInt(c.ganhadores)).map(c => ({ city: c.municipio, state: c.uf, winners: c.ganhadores, draw: c.posicao === 2 ? 2 : 1 })) : [],
  };
}
export function weeklyRecords(entry, now = new Date()) {
  const { start, end } = weekBounds(now);
  return (entry?.records || []).filter(r => r.date >= start && r.date <= end && r.date <= localDate(now)).sort((a, b) => b.contest - a.contest);
}
export function latestWeeklyWinner(entry, now = new Date()) {
  return weeklyRecords(entry, now).flatMap(r => r.tiers.filter(t => t.hits === r.draws[0].length && t.winners > 0).map(t => ({ ...t, contest: r.contest, date: r.date }))).sort((a, b) => b.contest - a.contest || a.draw - b.draw)[0] || null;
}
export function timestampLabel(value) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'não consultado';
}
export async function fetchOfficial(game, contest, fetcher = fetch) {
  const response = await fetcher(SOURCE + game + (contest ? '/' + contest : ''), { cache: 'no-store', signal: AbortSignal.timeout(18000) });
  if (!response.ok) throw new Error('Fonte Caixa indisponível (HTTP ' + response.status + ')');
  const raw = await response.json();
  if (!contest && raw.ultimoConcurso !== true) throw new Error('A fonte não confirmou o último concurso');
  const record = normalizeResult(raw, game);
  if (contest && record.contest !== contest) throw new Error('A Caixa retornou outro concurso');
  return record;
}
export async function loadGameWeek(game, previous = null, now = new Date(), fetcher = fetch) {
  const { start, end } = weekBounds(now);
  const fetchedAt = new Date().toISOString();
  const latest = await fetchOfficial(game, null, fetcher);
  if (latest.date > localDate(now)) throw new Error('Fonte com data de sorteio futura');
  const records = [];
  let cursor = latest, complete = false, error = null;
  for (let i = 0; i < 16; i++) {
    if (cursor.date < start) { complete = true; break; }
    if (cursor.date <= end) records.push(cursor);
    if (!cursor.previous) {
      complete = cursor.contest === 1;
      if (!complete) error = 'A fonte não informou o concurso anterior';
      break;
    }
    try {
      const cached = weeklyRecords(previous, now).find(r => r.contest === cursor.previous);
      const older = cached || await fetchOfficial(game, cursor.previous, fetcher);
      if (older.contest >= cursor.contest || older.date > cursor.date) throw new Error('Histórico fora de ordem na fonte');
      cursor = older;
    } catch (e) { error = e.message; break; }
  }
  return { game, fetchedAt, week: start, latest, records, complete, error, stale: false };
}
function validStoredEntry(entry, game) {
  // Cópias locais são dados públicos; valide a forma antes de usá-las no painel.
  const validRecord = r => {
    if (!r || !positiveInt(r.contest) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Array.isArray(r.draws) || !Array.isArray(r.tiers)) return false;
    try {
      r.draws.forEach(nums => drawNumbers(nums, game));
      return r.draws.length === (game === 'duplasena' ? 2 : 1) && r.tiers.length === HITS[game].length
        && r.tiers.every(t => Number.isInteger(t.winners) && t.winners >= 0 && nonnegative(t.prize) !== null && Number.isInteger(t.hits) && [1,2].includes(t.draw));
    } catch { return false; }
  };
  return entry?.game === game && Number.isFinite(Date.parse(entry.fetchedAt)) && validRecord(entry.latest) && Array.isArray(entry.records) && entry.records.every(validRecord);
}
export function readCache(storage, now = new Date()) {
  try {
    storage ||= globalThis.localStorage;
    const cached = JSON.parse(storage.getItem(CACHE_KEY) || '{}');
    return Object.fromEntries(RESULT_GAMES.filter(game => validStoredEntry(cached[game], game)).map(game => [game, { ...cached[game], records: weeklyRecords(cached[game], now), complete: cached[game].week === weekBounds(now).start && cached[game].complete === true, stale: true }]));
  } catch { return {}; }
}
export function saveCache(entries, storage, now = new Date()) {
  try { storage ||= globalThis.localStorage; storage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(Object.entries(entries).map(([game, entry]) => [game, { ...entry, records: weeklyRecords(entry, now) }])))); } catch { /* Falha no cache não bloqueia a consulta. */ }
}
