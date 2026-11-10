import { GAMES, validateNumbers } from './core.js';
import { fetchOfficial } from './results.js';

const databaseName = 'loteria-historico-publico-v1';
const memory = new Map();
export const baseGame = game => game === 'megadavirada' ? 'megasena' : game;
const VIRADA_IDS = new Set([1140,1245,1350,1455,1560,1665,1775,1890,2000,2110,2220,2330,2440,2550,2670,2810,2955,3100]);

export const isViradaContest = record => record?.special === true || VIRADA_IDS.has(record?.contest);

function abortIfNeeded(signal) { if (signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError'); }
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date + 'T12:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10) === date;
}
export function validateHistory(input, game) {
  game = baseGame(game);
  if (!GAMES[game] || input?.schemaVersion !== 1 || input.game !== game || !Number.isFinite(Date.parse(input.importedAt)) || !Array.isArray(input.records) || !input.records.length || input.records.length > 100000) throw new Error('Arquivo de histórico inválido');
  const g = GAMES[game], ids = new Set();
  for (const record of input.records) {
    if (!Number.isInteger(record.contest) || record.contest < 1 || ids.has(record.contest) || !validDate(record.date) || typeof record.special !== 'boolean' || !Array.isArray(record.draws) || record.draws.length !== (game === 'duplasena' ? 2 : 1)) throw new Error('Histórico com concurso inválido ou repetido');
    ids.add(record.contest);
    for (const draw of record.draws) {
      if (!Array.isArray(draw) || draw.length !== g.drawn || new Set(draw).size !== draw.length || draw.some(n => !Number.isInteger(n) || n < g.first || n > g.last)) throw new Error('Histórico com dezenas inválidas');
    }
  }
  return { ...input, records: [...input.records].sort((a,b) => a.contest - b.contest) };
}
export function coverage(records, target) {
  const ids = new Set(records.map(r => r.contest));
  const last = Math.max(0, ...ids);
  const expected = Math.max(last, target || 0);
  let missingCount = 0; const missing = [];
  for (let n = 1; n <= expected; n++) if (!ids.has(n)) { missingCount++; if (missing.length < 30) missing.push(n); }
  return { first: records.length ? Math.min(...ids) : null, last, expected, count: ids.size, complete: expected > 0 && missingCount === 0, missingCount, missing };
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Cache indisponível')); return; }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('history');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Cache ocupado'));
  });
}
async function readStored(game) {
  if (memory.has(game)) return memory.get(game);
  let db;
  try {
    db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const request = db.transaction('history').objectStore('history').get(game);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch { return null; }
  finally { db?.close(); }
}
async function saveStored(game, data) {
  memory.set(game, data);
  let db;
  try {
    db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('history', 'readwrite');
      transaction.objectStore('history').put(data, game);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch { /* Cache é opcional; os dados continuam em memória. */ }
  finally { db?.close(); }
}
function compact(record, game) {
  return { contest: record.contest, date: record.date, draws: record.draws, special: record.special || (game === 'megasena' && VIRADA_IDS.has(record.contest)) };
}
export async function updateHistory(data, game, { signal, onProgress = () => {}, fetcher = fetch } = {}) {
  game = baseGame(game);
  data = validateHistory(data, game);
  abortIfNeeded(signal);
  const records = new Map(data.records.map(r => [r.contest, r]));
  const boundedFetch = (url, options) => fetcher(url, { ...options, signal: signal ? AbortSignal.any([signal, options.signal]) : options.signal });
  let latest;
  try { latest = await fetchOfficial(game, null, boundedFetch); }
  catch (error) {
    abortIfNeeded(signal);
    return { ...data, currentConfirmed: false, updateError: 'Não foi possível confirmar o último concurso na Caixa.', coverage: coverage(data.records, data.lastKnownContest), checkedAt: null };
  }
  if (latest.contest < data.records.at(-1).contest) return { ...data, currentConfirmed: false, updateError: 'A fonte retornou um último concurso anterior ao já importado.', coverage: coverage(data.records), checkedAt: null };
  records.set(latest.contest, compact(latest, game));
  const pending = [];
  for (let n = 1; n < latest.contest; n++) if (!records.has(n)) pending.push(n);
  let cursor = 0, finished = 0, failed = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      abortIfNeeded(signal);
      const contest = pending[cursor++];
      try { records.set(contest, compact(await fetchOfficial(game, contest, boundedFetch), game)); }
      catch { abortIfNeeded(signal); failed++; }
      finished++;
      onProgress({ stage: 'updating', done: finished, total: pending.length, failed });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  abortIfNeeded(signal);
  const ordered = [...records.values()].sort((a,b) => a.contest - b.contest);
  return { ...data, records: ordered, currentConfirmed: true, lastKnownContest: latest.contest,
    updateError: failed ? `${failed} concurso(s) não puderam ser obtidos. A cobertura está parcial.` : null,
    checkedAt: new Date().toISOString(), coverage: coverage(ordered, latest.contest) };
}
export async function loadHistorical(game, options = {}) {
  game = baseGame(game);
  const { signal, onProgress = () => {}, fetcher = fetch } = options;
  abortIfNeeded(signal);
  onProgress({ stage: 'loading' });
  let data = await readStored(game);
  try { if (data) data = validateHistory(data, game); } catch { data = null; }
  if (!data) {
    const response = await fetcher(new URL(`./data/history/${game}.json`, import.meta.url), { signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('Não foi possível carregar o arquivo histórico. Verifique a conexão.');
    data = validateHistory(await response.json(), game);
  }
  onProgress({ stage: 'latest' });
  const result = await updateHistory(data, game, options);
  abortIfNeeded(signal);
  await saveStored(game, result);
  return result;
}
export function checkCombination(data, game, numbers, scope = 'all') {
  if (!validateNumbers(game, numbers)) throw new Error('Selecione uma combinação válida para conferir.');
  if (scope !== 'all' && (scope !== 'special' || baseGame(game) !== 'megasena')) throw new Error('Filtro de concursos inválido.');
  const actualGame = baseGame(game), g = GAMES[game];
  data = validateHistory(data, actualGame);
  const selected = new Set(numbers);
  const records = data.records.filter(r => scope !== 'special' || r.special);
  const histogram = Array(g.drawn + 1).fill(0), rows = [];
  for (const record of records) for (let i = 0; i < record.draws.length; i++) {
    const draw = record.draws[i];
    const common = draw.filter(n => selected.has(n)).sort((a,b) => a-b);
    histogram[common.length]++;
    rows.push({ contest: record.contest, date: record.date, draw: i + 1, numbers: draw, common, hits: common.length });
  }
  rows.sort((a,b) => b.hits - a.hits || b.contest - a.contest || a.draw - b.draw);
  return { game, scope, numbers: [...numbers].sort((a,b) => a-b), rows, histogram,
    contestCount: records.length, drawCount: rows.length, maxHits: rows.length ? Math.max(...histogram.map((count, hits) => count ? hits : 0)) : 0,
    fullMatches: histogram[g.drawn], canBeIdentical: numbers.length === g.drawn,
    coverage: data.coverage || coverage(data.records), currentConfirmed: data.currentConfirmed === true,
    checkedAt: data.checkedAt || null, importedAt: data.importedAt, updateError: data.updateError || null,
    source: data.source, dateAnomalies: data.dateAnomalies || [] };
}
