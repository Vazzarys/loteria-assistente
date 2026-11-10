import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, validateNumbers, choose, jackpotOdds, generateNumbers, weekBounds, localDate, escapeHTML, financialSummary } from '../core.js';

test('probabilidades combinatórias de referência', () => {
  assert.equal(choose(60, 6), 50063860n);
  assert.equal(jackpotOdds('megasena', 6), 50063860);
  assert.equal(jackpotOdds('megadavirada', 6), 50063860);
  assert.equal(jackpotOdds('megasena', 7), 50063860 / 7);
  assert.equal(jackpotOdds('lotofacil', 15), 3268760);
  assert.equal(jackpotOdds('quina', 5), 24040016);
  assert.equal(jackpotOdds('duplasena', 6), 15890700);
  assert.ok(Math.abs(jackpotOdds('lotomania', 50) - 11372635.885) < 0.01);
  assert.equal(jackpotOdds('quina', 4), null);
});
test('validação rejeita repetidos, strings e limites incorretos', () => {
  assert.equal(validateNumbers('megasena', [1,2,3,4,5,6]), true);
  for (const numbers of [[1,1,2,3,4,5], [0,1,2,3,4,5], [1,2,3,4,5,61], [1,2,3,4,5,'6'], [1,2,3]]) assert.equal(validateNumbers('megasena', numbers), false);
  assert.equal(validateNumbers('desconhecido', [1,2,3,4,5,6]), false);
  assert.equal(validateNumbers('lotomania', Array.from({ length: 50 }, (_, i) => i)), true);
});
test('gerador respeita quantidade, unicidade e intervalo em todas as modalidades', () => {
  for (const [game, config] of Object.entries(GAMES)) {
    for (const size of [config.min, config.max]) {
      for (let i = 0; i < 40; i++) {
        const numbers = generateNumbers(game, size);
        assert.equal(numbers.length, size);
        assert.equal(validateNumbers(game, numbers), true);
        assert.deepEqual(numbers, [...numbers].sort((a,b) => a-b));
      }
    }
  }
  assert.throws(() => generateNumbers('megasena', 5));
});
test('semana usa São Paulo, inclusive domingo e virada do ano', () => {
  assert.deepEqual(weekBounds(new Date('2026-11-10T19:00:00Z')), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(weekBounds(new Date('2026-11-16T01:00:00Z')), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(weekBounds(new Date('2027-01-01T12:00:00Z')), { start: '2026-12-28', end: '2027-01-03' });
  assert.equal(localDate(new Date('2026-11-10T01:00:00Z')), '2026-11-09');
});
test('resumo mensal ignora outros meses e diferencia prêmio não informado', () => {
  assert.deepEqual(financialSummary([{bet_date:'2026-11-01',cost:'6',prize_received:null},{bet_date:'2026-11-02',cost:'3.5',prize_received:'10'},{bet_date:'2026-10-31',cost:'50',prize_received:1000}], '2026-11'), { cost:9.5, prizes:10, count:2 });
});
test('texto do usuário é escapado antes de entrar no HTML', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
