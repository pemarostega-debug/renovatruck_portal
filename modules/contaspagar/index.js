/**
 * Módulo: Contas a Pagar
 * Títulos, plano de contas, despesas fixas, sync de notas do Genesis e BI.
 * Carregado sob demanda por js/router.js na primeira vez em que a tela abre.
 */

const CP = {
  // Cole aqui a URL /exec do apps-script/contas-pagar.gs depois de publicar.
  API: 'https://script.google.com/macros/s/AKfycbyES-4fUjuDv_4t-Jm4_cqgMiVrnGm_fOvb5qgGMcjZDXt5FKPldZtNPiUMhLoaRYa0/exec',

  titulos: [], plano: [], fornecedores: [], fixas: [],
  competencia: '',            // 'YYYY-MM'
  eixo: 'vencimento',         // 'vencimento' | 'emissao' — ver CP_EIXOS
  hoje: '',                   // 'YYYY-MM-DD'
  charts: {},
  macroIdx: null,             // Map codigo→conta, índice de cpMacroDe/cpNomeConta
  aba: 'dash',
  editando: null,             // id do título aberto no modal
  baixando: null,
  planoRascunho: null,        // cópia do plano enquanto há edição pendente
  contaEditando: null,
  fixaEditando: null,         // id da conta fixa aberta no modal
  gfPrevia: null,             // prévia da geração: { competencia, itens: [...] }
  sync: { notas: [], marcadas: {}, existentes: {}, suspeitos: {}, naturezas: {} },
  selecaoBI: null,            // { tipo: 'macro'|'fornecedor'|'semana'|'atraso', valor, rotulo }
  carregado: false
};

/**
 * Eixo de data das análises.
 *
 * "vencimento" responde *quando o dinheiro sai* — é o eixo do caixa, e continua
 * sendo o padrão. "emissao" responde *quando a despesa foi gerada* — é o eixo
 * de competência, o que serve para comparar consumo mês a mês sem a distorção
 * de um boleto que venceu no mês seguinte.
 *
 * Nem tudo obedece ao eixo: atraso é, por definição, vencimento contra hoje.
 * Régua de inadimplência, atrasadas, vencendo hoje e próximos 30 dias ficam
 * SEMPRE no vencimento — e se declaram quando o eixo está em emissão, porque
 * card que mente sobre a própria base é pior do que card que não existe.
 */
const CP_EIXOS = {
  vencimento: {
    nome: 'Vencimento', curto: 'Vencimento', icone: 'fa-calendar-check',
    kpiPrevisto: 'Saídas previstas', kpiPrevistoSub: 'título(s) vencendo no mês',
    kpiRealizadoSub: 'do previsto', kpiAberto: 'Em aberto no mês',
    colData: 'Vencimento', colOutra: 'emis.',
    burnTitulo: 'Queima de caixa semanal',
    burnAcum: 'Previsto (acumulado)', burnSemana: 'Previsto na semana',
    burnAjuda: 'Semana pelo vencimento — o ritmo em que o caixa é consumido.',
    planoAjuda: 'Os valores ao lado somam os títulos que vencem no mês selecionado.'
  },
  emissao: {
    nome: 'Emissão', curto: 'Emissão', icone: 'fa-file-pen',
    kpiPrevisto: 'Total emitido', kpiPrevistoSub: 'título(s) emitidos no mês',
    kpiRealizadoSub: 'do emitido', kpiAberto: 'Emitido em aberto',
    colData: 'Emissão', colOutra: 'venc.',
    burnTitulo: 'Volume lançado por semana',
    burnAcum: 'Lançado (acumulado)', burnSemana: 'Lançado na semana',
    burnAjuda: 'Semana pela emissão — o ritmo em que a despesa foi gerada.',
    planoAjuda: 'Os valores ao lado somam os títulos emitidos no mês selecionado.'
  }
};

const CP_EIXO_LS = 'cp_eixo';

const CP_MACROS = {
  OPERACIONAL:      { nome: 'Operacional',   cor: '#0284c7' },
  FIXO:             { nome: 'Fixo/Adm.',     cor: '#7c3aed' },
  FINANCEIRO:       { nome: 'Financeiro',    cor: '#d97706' },
  CAPEX:            { nome: 'CAPEX',         cor: '#16a34a' },
  NAO_CLASSIFICADO: { nome: 'A classificar', cor: '#94a3b8' }
};

// ── Utilitários ──────────────────────────────────────────────────────────────
const cpEsc = s => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cpBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cpBRLc = v => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000000) return 'R$ ' + (n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return cpBRL(n);
};

/** 'YYYY-MM-DD' → 'DD/MM/AAAA'. Sem new Date(): o fuso rouba um dia. */
const cpData = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
};
const cpDataLonga = cpData;

/** Diferença em dias entre duas datas ISO, sem passar por Date/fuso. */
function cpDias(de, ate) {
  if (!de || !ate) return 0;
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

function cpHojeISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Aceita "1.234,56" e "1234.56". */
function cpNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  const tv = s.includes(','), tp = s.includes('.');
  if (tv && tp) s = s.replace(/\./g, '').replace(',', '.');
  else if (tv) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function cpAviso(msg, tipo) {
  const el = document.getElementById('cp-notice');
  if (!msg) { el.className = 'cp-notice'; el.innerHTML = ''; return; }
  el.className = 'cp-notice ' + (tipo || 'info');
  el.innerHTML = msg;
  if (tipo === 'ok') setTimeout(() => { if (el.className.includes('ok')) cpAviso(''); }, 5000);
}

function cpFechar(id) { document.getElementById(id).classList.remove('open'); }
function cpAbrir(id) { document.getElementById(id).classList.add('open'); }

const cpPodeEditar = () => typeof rvPodeEditar === 'function' ? rvPodeEditar() : true;

// ── Comunicação com o Apps Script ────────────────────────────────────────────
async function cpGet(action, params) {
  const q = new URLSearchParams(Object.assign({ action: action }, params || {}));
  const r = await fetch(CP.API + '?' + q.toString());
  const d = await r.json();
  if (!d.success) throw new Error(d.error || 'Falha ao consultar o servidor.');
  return d.data;
}

async function cpPost(action, corpo) {
  const r = await fetch(CP.API, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action, token: (typeof RV !== 'undefined' ? RV.token : null) }, corpo || {}))
  });
  const d = await r.json();
  if (!d.success) throw new Error(d.error || 'Falha ao gravar.');
  return d.data;
}

// ── Ponto de entrada ─────────────────────────────────────────────────────────
function initContasPagar() {
  document.body.classList.toggle('cp-admin', cpPodeEditar());
  if (!CP.competencia) {
    CP.hoje = cpHojeISO();
    CP.competencia = CP.hoje.slice(0, 7);
    document.getElementById('cp-competencia').value = CP.competencia;
    cpCarregarEixo();
  }
  cpAplicarEixoNaUI();
  if (!CP.carregado) cpCarregar();
}

async function cpCarregar(forcar) {
  if (CP.API.startsWith('COLE_AQUI')) {
    cpAviso('<b>Backend não conectado.</b> Publique o <code>apps-script/contas-pagar.gs</code> e cole a URL /exec em <code>CP.API</code>, aqui no index.html.', 'erro');
    return;
  }
  cpAviso('Carregando contas a pagar…', 'info');
  try {
    const d = await cpGet('bootstrap');
    CP.titulos = d.titulos || [];
    CP.plano = d.plano || [];
    CP.macroIdx = null;          // o plano mudou: o índice tem que ser remontado
    CP.fornecedores = d.fornecedores || [];
    CP.fixas = d.fixas || [];
    CP.hoje = d.hoje || cpHojeISO();
    CP.carregado = true;
    CP.planoRascunho = null;
    cpMarcarPlanoSujo(false);
    cpPreencherSelects();
    cpRender();
    cpAviso(forcar ? 'Dados atualizados.' : '', forcar ? 'ok' : '');
  } catch (e) {
    cpAviso('<b>Não consegui carregar.</b> ' + cpEsc(e.message), 'erro');
  }
}

function cpTrocarMes() {
  CP.competencia = document.getElementById('cp-competencia').value || CP.hoje.slice(0, 7);
  cpRender();
}

/**
 * Troca o eixo das análises. A seleção de BI é limpa junto: um recorte feito
 * por vencimento ("semana 3") não quer dizer a mesma coisa depois da troca, e
 * mantê-lo na tela seria mostrar um detalhe que não corresponde mais ao gráfico.
 */
function cpTrocarEixo(qual) {
  if (qual !== 'emissao' && qual !== 'vencimento') return;
  if (CP.eixo === qual) return;
  CP.eixo = qual;
  CP.selecaoBI = null;
  try { localStorage.setItem(CP_EIXO_LS, qual); } catch (e) {}
  cpAplicarEixoNaUI();
  cpRender();
}

function cpCarregarEixo() {
  let v = null;
  try { v = localStorage.getItem(CP_EIXO_LS); } catch (e) {}
  CP.eixo = v === 'emissao' ? 'emissao' : 'vencimento';
}

/** Rótulos que mudam de significado com o eixo — tudo o que é estático na UI. */
function cpAplicarEixoNaUI() {
  const e = cpEixo();
  const emissao = cpPorEmissao();

  ['vencimento', 'emissao'].forEach(k => {
    const b = document.getElementById('cp-eixo-' + k);
    if (b) { b.classList.toggle('active', CP.eixo === k); b.setAttribute('aria-pressed', String(CP.eixo === k)); }
  });

  const txt = (id, s) => { const el = document.getElementById(id); if (el) el.textContent = s; };
  txt('cp-k-previsto-lbl', e.kpiPrevisto);
  txt('cp-k-aberto-lbl', e.kpiAberto);
  txt('cp-burn-titulo', e.burnTitulo);
  txt('cp-plano-ajuda', e.planoAjuda);
  txt('cp-th-data', e.colData);

  const bh = document.getElementById('cp-burn-ajuda');
  if (bh) bh.title = e.burnAjuda;

  // Os cards de caixa não obedecem ao eixo; o selo só aparece quando isso
  // pode confundir, ou seja, quando o eixo saiu do vencimento.
  document.querySelectorAll('#screen-contaspagar .cp-selo-venc')
    .forEach(el => { el.style.display = emissao ? 'inline-flex' : 'none'; });
}

function cpAba(qual) {
  CP.aba = qual;
  ['dash', 'titulos', 'fixas', 'plano'].forEach(a => {
    document.getElementById('cp-tab-' + a).classList.toggle('active', a === qual);
    document.getElementById('cp-pane-' + a).classList.toggle('active', a === qual);
  });
  // Chart.js só mede o canvas depois que ele está visível.
  if (qual === 'dash') setTimeout(cpRenderDash, 30);
}

function cpRender() {
  cpRenderDash();
  cpRenderTitulos();
  cpRenderFixas();
  cpRenderPlano();
}

// ═══════════════════════════════════════════════════════════════════════════
// SELEÇÃO E CLASSIFICAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Índice código→conta. Antes isto era um `CP.plano.find()` por título, dentro
 * de laços que rodam por título (gráfico de macro, filtro, tabela): com 4.000
 * títulos e ~40 contas dava ~480k comparações de string por render. O Map é
 * montado uma vez por carga do plano e consultado em O(1).
 */
function cpIndiceMacro() {
  if (!CP.macroIdx) {
    CP.macroIdx = new Map();
    CP.plano.forEach(c => CP.macroIdx.set(String(c.codigo), c));
  }
  return CP.macroIdx;
}

const cpMacroDe = cod => {
  const c = cpIndiceMacro().get(String(cod));
  return c ? c.macro : 'NAO_CLASSIFICADO';
};
const cpNomeConta = cod => {
  const c = cpIndiceMacro().get(String(cod));
  return c ? c.nome : 'A Classificar';
};

/** Vencido é calculado, nunca guardado: um título pago não fica atrasado. */
const cpVencido = t => t.status !== 'PAGO' && t.status !== 'CANCELADO' &&
                       t.data_vencimento && t.data_vencimento < CP.hoje;
const cpSaldo = t => Math.max((Number(t.valor_total) || 0) - (Number(t.valor_pago) || 0), 0);

// ── Eixo de data ─────────────────────────────────────────────────────────────

const cpEixo = () => CP_EIXOS[CP.eixo] || CP_EIXOS.vencimento;
const cpPorEmissao = () => CP.eixo === 'emissao';

/** A data que manda na análise, conforme o eixo. '' quando o título não a tem. */
const cpDataEixo = t => cpPorEmissao()
  ? String(t.data_emissao || '')
  : String(t.data_vencimento || '');

const cpDataISOok = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

/**
 * Título que o eixo atual não consegue posicionar no tempo. Só existe em modo
 * emissão: 92% do histórico migrado da planilha antiga veio sem data de
 * emissão. Estes NÃO entram em nenhum mês — e não podem cair de volta no
 * vencimento, que misturaria os dois eixos e daria número errado com cara de
 * certo. Ficam de fora e são declarados em cpRenderSemEixo().
 */
const cpSemEixo = t => cpPorEmissao() && !cpDataISOok(t.data_emissao);

/**
 * Mês do título no eixo atual. No vencimento usa a `competencia` gravada pelo
 * backend (que é derivada do vencimento), preservando exatamente o
 * comportamento anterior; só recorta a data quando a competência falta.
 */
const cpMesDe = t => cpPorEmissao()
  ? String(t.data_emissao || '').slice(0, 7)
  : (t.competencia || String(t.data_vencimento || '').slice(0, 7));

const cpDoMes = t => cpMesDe(t) === CP.competencia;

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

function cpRenderDash() {
  const e = cpEixo();
  const ativos = CP.titulos.filter(t => t.status !== 'CANCELADO');
  const doMes = ativos.filter(cpDoMes);

  const previsto = doMes.reduce((s, t) => s + (Number(t.valor_total) || 0), 0);
  const realizado = doMes.reduce((s, t) => s + (Number(t.valor_pago) || 0), 0);
  const aberto = doMes.filter(t => t.status !== 'PAGO').reduce((s, t) => s + cpSaldo(t), 0);
  const abertoQtd = doMes.filter(t => t.status !== 'PAGO').length;

  // Atraso NUNCA segue o eixo: vencido é vencimento contra hoje, por definição.
  const vencidos = ativos.filter(cpVencido);
  const vencidoTotal = vencidos.reduce((s, t) => s + cpSaldo(t), 0);

  document.getElementById('cp-k-previsto').textContent = cpBRL(previsto);
  document.getElementById('cp-k-previsto-sub').textContent = doMes.length + ' ' + e.kpiPrevistoSub;
  document.getElementById('cp-k-realizado').textContent = cpBRL(realizado);
  const pct = previsto > 0 ? Math.min(realizado / previsto * 100, 100) : 0;
  document.getElementById('cp-k-realizado-sub').textContent = previsto > 0
    ? pct.toFixed(0) + '% ' + e.kpiRealizadoSub : 'nada lançado no mês';
  document.getElementById('cp-k-barra').style.width = pct + '%';
  document.getElementById('cp-k-aberto').textContent = cpBRL(aberto);
  document.getElementById('cp-k-aberto-sub').textContent = abertoQtd + ' título(s) a pagar';
  document.getElementById('cp-k-atraso').textContent = cpBRL(vencidoTotal);
  document.getElementById('cp-k-atraso-sub').textContent = vencidos.length + ' título(s) vencidos';

  cpRenderSemEixo(ativos);
  cpChartMacro(doMes);
  cpChartFornecedores(doMes);
  cpChartBurn(doMes);
  cpRenderRegua(vencidos, vencidoTotal);
  cpRenderTabelasDash(ativos, vencidos);
  cpRenderDetalheBI();
}

/**
 * O aviso que impede o número mentiroso.
 *
 * Em modo emissão, título sem `data_emissao` não pertence a mês nenhum e sai
 * de toda a análise. Some calado seria o pior dos mundos: o total do mês
 * despencaria sem explicação e ninguém saberia que faltam 258 títulos. Então
 * ele é contado, somado e mostrado — com clique para a lista, que transforma
 * o buraco de cadastro numa fila de trabalho.
 */
function cpRenderSemEixo(ativos) {
  const box = document.getElementById('cp-sem-eixo');
  if (!box) return;

  if (!cpPorEmissao()) { box.style.display = 'none'; return; }

  const sem = ativos.filter(cpSemEixo);
  if (!sem.length) { box.style.display = 'none'; return; }

  const valor = sem.reduce((s, t) => s + (Number(t.valor_total) || 0), 0);
  const pct = ativos.length ? (sem.length / ativos.length * 100) : 0;
  box.style.display = 'flex';
  box.innerHTML = `
    <i class="fa-solid fa-circle-exclamation"></i>
    <span><b>${sem.length} título(s)</b> sem data de emissão — ${cpBRL(valor)},
      ${pct.toFixed(0)}% da base — ficam <b>fora</b> de toda análise por emissão.</span>
    <button class="cp-btn cp-btn-sem-eixo" onclick="cpVerSemEmissao()">
      <i class="fa-solid fa-list-ul"></i>Ver títulos
    </button>`;
}

/** O aviso fica no topo e o detalhe lá embaixo: sem rolar, o clique parece morto. */
function cpVerSemEmissao() {
  cpSelecionarBI('sem_emissao', '1', 'Sem data de emissão');
  const card = document.getElementById('cp-tb-detalhe');
  if (card && card.closest('.cp-card')) {
    card.closest('.cp-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function cpDestruir(nome) {
  if (CP.charts[nome]) { CP.charts[nome].destroy(); delete CP.charts[nome]; }
}

function cpChartMacro(titulos) {
  const por = {};
  titulos.forEach(t => {
    const m = cpMacroDe(t.natureza_codigo);
    por[m] = (por[m] || 0) + (Number(t.valor_total) || 0);
  });
  const chaves = Object.keys(CP_MACROS).filter(k => por[k] > 0);
  cpDestruir('macro');
  const ctx = document.getElementById('cp-c-macro');
  if (!ctx || !chaves.length) { if (ctx) ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height); return; }

  CP.charts.macro = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chaves.map(k => CP_MACROS[k].nome),
      datasets: [{ data: chaves.map(k => por[k]), backgroundColor: chaves.map(k => CP_MACROS[k].cor), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      onClick: (evt, els) => { if (els.length) cpSelecionarBI('macro', chaves[els[0].index], CP_MACROS[chaves[els[0].index]].nome); },
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, family: 'DM Sans' }, padding: 10 } },
        tooltip: {
          callbacks: {
            label: c => {
              const total = c.dataset.data.reduce((s, v) => s + v, 0);
              const p = total ? (c.parsed / total * 100).toFixed(1) : 0;
              return ' ' + c.label + ': ' + cpBRL(c.parsed) + ' (' + p + '%)';
            }
          }
        }
      }
    }
  });
}

function cpChartFornecedores(titulos) {
  const por = {};
  titulos.forEach(t => {
    const f = t.fornecedor || '(sem fornecedor)';
    por[f] = (por[f] || 0) + (Number(t.valor_total) || 0);
  });
  const ranking = Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalMes = titulos.reduce((s, t) => s + (Number(t.valor_total) || 0), 0);
  const top5 = ranking.reduce((s, r) => s + r[1], 0);

  // Concentração é o número que importa aqui: dependência de fornecedor é risco.
  document.getElementById('cp-forn-conc').textContent = totalMes > 0
    ? (top5 / totalMes * 100).toFixed(0) + '% do mês' : '—';

  cpDestruir('forn');
  const ctx = document.getElementById('cp-c-forn');
  if (!ctx || !ranking.length) return;

  CP.charts.forn = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ranking.map(r => r[0].length > 22 ? r[0].slice(0, 21) + '…' : r[0]),
      datasets: [{ data: ranking.map(r => r[1]), backgroundColor: '#0284c7', borderRadius: 5, maxBarThickness: 22 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      onClick: (evt, els) => { if (els.length) { const n = ranking[els[0].index][0]; cpSelecionarBI('fornecedor', n, n); } },
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ' ' + cpBRL(c.parsed.x), title: c => ranking[c[0].dataIndex][0] } }
      },
      scales: {
        x: { ticks: { callback: v => cpBRLc(v), font: { size: 10, family: 'DM Sans' } }, grid: { color: '#f1f5f9' } },
        y: { ticks: { font: { size: 10, family: 'DM Sans' } }, grid: { display: false } }
      }
    }
  });
}

function cpChartBurn(titulos) {
  // Acumulado por semana do mês. No eixo do vencimento mostra em que ritmo o
  // caixa é consumido; no da emissão, em que ritmo a despesa foi gerada.
  // "Baixado" usa o mesmo balde de semana que os outros dois, só que somando
  // valor_pago em vez de valor_total — assim dá pra comparar, semana a semana,
  // o que estava lançado contra o que já saiu de verdade.
  const e = cpEixo();
  const sem = [0, 0, 0, 0, 0];
  const semPago = [0, 0, 0, 0, 0];
  titulos.forEach(t => {
    const d = cpDataEixo(t);
    if (d.length < 10) return;
    const dia = parseInt(d.slice(8, 10), 10);
    const i = Math.min(Math.floor((dia - 1) / 7), 4);
    sem[i] += (Number(t.valor_total) || 0);
    semPago[i] += (Number(t.valor_pago) || 0);
  });
  let ac = 0;
  const acumulado = sem.map(v => (ac += v));
  let acPago = 0;
  const acumuladoPago = semPago.map(v => (acPago += v));

  cpDestruir('burn');
  const ctx = document.getElementById('cp-c-burn');
  if (!ctx) return;

  CP.charts.burn = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['S1', 'S2', 'S3', 'S4', 'S5'],
      datasets: [
        { label: e.burnAcum, data: acumulado, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.10)',
          fill: true, tension: .3, pointRadius: 3, pointBackgroundColor: '#ef4444', borderWidth: 2 },
        { label: 'Baixado (acumulado)', data: acumuladoPago, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.10)',
          fill: true, tension: .3, pointRadius: 3, pointBackgroundColor: '#16a34a', borderWidth: 2 },
        { label: e.burnSemana, data: sem, borderColor: '#94a3b8', borderDash: [5, 4], fill: false,
          tension: .3, pointRadius: 2, borderWidth: 1.5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (evt, els) => { if (els.length) { const s = els[0].index + 1; cpSelecionarBI('semana', s, 'Semana ' + s); } },
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10, family: 'DM Sans' }, padding: 8 } },
        tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + cpBRL(c.parsed.y) } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => cpBRLc(v), font: { size: 10, family: 'DM Sans' } }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false }, ticks: { font: { size: 10, family: 'DM Sans' } } }
      }
    }
  });
}

/** Mesmas 3 faixas usadas na régua e no drill-down do card de detalhe. */
const CP_FAIXAS_ATRASO = [
  { chave: 'd1_14', classe: 'cp-f1', nome: '1 a 14 dias', min: 1, max: 14 },
  { chave: 'd15_30', classe: 'cp-f2', nome: '15 a 30 dias', min: 15, max: 30 },
  { chave: 'd30m', classe: 'cp-f3', nome: 'Mais de 30 dias', min: 31, max: 1e9 }
];

function cpRenderRegua(vencidos, total) {
  const faixas = CP_FAIXAS_ATRASO.map(f => Object.assign({}, f, { qtd: 0, valor: 0 }));
  vencidos.forEach(t => {
    const d = cpDias(t.data_vencimento, CP.hoje);
    const f = faixas.find(x => d >= x.min && d <= x.max);
    if (f) { f.qtd++; f.valor += cpSaldo(t); }
  });
  const maior = Math.max.apply(null, faixas.map(f => f.valor).concat([1]));

  document.getElementById('cp-regua-total').textContent = total > 0
    ? cpBRL(total) + ' vencidos' : 'nada vencido';

  document.getElementById('cp-regua').innerHTML = faixas.map(f => `
    <div class="${f.classe}" onclick="cpSelecionarBI('atraso','${f.chave}','${cpEsc(f.nome)}')" title="Ver títulos desta faixa">
      <div class="cp-faixa-top">
        <span class="cp-faixa-nome">${f.nome}</span>
        <span><span class="cp-faixa-val">${cpBRL(f.valor)}</span> <span class="cp-faixa-qtd">· ${f.qtd} título(s)</span></span>
      </div>
      <div class="cp-faixa-bar"><span style="width:${(f.valor / maior * 100).toFixed(1)}%"></span></div>
    </div>`).join('') ||
    '<div class="cp-vazio">Nenhuma conta vencida. 🎉</div>';
}

/**
 * `dataEixo` mostra a data de emissão no lugar do vencimento — usado só no card
 * de detalhe quando ele explica um gráfico que está no eixo da emissão. Nos
 * cards de caixa (hoje, atrasadas, próximos) a data continua sendo o
 * vencimento, que é a acionável.
 */
function cpLinhaMini(t, mostrarDias, dataEixo) {
  const dias = mostrarDias ? cpDias(t.data_vencimento, CP.hoje) : 0;
  const selo = mostrarDias
    ? `<span class="cp-pill cp-pill-atraso">${dias}d</span>`
    : `<span class="cp-pill cp-pill-${t.status}">${t.status}</span>`;
  return `<tr>
    <td style="white-space:nowrap;font-weight:700;">${cpData(dataEixo ? t.data_emissao : t.data_vencimento)}</td>
    <td class="cp-forn" title="${cpEsc(t.fornecedor)}">${cpEsc(t.fornecedor)}</td>
    <td class="cp-col-apoio" style="font-size:.7rem;color:var(--muted);">${cpEsc(cpNomeConta(t.natureza_codigo))}</td>
    <td class="cp-num" style="font-weight:800;">${cpBRL(cpSaldo(t))}</td>
    <td>${selo}</td>
    <td style="text-align:right;">${cpPodeEditar()
      ? `<button class="cp-acao baixar" onclick="cpAbrirBaixa('${t.id}')" title="Dar baixa"><i class="fa-solid fa-money-check-dollar"></i></button>` : ''}</td>
  </tr>`;
}

function cpRenderTabelasDash(ativos, vencidos) {
  // Vencendo hoje
  const hoje = ativos.filter(t => t.status !== 'PAGO' && t.data_vencimento === CP.hoje);
  document.getElementById('cp-tb-hoje').innerHTML = hoje.length
    ? hoje.sort((a, b) => cpSaldo(b) - cpSaldo(a)).map(t => cpLinhaMini(t, false)).join('')
    : '<tr><td colspan="6" class="cp-vazio">Nada vencendo hoje.</td></tr>';
  document.getElementById('cp-hoje-total').textContent = hoje.length
    ? cpBRL(hoje.reduce((s, t) => s + cpSaldo(t), 0)) : '—';

  // Atrasadas — as mais velhas primeiro, que são as que cobram juros
  const atr = vencidos.slice().sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
  document.getElementById('cp-tb-atraso').innerHTML = atr.length
    ? atr.map(t => cpLinhaMini(t, true)).join('')
    : '<tr><td colspan="6" class="cp-vazio">Nenhuma conta atrasada.</td></tr>';
  document.getElementById('cp-atraso-total').textContent = atr.length
    ? atr.length + ' título(s)' : '—';

  // Próximos 30 dias
  const prox = ativos.filter(t => t.status !== 'PAGO' && t.data_vencimento > CP.hoje &&
                                  cpDias(CP.hoje, t.data_vencimento) <= 30)
    .sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
  document.getElementById('cp-tb-prox').innerHTML = prox.length
    ? prox.map(t => cpLinhaMini(t, false)).join('')
    : '<tr><td colspan="6" class="cp-vazio">Nada nos próximos 30 dias.</td></tr>';
  document.getElementById('cp-prox-total').textContent = prox.length
    ? cpBRL(prox.reduce((s, t) => s + cpSaldo(t), 0)) : '—';
}

// ── Drill-down: clicar num item de BI (fatia, barra, semana ou faixa) mostra
// só os títulos daquele recorte no card "Detalhe da seleção". ──────────────

function cpSelecionarBI(tipo, valor, rotulo) {
  // Clicar de novo no mesmo item desmarca — funciona como interruptor.
  if (CP.selecaoBI && CP.selecaoBI.tipo === tipo && String(CP.selecaoBI.valor) === String(valor)) {
    CP.selecaoBI = null;
  } else {
    CP.selecaoBI = { tipo, valor, rotulo };
  }
  cpRenderDetalheBI();
}

function cpLimparSelecaoBI() {
  CP.selecaoBI = null;
  cpRenderDetalheBI();
}

/**
 * Mesmo recorte que cada gráfico/régua desenha, usado aqui para filtrar os
 * títulos por trás do que foi clicado.
 *
 * "atraso" olha o histórico inteiro (como a régua e o KPI de vencido), os
 * outros três olham só o mês selecionado (como os gráficos de cima).
 */
function cpTitulosDaSelecaoBI() {
  const sel = CP.selecaoBI;
  if (!sel) return [];
  const ativos = CP.titulos.filter(t => t.status !== 'CANCELADO');

  if (sel.tipo === 'atraso') {
    const faixa = CP_FAIXAS_ATRASO.find(f => f.chave === sel.valor) || { min: 0, max: 0 };
    return ativos.filter(t => {
      if (!cpVencido(t)) return false;
      const d = cpDias(t.data_vencimento, CP.hoje);
      return d >= faixa.min && d <= faixa.max;
    });
  }

  // Os sem emissão não são de mês nenhum: a lista é a base inteira, não o mês.
  if (sel.tipo === 'sem_emissao') return ativos.filter(cpSemEixo);

  const doMes = ativos.filter(cpDoMes);
  if (sel.tipo === 'macro') return doMes.filter(t => cpMacroDe(t.natureza_codigo) === sel.valor);
  if (sel.tipo === 'fornecedor') return doMes.filter(t => (t.fornecedor || '(sem fornecedor)') === sel.valor);
  if (sel.tipo === 'semana') {
    return doMes.filter(t => {
      const d = cpDataEixo(t);
      if (d.length < 10) return false;
      const dia = parseInt(d.slice(8, 10), 10);
      return Math.min(Math.floor((dia - 1) / 7), 4) + 1 === sel.valor;
    });
  }
  return [];
}

function cpRenderDetalheBI() {
  const sel = CP.selecaoBI;
  const tb = document.getElementById('cp-tb-detalhe');
  const btnLimpar = document.getElementById('cp-detalhe-limpar');
  const titulo = document.getElementById('cp-detalhe-titulo');

  if (!sel) {
    titulo.textContent = 'Detalhe da seleção';
    btnLimpar.style.display = 'none';
    tb.innerHTML = '<tr><td colspan="6" class="cp-vazio">Clique numa fatia, barra, semana ou faixa de atraso para ver os títulos aqui.</td></tr>';
    return;
  }

  titulo.textContent = 'Detalhe: ' + sel.rotulo;
  btnLimpar.style.display = 'inline-flex';

  // Recortes que vêm dos gráficos do mês mostram a data do eixo; os de caixa
  // (atraso) e os sem emissão continuam mostrando o vencimento.
  const porEixo = cpPorEmissao() &&
    (sel.tipo === 'macro' || sel.tipo === 'fornecedor' || sel.tipo === 'semana');

  const lista = cpTitulosDaSelecaoBI().sort((a, b) => cpSaldo(b) - cpSaldo(a));
  tb.innerHTML = lista.length
    ? lista.map(t => cpLinhaMini(t, sel.tipo === 'atraso', porEixo)).join('')
    : '<tr><td colspan="6" class="cp-vazio">Nenhum título nesse recorte.</td></tr>';
}

// ═══════════════════════════════════════════════════════════════════════════
// TÍTULOS
// ═══════════════════════════════════════════════════════════════════════════

function cpFiltrar() {
  const busca = (document.getElementById('cp-f-busca').value || '').toLowerCase().trim();
  const status = document.getElementById('cp-f-status').value;
  const macro = document.getElementById('cp-f-macro').value;
  const nat = document.getElementById('cp-f-natureza').value;
  const periodo = document.getElementById('cp-f-periodo').value;

  return CP.titulos.filter(t => {
    if (t.status === 'CANCELADO') return false;
    if (periodo === 'mes' && !cpDoMes(t)) return false;
    if (periodo === 'aberto' && t.status === 'PAGO') return false;

    if (status === 'VENCIDO') { if (!cpVencido(t)) return false; }
    else if (status && t.status !== status) return false;

    if (macro && cpMacroDe(t.natureza_codigo) !== macro) return false;
    if (nat && String(t.natureza_codigo) !== nat) return false;

    if (busca) {
      const alvo = [t.fornecedor, t.numero_nf, t.numero_boleto, t.descricao,
                    t.observacao_1, t.observacao_2].join(' ').toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  // Ordena pela data do eixo: listar por vencimento uma análise de emissão
  // deixaria a tabela fora de ordem em relação ao que está sendo estudado.
  // Título sem a data do eixo vai para o fim, nunca some.
  }).sort((a, b) => {
    const da = cpDataEixo(a) || '9999-99-99';
    const db = cpDataEixo(b) || '9999-99-99';
    return da.localeCompare(db);
  });
}

function cpRenderTitulos() {
  const lista = cpFiltrar();
  const tb = document.getElementById('cp-tb-titulos');

  const emissao = cpPorEmissao();
  const outraLbl = cpEixo().colOutra;

  tb.innerHTML = lista.length ? lista.map(t => {
    const vencido = cpVencido(t);
    const dias = vencido ? cpDias(t.data_vencimento, CP.hoje) : 0;
    const rotuloNF = t.numero_nf || t.numero_boleto || '—';
    const parc = Number(t.total_parcelas) > 1
      ? ` <span class="cp-tag-macro">${t.parcela}/${t.total_parcelas}</span>` : '';
    // A data do eixo em destaque; a outra logo abaixo, apagada — quem analisa
    // por emissão ainda precisa enxergar o vencimento para agir.
    const principal = emissao ? t.data_emissao : t.data_vencimento;
    const secundaria = emissao ? t.data_vencimento : t.data_emissao;
    // Só sai quando existe: 64% da base não tem emissão, e uma coluna de
    // "emis. —" sob cada linha sujaria justamente a tela do dia a dia.
    const linha2 = cpDataISOok(secundaria)
      ? `<div class="cp-data-2">${outraLbl} ${cpDataLonga(secundaria)}</div>` : '';
    return `<tr>
      <td style="white-space:nowrap;font-weight:700;">
        ${cpDataLonga(principal)}
        ${vencido ? `<span class="cp-pill cp-pill-atraso" style="margin-left:5px;">${dias}d</span>` : ''}
        ${linha2}
      </td>
      <td class="cp-forn" title="${cpEsc(t.fornecedor)}">${cpEsc(t.fornecedor)}</td>
      <td class="cp-col-apoio" style="font-size:.73rem;">${cpEsc(rotuloNF)}${parc}</td>
      <td style="font-size:.73rem;">
        <span class="cp-tag-macro">${cpEsc((CP_MACROS[cpMacroDe(t.natureza_codigo)] || {}).nome || '—')}</span>
        <div style="color:var(--muted);margin-top:2px;">${cpEsc(cpNomeConta(t.natureza_codigo))}</div>
      </td>
      <td class="cp-num" style="font-weight:800;">${cpBRL(t.valor_total)}</td>
      <td class="cp-num cp-col-apoio" style="color:${Number(t.valor_pago) > 0 ? '#16a34a' : 'var(--muted)'};">${cpBRL(t.valor_pago)}</td>
      <td><span class="cp-pill cp-pill-${t.status}">${t.status}</span></td>
      <td class="cp-col-apoio" style="font-size:.73rem;color:var(--muted);">${t.data_baixa ? cpDataLonga(t.data_baixa) : '—'}</td>
      <td style="text-align:right;white-space:nowrap;">
        ${cpPodeEditar() ? `
          ${t.status !== 'PAGO' ? `<button class="cp-acao baixar" onclick="cpAbrirBaixa('${t.id}')" title="Dar baixa"><i class="fa-solid fa-money-check-dollar"></i></button>` : ''}
          <button class="cp-acao" onclick="cpAbrirTitulo('${t.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>` : ''}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" class="cp-vazio">Nenhum título com esses filtros.</td></tr>';

  const soma = lista.reduce((s, t) => s + (Number(t.valor_total) || 0), 0);
  const pago = lista.reduce((s, t) => s + (Number(t.valor_pago) || 0), 0);

  // Mesma honestidade do dashboard: no eixo da emissão, filtrar por mês esconde
  // quem não tem emissão. Dizer quantos são evita a conclusão errada de que a
  // base encolheu.
  let nota = '';
  if (emissao && document.getElementById('cp-f-periodo').value === 'mes') {
    const fora = CP.titulos.filter(t => t.status !== 'CANCELADO' && cpSemEixo(t)).length;
    if (fora) nota = ` · ${fora} sem data de emissão fora deste recorte`;
  }
  document.getElementById('cp-titulos-resumo').textContent =
    `${lista.length} título(s) · Total ${cpBRL(soma)} · Pago ${cpBRL(pago)} · Saldo ${cpBRL(soma - pago)}${nota}`;
}

function cpExportar() {
  const lista = cpFiltrar();
  if (!lista.length) { cpAviso('Nada para exportar com esses filtros.', 'info'); return; }
  const cab = ['Vencimento', 'Emissão', 'Fornecedor', 'NF', 'Boleto', 'Tipo', 'Descrição',
               'Natureza', 'Macro', 'Forma', 'Valor Total', 'Valor Pago', 'Status', 'Data Baixa', 'Parcela'];
  const linhas = lista.map(t => [
    cpDataLonga(t.data_vencimento), cpDataLonga(t.data_emissao), t.fornecedor, t.numero_nf,
    t.numero_boleto, t.tipo_docto, t.descricao, cpNomeConta(t.natureza_codigo),
    (CP_MACROS[cpMacroDe(t.natureza_codigo)] || {}).nome || '', t.forma_pagamento,
    (Number(t.valor_total) || 0).toFixed(2).replace('.', ','),
    (Number(t.valor_pago) || 0).toFixed(2).replace('.', ','),
    t.status, t.data_baixa ? cpDataLonga(t.data_baixa) : '', t.parcela + '/' + t.total_parcelas
  ]);
  const csv = [cab].concat(linhas)
    .map(l => l.map(c => '"' + String(c === null || c === undefined ? '' : c).replace(/"/g, '""') + '"').join(';'))
    .join('\r\n');
  // BOM para o Excel abrir os acentos direito.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // O eixo entra no nome: dois CSVs do mesmo mês em eixos diferentes têm
  // totais diferentes, e o arquivo precisa dizer qual é qual.
  a.download = 'contas-a-pagar-' + CP.eixo + '-' + CP.competencia + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL DE TÍTULO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A dica só aparece com o campo vazio. Não preenchemos a emissão sozinhos: uma
 * data chutada distorce a competência calada, e isso é pior do que o campo em
 * branco — que ao menos é declarado no aviso do dashboard.
 */
function cpDicaEmissao() {
  const inp = document.getElementById('cp-t-emissao');
  const dica = document.getElementById('cp-t-emissao-dica');
  if (inp && dica) dica.style.display = inp.value ? 'none' : 'block';
}

function cpPreencherSelects() {
  const analiticas = CP.plano.filter(c => c.tipo === 'ANALITICA' && c.ativo);
  const opcoes = analiticas.map(c =>
    `<option value="${cpEsc(c.codigo)}">${cpEsc(c.codigo)} — ${cpEsc(c.nome)}</option>`).join('');

  document.getElementById('cp-t-natureza').innerHTML = opcoes;
  document.getElementById('cp-fx-natureza').innerHTML = opcoes;
  document.getElementById('cp-f-natureza').innerHTML =
    '<option value="">Todas as naturezas</option>' + opcoes;

  document.getElementById('cp-f-macro').innerHTML =
    '<option value="">Todas as macro-naturezas</option>' +
    Object.entries(CP_MACROS).map(([k, m]) =>
      `<option value="${cpEsc(k)}">${cpEsc(m.nome)}</option>`).join('');

  // Fornecedores já usados viram sugestão de digitação.
  const nomes = Array.from(new Set(CP.titulos.map(t => t.fornecedor).filter(Boolean))).sort();
  document.getElementById('cp-lista-forn').innerHTML =
    nomes.map(n => `<option value="${cpEsc(n)}"></option>`).join('');
}

// ═════════════════════════════════════════════════════════════════════════
// CONTAS FIXAS — aluguel, contador, internet: o que se repete todo mês
// ═════════════════════════════════════════════════════════════════════════

/** 'YYYY-MM' → 'mm/aaaa'. */
const cpComp = c => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(c || ''));
  return m ? m[2] + '/' + m[1] : '—';
};

function cpRenderFixas() {
  const lista = (CP.fixas || []).slice().sort((a, b) =>
    String(a.descricao).localeCompare(String(b.descricao), 'pt-BR'));
  const podeEditar = cpPodeEditar();
  const mes = CP.competencia || CP.hoje.slice(0, 7);

  const vigente = f => f.ativo && (!f.inicio || f.inicio <= mes) && (!f.fim || f.fim >= mes);
  const ativas = lista.filter(vigente);
  const mensal = ativas.reduce((t, f) => t + (Number(f.valor_previsto) || 0), 0);

  // Quanto do mês já virou título: é o que diz se falta gerar.
  const geradas = CP.titulos.filter(t => t.origem === 'FIXA' && t.competencia === mes).length;

  const resumo = document.getElementById('cp-fixas-resumo');
  if (resumo) {
    resumo.innerHTML =
      '<div class="cp-fx-card"><span>Contas fixas ativas</span><b>' + ativas.length + '</b></div>' +
      '<div class="cp-fx-card"><span>Custo fixo mensal</span><b>' + cpBRL(mensal) + '</b></div>' +
      '<div class="cp-fx-card"><span>Geradas em ' + cpComp(mes) + '</span><b>' + geradas + ' de ' + ativas.length + '</b></div>' +
      '<div class="cp-fx-card"><span>Custo fixo no ano</span><b>' + cpBRLc(mensal * 12) + '</b></div>';
  }

  document.getElementById('cp-tb-fixas').innerHTML = lista.length ? lista.map(f =>
    '<tr' + (f.ativo ? '' : ' class="pausada"') + '>' +
      '<td style="font-weight:700;">' + cpEsc(f.descricao) +
        (f.observacao ? '<div style="font-size:.7rem;color:var(--muted);font-weight:500;">' + cpEsc(f.observacao) + '</div>' : '') + '</td>' +
      '<td>' + cpEsc(f.fornecedor || '—') + '</td>' +
      '<td style="font-size:.74rem;">' + cpEsc(f.natureza_codigo || '—') +
        (f.natureza ? ' <span style="color:var(--muted);">' + cpEsc(f.natureza) + '</span>' : '') + '</td>' +
      '<td class="cp-num">dia ' + (Number(f.dia_vencimento) || 0) + '</td>' +
      '<td class="cp-num" style="font-weight:800;">' + cpBRL(f.valor_previsto) + '</td>' +
      '<td style="font-size:.74rem;white-space:nowrap;">' + cpComp(f.inicio) +
        ' → ' + (f.fim ? cpComp(f.fim) : '<span style="color:var(--muted);">sem prazo</span>') + '</td>' +
      '<td>' + (f.ativo
        ? '<span class="cp-pill cp-pill-ABERTO">Ativa</span>'
        : '<span class="cp-pill cp-pill-CANCELADO">Pausada</span>') + '</td>' +
      '<td style="text-align:right;">' + (podeEditar
        ? '<button class="cp-acao" onclick="cpAbrirFixa(\'' + cpEsc(f.id) + '\')" title="Editar"><i class="fa-solid fa-pen"></i></button>' : '') + '</td>' +
    '</tr>').join('')
    : '<tr><td colspan="8" class="cp-vazio">Nenhuma conta fixa cadastrada.<br>' +
      'Cadastre aluguel, contador, internet, seguros e softwares: são eles que fazem o custo fixo aparecer no DRE sem ninguém precisar lembrar todo mês.</td></tr>';
}

function cpAbrirFixa(id) {
  if (!cpPodeEditar()) { cpAviso('Seu acesso é de consulta.', 'info'); return; }
  const f = id ? (CP.fixas || []).find(x => x.id === id) : null;
  CP.fixaEditando = f ? f.id : null;

  document.getElementById('cp-fx-titulo').textContent = f ? 'Editar conta fixa' : 'Nova conta fixa';
  document.getElementById('cp-fx-descricao').value = f ? f.descricao : '';
  document.getElementById('cp-fx-fornecedor').value = f ? f.fornecedor : '';
  document.getElementById('cp-fx-natureza').value = f ? f.natureza_codigo : '';
  document.getElementById('cp-fx-valor').value =
    f && Number(f.valor_previsto) > 0 ? Number(f.valor_previsto).toFixed(2).replace('.', ',') : '';
  document.getElementById('cp-fx-dia').value = f ? (Number(f.dia_vencimento) || 10) : 10;
  document.getElementById('cp-fx-empresa').value = f ? (f.empresa || 'RENOVA') : 'RENOVA';
  document.getElementById('cp-fx-inicio').value = f ? f.inicio : (CP.competencia || CP.hoje.slice(0, 7));
  document.getElementById('cp-fx-fim').value = f ? f.fim : '';
  document.getElementById('cp-fx-forma').value = f && f.forma_pagamento ? f.forma_pagamento : 'Boleto';
  document.getElementById('cp-fx-obs').value = f ? f.observacao : '';
  document.getElementById('cp-fx-ativo').value = f ? (f.ativo ? '1' : '0') : '1';
  document.getElementById('cp-fx-remover').style.display = f ? '' : 'none';
  cpAbrir('cp-modal-fixa');
}

async function cpSalvarFixa() {
  const g = id => document.getElementById(id).value;
  const codigo = g('cp-fx-natureza');
  const conta = CP.plano.find(c => c.codigo === codigo);
  const fixa = {
    id: CP.fixaEditando,
    descricao: g('cp-fx-descricao').trim(),
    fornecedor: g('cp-fx-fornecedor').trim(),
    natureza_codigo: codigo,
    natureza: conta ? conta.nome : '',
    empresa: g('cp-fx-empresa'),
    valor_previsto: cpNum(g('cp-fx-valor')),
    dia_vencimento: Number(g('cp-fx-dia')) || 0,
    forma_pagamento: g('cp-fx-forma'),
    inicio: g('cp-fx-inicio'),
    fim: g('cp-fx-fim'),
    observacao: g('cp-fx-obs').trim(),
    ativo: g('cp-fx-ativo') === '1'
  };
  if (!fixa.descricao) { cpAviso('Informe a descrição da conta fixa.', 'erro'); return; }
  if (!fixa.natureza_codigo) { cpAviso('Escolha a natureza — é ela que leva a conta ao lugar certo do DRE.', 'erro'); return; }
  if (fixa.valor_previsto <= 0) { cpAviso('Informe o valor previsto.', 'erro'); return; }
  if (!(fixa.dia_vencimento >= 1 && fixa.dia_vencimento <= 31)) { cpAviso('O dia do vencimento vai de 1 a 31.', 'erro'); return; }
  if (!fixa.inicio) { cpAviso('Informe o mês em que a conta começa.', 'erro'); return; }

  try {
    await cpPost('fixa_salvar', { fixa });
    cpFechar('cp-modal-fixa');
    await cpCarregar();
    cpAviso('Conta fixa salva. Ela passa a entrar na geração mensal.', 'ok');
  } catch (e) {
    cpAviso('<b>Não consegui salvar.</b> ' + cpEsc(e.message), 'erro');
  }
}

async function cpRemoverFixa() {
  if (!CP.fixaEditando) return;
  if (!confirm('Remover esta conta fixa?\n\n' +
               'Só o molde some: os títulos já gerados continuam na base, porque são ' +
               'dívida de verdade.\n\nSe a conta apenas parou por um tempo, prefira ' +
               '"Pausada" — assim o histórico e o valor ficam guardados.')) return;
  try {
    await cpPost('fixa_remover', { id: CP.fixaEditando });
    cpFechar('cp-modal-fixa');
    await cpCarregar();
    cpAviso('Conta fixa removida.', 'ok');
  } catch (e) {
    cpAviso('<b>Não consegui remover.</b> ' + cpEsc(e.message), 'erro');
  }
}

// ── Geração do mês ───────────────────────────────────────────────────────
function cpAbrirGerarFixas() {
  if (!cpPodeEditar()) { cpAviso('Seu acesso é de consulta.', 'info'); return; }
  document.getElementById('cp-gf-competencia').value = CP.competencia || CP.hoje.slice(0, 7);
  CP.gfPrevia = null;
  document.getElementById('cp-tb-gf').innerHTML =
    '<tr><td colspan="5" class="cp-vazio">Carregando…</td></tr>';
  cpAbrir('cp-modal-gerar-fixas');
  cpPreviaFixas();
}

/** Mostra o que a geração faria, antes de gravar qualquer coisa. */
async function cpPreviaFixas() {
  const competencia = document.getElementById('cp-gf-competencia').value;
  const tb = document.getElementById('cp-tb-gf');
  const btn = document.getElementById('cp-gf-btn');
  if (!competencia) { tb.innerHTML = '<tr><td colspan="5" class="cp-vazio">Escolha a competência.</td></tr>'; return; }

  tb.innerHTML = '<tr><td colspan="5" class="cp-vazio">Carregando…</td></tr>';
  btn.disabled = true;
  try {
    const d = await cpPost('fixas_previa', { competencia });
    CP.gfPrevia = d;
    document.getElementById('cp-gf-sub').textContent = 'Competência ' + cpComp(d.competencia);

    const podem = d.itens.filter(i => i.vigente && !i.ja_gerado);
    tb.innerHTML = d.itens.length ? d.itens.map(i => {
      const livre = i.vigente && !i.ja_gerado;
      return '<tr' + (livre ? '' : ' style="opacity:.55;"') + '>' +
        '<td>' + (livre
          ? '<input type="checkbox" class="cp-gf-chk" value="' + cpEsc(i.id) + '" checked />'
          : '<i class="fa-solid fa-lock" style="color:var(--muted);font-size:.72rem;"></i>') + '</td>' +
        '<td style="font-weight:700;">' + cpEsc(i.descricao) +
          (i.fornecedor ? '<div style="font-size:.7rem;color:var(--muted);font-weight:500;">' + cpEsc(i.fornecedor) + '</div>' : '') + '</td>' +
        '<td style="white-space:nowrap;">' + cpDataLonga(i.data_vencimento) + '</td>' +
        '<td class="cp-num" style="font-weight:800;">' + cpBRL(i.valor_previsto) + '</td>' +
        '<td style="font-size:.74rem;color:' + (livre ? 'var(--muted)' : '#b45309') + ';">' +
          cpEsc(i.motivo || 'Pronta para gerar') + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="5" class="cp-vazio">Nenhuma conta fixa cadastrada.</td></tr>';

    btn.disabled = !podem.length;
    btn.innerHTML = '<i class="fa-solid fa-check"></i>Gerar ' + podem.length + ' título(s)';
  } catch (e) {
    tb.innerHTML = '<tr><td colspan="5" class="cp-vazio">Não consegui montar a prévia: ' + cpEsc(e.message) + '</td></tr>';
  }
}

async function cpGerarFixas() {
  const competencia = document.getElementById('cp-gf-competencia').value;
  const ids = Array.from(document.querySelectorAll('.cp-gf-chk:checked')).map(c => c.value);
  if (!ids.length) { cpAviso('Marque ao menos uma conta.', 'erro'); return; }

  const btn = document.getElementById('cp-gf-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Gerando…';
  try {
    const r = await cpPost('fixas_gerar', { competencia, ids });
    cpFechar('cp-modal-gerar-fixas');
    await cpCarregar();
    const total = r.criados.reduce((t, c) => t + (Number(c.valor) || 0), 0);
    cpAviso(r.criados.length
      ? '<b>' + r.criados.length + ' título(s) gerado(s)</b> para ' + cpComp(r.competencia) +
        ', somando ' + cpBRL(total) + '. Já aparecem na aba Títulos.'
      : 'Nada a gerar em ' + cpComp(r.competencia) + ' — tudo já estava lançado.',
      r.criados.length ? 'ok' : 'info');
  } catch (e) {
    cpAviso('<b>Não consegui gerar.</b> ' + cpEsc(e.message), 'erro');
    btn.disabled = false;
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-check"></i>Gerar';
  }
}

function cpAbrirTitulo(id) {
  if (!cpPodeEditar()) { cpAviso('Seu acesso é de consulta.', 'info'); return; }
  CP.editando = id || null;
  const t = id ? CP.titulos.find(x => x.id === id) : null;

  document.getElementById('cp-mt-titulo').textContent = t ? 'Editar título' : 'Novo título';
  document.getElementById('cp-mt-sub').textContent = t
    ? `${t.id} · origem ${t.origem || 'MANUAL'}` : 'Lançamento manual';
  document.getElementById('cp-t-excluir').style.display = t ? 'inline-flex' : 'none';

  const v = (campo, valor) => { document.getElementById('cp-t-' + campo).value = valor === undefined || valor === null ? '' : valor; };
  v('fornecedor', t ? t.fornecedor : '');
  v('emissao', t ? t.data_emissao : '');
  cpDicaEmissao();
  v('vencimento', t ? t.data_vencimento : CP.competencia + '-' + String(new Date().getDate()).padStart(2, '0'));
  v('empresa', t ? (t.empresa || 'RENOVA') : 'RENOVA');
  v('nf', t ? t.numero_nf : '');
  v('boleto', t ? t.numero_boleto : '');
  v('tipo', t ? (t.tipo_docto || 'Boleto') : 'Boleto');
  v('parcela', t ? (t.parcela || 1) : 1);
  v('parcelas', t ? (t.total_parcelas || 1) : 1);
  v('natureza', t ? t.natureza_codigo : '9.99');
  v('descricao', t ? t.descricao : '');
  v('obs1', t ? t.observacao_1 : '');
  v('obs2', t ? t.observacao_2 : '');
  v('forma', t ? (t.forma_pagamento || 'PIX') : 'PIX');
  v('valor', t ? (Number(t.valor_total) || 0).toFixed(2).replace('.', ',') : '');
  v('pago', t ? (Number(t.valor_pago) || 0).toFixed(2).replace('.', ',') : '');
  v('status', t ? t.status : 'ABERTO');
  v('baixa', t ? t.data_baixa : '');

  cpAbrir('cp-modal-titulo');
  setTimeout(() => document.getElementById('cp-t-fornecedor').focus(), 60);
}

async function cpSalvarTitulo() {
  const g = campo => document.getElementById('cp-t-' + campo).value;
  const btn = document.getElementById('cp-t-salvar');

  if (!g('fornecedor').trim()) { cpAviso('Informe o fornecedor.', 'erro'); return; }
  if (!g('vencimento')) { cpAviso('Informe o vencimento.', 'erro'); return; }
  if (cpNum(g('valor')) <= 0) { cpAviso('Informe um valor maior que zero.', 'erro'); return; }

  const codNat = g('natureza');
  const titulo = {
    id: CP.editando || '',
    fornecedor: g('fornecedor').trim(),
    data_emissao: g('emissao'), data_vencimento: g('vencimento'),
    empresa: g('empresa'), numero_nf: g('nf').trim(), numero_boleto: g('boleto').trim(),
    tipo_docto: g('tipo'), descricao: g('descricao').trim(),
    natureza_codigo: codNat, natureza: cpNomeConta(codNat),
    observacao_1: g('obs1').trim(), observacao_2: g('obs2').trim(),
    forma_pagamento: g('forma'),
    valor_total: cpNum(g('valor')), valor_pago: cpNum(g('pago')),
    status: g('status'), data_baixa: g('baixa'),
    parcela: parseInt(g('parcela'), 10) || 1,
    total_parcelas: parseInt(g('parcelas'), 10) || 1
  };
  if (CP.editando) {
    const antigo = CP.titulos.find(x => x.id === CP.editando);
    if (antigo) { titulo.fornecedor_cod = antigo.fornecedor_cod; titulo.origem = antigo.origem; }
  }

  btn.disabled = true;
  try {
    await cpPost('titulo_salvar', { titulo: titulo });
    cpFechar('cp-modal-titulo');
    cpAviso('Título salvo.', 'ok');
    await cpCarregar();
  } catch (e) {
    cpAviso('<b>Não deu para salvar.</b> ' + cpEsc(e.message), 'erro');
  } finally {
    btn.disabled = false;
  }
}

async function cpCancelarTitulo() {
  if (!CP.editando) return;
  const t = CP.titulos.find(x => x.id === CP.editando);
  if (!confirm(`Cancelar o título de ${t ? t.fornecedor : ''} no valor de ${cpBRL(t ? t.valor_total : 0)}?\n\nEle sai das listas mas continua guardado no histórico.`)) return;
  try {
    await cpPost('titulo_remover', { id: CP.editando });
    cpFechar('cp-modal-titulo');
    cpAviso('Título cancelado.', 'ok');
    await cpCarregar();
  } catch (e) {
    cpAviso('<b>Não deu para cancelar.</b> ' + cpEsc(e.message), 'erro');
  }
}

// ── Baixa ────────────────────────────────────────────────────────────────────
function cpAbrirBaixa(id) {
  if (!cpPodeEditar()) { cpAviso('Seu acesso é de consulta.', 'info'); return; }
  const t = CP.titulos.find(x => x.id === id);
  if (!t) return;
  CP.baixando = id;
  document.getElementById('cp-b-sub').textContent = t.fornecedor + ' · vence ' + cpDataLonga(t.data_vencimento);
  document.getElementById('cp-b-valor').value = cpSaldo(t).toFixed(2).replace('.', ',');
  document.getElementById('cp-b-data').value = CP.hoje;
  document.getElementById('cp-b-aviso').textContent =
    'Saldo em aberto: ' + cpBRL(cpSaldo(t)) + '. Pagando menos que o saldo o título fica como parcial.';
  cpAbrir('cp-modal-baixa');
}

async function cpConfirmarBaixa() {
  if (!CP.baixando) return;
  const t = CP.titulos.find(x => x.id === CP.baixando);
  const valor = cpNum(document.getElementById('cp-b-valor').value);
  if (valor <= 0) { cpAviso('Informe o valor pago.', 'erro'); return; }
  try {
    // O que vai para o servidor é o total pago acumulado, não a parcela desta baixa.
    await cpPost('titulo_baixar', {
      baixas: [{ id: CP.baixando, valor_pago: (Number(t.valor_pago) || 0) + valor,
                 data_baixa: document.getElementById('cp-b-data').value }]
    });
    cpFechar('cp-modal-baixa');
    cpAviso('Baixa registrada.', 'ok');
    await cpCarregar();
  } catch (e) {
    cpAviso('<b>Não deu para dar baixa.</b> ' + cpEsc(e.message), 'erro');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANO DE CONTAS
// ═══════════════════════════════════════════════════════════════════════════

function cpPlanoAtual() { return CP.planoRascunho || CP.plano; }

function cpMarcarPlanoSujo(sujo) {
  const b = document.getElementById('cp-btn-plano-salvar');
  if (b) b.disabled = !sujo;
}

function cpRenderPlano() {
  const plano = cpPlanoAtual();
  const doMes = CP.titulos.filter(t => t.status !== 'CANCELADO' && cpDoMes(t));

  const porConta = {};
  doMes.forEach(t => {
    const c = String(t.natureza_codigo);
    porConta[c] = (porConta[c] || 0) + (Number(t.valor_total) || 0);
  });

  const raizes = plano.filter(c => !c.codigo_pai).sort((a, b) => a.ordem - b.ordem);
  const html = raizes.map(r => {
    const filhos = plano.filter(c => c.codigo_pai === r.codigo).sort((a, b) => a.ordem - b.ordem);
    const totalRamo = filhos.reduce((s, f) => s + (porConta[f.codigo] || 0), 0) + (porConta[r.codigo] || 0);
    const cor = (CP_MACROS[r.macro] || {}).cor || '#64748b';

    return `<div class="cp-no raiz" style="border-left:4px solid ${cor};">
        <span class="cp-no-cod">${cpEsc(r.codigo)}</span>
        <span class="cp-no-nome">${cpEsc(r.nome)}</span>
        <span class="cp-no-val">${cpBRL(totalRamo)}</span>
        <span class="cp-no-acoes">${cpPodeEditar()
          ? `<button class="cp-acao" onclick="cpAbrirConta('${cpEsc(r.codigo)}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
             <button class="cp-acao" onclick="cpAbrirConta('','${cpEsc(r.codigo)}')" title="Nova subconta"><i class="fa-solid fa-plus"></i></button>` : ''}</span>
      </div>` +
      (filhos.length ? filhos.map(f => `
        <div class="cp-no filho">
          <span class="cp-no-cod">${cpEsc(f.codigo)}</span>
          <span class="cp-no-nome">${cpEsc(f.nome)}${f.ativo ? '' : ' <span class="cp-tag-macro">inativa</span>'}</span>
          <span class="cp-no-val">${porConta[f.codigo] ? cpBRL(porConta[f.codigo]) : '<span style="color:#cbd5e1;">—</span>'}</span>
          <span class="cp-no-acoes">${cpPodeEditar()
            ? `<button class="cp-acao" onclick="cpAbrirConta('${cpEsc(f.codigo)}')" title="Editar"><i class="fa-solid fa-pen"></i></button>` : ''}</span>
        </div>`).join('')
        : '<div class="cp-no filho" style="color:var(--muted);font-size:.76rem;">Sem subcontas.</div>');
  }).join('');

  document.getElementById('cp-arvore').innerHTML = html ||
    '<div class="cp-vazio">Plano de contas vazio. Rode a função <code>instalar()</code> no Apps Script.</div>';
}

function cpAbrirConta(codigo, paiSugerido) {
  if (!cpPodeEditar()) { cpAviso('Seu acesso é de consulta.', 'info'); return; }
  const plano = cpPlanoAtual();
  const c = codigo ? plano.find(x => x.codigo === codigo) : null;
  CP.contaEditando = codigo || null;

  document.getElementById('cp-c-titulo').textContent = c ? 'Editar conta' : 'Nova conta';
  document.getElementById('cp-c-codigo').value = c ? c.codigo : '';
  document.getElementById('cp-c-codigo').disabled = !!c;
  document.getElementById('cp-c-nome').value = c ? c.nome : '';
  document.getElementById('cp-c-macronat').value = c ? c.macro : 'OPERACIONAL';
  document.getElementById('cp-c-remover').style.display = c ? 'inline-flex' : 'none';

  const raizes = plano.filter(x => !x.codigo_pai && x.codigo !== codigo);
  document.getElementById('cp-c-pai').innerHTML =
    '<option value="">(conta de topo)</option>' +
    raizes.map(r => `<option value="${cpEsc(r.codigo)}">${cpEsc(r.codigo)} — ${cpEsc(r.nome)}</option>`).join('');
  document.getElementById('cp-c-pai').value = c ? (c.codigo_pai || '') : (paiSugerido || '');

  cpAbrir('cp-modal-conta');
}

function cpAplicarConta() {
  const codigo = document.getElementById('cp-c-codigo').value.trim();
  const nome = document.getElementById('cp-c-nome').value.trim();
  const pai = document.getElementById('cp-c-pai').value;
  const macro = document.getElementById('cp-c-macronat').value;

  if (!codigo) { cpAviso('Informe o código da conta.', 'erro'); return; }
  if (!nome) { cpAviso('Informe o nome da conta.', 'erro'); return; }
  if (!/^\d+(\.\d+)*$/.test(codigo)) { cpAviso('O código deve ser numérico, como 1.07 ou 2.12.', 'erro'); return; }

  CP.planoRascunho = cpPlanoAtual().map(c => Object.assign({}, c));
  const existente = CP.planoRascunho.find(c => c.codigo === codigo);

  if (!CP.contaEditando && existente) { cpAviso('Já existe uma conta com o código ' + codigo + '.', 'erro'); return; }
  if (pai && pai === codigo) { cpAviso('Uma conta não pode ser pai dela mesma.', 'erro'); return; }

  if (existente) {
    existente.nome = nome; existente.codigo_pai = pai; existente.macro = macro;
    existente.nivel = codigo.split('.').length;
    existente.tipo = pai ? 'ANALITICA' : 'SINTETICA';
  } else {
    const irmaos = CP.planoRascunho.filter(c => c.codigo_pai === pai);
    const base = pai ? (CP.planoRascunho.find(c => c.codigo === pai) || { ordem: 0 }).ordem : 0;
    CP.planoRascunho.push({
      codigo: codigo, nome: nome, codigo_pai: pai, nivel: codigo.split('.').length,
      tipo: pai ? 'ANALITICA' : 'SINTETICA', macro: macro, ativo: true,
      ordem: base + irmaos.length + 1
    });
  }

  CP.planoRascunho.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
  CP.planoRascunho.forEach((c, i) => { c.ordem = (i + 1) * 10; });

  cpFechar('cp-modal-conta');
  cpMarcarPlanoSujo(true);
  cpRenderPlano();
  cpAviso('Alteração pendente. Clique em <b>Salvar alterações</b> para gravar.', 'info');
}

function cpRemoverConta() {
  if (!CP.contaEditando) return;
  const plano = cpPlanoAtual();
  const filhos = plano.filter(c => c.codigo_pai === CP.contaEditando);
  if (filhos.length) { cpAviso(`A conta ${CP.contaEditando} tem ${filhos.length} subconta(s). Remova-as antes.`, 'erro'); return; }
  const usos = CP.titulos.filter(t => String(t.natureza_codigo) === CP.contaEditando && t.status !== 'CANCELADO').length;
  if (usos) { cpAviso(`A conta ${CP.contaEditando} está em ${usos} título(s). Reclassifique-os antes.`, 'erro'); return; }

  CP.planoRascunho = plano.filter(c => c.codigo !== CP.contaEditando).map(c => Object.assign({}, c));
  cpFechar('cp-modal-conta');
  cpMarcarPlanoSujo(true);
  cpRenderPlano();
  cpAviso('Remoção pendente. Clique em <b>Salvar alterações</b> para gravar.', 'info');
}

async function cpSalvarPlano() {
  if (!CP.planoRascunho) return;
  const btn = document.getElementById('cp-btn-plano-salvar');
  btn.disabled = true;
  try {
    await cpPost('plano_salvar', { contas: CP.planoRascunho });
    cpAviso('Plano de contas salvo.', 'ok');
    await cpCarregar();
  } catch (e) {
    cpAviso('<b>Não deu para salvar o plano.</b> ' + cpEsc(e.message), 'erro');
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINCRONIZAÇÃO DE NOTAS DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════

async function cpAbrirSync() {
  if (!cpPodeEditar()) { cpAviso('Seu acesso é de consulta.', 'info'); return; }
  cpAbrir('cp-modal-sync');
  document.getElementById('cp-tb-sync').innerHTML =
    '<tr><td colspan="7" class="cp-vazio">Buscando notas do Genesis…</td></tr>';
  document.getElementById('cp-sync-resumo').innerHTML = '';
  document.getElementById('cp-sync-aviso').innerHTML = '';
  CP.sync = { notas: [], marcadas: {}, existentes: {}, suspeitos: {}, naturezas: {} };
  cpSyncAtualizarRodape();

  try {
    // Vem pela API autenticada, não por arquivo publicado: o repositório do
    // portal é público e esses dados (fornecedor, CNPJ, NF, valor) não podem
    // ficar legíveis para qualquer um.
    const p = await cpPost('sync_ler', {});
    CP.sync.notas = p.notas || [];

    if (!CP.sync.notas.length) {
      document.getElementById('cp-tb-sync').innerHTML =
        `<tr><td colspan="7" class="cp-vazio">A fila de aprovação está vazia.<br><br>
         Rode na máquina do escritório:<br>
         <code>node integracao/extrair-contas-pagar.js --enviar --api &lt;url&gt; --token &lt;token&gt;</code></td></tr>`;
      return;
    }

    // Antes de mostrar, pergunta ao servidor o que já está lançado.
    const dup = await cpPost('checar_duplicidade', {
      chaves: CP.sync.notas.map(n => ({
        chave: n.chave_origem, numero_nf: n.numero_nf,
        parcela: n.parcela, valor_total: n.valor_total, fornecedor: n.fornecedor
      }))
    });
    CP.sync.existentes = dup.existentes || {};
    CP.sync.suspeitos = dup.suspeitos || {};

    // Já vem marcado só o que é novo — o operador tira o que não quiser.
    CP.sync.notas.forEach(n => {
      CP.sync.naturezas[n.chave_origem] = n.natureza_codigo || '9.99';
      if (!CP.sync.existentes[n.chave_origem] && !CP.sync.suspeitos[n.chave_origem]) {
        CP.sync.marcadas[n.chave_origem] = true;
      }
    });

    const geradoEm = p.gerado_em ? new Date(p.gerado_em).toLocaleString('pt-BR') : '—';
    document.getElementById('cp-sync-sub').textContent =
      `Extraído do Genesis em ${geradoEm} · janela ${p.janela ? cpDataLonga(p.janela.desde) + ' a ' + cpDataLonga(p.janela.ate) : '—'}`;

    cpSyncRenderResumo(p);
    cpSyncRender();
  } catch (e) {
    document.getElementById('cp-tb-sync').innerHTML =
      `<tr><td colspan="7" class="cp-vazio">Não consegui ler a fila de aprovação.<br><br>
       <b>${cpEsc(e.message)}</b></td></tr>`;
  }
}

function cpSyncRenderResumo(p) {
  const novas = CP.sync.notas.filter(n => !CP.sync.existentes[n.chave_origem]).length;
  const jaExistem = Object.keys(CP.sync.existentes).length;
  const suspeitas = Object.keys(CP.sync.suspeitos).length;
  const valorNovas = CP.sync.notas
    .filter(n => !CP.sync.existentes[n.chave_origem])
    .reduce((s, n) => s + (Number(n.valor_total) || 0), 0);

  document.getElementById('cp-sync-resumo').innerHTML = `
    <div class="cp-sync-chip">No arquivo<b>${CP.sync.notas.length}</b></div>
    <div class="cp-sync-chip">Novas<b style="color:#16a34a;">${novas}</b></div>
    <div class="cp-sync-chip">Já lançadas<b style="color:#64748b;">${jaExistem}</b></div>
    <div class="cp-sync-chip">Possíveis duplicatas<b style="color:#b45309;">${suspeitas}</b></div>
    <div class="cp-sync-chip">Valor das novas<b style="color:#0284c7;">${cpBRL(valorNovas)}</b></div>`;

  if (suspeitas) {
    document.getElementById('cp-sync-aviso').innerHTML = `
      <div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:10px;padding:10px 13px;font-size:.76rem;margin-bottom:12px;line-height:1.5;">
        <b>${suspeitas} nota(s) parecem já estar na base com outro fornecedor.</b>
        Acontece com o que foi migrado da planilha antiga, que não guardava o código do
        fornecedor. Elas vêm desmarcadas — confira antes de aprovar.
      </div>`;
  }
}

function cpSyncRender() {
  const analiticas = CP.plano.filter(c => c.tipo === 'ANALITICA' && c.ativo);

  document.getElementById('cp-tb-sync').innerHTML = CP.sync.notas.map(n => {
    const k = n.chave_origem;
    const existe = CP.sync.existentes[k];
    const suspeita = CP.sync.suspeitos[k];
    const classe = existe ? 'existe' : (suspeita ? 'suspeita' : '');

    let situacao;
    if (existe) situacao = `<span class="cp-pill cp-pill-existe">Já lançada · ${cpEsc(existe)}</span>`;
    else if (suspeita) {
      situacao = `<span class="cp-pill cp-pill-suspeita">Possível duplicata</span>` +
        suspeita.slice(0, 3).map(a => `<div class="cp-aviso-dup">${cpEsc(a.id)} · ${cpEsc(a.fornecedor)} ·
          ${a.total_parcelas > 1 ? 'parc. ' + a.parcela + '/' + a.total_parcelas + ' · ' : ''}
          venc. ${cpDataLonga(a.data_vencimento)} · ${cpBRL(a.valor_total)}</div>`).join('') +
        (suspeita.length > 3 ? `<div class="cp-aviso-dup">e mais ${suspeita.length - 3}…</div>` : '');
    } else situacao = `<span class="cp-pill cp-pill-nova">Nova</span>`;

    const parc = Number(n.total_parcelas) > 1
      ? ` <span class="cp-tag-macro">${n.parcela}/${n.total_parcelas}</span>` : '';

    return `<tr class="cp-sync-linha ${classe}">
      <td><input type="checkbox" ${existe ? 'disabled' : ''} ${CP.sync.marcadas[k] ? 'checked' : ''}
                 onchange="cpSyncMarcar('${cpEsc(k)}', this.checked)" /></td>
      <td style="white-space:nowrap;font-weight:700;">${cpDataLonga(n.data_vencimento)}</td>
      <td class="cp-forn" title="${cpEsc(n.fornecedor)}">${cpEsc(n.fornecedor)}
        <div style="font-size:.66rem;color:var(--muted);font-weight:600;">cód. ${cpEsc(n.fornecedor_cod || '—')}</div></td>
      <td style="font-size:.73rem;">${cpEsc(n.numero_nf || '—')}${parc}</td>
      <td>
        <select class="cp-sel-nat" ${existe ? 'disabled' : ''} onchange="cpSyncNatureza('${cpEsc(k)}', this.value)">
          ${analiticas.map(c => `<option value="${cpEsc(c.codigo)}" ${CP.sync.naturezas[k] === c.codigo ? 'selected' : ''}>${cpEsc(c.nome)}</option>`).join('')}
        </select>
      </td>
      <td class="cp-num" style="font-weight:800;">${cpBRL(n.valor_total)}</td>
      <td>${situacao}</td>
    </tr>`;
  }).join('');

  cpSyncAtualizarRodape();
}

function cpSyncMarcar(chave, marcado) {
  if (marcado) CP.sync.marcadas[chave] = true; else delete CP.sync.marcadas[chave];
  cpSyncAtualizarRodape();
}

function cpSyncNatureza(chave, codigo) { CP.sync.naturezas[chave] = codigo; }

function cpSyncMarcarTodos(marcado) {
  CP.sync.notas.forEach(n => {
    if (CP.sync.existentes[n.chave_origem]) return;
    if (marcado) CP.sync.marcadas[n.chave_origem] = true;
    else delete CP.sync.marcadas[n.chave_origem];
  });
  cpSyncRender();
}

function cpSyncAtualizarRodape() {
  const n = Object.keys(CP.sync.marcadas).length;
  const valor = CP.sync.notas
    .filter(x => CP.sync.marcadas[x.chave_origem])
    .reduce((s, x) => s + (Number(x.valor_total) || 0), 0);
  document.getElementById('cp-sync-sel').textContent = n
    ? `${n} nota(s) selecionada(s) · ${cpBRL(valor)}` : 'Nenhuma nota selecionada';
  document.getElementById('cp-sync-aprovar').disabled = !n;
}

async function cpSyncAprovar() {
  const escolhidas = CP.sync.notas.filter(n => CP.sync.marcadas[n.chave_origem]);
  if (!escolhidas.length) return;

  const suspeitas = escolhidas.filter(n => CP.sync.suspeitos[n.chave_origem]).length;
  const aviso = suspeitas
    ? `\n\nATENÇÃO: ${suspeitas} dela(s) parecem já estar na base com outro fornecedor.`
    : '';
  if (!confirm(`Lançar ${escolhidas.length} título(s), somando ${cpBRL(escolhidas.reduce((s, n) => s + n.valor_total, 0))}?${aviso}`)) return;

  const btn = document.getElementById('cp-sync-aprovar');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Lançando…';

  const titulos = escolhidas.map(n => {
    const cod = CP.sync.naturezas[n.chave_origem] || '9.99';
    return {
      origem: 'GENESIS', empresa: n.empresa || 'RENOVA',
      data_emissao: n.data_emissao, data_vencimento: n.data_vencimento,
      fornecedor: n.fornecedor, fornecedor_cod: n.fornecedor_cod,
      numero_nf: n.numero_nf, numero_boleto: n.numero_boleto,
      tipo_docto: n.tipo_docto, descricao: n.descricao,
      natureza_codigo: cod, natureza: cpNomeConta(cod),
      observacao_1: n.observacao_1, observacao_2: n.observacao_2,
      forma_pagamento: n.forma_pagamento,
      valor_total: n.valor_total, valor_pago: n.valor_pago,
      status: n.status, data_baixa: n.data_baixa,
      parcela: n.parcela, total_parcelas: n.total_parcelas
    };
  });

  try {
    // Blocos de 200: o Apps Script tem 6 minutos por execução.
    let inseridos = 0, ignorados = 0, erros = [];
    for (let i = 0; i < titulos.length; i += 200) {
      const r = await cpPost('importar', { titulos: titulos.slice(i, i + 200), origem: 'GENESIS' });
      inseridos += r.inseridos;
      ignorados += r.ignorados.length;
      erros = erros.concat(r.erros);
    }
    cpFechar('cp-modal-sync');
    let msg = `<b>${inseridos} título(s) lançado(s).</b>`;
    if (ignorados) msg += ` ${ignorados} já estavam na base e foram ignorados.`;
    if (erros.length) msg += ` ${erros.length} com erro: ` + cpEsc(erros.slice(0, 3).map(e => e.motivo).join('; '));
    cpAviso(msg, erros.length ? 'erro' : 'ok');
    await cpCarregar();
  } catch (e) {
    cpAviso('<b>Não deu para lançar.</b> ' + cpEsc(e.message), 'erro');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i>Aprovar selecionadas';
  }
}
