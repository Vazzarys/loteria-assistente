import { CONFIG } from './config.js';
import { GAMES, validateNumbers, jackpotOdds, generateNumbers, localDate, weekBounds, money, dateLabel, escapeHTML as esc, financialSummary } from './core.js';
import { SOURCE, RESULT_GAMES, loadGameWeek, weeklyRecords, latestWeeklyWinner, timestampLabel, readCache, saveCache, specialEstimate } from './results.js';
import { loadHistorical, checkCombination, baseGame } from './history.js';
import { SIMPLE_PRICES, PRICE_CHECKED, PRICE_SOURCES, batchLimit, planBudget, generatePortfolio, historicalAudit, oddsLabel } from './suggestions.js';

const $ = s => document.querySelector(s);
const state = { user: null, favorites: [], bets: [], settings: { monthly_budget: 0, theme: 'system' }, page: 'overview', game: 'megasena', numbers: [], quantity: 6, filter: '', loaded: false };
const navigation = [ ['overview', '◫', 'Visão geral'], ['builder', '⊕', 'Montar jogo'], ['suggestions', '✧', 'Sugestões'], ['favorites', '♡', 'Favoritos'], ['bets', '▤', 'Minhas apostas'], ['settings', '⚙', 'Ajustes'] ];
let client, editorContext, toastTimer, loadGeneration = 0, signingIn = false, mutationPending = false;
const resultsState = { entries: readCache(), errors: {}, busy: false, initialized: false, lastAttempt: 0, selectedGame: null, week: weekBounds().start };
const historyState = { game: null, numbers: [], data: null, result: null, controller: null, run: 0, busy: false, progress: '', error: null, scope: 'all', filter: '2+', limit: 40 };
const suggestionState = { game:'megasena', budget:'', price:'6.00', contest:'', busy:false, progress:'', error:null, result:null, controller:null, run:0 };
const formatNumber = n => String(n).padStart(2, '0');
const gameStyle = game => `--game:${GAMES[game].color};--game-soft:${GAMES[game].soft}`;
const balls = (game, numbers) => `<div class="balls" style="${gameStyle(game)}">${numbers.map(n => `<span class="ball">${formatNumber(n)}</span>`).join('')}</div>`;
const gameOptions = selected => Object.entries(GAMES).map(([key, g]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${g.name}</option>`).join('');

function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5000); }
function errorMessage(error) {
  if (error?.message?.includes('Invalid login credentials')) return 'E-mail ou senha incorretos. Use o usuário criado no Supabase.';
  if (error?.message?.includes('Email not confirmed')) return 'O e-mail ainda não está confirmado no Supabase.';
  if (error?.code === '42501') return 'Acesso não autorizado. Confira o usuário e as permissões das tabelas no Supabase.';
  if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  return error?.message || 'Não foi possível concluir. Tente novamente.';
}
function applyTheme() {
  const theme = state.settings.theme;
  document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
function navigate(page) { if(page!=='suggestions' && suggestionState.busy)cancelSuggestions(false); state.page = page; state.filter = ''; render(); window.scrollTo({ top: 0 }); }
function renderNavigation() {
  $('#navigation').innerHTML = navigation.map(([key, icon, title]) => `<button class="nav-item ${state.page === key ? 'active' : ''}" data-page="${key}" ${state.page === key ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${title}</span></button>`).join('');
  $('#page-title').textContent = navigation.find(n => n[0] === state.page)[2];
}
function render() {
  if (!state.user) return;
  renderNavigation();
  if (!state.loaded) { $('#content').innerHTML = '<div class="loading" role="status">Carregando seus registros…</div>'; return; }
  const pages = { overview, builder, suggestions, favorites, bets, settings };
  $('#content').innerHTML = pages[state.page]();
  applyTheme();
}
function overview() {
  const summary = financialSummary(state.bets, localDate().slice(0, 7));
  const budget = Number(state.settings.monthly_budget);
  const week = weekBounds();
  return `<section class="hero"><div><span class="eyebrow">CADA JOGO NO SEU LUGAR</span><h2>Olá, Junior. Vamos organizar?</h2><p>Guarde suas combinações e acompanhe suas apostas com clareza, dentro do seu orçamento.</p></div><span class="hero-mark" aria-hidden="true">✣</span></section>
    <section class="stats" aria-label="Resumo pessoal"><div class="stat"><span class="stat-label">Combinações favoritas</span><strong class="stat-value">${state.favorites.length}</strong><span class="stat-note">Guardadas na sua conta</span></div><div class="stat"><span class="stat-label">Apostas neste mês</span><strong class="stat-value">${summary.count}</strong><span class="stat-note">Por data da aposta</span></div><div class="stat"><span class="stat-label">Investido neste mês</span><strong class="stat-value">${money(summary.cost)}</strong><span class="stat-note">${budget ? `Orçamento: ${money(budget)}` : 'Defina um orçamento em Ajustes'}</span>${budget ? `<div class="budget-line ${summary.cost > budget ? 'exceeded' : ''}"><span style="width:${Math.min(100, summary.cost / budget * 100)}%"></span></div>` : ''}</div><div class="stat"><span class="stat-label">Prêmios registrados no mês</span><strong class="stat-value">${money(summary.prizes)}</strong><span class="stat-note">Informados por você • data da aposta</span></div></section>
    <div class="section-heading"><div><h2>Suas modalidades</h2><p>Painel de premiações da semana</p></div><span class="week-pill">${dateLabel(week.start).slice(0, 5)} — ${dateLabel(week.end).slice(0, 5)}</span></div>
    <div class="results-toolbar"><p class="muted">Fonte: Loterias Caixa · Valores estimados não são prêmios já pagos.</p><button class="small-button" data-action="refresh-results" ${resultsState.busy ? 'disabled' : ''}>${resultsState.busy ? 'Consultando Caixa…' : '↻ Atualizar resultados'}</button></div>
    <section class="game-cards">${Object.keys(GAMES).map(resultCard).join('')}</section>
    <p class="fine" style="margin-top:16px">O painel limita os rateios à semana atual no horário de Brasília. Use Conferir em Montar jogo ou Favoritos para comparar uma combinação com o histórico completo.</p>`;
}
function resultEntry(game) {
  const entry = resultsState.entries[game === 'megadavirada' ? 'megasena' : game];
  return entry && game === 'megadavirada' ? { ...entry, records: entry.records.filter(r => r.special) } : entry;
}
function resultCard(game) {
  const g = GAMES[game], entry = resultEntry(game), records = weeklyRecords(entry), winner = latestWeeklyWinner(entry);
  const next = entry?.latest?.next;
  const nextCurrent = next?.date && next.date >= localDate();
  const special = game === 'megadavirada';
  const announcement = special ? specialEstimate(entry) : null;
  const loading = resultsState.busy && !entry;
  const error = resultsState.errors[special ? 'megasena' : game];
  const heading = special ? announcement ? `Estimativa · concurso ${announcement.contest}` : 'Estimativa da próxima Mega da Virada' : nextCurrent ? `Estimativa · concurso ${next.contest || 'a divulgar'}` : 'Próxima estimativa';
  const amount = special ? announcement?.estimate : nextCurrent ? next.estimate : null;
  const estimateLabel = amount === null || amount === undefined ? loading ? 'Consultando…' : 'Não informada' : `${announcement?.qualifier ? announcement.qualifier + ' ' : ''}${money(amount)}`;
  const weekText = records.length ? `${records.length} concurso${records.length > 1 ? 's' : ''} nesta semana` : loading ? 'Consultando fonte oficial…' : !entry ? 'Resultados indisponíveis' : entry.stale || !entry.complete ? 'Sem resultado verificado nesta semana' : special ? 'Sem sorteio especial nesta semana' : 'Aguardando sorteio desta semana';
  return `<article class="game-card results-card" style="${gameStyle(game)}"><div class="game-name"><span class="game-dot" aria-hidden="true">✣</span>${g.name}</div><div class="estimate"><span class="muted">${heading}</span><strong>${estimateLabel}</strong><span class="fine">${special ? announcement ? `Sorteio: ${dateLabel(announcement.drawDate)} às ${announcement.drawTime}` : 'Aguardando novo anúncio oficial.' : nextCurrent ? `Próximo sorteio: ${dateLabel(next.date)}` : 'Aguardando nova informação da Caixa.'}</span>${announcement ? `<a class="estimate-source" href="${esc(announcement.source)}" target="_blank" rel="noopener noreferrer">${announcement.kind === 'api' ? `Estimativa consultada: ${timestampLabel(announcement.consultedAt)}` : `Anúncio Caixa: ${dateLabel(announcement.published)}`} ↗</a>` : ''}${special && entry?.latest?.specialReserve !== null && entry?.latest?.specialReserve !== undefined ? `<p class="special-reserve">Reserva acumulada: <strong>${money(entry.latest.specialReserve)}</strong><br>Valor separado da estimativa anunciada.</p>` : ''}</div><div class="week-result"><strong>${weekText}</strong>${winner ? `<p>Último prêmio principal: ${dateLabel(winner.date)}${game === 'duplasena' ? ` · ${winner.draw}º sorteio` : ''}<br>${winner.winners} aposta${winner.winners > 1 ? 's' : ''} vencedora${winner.winners > 1 ? 's' : ''} · ${money(winner.prize)} por aposta</p>` : records.length && entry.complete && !entry.stale ? '<p>Sem ganhador do prêmio principal nesta semana.</p>' : ''}</div>${entry ? `<p class="source-time">${special ? 'Reserva e resultados consultados' : 'Consulta'}: ${timestampLabel(entry.fetchedAt)}${entry.stale ? '<br><strong>Cópia anterior — atualização não confirmada</strong>' : ''}${!entry.complete ? '<br>Consulta semanal parcial' : ''}</p>` : ''}${error ? '<p class="result-error">Não foi possível atualizar esta modalidade. Tente novamente.</p>' : ''}<div class="result-actions"><button class="small-button" data-results="${game}" ${entry ? '' : 'disabled'}>Ver resultados e rateio</button><button class="small-button" data-build="${game}">Montar jogo ↗</button></div></article>`;
}
function openResults(game) {
  if (!GAMES[game]) return;
  resultsState.selectedGame = game;
  renderResultsDialog();
  $('#results-dialog').showModal();
}
function renderResultsDialog() {
  const game = resultsState.selectedGame;
  if (!game) return;
  const entry = resultEntry(game), records = weeklyRecords(entry), week = weekBounds();
  $('#results-title').textContent = GAMES[game].name;
  const carryover = game !== 'megadavirada' ? entry?.latest?.next?.carryover : null;
  $('#results-content').innerHTML = `<p class="muted">Semana de ${dateLabel(week.start)} a ${dateLabel(week.end)} · horário de Brasília</p>${entry ? `<p class="fine">Consulta à Caixa: ${timestampLabel(entry.fetchedAt)}. ${entry.stale ? 'Exibindo cópia anterior; atualização não confirmada.' : 'Fonte consultada nesta atualização.'}</p>` : ''}${carryover !== null && carryover !== undefined ? `<div class="notice">Acumulado para o próximo concurso: <strong>${money(carryover)}</strong>. Esse valor é diferente da estimativa do prêmio.</div>` : ''}${game === 'megadavirada' ? '<div class="notice">Aqui aparecem somente os concursos identificados pela Caixa como Mega da Virada e realizados na semana atual. A estimativa em destaque usa o anúncio da Caixa identificado no cartão; a reserva acumulada aparece separadamente e não é a estimativa do prêmio final.</div>' : ''}${!entry?.complete ? '<div class="notice">A consulta da semana está incompleta. A ausência de um concurso ou ganhador não é conclusiva.</div>' : ''}${records.length ? records.map(record => `<section class="weekly-contest" style="${gameStyle(game)}"><div class="section-heading"><h3>Concurso ${record.contest}</h3><span class="muted">${dateLabel(record.date)}</span></div>${record.draws.map((numbers, index) => `<div class="draw-result"><h4>${game === 'duplasena' ? `${index + 1}º sorteio` : 'Números sorteados'}</h4>${balls(game, numbers)}<div class="table-scroll"><table class="rateio-table"><caption>Rateio${game === 'duplasena' ? ` do ${index + 1}º sorteio` : ''}</caption><thead><tr><th>Acertos</th><th>Apostas vencedoras</th><th>Por aposta</th></tr></thead><tbody>${record.tiers.filter(t => t.draw === index + 1).map(t => `<tr><td>${t.hits}</td><td>${t.winners.toLocaleString('pt-BR')}</td><td>${t.winners ? money(t.prize) : '—'}</td></tr>`).join('')}</tbody></table></div>${record.tiers.filter(t => t.draw === index + 1 && t.hits === numbers.length).map(t => `<p class="fine">${t.winners ? `Total do rateio principal: ${money(Math.round(t.prize * 100) * t.winners / 100)} (${t.winners} × ${money(t.prize)}; total calculado).` : 'Não houve aposta vencedora do prêmio principal neste sorteio.'}</p>`).join('')}</div>`).join('')}${record.cities.length ? `<details class="winner-locations"><summary>Localidades divulgadas pela Caixa</summary><p class="fine">Local de registro das apostas, conforme divulgação por concurso. Não identifica pessoas nem a divisão interna de bolões.</p><ul>${record.cities.map(c => `<li>${esc(c.city)} / ${esc(c.state)} · ${c.winners} aposta${c.winners > 1 ? 's' : ''}</li>`).join('')}</ul></details>` : ''}<a class="official-link" href="${SOURCE + (game === 'megadavirada' ? 'megasena' : game) + '/' + record.contest}" target="_blank" rel="noopener noreferrer">Consultar dados deste concurso na Caixa ↗</a></section>`).join('') : `<div class="empty"><h3>${entry && entry.complete && !entry.stale ? 'Nenhum sorteio desta modalidade na semana atual.' : 'Sem resultados verificados para esta semana.'}</h3><p>Resultados de semanas anteriores não são exibidos neste painel.</p></div>`}<p class="fine">“Apostas vencedoras” não significa quantidade de pessoas. Os valores são os rateios divulgados pela Caixa, não o valor total que uma aposta com mais dezenas receberia em todas as faixas.</p>`;
}
async function refreshResults() {
  if (resultsState.busy || !state.user) return;
  resultsState.busy = true; resultsState.initialized = true; resultsState.lastAttempt = Date.now();
  if (state.page === 'overview' && state.loaded) render();
  await Promise.all(RESULT_GAMES.map(async game => {
    try {
      const entry = await loadGameWeek(game, resultsState.entries[game]);
      resultsState.entries[game] = entry;
      if (entry.error) resultsState.errors[game] = entry.error; else delete resultsState.errors[game];
    } catch (error) {
      resultsState.errors[game] = error.message;
      if (resultsState.entries[game]) resultsState.entries[game] = { ...resultsState.entries[game], records: weeklyRecords(resultsState.entries[game]), stale: true };
    }
  }));
  saveCache(resultsState.entries);
  resultsState.busy = false;
  if (state.user && state.page === 'overview' && state.loaded) render();
  if ($('#results-dialog').open) renderResultsDialog();
}
$('#close-results').addEventListener('click', () => $('#results-dialog').close());
setInterval(() => {
  if (!state.user || document.visibilityState !== 'visible') return;
  const currentWeek = weekBounds().start;
  if (currentWeek !== resultsState.week) {
    resultsState.week = currentWeek;
    for (const entry of Object.values(resultsState.entries)) {
      entry.records = weeklyRecords(entry); entry.complete = false; entry.stale = true;
    }
    saveCache(resultsState.entries);
    if (state.page === 'overview' && state.loaded) render();
    if ($('#results-dialog').open) renderResultsDialog();
  }
  if (Date.now() - resultsState.lastAttempt >= 300000 && !$('#editor').open) void refreshResults();
}, 60000);
function closeHistory() {
  historyState.controller?.abort(); historyState.run++;
  historyState.result = null; historyState.numbers = []; historyState.busy = false; historyState.data = null;
  $('#history-dialog').close(); $('#history-content').replaceChildren();
}
function openHistory(game, numbers) {
  if (!validateNumbers(game, numbers)) { toast('Selecione uma combinação válida para conferir.'); return; }
  historyState.controller?.abort();
  Object.assign(historyState, { game, numbers: [...numbers], result: null, data: null, error: null, scope: 'all', filter: '2+', limit: 40 });
  $('#history-title').textContent = GAMES[game].name;
  $('#history-dialog').showModal();
  void runHistory();
}
async function runHistory() {
  if (historyState.busy || !historyState.game) return;
  const run = ++historyState.run;
  historyState.controller = new AbortController(); historyState.busy = true; historyState.error = null; historyState.progress = 'Carregando histórico oficial…';
  renderHistory();
  try {
    const data = await loadHistorical(historyState.game, { signal: historyState.controller.signal, onProgress: p => {
      if (run !== historyState.run) return;
      historyState.progress = p.stage === 'loading' ? 'Carregando a base histórica…' : p.stage === 'latest' ? 'Consultando o último concurso na Caixa…' : `Atualizando concursos: ${p.done} de ${p.total}${p.failed ? ` · ${p.failed} indisponível(is)` : ''}`;
      const label = $('#history-progress'); if (label) label.textContent = historyState.progress;
    } });
    if (run !== historyState.run || !state.user) return;
    historyState.data = data;
    historyState.result = checkCombination(data, historyState.game, historyState.numbers, historyState.scope);
  } catch (error) {
    if (run !== historyState.run || error.name === 'AbortError') return;
    historyState.error = errorMessage(error);
  } finally {
    if (run === historyState.run) { historyState.busy = false; renderHistory(); }
  }
}
function renderHistory() {
  const s = historyState, g = GAMES[s.game];
  if (!g || !$('#history-dialog').open) return;
  const prefix = `${balls(s.game, s.numbers)}<p class="fine">Comparação por conjunto de números; a ordem não importa. Coincidências históricas não significam que você recebeu um prêmio.</p>`;
  if (s.busy) { $('#history-content').innerHTML = prefix + '<div class="loading"><p id="history-progress" role="status"></p><p class="fine">Você pode fechar esta janela para cancelar.</p></div>'; $('#history-progress').textContent = s.progress; return; }
  if (s.error) { $('#history-content').innerHTML = prefix + `<p class="error">${esc(s.error)}</p><button class="primary" data-action="refresh-history">Tentar novamente</button>`; return; }
  const r = s.result;
  if (!r) return;
  const c = r.coverage, conclusive = c.complete && r.currentConfirmed;
  const scope = baseGame(s.game) === 'megasena' ? `<label class="history-scope-label">Comparar com<select id="history-scope"><option value="all" ${s.scope === 'all' ? 'selected' : ''}>Todos os concursos da Mega-Sena, incluindo a Virada</option><option value="special" ${s.scope === 'special' ? 'selected' : ''}>Somente edições identificadas da Mega da Virada</option></select></label>` : '';
  const negative = conclusive ? 'Nenhuma combinação idêntica encontrada.' : 'Nenhuma combinação idêntica encontrada na base consultada; a cobertura atual não foi confirmada.';
  const headline = r.canBeIdentical ? r.fullMatches ? `Combinação idêntica em ${r.fullMatches} sorteio${r.fullMatches > 1 ? 's' : ''}.` : negative : r.fullMatches ? `Seu jogo contém todas as ${g.drawn} dezenas sorteadas em ${r.fullMatches} sorteio${r.fullMatches > 1 ? 's' : ''}.` : `Nenhum sorteio consultado teve todas as ${g.drawn} dezenas contidas no seu jogo.`;
  let rows = r.rows.filter(row => s.filter === 'all' || (s.filter === '2+' ? row.hits >= 2 : row.hits === Number(s.filter)));
  const visible = rows.slice(0, s.limit);
  const anomalyIds = new Set(r.dateAnomalies.flatMap(a => [a.contest, a.previousContest]));
  $('#history-content').innerHTML = prefix + scope + `<div class="history-coverage ${conclusive ? '' : 'partial'}"><strong>${c.complete ? `Cobertura do concurso 1 ao ${c.last.toLocaleString('pt-BR')}` : `Base parcial: ${c.count.toLocaleString('pt-BR')} de ${c.expected.toLocaleString('pt-BR')} concursos`}</strong><p>${r.currentConfirmed ? `Último concurso confirmado na Caixa em ${timestampLabel(r.checkedAt)}.` : 'Novos concursos não puderam ser verificados agora. A análise utiliza a base disponível.'}${c.missingCount ? ` Faltam ${c.missingCount} concursos.` : ''}</p>${r.updateError ? `<p>${esc(r.updateError)}</p>` : ''}</div><div class="history-summary"><h3>${headline}</h3><p>${r.contestCount.toLocaleString('pt-BR')} concursos e ${r.drawCount.toLocaleString('pt-BR')} sorteios comparados${s.scope === 'special' ? ' da Mega da Virada' : ''}. Maior coincidência: <strong>${r.maxHits} números</strong>.</p>${!r.canBeIdentical ? '<p class="fine">Seu jogo tem mais números que o sorteio. A análise mede quantas dezenas sorteadas estão contidas nele; não é igualdade entre os dois conjuntos.</p>' : ''}</div><h3 class="history-histogram-title">Quantas dezenas coincidiram?</h3><p class="fine">Toque em uma quantidade para ver os sorteios correspondentes. As contagens são exatas, não acumuladas.</p><div class="history-counts" style="${gameStyle(s.game)}">${r.histogram.map((count,hits) => `<button class="history-count ${s.filter === String(hits) ? 'active' : ''}" data-hit="${hits}" aria-pressed="${s.filter === String(hits)}"><span>${hits} ${hits === 1 ? 'número' : 'números'}</span><strong>${count.toLocaleString('pt-BR')}</strong><small>sorteios</small></button>`).join('')}</div><div class="history-filter-row"><label>Mostrar<select id="history-filter"><option value="2+" ${s.filter === '2+' ? 'selected' : ''}>2 ou mais coincidências</option><option value="all" ${s.filter === 'all' ? 'selected' : ''}>Todos os sorteios</option>${r.histogram.map((_,hits) => `<option value="${hits}" ${s.filter === String(hits) ? 'selected' : ''}>Exatamente ${hits} coincidências</option>`).join('')}</select></label><span class="muted">${rows.length.toLocaleString('pt-BR')} sorteios · maiores coincidências primeiro</span></div><div class="history-matches">${visible.map(row => `<article class="history-match" style="${gameStyle(s.game)}"><div class="record-heading"><h3>Concurso ${row.contest}${s.game === 'duplasena' ? ` · ${row.draw}º sorteio` : ''}</h3><span class="muted">${dateLabel(row.date)}${anomalyIds.has(row.contest) ? ' *' : ''}</span></div><div class="history-draw">${row.numbers.map(n => `<span class="ball ${row.common.includes(n) ? 'matched' : 'unmatched'}">${formatNumber(n)}</span>`).join('')}</div><p class="muted"><strong>${row.hits} ${row.hits === 1 ? 'coincidência' : 'coincidências'}</strong>${row.common.length ? ': ' + row.common.map(formatNumber).join(' · ') : ''}</p><a class="official-link" href="${SOURCE + baseGame(s.game) + '/' + row.contest}" target="_blank" rel="noopener noreferrer">Ver concurso na Caixa ↗</a></article>`).join('') || '<div class="empty"><h3>Nenhum sorteio neste filtro.</h3><p>Escolha outra quantidade de coincidências acima.</p></div>'}</div>${rows.length > visible.length ? `<button class="secondary history-more" data-action="more-history">Mostrar mais 40 (${visible.length} de ${rows.length})</button>` : ''}${r.dateAnomalies.length ? '<p class="fine">* A fonte oficial apresenta datas fora da sequência dos concursos nesses registros. As datas foram mantidas como publicadas.</p>' : ''}<p class="fine history-source">Base importada em ${timestampLabel(r.importedAt)} dos downloads oficiais da Caixa. ${s.scope === 'special' ? 'As primeiras edições especiais foram identificadas por relação de concursos, pois a marcação antiga da API não é uniforme.' : ''}</p><button class="secondary" data-action="refresh-history">↻ Atualizar e conferir novamente</button>`;
}
$('#close-history').addEventListener('click', closeHistory);
$('#history-dialog').addEventListener('cancel', event => { event.preventDefault(); closeHistory(); });
function suggestionContest(game) {
  if(game==='megadavirada')return specialEstimate(resultsState.entries.megasena)?.contest || '';
  const next=resultsState.entries[game]?.latest?.next;
  return next?.date>=localDate() ? next.contest || '' : '';
}
function monthlyRemaining() {
  const budget=Number(state.settings.monthly_budget);
  return budget>0 ? Math.max(0,Math.round(budget*100)-Math.round(financialSummary(state.bets,localDate().slice(0,7)).cost*100)) : null;
}
function suggestions() {
  const s=suggestionState,g=GAMES[s.game],remaining=monthlyRemaining();
  return `<div class="game-tabs" role="group" aria-label="Modalidade das sugestões">${Object.entries(GAMES).map(([game,g])=>`<button class="game-tab ${s.game===game?'active':''}" style="${gameStyle(game)}" data-suggest-game="${game}" ${s.busy?'disabled':''}>${g.name}</button>`).join('')}</div><section class="hero suggestion-hero"><div><span class="eyebrow">OBJETIVO: PRÊMIO PRINCIPAL</span><h2>Cobertura calculada, dentro do seu limite.</h2><p>Apostas simples distintas. O segundo critério é cobrir resultados que acertariam a faixa imediatamente abaixo${s.game==='lotomania'?' — na Lotomania, o cálculo do lote se concentra nos 20 acertos':''}.</p></div><span class="hero-mark" aria-hidden="true">✧</span></section><div class="suggestion-setup"><section class="panel"><h2>Planejar um lote · ${g.name}</h2><form id="suggestion-form"><div class="fields-row"><label>Limite deste lote (R$)<input name="budget" data-suggest-input="budget" type="number" min="0.01" max="1000000" step="0.01" value="${esc(s.budget)}" placeholder="Informe seu limite" required ${s.busy?'disabled':''}></label><label>Preço por aposta (R$)<input name="price" data-suggest-input="price" type="number" min="0.01" max="1000000" step="0.01" value="${esc(s.price)}" required ${s.busy?'disabled':''}></label></div><label>Concurso de destino<input name="contest" data-suggest-input="contest" type="number" min="1" max="2147483647" step="1" value="${esc(s.contest || suggestionContest(s.game))}" required ${s.busy?'disabled':''}></label><p class="fine">Preço de referência da Caixa conferido em ${dateLabel(PRICE_CHECKED)}. <a class="official-link" href="https://loterias.caixa.gov.br/Paginas/${PRICE_SOURCES[s.game]}.aspx" target="_blank" rel="noopener noreferrer">Conferir preço e regras ↗</a>. Atualize o campo se necessário; o custo usa o preço informado. ${g.min} dezenas por jogo. Limite de ${batchLimit(s.game)} jogos por geração${s.game==='lotomania'?' para calcular a cobertura por inclusão-exclusão':''}.</p>${remaining!==null?`<p class="fine">Saldo mensal disponível pelos registros: <strong>${money(remaining/100)}</strong>. Esse saldo também limita o lote.</p>`:''}<button class="primary" type="submit" ${s.busy?'disabled':''}>${s.busy?'Calculando…':'Gerar sugestões com cobertura'}</button>${s.busy?'<button class="secondary" type="button" data-action="cancel-suggestions">Cancelar</button>':''}</form><p id="suggestion-error" class="error" role="alert">${esc(s.error||'')}</p><p id="suggestion-progress" class="muted" role="status">${s.busy?esc(s.progress):''}</p></section><section class="panel suggestion-method"><span class="eyebrow">COMO A ESCOLHA FUNCIONA</span><h2>Combinações, não previsões.</h2><ol><li>Calcula quantas apostas simples cabem no seu limite.</li><li>Gera candidatos aleatórios e evita repetir jogos já cobertos pelas suas apostas registradas no concurso.</li><li>${s.game==='lotomania'?'Seleciona por cobertura exata de resultados com 20 acertos.':'Preserva combinações distintas para o prêmio principal e busca maior cobertura de '+(g.drawn-1)+' ou mais acertos entre os candidatos avaliados.'}</li><li>Depois da escolha, compara o lote com o histórico e com 32 lotes aleatórios de mesmo custo.</li></ol><p class="fine">As dezenas não são escolhidas pela frequência passada. Para o mesmo número de apostas simples distintas, a chance do prêmio principal é igual${s.game==='lotomania'?' nas modalidades com aposta simples igual ao tamanho do sorteio; a Lotomania exige outro cálculo':''}. A distribuição muda a cobertura conjunta das demais faixas.</p></section></div><div id="suggestions-output">${s.result?suggestionOutput():''}</div>`;
}
function suggestionOutput() {
  const r=suggestionState.result;if(!r)return '';
  const g=GAMES[r.game],cov=r.generated.coverage,audit=r.audit;
  const mainMax=cov.main===cov.mainUpperBound,nearMax=cov.near!==null && cov.near===cov.nearUpperBound;
  return `<section class="suggestion-results" style="${gameStyle(r.game)}"><div class="section-heading"><div><h2>Seu lote · concurso ${r.contest}</h2><p>${r.generated.tickets.length} jogos distintos de ${g.min} dezenas. Nada foi apostado ou debitado.</p></div><button class="small-button" data-action="export-suggestions">↓ Exportar análise</button></div><div class="stats suggestion-stats"><div class="stat"><span class="stat-label">Custo estimado do lote</span><strong class="stat-value">${money(r.plan.costCents/100)}</strong><span class="stat-note">${money(r.plan.priceCents/100)} por jogo</span></div><div class="stat"><span class="stat-label">Chance do prêmio principal</span><strong class="stat-value suggestion-odds">${oddsLabel(cov.main,cov.total)}</strong><span class="stat-note">Do lote inteiro${r.game==='duplasena'?' · por sorteio':''}</span></div><div class="stat"><span class="stat-label">${cov.near!==null?`Chance de ${cov.nearHits} ou mais acertos`:'Cobertura principal do lote'}</span><strong class="stat-value suggestion-odds">${cov.near!==null?oddsLabel(cov.near,cov.total):mainMax?'Teto atingido':'Calculada'}</strong><span class="stat-note">${cov.near!==null?'União exata, incluindo o prêmio principal': 'Contagem exata de resultados com 20 acertos'}${r.game==='duplasena'?' · por sorteio':''}</span></div><div class="stat"><span class="stat-label">Saldo não utilizado do limite</span><strong class="stat-value">${money(r.plan.unusedCents/100)}</strong><span class="stat-note">Não é necessário gastar o limite inteiro</span></div></div><div class="notice"><strong>${r.game==='lotomania'?(mainMax?'O lote atingiu o teto de cobertura de 20 acertos para essa quantidade de apostas.':'Lote escolhido pela maior cobertura de 20 acertos entre os candidatos avaliados; não há prova de ótimo global.'):`${mainMax?'Cobertura máxima do prêmio principal para esta quantidade de apostas simples distintas. ':''}${nearMax?`O lote também atingiu o teto combinatório de cobertura de ${cov.nearHits} ou mais acertos.`:`A cobertura de ${cov.nearHits} ou mais acertos foi medida exatamente; a busca não garante ótimo global.`}`}</strong><br>Hipótese: todos os resultados válidos são equiprováveis. As chances incluem somente os jogos deste lote, sem somar suas apostas anteriores.</div>${r.plan.limited?`<p class="fine">O orçamento comportava mais jogos; foi aplicado o limite de ${batchLimit(r.game)} por geração. O valor restante não foi utilizado.</p>`:''}${!r.history.currentConfirmed||!r.history.coverage.complete?`<div class="notice">Histórico disponível até o concurso ${r.history.coverage.last}. ${r.history.currentConfirmed?'Há lacunas na base.':'Novos concursos não foram confirmados agora.'} O retrospecto abaixo usa somente os registros disponíveis; isso não altera o cálculo combinatório.</div>`:''}<div class="suggestion-ticket-grid">${r.generated.tickets.map((ticket,index)=>`<article class="record"><div class="record-heading"><h3>Jogo ${String(index+1).padStart(2,'0')}</h3><span class="muted">${money(r.plan.priceCents/100)}</span></div>${balls(r.game,ticket)}<div class="record-actions"><button class="small-button" data-save-suggestion="${index}">♡ Salvar favorito</button><button class="small-button" data-check-suggestion="${index}">Conferir histórico</button><button class="small-button" data-use-suggestion="${index}">Usar no editor</button></div></article>`).join('')}</div><section class="panel retrospective-panel"><h2>Retrospecto descritivo · sem escolher pelo passado</h2><p class="muted">Últimos 20% da base: concursos ${audit.from} a ${audit.to}, ${audit.observed.draws.toLocaleString('pt-BR')} sorteios. ${baseGame(r.game)==='megasena'?'Referência: toda a Mega-Sena, incluindo as edições da Virada.':''}</p><div class="audit-comparison"><div><span>Seu lote: sorteios com ${g.drawn-1} ou mais coincidências</span><strong>${audit.observed.near}</strong></div><div><span>Mediana de ${audit.baseline.count} lotes aleatórios do mesmo custo</span><strong>${audit.baseline.median}</strong></div><div><span>Intervalo observado nos lotes aleatórios</span><strong>${audit.baseline.min} a ${audit.baseline.max}</strong></div></div><p class="fine">A geração não consultou o histórico para selecionar as dezenas. Este comparativo exploratório, feito depois da escolha, não comprova previsão nem vantagem futura. A probabilidade acima vem da contagem exata de resultados possíveis.</p><details><summary>Contagens de coincidências do lote no recorte</summary><div class="audit-histogram">${audit.observed.histogram.map((count,hits)=>`<span>${hits} números: <strong>${count.toLocaleString('pt-BR')}</strong></span>`).join('')}</div><p class="fine">Cada sorteio conta uma vez, pela maior coincidência entre os jogos do lote.</p></details><details><summary>Frequências do histórico completo disponível</summary><p class="fine">Informação descritiva, sem peso na seleção das dezenas. ${audit.fullDraws.toLocaleString('pt-BR')} sorteios consultados.</p><div class="frequency-lists"><p>Mais frequentes: ${audit.frequencies.slice(0,5).map(f=>`${formatNumber(f.number)} (${f.count})`).join(' · ')}</p><p>Menos frequentes: ${[...audit.frequencies].reverse().slice(0,5).map(f=>`${formatNumber(f.number)} (${f.count})`).join(' · ')}</p></div></details><details><summary>Ver método e contagens verificáveis</summary><p class="fine">${esc(r.generated.method)} · ${r.generated.candidatesEvaluated} candidatos avaliados. Busca sequencial por cobertura marginal, com desempate pela menor repetição de dezenas no lote. Não usa treino preditivo.</p><p class="exact-count">Resultados principais cobertos: ${cov.main.toString()} de ${cov.total.toString()}.</p>${cov.near!==null?`<p class="exact-count">Resultados com ${cov.nearHits} ou mais acertos: ${cov.near.toString()} de ${cov.total.toString()}.</p>`:''}<p class="fine">Na Mega-Sena e demais apostas simples com tamanho igual ao sorteio, a união da faixa imediatamente abaixo é enumerada sem contar resultados duas vezes. Na Lotomania, aplica-se inclusão-exclusão sobre os subconjuntos de 20 dezenas. Os decimais das chances são arredondados para apresentação.</p></details></section></section>`;
}
function cancelSuggestions(rerender=true) {
  suggestionState.controller?.abort();suggestionState.run++;suggestionState.busy=false;suggestionState.progress='';
  if(rerender&&state.page==='suggestions')render();
}
async function runSuggestions(form) {
  if(suggestionState.busy)return;
  const s=suggestionState;
  s.budget=String(form.get('budget')||'');s.price=String(form.get('price')||'');s.contest=String(form.get('contest')||'');s.error=null;s.result=null;
  const cents=value=>{const n=Number(value);if(!Number.isFinite(n)||n<=0||Math.abs(n*100-Math.round(n*100))>0.000001)throw new Error('Use valores positivos com até duas casas decimais.');return Math.round(n*100);};
  let budget,price,contest;
  try {budget=cents(s.budget);price=cents(s.price);contest=Number(s.contest);if(!Number.isInteger(contest)||contest<1||contest>2147483647)throw new Error('Informe um concurso válido.');planBudget(s.game,budget,price,monthlyRemaining());}
  catch(error){s.error=errorMessage(error);render();return;}
  const run=++s.run;s.controller=new AbortController();s.busy=true;s.progress='Carregando e verificando a base de sorteios…';render();
  try {
    const history=await loadHistorical(s.game,{signal:s.controller.signal});
    if(contest<=history.coverage.last)throw new Error(`O concurso ${contest} já consta no histórico. Informe um concurso futuro, superior a ${history.coverage.last}.`);
    const plan=planBudget(s.game,budget,price,monthlyRemaining());
    const exclusions=state.bets.filter(b=>baseGame(b.game)===baseGame(s.game)&&b.contest===contest).map(b=>b.numbers);
    const generated=await generatePortfolio(s.game,plan.count,{exclusions,signal:s.controller.signal,onProgress:p=>{s.progress=`Calculando cobertura: jogo ${p.done} de ${p.total}…`;const label=$('#suggestion-progress');if(label)label.textContent=s.progress;}});
    s.progress='Comparando com 32 lotes aleatórios do mesmo custo…';if($('#suggestion-progress'))$('#suggestion-progress').textContent=s.progress;
    const audit=await historicalAudit(s.game,generated.tickets,history,{exclusions,signal:s.controller.signal});
    if(run!==s.run||!state.user)return;
    s.result={game:s.game,contest,plan,generated,audit,history:{coverage:history.coverage,currentConfirmed:history.currentConfirmed,checkedAt:history.checkedAt,source:history.source},createdAt:new Date().toISOString()};
  } catch(error){if(run===s.run&&error.name!=='AbortError')s.error=errorMessage(error);}
  finally{if(run===s.run){s.busy=false;if(state.page==='suggestions')render();}}
}
function useSuggestion(index,action) {
  const r=suggestionState.result,ticket=r?.generated.tickets[index];if(!ticket)return;
  if(action==='check'){openHistory(r.game,ticket);return;}
  state.game=r.game;state.numbers=[...ticket];state.quantity=ticket.length;
  if(action==='save'){openEditor('favorite');$('#editor-form [name="name"]').value=`Sugestão ${index+1} · ${GAMES[r.game].name}`;$('#editor-form [name="notes"]').value=`Lote gerado para o concurso ${r.contest}. Método: ${r.generated.method}. Registro de favorito, não de aposta realizada.`;}
  else navigate('builder');
}
function exportSuggestions() {
  const result=suggestionState.result;if(!result)return;
  const serialized=JSON.stringify(result,(_key,value)=>typeof value==='bigint'?value.toString():value,2);
  const url=URL.createObjectURL(new Blob([serialized],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`sugestoes-${result.game}-${result.contest}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function builder() {
  const g = GAMES[state.game];
  const valid = validateNumbers(state.game, state.numbers);
  const odds = valid ? jackpotOdds(state.game, state.numbers.length) : null;
  return `<div class="game-tabs" role="group" aria-label="Modalidade">${Object.entries(GAMES).map(([key, item]) => `<button class="game-tab ${state.game === key ? 'active' : ''}" style="${gameStyle(key)}" data-game="${key}" aria-pressed="${state.game === key}">${item.name}</button>`).join('')}</div>
    <div class="builder-layout" style="${gameStyle(state.game)}"><section class="panel"><div class="builder-top"><div><h2>${g.name}</h2><span class="muted">${g.min === g.max ? `Selecione ${g.min} números` : `Selecione de ${g.min} a ${g.max} números`} entre ${formatNumber(g.first)} e ${g.last}.</span></div><label class="quantity-label">Gerar quantos?<input id="quantity" type="number" min="${g.min}" max="${g.max}" value="${state.quantity}" ${g.min === g.max ? 'readonly' : ''}></label></div><div class="number-grid" role="group" aria-label="Escolha os números">${Array.from({ length: g.last - g.first + 1 }, (_, i) => i + g.first).map(n => `<button class="number ${state.numbers.includes(n) ? 'selected' : ''}" data-number="${n}" aria-pressed="${state.numbers.includes(n)}" aria-label="Número ${formatNumber(n)}">${formatNumber(n)}</button>`).join('')}</div><div class="builder-controls"><button class="secondary" data-action="generate">⤨ Gerar aleatórios</button><button class="secondary" data-action="clear">Limpar</button></div></section>
    <section class="panel summary-panel"><span class="eyebrow">SUA COMBINAÇÃO</span><h2 style="margin-top:12px">Um jogo do seu jeito.</h2><span class="selected-count">${state.numbers.length} números selecionados</span>${state.numbers.length ? balls(state.game, state.numbers) : '<p class="selection-empty">Toque nos números ao lado ou gere uma combinação aleatória.</p>'}<div class="odds"><span class="muted">Chance do prêmio principal${state.game === 'duplasena' ? ' por sorteio' : ''}</span><strong>${odds ? `1 em ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(odds)}` : 'Selecione um jogo válido'}</strong><span class="fine">${state.game === 'lotomania' ? 'Probabilidade de acertar os 20 números.' : `Probabilidade de acertar ${g.drawn} números.`} Sorteios independentes; o histórico não altera essa chance.</span></div><div class="action-stack"><button class="primary" data-action="check-history" ${valid ? '' : 'disabled'}>Conferir no histórico</button><button class="secondary" data-action="favorite" ${valid ? '' : 'disabled'}>♡ Salvar favorito</button><button class="secondary" data-action="bet" ${valid ? '' : 'disabled'}>Registrar aposta realizada</button></div><p class="fine" style="margin-top:16px;margin-bottom:0">Gerador aleatório, sem previsão. Registrar aqui não realiza uma aposta na Caixa.</p></section></div>`;
}
function filterHeader(title, count) { return `<div class="section-heading"><div><h2>${title}</h2><p>${count} registro${count === 1 ? '' : 's'} na sua conta</p></div><select class="filter-select" id="game-filter" aria-label="Filtrar modalidade"><option value="">Todas as modalidades</option>${gameOptions(state.filter)}</select></div>`; }
function empty(title, description) { return `<div class="empty"><span class="empty-symbol" aria-hidden="true">✣</span><h3>${title}</h3><p>${description}</p><button class="primary" data-page="builder">Montar meu jogo ↗</button></div>`; }
function favorites() {
  const rows = state.favorites.filter(f => !state.filter || f.game === state.filter);
  return filterHeader('Suas combinações favoritas', rows.length) + (rows.length ? `<div class="record-list">${rows.map(f => `<article class="record" style="${gameStyle(f.game)}"><div class="record-heading"><div><h3>${esc(f.name || GAMES[f.game].name)}</h3><span class="muted">${GAMES[f.game].name} • salvo em ${dateLabel(localDate(new Date(f.created_at)))}</span></div><span class="game-name" aria-hidden="true">♡</span></div>${balls(f.game, f.numbers)}${f.notes ? `<p class="record-notes">${esc(f.notes)}</p>` : ''}<div class="record-actions"><button class="small-button" data-check-favorite="${f.id}">Conferir</button><button class="small-button" data-use="${f.id}">Usar combinação</button><button class="small-button" data-bet-favorite="${f.id}">Registrar aposta</button><button class="small-button" data-edit-favorite="${f.id}">Editar nome</button><button class="small-button" data-delete-favorite="${f.id}">Excluir</button></div></article>`).join('')}</div>` : empty('Seus favoritos começam aqui.', 'Salve uma combinação para encontrá-la novamente no computador e no celular.'));
}
function bets() {
  const rows = state.bets.filter(b => !state.filter || b.game === state.filter);
  return filterHeader('Seu histórico de apostas', rows.length) + '<div class="notice">Registre somente jogos que você já apostou. A conferência automática será integrada na próxima etapa. Os prêmios abaixo são informados manualmente.</div>' + (rows.length ? `<div class="record-list">${rows.map(b => `<article class="record" style="${gameStyle(b.game)}"><div class="record-heading"><div><h3>${GAMES[b.game].name} · Concurso ${b.contest}</h3><span class="muted">Aposta em ${dateLabel(b.bet_date)}</span></div><span class="pill">${b.prize_received === null ? 'SEM PRÊMIO INFORMADO' : 'VALOR INFORMADO'}</span></div>${balls(b.game, b.numbers)}<div class="prize-data"><div><span class="muted">Valor apostado</span><strong>${money(b.cost)}</strong></div><div><span class="muted">Prêmio informado</span><strong>${b.prize_received === null ? '—' : money(b.prize_received)}</strong></div></div>${b.notes ? `<p class="record-notes" style="margin-top:14px">${esc(b.notes)}</p>` : ''}<div class="record-actions"><button class="small-button" data-edit-bet="${b.id}">Editar registro</button><button class="small-button" data-delete-bet="${b.id}">Excluir</button></div></article>`).join('')}</div>` : empty('Suas apostas, sem perder o controle.', 'Monte um jogo ou abra um favorito e selecione “Registrar aposta” depois de jogar na Caixa.'));
}
function settings() {
  return `<div class="settings-grid"><section class="panel"><h2>Seu planejamento</h2><p>Defina um limite mensal para acompanhar seus gastos.</p><form id="settings-form"><label>Orçamento mensal (R$)<input name="budget" type="number" min="0" max="9999999999.99" step="0.01" value="${state.settings.monthly_budget}" required></label><label>Aparência<select name="theme"><option value="system" ${state.settings.theme === 'system' ? 'selected' : ''}>Acompanhar o dispositivo</option><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Clara</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Escura</option></select></label><button type="submit" class="primary">Salvar preferências</button></form></section><section class="panel"><h2>Seus dados, com você.</h2><p>Favoritos e apostas ficam vinculados à sua conta. Exporte uma cópia em JSON quando quiser.</p><button class="secondary" data-action="export">↓ Exportar meus registros</button><hr style="border:0;border-top:1px solid var(--border);margin:25px 0"><span class="eyebrow">CONTA CONECTADA</span><p class="account-address" style="margin-top:12px">${esc(state.user.email)}</p><button class="secondary" data-action="logout">Sair da conta ↗</button><p class="fine" style="margin-top:20px">Versão 0.4 • Sugestões por cobertura combinatória, histórico e resultados semanais.</p></section></div>`;
}

async function readAll(table) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await client.from(table).select('*').order('created_at', { ascending: false }).order('id').range(from, from + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows;
}
async function loadData() {
  const generation = ++loadGeneration;
  $('#sync-status').textContent = 'Sincronizando…';
  try {
    const [favorites, bets, preferences] = await Promise.all([readAll('favorites'), readAll('bets'), client.from('settings').select('*').eq('user_id', state.user.id).maybeSingle()]);
    if (preferences.error) throw preferences.error;
    if (generation !== loadGeneration || !state.user) return;
    state.favorites = favorites;
    state.bets = bets;
    state.settings = preferences.data || { monthly_budget: 0, theme: 'system' };
    state.loaded = true;
    $('#sync-status').textContent = '● Sincronizado';
    render();
    if (!resultsState.initialized) void refreshResults();
  } catch (error) {
    if (generation !== loadGeneration || !state.user) return;
    $('#sync-status').textContent = 'Falha na sincronização';
    $('#content').innerHTML = '<section class="panel"><h2>Não foi possível carregar seus registros.</h2><p class="error" id="load-error"></p><button class="primary" data-action="reload">Tentar novamente</button></section>';
    $('#load-error').textContent = errorMessage(error);
  }
}
async function activateSession(session) {
  if (session?.user?.id !== CONFIG.ownerId) {
    if (session) { await client.auth.signOut({ scope: 'local' }); $('#login-error').textContent = 'Esta conta não está autorizada a usar este aplicativo.'; }
    state.user = null; state.loaded = false; state.bets = []; state.favorites = []; state.numbers = []; state.page = 'overview'; state.settings = { monthly_budget: 0, theme: 'system' }; loadGeneration++;
    $('#app').hidden = true; $('#content').replaceChildren(); $('#login-screen').hidden = false; $('#editor').close(); $('#results-dialog').close(); closeHistory(); cancelSuggestions(false); suggestionState.result=null; suggestionState.budget=''; $('#password').value = ''; applyTheme();
    return;
  }
  if (state.user?.id === session.user.id && state.loaded) return;
  state.user = session.user;
  $('#login-screen').hidden = true; $('#app').hidden = false;
  render(); await loadData();
}
function setGame(game) { if (!GAMES[game]) return; state.game = game; state.numbers = []; state.quantity = GAMES[game].min; state.page = 'builder'; render(); }
function useFavorite(id, register = false) {
  const f = state.favorites.find(f => f.id === id); if (!f) return;
  state.game = f.game; state.numbers = [...f.numbers]; state.quantity = f.numbers.length;
  if (register) openEditor('bet'); else navigate('builder');
}
function openEditor(type, record = null) {
  const game = record?.game || state.game;
  const numbers = record?.numbers || state.numbers;
  if (!validateNumbers(game, numbers)) { toast('Selecione uma combinação válida.'); return; }
  editorContext = { type, record, game, numbers: [...numbers].sort((a, b) => a - b) };
  $('#dialog-title').textContent = type === 'favorite' ? (record ? 'Editar favorito' : 'Salvar favorito') : (record ? 'Editar aposta' : 'Registrar aposta realizada');
  $('#dialog-eyebrow').textContent = GAMES[game].name;
  const notes = `<label>Observações<textarea name="notes" maxlength="2000">${esc(record?.notes || '')}</textarea></label>`;
  $('#editor-fields').innerHTML = balls(game, numbers) + (type === 'favorite'
    ? `<label>Nome da combinação<input name="name" maxlength="100" placeholder="Ex.: Meu jogo de sábado" value="${esc(record?.name || '')}"></label>${notes}`
    : `<div class="fields-row"><label>Concurso<input name="contest" type="number" min="1" max="2147483647" step="1" value="${record?.contest || ''}" required></label><label>Data da aposta<input name="bet_date" type="date" value="${record?.bet_date || localDate()}" required></label></div><div class="fields-row"><label>Valor apostado (R$)<input name="cost" type="number" min="0.01" max="9999999999.99" step="0.01" value="${record?.cost ?? ''}" required></label><label>Prêmio recebido (R$)<input name="prize_received" type="number" min="0" max="999999999999.99" step="0.01" value="${record?.prize_received ?? ''}" placeholder="Opcional"></label></div>${notes}<p class="fine">Somente registro pessoal. O app não envia apostas para a Caixa.</p>`);
  $('#editor-error').textContent = ''; $('#editor-save').disabled = false; $('#editor').showModal();
}
async function saveEditor(event) {
  event.preventDefault(); if (mutationPending || !editorContext || !state.user) return;
  const current = editorContext;
  const form = new FormData(event.target);
  const payload = { user_id: state.user.id, game: current.game, numbers: current.numbers, notes: String(form.get('notes') || '').trim() };
  if (current.type === 'favorite') {
    payload.name = String(form.get('name') || '').trim();
    const duplicate = state.favorites.find(f => f.id !== current.record?.id && f.game === payload.game && [...f.numbers].sort((a,b) => a-b).join(',') === payload.numbers.join(','));
    if (duplicate) { $('#editor-error').textContent = 'Essa combinação já está nos seus favoritos.'; return; }
  } else {
    payload.contest = Number(form.get('contest')); payload.bet_date = form.get('bet_date'); payload.cost = Number(form.get('cost'));
    payload.prize_received = form.get('prize_received') === '' ? null : Number(form.get('prize_received'));
    if (!Number.isInteger(payload.contest) || payload.contest < 1 || !(payload.cost > 0) || !payload.bet_date) { $('#editor-error').textContent = 'Confira concurso, data e valor da aposta.'; return; }
    const duplicate = state.bets.find(b => b.id !== current.record?.id && b.game === payload.game && b.contest === payload.contest && [...b.numbers].sort((a,b) => a-b).join(',') === payload.numbers.join(','));
    if (duplicate && !confirm('Esta combinação já está registrada nesse concurso. Você realmente fez outra aposta igual?')) return;
  }
  mutationPending = true; $('#editor-save').disabled = true;
  try {
    const table = current.type === 'favorite' ? 'favorites' : 'bets';
    const query = current.record ? client.from(table).update(payload).eq('id', current.record.id) : client.from(table).insert(payload);
    const { error } = await query.select().single(); if (error) throw error;
    $('#editor').close(); toast('Registro salvo na sua conta.'); state.page = current.type === 'favorite' ? 'favorites' : 'bets'; await loadData();
  } catch (error) { $('#editor-error').textContent = errorMessage(error); }
  finally { mutationPending = false; $('#editor-save').disabled = false; }
}
async function deleteRecord(table, id) {
  if (mutationPending || !confirm('Excluir este registro? Essa ação será sincronizada com sua conta.')) return;
  mutationPending = true;
  try { const { error } = await client.from(table).delete().eq('id', id).select().single(); if (error) throw error; toast('Registro excluído.'); await loadData(); }
  catch (error) { toast(errorMessage(error)); }
  finally { mutationPending = false; }
}
function exportRecords() {
  const data = { format: 'loteria-assistente', version: 1, exported_at: new Date().toISOString(), favorites: state.favorites, bets: state.bets, settings: state.settings };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `loteria-assistente-${localDate()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function logout() {
  if (!client || mutationPending) return;
  const { error } = await client.auth.signOut({ scope: 'local' }); if (error) { toast(errorMessage(error)); return; }
  await activateSession(null);
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); if (signingIn || !client) return;
  signingIn = true; const button = event.target.querySelector('button'); button.disabled = true; $('#login-error').textContent = '';
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
    if (error) throw error;
    $('#password').value = ''; await activateSession(data.session);
  } catch (error) { $('#login-error').textContent = errorMessage(error); }
  finally { signingIn = false; button.disabled = false; }
});
$('#editor-form').addEventListener('submit', saveEditor);
$('#close-editor').addEventListener('click', () => { if (!mutationPending) $('#editor').close(); });
$('#editor').addEventListener('cancel', event => { if (mutationPending) event.preventDefault(); });
$('#logout').addEventListener('click', logout);
document.addEventListener('change', event => {
  if (event.target.id === 'history-scope') { historyState.scope = event.target.value; historyState.limit = 40; if (historyState.data) historyState.result = checkCombination(historyState.data, historyState.game, historyState.numbers, historyState.scope); renderHistory(); }
  if (event.target.id === 'history-filter') { historyState.filter = event.target.value; historyState.limit = 40; renderHistory(); }
  if (event.target.id === 'quantity') {
    const g = GAMES[state.game], value = Number(event.target.value);
    if (!Number.isInteger(value) || value < g.min || value > g.max) { toast(`Escolha uma quantidade de ${g.min} a ${g.max}.`); event.target.value = state.quantity; } else state.quantity = value;
  }
  if (event.target.id === 'game-filter') { state.filter = event.target.value; render(); }
});
document.addEventListener('submit', async event => {
  if(event.target.id==='suggestion-form'){event.preventDefault();void runSuggestions(new FormData(event.target));return;}
  if (event.target.id !== 'settings-form') return;
  event.preventDefault(); if (mutationPending) return;
  mutationPending = true; const button = event.target.querySelector('button'); button.disabled = true;
  const form = new FormData(event.target);
  try {
    const { data, error } = await client.from('settings').upsert({ user_id: state.user.id, monthly_budget: Number(form.get('budget')), theme: form.get('theme') }).select().single();
    if (error) throw error; state.settings = data; render(); toast('Preferências salvas.');
  } catch (error) { toast(errorMessage(error)); }
  finally { mutationPending = false; button.disabled = false; }
});
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  const d = button.dataset;
  if (d.page) navigate(d.page);
  if (d.build) setGame(d.build);
  if (d.results) openResults(d.results);
  if (d.game) setGame(d.game);
  if(d.suggestGame && GAMES[d.suggestGame] && !suggestionState.busy){suggestionState.game=d.suggestGame;suggestionState.price=(SIMPLE_PRICES[d.suggestGame]/100).toFixed(2);suggestionState.contest='';suggestionState.result=null;suggestionState.error=null;render();}
  if(d.saveSuggestion!==undefined)useSuggestion(Number(d.saveSuggestion),'save');
  if(d.checkSuggestion!==undefined)useSuggestion(Number(d.checkSuggestion),'check');
  if(d.useSuggestion!==undefined)useSuggestion(Number(d.useSuggestion),'use');
  if (d.number !== undefined) {
    const n = Number(d.number), g = GAMES[state.game];
    if (state.numbers.includes(n)) state.numbers = state.numbers.filter(v => v !== n);
    else if (state.numbers.length < g.max) state.numbers.push(n);
    else { toast(`Você pode selecionar no máximo ${g.max} números.`); return; }
    state.numbers.sort((a,b) => a-b); render();
    $(`[data-number="${n}"]`)?.focus({ preventScroll: true });
  }
  if (d.use) useFavorite(d.use);
  if (d.checkFavorite) { const f = state.favorites.find(f => f.id === d.checkFavorite); if (f) openHistory(f.game, f.numbers); }
  if (d.hit !== undefined) { historyState.filter = d.hit; historyState.limit = 40; renderHistory(); }
  if (d.betFavorite) useFavorite(d.betFavorite, true);
  if (d.editFavorite) openEditor('favorite', state.favorites.find(f => f.id === d.editFavorite));
  if (d.editBet) openEditor('bet', state.bets.find(b => b.id === d.editBet));
  if (d.deleteFavorite) void deleteRecord('favorites', d.deleteFavorite);
  if (d.deleteBet) void deleteRecord('bets', d.deleteBet);
  const actions = { 'cancel-suggestions': () => cancelSuggestions(), 'export-suggestions': exportSuggestions, 'check-history': () => openHistory(state.game, state.numbers), 'refresh-history': () => void runHistory(), 'more-history': () => { historyState.limit += 40; renderHistory(); }, generate: () => { state.numbers = generateNumbers(state.game, state.quantity); render(); }, clear: () => { state.numbers = []; render(); }, favorite: () => openEditor('favorite'), bet: () => openEditor('bet'), export: exportRecords, 'refresh-results': () => void refreshResults(), logout: () => void logout(), reload: () => void loadData() };
  if (d.action) actions[d.action]?.();
});
document.addEventListener('input',event=>{const key=event.target.dataset?.suggestInput;if(['budget','price','contest'].includes(key)){suggestionState[key]=event.target.value;suggestionState.result=null;suggestionState.error=null;$('#suggestions-output')?.replaceChildren();if($('#suggestion-error'))$('#suggestion-error').textContent='';}});
window.addEventListener('online', () => { if (state.user && !mutationPending) { void loadData(); void refreshResults(); } });
window.addEventListener('offline', () => { $('#sync-status').textContent = 'Sem conexão'; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.user && !$('#editor').open && !mutationPending) { void loadData(); if (Date.now() - resultsState.lastAttempt > 300000) void refreshResults(); } });

try {
  if (!globalThis.supabase?.createClient) throw new Error('Não foi possível carregar o cliente de conexão. Atualize a página.');
  client = globalThis.supabase.createClient(CONFIG.url, CONFIG.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') setTimeout(() => { void activateSession(session); }, 0);
  });
  const { data, error } = await client.auth.getSession(); if (error) throw error;
  await activateSession(data.session);
} catch (error) { $('#login-error').textContent = errorMessage(error); }
