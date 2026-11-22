import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAMES, choose, validateNumbers } from '../core.js';
import { SIMPLE_PRICES,planBudget,nearWinningMasks,numberMask,exactContainedUnion,exactOneMissUnion,portfolioCoverage,generatePortfolio,historicalAudit,countBits,twoMissOverlap } from '../suggestions.js';

function combinations(items,k) { const output=[];function visit(start,row){if(row.length===k){output.push(row);return;}for(let i=start;i<=items.length-(k-row.length);i++)visit(i+1,[...row,items[i]]);}visit(0,[]);return output; }
test('orçamento usa centavos, respeita limite mensal e não excede o lote máximo',()=>{
 assert.deepEqual(planBudget('lotofacil',1000,350),{count:2,budgetCents:1000,priceCents:350,effectiveCents:1000,costCents:700,unusedCents:300,limited:false});
 assert.equal(planBudget('megasena',3000,600,1800).count,3);
 assert.equal(planBudget('lotomania',99999,300).count,8);
 assert.equal(planBudget('megasena',99999,600).count,20);
 for(const args of [['megasena',500,600],['megasena',3000,0],['megasena',3000,600,0],['megasena',1.5,600]])assert.throws(()=>planBudget(...args));
});
test('vizinhança corresponde exatamente a todos os sorteios com k ou k-1 coincidências',()=>{
 const ticket=[0,1,2],outcomes=nearWinningMasks(ticket,0,6);
 const brute=combinations([0,1,2,3,4,5,6],3).filter(d=>d.filter(n=>ticket.includes(n)).length>=2).map(numberMask);
 assert.equal(outcomes.length,13);assert.deepEqual(new Set(outcomes),new Set(brute));
});
test('união das vizinhanças não soma probabilidades sobrepostas indevidamente',()=>{
 const tickets=[[0,1,2],[0,1,3]],actual=new Set(tickets.flatMap(t=>nearWinningMasks(t,0,6)));
 const brute=combinations([0,1,2,3,4,5,6],3).filter(d=>tickets.some(t=>d.filter(n=>t.includes(n)).length>=2)).map(numberMask);
 assert.deepEqual(actual,new Set(brute));assert.ok(actual.size<26);
});
test('inclusão-exclusão de subconjuntos contidos coincide com enumeração exaustiva',()=>{
 const tickets=[[0,1,2,3],[2,3,4,5],[0,4,6,7]],drawn=3;
 const brute=combinations([0,1,2,3,4,5,6,7],drawn).filter(d=>tickets.some(t=>d.every(n=>t.includes(n))));
 assert.equal(exactContainedUnion(tickets.map(numberMask),drawn),BigInt(brute.length));
 assert.equal(exactContainedUnion([numberMask(tickets[0]),numberMask(tickets[0])],drawn),4n);
 assert.throws(()=>countBits(-1n));
});
test('probabilidades de um jogo simples e faixa imediatamente abaixo usam contagem exata',()=>{
 const expected={megasena:[50063860n,325n],megadavirada:[50063860n,325n],lotofacil:[3268760n,151n],quina:[24040016n,376n],duplasena:[15890700n,265n]};
 for(const [game,[total,near]] of Object.entries(expected)){
  const g=GAMES[game],ticket=Array.from({length:g.min},(_,i)=>g.first+i),result=portfolioCoverage(game,[ticket]);
  assert.equal(result.main,1n);assert.equal(result.total,total);assert.equal(result.near,near);
 }
 const a=Array.from({length:50},(_,i)=>i),b=Array.from({length:50},(_,i)=>i+50);
 assert.equal(portfolioCoverage('lotomania',[a,b]).main,2n*choose(50,20));
 assert.throws(()=>portfolioCoverage('megasena',[[1,2,3,4,5,6],[6,5,4,3,2,1]]));
});
test('gerador produz lotes válidos sem repetição e verifica novamente a cobertura final',async()=>{
 for(const game of Object.keys(GAMES)){
  const result=await generatePortfolio(game,3,{candidateCount:8});
  assert.equal(result.tickets.length,3);assert.equal(new Set(result.tickets.map(t=>t.join(','))).size,3);
  for(const t of result.tickets){assert.equal(validateNumbers(game,t),true);assert.equal(t.length,GAMES[game].min);}
  assert.deepEqual(result.coverage,portfolioCoverage(game,result.tickets));
  if(game!=='lotomania')assert.equal(result.coverage.main,3n);
 }
});
test('não repete combinação já contida em aposta ampliada e não entra em loop com fonte travada',async()=>{
 const expanded=[1,2,3,4,5,6,7];let call=0;
 const result=await generatePortfolio('megasena',1,{exclusions:[expanded],candidateCount:1,nextTicket:()=>++call===1?[1,2,3,4,5,6]:[8,9,10,11,12,13]});
 assert.deepEqual(result.tickets[0],[8,9,10,11,12,13]);
 await assert.rejects(()=>generatePortfolio('megasena',2,{candidateCount:1,nextTicket:()=>[1,2,3,4,5,6]}));
});
test('um par de Lotomania inclui a opção espelho e atinge o teto de cobertura principal',async()=>{
 const result=await generatePortfolio('lotomania',2,{candidateCount:8});
 assert.equal(result.coverage.main,result.coverage.mainUpperBound);
 assert.equal(result.coverage.near,result.coverage.nearUpperBound);
 assert.equal(result.tickets[0].filter(n=>result.tickets[1].includes(n)).length,0);
});
test('cobertura com até uma falta bate com todos os sorteios enumerados, inclusive interseções múltiplas', () => {
 const universe = Array.from({length:8}, (_,i) => i);
 const tickets = combinations(universe,4);
 for (let variant = 0; variant < 12; variant++) {
  const batch = Array.from({length:8}, (_,i) => tickets[(variant * 13 + i * 7) % tickets.length]);
  const masks = batch.map(numberMask);
  for (let drawn = 1; drawn <= 6; drawn++) {
   const draws = combinations(universe,drawn);
   const count = draws.filter(draw=>batch.some(ticket=>draw.filter(n=>!ticket.includes(n)).length<=1)).length;
   assert.equal(exactOneMissUnion(masks,universe.length,drawn),BigInt(count));
  }
 }
});
test('Lotomania: união dos 19 ou mais acertos soma eventos e desconta a interseção', () => {
 const first = Array.from({length:50}, (_,i) => i);
 const second = Array.from({length:50}, (_,i) => i<18 ? i : i+32);
 const perTicket = choose(50,20) + 50n * choose(50,19);
 const result = portfolioCoverage('lotomania',[first,second]);
 assert.equal(result.nearHits,19);
 assert.equal(result.main,result.mainUpperBound);
 assert.equal(result.near,2n*perTicket-32n*32n);
 assert.equal(result.nearUpperBound,2n*perTicket);
});
test('Lotomania desempata pela cobertura exata de 19 ou mais com o jogo espelho indisponível', async () => {
 const first = Array.from({length:50}, (_,i) => i);
 const mirror = Array.from({length:50}, (_,i) => i+50);
 const overlapping = Array.from({length:50}, (_,i) => i<18 ? i : i+32);
 const disjointCoverage = Array.from({length:50}, (_,i) => i<17 ? i : i+33);
 const scripted = [first,overlapping,overlapping,disjointCoverage];
 const result = await generatePortfolio('lotomania',2,{
   exclusions:[mirror],candidateCount:2,nextTicket:()=>scripted.shift(),
 });
 assert.deepEqual(result.tickets,[first,disjointCoverage]);
 assert.equal(result.coverage.main,result.coverage.mainUpperBound);
 assert.equal(result.coverage.near,result.coverage.nearUpperBound);
});
test('retrospecto usa os últimos 20% e compara lotes do mesmo tamanho sem selecionar pelo histórico',async()=>{
 const history=JSON.parse(readFileSync(new URL('../data/history/megasena.json',import.meta.url),'utf8'));
 const small={records:history.records.slice(0,10)};
 const audit=await historicalAudit('megasena',[[1,2,3,4,5,6]],small,{baselines:2});
 assert.equal(audit.from,9);assert.equal(audit.to,10);assert.equal(audit.observed.draws,2);assert.equal(audit.baseline.count,2);
 assert.equal(audit.fullDraws,10);assert.equal(audit.frequencies.reduce((sum,n)=>sum+n.count,0),60);
 assert.ok(audit.baseline.min<=audit.baseline.median && audit.baseline.median<=audit.baseline.max);
});
test('cancelamento não retorna lote parcialmente gerado',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>generatePortfolio('megasena',3,{signal:controller.signal}),{name:'AbortError'});
});

test('terceira faixa conta resultados compartilhados uma única vez, inclusive entre três jogos', () => {
 const universe = Array.from({ length: 10 }, (_, i) => i + 1);
 const draws = combinations(universe, 5);
 const candidate = [1, 2, 3, 4, 5];
 const others = [[1, 2, 3, 6, 7], [1, 3, 4, 8, 9], [1, 6, 7, 8, 10]];
 const wins = (draw, ticket) => draw.filter(number => ticket.includes(number)).length >= 3;
 const brute = draws.filter(draw => wins(draw, candidate) && others.some(ticket => wins(draw, ticket)));
 assert.equal(twoMissOverlap(numberMask(candidate), others.map(numberMask), 1, 10, 5), brute.length);
});

test('refinamento da Quina preserva 5 e 4+ acertos e aumenta 3+ quando dois candidatos empatam', async () => {
 const a = [1, 2, 3, 4, 5];
 const b = [6, 7, 8, 9, 10];
 const c = [1, 2, 15, 16, 17];
 const d = [1, 6, 25, 26, 27];
 const scripted = [a, b, b, [1, 11, 12, 13, 14], c, d];
 const baseline = portfolioCoverage('quina', [a, b, c]);
 const refined = await generatePortfolio('quina', 3, { candidateCount: 2, nextTicket: () => scripted.shift() });
 assert.deepEqual(refined.tickets, [a, b, d]);
 assert.equal(refined.coverage.main, baseline.main);
 assert.equal(refined.coverage.near, baseline.near);
 assert.ok(refined.coverage.third > baseline.third);
 assert.equal(refined.coverage.third, refined.coverage.thirdUpperBound - 72n);
});

test('cancelar durante o refinamento impede a publicação do lote', async () => {
 const controller = new AbortController();
 await assert.rejects(() => generatePortfolio('quina', 2, {
   signal: controller.signal,
   onProgress: ({ phase }) => { if (phase === 'refinement') controller.abort(); },
 }), { name: 'AbortError' });
});

test('Dupla Sena cobre pares ordenados em que o lote alcança a faixa em pelo menos um sorteio', () => {
 const ticket = [1, 2, 3, 4, 5, 6];
 const coverage = portfolioCoverage('duplasena', [ticket]);
 const oneDraw = 15890700n;
 assert.equal(coverage.contest.draws, 2);
 assert.equal(coverage.contest.total, oneDraw * oneDraw);
 const expectedPerDraw = { main: 1n, near: 265n, third: 14455n };
 for (const [tier, wins] of Object.entries(expectedPerDraw)) {
   assert.equal(coverage[tier], wins);
   // Um acerto em apenas um dos dois sorteios ou um acerto nos dois.
   assert.equal(coverage.contest[tier], 2n * wins * (oneDraw - wins) + wins * wins);
 }
 assert.equal(portfolioCoverage('megasena', [ticket]).contest, undefined);
});

test('Quina escolhe o jogo que acrescenta mais cobertura às apostas do mesmo concurso', async () => {
 const registered = [1, 2, 3, 4, 5];
 const overlap = [1, 2, 3, 6, 7];
 const disjoint = [8, 9, 10, 11, 12];
 const scripted = [overlap, disjoint];
 const result = await generatePortfolio('quina', 1, {
   exclusions: [registered], candidateCount: 2, nextTicket: () => scripted.shift(),
 });
 const expected = portfolioCoverage('quina', [registered, disjoint]);
 assert.deepEqual(result.tickets, [disjoint]);
 assert.equal(result.incremental.improved, true);
 for (const tier of ['main', 'near', 'third']) {
   assert.equal(result.incremental.after[tier], expected[tier]);
   assert.equal(result.incremental.added[tier], expected[tier] - result.incremental.before[tier]);
 }
 assert.equal(result.incremental.baseline.near, portfolioCoverage('quina', [registered, overlap]).near);
});

test('Quina conta apostas ampliadas, repetidas e contidas sem somar duas vezes', async () => {
 const expanded = Array.from({ length: 15 }, (_, i) => i + 1);
 const newTicket = [16, 17, 18, 19, 20];
 const result = await generatePortfolio('quina', 1, {
   exclusions: [expanded, expanded.slice(0, 5), [...expanded].reverse()], candidateCount: 1,
   nextTicket: () => newTicket,
 });
 const main = choose(15, 5);
 const near = main + choose(15, 4) * 65n;
 const third = near + choose(15, 3) * choose(65, 2);
 assert.deepEqual(result.incremental.before, { main, near, third });
 assert.deepEqual(result.incremental.added, { main: 1n, near: 376n, third: 28126n });
 assert.equal(result.incremental.improved, false);
});
