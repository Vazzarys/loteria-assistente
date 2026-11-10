import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {settleBet,checkRegisteredBets,betSignature} from '../settlements.js';
import {GAMES} from '../core.js';
import {normalizeResult} from '../results.js';
const today='2026-11-10';
const fixture=(game,suffix='')=>JSON.parse(readFileSync(new URL(`./fixtures/${game}${suffix}.json`,import.meta.url),'utf8'));
function sample(game,numbers,draws){
 const hits={megasena:[6,5,4],megadavirada:[6,5,4],lotofacil:[15,14,13,12,11],quina:[5,4,3,2],lotomania:[20,19,18,17,16,15,0],duplasena:[6,5,4,3]}[game];
 return [{id:'a',game,contest:100,bet_date:'2026-11-09',numbers,prize_received:null},{contest:100,date:'2026-11-10',special:game==='megadavirada',draws,tiers:draws.flatMap((_,i)=>hits.map((h,j)=>({draw:i+1,hits:h,winners:10000,prize:(j+1)*10.01})))}];
}
const range=(n,start=1)=>Array.from({length:n},(_,i)=>i+start);
test('Mega simples: acertos e centavos usam o rateio do concurso sem alterar recebido',()=>{
 const result=normalizeResult(fixture('megasena'),'megasena');
 const bet={id:'x',game:'megasena',contest:result.contest,bet_date:result.date,numbers:result.draws[0],prize_received:42};
 const check=settleBet(bet,result,today);
 assert.equal(check.draws[0].hits,6);assert.equal(check.draws[0].awards.length,1);
 assert.equal(check.totalCents,Math.round(result.tiers[0].prize*100));assert.equal(bet.prize_received,42);
});
test('Mega ampliada: tabela oficial de 8 dezenas com 6 acertos gera 1 sena, 12 quinas e 15 quadras',()=>{
 const [b,r]=sample('megasena',range(8),[range(6)]),check=settleBet(b,r,today);
 assert.deepEqual(check.draws[0].awards.map(a=>a.count),[1,12,15]);
 assert.equal(check.totalCents,1001+12*2002+15*3003);
});
test('Lotofácil ampliada: tabela oficial de 17 dezenas com 15 acertos gera 1, 30 e 105 prêmios',()=>{
 const [b,r]=sample('lotofacil',range(17),[range(15)]);
 assert.deepEqual(settleBet(b,r,today).draws[0].awards.map(a=>[a.hits,a.count]),[[15,1],[14,30],[13,105]]);
});
test('Quina ampliada e Dupla Sena: tabelas e dois sorteios independentes',()=>{
 let [b,r]=sample('quina',range(6),[range(5)]);
 assert.deepEqual(settleBet(b,r,today).draws[0].awards.map(a=>a.count),[1,5]);
 [b,r]=sample('duplasena',range(8),[range(6),[1,2,3,4,9,10]]);
 const result=settleBet(b,r,today);
 assert.deepEqual(result.draws.map(d=>d.hits),[6,4]);
 assert.deepEqual(result.draws[1].awards.map(a=>[a.hits,a.count]),[[4,6],[3,16]]);
 assert.equal(result.totalCents,result.draws.flatMap(d=>d.awards).reduce((s,a)=>s+a.totalCents,0));
});
test('Lotomania: 0 acertos recebe uma premiação, sem decompor a aposta em subconjuntos',()=>{
 const [b,r]=sample('lotomania',range(50,0),[range(20,50)]),result=settleBet(b,r,today);
 assert.equal(result.draws[0].hits,0);assert.deepEqual(result.draws[0].awards.map(a=>[a.hits,a.count]),[[0,1]]);
 assert.equal(result.totalCents,7007);
 r.draws=[range(20,0)];assert.equal(settleBet(b,r,today).draws[0].awards.length,1);
});
test('Sem faixa premiada significa zero calculado; não significa zero recebido',()=>{
 const [b,r]=sample('megasena',range(6,20),[range(6)]),result=settleBet(b,r,today);
 assert.equal(result.status,'checked');assert.equal(result.hasPrize,false);assert.equal(result.totalCents,0);assert.equal(b.prize_received,null);
});
test('Faixa com zero ganhadores ou prêmio não confirmado nunca vira zero premiado',()=>{
 const [b,r]=sample('megasena',range(8),[range(6)]);
 r.tiers[0].winners=0;
 assert.equal(settleBet(b,r,today).status,'rateio');assert.equal(settleBet(b,r,today).totalCents,null);
 r.tiers[0].winners=1;r.tiers[0].prize=0;assert.equal(settleBet(b,r,today).totalCents,null);
});
test('Rejeita concurso trocado, data futura, aposta posterior, números inválidos e rateio incompleto',()=>{
 const [b,r]=sample('megasena',range(6),[range(6)]);
 assert.throws(()=>settleBet({...b,contest:101},r,today));
 assert.throws(()=>settleBet(b,{...r,date:'2026-11-11'},today));
 assert.throws(()=>settleBet({...b,bet_date:'2026-11-11'},r,today));
 assert.throws(()=>settleBet({...b,numbers:[1,1,2,3,4,5]},r,today));
 assert.throws(()=>settleBet(b,{...r,tiers:r.tiers.slice(1)},today));
 assert.throws(()=>settleBet(b,{...r,draws:[[1,1,2,3,4,5]]},today));
 assert.throws(()=>settleBet(b,{...r,tiers:[r.tiers[0],r.tiers[0],r.tiers[2]]},today));
});
test('Mega da Virada exige identificação especial e reconhece concursos antigos conhecidos',()=>{
 const [b,r]=sample('megadavirada',range(6),[range(6)]);
 assert.equal(settleBet(b,r,today).draws[0].hits,6);
 assert.throws(()=>settleBet(b,{...r,special:false},today));
 assert.equal(settleBet({...b,contest:1140},{...r,contest:1140,special:false},today).status,'checked');
});
test('Decomposição combinatória reconcilia com enumeração das combinações simples em todas as modalidades ampliáveis',()=>{
 function enumerate(pool,k,start=0,chosen=[],out=[]){if(chosen.length===k){out.push([...chosen]);return out;}for(let i=start;i<=pool.length-(k-chosen.length);i++){chosen.push(pool[i]);enumerate(pool,k,i+1,chosen,out);chosen.pop();}return out;}
 for(const game of ['megasena','lotofacil','quina','duplasena']){
  const g=GAMES[game],numbers=range(g.min+2),draw=range(g.drawn,3),draws=game==='duplasena'?[draw,draw]:[draw];
  const [b,r]=sample(game,numbers,draws),actual=settleBet(b,r,today).draws[0];
  const counts=new Map();for(const combo of enumerate(numbers,g.drawn)){const hits=combo.filter(n=>draw.includes(n)).length;counts.set(hits,(counts.get(hits)||0)+1);}
  for(const award of actual.awards)assert.equal(award.count,counts.get(award.hits),game);
 }
});
test('Consulta agrupa apostas do mesmo concurso e separa futuras de falhas de rede',async()=>{
 const raw=fixture('megasena'),contest=raw.numero,old=fixture('megasena','-previous'),calls=[];
 const fetcher=async url=>{calls.push(url);return{ok:true,json:async()=>String(url).endsWith('/'+old.numero)?old:raw};};
 const make=(id,c)=>({id,game:'megasena',contest:c,bet_date:'2026-01-01',numbers:raw.listaDezenas.map(Number)});
 const bets=[make('a',contest),make('b',contest),make('c',contest+1),make('d',old.numero)];
 const entries=await checkRegisteredBets(bets,{fetcher,today});
 assert.equal(calls.length,2);assert.equal(entries.get('c').status,'pending');assert.equal(entries.get('a').draws[0].hits,6);assert.equal(entries.get('d').contest,old.numero);
 const failed=await checkRegisteredBets([bets[0]],{fetcher:async()=>{throw new Error('offline');},today});
 assert.equal(failed.get('a').status,'error');assert.equal(failed.get('a').error,'offline');
});
test('Cancelamento não publica resultados e assinatura invalida edições de concurso, dezenas ou data',async()=>{
 const raw=fixture('megasena'),bet={id:'a',game:'megasena',contest:raw.numero,bet_date:'2026-01-01',numbers:raw.listaDezenas.map(Number)};
 let cancelled=false,published=0;
 const out=await checkRegisteredBets([bet],{today,fetcher:async()=>{cancelled=true;return{ok:true,json:async()=>raw};},isCancelled:()=>cancelled,onResult:()=>published++});
 assert.equal(out.size,0);assert.equal(published,0);
 assert.equal(betSignature(bet),betSignature({...bet,numbers:[...bet.numbers].reverse()}));
 assert.notEqual(betSignature(bet),betSignature({...bet,contest:10}));
});
