import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeResult, weeklyRecords, latestWeeklyWinner, parseCaixaDate, loadGameWeek, RESULT_GAMES, readCache, saveCache, fetchOfficial, specialEstimate } from '../results.js';
const fixture = (game, suffix = '') => JSON.parse(readFileSync(new URL(`./fixtures/${game}${suffix}.json`, import.meta.url), 'utf8'));
const now = new Date('2026-11-10T19:00:00Z');
const normalized = game => normalizeResult(fixture(game), game);
function response(raw) { return { ok: true, json: async () => structuredClone(raw) }; }

test('lê cinco respostas reais da Caixa e mantém o rateio de cada modalidade', () => {
  for (const game of RESULT_GAMES) {
    const raw = fixture(game), item = normalizeResult(raw, game);
    assert.equal(item.contest, raw.numero);
    assert.equal(item.tiers[0].prize, raw.listaRateioPremio[0].valorPremio);
    assert.equal(item.next.estimate, raw.valorEstimadoProximoConcurso);
    assert.equal(item.next.carryover, raw.valorAcumuladoProximoConcurso);
    assert.notEqual(item.next.estimate, null);
  }
});
test('Dupla Sena separa dezenas e rateios dos dois sorteios', () => {
  const d = normalized('duplasena');
  assert.equal(d.draws.length, 2);
  assert.deepEqual(d.draws[1], [15,16,17,21,29,30]);
  assert.equal(d.tiers.filter(t => t.draw === 1).length, 4);
  assert.equal(d.tiers.filter(t => t.draw === 2).length, 4);
  assert.equal(d.tiers.find(t => t.draw === 2 && t.hits === 5).prize, 4381.84);
});
test('rejeita dezenas repetidas, rateio incompleto, modalidade errada e data impossível', () => {
  let raw = fixture('megasena'); raw.listaDezenas[0] = raw.listaDezenas[1];
  assert.throws(() => normalizeResult(raw, 'megasena'));
  raw = fixture('duplasena'); raw.listaDezenasSegundoSorteio = null;
  assert.throws(() => normalizeResult(raw, 'duplasena'));
  raw = fixture('quina'); raw.listaRateioPremio.pop();
  assert.throws(() => normalizeResult(raw, 'quina'));
  assert.throws(() => normalizeResult(fixture('quina'), 'megasena'));
  assert.equal(parseCaixaDate('31/02/2026'), null);
  assert.equal(parseCaixaDate('29/02/2028'), '2028-02-29');
});
test('nunca exibe ganhador da semana anterior como último prêmio semanal', () => {
  const mega = normalized('megasena');
  assert.equal(mega.tiers[0].winners, 1);
  assert.deepEqual(weeklyRecords({ records: [mega] }, now), []);
  assert.equal(latestWeeklyWinner({ records: [mega] }, now), null);
  const easy = normalized('lotofacil');
  const winner = latestWeeklyWinner({ records: [easy] }, now);
  assert.equal(winner.contest, 3825);
  assert.equal(winner.prize, 1622768.4);
  assert.equal(latestWeeklyWinner({ records: [easy] }, new Date('2026-11-16T12:00:00Z')), null);
});
test('obtém a semana completa e para antes dos rateios da semana anterior', async () => {
  for (const game of RESULT_GAMES) {
    const calls = [];
    const fetcher = async url => { calls.push(url); return response(fixture(game, url.endsWith('/' + game) ? '' : '-previous')); };
    const result = await loadGameWeek(game, null, now, fetcher);
    assert.equal(result.complete, true);
    assert.equal(result.stale, false);
    assert.ok(result.records.every(r => r.date >= '2026-11-09' && r.date <= '2026-11-15'));
    assert.equal(calls.length, game === 'megasena' ? 1 : 2);
  }
});
test('falha durante busca dos anteriores é parcial, e falha no último não é resultado vazio', async () => {
  const fetcher = async url => { if (url.endsWith('/lotofacil')) return response(fixture('lotofacil')); throw new Error('Sem rede'); };
  const result = await loadGameWeek('lotofacil', null, now, fetcher);
  assert.equal(result.complete, false);
  assert.equal(result.records.length, 1);
  assert.equal(result.error, 'Sem rede');
  await assert.rejects(() => loadGameWeek('lotofacil', null, now, async () => { throw new Error('Sem rede'); }));
});
test('recusa concurso diferente do solicitado e não inventa estimativa ausente', async () => {
  await assert.rejects(() => fetchOfficial('megasena', 100, async () => response(fixture('megasena'))));
  const raw = fixture('megasena'); delete raw.valorEstimadoProximoConcurso;
  assert.equal(normalizeResult(raw, 'megasena').next.estimate, null);
});
test('não declara a semana completa se a fonte omitir o concurso anterior', async () => {
  const raw = fixture('lotofacil'); delete raw.numeroConcursoAnterior;
  const result = await loadGameWeek('lotofacil', null, now, async () => response(raw));
  assert.equal(result.complete, false);
  assert.match(result.error, /anterior/);
});
test('Mega da Virada usa identificação especial; reserva não é estimativa', () => {
  const raw = fixture('megasena');
  assert.equal(normalizeResult(raw, 'megasena').special, false);
  raw.indicadorConcursoEspecial = 2;
  assert.equal(normalizeResult(raw, 'megasena').special, true);
  assert.notEqual(raw.valorAcumuladoConcursoEspecial, raw.valorEstimadoProximoConcurso);
});
test('estimativa da Virada usa anúncio oficial separado da reserva e expira na edição correta', () => {
  const entry = { latest: normalized('megasena'), stale: false };
  const estimate = specialEstimate(entry, now);
  assert.equal(estimate.contest, 3100);
  assert.equal(estimate.estimate, 1000000000);
  assert.equal(estimate.qualifier, 'Mais de');
  assert.equal(estimate.published, '2026-11-03');
  assert.notEqual(estimate.estimate, entry.latest.specialReserve);
  assert.equal(specialEstimate(entry, new Date('2027-01-02T12:00:00Z')), null);
  assert.equal(specialEstimate({ latest: { ...entry.latest, contest: 3100 } }, now), null);
  assert.equal(specialEstimate(entry, new Date('2026-11-02T12:00:00Z')), null);
});
test('a API substitui o anúncio apenas quando a estimativa se refere ao concurso especial identificado', () => {
  const entry = { latest: normalized('megasena'), stale: false, fetchedAt: now.toISOString() };
  entry.latest.next = { contest: 3100, date: '2027-01-01', estimate: 1100000000 };
  assert.equal(specialEstimate(entry, now).estimate, 1100000000);
  assert.equal(specialEstimate(entry, now).kind, 'api');
  entry.stale = true;
  assert.equal(specialEstimate(entry, now).kind, 'announcement');
});
test('cache é marcado como anterior e remove premiações ao mudar de semana', async () => {
  let content = '{}'; const storage = { getItem: () => content, setItem: (_key, value) => { content = value; } };
  const entry = { game: 'lotofacil', fetchedAt: now.toISOString(), week: '2026-11-09', latest: normalized('lotofacil'), records: [normalized('lotofacil')], complete: true };
  saveCache({ lotofacil: entry }, storage, now);
  assert.equal(readCache(storage, now).lotofacil.stale, true);
  const nextWeek = new Date('2026-11-16T12:00:00Z');
  assert.equal(readCache(storage, nextWeek).lotofacil.records.length, 0);
  assert.equal(readCache(storage, nextWeek).lotofacil.complete, false);
  saveCache({ lotofacil: entry }, storage, nextWeek);
  assert.equal(JSON.parse(content).lotofacil.records.length, 0);
  content = '{inválido'; assert.deepEqual(readCache(storage, now), {});
});
