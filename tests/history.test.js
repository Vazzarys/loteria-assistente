import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateHistory, coverage, checkCombination, updateHistory } from '../history.js';
const read = game => JSON.parse(readFileSync(new URL(`../data/history/${game}.json`, import.meta.url), 'utf8'));
const fixture = (game, suffix = '') => JSON.parse(readFileSync(new URL(`./fixtures/${game}${suffix}.json`, import.meta.url), 'utf8'));
const response = raw => ({ ok: true, json: async () => structuredClone(raw) });

test('downloads oficiais cobrem todos os 20.098 concursos, sem lacunas nem repetição de IDs', () => {
  const expected = { megasena:3083, lotofacil:3825, quina:7163, lotomania:2997, duplasena:3030 };
  let total = 0;
  for (const [game, count] of Object.entries(expected)) {
    const data = validateHistory(read(game), game), c = coverage(data.records);
    assert.equal(c.complete, true); assert.equal(c.first, 1); assert.equal(c.last, count); assert.equal(c.count, count);
    assert.match(data.source.url, /^https:\/\/servicebus3\.caixa\.gov\.br\//);
    assert.equal(data.source.sha256.length, 64);
    const latest = fixture(game), last = data.records.at(-1);
    assert.equal(last.contest, latest.numero);
    assert.deepEqual(last.draws[0], latest.listaDezenas.map(Number).sort((a,b) => a-b));
    if (game === 'duplasena') assert.deepEqual(last.draws[1], latest.listaDezenasSegundoSorteio.map(Number).sort((a,b) => a-b));
    total += count;
  }
  assert.equal(total,20098);
});
test('reconhece conjunto idêntico sem depender da ordem e preserva todos os acertos parciais', () => {
  const data = read('megasena');
  const numbers = [...data.records[0].draws[0]].reverse();
  const result = checkCombination(data,'megasena',numbers);
  assert.equal(result.canBeIdentical,true);
  assert.ok(result.fullMatches >= 1);
  assert.equal(result.rows.find(r=>r.contest===1).hits,6);
  assert.equal(result.histogram.reduce((a,b)=>a+b,0),data.records.length);
  const independent = Array(7).fill(0);
  for(const r of data.records) independent[r.draws[0].filter(n=>numbers.includes(n)).length]++;
  assert.deepEqual(result.histogram, independent);
});
test('jogo ampliado é contenção de dezenas, não igualdade entre conjuntos', () => {
  const data = read('megasena'), numbers = [...data.records[0].draws[0], 1];
  const result = checkCombination(data,'megasena',numbers);
  assert.equal(result.canBeIdentical,false);
  assert.equal(result.rows.find(r=>r.contest===1).hits,6);
});
test('Dupla Sena conta dois sorteios separadamente e não mistura as dezenas', () => {
  const data = read('duplasena'), numbers = data.records[0].draws[0];
  const result = checkCombination(data,'duplasena',numbers);
  assert.equal(result.contestCount,3030);assert.equal(result.drawCount,6060);
  const first=result.rows.filter(r=>r.contest===1);
  assert.equal(first.length,2);assert.equal(first.find(r=>r.draw===1).hits,6);
  assert.equal(first.find(r=>r.draw===2).hits,1);
  assert.equal(result.histogram.reduce((a,b)=>a+b,0),6060);
});
test('Lotomania inclui zero coincidências e trata o número 00 corretamente', () => {
  const data = read('lotomania'), record = data.records[0];
  assert.ok(record.draws[0].includes(0));
  const numbers = Array.from({length:100},(_,i)=>i).filter(n=>!record.draws[0].includes(n)).slice(0,50);
  const result=checkCombination(data,'lotomania',numbers);
  assert.equal(result.rows.find(r=>r.contest===1).hits,0);
  assert.ok(result.histogram[0]>=1);assert.equal(result.canBeIdentical,false);
});
test('Virada preserva 17 edições, incluindo as primeiras com marcação antiga da API', () => {
  const data=read('megasena');
  const result=checkCombination(data,'megadavirada',[10,27,40,46,49,58],'special');
  assert.equal(result.contestCount,17);
  assert.equal(result.rows.find(r=>r.contest===1140).hits,6);
  assert.ok(result.rows.some(r=>r.contest===2955 && r.date==='2026-01-01'));
  assert.equal(result.rows.some(r=>r.contest===1035),false);
  assert.equal(checkCombination(data,'megadavirada',[10,27,40,46,49,58],'all').contestCount,3083);
});
test('detecta base parcial e rejeita concurso duplicado ou dezenas repetidas', () => {
  let data=read('megasena');data.records.splice(50,1);
  const result=checkCombination(data,'megasena',[1,2,3,4,5,6]);
  assert.equal(result.coverage.complete,false);assert.equal(result.coverage.missingCount,1);
  data=read('megasena');data.records.push(data.records[0]);assert.throws(()=>validateHistory(data,'megasena'));
  data=read('megasena');data.records[0].draws[0][0]=data.records[0].draws[0][1];assert.throws(()=>validateHistory(data,'megasena'));
});
test('sem acesso ao último concurso, mantém a base e não a declara atualizada', async () => {
  const data=read('megasena');
  const result=await updateHistory(data,'megasena',{fetcher:async()=>{throw Error('Sem rede')}});
  assert.equal(result.records.length,3083);assert.equal(result.currentConfirmed,false);
  assert.equal(result.coverage.complete,true);assert.ok(result.updateError);
});
test('atualização preenche lacuna e falha parcial nunca vira cobertura completa', async () => {
  const data=read('lotofacil');data.records=data.records.filter(r=>r.contest!==3824);
  const fetcher=async url=>response(fixture('lotofacil',url.endsWith('/3824')?'-previous':''));
  const result=await updateHistory(data,'lotofacil',{fetcher});
  assert.equal(result.coverage.complete,true);assert.equal(result.records.length,3825);assert.equal(result.currentConfirmed,true);
  const partial=await updateHistory(data,'lotofacil',{fetcher:async url=>{if(url.endsWith('/3824'))throw Error('Falha');return response(fixture('lotofacil'));}});
  assert.equal(partial.coverage.complete,false);assert.equal(partial.coverage.missingCount,1);assert.ok(partial.updateError);
});
test('cancelamento interrompe a consulta sem produzir resultado definitivo', async () => {
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>updateHistory(read('megasena'),'megasena',{signal:controller.signal}),{name:'AbortError'});
});
