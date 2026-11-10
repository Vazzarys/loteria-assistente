import { GAMES, validateNumbers, choose, localDate } from './core.js';
import { fetchOfficial, parseCaixaDate } from './results.js';
import { baseGame, isViradaContest } from './history.js?v=0.6.0';

const FAIXAS = { megasena:[6,5,4], megadavirada:[6,5,4], lotofacil:[15,14,13,12,11], quina:[5,4,3,2], lotomania:[20,19,18,17,16,15,0], duplasena:[6,5,4,3] };
export const betSignature = bet => JSON.stringify([bet.game,bet.contest,bet.bet_date,[...bet.numbers].sort((a,b)=>a-b)]);
export function settleBet(bet, result, today=localDate()) {
  const g=GAMES[bet.game];
  if(!g || !validateNumbers(bet.game,bet.numbers) || !Number.isInteger(bet.contest) || bet.contest<1)throw new Error('Confira a modalidade, o concurso e as dezenas do registro.');
  if(result?.contest!==bet.contest)throw new Error('O resultado não corresponde ao concurso registrado.');
  const date=result.date, dateParts=typeof date==='string'?date.split('-'):[];
  if(dateParts.length!==3 || parseCaixaDate(dateParts.reverse().join('/'))!==date || date>today)throw new Error('Data do resultado ainda não confirmada.');
  if(typeof bet.bet_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(bet.bet_date)||parseCaixaDate(bet.bet_date.split('-').reverse().join('/'))!==bet.bet_date)throw new Error('Data da aposta inválida. Revise o registro.');
  if(bet.bet_date>date)throw new Error('A data da aposta é posterior ao sorteio. Revise o registro.');
  if(bet.game==='megadavirada'&&!isViradaContest(result))throw new Error('Este concurso não foi identificado como Mega da Virada. Revise a modalidade.');
  const drawCount=bet.game==='duplasena'?2:1, expected=FAIXAS[bet.game];
  if(!Array.isArray(result.draws)||result.draws.length!==drawCount || !Array.isArray(result.tiers)||result.tiers.length!==drawCount*expected.length)throw new Error('Dezenas ou rateio incompletos.');
  const selected=new Set(bet.numbers), rows=[];
  let total=0n, complete=true;
  for(let index=0;index<drawCount;index++) {
    const numbers=result.draws[index];
    if(!Array.isArray(numbers)||numbers.length!==g.drawn||new Set(numbers).size!==g.drawn||numbers.some(n=>!Number.isInteger(n)||n<g.first||n>g.last))throw new Error('Dezenas oficiais inválidas.');
    const common=numbers.filter(n=>selected.has(n)), awards=[];
    for(const hits of expected){
      const matching=result.tiers.filter(t=>t.draw===index+1&&t.hits===hits);
      if(matching.length!==1)throw new Error('Rateio incompleto ou repetido.');
      const tier=matching[0];
      if(!Number.isInteger(tier.winners)||tier.winners<0||!Number.isFinite(tier.prize)||tier.prize<0||!Number.isSafeInteger(Math.round(tier.prize*100)))throw new Error('Valor de rateio inválido.');
      const count=bet.game==='lotomania'?(common.length===hits?1n:0n):choose(common.length,hits)*choose(bet.numbers.length-common.length,g.drawn-hits);
      if(!count)continue;
      const confirmed=tier.winners>0&&tier.prize>0;
      const unitCents=confirmed?Math.round(tier.prize*100):null;
      const subtotal=confirmed?count*BigInt(unitCents):null;
      if(subtotal===null)complete=false;else total+=subtotal;
      awards.push({hits,count:Number(count),unitCents,totalCents:subtotal===null?null:Number(subtotal)});
    }
    rows.push({draw:index+1,numbers:[...numbers],common,hits:common.length,awards});
  }
  if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Valor fora do limite de cálculo.');
  return {status:complete?'checked':'rateio',contest:result.contest,date,draws:rows,totalCents:complete?Number(total):null,hasPrize:rows.some(r=>r.awards.length>0)};
}

// Consultas são agrupadas por modalidade/concurso; nenhum dado pessoal é gravado aqui.
export async function checkRegisteredBets(bets,{fetcher=fetch,onResult=()=>{},isCancelled=()=>false,today=localDate()}={}) {
  const groups=new Map(), latest=new Map(), output=new Map();
  for(const bet of bets){const key=baseGame(bet.game)+':'+bet.contest;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(bet);}
  const queue=[...groups.values()];let cursor=0;
  async function worker(){
    while(cursor<queue.length&&!isCancelled()){
      const group=queue[cursor++],game=baseGame(group[0].game),contest=group[0].contest;
      let record,error,pending=false;
      try{
        if(!GAMES[game]||!Number.isInteger(contest)||contest<1)throw new Error('Modalidade ou concurso inválido.');
        if(!latest.has(game))latest.set(game,fetchOfficial(game,null,fetcher));
        const current=await latest.get(game);
        pending=contest>current.contest;
        if(!pending)record=contest===current.contest?current:await fetchOfficial(game,contest,fetcher);
      }catch(e){error=e.message;}
      if(isCancelled())return;
      const checkedAt=new Date().toISOString();
      for(const bet of group){
        let result;
        try{result=error?{status:'error',error}:pending?{status:'pending'}:settleBet(bet,record,today);}
        catch(e){result={status:'error',error:e.message};}
        const entry={...result,checkedAt,signature:betSignature(bet)};
        output.set(bet.id,entry);onResult(bet.id,entry);
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(3,queue.length)},worker));return output;
}
