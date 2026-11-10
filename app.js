import { CONFIG } from './config.js';
import { GAMES, validateNumbers, jackpotOdds, generateNumbers, localDate, weekBounds, money, dateLabel, escapeHTML as esc, financialSummary } from './core.js';

const $ = s => document.querySelector(s);
const state = { user: null, favorites: [], bets: [], settings: { monthly_budget: 0, theme: 'system' }, page: 'overview', game: 'megasena', numbers: [], quantity: 6, filter: '', loaded: false };
const navigation = [ ['overview', '◫', 'Visão geral'], ['builder', '⊕', 'Montar jogo'], ['favorites', '♡', 'Favoritos'], ['bets', '▤', 'Minhas apostas'], ['settings', '⚙', 'Ajustes'] ];
let client, editorContext, toastTimer, loadGeneration = 0, signingIn = false, mutationPending = false;
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
function navigate(page) { state.page = page; state.filter = ''; render(); window.scrollTo({ top: 0 }); }
function renderNavigation() {
  $('#navigation').innerHTML = navigation.map(([key, icon, title]) => `<button class="nav-item ${state.page === key ? 'active' : ''}" data-page="${key}" ${state.page === key ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${title}</span></button>`).join('');
  $('#page-title').textContent = navigation.find(n => n[0] === state.page)[2];
}
function render() {
  if (!state.user) return;
  renderNavigation();
  if (!state.loaded) { $('#content').innerHTML = '<div class="loading" role="status">Carregando seus registros…</div>'; return; }
  const pages = { overview, builder, favorites, bets, settings };
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
    <div class="notice"><strong>Primeira etapa: seus registros pessoais.</strong> Resultados, premiações e conferência histórica ainda não estão conectados. Nenhum valor de sorteio é simulado.</div>
    <section class="game-cards">${Object.entries(GAMES).map(([game, g]) => `<article class="game-card" style="${gameStyle(game)}"><div class="game-name"><span class="game-dot" aria-hidden="true">✣</span>${g.name}</div><p class="game-state">Resultados e rateio<br><strong>Integração pendente</strong></p><button class="small-button" data-build="${game}">Montar meu jogo ↗</button></article>`).join('')}</section>`;
}
function builder() {
  const g = GAMES[state.game];
  const valid = validateNumbers(state.game, state.numbers);
  const odds = valid ? jackpotOdds(state.game, state.numbers.length) : null;
  return `<div class="game-tabs" role="group" aria-label="Modalidade">${Object.entries(GAMES).map(([key, item]) => `<button class="game-tab ${state.game === key ? 'active' : ''}" style="${gameStyle(key)}" data-game="${key}" aria-pressed="${state.game === key}">${item.name}</button>`).join('')}</div>
    <div class="builder-layout" style="${gameStyle(state.game)}"><section class="panel"><div class="builder-top"><div><h2>${g.name}</h2><span class="muted">${g.min === g.max ? `Selecione ${g.min} números` : `Selecione de ${g.min} a ${g.max} números`} entre ${formatNumber(g.first)} e ${g.last}.</span></div><label class="quantity-label">Gerar quantos?<input id="quantity" type="number" min="${g.min}" max="${g.max}" value="${state.quantity}" ${g.min === g.max ? 'readonly' : ''}></label></div><div class="number-grid" role="group" aria-label="Escolha os números">${Array.from({ length: g.last - g.first + 1 }, (_, i) => i + g.first).map(n => `<button class="number ${state.numbers.includes(n) ? 'selected' : ''}" data-number="${n}" aria-pressed="${state.numbers.includes(n)}" aria-label="Número ${formatNumber(n)}">${formatNumber(n)}</button>`).join('')}</div><div class="builder-controls"><button class="secondary" data-action="generate">⤨ Gerar aleatórios</button><button class="secondary" data-action="clear">Limpar</button></div></section>
    <section class="panel summary-panel"><span class="eyebrow">SUA COMBINAÇÃO</span><h2 style="margin-top:12px">Um jogo do seu jeito.</h2><span class="selected-count">${state.numbers.length} números selecionados</span>${state.numbers.length ? balls(state.game, state.numbers) : '<p class="selection-empty">Toque nos números ao lado ou gere uma combinação aleatória.</p>'}<div class="odds"><span class="muted">Chance do prêmio principal${state.game === 'duplasena' ? ' por sorteio' : ''}</span><strong>${odds ? `1 em ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(odds)}` : 'Selecione um jogo válido'}</strong><span class="fine">${state.game === 'lotomania' ? 'Probabilidade de acertar os 20 números.' : `Probabilidade de acertar ${g.drawn} números.`} Sorteios independentes; o histórico não altera essa chance.</span></div><div class="action-stack"><button class="primary" data-action="favorite" ${valid ? '' : 'disabled'}>♡ Salvar favorito</button><button class="secondary" data-action="bet" ${valid ? '' : 'disabled'}>Registrar aposta realizada</button></div><p class="fine" style="margin-top:16px;margin-bottom:0">Gerador aleatório, sem previsão. Registrar aqui não realiza uma aposta na Caixa.</p></section></div>`;
}
function filterHeader(title, count) { return `<div class="section-heading"><div><h2>${title}</h2><p>${count} registro${count === 1 ? '' : 's'} na sua conta</p></div><select class="filter-select" id="game-filter" aria-label="Filtrar modalidade"><option value="">Todas as modalidades</option>${gameOptions(state.filter)}</select></div>`; }
function empty(title, description) { return `<div class="empty"><span class="empty-symbol" aria-hidden="true">✣</span><h3>${title}</h3><p>${description}</p><button class="primary" data-page="builder">Montar meu jogo ↗</button></div>`; }
function favorites() {
  const rows = state.favorites.filter(f => !state.filter || f.game === state.filter);
  return filterHeader('Suas combinações favoritas', rows.length) + (rows.length ? `<div class="record-list">${rows.map(f => `<article class="record" style="${gameStyle(f.game)}"><div class="record-heading"><div><h3>${esc(f.name || GAMES[f.game].name)}</h3><span class="muted">${GAMES[f.game].name} • salvo em ${dateLabel(localDate(new Date(f.created_at)))}</span></div><span class="game-name" aria-hidden="true">♡</span></div>${balls(f.game, f.numbers)}${f.notes ? `<p class="record-notes">${esc(f.notes)}</p>` : ''}<div class="record-actions"><button class="small-button" data-use="${f.id}">Usar combinação</button><button class="small-button" data-bet-favorite="${f.id}">Registrar aposta</button><button class="small-button" data-edit-favorite="${f.id}">Editar nome</button><button class="small-button" data-delete-favorite="${f.id}">Excluir</button></div></article>`).join('')}</div>` : empty('Seus favoritos começam aqui.', 'Salve uma combinação para encontrá-la novamente no computador e no celular.'));
}
function bets() {
  const rows = state.bets.filter(b => !state.filter || b.game === state.filter);
  return filterHeader('Seu histórico de apostas', rows.length) + '<div class="notice">Registre somente jogos que você já apostou. A conferência automática será integrada na próxima etapa. Os prêmios abaixo são informados manualmente.</div>' + (rows.length ? `<div class="record-list">${rows.map(b => `<article class="record" style="${gameStyle(b.game)}"><div class="record-heading"><div><h3>${GAMES[b.game].name} · Concurso ${b.contest}</h3><span class="muted">Aposta em ${dateLabel(b.bet_date)}</span></div><span class="pill">${b.prize_received === null ? 'SEM PRÊMIO INFORMADO' : 'VALOR INFORMADO'}</span></div>${balls(b.game, b.numbers)}<div class="prize-data"><div><span class="muted">Valor apostado</span><strong>${money(b.cost)}</strong></div><div><span class="muted">Prêmio informado</span><strong>${b.prize_received === null ? '—' : money(b.prize_received)}</strong></div></div>${b.notes ? `<p class="record-notes" style="margin-top:14px">${esc(b.notes)}</p>` : ''}<div class="record-actions"><button class="small-button" data-edit-bet="${b.id}">Editar registro</button><button class="small-button" data-delete-bet="${b.id}">Excluir</button></div></article>`).join('')}</div>` : empty('Suas apostas, sem perder o controle.', 'Monte um jogo ou abra um favorito e selecione “Registrar aposta” depois de jogar na Caixa.'));
}
function settings() {
  return `<div class="settings-grid"><section class="panel"><h2>Seu planejamento</h2><p>Defina um limite mensal para acompanhar seus gastos.</p><form id="settings-form"><label>Orçamento mensal (R$)<input name="budget" type="number" min="0" max="9999999999.99" step="0.01" value="${state.settings.monthly_budget}" required></label><label>Aparência<select name="theme"><option value="system" ${state.settings.theme === 'system' ? 'selected' : ''}>Acompanhar o dispositivo</option><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Clara</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Escura</option></select></label><button type="submit" class="primary">Salvar preferências</button></form></section><section class="panel"><h2>Seus dados, com você.</h2><p>Favoritos e apostas ficam vinculados à sua conta. Exporte uma cópia em JSON quando quiser.</p><button class="secondary" data-action="export">↓ Exportar meus registros</button><hr style="border:0;border-top:1px solid var(--border);margin:25px 0"><span class="eyebrow">CONTA CONECTADA</span><p class="account-address" style="margin-top:12px">${esc(state.user.email)}</p><button class="secondary" data-action="logout">Sair da conta ↗</button><p class="fine" style="margin-top:20px">Versão 0.1 • Organização pessoal. Integração dos resultados pendente.</p></section></div>`;
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
    $('#app').hidden = true; $('#content').replaceChildren(); $('#login-screen').hidden = false; $('#editor').close(); $('#password').value = ''; applyTheme();
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
  if (event.target.id === 'quantity') {
    const g = GAMES[state.game], value = Number(event.target.value);
    if (!Number.isInteger(value) || value < g.min || value > g.max) { toast(`Escolha uma quantidade de ${g.min} a ${g.max}.`); event.target.value = state.quantity; } else state.quantity = value;
  }
  if (event.target.id === 'game-filter') { state.filter = event.target.value; render(); }
});
document.addEventListener('submit', async event => {
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
  if (d.game) setGame(d.game);
  if (d.number !== undefined) {
    const n = Number(d.number), g = GAMES[state.game];
    if (state.numbers.includes(n)) state.numbers = state.numbers.filter(v => v !== n);
    else if (state.numbers.length < g.max) state.numbers.push(n);
    else { toast(`Você pode selecionar no máximo ${g.max} números.`); return; }
    state.numbers.sort((a,b) => a-b); render();
    $(`[data-number="${n}"]`)?.focus({ preventScroll: true });
  }
  if (d.use) useFavorite(d.use);
  if (d.betFavorite) useFavorite(d.betFavorite, true);
  if (d.editFavorite) openEditor('favorite', state.favorites.find(f => f.id === d.editFavorite));
  if (d.editBet) openEditor('bet', state.bets.find(b => b.id === d.editBet));
  if (d.deleteFavorite) void deleteRecord('favorites', d.deleteFavorite);
  if (d.deleteBet) void deleteRecord('bets', d.deleteBet);
  const actions = { generate: () => { state.numbers = generateNumbers(state.game, state.quantity); render(); }, clear: () => { state.numbers = []; render(); }, favorite: () => openEditor('favorite'), bet: () => openEditor('bet'), export: exportRecords, logout: () => void logout(), reload: () => void loadData() };
  if (d.action) actions[d.action]?.();
});
window.addEventListener('online', () => { if (state.user && !mutationPending) void loadData(); });
window.addEventListener('offline', () => { $('#sync-status').textContent = 'Sem conexão'; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.user && !$('#editor').open && !mutationPending) void loadData(); });

try {
  if (!globalThis.supabase?.createClient) throw new Error('Não foi possível carregar o cliente de conexão. Atualize a página.');
  client = globalThis.supabase.createClient(CONFIG.url, CONFIG.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') setTimeout(() => { void activateSession(session); }, 0);
  });
  const { data, error } = await client.auth.getSession(); if (error) throw error;
  await activateSession(data.session);
} catch (error) { $('#login-error').textContent = errorMessage(error); }
