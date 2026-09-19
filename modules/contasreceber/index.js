/**
 * Módulo: Contas a Receber & Operações Financeiras
 * Títulos, antecipação/borderô, carteira, parceiros, políticas de vencimento e BI.
 * Carregado sob demanda por js/router.js na primeira vez em que a tela abre.
 */

const CR = {
  // Cole aqui a URL /exec do apps-script/contas-receber.gs depois de publicar.
  API: 'https://script.google.com/macros/s/AKfycbxX2WqtUFZdsZx3CwrFRN7QDr4ygsYWLi9rSJynobXJai0zUAo8MB_5cl5VF745ZQo8/exec',

  titulos: [], parceiros: [], politicas: [], operacoes: [], antecipacoesOS: [],
  osPendentes: [],          // vem do dados.json (mesmo export do Kanban)
  osGeradoEm: '',
  filaSync: { total: 0, novas: 0, gerado_em: '' },

  competencia: '',          // 'YYYY-MM'
  hoje: '',                 // 'YYYY-MM-DD'
  charts: {},
  aba: 'dash',

  selecao: {},              // aba Títulos — id → true
  selCarteira: {},          // carteira antecipada — id → true
  selAntTit: {},            // montagem do borderô — id do título → true
  selAntOS: {},             // montagem do borderô — num_os → true
  vencAjustado: {},         // montagem do borderô — id do título → vencimento corrigido
  simulacao: null,

  editando: null,
  baixaAlvo: null,          // { ids:[], origem:'titulos'|'carteira' }
  opAberta: null,
  parceiroEditando: null,
  politicaEditando: null,
  drill: null,              // { tipo, valor, rotulo }
  sync: { notas: [], marcadas: {}, existentes: {} },
  carregado: false
};

/**
 * Situação de antecipação, em cores. A mesma escala vale em toda tabela do
 * módulo, e é o que permite ler uma linha sem legenda:
 *   livre       → verde  · o recebível ainda é da empresa
 *   antecipado  → roxo   · já foi vendido a um parceiro
 *   risco       → vermelho · antecipado, vencido e não pago (coobrigação viva)
 *   recompra    → cinza  · a empresa devolveu o dinheiro ao parceiro
 */
const CR_SIT = {
  livre:      { nome: 'Livre',      cor: '#059669', pill: 'cr-pill-livre' },
  antecipado: { nome: 'Antecipado', cor: '#7c3aed', pill: 'cr-pill-ant' },
  risco:      { nome: 'Em risco',   cor: '#dc2626', pill: 'cr-pill-risco' },
  recompra:   { nome: 'Recomprado', cor: '#64748b', pill: 'cr-pill-recompra' }
};

const CR_CORES = ['#7c3aed', '#059669', '#0284c7', '#d97706', '#db2777', '#0891b2', '#65a30d', '#dc2626'];

const CR_URL_DADOS = 'https://raw.githubusercontent.com/pemarostega-debug/renovatruck_portal/main/dados.json';

// ── Utilitários ──────────────────────────────────────────────────────────────
const crEsc = s => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const crBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const crBRLc = v => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000000) return 'R$ ' + (n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return crBRL(n);
};

/** 'YYYY-MM-DD' → 'DD/MM'. Sem new Date(): o fuso rouba um dia. */
const crData = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
};
const crDataLonga = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
};

/** Diferença em dias entre duas datas ISO, sem passar por Date/fuso. */
function crDias(de, ate) {
  if (!de || !ate) return 0;
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

function crHojeISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function crSomaDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Aceita "1.234,56" e "1234.56". */
function crNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[R$\s%]/g, '');
  if (!s) return 0;
  const tv = s.includes(','), tp = s.includes('.');
  if (tv && tp) s = s.replace(/\./g, '').replace(',', '.');
  else if (tv) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function crAviso(msg, tipo) {
  const el = document.getElementById('cr-notice');
  if (!msg) { el.className = 'cr-notice'; el.innerHTML = ''; return; }
  el.className = 'cr-notice ' + (tipo || 'info');
  el.innerHTML = msg;
  if (tipo === 'ok') setTimeout(() => { if (el.className.includes('ok')) crAviso(''); }, 5000);
}

function crFechar(id) { document.getElementById(id).classList.remove('open'); }
function crAbrir(id) { document.getElementById(id).classList.add('open'); }

const crPodeEditar = () => typeof rvPodeEditar === 'function' ? rvPodeEditar() : true;

// ── Comunicação com o Apps Script ────────────────────────────────────────────
async function crGet(action, params) {
  const q = new URLSearchParams(Object.assign({ action: action }, params || {}));
  const r = await fetch(CR.API + '?' + q.toString());
  const d = await r.json();
  if (!d.success) throw new Error(d.error || 'Falha ao consultar o servidor.');
  return d.data;
}

async function crPost(action, corpo) {
  const r = await fetch(CR.API, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action, token: (typeof RV !== 'undefined' ? RV.token : null) }, corpo || {}))
  });
  const d = await r.json();
  if (!d.success) throw new Error(d.error || 'Falha ao gravar.');
  return d.data;
}

// ── Leituras derivadas ───────────────────────────────────────────────────────
const crEmAberto  = t => t.status === 'ABERTO' || t.status === 'PARCIAL';
const crSaldo     = t => Math.max((Number(t.valor_total) || 0) - (Number(t.valor_recebido) || 0), 0);
const crVencido   = t => crEmAberto(t) && !!t.data_vencimento && t.data_vencimento < CR.hoje;

/**
 * "Antecipado" aqui quer dizer *ainda em poder do parceiro*. Recomprado sai da
 * conta: o título voltou para a empresa, mesmo continuando em aberto contra o
 * cliente. Somar recomprado como exposição inflaria o risco de coobrigação com
 * dívida que já foi paga ao fundo.
 */
const crAntecipado = t => String(t.antecipado).toUpperCase() === 'SIM' && t.situacao_antec !== 'RECOMPRADO';
const crEmRisco    = t => crAntecipado(t) && crVencido(t);

function crSituacao(t) {
  if (String(t.antecipado).toUpperCase() !== 'SIM') return 'livre';
  if (t.situacao_antec === 'RECOMPRADO') return 'recompra';
  if (crVencido(t)) return 'risco';
  return 'antecipado';
}

/** Mês do título pelo vencimento — é o eixo do caixa, que é o que importa aqui. */
const crMesDe = t => String(t.data_vencimento || '').slice(0, 7);
const crDoMes = t => crMesDe(t) === CR.competencia;
const crAtivos = () => CR.titulos.filter(t => t.status !== 'CANCELADO');

/** Política de um cliente, ou o padrão da casa quando não há cadastro. */
function crPolitica(codCliente) {
  const p = CR.politicas.filter(x => String(x.cliente_cod) === String(codCliente) && x.ativo)[0];
  if (p) return p;
  // Padrão conservador: duplicata emitida pode; OS sem pedido, não. Antecipar
  // recebível que ainda não existe exige conhecer o comportamento do cliente.
  return { cliente_cod: String(codCliente || ''), cliente: '', permite_os: false,
           pct_max_os: 100, dias_ate_faturar: 30, dias_prazo_venc: 30, teto_exposicao: 0, padrao: true };
}

const crParceiro = id => CR.parceiros.filter(p => p.id === id)[0] || null;

// ── Ponto de entrada ─────────────────────────────────────────────────────────
function initContasReceber() {
  if (!CR.competencia) {
    CR.hoje = crHojeISO();
    CR.competencia = CR.hoje.slice(0, 7);
    document.getElementById('cr-competencia').value = CR.competencia;
    document.getElementById('cr-a-data').value = CR.hoje;
  }
  if (!CR.carregado) crCarregar();
}

async function crCarregar(forcar) {
  if (CR.API.startsWith('COLE_AQUI')) {
    crAviso('<b>Backend não conectado.</b> Publique o <code>apps-script/contas-receber.gs</code> e cole a URL /exec em <code>CR.API</code>, aqui no index.html.', 'erro');
    return;
  }
  crAviso('Carregando contas a receber…', 'info');
  try {
    // As OSs vêm do mesmo dados.json que o Kanban já usa; falhar nelas não pode
    // derrubar o módulo inteiro, então vai em Promise separada com catch.
    const [d] = await Promise.all([
      crGet('bootstrap'),
      crCarregarOS().catch(e => console.warn('Contas a Receber: dados.json indisponível', e))
    ]);
    CR.titulos = d.titulos || [];
    CR.parceiros = d.parceiros || [];
    CR.politicas = d.politicas || [];
    CR.operacoes = d.operacoes || [];
    CR.antecipacoesOS = d.antecipacoes_os || [];
    CR.filaSync = d.fila_sync || { total: 0, novas: 0 };
    CR.hoje = d.hoje || crHojeISO();
    CR.carregado = true;
    CR.selecao = {}; CR.selCarteira = {};
    crPreencherSelects();
    crRender();

    let msg = '';
    if (CR.filaSync.novas > 0) {
      msg = '<b>' + CR.filaSync.novas + ' nota(s) do Genesis</b> esperando aprovação. ' +
            '<a href="#" onclick="crAbrirSync();return false;" style="color:inherit;text-decoration:underline;">Revisar agora</a>.';
      crAviso(msg, 'aviso');
    } else {
      crAviso(forcar ? 'Dados atualizados.' : '', forcar ? 'ok' : '');
    }
  } catch (e) {
    crAviso('<b>Não consegui carregar.</b> ' + crEsc(e.message), 'erro');
  }
}

/** OSs em AGUARDANDO PEDIDO, do export periódico do Genesis. */
async function crCarregarOS() {
  const r = await fetch(CR_URL_DADOS + '?t=' + Date.now());
  const p = await r.json();
  CR.osGeradoEm = p.gerado_em || '';
  CR.osPendentes = (p.ordens || [])
    .filter(o => String(o.descricao_fase || '').trim().toUpperCase() === 'AGUARDANDO PEDIDO'
                 && String(o.cancelada || '') !== 'Sim')
    .map(o => ({
      num_os: String(o.numero_os),
      cliente: String(o.razao_cliente || '').trim(),
      cliente_cod: String(o.codigo_cliente || ''),
      valor: Number(o.valor_total) || 0,
      data_geracao: String(o.data_geracao || '').slice(0, 10)
    }));
  // Histórico OS → faturamento, usado pelo botão "sugerir pelo histórico" da
  // política: mede quantos dias cada cliente costuma levar da abertura da OS
  // até o encerramento com nota.
  CR.histFaturamento = {};
  (p.ordens || []).forEach(o => {
    if (String(o.descricao_fase || '').trim().toUpperCase() !== 'FATURADO C/ NF') return;
    const ini = String(o.data_geracao || '').slice(0, 10);
    const fim = String(o.data_encerramento || o.data || '').slice(0, 10);
    if (!ini || !fim || fim < ini) return;
    const cod = String(o.codigo_cliente || '');
    (CR.histFaturamento[cod] = CR.histFaturamento[cod] || []).push(crDias(ini, fim));
  });
}

function crTrocarMes() {
  CR.competencia = document.getElementById('cr-competencia').value || CR.hoje.slice(0, 7);
  CR.drill = null;
  crRender();
}

/**
 * Atalho da home. "Operações Financeiras" tem cartão próprio no menu porque é
 * assim que a Diretoria pensa nele, mas é a mesma tela: separar os dois
 * produziria dois números de "a receber" que nunca fecham entre si.
 */
function crIrPara(aba) {
  openModule('contasreceber');
  crAba(aba);
}

function crAba(qual) {
  CR.aba = qual;
  ['dash', 'titulos', 'antecipar', 'operacoes', 'bi', 'cadastros'].forEach(a => {
    document.getElementById('cr-tab-' + a).classList.toggle('active', a === qual);
    document.getElementById('cr-pane-' + a).classList.toggle('active', a === qual);
  });
  crRender();
  window.scrollTo(0, 0);
}

function crRender() {
  crAtualizarBadgeRisco();
  if (CR.aba === 'dash')           crRenderDash();
  else if (CR.aba === 'titulos')   crRenderTitulos();
  else if (CR.aba === 'antecipar') crRenderAntecipar();
  else if (CR.aba === 'operacoes') { crRenderOperacoes(); crRenderCarteira(); }
  else if (CR.aba === 'bi')        crRenderBI();
  else if (CR.aba === 'cadastros') { crRenderParceiros(); crRenderPoliticas(); }
}

function crAtualizarBadgeRisco() {
  const n = crAtivos().filter(crEmRisco).length;
  const el = document.getElementById('cr-badge-risco');
  el.textContent = n;
  el.style.display = n ? 'inline-block' : 'none';
}

function crPreencherSelects() {
  // Clientes: união do que existe em título e do que está em OS pendente, para
  // a política poder ser cadastrada antes da primeira nota do cliente.
  const clientes = {};
  crAtivos().forEach(t => { if (t.cliente) clientes[t.cliente_cod || t.cliente] = t.cliente; });
  CR.osPendentes.forEach(o => { if (o.cliente) clientes[o.cliente_cod || o.cliente] = o.cliente; });
  const lista = Object.keys(clientes).map(k => ({ cod: k, nome: clientes[k] }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  ['cr-f-cliente', 'cr-a-cliente'].forEach(id => {
    const sel = document.getElementById(id);
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todos os clientes</option>' +
      lista.map(c => '<option value="' + crEsc(c.nome) + '">' + crEsc(c.nome) + '</option>').join('');
    sel.value = atual;
  });

  const selPol = document.getElementById('cr-pol-cliente');
  selPol.innerHTML = '<option value="">— escolha —</option>' +
    lista.map(c => '<option value="' + crEsc(c.cod) + '">' + crEsc(c.nome) + '</option>').join('');

  document.getElementById('cr-lista-cli').innerHTML =
    lista.map(c => '<option value="' + crEsc(c.nome) + '">').join('');

  const selParc = document.getElementById('cr-a-parceiro');
  const ativos = CR.parceiros.filter(p => p.ativo);
  selParc.innerHTML = ativos.length
    ? ativos.map(p => '<option value="' + p.id + '">' + crEsc(p.nome) +
        (p.taxa_mes ? ' — ' + p.taxa_mes.toLocaleString('pt-BR') + '% a.m.' : '') + '</option>').join('')
    : '<option value="">— cadastre um parceiro primeiro —</option>';

  const selCP = document.getElementById('cr-c-parceiro');
  const atualCP = selCP.value;
  selCP.innerHTML = '<option value="">Todos os parceiros</option>' +
    CR.parceiros.map(p => '<option value="' + p.id + '">' + crEsc(p.nome) + '</option>').join('');
  selCP.value = atualCP;
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

function crRenderDash() {
  const ativos = crAtivos();
  const doMes = ativos.filter(crDoMes);
  const vencidos = ativos.filter(crVencido);
  const emAberto = ativos.filter(crEmAberto);

  const previsto = doMes.reduce((s, t) => s + (Number(t.valor_total) || 0), 0);
  const recebido = doMes.reduce((s, t) => s + (Number(t.valor_recebido) || 0), 0);
  const aberto = doMes.filter(crEmAberto).reduce((s, t) => s + crSaldo(t), 0);
  const atraso = vencidos.reduce((s, t) => s + crSaldo(t), 0);

  document.getElementById('cr-k-previsto').textContent = crBRL(previsto);
  document.getElementById('cr-k-previsto-sub').textContent = doMes.length + ' título(s) vencendo';
  document.getElementById('cr-k-recebido').textContent = crBRL(recebido);
  document.getElementById('cr-k-recebido-sub').textContent =
    (previsto > 0 ? (recebido / previsto * 100).toFixed(0) + '% do previsto' : '—');
  document.getElementById('cr-k-barra').style.width =
    (previsto > 0 ? Math.min(recebido / previsto * 100, 100) : 0) + '%';
  document.getElementById('cr-k-aberto').textContent = crBRL(aberto);
  document.getElementById('cr-k-aberto-sub').textContent = doMes.filter(crEmAberto).length + ' título(s) a receber';
  document.getElementById('cr-k-atraso').textContent = crBRL(atraso);
  document.getElementById('cr-k-atraso-sub').textContent = vencidos.length + ' título(s) vencidos';

  crRenderPosse(emAberto);
  crRenderIndicadores(ativos, emAberto, doMes, vencidos, atraso);
  crChartEvolucao(ativos);
  crChartClientes(emAberto);
  crChartSemana(doMes);
  crRenderRegua(vencidos, atraso);
  crRenderTabelasDash(ativos, vencidos);
  crRenderDetalhe();
}

/** Quanto da carteira em aberto ainda é da empresa e quanto já é do parceiro. */
function crRenderPosse(emAberto) {
  const total = emAberto.reduce((s, t) => s + crSaldo(t), 0);
  const ant = emAberto.filter(crAntecipado).reduce((s, t) => s + crSaldo(t), 0);
  const risco = emAberto.filter(crEmRisco).reduce((s, t) => s + crSaldo(t), 0);
  const proprio = total - ant;
  const pctP = total > 0 ? proprio / total * 100 : 100;

  document.getElementById('cr-posse-total').textContent = crBRL(total) + ' em aberto';
  const barP = document.getElementById('cr-posse-p');
  const barA = document.getElementById('cr-posse-a');
  barP.style.width = pctP + '%';
  barA.style.width = (100 - pctP) + '%';
  // Só escreve o número dentro da barra quando há espaço: um "37%" cortado ao
  // meio é pior do que barra sem rótulo.
  barP.textContent = pctP >= 14 ? pctP.toFixed(0) + '%' : '';
  barA.textContent = (100 - pctP) >= 14 ? (100 - pctP).toFixed(0) + '%' : '';
  document.getElementById('cr-posse-p-txt').textContent = 'Próprio ' + crBRL(proprio);
  document.getElementById('cr-posse-a-txt').textContent = 'Antecipado ' + crBRL(ant);
  document.getElementById('cr-posse-r-txt').textContent = 'Em risco ' + crBRL(risco);
}

function crRenderIndicadores(ativos, emAberto, doMes, vencidos, atraso) {
  // PMR: média ponderada de (recebimento − emissão) nos títulos já recebidos.
  // Ponderar pelo valor é o que importa — um título de R$ 50 mil pago com 60
  // dias de atraso pesa muito mais no caixa do que dez de R$ 500 pagos em dia.
  let pesoDias = 0, peso = 0;
  ativos.forEach(t => {
    if (t.status !== 'RECEBIDO' || !t.data_recebimento || !t.data_emissao) return;
    const v = Number(t.valor_recebido) || 0;
    if (v <= 0) return;
    pesoDias += v * crDias(t.data_emissao, t.data_recebimento);
    peso += v;
  });
  document.getElementById('cr-i-dso').textContent = peso > 0 ? Math.round(pesoDias / peso) + ' d' : '—';

  // Prazo da carteira: dias que faltam, ponderados pelo saldo. Negativo quer
  // dizer que, na média, a carteira já venceu.
  let cDias = 0, cPeso = 0;
  emAberto.forEach(t => {
    const v = crSaldo(t);
    if (v <= 0 || !t.data_vencimento) return;
    cDias += v * crDias(CR.hoje, t.data_vencimento);
    cPeso += v;
  });
  const prazo = cPeso > 0 ? Math.round(cDias / cPeso) : null;
  const elPrazo = document.getElementById('cr-i-prazo');
  elPrazo.textContent = prazo === null ? '—' : prazo + ' d';
  elPrazo.style.color = prazo !== null && prazo < 0 ? 'var(--risco)' : '';

  const totalAberto = emAberto.reduce((s, t) => s + crSaldo(t), 0);
  const inad = totalAberto > 0 ? atraso / totalAberto * 100 : 0;
  const elInad = document.getElementById('cr-i-inad');
  elInad.textContent = totalAberto > 0 ? inad.toFixed(1) + '%' : '—';
  elInad.style.color = inad >= 20 ? 'var(--risco)' : inad >= 10 ? '#d97706' : '#16a34a';

  const porCli = {};
  emAberto.forEach(t => { porCli[t.cliente || '—'] = (porCli[t.cliente || '—'] || 0) + crSaldo(t); });
  const rank = Object.entries(porCli).sort((a, b) => b[1] - a[1]);
  const top5 = rank.slice(0, 5).reduce((s, r) => s + r[1], 0);
  const conc = totalAberto > 0 ? top5 / totalAberto * 100 : 0;
  const elConc = document.getElementById('cr-i-conc');
  elConc.textContent = totalAberto > 0 ? conc.toFixed(0) + '%' : '—';
  elConc.style.color = conc >= 70 ? 'var(--risco)' : conc >= 50 ? '#d97706' : '';
  document.getElementById('cr-i-conc-sub').textContent =
    rank.length ? 'de ' + rank.length + ' cliente(s) em aberto' : 'da carteira em aberto';

  const emitidos = ativos.filter(t => String(t.data_emissao || '').slice(0, 7) === CR.competencia);
  const totalEmit = emitidos.reduce((s, t) => s + (Number(t.valor_total) || 0), 0);
  document.getElementById('cr-i-ticket').textContent =
    emitidos.length ? crBRLc(totalEmit / emitidos.length) : '—';
}

function crDestruir(nome) {
  if (CR.charts[nome]) { CR.charts[nome].destroy(); delete CR.charts[nome]; }
}

/** Faturado (por emissão) x recebido (por data de recebimento), 6 meses. */
function crChartEvolucao(ativos) {
  const meses = [];
  const [ano, mes] = CR.competencia.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ano, mes - 1 - i, 1);
    meses.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  const fat = {}, rec = {};
  meses.forEach(m => { fat[m] = 0; rec[m] = 0; });
  ativos.forEach(t => {
    const me = String(t.data_emissao || '').slice(0, 7);
    if (me in fat) fat[me] += Number(t.valor_total) || 0;
    const mr = String(t.data_recebimento || '').slice(0, 7);
    if (mr in rec) rec[mr] += Number(t.valor_recebido) || 0;
  });

  crDestruir('evolucao');
  const ctx = document.getElementById('cr-c-evolucao');
  if (!ctx) return;
  const rot = meses.map(m => {
    const [a, b] = m.split('-');
    return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+b - 1] + '/' + a.slice(2);
  });
  CR.charts.evolucao = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rot,
      datasets: [
        { label: 'Faturado', data: meses.map(m => fat[m]), backgroundColor: '#059669', borderRadius: 5, maxBarThickness: 26 },
        { label: 'Recebido', data: meses.map(m => rec[m]), backgroundColor: '#a7f3d0', borderRadius: 5, maxBarThickness: 26 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, family: 'DM Sans' }, padding: 10 } },
        tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + crBRL(c.parsed.y) } }
      },
      scales: {
        y: { ticks: { callback: v => crBRLc(v), font: { size: 10, family: 'DM Sans' } }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false }, ticks: { font: { size: 10, family: 'DM Sans' } } }
      }
    }
  });
}

function crChartClientes(emAberto) {
  const por = {}, ant = {};
  emAberto.forEach(t => {
    const c = t.cliente || '(sem cliente)';
    por[c] = (por[c] || 0) + crSaldo(t);
    if (crAntecipado(t)) ant[c] = (ant[c] || 0) + crSaldo(t);
  });
  const ranking = Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = emAberto.reduce((s, t) => s + crSaldo(t), 0);
  const top5 = ranking.reduce((s, r) => s + r[1], 0);
  document.getElementById('cr-cli-conc').textContent =
    total > 0 ? (top5 / total * 100).toFixed(0) + '% da carteira' : '—';

  crDestruir('clientes');
  const ctx = document.getElementById('cr-c-clientes');
  if (!ctx || !ranking.length) return;

  // Duas séries empilhadas: o que ainda é nosso e o que já foi antecipado.
  // Ver o cliente concentrado É importante; ver que a concentração dele já foi
  // vendida ao fundo é ainda mais.
  CR.charts.clientes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ranking.map(r => r[0].length > 22 ? r[0].slice(0, 21) + '…' : r[0]),
      datasets: [
        { label: 'Próprio', data: ranking.map(r => r[1] - (ant[r[0]] || 0)), backgroundColor: '#059669', borderRadius: 4, maxBarThickness: 22, stack: 'a' },
        { label: 'Antecipado', data: ranking.map(r => ant[r[0]] || 0), backgroundColor: '#7c3aed', borderRadius: 4, maxBarThickness: 22, stack: 'a' }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      onClick: (evt, els) => { if (els.length) { const n = ranking[els[0].index][0]; crSelecionar('cliente', n, n); } },
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, family: 'DM Sans' }, padding: 10 } },
        tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + crBRL(c.parsed.x), title: c => ranking[c[0].dataIndex][0] } }
      },
      scales: {
        x: { stacked: true, ticks: { callback: v => crBRLc(v), font: { size: 10, family: 'DM Sans' } }, grid: { color: '#f1f5f9' } },
        y: { stacked: true, ticks: { font: { size: 10, family: 'DM Sans' } }, grid: { display: false } }
      }
    }
  });
}

/** Entradas previstas por semana do mês, separando o que já entrou. */
function crChartSemana(doMes) {
  const semana = d => Math.min(Math.floor((+d.slice(8, 10) - 1) / 7) + 1, 5);
  const prev = [0, 0, 0, 0, 0], receb = [0, 0, 0, 0, 0];
  doMes.forEach(t => {
    if (!t.data_vencimento) return;
    const s = semana(t.data_vencimento) - 1;
    prev[s] += crSaldo(t);
    receb[s] += Number(t.valor_recebido) || 0;
  });
  let acc = 0;
  const acumulado = prev.map((v, i) => (acc += v + receb[i]));
  const total = acumulado[4] || 0;
  document.getElementById('cr-semana-total').textContent = total > 0 ? crBRL(total) + ' no mês' : '—';

  crDestruir('semana');
  const ctx = document.getElementById('cr-c-semana');
  if (!ctx) return;
  CR.charts.semana = new Chart(ctx, {
    data: {
      labels: ['1ª sem', '2ª sem', '3ª sem', '4ª sem', '5ª sem'],
      datasets: [
        { type: 'bar', label: 'Recebido', data: receb, backgroundColor: '#16a34a', borderRadius: 4, maxBarThickness: 30, stack: 's', order: 2 },
        { type: 'bar', label: 'A receber', data: prev, backgroundColor: '#a7f3d0', borderRadius: 4, maxBarThickness: 30, stack: 's', order: 2 },
        { type: 'line', label: 'Acumulado', data: acumulado, borderColor: '#0284c7', backgroundColor: 'transparent',
          borderWidth: 2, tension: .3, pointRadius: 3, order: 1, yAxisID: 'y' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (evt, els) => { if (els.length) crSelecionar('semana', els[0].index + 1, (els[0].index + 1) + 'ª semana'); },
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, family: 'DM Sans' }, padding: 10 } },
        tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + crBRL(c.parsed.y) } }
      },
      scales: {
        y: { stacked: false, ticks: { callback: v => crBRLc(v), font: { size: 10, family: 'DM Sans' } }, grid: { color: '#f1f5f9' } },
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10, family: 'DM Sans' } } }
      }
    }
  });
}

function crRenderRegua(vencidos, atraso) {
  const faixas = [
    { nome: '1 a 15 dias', cls: 'cr-f1', min: 1, max: 15, v: 0, q: 0 },
    { nome: '16 a 30 dias', cls: 'cr-f2', min: 16, max: 30, v: 0, q: 0 },
    { nome: '31 a 60 dias', cls: 'cr-f3', min: 31, max: 60, v: 0, q: 0 },
    { nome: 'mais de 60 dias', cls: 'cr-f4', min: 61, max: 99999, v: 0, q: 0 }
  ];
  vencidos.forEach(t => {
    const d = crDias(t.data_vencimento, CR.hoje);
    const f = faixas.filter(x => d >= x.min && d <= x.max)[0];
    if (f) { f.v += crSaldo(t); f.q++; }
  });
  const maior = Math.max.apply(null, faixas.map(f => f.v).concat([1]));
  document.getElementById('cr-regua-total').textContent = atraso > 0 ? crBRL(atraso) + ' vencidos' : 'nada vencido';
  document.getElementById('cr-regua').innerHTML = faixas.map(f =>
    '<div class="' + f.cls + '" onclick="crSelecionar(\'atraso\',\'' + f.min + '-' + f.max + '\',\'Atraso de ' + f.nome + '\')" title="Ver os títulos desta faixa">' +
      '<div class="cr-faixa-top"><span class="cr-faixa-nome">' + f.nome + '</span>' +
      '<span><span class="cr-faixa-val">' + crBRL(f.v) + '</span> <span class="cr-faixa-qtd">' + f.q + '</span></span></div>' +
      '<div class="cr-faixa-bar"><span style="width:' + (f.v / maior * 100) + '%"></span></div>' +
    '</div>').join('');
}

/** Uma linha compacta de título, usada nos cards do dashboard. */
function crLinhaMini(t, mostrarDias) {
  const sit = crSituacao(t);
  const dias = mostrarDias ? crDias(t.data_vencimento, CR.hoje) : 0;
  return '<tr' + (sit === 'risco' ? ' class="risco"' : '') + '>' +
    '<td style="white-space:nowrap;">' + crData(t.data_vencimento) +
      (mostrarDias && dias > 0 ? ' <span class="cr-pill cr-pill-atraso">' + dias + 'd</span>' : '') + '</td>' +
    '<td class="cr-cli" title="' + crEsc(t.cliente) + '">' + crEsc(t.cliente) +
      (sit !== 'livre' ? ' <span class="cr-pill ' + CR_SIT[sit].pill + '">' + CR_SIT[sit].nome + '</span>' : '') + '</td>' +
    '<td class="cr-num" style="font-weight:800;">' + crBRL(crSaldo(t)) + '</td></tr>';
}

function crRenderTabelasDash(ativos, vencidos) {
  const vazio = m => '<tr><td colspan="3" class="cr-vazio">' + m + '</td></tr>';

  const hoje = ativos.filter(t => crEmAberto(t) && t.data_vencimento === CR.hoje)
    .sort((a, b) => crSaldo(b) - crSaldo(a));
  document.getElementById('cr-tb-hoje').innerHTML = hoje.length
    ? hoje.map(t => crLinhaMini(t, false)).join('') : vazio('Nada vence hoje.');
  document.getElementById('cr-hoje-total').textContent = hoje.length
    ? crBRL(hoje.reduce((s, t) => s + crSaldo(t), 0)) + ' · ' + hoje.length : '—';

  const atrasados = vencidos.slice().sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
  document.getElementById('cr-tb-atraso').innerHTML = atrasados.length
    ? atrasados.map(t => crLinhaMini(t, true)).join('') : vazio('Nenhum título atrasado. 🎉');
  document.getElementById('cr-atraso-total').textContent = atrasados.length
    ? crBRL(atrasados.reduce((s, t) => s + crSaldo(t), 0)) + ' · ' + atrasados.length : '—';

  const limite = crSomaDias(CR.hoje, 30);
  const prox = ativos.filter(t => crEmAberto(t) && t.data_vencimento > CR.hoje && t.data_vencimento <= limite)
    .sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
  document.getElementById('cr-tb-prox').innerHTML = prox.length
    ? prox.map(t => crLinhaMini(t, false)).join('') : vazio('Nada vence nos próximos 30 dias.');
  document.getElementById('cr-prox-total').textContent = prox.length
    ? crBRL(prox.reduce((s, t) => s + crSaldo(t), 0)) + ' · ' + prox.length : '—';
}

// ── Drill-down dos gráficos ──────────────────────────────────────────────────
function crSelecionar(tipo, valor, rotulo) {
  // Clicar de novo na mesma fatia limpa: é o gesto que todo mundo tenta.
  if (CR.drill && CR.drill.tipo === tipo && String(CR.drill.valor) === String(valor)) { crLimparSelecao(); return; }
  CR.drill = { tipo, valor, rotulo };
  crRenderDetalhe();
  document.getElementById('cr-tb-detalhe').closest('.cr-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function crLimparSelecao() { CR.drill = null; crRenderDetalhe(); }

function crTitulosDoDrill() {
  const ativos = crAtivos();
  if (!CR.drill) return [];
  const d = CR.drill;
  if (d.tipo === 'cliente') return ativos.filter(t => crEmAberto(t) && t.cliente === d.valor);
  if (d.tipo === 'semana') {
    const sem = t => Math.min(Math.floor((+String(t.data_vencimento).slice(8, 10) - 1) / 7) + 1, 5);
    return ativos.filter(t => crDoMes(t) && t.data_vencimento && sem(t) === Number(d.valor));
  }
  if (d.tipo === 'atraso') {
    const [min, max] = String(d.valor).split('-').map(Number);
    return ativos.filter(t => {
      if (!crVencido(t)) return false;
      const dd = crDias(t.data_vencimento, CR.hoje);
      return dd >= min && dd <= max;
    });
  }
  return [];
}

function crRenderDetalhe() {
  const tb = document.getElementById('cr-tb-detalhe');
  const tit = document.getElementById('cr-detalhe-titulo');
  const btn = document.getElementById('cr-detalhe-limpar');

  if (!CR.drill) {
    tit.textContent = 'Detalhe da seleção';
    btn.style.display = 'none';
    tb.innerHTML = '<tr><td colspan="3" class="cr-vazio">' +
      'Clique num cliente, numa semana ou numa faixa de atraso<br>para ver os títulos por trás do número.</td></tr>';
    return;
  }
  const lista = crTitulosDoDrill().sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
  const total = lista.reduce((s, t) => s + crSaldo(t), 0);
  tit.textContent = CR.drill.rotulo + ' · ' + crBRL(total);
  btn.style.display = '';
  tb.innerHTML = lista.length
    ? lista.map(t => crLinhaMini(t, CR.drill.tipo === 'atraso')).join('')
    : '<tr><td colspan="3" class="cr-vazio">Nada nesta seleção.</td></tr>';
}

// ═══════════════════════════════════════════════════════════════════════════
// ABA TÍTULOS
// ═══════════════════════════════════════════════════════════════════════════

function crFiltrar() {
  const busca = (document.getElementById('cr-f-busca').value || '').toLowerCase().trim();
  const status = document.getElementById('cr-f-status').value;
  const antec = document.getElementById('cr-f-antec').value;
  const cliente = document.getElementById('cr-f-cliente').value;
  const periodo = document.getElementById('cr-f-periodo').value;

  return crAtivos().filter(t => {
    if (periodo === 'mes' && !crDoMes(t)) return false;
    if (periodo === 'aberto' && !crEmAberto(t)) return false;
    if (cliente && t.cliente !== cliente) return false;

    if (status === 'VENCIDO') { if (!crVencido(t)) return false; }
    else if (status && t.status !== status) return false;

    const sit = crSituacao(t);
    if (antec === 'livre' && sit !== 'livre') return false;
    if (antec === 'antecipado' && sit !== 'antecipado' && sit !== 'risco') return false;
    if (antec === 'risco' && sit !== 'risco') return false;

    if (busca) {
      const alvo = [t.cliente, t.numero_nf, t.num_os, t.descricao, t.observacao].join(' ').toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  }).sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
}

function crRotuloNF(t) {
  if (!t.numero_nf) return '—';
  return Number(t.total_parcelas) > 1
    ? t.numero_nf + '/' + String(t.parcela).padStart(2, '0')
    : t.numero_nf;
}

function crRenderTitulos() {
  const lista = crFiltrar();
  const tb = document.getElementById('cr-tb-titulos');
  const podeEditar = crPodeEditar();

  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="10" class="cr-vazio">Nenhum título com esses filtros.</td></tr>';
  } else {
    tb.innerHTML = lista.map(t => {
      const sit = crSituacao(t);
      const venc = crVencido(t);
      const dias = venc ? crDias(t.data_vencimento, CR.hoje) : 0;
      const marcado = !!CR.selecao[t.id];
      const pillStatus = venc
        ? '<span class="cr-pill cr-pill-atraso">' + dias + 'd atraso</span>'
        : '<span class="cr-pill cr-pill-' + t.status + '">' +
          ({ ABERTO: 'Em aberto', RECEBIDO: 'Recebido', PARCIAL: 'Parcial' }[t.status] || t.status) + '</span>';
      const op = t.operacao_id ? crOperacao(t.operacao_id) : null;
      const pillAnt = sit === 'livre'
        ? '<span class="cr-pill cr-pill-livre">Livre</span>'
        : '<span class="cr-pill ' + CR_SIT[sit].pill + '" title="' +
          crEsc((op ? 'Operação ' + (op.numero || op.id) + ' · ' + op.parceiro : '')) + '">' + CR_SIT[sit].nome + '</span>';

      return '<tr class="' + (marcado ? 'sel ' : '') + (sit === 'risco' ? 'risco' : '') + '">' +
        '<td><input type="checkbox" ' + (marcado ? 'checked' : '') + ' onchange="crMarcar(\'' + t.id + '\',this.checked)" /></td>' +
        '<td style="white-space:nowrap;">' + crDataLonga(t.data_vencimento) +
          '<div class="cr-sub">emit. ' + crData(t.data_emissao) + '</div></td>' +
        '<td class="cr-cli" title="' + crEsc(t.cliente) + '">' + crEsc(t.cliente) + '</td>' +
        '<td class="cr-col-apoio">' + crEsc(crRotuloNF(t)) + '</td>' +
        '<td class="cr-col-apoio">' + (t.num_os ? crEsc(t.num_os) : '—') + '</td>' +
        '<td class="cr-num" style="font-weight:800;">' + crBRL(t.valor_total) + '</td>' +
        '<td class="cr-num cr-col-apoio">' + (Number(t.valor_recebido) > 0 ? crBRL(t.valor_recebido) : '—') + '</td>' +
        '<td>' + pillStatus + '</td>' +
        '<td>' + pillAnt + '</td>' +
        '<td style="white-space:nowrap;text-align:right;">' +
          (podeEditar && crEmAberto(t) ? '<button class="cr-acao baixar" onclick="crAbrirBaixa(\'' + t.id + '\')" title="Registrar recebimento"><i class="fa-solid fa-money-bill-transfer"></i></button>' : '') +
          (podeEditar ? '<button class="cr-acao" onclick="crAbrirTitulo(\'' + t.id + '\')" title="Editar"><i class="fa-solid fa-pen"></i></button>' : '') +
        '</td></tr>';
    }).join('');
  }

  const total = lista.reduce((s, t) => s + (Number(t.valor_total) || 0), 0);
  const aberto = lista.filter(crEmAberto).reduce((s, t) => s + crSaldo(t), 0);
  const antec = lista.filter(crAntecipado).reduce((s, t) => s + crSaldo(t), 0);
  document.getElementById('cr-titulos-resumo').innerHTML =
    lista.length + ' título(s) · face ' + crBRL(total) + ' · em aberto ' + crBRL(aberto) +
    (antec > 0 ? ' · <span style="color:var(--ant);">antecipado ' + crBRL(antec) + '</span>' : '');

  document.getElementById('cr-todos').checked =
    lista.length > 0 && lista.every(t => CR.selecao[t.id]);
  crAtualizarLote();
}

const crOperacao = id => CR.operacoes.filter(o => o.id === id)[0] || null;

function crMarcar(id, marcado) {
  if (marcado) CR.selecao[id] = true; else delete CR.selecao[id];
  crRenderTitulos();
}

function crMarcarTodos(marcado) {
  crFiltrar().forEach(t => { if (marcado) CR.selecao[t.id] = true; else delete CR.selecao[t.id]; });
  crRenderTitulos();
}

function crLimparLote() { CR.selecao = {}; crRenderTitulos(); }

function crAtualizarLote() {
  const ids = Object.keys(CR.selecao);
  const barra = document.getElementById('cr-lote');
  barra.classList.toggle('on', ids.length > 0);
  if (!ids.length) return;
  const sel = CR.titulos.filter(t => CR.selecao[t.id]);
  document.getElementById('cr-lote-qtd').textContent = sel.length;
  document.getElementById('cr-lote-valor').textContent = crBRL(sel.reduce((s, t) => s + crSaldo(t), 0));
}

function crExportar() {
  const lista = crFiltrar();
  if (!lista.length) { crAviso('Nada para exportar com esses filtros.', 'info'); return; }
  const cab = ['Vencimento', 'Emissão', 'Cliente', 'Cód. cliente', 'NF', 'OS', 'Parcela',
               'Valor', 'Recebido', 'Status', 'Recebimento', 'Antecipação', 'Operação', 'Parceiro'];
  const linhas = lista.map(t => {
    const op = t.operacao_id ? crOperacao(t.operacao_id) : null;
    return [
      crDataLonga(t.data_vencimento), crDataLonga(t.data_emissao), t.cliente, t.cliente_cod,
      crRotuloNF(t), t.num_os, t.parcela + '/' + t.total_parcelas,
      (Number(t.valor_total) || 0).toFixed(2).replace('.', ','),
      (Number(t.valor_recebido) || 0).toFixed(2).replace('.', ','),
      t.status, t.data_recebimento ? crDataLonga(t.data_recebimento) : '',
      CR_SIT[crSituacao(t)].nome, op ? (op.numero || op.id) : '', op ? op.parceiro : ''
    ];
  });
  crBaixarCSV([cab].concat(linhas), 'contas-a-receber-' + CR.competencia + '.csv');
}

function crBaixarCSV(matriz, nome) {
  const csv = matriz
    .map(l => l.map(c => '"' + String(c === null || c === undefined ? '' : c).replace(/"/g, '""') + '"').join(';'))
    .join('\r\n');
  // BOM para o Excel abrir os acentos direito.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Modal de título ──────────────────────────────────────────────────────────
/**
 * Confere o vencimento digitado contra a regra do cliente e oferece a data certa.
 * Sugestão, não imposição: lançamento manual às vezes é exatamente a exceção.
 */
function crConferirRegraTitulo() {
  const el = document.getElementById('cr-t-regra');
  if (!el) return;
  const venc = document.getElementById('cr-t-vencimento').value;
  const pol = crPoliticaDe(document.getElementById('cr-t-clicod').value.trim(),
                           document.getElementById('cr-t-cliente').value.trim());
  if (!venc || !pol || !pol.regra_venc) { el.innerHTML = ''; return; }
  const certo = crAplicarRegra(venc, pol);
  el.innerHTML = certo === venc
    ? '<span style="color:var(--ant);font-weight:700;"><i class="fa-solid fa-check"></i> ' +
      'O vencimento bate com a regra deste cliente.</span>'
    : '<span style="color:#b45309;font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> ' +
      'Este cliente só paga ' + crRegraTexto(pol).replace(/<[^>]+>/g, '') + '. Pela regra, o recebimento cairia em <b>' +
      crDataLonga(certo) + '</b>.</span> <button type="button" class="cr-btn cr-btn-peq" onclick="crUsarVencDaRegra(\'' +
      certo + '\')">Usar ' + crData(certo) + '</button>';
}

function crUsarVencDaRegra(iso) {
  document.getElementById('cr-t-vencimento').value = iso;
  crConferirRegraTitulo();
}

function crAbrirTitulo(id) {
  if (!crPodeEditar()) return;
  const t = id ? CR.titulos.filter(x => x.id === id)[0] : null;
  CR.editando = t ? t.id : null;

  document.getElementById('cr-mt-titulo').textContent = t ? 'Editar título' : 'Novo título a receber';
  document.getElementById('cr-mt-sub').textContent = t
    ? t.id + ' · origem ' + (t.origem || 'MANUAL') : 'Lançamento manual';

  const v = (campo, valor) => document.getElementById(campo).value = valor === undefined || valor === null ? '' : valor;
  v('cr-t-cliente', t ? t.cliente : '');
  v('cr-t-clicod', t ? t.cliente_cod : '');
  v('cr-t-emissao', t ? t.data_emissao : CR.hoje);
  v('cr-t-vencimento', t ? t.data_vencimento : '');
  v('cr-t-nf', t ? t.numero_nf : '');
  v('cr-t-os', t ? t.num_os : '');
  v('cr-t-empresa', t ? (t.empresa || 'RENOVA') : 'RENOVA');
  v('cr-t-parcela', t ? t.parcela : 1);
  v('cr-t-parcelas', t ? t.total_parcelas : 1);
  v('cr-t-forma', t ? (t.forma_pagamento || 'Boleto') : 'Boleto');
  v('cr-t-descricao', t ? t.descricao : '');
  v('cr-t-valor', t ? (Number(t.valor_total) || 0).toFixed(2).replace('.', ',') : '');
  v('cr-t-recebido', t && Number(t.valor_recebido) > 0 ? Number(t.valor_recebido).toFixed(2).replace('.', ',') : '');
  v('cr-t-databaixa', t ? t.data_recebimento : '');
  v('cr-t-obs', t ? t.observacao : '');

  const aviso = document.getElementById('cr-t-aviso-ant');
  if (t && crAntecipado(t)) {
    const op = crOperacao(t.operacao_id);
    aviso.innerHTML = '<b style="color:var(--ant);">Título antecipado</b> na operação ' +
      crEsc(op ? (op.numero || op.id) + ' — ' + op.parceiro : t.operacao_id) +
      '. O vínculo com a operação não muda por aqui: para desfazer, cancele a operação.';
  } else { aviso.textContent = ''; }

  document.getElementById('cr-t-cancelar').style.display = t && !crAntecipado(t) ? '' : 'none';
  crConferirRegraTitulo();
  crAbrir('cr-modal-titulo');
}

async function crSalvarTitulo() {
  const btn = document.getElementById('cr-t-salvar');
  const g = id => document.getElementById(id).value;
  const titulo = {
    id: CR.editando,
    cliente: g('cr-t-cliente').trim(),
    cliente_cod: g('cr-t-clicod').trim(),
    data_emissao: g('cr-t-emissao'),
    data_vencimento: g('cr-t-vencimento'),
    numero_nf: g('cr-t-nf').trim(),
    num_os: g('cr-t-os').trim(),
    empresa: g('cr-t-empresa'),
    parcela: Number(g('cr-t-parcela')) || 1,
    total_parcelas: Number(g('cr-t-parcelas')) || 1,
    forma_pagamento: g('cr-t-forma'),
    descricao: g('cr-t-descricao').trim(),
    valor_total: crNum(g('cr-t-valor')),
    valor_recebido: crNum(g('cr-t-recebido')),
    data_recebimento: g('cr-t-databaixa'),
    observacao: g('cr-t-obs').trim(),
    origem: CR.editando ? undefined : 'MANUAL'
  };
  if (!titulo.cliente) { crAviso('Informe o cliente.', 'erro'); return; }
  if (!titulo.data_vencimento) { crAviso('Informe o vencimento.', 'erro'); return; }
  if (titulo.valor_total <= 0) { crAviso('Informe o valor do título.', 'erro'); return; }

  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Salvando…';
  try {
    try {
      await crPost('titulo_salvar', { titulo });
    } catch (e1) {
      // Recebimento avulso que repete de verdade (dois PIX iguais no mesmo dia)
      // não é duplicidade — mas só passa se alguém disser que é mesmo outro.
      const repetivel = !titulo.id && !titulo.numero_nf && /já existe na base/.test(e1.message || '');
      if (!repetivel) throw e1;
      if (!confirm('Já existe um lançamento igual: mesmo cliente, mesmo vencimento e mesmo valor.\n\n' +
                   'Se este é outro recebimento de verdade, confirme para lançar assim mesmo.')) {
        crAviso('Lançamento não gravado — nada foi duplicado.', 'info');
        return;
      }
      await crPost('titulo_salvar', { titulo: Object.assign({}, titulo, { permitir_duplicado: true }) });
    }
    crFechar('cr-modal-titulo');
    await crCarregar();
    crAviso('Título salvo.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui salvar.</b> ' + crEsc(e.message), 'erro');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>Salvar';
  }
}

async function crCancelarTitulo() {
  if (!CR.editando) return;
  if (!confirm('Cancelar este título? Ele continua na base, marcado como CANCELADO, e sai de todas as somas.')) return;
  try {
    await crPost('titulo_cancelar', { id: CR.editando });
    crFechar('cr-modal-titulo');
    await crCarregar();
    crAviso('Título cancelado.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui cancelar.</b> ' + crEsc(e.message), 'erro');
  }
}

// ── Baixa (individual, em lote e da carteira) ────────────────────────────────
function crAbrirBaixa(id) {
  const t = CR.titulos.filter(x => x.id === id)[0];
  if (!t) return;
  CR.baixaAlvo = { ids: [id], origem: 'titulos', lote: false };
  document.getElementById('cr-b-sub').textContent = t.cliente + ' · NF ' + crRotuloNF(t);
  const inp = document.getElementById('cr-b-valor');
  inp.value = crSaldo(t).toFixed(2).replace('.', ',');
  inp.placeholder = '0,00';
  document.getElementById('cr-b-data').value = CR.hoje;
  document.getElementById('cr-b-aviso').innerHTML =
    'Vence em ' + crDataLonga(t.data_vencimento) + ' · valor de face ' + crBRL(t.valor_total) +
    '. Recebeu menos que o saldo? Informe o valor e o título fica <b>parcial</b>.' + crAvisoBaixa([t]);
  crAbrir('cr-modal-baixa');
}

function crAbrirBaixaLote() { crAbrirBaixaMuitos(Object.keys(CR.selecao), 'titulos'); }
function crAbrirBaixaCarteira() { crAbrirBaixaMuitos(Object.keys(CR.selCarteira), 'carteira'); }

function crAbrirBaixaMuitos(ids, origem) {
  if (!ids.length) return;
  const sel = CR.titulos.filter(t => ids.indexOf(t.id) >= 0);
  CR.baixaAlvo = { ids, origem, lote: true };
  document.getElementById('cr-b-sub').textContent = sel.length + ' título(s) selecionado(s)';
  // Em lote o campo de valor fica vazio: baixa cada título pelo próprio saldo.
  // Um valor único aplicado a todos criaria parciais errados em silêncio.
  document.getElementById('cr-b-valor').value = '';
  document.getElementById('cr-b-valor').placeholder = 'cada um pelo saldo';
  document.getElementById('cr-b-data').value = CR.hoje;
  document.getElementById('cr-b-aviso').innerHTML =
    'Cada título será baixado pelo próprio saldo — total ' +
    '<b>' + crBRL(sel.reduce((s, t) => s + crSaldo(t), 0)) + '</b>. ' +
    'Para baixar valor diferente do saldo, faça um por um.' + crAvisoBaixa(sel);
  crAbrir('cr-modal-baixa');
}

function crAvisoBaixa(lista) {
  const ant = lista.filter(crAntecipado);
  if (!ant.length) return '';
  return '<br><br><b style="color:var(--ant);">' + ant.length + ' título(s) antecipado(s).</b> ' +
    'Marcar como recebido encerra a coobrigação: o parceiro recebeu do cliente. ' +
    'Se quem pagou o parceiro foi a empresa, use <b>Marcar recompra</b> na aba Operações.';
}

async function crConfirmarBaixa() {
  if (!CR.baixaAlvo) return;
  const data = document.getElementById('cr-b-data').value || CR.hoje;
  const valorTxt = document.getElementById('cr-b-valor').value;
  const umSo = CR.baixaAlvo.ids.length === 1;
  const baixas = CR.baixaAlvo.ids.map(id => ({
    id: id,
    valor_recebido: umSo && valorTxt ? crNum(valorTxt) : 0,   // 0 = servidor usa o saldo
    data_recebimento: data
  }));
  try {
    const r = await crPost('titulo_baixar', { baixas });
    crFechar('cr-modal-baixa');
    // Só a baixa em lote limpa a seleção: baixar um título solto não pode
    // apagar as caixas que o usuário já tinha marcado para outra coisa.
    if (CR.baixaAlvo.lote) {
      if (CR.baixaAlvo.origem === 'titulos') CR.selecao = {}; else CR.selCarteira = {};
    }
    CR.baixaAlvo = null;
    await crCarregar();
    crAviso(r.baixados + ' título(s) baixado(s).', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui baixar.</b> ' + crEsc(e.message), 'erro');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ABA ANTECIPAR — montagem do pacote
// ═══════════════════════════════════════════════════════════════════════════

/** Duplicatas que podem ir para um borderô hoje. */
function crTitulosAntecipaveis() {
  const busca = (document.getElementById('cr-a-busca').value || '').toLowerCase().trim();
  const cliente = document.getElementById('cr-a-cliente').value;
  const ate = document.getElementById('cr-a-ate').value;

  return crAtivos().filter(t => {
    if (!crEmAberto(t)) return false;
    if (String(t.antecipado).toUpperCase() === 'SIM') return false;
    // Título já vencido não é antecipável: fundo nenhum compra recebível
    // vencido, e deixá-lo na lista só produz borderô recusado.
    if (!t.data_vencimento || t.data_vencimento <= CR.hoje) return false;
    if (cliente && t.cliente !== cliente) return false;
    if (ate && t.data_vencimento > ate) return false;
    if (busca) {
      const alvo = [t.cliente, t.numero_nf, t.num_os].join(' ').toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  }).sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
}

/**
 * OSs em AGUARDANDO PEDIDO com a política do cliente já aplicada.
 *
 * Devolve sempre TODAS, inclusive as bloqueadas, com o motivo do bloqueio. OS
 * que some da lista vira pergunta ("por que a 4566 não aparece?"); OS cinza com
 * o motivo escrito ao lado responde sozinha.
 */
function crOSComPolitica() {
  // OS já antecipada e ainda sem nota não pode entrar de novo: seria vender o
  // mesmo recebível duas vezes.
  const jaAntecipadas = {};
  CR.antecipacoesOS.forEach(a => {
    if (a.status === 'AGUARDANDO_FATURAMENTO') jaAntecipadas[String(a.num_os)] = a;
  });

  return CR.osPendentes.map(o => {
    const pol = crPolitica(o.cliente_cod);
    const pct = pol.pct_max_os > 0 ? pol.pct_max_os : 100;
    const antecipavel = Math.round(o.valor * pct) / 100;
    const venc = crSomaDias(CR.hoje, (pol.dias_ate_faturar || 30) + (pol.dias_prazo_venc || 30));

    let bloqueio = '';
    if (jaAntecipadas[o.num_os]) {
      const op = crOperacao(jaAntecipadas[o.num_os].operacao_id);
      bloqueio = 'Já antecipada na operação ' +
        ((op && op.numero) || jaAntecipadas[o.num_os].operacao_id);
    } else if (!pol.permite_os) {
      bloqueio = pol.padrao
        ? 'Sem política cadastrada — o padrão não libera OS sem pedido'
        : 'A política deste cliente não permite antecipar OS sem pedido';
    } else if (o.valor <= 0) {
      bloqueio = 'OS sem valor';
    }

    return Object.assign({}, o, { pol, pct, antecipavel, venc, bloqueio });
  }).sort((a, b) => (a.bloqueio ? 1 : 0) - (b.bloqueio ? 1 : 0) || b.antecipavel - a.antecipavel);
}

/** A mesma lista, recortada pelos filtros da tela. */
function crOSAntecipaveis() {
  const busca = (document.getElementById('cr-a-busca').value || '').toLowerCase().trim();
  const cliente = document.getElementById('cr-a-cliente').value;
  return crOSComPolitica().filter(o => {
    if (cliente && o.cliente !== cliente) return false;
    if (busca && !((o.num_os + ' ' + o.cliente).toLowerCase().includes(busca))) return false;
    return true;
  });
}

function crRenderAntecipar() {
  const titulos = crTitulosAntecipaveis();
  const oss = crOSAntecipaveis();
  const podeEditar = crPodeEditar();

  const tbT = document.getElementById('cr-tb-a-titulos');
  tbT.innerHTML = titulos.length ? titulos.map(t => {
    const marcado = !!CR.selAntTit[t.id];
    const venc = crVencDe(t);
    const mudou = venc !== t.data_vencimento;
    const prazo = crDias(CR.hoje, venc);
    // Data editável na própria linha: é aqui que o financeiro corrige o
    // vencimento que veio errado do Genesis, antes de o borderô ir ao fundo.
    const pol = crPoliticaDe(t.cliente_cod);
    const pelaRegra = pol && pol.regra_venc ? crAplicarRegra(venc, pol) : venc;
    const foraDaRegra = pelaRegra !== venc;
    return '<tr class="' + (marcado ? 'sel' : '') + '">' +
      '<td><input type="checkbox" ' + (marcado ? 'checked' : '') + ' onchange="crMarcarAntTit(\'' + t.id + '\',this.checked)" /></td>' +
      '<td style="white-space:nowrap;">' +
        (podeEditar
          ? '<input type="date" class="cr-venc-inp' + (mudou ? ' mudou' : '') + '" value="' + crEsc(venc) +
            '" onchange="crAjustarVenc(\'' + t.id + '\',this.value)" title="Vencimento original: ' + crData(t.data_vencimento) + '" />'
          : crData(venc)) +
        (mudou ? '<div class="cr-sub" style="color:#b45309;">era ' + crData(t.data_vencimento) + '</div>' : '') +
        (foraDaRegra ? '<div class="cr-sub" style="color:#b45309;" title="' + crEsc(t.cliente) +
           ' só paga nos dias da regra cadastrada">fora da regra → ' + crData(pelaRegra) + '</div>' : '') +
      '</td>' +
      '<td class="cr-cli" title="' + crEsc(t.cliente) + '">' + crEsc(t.cliente) +
        (pol && pol.regra_venc ? ' ' + crRegraTexto(pol) : '') + '</td>' +
      '<td class="cr-col-apoio">' + crEsc(crRotuloNF(t)) + '</td>' +
      '<td class="cr-num" style="font-weight:800;">' + crBRL(t.valor_total) + '</td>' +
      '<td class="cr-num">' + prazo + 'd</td></tr>';
  }).join('') : '<tr><td colspan="6" class="cr-vazio">Nenhuma duplicata em aberto e a vencer com esses filtros.</td></tr>';

  const totalT = titulos.reduce((s, t) => s + (Number(t.valor_total) || 0), 0);
  document.getElementById('cr-a-tit-resumo').textContent =
    titulos.length ? titulos.length + ' · ' + crBRL(totalT) : '—';

  const tbO = document.getElementById('cr-tb-a-os');
  tbO.innerHTML = oss.length ? oss.map(o => {
    const marcado = !!CR.selAntOS[o.num_os];
    return '<tr class="' + (marcado ? 'sel ' : '') + (o.bloqueio ? 'bloq' : '') + '"' +
      (o.bloqueio ? ' title="' + crEsc(o.bloqueio) + '"' : '') + '>' +
      '<td>' + (o.bloqueio ? '<i class="fa-solid fa-lock" style="color:var(--muted);font-size:.72rem;"></i>'
        : '<input type="checkbox" ' + (marcado ? 'checked' : '') + ' onchange="crMarcarAntOS(\'' + o.num_os + '\',this.checked)" />') + '</td>' +
      '<td style="font-weight:800;">' + crEsc(o.num_os) + '</td>' +
      '<td class="cr-cli" title="' + crEsc(o.cliente) + '">' + crEsc(o.cliente) +
        (o.bloqueio ? '<div class="cr-sub">' + crEsc(o.bloqueio) + '</div>' : '') + '</td>' +
      '<td class="cr-num">' + crBRL(o.valor) + '</td>' +
      '<td class="cr-num" style="font-weight:800;color:var(--ant);">' + crBRL(o.antecipavel) +
        (o.pct < 100 ? '<div class="cr-sub">' + o.pct + '% da OS</div>' : '') + '</td>' +
      '<td class="cr-col-apoio">' + crData(o.venc) + '</td></tr>';
  }).join('') : '<tr><td colspan="6" class="cr-vazio">Nenhuma OS em Aguardando Pedido no último export.</td></tr>';

  const liberadas = oss.filter(o => !o.bloqueio);
  document.getElementById('cr-a-os-resumo').textContent = oss.length
    ? liberadas.length + ' liberada(s) de ' + oss.length + ' · ' +
      crBRL(liberadas.reduce((s, o) => s + o.antecipavel, 0)) : '—';

  const quando = CR.osGeradoEm ? new Date(CR.osGeradoEm) : null;
  document.getElementById('cr-a-os-nota').innerHTML =
    'A lista sai do último export do Genesis' +
    (quando && !isNaN(quando) ? ', de <b>' + quando.toLocaleDateString('pt-BR') + ' ' +
      quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</b>' : '') +
    '. O valor antecipável e o vencimento estimado vêm da política do cliente, em <b>Parceiros &amp; Políticas</b>.';

  document.getElementById('cr-btn-registrar').disabled = !podeEditar;
  crSimular();
}

/** O vencimento que vale na montagem: o corrigido à mão, ou o do título. */
function crVencDe(t) {
  return CR.vencAjustado[t.id] || t.data_vencimento;
}

/** Correção manual do vencimento de um título dentro do borderô em montagem. */
function crAjustarVenc(id, valor) {
  const t = CR.titulos.filter(x => x.id === id)[0];
  if (!t) return;
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor === t.data_vencimento) {
    delete CR.vencAjustado[id];
  } else {
    CR.vencAjustado[id] = valor;
  }
  crRenderAntecipar();
}

/**
 * Joga todos os títulos à vista para o dia em que o cliente realmente paga.
 *
 * Só mexe em quem tem regra cadastrada e está fora dela — quem já está no dia
 * certo fica como está, e cliente sem regra não é tocado.
 */
function crAplicarRegrasNosVencimentos() {
  const alvo = crTitulosAntecipaveis();
  let n = 0;
  alvo.forEach(t => {
    const pol = crPoliticaDe(t.cliente_cod);
    if (!pol || !pol.regra_venc) return;
    const atual = crVencDe(t);
    const novo = crAplicarRegra(atual, pol);
    if (novo && novo !== atual) { CR.vencAjustado[t.id] = novo; n++; }
  });
  crRenderAntecipar();
  crAviso(n
    ? '<b>' + n + ' vencimento(s) ajustado(s)</b> para o dia de pagamento de cada cliente. ' +
      'A correção vale no borderô e volta para o título quando a operação for registrada.'
    : 'Nenhum título à vista está fora da regra do cliente.', n ? 'ok' : 'info');
}

/** Desfaz todas as correções manuais desta montagem. */
function crLimparVencimentos() {
  CR.vencAjustado = {};
  crRenderAntecipar();
}

function crMarcarAntTit(id, m) { if (m) CR.selAntTit[id] = true; else delete CR.selAntTit[id]; crRenderAntecipar(); }
function crMarcarAntOS(os, m) { if (m) CR.selAntOS[os] = true; else delete CR.selAntOS[os]; crRenderAntecipar(); }

function crSelecionarTudoAntecipar() {
  crTitulosAntecipaveis().forEach(t => CR.selAntTit[t.id] = true);
  crOSAntecipaveis().forEach(o => { if (!o.bloqueio) CR.selAntOS[o.num_os] = true; });
  crRenderAntecipar();
}

/** Os itens escolhidos, num formato único que serve à simulação e ao borderô. */
function crItensSelecionados() {
  const itens = [];
  crAtivos().forEach(t => {
    if (!CR.selAntTit[t.id]) return;
    itens.push({
      tipo: 'TITULO', ref_id: t.id, num_os: t.num_os, numero_nf: crRotuloNF(t),
      parcela: t.parcela, cliente: t.cliente, cliente_cod: t.cliente_cod,
      cliente_cnpj: t.cliente_cnpj || '', emissao: t.data_emissao,
      vencimento: crVencDe(t), valor: Number(t.valor_total) || 0
    });
  });
  // Sem filtro aqui, de propósito: o carrinho não pode perder um item porque
  // o usuário digitou algo na busca depois de marcá-lo.
  crOSComPolitica().forEach(o => {
    if (!CR.selAntOS[o.num_os] || o.bloqueio) return;
    itens.push({
      tipo: 'OS', ref_id: '', num_os: o.num_os, numero_nf: '', parcela: 1,
      cliente: o.cliente, cliente_cod: o.cliente_cod,
      cliente_cnpj: crCNPJDoCliente(o.cliente_cod), emissao: '',
      vencimento: o.venc, valor: o.antecipavel, valor_os: o.valor
    });
  });
  itens.forEach(i => { i.prazo_dias = Math.max(crDias(crDataOperacao(), i.vencimento), 0); });
  return itens.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
}

const crDataOperacao = () => document.getElementById('cr-a-data').value || CR.hoje;

function crCNPJDoCliente(cod) {
  const t = CR.titulos.filter(x => String(x.cliente_cod) === String(cod) && x.cliente_cnpj)[0];
  return t ? t.cliente_cnpj : '';
}

/**
 * Custo estimado da operação. Mesma fórmula do backend — se divergir, o número
 * da tela mente sobre o que vai ser gravado:
 *
 *   deságio = face × taxa_mês × (prazo médio ponderado + float) / 30
 *           + tarifa por título × quantidade + TAC
 *
 * O prazo médio é ponderado PELO VALOR, não pela quantidade: um título de
 * R$ 50 mil a 60 dias custa muito mais que dez de R$ 500 a 15 dias.
 */
function crCalcular(itens, parceiro) {
  let bruto = 0, ponderado = 0;
  itens.forEach(i => { bruto += i.valor; ponderado += i.valor * i.prazo_dias; });
  const prazo = bruto > 0 ? ponderado / bruto : 0;
  const taxa = parceiro ? Number(parceiro.taxa_mes) || 0 : 0;
  const tarifa = parceiro ? Number(parceiro.tarifa_titulo) || 0 : 0;
  const tac = parceiro ? Number(parceiro.tac) || 0 : 0;
  const flt = parceiro ? Number(parceiro.dias_float) || 0 : 0;
  const juros = bruto * (taxa / 100) * ((prazo + flt) / 30);
  const desagio = juros + tarifa * itens.length + tac;
  return {
    bruto: Math.round(bruto * 100) / 100,
    qtd: itens.length,
    prazo: Math.round(prazo * 10) / 10,
    desagio: Math.round(desagio * 100) / 100,
    liquido: Math.round((bruto - desagio) * 100) / 100,
    taxa, tarifa, tac, float: flt
  };
}

function crSimular() {
  const itens = crItensSelecionados();
  const parceiro = crParceiro(document.getElementById('cr-a-parceiro').value);
  const c = crCalcular(itens, parceiro);
  CR.simulacao = { itens, parceiro, calculo: c };

  document.getElementById('cr-s-bruto').textContent = crBRLc(c.bruto);
  document.getElementById('cr-s-qtd').textContent = c.qtd;
  document.getElementById('cr-s-prazo').textContent = c.prazo.toLocaleString('pt-BR') + 'd';
  document.getElementById('cr-s-desagio').textContent = crBRLc(c.desagio);
  document.getElementById('cr-s-liquido').textContent = crBRLc(c.liquido);

  const temItens = c.qtd > 0;
  document.getElementById('cr-btn-pdf').disabled = !temItens;
  document.getElementById('cr-btn-xls').disabled = !temItens;
  document.getElementById('cr-btn-registrar').disabled = !temItens || !parceiro || !crPodeEditar();

  crChecarLimites(itens, parceiro, c);
}

/**
 * Trava de exposição. Avisa, não bloqueia: o teto da política é regra de gestão
 * e existe caso legítimo de estourar com aprovação da diretoria. Bloquear em
 * silêncio faria o usuário procurar o motivo no lugar errado.
 */
function crChecarLimites(itens, parceiro, calculo) {
  const el = document.getElementById('cr-a-alerta');
  const avisos = [];

  const emAberto = crAtivos().filter(t => crEmAberto(t) && crAntecipado(t));

  // Teto por cliente
  const porCli = {};
  itens.forEach(i => {
    const k = String(i.cliente_cod || i.cliente);
    porCli[k] = porCli[k] || { nome: i.cliente, cod: i.cliente_cod, novo: 0 };
    porCli[k].novo += i.valor;
  });
  Object.keys(porCli).forEach(k => {
    const c = porCli[k];
    const pol = crPolitica(c.cod);
    if (!pol.teto_exposicao || pol.teto_exposicao <= 0) return;
    const atual = emAberto.filter(t => String(t.cliente_cod) === String(c.cod))
      .reduce((s, t) => s + crSaldo(t), 0);
    if (atual + c.novo > pol.teto_exposicao + 0.005) {
      avisos.push('<b>' + crEsc(c.nome) + '</b> passaria do teto de ' + crBRL(pol.teto_exposicao) +
        ': já tem ' + crBRL(atual) + ' antecipado e este pacote soma mais ' + crBRL(c.novo) + '.');
    }
  });

  // Limite do parceiro
  if (parceiro && parceiro.limite > 0) {
    const usado = emAberto.filter(t => t.parceiro_id === parceiro.id).reduce((s, t) => s + crSaldo(t), 0);
    if (usado + calculo.bruto > parceiro.limite + 0.005) {
      avisos.push('<b>' + crEsc(parceiro.nome) + '</b> passaria do limite concedido de ' +
        crBRL(parceiro.limite) + ': ' + crBRL(usado) + ' em aberto + ' + crBRL(calculo.bruto) + ' deste pacote.');
    }
  }

  // Parceiro sem taxa: a simulação vira zero e ninguém percebe.
  if (parceiro && !parceiro.taxa_mes && calculo.qtd > 0) {
    avisos.push('<b>' + crEsc(parceiro.nome) + '</b> está sem taxa cadastrada — a simulação de deságio sai zerada. ' +
      'Cadastre em <b>Parceiros &amp; Políticas</b> para comparar com o borderô que voltar.');
  }

  const temOS = itens.some(i => i.tipo === 'OS');
  if (temOS) {
    avisos.push('O pacote inclui <b>ordem(ns) de serviço ainda sem nota</b>. O vencimento delas é ' +
      'estimado pela política do cliente; quando a OS for faturada, as notas geradas já entram marcadas como antecipadas.');
  }

  el.className = 'cr-alerta' + (avisos.length ? ' on' : '');
  el.innerHTML = avisos.map(a => '<div style="margin:3px 0;">' + a + '</div>').join('');
}

// ── Registro da operação ─────────────────────────────────────────────────────
async function crRegistrarOperacao() {
  if (!CR.simulacao || !CR.simulacao.itens.length) return;
  const { itens, parceiro, calculo } = CR.simulacao;
  if (!parceiro) { crAviso('Escolha o parceiro financeiro.', 'erro'); return; }

  const corrigidos = itens.filter(i => i.tipo === 'TITULO' && CR.vencAjustado[i.ref_id]).length;
  const msg = 'Registrar operação com ' + parceiro.nome + '?\n\n' +
    itens.length + ' item(ns) · face ' + crBRL(calculo.bruto) + '\n' +
    'Deságio estimado ' + crBRL(calculo.desagio) + ' · líquido ' + crBRL(calculo.liquido) + '\n\n' +
    (corrigidos ? corrigidos + ' vencimento(s) corrigido(s) à mão — a data nova passa a valer ' +
                  'também no título, na carteira e na projeção de caixa.\n\n' : '') +
    'Os títulos ficam reservados para esta operação a partir de agora — é o que impede ' +
    'a mesma duplicata de entrar em dois borderôs. Cancelar a operação devolve todos.';
  if (!confirm(msg)) return;

  const btn = document.getElementById('cr-btn-registrar');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Registrando…';
  try {
    const r = await crPost('operacao_criar', {
      operacao: { parceiro_id: parceiro.id, data_operacao: crDataOperacao() },
      itens: itens.map(i => ({
        tipo: i.tipo, ref_id: i.ref_id, num_os: i.num_os,
        cliente: i.cliente, cliente_cod: i.cliente_cod,
        valor: i.valor, valor_os: i.valor_os, vencimento: i.vencimento
      }))
    });
    CR.selAntTit = {}; CR.selAntOS = {}; CR.vencAjustado = {};
    await crCarregar();
    crAba('operacoes');
    crAviso('Operação <b>' + r.numero + '</b> registrada com ' + r.itens + ' item(ns). ' +
            'Envie o borderô ao parceiro e volte aqui para informar o crédito quando ele cair.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui registrar.</b> ' + crEsc(e.message), 'erro');
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-file-signature"></i>Registrar operação';
    crSimular();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRÉ-BORDERÔ (PDF via impressão / XLSX)
// ═══════════════════════════════════════════════════════════════════════════

function crPreBordero(formato) {
  if (!CR.simulacao || !CR.simulacao.itens.length) return;
  const { itens, parceiro, calculo } = CR.simulacao;
  crGerarBordero({
    titulo: 'PRÉ-BORDERÔ DE ANTECIPAÇÃO',
    numero: '(não registrado)',
    parceiro, itens, calculo, data: crDataOperacao(), rascunho: true
  }, formato);
}

function crPreBorderoDaOperacao(formato) {
  const op = CR.opAberta;
  if (!op) return;
  const itens = (op.itens || []).map(i => {
    const t = i.tipo === 'TITULO' ? CR.titulos.filter(x => x.id === i.ref_id)[0] : null;
    return {
      tipo: i.tipo, num_os: i.num_os,
      numero_nf: t ? crRotuloNF(t) : (i.numero_nf || ''),
      cliente: i.cliente, cliente_cod: i.cliente_cod,
      cliente_cnpj: (t && t.cliente_cnpj) || crCNPJDoCliente(i.cliente_cod),
      emissao: t ? t.data_emissao : '',
      vencimento: i.vencimento, valor: Number(i.valor) || 0,
      prazo_dias: Number(i.prazo_dias) || crDias(op.data_operacao, i.vencimento)
    };
  });
  crGerarBordero({
    titulo: 'BORDERÔ DE ANTECIPAÇÃO',
    numero: String(op.numero || op.id),
    parceiro: crParceiro(op.parceiro_id) || { nome: op.parceiro, taxa_mes: op.taxa_mes },
    itens,
    calculo: {
      bruto: Number(op.valor_bruto) || 0, qtd: itens.length,
      prazo: Number(op.prazo_medio) || 0, desagio: Number(op.desagio_estimado) || 0,
      liquido: Number(op.liquido_estimado) || 0, taxa: Number(op.taxa_mes) || 0,
      tarifa: Number(op.tarifa_titulo) || 0, tac: Number(op.tac) || 0
    },
    data: op.data_operacao, rascunho: false, op
  }, formato);
}

function crGerarBordero(dados, formato) {
  if (formato === 'xlsx') return crBorderoXLSX(dados);
  return crBorderoImpressao(dados);
}

/**
 * O PDF sai pela janela de impressão do navegador, não por biblioteca.
 *
 * Foi decisão, não preguiça: o portal já carrega Chart.js, PapaParse e SheetJS,
 * e somar um gerador de PDF por causa de um documento de uma página pesaria em
 * toda visita ao portal. "Salvar como PDF" existe em todo navegador e no celular,
 * e o resultado sai com as fontes do sistema, que é o que um fundo espera de um
 * borderô.
 */
function crBorderoImpressao(d) {
  const linhas = d.itens.map((i, n) => {
    const doc = i.tipo === 'OS'
      ? 'OS ' + i.num_os + ' <span class="obs">(a faturar)</span>'
      : 'NF ' + i.numero_nf + (i.num_os ? ' <span class="obs">· OS ' + i.num_os + '</span>' : '');
    return '<tr>' +
      '<td class="c">' + (n + 1) + '</td>' +
      '<td>' + doc + '</td>' +
      '<td>' + crEsc(i.cliente) + '</td>' +
      '<td class="c">' + crEsc(i.cliente_cnpj || '—') + '</td>' +
      '<td class="c">' + (i.emissao ? crDataLonga(i.emissao) : '—') + '</td>' +
      '<td class="c">' + crDataLonga(i.vencimento) + '</td>' +
      '<td class="c">' + i.prazo_dias + '</td>' +
      '<td class="n">' + crBRL(i.valor) + '</td></tr>';
  }).join('');

  const c = d.calculo;
  const html =
'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />' +
'<title>' + crEsc(d.titulo) + ' ' + crEsc(d.numero) + '</title><style>' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#111827;padding:28px 32px;font-size:12px;line-height:1.45}' +
'.top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid #111827;padding-bottom:14px;margin-bottom:18px}' +
'.emp{font-size:19px;font-weight:800;letter-spacing:-.3px}' +
'.emp small{display:block;font-size:11px;font-weight:500;color:#6b7280;margin-top:2px}' +
'.doc{text-align:right}' +
'.doc h1{font-size:14px;font-weight:800;letter-spacing:.6px}' +
'.doc .num{font-size:22px;font-weight:800;margin-top:2px}' +
'.doc .dt{font-size:11px;color:#6b7280;margin-top:2px}' +
'.rasc{display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:800;letter-spacing:.4px;margin-top:6px}' +
'.blocos{display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap}' +
'.bloco{flex:1 1 220px;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px}' +
'.bloco h2{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#6b7280;margin-bottom:5px}' +
'.bloco .l{display:flex;justify-content:space-between;gap:10px;padding:1px 0}' +
'.bloco .l b{font-variant-numeric:tabular-nums}' +
'table{width:100%;border-collapse:collapse;margin-bottom:16px}' +
'th{background:#111827;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:6px 7px;text-align:left}' +
'td{padding:5px 7px;border-bottom:1px solid #f3f4f6;font-size:11px}' +
'tr:nth-child(even) td{background:#fafafa}' +
'.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
'.c{text-align:center;white-space:nowrap}' +
'.obs{color:#6b7280;font-size:9px}' +
'tfoot td{background:#f3f4f6!important;font-weight:800;border-top:2px solid #111827;font-size:12px}' +
'.resumo{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px}' +
'.rz{flex:1 1 130px;border:1px solid #e5e7eb;border-radius:6px;padding:9px 12px}' +
'.rz span{display:block;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#6b7280}' +
'.rz b{display:block;font-size:15px;margin-top:2px;font-variant-numeric:tabular-nums}' +
'.rz.liq{background:#f5f3ff;border-color:#ddd6fe}.rz.liq b{color:#6d28d9}' +
'.rz.cst b{color:#b45309}' +
'.assin{display:flex;gap:40px;margin-top:44px}' +
'.assin div{flex:1;border-top:1px solid #9ca3af;padding-top:5px;font-size:10px;color:#6b7280;text-align:center}' +
'.rodape{margin-top:18px;font-size:9px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px;line-height:1.6}' +
'@media print{body{padding:14px 16px}.noprint{display:none}@page{margin:12mm}}' +
'.noprint{position:fixed;top:10px;right:10px;display:flex;gap:8px}' +
'.noprint button{font:inherit;font-size:12px;font-weight:700;padding:8px 14px;border-radius:7px;border:1px solid #d1d5db;background:#fff;cursor:pointer}' +
'.noprint button.p{background:#111827;color:#fff;border-color:#111827}' +
'</style></head><body>' +
'<div class="noprint"><button class="p" onclick="window.print()">Salvar em PDF / Imprimir</button><button onclick="window.close()">Fechar</button></div>' +
'<div class="top">' +
  '<div><div class="emp">GRUPO RENOVA<small>Renova Truck · Sistema de Gestão Gerencial</small></div></div>' +
  '<div class="doc"><h1>' + crEsc(d.titulo) + '</h1><div class="num">Nº ' + crEsc(d.numero) + '</div>' +
  '<div class="dt">Emitido em ' + crDataLonga(d.data) + '</div>' +
  (d.rascunho ? '<div class="rasc">SIMULAÇÃO — SUJEITO À APROVAÇÃO</div>' : '') + '</div>' +
'</div>' +
'<div class="blocos">' +
  '<div class="bloco"><h2>Parceiro financeiro</h2>' +
    '<div class="l"><span>Nome</span><b>' + crEsc(d.parceiro ? d.parceiro.nome : '—') + '</b></div>' +
    '<div class="l"><span>Tipo</span><b>' + crEsc(d.parceiro && d.parceiro.tipo ? d.parceiro.tipo : '—') + '</b></div>' +
    '<div class="l"><span>CNPJ</span><b>' + crEsc(d.parceiro && d.parceiro.cnpj ? d.parceiro.cnpj : '—') + '</b></div>' +
    '<div class="l"><span>Contato</span><b>' + crEsc(d.parceiro && d.parceiro.contato ? d.parceiro.contato : '—') + '</b></div>' +
  '</div>' +
  '<div class="bloco"><h2>Condições aplicadas</h2>' +
    '<div class="l"><span>Taxa</span><b>' + (c.taxa ? c.taxa.toLocaleString('pt-BR') + '% a.m.' : '—') + '</b></div>' +
    '<div class="l"><span>Tarifa por título</span><b>' + crBRL(c.tarifa || 0) + '</b></div>' +
    '<div class="l"><span>TAC</span><b>' + crBRL(c.tac || 0) + '</b></div>' +
    '<div class="l"><span>Prazo médio ponderado</span><b>' + c.prazo.toLocaleString('pt-BR') + ' dias</b></div>' +
  '</div>' +
'</div>' +
'<table><thead><tr>' +
  '<th style="width:26px">#</th><th>Documento</th><th>Sacado</th><th class="c">CNPJ</th>' +
  '<th class="c">Emissão</th><th class="c">Vencimento</th><th class="c">Prazo</th><th class="n">Valor de face</th>' +
'</tr></thead><tbody>' + linhas + '</tbody>' +
'<tfoot><tr><td colspan="7">TOTAL — ' + c.qtd + ' título(s)</td><td class="n">' + crBRL(c.bruto) + '</td></tr></tfoot></table>' +
'<div class="resumo">' +
  '<div class="rz"><span>Valor de face</span><b>' + crBRL(c.bruto) + '</b></div>' +
  '<div class="rz cst"><span>Deságio estimado</span><b>' + crBRL(c.desagio) + '</b></div>' +
  '<div class="rz liq"><span>Líquido estimado</span><b>' + crBRL(c.liquido) + '</b></div>' +
'</div>' +
'<div class="assin"><div>Grupo Renova</div><div>' + crEsc(d.parceiro ? d.parceiro.nome : 'Parceiro financeiro') + '</div></div>' +
'<div class="rodape">' +
  'Documento gerado pelo Sistema de Gestão Gerencial do Grupo Renova em ' +
  new Date().toLocaleString('pt-BR') + '.<br>' +
  'Os valores de deságio e líquido são <b>estimativa</b> calculada com as condições cadastradas para o parceiro e valem como conferência; ' +
  'prevalece o borderô oficial emitido pela instituição.' +
  (d.itens.some(i => i.tipo === 'OS')
    ? '<br>Itens marcados como <b>OS (a faturar)</b> são ordens de serviço ainda sem nota fiscal emitida; o vencimento apresentado é estimado.'
    : '') +
'</div></body></html>';

  const w = window.open('', '_blank');
  if (!w) { crAviso('O navegador bloqueou a janela do borderô. Libere os pop-ups para este site e tente de novo.', 'erro'); return; }
  w.document.write(html);
  w.document.close();
}

function crBorderoXLSX(d) {
  if (typeof XLSX === 'undefined') { crAviso('Biblioteca de Excel não carregou. Tente recarregar a página.', 'erro'); return; }
  const c = d.calculo;
  const linhas = [
    ['GRUPO RENOVA — ' + d.titulo],
    ['Operação', d.numero, '', 'Data', crDataLonga(d.data)],
    ['Parceiro', d.parceiro ? d.parceiro.nome : '', '', 'CNPJ', d.parceiro && d.parceiro.cnpj ? d.parceiro.cnpj : ''],
    ['Taxa (% a.m.)', c.taxa || 0, 'Tarifa/título', c.tarifa || 0, 'TAC', c.tac || 0],
    [],
    ['#', 'Tipo', 'Documento', 'OS', 'Sacado', 'CNPJ do sacado', 'Emissão', 'Vencimento', 'Prazo (dias)', 'Valor de face']
  ];
  d.itens.forEach((i, n) => linhas.push([
    n + 1, i.tipo === 'OS' ? 'OS a faturar' : 'Duplicata',
    i.tipo === 'OS' ? 'OS ' + i.num_os : 'NF ' + i.numero_nf,
    i.num_os || '', i.cliente, i.cliente_cnpj || '',
    i.emissao ? crDataLonga(i.emissao) : '', crDataLonga(i.vencimento),
    i.prazo_dias, Number(i.valor) || 0
  ]));
  linhas.push([]);
  linhas.push(['', '', '', '', '', '', '', 'TOTAL DE FACE', c.qtd, c.bruto]);
  linhas.push(['', '', '', '', '', '', '', 'PRAZO MÉDIO PONDERADO', '', c.prazo]);
  linhas.push(['', '', '', '', '', '', '', 'DESÁGIO ESTIMADO', '', c.desagio]);
  linhas.push(['', '', '', '', '', '', '', 'LÍQUIDO ESTIMADO', '', c.liquido]);

  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = [{ wch: 4 }, { wch: 13 }, { wch: 15 }, { wch: 8 }, { wch: 42 }, { wch: 20 },
                 { wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Borderô');
  const nome = (d.rascunho ? 'pre-bordero' : 'bordero-' + d.numero) + '-' +
    (d.parceiro ? d.parceiro.nome.replace(/[^\w]+/g, '-').toLowerCase() : 'parceiro') + '.xlsx';
  XLSX.writeFile(wb, nome);
}

// ═══════════════════════════════════════════════════════════════════════════
// ABA OPERAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

function crRenderOperacoes() {
  const emAberto = crAtivos().filter(t => crEmAberto(t) && crAntecipado(t));
  const exposicao = emAberto.reduce((s, t) => s + crSaldo(t), 0);
  const risco = emAberto.filter(crEmRisco).reduce((s, t) => s + crSaldo(t), 0);
  const limite7 = crSomaDias(CR.hoje, 7);
  const sete = emAberto.filter(t => t.data_vencimento >= CR.hoje && t.data_vencimento <= limite7);
  const aguardando = CR.antecipacoesOS.filter(a => a.status === 'AGUARDANDO_FATURAMENTO');

  document.getElementById('cr-o-exposicao').textContent = crBRL(exposicao);
  document.getElementById('cr-o-exposicao-sub').textContent = emAberto.length + ' título(s) com o parceiro';
  document.getElementById('cr-o-risco').textContent = crBRL(risco);
  document.getElementById('cr-o-risco-sub').textContent =
    emAberto.filter(crEmRisco).length + ' título(s) vencidos e não pagos';
  document.getElementById('cr-o-7dias').textContent = crBRL(sete.reduce((s, t) => s + crSaldo(t), 0));
  document.getElementById('cr-o-7dias-sub').textContent = sete.length + ' título(s) antecipados';
  document.getElementById('cr-o-osaguard').textContent =
    crBRL(aguardando.reduce((s, a) => s + (Number(a.valor_antecipado) || 0), 0));
  document.getElementById('cr-o-osaguard-sub').textContent = aguardando.length + ' OS antecipadas sem nota';

  const podeEditar = crPodeEditar();
  const ops = CR.operacoes.slice().sort((a, b) =>
    (b.data_operacao || '').localeCompare(a.data_operacao || '') || Number(b.numero) - Number(a.numero));

  document.getElementById('cr-tb-operacoes').innerHTML = ops.length ? ops.map(o => {
    const liq = Number(o.valor_liquido) || 0;
    const desagio = o.status === 'LIQUIDADA' ? Number(o.custo_real) || 0 : Number(o.desagio_estimado) || 0;
    const liquido = o.status === 'LIQUIDADA' ? liq : Number(o.liquido_estimado) || 0;
    const semDespesa = o.status === 'LIQUIDADA' && !o.titulo_despesa_id && Number(o.custo_real) > 0.005;
    return '<tr>' +
      '<td style="font-weight:900;">' + crEsc(o.numero || o.id) + '</td>' +
      '<td style="white-space:nowrap;">' + crData(o.data_operacao) + '</td>' +
      '<td class="cr-cli">' + crEsc(o.parceiro) + '</td>' +
      '<td class="cr-col-apoio">' + (Number(o.qtd_titulos) || 0) + ' NF' +
        (Number(o.qtd_os) ? ' + ' + o.qtd_os + ' OS' : '') + '</td>' +
      '<td class="cr-num" style="font-weight:800;">' + crBRL(o.valor_bruto) + '</td>' +
      '<td class="cr-num cr-col-apoio">' + (Number(o.prazo_medio) || 0).toLocaleString('pt-BR') + 'd</td>' +
      '<td class="cr-num" style="color:#b45309;">' + crBRL(desagio) +
        (o.status !== 'LIQUIDADA' ? '<div class="cr-sub">estimado</div>' : '') + '</td>' +
      '<td class="cr-num" style="font-weight:800;color:var(--ant);">' + crBRL(liquido) + '</td>' +
      '<td class="cr-num cr-col-apoio">' + (Number(o.taxa_efetiva_mes) ? Number(o.taxa_efetiva_mes).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%' : '—') + '</td>' +
      '<td><span class="cr-pill cr-pill-' + o.status + '">' + crStatusOp(o.status) + '</span>' +
        (semDespesa ? '<div class="cr-sub" style="color:var(--risco);font-weight:800;">despesa não lançada</div>' : '') + '</td>' +
      '<td style="white-space:nowrap;text-align:right;">' +
        '<button class="cr-acao" onclick="crAbrirOperacao(\'' + o.id + '\')" title="Ver itens e borderô"><i class="fa-solid fa-eye"></i></button>' +
        (podeEditar && (o.status === 'RASCUNHO' || o.status === 'ENVIADA') ?
          '<button class="cr-acao ant" onclick="crMudarStatusOp(\'' + o.id + '\',\'' + (o.status === 'RASCUNHO' ? 'ENVIADA' : 'APROVADA') + '\')" title="' +
          (o.status === 'RASCUNHO' ? 'Marcar como enviada ao parceiro' : 'Marcar como aprovada pelo parceiro') + '"><i class="fa-solid fa-forward"></i></button>' : '') +
        (podeEditar && o.status !== 'LIQUIDADA' && o.status !== 'CANCELADA' ?
          '<button class="cr-acao baixar" onclick="crAbrirLiquidar(\'' + o.id + '\')" title="Informar crédito recebido"><i class="fa-solid fa-sack-dollar"></i></button>' : '') +
        (podeEditar && semDespesa ?
          '<button class="cr-acao excluir" onclick="crRelancarDespesa(\'' + o.id + '\')" title="Relançar a despesa no Contas a Pagar"><i class="fa-solid fa-rotate-right"></i></button>' : '') +
      '</td></tr>';
  }).join('') : '<tr><td colspan="11" class="cr-vazio">Nenhuma operação registrada ainda.<br>' +
      'Monte um pacote na aba <b>Antecipar</b>.</td></tr>';
}

const crStatusOp = s => ({ RASCUNHO: 'Rascunho', ENVIADA: 'Enviada', APROVADA: 'Aprovada',
                           LIQUIDADA: 'Liquidada', CANCELADA: 'Cancelada' }[s] || s);

async function crMudarStatusOp(id, status) {
  try {
    await crPost('operacao_status', { id, status });
    await crCarregar();
    crAviso('Operação marcada como ' + crStatusOp(status).toLowerCase() + '.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui mudar o status.</b> ' + crEsc(e.message), 'erro');
  }
}

function crAbrirOperacao(id) {
  const op = crOperacao(id);
  if (!op) return;
  CR.opAberta = op;
  document.getElementById('cr-op-titulo').textContent = 'Operação nº ' + (op.numero || op.id);
  document.getElementById('cr-op-sub').textContent =
    op.parceiro + ' · ' + crDataLonga(op.data_operacao) + ' · ' + crStatusOp(op.status);

  const liquidada = op.status === 'LIQUIDADA';
  // Cancelar é o caminho normal e some quando não cabe; excluir fica sempre à
  // mão, mas o servidor barra o que já encostou em dinheiro ou em nota.
  const btnCancelar = document.getElementById('cr-op-cancelar');
  if (btnCancelar) btnCancelar.classList.toggle('cr-oculto', liquidada || op.status === 'CANCELADA');
  const btnEditar = document.getElementById('cr-op-editar');
  if (btnEditar) btnEditar.classList.toggle('cr-oculto', op.status === 'CANCELADA');

  document.getElementById('cr-op-resumo').innerHTML =
    '<div class="cr-resumo-linha"><span>Valor de face</span><b>' + crBRL(op.valor_bruto) + '</b></div>' +
    '<div class="cr-resumo-linha"><span>Prazo médio ponderado</span><b>' + (Number(op.prazo_medio) || 0).toLocaleString('pt-BR') + ' dias</b></div>' +
    '<div class="cr-resumo-linha"><span>Condições (taxa / tarifa / TAC)</span><b>' +
      (Number(op.taxa_mes) || 0).toLocaleString('pt-BR') + '% a.m. · ' + crBRL(op.tarifa_titulo) + ' · ' + crBRL(op.tac) + '</b></div>' +
    '<div class="cr-resumo-linha"><span>Deságio estimado</span><b>' + crBRL(op.desagio_estimado) + '</b></div>' +
    (liquidada
      ? '<div class="cr-resumo-linha"><span>Deságio real</span><b style="color:#b45309;">' + crBRL(op.custo_real) + '</b></div>' +
        '<div class="cr-resumo-linha"><span>Taxa efetiva</span><b>' + (Number(op.taxa_efetiva_mes) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% a.m.</b></div>' +
        '<div class="cr-resumo-linha"><span>Crédito em</span><b>' + crDataLonga(op.data_credito) + '</b></div>' +
        '<div class="cr-resumo-linha"><span>Despesa no Contas a Pagar</span><b>' +
          (op.titulo_despesa_id ? crEsc(op.titulo_despesa_id) + ' · 3.07' : '<span style="color:var(--risco);">não lançada</span>') + '</b></div>' +
        '<div class="cr-resumo-linha destaque"><span>Líquido creditado</span><b style="color:var(--ant);">' + crBRL(op.valor_liquido) + '</b></div>'
      : '<div class="cr-resumo-linha destaque"><span>Líquido estimado</span><b style="color:var(--ant);">' + crBRL(op.liquido_estimado) + '</b></div>');

  document.getElementById('cr-tb-op-itens').innerHTML = (op.itens || []).length
    ? op.itens.slice().sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')).map(i => {
        const t = i.tipo === 'TITULO' ? CR.titulos.filter(x => x.id === i.ref_id)[0] : null;
        const ant = i.tipo === 'OS' ? CR.antecipacoesOS.filter(a => a.id === i.ref_id)[0] : null;
        let situacao;
        if (t) {
          const sit = crSituacao(t);
          situacao = '<span class="cr-pill ' + CR_SIT[sit].pill + '">' + CR_SIT[sit].nome + '</span>' +
            (t.status === 'RECEBIDO' ? ' <span class="cr-pill cr-pill-RECEBIDO">Pago</span>' : '');
        } else if (ant) {
          situacao = ant.status === 'FATURADA'
            ? '<span class="cr-pill cr-pill-RECEBIDO">Faturada · NF ' + crEsc(ant.nfs_geradas || '—') + '</span>'
            : ant.status === 'CANCELADA'
              ? '<span class="cr-pill cr-pill-CANCELADA">Cancelada</span>'
              : '<span class="cr-pill cr-pill-ant">Aguardando faturamento</span>';
        } else { situacao = '—'; }
        return '<tr>' +
          '<td>' + (i.tipo === 'OS' ? '<span class="cr-pill cr-pill-ant">OS</span>' : 'Duplicata') + '</td>' +
          '<td class="cr-cli">' + crEsc(i.cliente) + '</td>' +
          '<td>' + (i.tipo === 'OS' ? 'OS ' + crEsc(i.num_os) : 'NF ' + crEsc(t ? crRotuloNF(t) : i.numero_nf)) + '</td>' +
          '<td style="white-space:nowrap;">' + crDataLonga(i.vencimento) + '</td>' +
          '<td class="cr-num">' + (Number(i.prazo_dias) || 0) + 'd</td>' +
          '<td class="cr-num" style="font-weight:800;">' + crBRL(i.valor) + '</td>' +
          '<td>' + situacao + '</td></tr>';
      }).join('')
    : '<tr><td colspan="7" class="cr-vazio">Operação sem itens.</td></tr>';

  document.getElementById('cr-op-cancelar').style.display =
    crPodeEditar() && op.status !== 'LIQUIDADA' && op.status !== 'CANCELADA' ? '' : 'none';
  crAbrir('cr-modal-operacao');
}

/** Operação liquidada também se edita — o que muda é o que fica editável. */
function crAbrirEditarOperacao() {
  const op = CR.opAberta;
  if (!op || !crPodeEditar()) return;
  if (op.status === 'CANCELADA') { crAviso('Operação cancelada não se edita.', 'erro'); return; }

  document.getElementById('cr-oe-sub').textContent =
    'Operação nº ' + (op.numero || op.id) + ' · ' + crStatusOp(op.status);

  const sel = document.getElementById('cr-oe-parceiro');
  sel.innerHTML = CR.parceiros.filter(p => p.ativo || p.id === op.parceiro_id)
    .map(p => '<option value="' + p.id + '">' + crEsc(p.nome) +
      (p.taxa_mes ? ' — ' + Number(p.taxa_mes).toLocaleString('pt-BR') + '% a.m.' : '') + '</option>').join('');
  sel.value = op.parceiro_id || '';

  document.getElementById('cr-oe-data').value = op.data_operacao || CR.hoje;
  document.getElementById('cr-oe-obs').value = op.observacao || '';

  const liquidada = op.status === 'LIQUIDADA';
  document.getElementById('cr-oe-liq').style.display = liquidada ? '' : 'none';
  if (liquidada) {
    document.getElementById('cr-oe-liquido').value =
      (Number(op.valor_liquido) || 0).toFixed(2).replace('.', ',');
    document.getElementById('cr-oe-credito').value = op.data_credito || '';
  }
  crAbrir('cr-modal-op-editar');
}

async function crSalvarEdicaoOperacao() {
  const op = CR.opAberta;
  if (!op) return;
  const corpo = {
    id: op.id,
    parceiro_id: document.getElementById('cr-oe-parceiro').value,
    data_operacao: document.getElementById('cr-oe-data').value,
    observacao: document.getElementById('cr-oe-obs').value.trim()
  };
  if (op.status === 'LIQUIDADA') {
    corpo.valor_liquido = crNum(document.getElementById('cr-oe-liquido').value);
    corpo.data_credito = document.getElementById('cr-oe-credito').value;
  }
  try {
    const r = await crPost('operacao_editar', corpo);
    crFechar('cr-modal-op-editar');
    crFechar('cr-modal-operacao');
    await crCarregar();
    crAviso('<b>Operação atualizada.</b>' +
      ((r.avisos || []).length ? ' ' + r.avisos.map(crEsc).join(' ') : ''),
      (r.avisos || []).length ? 'info' : 'ok');
  } catch (e) {
    crAviso('<b>Não consegui salvar.</b> ' + crEsc(e.message), 'erro');
  }
}

/**
 * Excluir apaga do histórico; cancelar deixa rastro. O caminho normal é
 * cancelar — excluir é para o borderô lançado errado, que só suja a base.
 */
async function crExcluirOperacao() {
  const op = CR.opAberta;
  if (!op || !crPodeEditar()) return;
  const rotulo = 'nº ' + (op.numero || op.id);
  if (!confirm('Excluir a operação ' + rotulo + ' de vez?\n\n' +
               'A operação, os itens do borderô e as antecipações de OS somem da base, e os ' +
               'títulos voltam a ficar livres. Não dá para desfazer.\n\n' +
               'Se a operação existiu de verdade e só terminou sem efeito, o certo é ' +
               'CANCELAR — assim ela continua no histórico.')) return;
  if (!confirm('Confirma a exclusão definitiva da operação ' + rotulo + '?')) return;
  try {
    const r = await crPost('operacao_excluir', { id: op.id, confirmar: true });
    crFechar('cr-modal-operacao');
    await crCarregar();
    crAviso('Operação ' + rotulo + ' excluída. ' + r.titulos_liberados + ' título(s) devolvido(s).', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui excluir.</b> ' + crEsc(e.message), 'erro');
  }
}

async function crCancelarOperacao() {
  const op = CR.opAberta;
  if (!op) return;
  if (!confirm('Cancelar a operação nº ' + (op.numero || op.id) + '?\n\n' +
               'Os títulos voltam a ficar livres e as OSs voltam para a fila de antecipáveis.')) return;
  try {
    const r = await crPost('operacao_cancelar', { id: op.id });
    crFechar('cr-modal-operacao');
    await crCarregar();
    crAviso('Operação cancelada. ' + r.titulos_liberados + ' título(s) e ' + r.os_liberadas + ' OS devolvidos.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui cancelar.</b> ' + crEsc(e.message), 'erro');
  }
}

// ── Liquidação ───────────────────────────────────────────────────────────────
function crAbrirLiquidar(id) {
  const op = crOperacao(id);
  if (!op) return;
  CR.opAberta = op;
  document.getElementById('cr-l-sub').textContent =
    'Operação nº ' + (op.numero || op.id) + ' · ' + op.parceiro;
  document.getElementById('cr-l-resumo').innerHTML =
    '<div class="cr-resumo-linha"><span>Valor de face</span><b>' + crBRL(op.valor_bruto) + '</b></div>' +
    '<div class="cr-resumo-linha"><span>Prazo médio</span><b>' + (Number(op.prazo_medio) || 0).toLocaleString('pt-BR') + ' dias</b></div>' +
    '<div class="cr-resumo-linha"><span>Deságio estimado</span><b>' + crBRL(op.desagio_estimado) + '</b></div>' +
    '<div class="cr-resumo-linha"><span>Líquido estimado</span><b>' + crBRL(op.liquido_estimado) + '</b></div>';
  document.getElementById('cr-l-liquido').value =
    (Number(op.liquido_estimado) || 0).toFixed(2).replace('.', ',');
  document.getElementById('cr-l-data').value = CR.hoje;
  crPreverCusto();
  crAbrir('cr-modal-liquidar');
}

function crPreverCusto() {
  const op = CR.opAberta;
  if (!op) return;
  const bruto = Number(op.valor_bruto) || 0;
  const liq = crNum(document.getElementById('cr-l-liquido').value);
  const custo = Math.round((bruto - liq) * 100) / 100;
  const prazo = Number(op.prazo_medio) || 0;
  const efetiva = (bruto > 0 && prazo > 0) ? (custo / bruto) / (prazo / 30) * 100 : 0;
  const dif = Math.round(((Number(op.desagio_estimado) || 0) - custo) * 100) / 100;

  document.getElementById('cr-l-custo').textContent = crBRL(custo);
  document.getElementById('cr-l-custo').style.color = custo < 0 ? 'var(--risco)' : '';
  document.getElementById('cr-l-taxa').textContent =
    efetiva ? efetiva.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% a.m.' : '—';
  const elDif = document.getElementById('cr-l-dif');
  elDif.textContent = (dif >= 0 ? '+' : '') + crBRL(dif) + (dif >= 0 ? ' a favor' : ' acima do previsto');
  elDif.style.color = dif >= 0 ? '#15803d' : '#b91c1c';
}

async function crConfirmarLiquidacao() {
  const op = CR.opAberta;
  if (!op) return;
  const liquido = crNum(document.getElementById('cr-l-liquido').value);
  const data = document.getElementById('cr-l-data').value;
  if (liquido <= 0) { crAviso('Informe o valor líquido creditado.', 'erro'); return; }
  if (!data) { crAviso('Informe a data do crédito.', 'erro'); return; }

  const custo = Math.round(((Number(op.valor_bruto) || 0) - liquido) * 100) / 100;
  if (!confirm('Confirmar o crédito de ' + crBRL(liquido) + ' em ' + crDataLonga(data) + '?\n\n' +
               (custo > 0
                 ? 'O custo de ' + crBRL(custo) + ' será lançado no Contas a Pagar como ' +
                   '3.07 Juros de Operações Financeiras, já baixado.'
                 : 'Sem custo: nada será lançado no Contas a Pagar.'))) return;

  try {
    const r = await crPost('operacao_liquidar', { id: op.id, valor_liquido: liquido, data_credito: data });
    crFechar('cr-modal-liquidar');
    await crCarregar();
    if (r.aviso_despesa) {
      crAviso('Crédito registrado, <b>mas a despesa financeira não foi lançada</b>: ' + crEsc(r.aviso_despesa) +
              '<br>Use o botão <i class="fa-solid fa-rotate-right"></i> na linha da operação para relançar.', 'aviso');
    } else {
      crAviso('Operação liquidada. Custo de ' + crBRL(r.custo_real) +
              (r.titulo_despesa_id ? ' lançado no Contas a Pagar (' + crEsc(r.titulo_despesa_id) + ').' : '.'), 'ok');
    }
  } catch (e) {
    crAviso('<b>Não consegui liquidar.</b> ' + crEsc(e.message), 'erro');
  }
}

async function crRelancarDespesa(id) {
  if (!confirm('Relançar a despesa financeira desta operação no Contas a Pagar?')) return;
  try {
    const r = await crPost('operacao_relancar', { id });
    await crCarregar();
    crAviso('Despesa lançada no Contas a Pagar: ' + crEsc(r.titulo_despesa_id) + '.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui relançar.</b> ' + crEsc(e.message), 'erro');
  }
}

async function crReconciliar() {
  crAviso('Procurando notas emitidas a partir de OSs antecipadas…', 'info');
  try {
    const r = await crPost('reconciliar_os', {});
    await crCarregar();
    crAviso(r.titulos_marcados
      ? '<b>' + r.titulos_marcados + ' título(s)</b> marcados como antecipados e ' +
        r.os_faturadas + ' OS baixada(s) da fila de faturamento.'
      : 'Nada a reconciliar: nenhuma OS antecipada virou nota ainda.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui reconciliar.</b> ' + crEsc(e.message), 'erro');
  }
}

// ── Carteira antecipada ──────────────────────────────────────────────────────
function crCarteira() {
  const parceiro = document.getElementById('cr-c-parceiro').value;
  const sit = document.getElementById('cr-c-sit').value;
  return crAtivos().filter(t => {
    if (String(t.antecipado).toUpperCase() !== 'SIM') return false;
    if (parceiro && t.parceiro_id !== parceiro) return false;
    if (sit === 'aberto' && !(crEmAberto(t) && t.situacao_antec !== 'RECOMPRADO')) return false;
    if (sit === 'risco' && !crEmRisco(t)) return false;
    return true;
  }).sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
}

function crRenderCarteira() {
  const lista = crCarteira();
  const podeEditar = crPodeEditar();

  document.getElementById('cr-tb-carteira').innerHTML = lista.length ? lista.map(t => {
    const sit = crSituacao(t);
    const op = crOperacao(t.operacao_id);
    const parc = crParceiro(t.parceiro_id);
    const marcado = !!CR.selCarteira[t.id];
    const dias = crVencido(t) ? crDias(t.data_vencimento, CR.hoje) : 0;
    const podeMexer = podeEditar && crEmAberto(t) && t.situacao_antec !== 'RECOMPRADO';
    return '<tr class="' + (marcado ? 'sel ' : '') + (sit === 'risco' ? 'risco' : '') + '">' +
      '<td>' + (podeMexer
        ? '<input type="checkbox" ' + (marcado ? 'checked' : '') + ' onchange="crMarcarCarteira(\'' + t.id + '\',this.checked)" />'
        : '') + '</td>' +
      '<td style="white-space:nowrap;">' + crDataLonga(t.data_vencimento) +
        (dias > 0 ? ' <span class="cr-pill cr-pill-atraso">' + dias + 'd</span>' : '') + '</td>' +
      '<td class="cr-cli" title="' + crEsc(t.cliente) + '">' + crEsc(t.cliente) + '</td>' +
      '<td class="cr-col-apoio">' + crEsc(crRotuloNF(t)) + '</td>' +
      '<td class="cr-col-apoio">' + (op ? crEsc(op.numero || op.id) : '—') + '</td>' +
      '<td>' + crEsc(parc ? parc.nome : '—') + '</td>' +
      '<td class="cr-num" style="font-weight:800;">' + crBRL(crSaldo(t) || t.valor_total) + '</td>' +
      '<td><span class="cr-pill ' + CR_SIT[sit].pill + '">' + CR_SIT[sit].nome + '</span>' +
        (t.status === 'RECEBIDO' ? ' <span class="cr-pill cr-pill-RECEBIDO">Pago pelo cliente</span>' : '') +
        (t.situacao_antec === 'RECOMPRADO' && t.recompra_em ? '<div class="cr-sub">recomprado em ' + crData(t.recompra_em) + '</div>' : '') +
      '</td></tr>';
  }).join('') : '<tr><td colspan="8" class="cr-vazio">Nenhum título antecipado com esses filtros.</td></tr>';

  const emAberto = lista.filter(t => crEmAberto(t) && t.situacao_antec !== 'RECOMPRADO');
  const risco = lista.filter(crEmRisco);
  document.getElementById('cr-carteira-resumo').innerHTML =
    lista.length + ' título(s) · em aberto ' + crBRL(emAberto.reduce((s, t) => s + crSaldo(t), 0)) +
    (risco.length ? ' · <span style="color:var(--risco);font-weight:800;">' + risco.length + ' em risco</span>' : '');

  crAtualizarLoteCarteira();
}

function crMarcarCarteira(id, m) { if (m) CR.selCarteira[id] = true; else delete CR.selCarteira[id]; crRenderCarteira(); }
function crLimparLoteCarteira() { CR.selCarteira = {}; crRenderCarteira(); }

function crAtualizarLoteCarteira() {
  const ids = Object.keys(CR.selCarteira);
  const barra = document.getElementById('cr-lote-c');
  barra.classList.toggle('on', ids.length > 0);
  if (!ids.length) return;
  const sel = CR.titulos.filter(t => CR.selCarteira[t.id]);
  document.getElementById('cr-lote-c-qtd').textContent = sel.length;
  document.getElementById('cr-lote-c-valor').textContent = crBRL(sel.reduce((s, t) => s + crSaldo(t), 0));
}

function crAbrirRecompra() {
  const ids = Object.keys(CR.selCarteira);
  if (!ids.length) return;
  const sel = CR.titulos.filter(t => CR.selCarteira[t.id]);
  document.getElementById('cr-r-sub').textContent =
    sel.length + ' título(s) · ' + crBRL(sel.reduce((s, t) => s + crSaldo(t), 0));
  document.getElementById('cr-r-data').value = CR.hoje;
  crAbrir('cr-modal-recompra');
}

async function crConfirmarRecompra() {
  const ids = Object.keys(CR.selCarteira);
  if (!ids.length) return;
  try {
    const r = await crPost('titulo_recompra', { ids, data: document.getElementById('cr-r-data').value });
    crFechar('cr-modal-recompra');
    CR.selCarteira = {};
    await crCarregar();
    crAviso(r.marcados + ' título(s) marcados como recomprados. Eles continuam em aberto contra o cliente.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui marcar.</b> ' + crEsc(e.message), 'erro');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BI DAS ANTECIPAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

function crOperacoesDoPeriodo() {
  const p = document.getElementById('cr-bi-periodo').value;
  return CR.operacoes.filter(o => {
    if (o.status === 'CANCELADA') return false;
    if (p === 'mes') return String(o.data_operacao || '').slice(0, 7) === CR.competencia;
    if (p === 'ano') return String(o.data_operacao || '').slice(0, 4) === CR.competencia.slice(0, 4);
    return true;
  });
}

function crRenderBI() {
  const ops = crOperacoesDoPeriodo();
  const liq = ops.filter(o => o.status === 'LIQUIDADA');

  const volume = liq.reduce((s, o) => s + (Number(o.valor_bruto) || 0), 0);
  const custo = liq.reduce((s, o) => s + (Number(o.custo_real) || 0), 0);
  const liquido = liq.reduce((s, o) => s + (Number(o.valor_liquido) || 0), 0);
  // Taxa média ponderada pelo volume: média simples faria uma operação de
  // R$ 2 mil pesar igual a uma de R$ 200 mil.
  const taxaMedia = volume > 0
    ? liq.reduce((s, o) => s + (Number(o.taxa_efetiva_mes) || 0) * (Number(o.valor_bruto) || 0), 0) / volume
    : 0;

  document.getElementById('cr-bi-volume').textContent = crBRL(volume);
  document.getElementById('cr-bi-volume-sub').textContent =
    liq.length + ' operação(ões) liquidada(s)' + (ops.length > liq.length ? ' de ' + ops.length : '');
  document.getElementById('cr-bi-custo').textContent = crBRL(custo);
  document.getElementById('cr-bi-custo-sub').textContent =
    volume > 0 ? (custo / volume * 100).toFixed(2) + '% do volume antecipado' : '—';
  document.getElementById('cr-bi-taxa').textContent =
    taxaMedia ? taxaMedia.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%' : '—';
  document.getElementById('cr-bi-liquido').textContent = crBRL(liquido);

  crChartBIParceiro(liq);
  crChartBICliente(ops);
  crChartBIMes(liq);
  crRenderBIParceiros();
  crRenderBIClientes();
  crRenderBIOps(liq);
}

function crChartBIParceiro(liq) {
  const por = {};
  liq.forEach(o => { por[o.parceiro || '—'] = (por[o.parceiro || '—'] || 0) + (Number(o.valor_bruto) || 0); });
  const chaves = Object.keys(por).sort((a, b) => por[b] - por[a]);

  crDestruir('biParceiro');
  const ctx = document.getElementById('cr-c-bi-parceiro');
  if (!ctx) return;
  if (!chaves.length) { ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height); return; }

  CR.charts.biParceiro = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chaves,
      datasets: [{ data: chaves.map(k => por[k]), backgroundColor: chaves.map((_, i) => CR_CORES[i % CR_CORES.length]), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, family: 'DM Sans' }, padding: 10 } },
        tooltip: {
          callbacks: {
            label: c => {
              const total = c.dataset.data.reduce((s, v) => s + v, 0);
              const p = total ? (c.parsed / total * 100).toFixed(1) : 0;
              return ' ' + c.label + ': ' + crBRL(c.parsed) + ' (' + p + '%)';
            }
          }
        }
      }
    }
  });
}

function crChartBICliente(ops) {
  const por = {};
  ops.forEach(o => (o.itens || []).forEach(i => {
    const c = i.cliente || '—';
    por[c] = (por[c] || 0) + (Number(i.valor) || 0);
  }));
  const ranking = Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 7);

  crDestruir('biCliente');
  const ctx = document.getElementById('cr-c-bi-cliente');
  if (!ctx) return;
  if (!ranking.length) { ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height); return; }

  CR.charts.biCliente = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ranking.map(r => r[0].length > 24 ? r[0].slice(0, 23) + '…' : r[0]),
      datasets: [{ data: ranking.map(r => r[1]), backgroundColor: '#7c3aed', borderRadius: 5, maxBarThickness: 20 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ' ' + crBRL(c.parsed.x), title: c => ranking[c[0].dataIndex][0] } }
      },
      scales: {
        x: { ticks: { callback: v => crBRLc(v), font: { size: 10, family: 'DM Sans' } }, grid: { color: '#f1f5f9' } },
        y: { ticks: { font: { size: 10, family: 'DM Sans' } }, grid: { display: false } }
      }
    }
  });
}

/** Custo em barras e taxa efetiva em linha: é a leitura de "está ficando caro?". */
function crChartBIMes(liq) {
  const por = {};
  liq.forEach(o => {
    const m = String(o.data_credito || o.data_operacao || '').slice(0, 7);
    if (!m) return;
    por[m] = por[m] || { custo: 0, volume: 0 };
    por[m].custo += Number(o.custo_real) || 0;
    por[m].volume += Number(o.valor_bruto) || 0;
  });
  const meses = Object.keys(por).sort();

  crDestruir('biMes');
  const ctx = document.getElementById('cr-c-bi-mes');
  if (!ctx) return;
  if (!meses.length) { ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height); return; }

  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const taxas = meses.map(m => {
    const v = liq.filter(o => String(o.data_credito || o.data_operacao || '').slice(0, 7) === m);
    const vol = v.reduce((s, o) => s + (Number(o.valor_bruto) || 0), 0);
    return vol > 0 ? v.reduce((s, o) => s + (Number(o.taxa_efetiva_mes) || 0) * (Number(o.valor_bruto) || 0), 0) / vol : 0;
  });

  CR.charts.biMes = new Chart(ctx, {
    data: {
      labels: meses.map(m => nomes[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4)),
      datasets: [
        { type: 'bar', label: 'Custo', data: meses.map(m => por[m].custo), backgroundColor: '#f59e0b', borderRadius: 5, maxBarThickness: 28, yAxisID: 'y' },
        { type: 'line', label: 'Taxa efetiva (% a.m.)', data: taxas, borderColor: '#7c3aed', backgroundColor: 'transparent', borderWidth: 2, tension: .3, pointRadius: 3, yAxisID: 'y2' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, family: 'DM Sans' }, padding: 10 } },
        tooltip: {
          callbacks: {
            label: c => c.dataset.yAxisID === 'y2'
              ? ' ' + c.dataset.label + ': ' + c.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'
              : ' ' + c.dataset.label + ': ' + crBRL(c.parsed.y)
          }
        }
      },
      scales: {
        y: { position: 'left', ticks: { callback: v => crBRLc(v), font: { size: 10, family: 'DM Sans' } }, grid: { color: '#f1f5f9' } },
        y2: { position: 'right', ticks: { callback: v => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%', font: { size: 10, family: 'DM Sans' } }, grid: { display: false } },
        x: { grid: { display: false }, ticks: { font: { size: 10, family: 'DM Sans' } } }
      }
    }
  });
}

/** Barra de uso de limite: verde até 70%, âmbar até 90%, vermelho acima. */
function crBarraUso(usado, limite) {
  if (!limite || limite <= 0) return '<span style="color:var(--muted);font-weight:700;">sem limite</span>';
  const pct = usado / limite * 100;
  const cor = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a';
  return '<div style="min-width:78px;">' +
    '<div style="font-weight:800;color:' + cor + ';font-size:.76rem;">' + pct.toFixed(0) + '%</div>' +
    '<div style="height:5px;border-radius:20px;background:#f1f5f9;overflow:hidden;margin-top:3px;">' +
    '<span style="display:block;height:100%;width:' + Math.min(pct, 100) + '%;background:' + cor + ';border-radius:20px;"></span></div></div>';
}

function crRenderBIParceiros() {
  const emAberto = crAtivos().filter(t => crEmAberto(t) && crAntecipado(t));
  const linhas = CR.parceiros.map(p => {
    const usado = emAberto.filter(t => t.parceiro_id === p.id).reduce((s, t) => s + crSaldo(t), 0);
    return { p, usado };
  }).filter(x => x.usado > 0 || x.p.ativo).sort((a, b) => b.usado - a.usado);

  document.getElementById('cr-tb-bi-parceiros').innerHTML = linhas.length ? linhas.map(x =>
    '<tr>' +
      '<td class="cr-cli">' + crEsc(x.p.nome) + (x.p.ativo ? '' : ' <span class="cr-pill cr-pill-existe">inativo</span>') + '</td>' +
      '<td class="cr-num" style="font-weight:800;color:var(--ant);">' + crBRL(x.usado) + '</td>' +
      '<td class="cr-num cr-col-apoio">' + (x.p.limite > 0 ? crBRL(x.p.limite) : '—') + '</td>' +
      '<td class="cr-num">' + crBarraUso(x.usado, x.p.limite) + '</td>' +
    '</tr>').join('')
    : '<tr><td colspan="4" class="cr-vazio">Nenhum parceiro cadastrado.</td></tr>';
}

function crRenderBIClientes() {
  const emAberto = crAtivos().filter(t => crEmAberto(t) && crAntecipado(t));
  const por = {};
  emAberto.forEach(t => {
    const k = String(t.cliente_cod || t.cliente);
    por[k] = por[k] || { nome: t.cliente, cod: t.cliente_cod, usado: 0, risco: 0 };
    por[k].usado += crSaldo(t);
    if (crEmRisco(t)) por[k].risco += crSaldo(t);
  });
  // As OSs antecipadas ainda sem nota contam na exposição: o dinheiro já entrou.
  CR.antecipacoesOS.filter(a => a.status === 'AGUARDANDO_FATURAMENTO').forEach(a => {
    const k = String(a.cliente_cod || a.cliente);
    por[k] = por[k] || { nome: a.cliente, cod: a.cliente_cod, usado: 0, risco: 0 };
    por[k].usado += Number(a.valor_antecipado) || 0;
  });

  const linhas = Object.values(por).sort((a, b) => b.usado - a.usado);
  document.getElementById('cr-tb-bi-clientes').innerHTML = linhas.length ? linhas.map(c => {
    const pol = crPolitica(c.cod);
    return '<tr' + (c.risco > 0 ? ' class="risco"' : '') + '>' +
      '<td class="cr-cli" title="' + crEsc(c.nome) + '">' + crEsc(c.nome) + '</td>' +
      '<td class="cr-num" style="font-weight:800;color:var(--ant);">' + crBRL(c.usado) + '</td>' +
      '<td class="cr-num cr-col-apoio">' + (pol.teto_exposicao > 0 ? crBRL(pol.teto_exposicao) : '—') + '</td>' +
      '<td class="cr-num">' + crBarraUso(c.usado, pol.teto_exposicao) + '</td>' +
      '<td class="cr-num" style="font-weight:800;color:' + (c.risco > 0 ? 'var(--risco)' : 'var(--muted)') + ';">' +
        (c.risco > 0 ? crBRL(c.risco) : '—') + '</td>' +
      '<td class="cr-col-apoio">' + (pol.padrao
        ? '<span class="cr-pill cr-pill-existe">padrão</span>'
        : '<span class="cr-pill cr-pill-livre">' + (pol.permite_os ? 'OS ' + pol.pct_max_os + '%' : 'só NF') + '</span>') + '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="6" class="cr-vazio">Nada antecipado em aberto.</td></tr>';
}

function crRenderBIOps(liq) {
  document.getElementById('cr-tb-bi-ops').innerHTML = liq.length ? liq.slice()
    .sort((a, b) => (b.data_credito || '').localeCompare(a.data_credito || ''))
    .map(o => {
      const est = Number(o.desagio_estimado) || 0;
      const real = Number(o.custo_real) || 0;
      const dif = Math.round((est - real) * 100) / 100;
      return '<tr>' +
        '<td style="font-weight:900;">' + crEsc(o.numero || o.id) + '</td>' +
        '<td class="cr-cli">' + crEsc(o.parceiro) + '</td>' +
        '<td class="cr-num">' + crBRL(o.valor_bruto) + '</td>' +
        '<td class="cr-num cr-col-apoio">' + crBRL(est) + '</td>' +
        '<td class="cr-num" style="color:#b45309;font-weight:800;">' + crBRL(real) + '</td>' +
        '<td class="cr-num" style="font-weight:800;color:' + (dif >= 0 ? '#15803d' : '#b91c1c') + ';">' +
          (dif >= 0 ? '+' : '') + crBRL(dif) + '</td>' +
        '<td class="cr-num cr-col-apoio">' +
          (Number(o.taxa_efetiva_mes) ? Number(o.taxa_efetiva_mes).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%' : '—') + '</td>' +
      '</tr>';
    }).join('')
    : '<tr><td colspan="7" class="cr-vazio">Nenhuma operação liquidada no período.</td></tr>';
}

function crExportarBI() {
  const ops = crOperacoesDoPeriodo();
  if (!ops.length) { crAviso('Nenhuma operação no período escolhido.', 'info'); return; }
  const cab = ['Nº', 'Data', 'Parceiro', 'Status', 'Duplicatas', 'OSs', 'Face', 'Prazo médio',
               'Taxa cadastrada', 'Deságio estimado', 'Líquido estimado',
               'Líquido creditado', 'Custo real', 'Taxa efetiva', 'Crédito em', 'Título 3.07'];
  const n2 = v => (Number(v) || 0).toFixed(2).replace('.', ',');
  const linhas = ops.map(o => [
    o.numero || o.id, crDataLonga(o.data_operacao), o.parceiro, crStatusOp(o.status),
    o.qtd_titulos, o.qtd_os, n2(o.valor_bruto), n2(o.prazo_medio), n2(o.taxa_mes),
    n2(o.desagio_estimado), n2(o.liquido_estimado), n2(o.valor_liquido), n2(o.custo_real),
    n2(o.taxa_efetiva_mes), o.data_credito ? crDataLonga(o.data_credito) : '', o.titulo_despesa_id || ''
  ]);
  crBaixarCSV([cab].concat(linhas), 'operacoes-financeiras-' + CR.competencia + '.csv');
}

// ═══════════════════════════════════════════════════════════════════════════
// PARCEIROS FINANCEIROS
// ═══════════════════════════════════════════════════════════════════════════

function crRenderParceiros() {
  const emAberto = crAtivos().filter(t => crEmAberto(t) && crAntecipado(t));
  const podeEditar = crPodeEditar();
  const el = document.getElementById('cr-parceiros');

  if (!CR.parceiros.length) {
    el.innerHTML = '<div class="cr-card"><div class="cr-vazio">' +
      'Nenhum parceiro cadastrado ainda.<br>' +
      'Cadastre os fundos, bancos e factorings com quem a empresa opera —<br>' +
      'a taxa de cada um alimenta a simulação do pré-borderô.' +
      (podeEditar ? '<br><br><button class="cr-btn cr-btn-ant" onclick="crAbrirParceiro(\'\')"><i class="fa-solid fa-plus"></i>Cadastrar o primeiro</button>' : '') +
      '</div></div>';
    return;
  }

  el.innerHTML = CR.parceiros.slice()
    .sort((a, b) => (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(p => {
      const usado = emAberto.filter(t => t.parceiro_id === p.id).reduce((s, t) => s + crSaldo(t), 0);
      const ops = CR.operacoes.filter(o => o.parceiro_id === p.id && o.status !== 'CANCELADA').length;
      return '<div class="cr-parc' + (p.ativo ? '' : ' inativo') + '">' +
        (podeEditar ? '<div class="cr-parc-acoes">' +
          '<button class="cr-acao" onclick="crAbrirParceiro(\'' + p.id + '\')" title="Editar"><i class="fa-solid fa-pen"></i></button></div>' : '') +
        '<div class="cr-parc-nome">' + crEsc(p.nome) + '</div>' +
        '<div class="cr-parc-sub"><span class="cr-parc-tipo">' + crEsc(p.tipo || 'FIDC') + '</span>' +
          (p.ativo ? '' : ' <span class="cr-pill cr-pill-existe">inativo</span>') +
          (p.contato ? ' · ' + crEsc(p.contato) : '') + '</div>' +
        '<div class="cr-parc-nums">' +
          '<div class="cr-parc-n"><b>' + (Number(p.taxa_mes) || 0).toLocaleString('pt-BR') + '%</b><span>taxa a.m.</span></div>' +
          '<div class="cr-parc-n"><b>' + crBRLc(p.tarifa_titulo) + '</b><span>por título</span></div>' +
          '<div class="cr-parc-n"><b>' + crBRLc(p.tac) + '</b><span>TAC</span></div>' +
          '<div class="cr-parc-n"><b>' + (Number(p.dias_float) || 0) + 'd</b><span>float</span></div>' +
        '</div>' +
        '<div class="cr-parc-uso">' +
          '<div style="display:flex;justify-content:space-between;font-size:.72rem;font-weight:700;margin-bottom:4px;">' +
            '<span style="color:var(--muted);">Em aberto</span>' +
            '<span style="color:var(--ant);font-weight:900;">' + crBRL(usado) + '</span></div>' +
          crBarraUso(usado, p.limite) +
          '<div style="font-size:.66rem;color:var(--muted);font-weight:600;margin-top:6px;">' +
            ops + ' operação(ões) · limite ' + (p.limite > 0 ? crBRL(p.limite) : 'não informado') + '</div>' +
        '</div></div>';
    }).join('');
}

function crAbrirParceiro(id) {
  if (!crPodeEditar()) return;
  const p = id ? crParceiro(id) : null;
  CR.parceiroEditando = p ? p.id : null;
  document.getElementById('cr-p-titulo').textContent = p ? 'Editar parceiro' : 'Novo parceiro';
  const v = (campo, valor) => document.getElementById(campo).value = valor === undefined || valor === null ? '' : valor;
  const n = x => Number(x) ? String(Number(x)).replace('.', ',') : '';
  v('cr-p-nome', p ? p.nome : '');
  v('cr-p-tipo', p ? (p.tipo || 'FIDC') : 'FIDC');
  v('cr-p-cnpj', p ? p.cnpj : '');
  v('cr-p-contato', p ? p.contato : '');
  v('cr-p-email', p ? p.email : '');
  v('cr-p-telefone', p ? p.telefone : '');
  v('cr-p-taxa', p ? n(p.taxa_mes) : '');
  v('cr-p-tarifa', p ? n(p.tarifa_titulo) : '');
  v('cr-p-tac', p ? n(p.tac) : '');
  v('cr-p-float', p ? (Number(p.dias_float) || 0) : 0);
  v('cr-p-limite', p ? n(p.limite) : '');
  v('cr-p-ativo', p ? (p.ativo ? '1' : '0') : '1');
  v('cr-p-obs', p ? p.observacao : '');
  document.getElementById('cr-p-remover').style.display = p ? '' : 'none';
  crAbrir('cr-modal-parceiro');
}

async function crSalvarParceiro() {
  const g = id => document.getElementById(id).value;
  const parceiro = {
    id: CR.parceiroEditando,
    nome: g('cr-p-nome').trim(), tipo: g('cr-p-tipo'), cnpj: g('cr-p-cnpj').trim(),
    contato: g('cr-p-contato').trim(), email: g('cr-p-email').trim(), telefone: g('cr-p-telefone').trim(),
    taxa_mes: crNum(g('cr-p-taxa')), tarifa_titulo: crNum(g('cr-p-tarifa')), tac: crNum(g('cr-p-tac')),
    dias_float: Number(g('cr-p-float')) || 0, limite: crNum(g('cr-p-limite')),
    ativo: g('cr-p-ativo') === '1', observacao: g('cr-p-obs').trim()
  };
  if (!parceiro.nome) { crAviso('Informe o nome do parceiro.', 'erro'); return; }
  try {
    await crPost('parceiro_salvar', { parceiro });
    crFechar('cr-modal-parceiro');
    await crCarregar();
    crAviso('Parceiro salvo.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui salvar.</b> ' + crEsc(e.message), 'erro');
  }
}

async function crRemoverParceiro() {
  if (!CR.parceiroEditando) return;
  if (!confirm('Remover este parceiro? Só é possível se ele não tiver nenhuma operação registrada.')) return;
  try {
    await crPost('parceiro_remover', { id: CR.parceiroEditando });
    crFechar('cr-modal-parceiro');
    await crCarregar();
    crAviso('Parceiro removido.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui remover.</b> ' + crEsc(e.message), 'erro');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POLÍTICAS POR CLIENTE
// ═══════════════════════════════════════════════════════════════════════════

function crRenderPoliticas() {
  const podeEditar = crPodeEditar();
  const lista = CR.politicas.slice().sort((a, b) => String(a.cliente).localeCompare(String(b.cliente), 'pt-BR'));

  document.getElementById('cr-tb-politicas').innerHTML = lista.length ? lista.map(p =>
    '<tr' + (p.ativo ? '' : ' class="bloq"') + '>' +
      '<td class="cr-cli" title="' + crEsc(p.cliente) + '">' + crEsc(p.cliente || '(sem nome)') + '</td>' +
      '<td class="cr-col-apoio">' + crEsc(p.cliente_cod) + '</td>' +
      '<td>' + (p.permite_os
        ? '<span class="cr-pill cr-pill-livre">Sim</span>'
        : '<span class="cr-pill cr-pill-existe">Não</span>') + '</td>' +
      '<td class="cr-num">' + (p.permite_os ? (Number(p.pct_max_os) || 100) + '%' : '—') + '</td>' +
      '<td class="cr-num cr-col-apoio">' + (Number(p.dias_ate_faturar) || 0) + 'd</td>' +
      '<td class="cr-num cr-col-apoio">' + (Number(p.dias_prazo_venc) || 0) + 'd</td>' +
      '<td>' + crRegraTexto(p) + '</td>' +
      '<td class="cr-num">' + (Number(p.teto_exposicao) > 0 ? crBRL(p.teto_exposicao) : 'sem teto') + '</td>' +
      '<td style="text-align:right;">' + (podeEditar
        ? '<button class="cr-acao" onclick="crAbrirPolitica(\'' + crEsc(p.cliente_cod) + '\')" title="Editar"><i class="fa-solid fa-pen"></i></button>' : '') + '</td>' +
    '</tr>').join('')
    : '<tr><td colspan="9" class="cr-vazio">Nenhuma política cadastrada.<br>' +
      'Sem política, o cliente pode antecipar duplicata emitida mas não OS sem pedido.</td></tr>';
}

const CR_DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
                        'quinta-feira', 'sexta-feira', 'sábado'];

/** Como a regra do cliente aparece na tabela e no borderô. */
function crRegraTexto(p) {
  const dias = crDiasFixos(p && p.dias_fixos);
  if (p && p.regra_venc === 'DIAS_FIXOS' && dias.length) {
    return '<span class="cr-pill cr-pill-livre" title="Só paga nesses dias do mês">dia ' +
      dias.join(' e ') + '</span>';
  }
  if (p && p.regra_venc === 'DIA_SEMANA' && p.dia_semana != null) {
    return '<span class="cr-pill cr-pill-livre" title="O prazo corre e a data cai neste dia da semana">' +
      crEsc(CR_DIAS_SEMANA[Number(p.dia_semana)] || '—') + '</span>';
  }
  return '<span class="cr-col-apoio">—</span>';
}

/** "10, 25" ou [10,25] → [10, 25]. Só 1–31, sem repetir, em ordem. */
function crDiasFixos(v) {
  return String(v == null ? '' : v).split(/[^0-9]+/)
    .map(x => parseInt(x, 10))
    .filter(n => n >= 1 && n <= 31)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);
}

/** Mostra só os campos da regra escolhida, com um exemplo do que vai acontecer. */
function crPoliticaRegraMudou() {
  const regra = document.getElementById('cr-pol-regra').value;
  document.getElementById('cr-pol-wrap-diasfixos').style.display = regra === 'DIAS_FIXOS' ? '' : 'none';
  document.getElementById('cr-pol-wrap-diasemana').style.display = regra === 'DIA_SEMANA' ? '' : 'none';

  const el = document.getElementById('cr-pol-regra-exemplo');
  const prazo = Number(document.getElementById('cr-pol-prazo').value) || 0;
  const base = crSomaDias(CR.hoje, prazo);
  const p = {
    regra_venc: regra,
    dias_fixos: document.getElementById('cr-pol-diasfixos').value,
    dia_semana: document.getElementById('cr-pol-diasemana').value
  };
  if (!regra) {
    el.innerHTML = 'Exemplo: nota emitida hoje vence em <b>' + crDataLonga(base) + '</b>, ' + prazo + ' dias depois.';
    return;
  }
  const ajustado = crAplicarRegra(base, p);
  el.innerHTML = 'Exemplo: nota emitida hoje venceria em ' + crDataLonga(base) +
    ' e, pela regra, o recebimento fica em <b>' + crDataLonga(ajustado) + '</b>.';
}

/**
 * Espelho de aplicarRegraVencimento() do Apps Script — a tela precisa mostrar a
 * data antes de gravar. Quem manda continua sendo o servidor.
 */
function crAplicarRegra(iso, p) {
  if (!iso || !p) return iso;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y) return iso;
  const base = new Date(y, m - 1, d, 12, 0, 0, 0);
  const fim = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') +
                    '-' + String(dt.getDate()).padStart(2, '0');

  if (p.regra_venc === 'DIAS_FIXOS') {
    const dias = crDiasFixos(p.dias_fixos);
    if (!dias.length) return iso;
    for (let salto = 0; salto < 3; salto++) {
      const ano = base.getFullYear(), mes = base.getMonth() + salto;
      const ultimo = new Date(ano, mes + 1, 0).getDate();
      for (let i = 0; i < dias.length; i++) {
        // Dia 31 em mês de 30 vira o último dia do mês, não o dia 1 do seguinte.
        const alvo = new Date(ano, mes, Math.min(dias[i], ultimo), 12, 0, 0, 0);
        if (alvo.getTime() >= base.getTime()) return fim(alvo);
      }
    }
    return iso;
  }
  if (p.regra_venc === 'DIA_SEMANA') {
    const alvo = Number(p.dia_semana);
    if (!(alvo >= 0 && alvo <= 6)) return iso;
    base.setDate(base.getDate() + ((alvo - base.getDay() + 7) % 7));
    return fim(base);
  }
  return iso;
}

/** A política do cliente, ou null. É por ela que passa todo vencimento calculado. */
function crPoliticaDe(clienteCod, clienteNome) {
  if (clienteCod != null && clienteCod !== '') {
    const p = CR.politicas.filter(x => String(x.cliente_cod) === String(clienteCod))[0];
    if (p) return p;
  }
  if (clienteNome) {
    const n = String(clienteNome).trim().toLowerCase();
    return CR.politicas.filter(x => String(x.cliente || '').trim().toLowerCase() === n)[0] || null;
  }
  return null;
}

function crAbrirPolitica(cod) {
  if (!crPodeEditar()) return;
  const p = cod ? CR.politicas.filter(x => String(x.cliente_cod) === String(cod))[0] : null;
  CR.politicaEditando = p ? String(p.cliente_cod) : null;
  document.getElementById('cr-pol-titulo').textContent = p ? 'Editar política' : 'Nova política';

  const sel = document.getElementById('cr-pol-cliente');
  sel.value = p ? String(p.cliente_cod) : '';
  sel.disabled = !!p;   // trocar o cliente de uma política existente confundiria o histórico
  document.getElementById('cr-pol-permite').value = p ? (p.permite_os ? '1' : '0') : '1';
  document.getElementById('cr-pol-pct').value = p ? (Number(p.pct_max_os) || 100) : 100;
  document.getElementById('cr-pol-dias').value = p ? (Number(p.dias_ate_faturar) || 30) : 30;
  document.getElementById('cr-pol-prazo').value = p ? (Number(p.dias_prazo_venc) || 30) : 30;
  document.getElementById('cr-pol-teto').value =
    p && Number(p.teto_exposicao) > 0 ? Number(p.teto_exposicao).toFixed(2).replace('.', ',') : '';
  document.getElementById('cr-pol-obs').value = p ? (p.observacao || '') : '';
  document.getElementById('cr-pol-regra').value = p ? (p.regra_venc || '') : '';
  document.getElementById('cr-pol-diasfixos').value = p ? crDiasFixos(p.dias_fixos).join(', ') : '';
  document.getElementById('cr-pol-diasemana').value = p && p.dia_semana != null ? String(p.dia_semana) : '4';
  document.getElementById('cr-pol-remover').style.display = p ? '' : 'none';
  crPoliticaRegraMudou();
  crPoliticaClienteMudou();
  crAbrir('cr-modal-politica');
}

/** Mostra o histórico real do cliente ao lado do campo, para a regra não ser chute. */
function crPoliticaClienteMudou() {
  const cod = document.getElementById('cr-pol-cliente').value;
  const el = document.getElementById('cr-pol-hist');
  const btn = document.getElementById('cr-pol-sugerir');
  const dias = (CR.histFaturamento || {})[String(cod)] || [];

  if (!cod) { el.textContent = 'Escolha o cliente para ver o histórico dele.'; btn.disabled = true; return; }

  const emAberto = crAtivos().filter(t => crEmAberto(t) && String(t.cliente_cod) === String(cod));
  const carteira = emAberto.reduce((s, t) => s + crSaldo(t), 0);
  const atrasado = emAberto.filter(crVencido).reduce((s, t) => s + crSaldo(t), 0);

  if (!dias.length) {
    el.innerHTML = 'Sem OS faturada no histórico deste cliente. ' +
      'Carteira em aberto: <b>' + crBRL(carteira) + '</b>' +
      (atrasado > 0 ? ' · atrasado <b style="color:var(--risco);">' + crBRL(atrasado) + '</b>' : '') + '.';
    btn.disabled = true;
    return;
  }
  // Mediana, não média: uma OS que ficou seis meses parada distorce a média e
  // não representa o comportamento normal do cliente.
  const ord = dias.slice().sort((a, b) => a - b);
  const mediana = ord.length % 2 ? ord[(ord.length - 1) / 2] : Math.round((ord[ord.length / 2 - 1] + ord[ord.length / 2]) / 2);
  el.innerHTML = '<b>' + dias.length + ' OS faturada(s)</b> no histórico · mediana de <b>' + mediana +
    ' dias</b> da abertura até o faturamento. Carteira em aberto: <b>' + crBRL(carteira) + '</b>' +
    (atrasado > 0 ? ' · atrasado <b style="color:var(--risco);">' + crBRL(atrasado) + '</b>' : '') + '.';
  btn.disabled = false;
  el.dataset.mediana = mediana;
}

function crSugerirPolitica() {
  const el = document.getElementById('cr-pol-hist');
  const m = Number(el.dataset.mediana);
  if (!m) return;
  document.getElementById('cr-pol-dias').value = m;
  crAviso('Preenchi <b>' + m + ' dias até faturar</b> pela mediana do histórico deste cliente. ' +
          'O prazo de vencimento continua sendo seu — ele vem da negociação comercial, não do sistema.', 'info');
}

async function crSalvarPolitica() {
  const cod = document.getElementById('cr-pol-cliente').value;
  if (!cod) { crAviso('Escolha o cliente.', 'erro'); return; }
  const nome = document.getElementById('cr-pol-cliente').selectedOptions[0].textContent;
  const politica = {
    cliente_cod: cod, cliente: nome,
    permite_os: document.getElementById('cr-pol-permite').value === '1',
    pct_max_os: Number(document.getElementById('cr-pol-pct').value) || 100,
    dias_ate_faturar: Number(document.getElementById('cr-pol-dias').value) || 0,
    dias_prazo_venc: Number(document.getElementById('cr-pol-prazo').value) || 0,
    teto_exposicao: crNum(document.getElementById('cr-pol-teto').value),
    regra_venc: document.getElementById('cr-pol-regra').value,
    dias_fixos: crDiasFixos(document.getElementById('cr-pol-diasfixos').value).join(','),
    dia_semana: document.getElementById('cr-pol-diasemana').value,
    observacao: document.getElementById('cr-pol-obs').value.trim(),
    ativo: true
  };
  if (politica.regra_venc === 'DIAS_FIXOS' && !politica.dias_fixos) {
    crAviso('Informe ao menos um dia do mês (ex.: 10, 25) para a regra de dias fixos.', 'erro');
    return;
  }
  try {
    await crPost('politica_salvar', { politica });
    crFechar('cr-modal-politica');
    await crCarregar();
    crAviso('Política salva.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui salvar.</b> ' + crEsc(e.message), 'erro');
  }
}

async function crRemoverPolitica() {
  if (!CR.politicaEditando) return;
  if (!confirm('Remover a política deste cliente? Ele volta ao padrão da casa: pode antecipar ' +
               'duplicata emitida, mas não OS sem pedido.')) return;
  try {
    await crPost('politica_remover', { cliente_cod: CR.politicaEditando });
    crFechar('cr-modal-politica');
    await crCarregar();
    crAviso('Política removida.', 'ok');
  } catch (e) {
    crAviso('<b>Não consegui remover.</b> ' + crEsc(e.message), 'erro');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINCRONIZAÇÃO COM O GENESIS
// ═══════════════════════════════════════════════════════════════════════════

async function crAbrirSync() {
  if (!crPodeEditar()) return;
  crAbrir('cr-modal-sync');
  document.getElementById('cr-tb-sync').innerHTML =
    '<tr><td colspan="7" class="cr-vazio"><i class="fa-solid fa-spinner fa-spin"></i> Lendo a fila…</td></tr>';
  try {
    const d = await crPost('sync_ler', {});
    CR.sync = { notas: d.notas || [], existentes: d.existentes || {}, marcadas: {} };
    // Só as novas vêm marcadas: aprovar o que já existe não faz nada, e deixar
    // tudo marcado faria o usuário desmarcar uma a uma.
    CR.sync.notas.forEach(n => { if (!CR.sync.existentes[n.chave_origem]) CR.sync.marcadas[n.chave_origem] = true; });
    const q = d.gerado_em ? new Date(d.gerado_em) : null;
    document.getElementById('cr-sync-sub').textContent = q && !isNaN(q)
      ? 'Extração de ' + q.toLocaleDateString('pt-BR') + ' ' + q.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : 'Notas do Genesis aguardando sua aprovação';
    crSyncRender();
  } catch (e) {
    document.getElementById('cr-tb-sync').innerHTML =
      '<tr><td colspan="7" class="cr-vazio">Não consegui ler a fila.<br>' + crEsc(e.message) + '</td></tr>';
  }
}

function crSyncRender() {
  const notas = CR.sync.notas;
  const novas = notas.filter(n => !CR.sync.existentes[n.chave_origem]);
  const valorNovas = novas.reduce((s, n) => s + (Number(n.valor_total) || 0), 0);

  document.getElementById('cr-sync-resumo').innerHTML =
    '<div class="cr-sync-chip">Na fila<b>' + notas.length + '</b></div>' +
    '<div class="cr-sync-chip">Novas<b style="color:var(--cr);">' + novas.length + '</b></div>' +
    '<div class="cr-sync-chip">Já lançadas<b>' + (notas.length - novas.length) + '</b></div>' +
    '<div class="cr-sync-chip">Valor das novas<b>' + crBRL(valorNovas) + '</b></div>';

  const tb = document.getElementById('cr-tb-sync');
  if (!notas.length) {
    tb.innerHTML = '<tr><td colspan="7" class="cr-vazio">A fila está vazia.<br>' +
      'Rode <code>node integracao/extrair-contas-receber.js --enviar</code> numa máquina com acesso ao Genesis.</td></tr>';
  } else {
    tb.innerHTML = notas.slice()
      .sort((a, b) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)))
      .map(n => {
        const existe = CR.sync.existentes[n.chave_origem];
        const marcada = !!CR.sync.marcadas[n.chave_origem];
        const nf = Number(n.total_parcelas) > 1
          ? n.numero_nf + '/' + String(n.parcela).padStart(2, '0') : n.numero_nf;
        return '<tr class="cr-sync-linha' + (existe ? ' existe' : '') + '">' +
          '<td>' + (existe ? '' : '<input type="checkbox" ' + (marcada ? 'checked' : '') +
            ' onchange="crSyncMarcar(\'' + crEsc(n.chave_origem) + '\',this.checked)" />') + '</td>' +
          '<td style="white-space:nowrap;">' + crDataLonga(n.data_vencimento) + '</td>' +
          '<td class="cr-cli" title="' + crEsc(n.cliente) + '">' + crEsc(n.cliente) + '</td>' +
          '<td>' + crEsc(nf) + '</td>' +
          '<td class="cr-col-apoio">' + crEsc(n.num_os || '—') + '</td>' +
          '<td class="cr-num" style="font-weight:800;">' + crBRL(n.valor_total) + '</td>' +
          '<td>' + (existe
            ? '<span class="cr-pill cr-pill-existe">já lançada</span>'
            : '<span class="cr-pill cr-pill-nova">nova</span>') + '</td></tr>';
      }).join('');
  }
  document.getElementById('cr-sync-todos').checked =
    novas.length > 0 && novas.every(n => CR.sync.marcadas[n.chave_origem]);
  crSyncRodape();
}

function crSyncMarcar(chave, m) {
  if (m) CR.sync.marcadas[chave] = true; else delete CR.sync.marcadas[chave];
  crSyncRodape();
}

function crSyncMarcarTodos(m) {
  CR.sync.notas.forEach(n => {
    if (CR.sync.existentes[n.chave_origem]) return;
    if (m) CR.sync.marcadas[n.chave_origem] = true; else delete CR.sync.marcadas[n.chave_origem];
  });
  crSyncRender();
}

function crSyncRodape() {
  const chaves = Object.keys(CR.sync.marcadas);
  const sel = CR.sync.notas.filter(n => CR.sync.marcadas[n.chave_origem]);
  const valor = sel.reduce((s, n) => s + (Number(n.valor_total) || 0), 0);
  document.getElementById('cr-sync-sel').textContent = chaves.length
    ? chaves.length + ' nota(s) · ' + crBRL(valor) : 'Nenhuma nota selecionada';
  document.getElementById('cr-sync-aprovar').disabled = !chaves.length;
}

async function crSyncAprovar() {
  const chaves = Object.keys(CR.sync.marcadas);
  if (!chaves.length) return;
  const btn = document.getElementById('cr-sync-aprovar');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Aprovando…';
  try {
    const r = await crPost('sync_aprovar', { chaves });
    crFechar('cr-modal-sync');
    await crCarregar();
    const rec = r.reconciliacao || {};
    crAviso(r.criados + ' título(s) criado(s).' +
      (rec.titulos_marcados
        ? ' <b>' + rec.titulos_marcados + '</b> já entraram marcados como antecipados, ' +
          'porque vieram de OS antecipada — ' + rec.os_faturadas + ' OS saiu da fila de faturamento.'
        : ''), 'ok');
  } catch (e) {
    crAviso('<b>Não consegui aprovar.</b> ' + crEsc(e.message), 'erro');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i>Aprovar selecionadas';
  }
}
