/**
 * Módulo: DRE Gerencial (Etapa 2 — só leitura, somente admin)
 * Carregado sob demanda por js/router.js. Fala com o apps-script/dre.gs
 * (actions `resultado`, `detalhe`, `classe_definir`, `budget_ler` e `budget_gravar`). Sem CONFIG.DRE_API usa dados de exemplo
 * INVENTADOS, só para ver o layout. Nada financeiro real mora neste arquivo.
 */

const DRE = {
  API: (typeof CONFIG !== 'undefined' && CONFIG.DRE_API) || '',
  PADRAO_MESES: 12,
  MAX_MESES: 24,
  dados: null,      // última resposta de `resultado`
  sel: null,        // célula do drill-down aberta { mes, linha }
  seq: 0,           // descarta resposta velha se o usuário mudou o período no meio
  seqDet: 0,        // idem para o drill-down
  det: null,        // resposta do drill-down aberto (receita: onde se corrige a classe da NF)
  seqBud: 0,
  cen: { RECEITA: 0, CUSTO_OP: 0, FIXA: 0, FIN: 0 },   // cenário local: % por grupo (nunca gravado)
  cenAtivo: false,
  bud: null,        // { mes, linhas (DRE do mês), metas { id: número }, sujo }
  exBudget: {},     // só no modo exemplo: metas feitas na tela { mes: { id: número } }
  exClasse: {},     // só no modo exemplo: correções feitas na tela { nf: 'CONTRATO' | 'SPOT' | 'AUTO' }
};

const dreApiLigada = () => /^https?:\/\//.test(DRE.API || '');
const dreP2 = n => String(n).padStart(2, '0');
const dreMoeda = v => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dreMesRotulo = k => { const [a, m] = k.split('-'); return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+m - 1] + '/' + a.slice(2); };
const dreIdDetalhavel = id => /^(R\.[123]|\d{1,2}\.\d{2})$/.test(id || '');
const dreNum = k => { const [a, m] = k.split('-').map(Number); return a * 12 + (m - 1); };
const dreDeNum = n => Math.floor(n / 12) + '-' + dreP2((n % 12) + 1);

function dreListaMeses(de, ate) {
  const out = [];
  for (let n = dreNum(de); n <= dreNum(ate); n++) out.push(dreDeNum(n));
  return out;
}

function initDre() {
  const de = document.getElementById('dre-de'), ate = document.getElementById('dre-ate');
  if (!de.value || !ate.value) {
    const hoje = new Date(), fim = hoje.getFullYear() * 12 + hoje.getMonth();
    ate.value = dreDeNum(fim);
    de.value = dreDeNum(fim - (DRE.PADRAO_MESES - 1));
  }
  const bm = document.getElementById('dre-bud-mes');
  if (!bm.value) bm.value = ate.value;
  dreCarregar(false);
  dreBudCarregar();
}

/** Valida o período; se passar de 24 meses, recua o "de" e avisa. Devolve null se inválido. */
function dreLerPeriodo() {
  const de = document.getElementById('dre-de'), ate = document.getElementById('dre-ate'), nota = document.getElementById('dre-nota-periodo');
  if (!/^\d{4}-\d{2}$/.test(de.value) || !/^\d{4}-\d{2}$/.test(ate.value)) return null;
  if (de.value > ate.value) { nota.textContent = 'O mês inicial vem depois do final.'; return null; }
  if (dreNum(ate.value) - dreNum(de.value) + 1 > DRE.MAX_MESES) {
    de.value = dreDeNum(dreNum(ate.value) - (DRE.MAX_MESES - 1));
    nota.textContent = 'Limite de ' + DRE.MAX_MESES + ' meses: o início foi ajustado.';
  } else nota.textContent = 'Máximo de ' + DRE.MAX_MESES + ' meses.';
  return { de: de.value, ate: ate.value };
}

function dreMudarPeriodo() { dreCarregar(false); }

async function drePost(action, corpo) {
  const r = await fetch(DRE.API, {
    method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action, token: RV.token }, corpo || {}))
  });
  const d = await r.json();
  if (!d.success) throw new Error(d.error || 'Falha no servidor do DRE.');
  return d.data;
}

async function dreCarregar(forcar, manterDetalhe) {
  const p = dreLerPeriodo();
  if (!p) return;
  const meu = ++DRE.seq;
  if (!manterDetalhe) dreFecharDetalhe();
  const erro = document.getElementById('dre-erro');
  erro.style.display = 'none';
  document.getElementById('dre-demo').style.display = dreApiLigada() ? 'none' : 'block';
  if (!manterDetalhe) document.getElementById('dre-tabela').innerHTML = '<div class="dre-nota" style="padding:16px;">Carregando…</div>';
  try {
    const d = dreApiLigada() ? await drePost('resultado', { de: p.de, ate: p.ate, forcar: !!forcar }) : dreExemploResultado(p.de, p.ate);
    if (meu !== DRE.seq) return;
    DRE.dados = d;
    dreRender();
  } catch (e) {
    if (meu !== DRE.seq) return;
    DRE.dados = null;
    document.getElementById('dre-tabela').innerHTML = '';
    erro.textContent = 'Não consegui carregar o DRE: ' + e.message;
    erro.style.display = 'block';
  }
}

function dreRender() {
  const d = dreVisao();
  document.getElementById('dre-gerado').textContent = d.gerado_em ? 'Base lida em ' + new Date(d.gerado_em).toLocaleString('pt-BR') : '';

  // avisos por mês (+ avisos gerais que tiverem contagem)
  const av = [];
  d.meses.forEach(m => (d.avisos[m] || []).forEach(t => av.push('<b>' + dreMesRotulo(m) + ':</b> ' + kbEsc(t))));
  const g = d.avisos_gerais || {}, r = g.receita || {}, s = g.despesas || {};
  if (r.sem_nf) av.push(r.sem_nf + ' parcela(s) do Contas a Receber sem número de NF ficaram fora da receita (R$ ' + dreMoeda(r.sem_nf_valor) + ').');
  if (r.sem_mes) av.push(r.sem_mes + ' parcela(s) sem data utilizável ficaram fora (R$ ' + dreMoeda(r.sem_mes_valor) + ').');
  if (s.sem_mes) av.push(s.sem_mes + ' título(s) de despesa sem data utilizável ficaram fora (R$ ' + dreMoeda(s.sem_mes_valor) + ').');
  const sv = DRE.dados && DRE.dados.servicos;
  if (sv && !sv.ok) av.push('Contrato automático desligado: ' + ({ sem_planilha: 'a planilha do Resultado Semanal ainda não foi ligada ao dre.gs', sem_itens: 'a aba Itens do Resultado Semanal está vazia', sem_colunas: 'a aba Itens não tem as colunas de OS e de descrição do serviço', erro_leitura: 'não consegui ler a planilha do Resultado Semanal' }[sv.motivo] || 'sem descrições dos serviços') + '. Só valem as correções feitas à mão.');
  document.getElementById('dre-avisos').innerHTML = av.map(t => '<div class="dre-aviso"><i class="fa-solid fa-triangle-exclamation"></i> ' + t + '</div>').join('');

  // tabela: meses em colunas, linhas na ordem do servidor, com coluna de total do período
  const temAviso = m => (d.avisos[m] || []).length > 0;
  let h = '<table><thead><tr><th>Linha</th>' + d.meses.map(m =>
    '<th>' + dreMesRotulo(m) + (temAviso(m) ? '<span class="dre-flag" title="' + kbEsc(d.avisos[m].join(' | ')) + '"><i class="fa-solid fa-triangle-exclamation"></i></span>' : '') + '</th>').join('') + '<th>Total</th></tr></thead><tbody>';
  d.linhas.forEach(l => {
    const det = !DRE.cenAtivo && l.tipo === 'conta' && dreIdDetalhavel(l.id);
    const tot = l.valores.reduce((a, b) => a + b, 0);
    h += '<tr class="' + kbEsc(l.tipo) + (l.grupo === 'INFO' ? ' info' : '') + '"><td>' + kbEsc(l.tipo === 'conta' && /^\d/.test(l.id) ? l.id + ' · ' + l.nome : l.nome) + '</td>';
    l.valores.forEach((v, i) => {
      const m = d.meses[i];
      const cls = (v < 0 ? 'neg ' : '') + (det ? 'clic ' : '') + (DRE.sel && DRE.sel.mes === m && DRE.sel.linha === l.id ? 'sel' : '');
      h += '<td class="' + cls + '"' + (det ? ' data-mes="' + m + '" data-linha="' + kbEsc(l.id) + '" title="Ver itens"' : '') + '>' + dreMoeda(v) + '</td>';
    });
    h += '<td class="' + (tot < 0 ? 'neg' : '') + '"><b>' + dreMoeda(tot) + '</b></td></tr>';
  });
  const tab = document.getElementById('dre-tabela');
  tab.innerHTML = h + '</tbody></table>';
  tab.onclick = ev => {
    const td = ev.target.closest('td.clic');
    if (td) dreAbrirDetalhe(td.dataset.mes, td.dataset.linha, td);
  };

  dreGraficoRender(d);
  dreCenRotulo();

  // NFs estimadas
  const est = d.estimadas || [];
  document.getElementById('dre-est-card').style.display = est.length ? 'block' : 'none';
  document.getElementById('dre-estimadas').innerHTML = est.length ?
    '<table><thead><tr><th>Mês</th><th>NF</th><th>Tipo</th><th>Cliente</th><th>OS</th><th>Parcelas</th><th>Lançado</th><th>Estimado</th></tr></thead><tbody>' +
    est.map(e => '<tr><td class="esq">' + dreMesRotulo(e.mes) + '</td><td class="esq">' + kbEsc(e.numero_nf) + '</td><td class="esq">' + kbEsc(e.tipo_nf) + '</td><td class="esq">' + kbEsc(e.cliente) +
      '</td><td class="esq">' + kbEsc(e.num_os) + '</td><td>' + kbEsc(e.parcelas_lancadas + '/' + e.total_parcelas) + '</td><td>' + dreMoeda(e.lancado) + '</td><td>' + dreMoeda(e.estimado) + '</td></tr>').join('') +
    '</tbody></table>' : '';
}

/* ── CENÁRIOS LOCAIS, GRÁFICO 12 MESES E EXPORT XLSX (Etapa 4) — tudo no navegador, nada é gravado ── */
const DRE_GRUPOS_CEN = [['RECEITA', 'Receita'], ['CUSTO_OP', 'Custos operacionais'], ['FIXA', 'Despesas fixas'], ['FIN', 'Despesas financeiras']];

/** "10", "-5", "+2,5" → número (limite ±100); vazio → 0; inválido → NaN. */
function dreCenParse(txt) {
  const t = String(txt == null ? '' : txt).trim().replace(/\s/g, '').replace('%', '').replace(',', '.');
  if (t === '') return 0;
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return NaN;
  const n = Number(t);
  return n < -100 || n > 100 ? NaN : n;
}

/**
 * Função pura: aplica % por grupo ({RECEITA, CUSTO_OP, FIXA, FIN}) sobre o resultado real e refaz
 * grupos e totais. Contas do grupo INFO (fora do resultado) não mudam. Não altera o objeto de entrada.
 */
function dreCenario(dados, aj) {
  const r2 = n => Math.round(n * 100) / 100;
  const meses = dados.meses, n = meses.length;
  const fator = g => 1 + ((aj && aj[g]) || 0) / 100;
  const contas = dados.linhas.map(l => l.tipo === 'conta' ? { ...l, valores: l.valores.map(v => r2(v * fator(l.grupo))) } : l);
  const soma = g => meses.map((_, i) => r2(contas.filter(l => l.tipo === 'conta' && l.grupo === g).reduce((a, l) => a + l.valores[i], 0)));
  const S = { RECEITA: soma('RECEITA'), CUSTO_OP: soma('CUSTO_OP'), FIXA: soma('FIXA'), FIN: soma('FIN'), INFO: soma('INFO') };
  const sub = (a, b) => a.map((v, i) => r2(v - b[i]));
  const MARGEM = sub(S.RECEITA, S.CUSTO_OP), RES_OP = sub(MARGEM, S.FIXA), RESULTADO = sub(RES_OP, S.FIN);
  const T = { MARGEM, RES_OP, RESULTADO };
  const linhas = contas.map(l => {
    if (l.tipo === 'conta') return l;
    if (l.tipo === 'grupo') return { ...l, valores: S[l.id] || new Array(n).fill(0) };
    return { ...l, valores: T[l.id] || l.valores.slice() };
  });
  return { ...dados, linhas };
}

/** Série do gráfico: últimos 12 meses do período carregado (receita, resultado operacional, resultado do período). */
function dreGraficoDados(dados) {
  const ini = Math.max(0, dados.meses.length - 12);
  const ach = id => { const l = dados.linhas.find(x => x.id === id); return l ? l.valores.slice(ini) : []; };
  return { meses: dados.meses.slice(ini), receita: ach('RECEITA'), resOp: ach('RES_OP'), resultado: ach('RESULTADO') };
}

/** Matriz (linhas × colunas) do DRE para o XLSX: título, cabeçalho, linhas e coluna Total. */
function dreAoa(d, titulo) {
  const r2 = n => Math.round(n * 100) / 100;
  const aoa = [[titulo || 'DRE Gerencial'], [], ['Linha'].concat(d.meses.map(dreMesRotulo), ['Total'])];
  d.linhas.forEach(l => aoa.push([l.tipo === 'conta' && /^\d/.test(l.id) ? l.id + ' · ' + l.nome : l.nome].concat(l.valores, [r2(l.valores.reduce((a, b) => a + b, 0))])));
  return aoa;
}

/** O que a tela mostra: o real, ou o cenário se algum percentual estiver preenchido. */
function dreVisao() {
  DRE.cenAtivo = DRE_GRUPOS_CEN.some(([g]) => DRE.cen[g]);
  return DRE.cenAtivo ? dreCenario(DRE.dados, DRE.cen) : DRE.dados;
}

function dreCenMudou() {
  const novo = {};
  let ruim = false;
  DRE_GRUPOS_CEN.forEach(([g]) => {
    const inp = document.getElementById('dre-cen-' + g), v = dreCenParse(inp.value);
    inp.classList.toggle('ruim', Number.isNaN(v));
    if (Number.isNaN(v)) ruim = true; else novo[g] = v;
  });
  document.getElementById('dre-cen-msg').textContent = ruim ? 'Use números entre -100 e 100 (ex.: 10 ou -5).' : '';
  if (ruim || !DRE.dados) return;
  DRE.cen = novo;
  dreFecharDetalhe();
  dreRender();
}

function dreCenReset() {
  DRE_GRUPOS_CEN.forEach(([g]) => { const i = document.getElementById('dre-cen-' + g); i.value = ''; i.classList.remove('ruim'); });
  DRE.cen = { RECEITA: 0, CUSTO_OP: 0, FIXA: 0, FIN: 0 };
  document.getElementById('dre-cen-msg').textContent = '';
  if (DRE.dados) dreRender();
}

function dreCenRotulo() {
  const el = document.getElementById('dre-cen-faixa');
  if (el) el.style.display = DRE.cenAtivo ? 'block' : 'none';
}

function dreCenDescricao() {
  return DRE_GRUPOS_CEN.filter(([g]) => DRE.cen[g]).map(([g, n]) => n + ' ' + (DRE.cen[g] > 0 ? '+' : '') + DRE.cen[g] + '%').join(', ');
}

/** Gráfico em SVG puro (sem biblioteca): barras = receita; linhas = res. operacional e resultado. */
function dreGraficoRender(d) {
  const box = document.getElementById('dre-grafico');
  if (!box) return;
  const g = dreGraficoDados(d), n = g.meses.length;
  const W = 900, H = 280, ml = 70, mr = 12, mt = 14, mb = 30;
  if (!n) { box.innerHTML = ''; return; }
  const todos = g.receita.concat(g.resOp, g.resultado, [0]);
  let max = Math.max(...todos), min = Math.min(...todos);
  if (max === min) max = min + 1;
  const y = v => mt + (max - v) / (max - min) * (H - mt - mb), x = i => ml + (i + 0.5) * (W - ml - mr) / n, bw = Math.min(40, (W - ml - mr) / n * 0.5);
  const k = v => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' mi' : Math.round(v / 1000) + ' mil');
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Receita, resultado operacional e resultado do período por mês" style="width:100%;height:auto;max-height:320px">';
  for (let t = 0; t <= 4; t++) {
    const v = min + (max - min) * t / 4;
    s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e1e0d9"/><text x="' + (ml - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="#64748b">' + k(v) + '</text>';
  }
  s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#94a3b8"/>';
  g.receita.forEach((v, i) => { s += '<rect x="' + (x(i) - bw / 2) + '" y="' + Math.min(y(v), y(0)) + '" width="' + bw + '" height="' + Math.abs(y(v) - y(0)) + '" fill="#bcd2ea"><title>' + dreMesRotulo(g.meses[i]) + ' · Receita: R$ ' + dreMoeda(v) + '</title></rect>'; });
  const linha = (vs, cor, nome) => {
    s += '<polyline fill="none" stroke="' + cor + '" stroke-width="2.5" points="' + vs.map((v, i) => x(i) + ',' + y(v)).join(' ') + '"/>';
    vs.forEach((v, i) => { s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3.5" fill="' + cor + '"><title>' + dreMesRotulo(g.meses[i]) + ' · ' + nome + ': R$ ' + dreMoeda(v) + '</title></circle>'; });
  };
  linha(g.resOp, '#1e3a5f', 'Resultado operacional');
  linha(g.resultado, '#c2410c', 'Resultado do período');
  g.meses.forEach((m, i) => { s += '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="#475569">' + dreMesRotulo(m) + '</text>'; });
  box.innerHTML = s + '</svg>';
  document.getElementById('dre-grafico-nota').textContent = (n < 12 ? 'Mostrando ' + n + ' mês(es): o período da tela tem menos de 12. Aumente o "De" para ver 12. ' : '') + (DRE.cenAtivo ? 'Valores do cenário (não é o real).' : '');
}

/** Gera o XLSX no navegador (biblioteca xlsx carregada pelo router); nada sai para serviço externo. */
function dreExportar() {
  if (!DRE.dados) return;
  if (typeof XLSX === 'undefined') { alert('Biblioteca de Excel não carregou. Recarregue a página.'); return; }
  const d = dreVisao();
  const ini = d.meses[0], fim = d.meses[d.meses.length - 1], ex = dreApiLigada() ? '' : '_exemplo';
  const titulo = 'DRE Gerencial · ' + dreMesRotulo(ini) + ' a ' + dreMesRotulo(fim) + (DRE.cenAtivo ? ' · CENÁRIO (' + dreCenDescricao() + ')' : '') + (ex ? ' · DADOS DE EXEMPLO' : '');
  const ws = XLSX.utils.aoa_to_sheet(dreAoa(d, titulo));
  ws['!cols'] = [{ wch: 38 }].concat(d.meses.map(() => ({ wch: 14 })), [{ wch: 16 }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, DRE.cenAtivo ? 'Cenario' : 'DRE');
  XLSX.writeFile(wb, 'DRE_' + ini + '_a_' + fim + (DRE.cenAtivo ? '_cenario' : '') + ex + '.xlsx');
}

function dreFecharDetalhe() {
  DRE.sel = null;
  DRE.seqDet++;
  const c = document.getElementById('dre-det-card');
  if (c) c.style.display = 'none';
  document.querySelectorAll('#screen-dre td.sel').forEach(td => td.classList.remove('sel'));
}

async function dreAbrirDetalhe(mes, linha, td) {
  const l = DRE.dados.linhas.find(x => x.id === linha);
  DRE.sel = { mes, linha };
  document.querySelectorAll('#screen-dre td.sel').forEach(x => x.classList.remove('sel'));
  if (td) td.classList.add('sel');
  const card = document.getElementById('dre-det-card'), corpo = document.getElementById('dre-det-corpo');
  document.getElementById('dre-det-titulo').textContent = (l ? l.nome : linha) + ' · ' + dreMesRotulo(mes);
  corpo.innerHTML = '<div class="dre-nota">Buscando itens…</div>';
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const meu = ++DRE.seqDet;   // clicar em outra célula (ou mudar o período) invalida esta consulta
  try {
    const d = dreApiLigada() ? await drePost('detalhe', { mes, linha }) : dreExemploDetalhe(mes, linha);
    if (meu !== DRE.seqDet) return;
    corpo.innerHTML = dreRenderDetalhe(d);
    if (d.tipo === 'receita') dreDetLigar(corpo);
  } catch (e) {
    if (meu !== DRE.seqDet) return;
    corpo.innerHTML = '<div class="dre-erro">Não consegui buscar os itens: ' + kbEsc(e.message) + '</div>';
  }
}

const dreDestinoNome = nf => nf.tipo_nf === 'PECA' ? 'Spot Peças' : 'Spot Serviços';

function dreRenderDetalhe(d) {
  DRE.det = d;
  let h = '<div class="dre-det-resumo"><span>Total real: <b id="dre-det-total">R$ ' + dreMoeda(d.total) + '</b></span><span>Itens: <b id="dre-det-qtd">' + d.quantidade + '</b></span></div>';
  if (d.cortado) h += '<div class="dre-aviso"><i class="fa-solid fa-scissors"></i> Lista cortada: mostrando só os ' + d.itens.length + ' maiores de ' + d.quantidade + '. O total acima é o real, de todos os itens.</div>';
  if (d.tipo === 'receita') {
    const ehContrato = d.linha === 'R.1';
    h += '<div class="dre-det-busca"><i class="fa-solid fa-magnifying-glass"></i><input id="dre-det-busca" type="search" placeholder="Buscar por NF, cliente, OS ou descrição do serviço" autocomplete="off"></div>' +
      '<div id="dre-det-msg"></div>' +
      '<p class="dre-nota">' + (ehContrato
        ? 'Contrato é identificado pela palavra "contrato" na descrição do serviço da OS. Se alguma NF não é contrato, use "Tirar de contrato".'
        : 'Se alguma destas NFs for de contrato e não foi identificada, use "É contrato". A correção vale na hora e fica registrada.') + '</p>' +
      '<div class="dre-rolagem"><table><thead><tr><th>NF</th><th>Tipo</th><th>Cliente</th><th>OS</th><th>Descrição do serviço</th><th>Valor</th><th>Classe</th></tr></thead><tbody>' +
      d.itens.map((i, n) => {
        const q = [i.numero_nf, i.cliente, i.num_os, i.descricao].join(' ').toLowerCase();
        const origem = i.origem_classe === 'manual' ? '<span class="dre-chip man" title="Corrigida à mão">à mão</span>' : (i.origem_classe === 'descricao' ? '<span class="dre-chip auto" title="Identificada pela descrição do serviço">automático</span>' : '');
        return '<tr data-n="' + n + '" data-q="' + kbEsc(q) + '"><td class="esq">' + kbEsc(i.numero_nf) + '</td><td class="esq">' + kbEsc(i.tipo_nf) + '</td><td class="esq">' + kbEsc(i.cliente) + '</td><td class="esq">' + kbEsc(i.num_os) +
          '</td><td class="esq dre-desc">' + kbEsc(i.descricao || '—') + '</td><td>' + (i.estimada ? '<span class="dre-est">estimada</span> ' : '') + dreMoeda(i.valor) +
          '</td><td class="esq dre-classe">' + origem + '<button class="dre-btn mini" data-acao="classe" data-n="' + n + '">' + (ehContrato ? 'Tirar de contrato' : 'É contrato') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  } else {
    h += '<div class="dre-rolagem"><table><thead><tr><th>Emissão</th><th>Título</th><th>Fornecedor</th><th>Descrição</th><th>NF</th><th>Natureza</th><th>Status</th><th>Valor</th></tr></thead><tbody>' +
      d.itens.map(i => '<tr><td class="esq">' + kbEsc((i.emissao || '').split('-').reverse().join('/')) + '</td><td class="esq">' + kbEsc(i.id) + '</td><td class="esq">' + kbEsc(i.fornecedor) +
        '</td><td class="esq">' + kbEsc(i.descricao) + '</td><td class="esq">' + kbEsc(i.numero_nf) + '</td><td class="esq">' + kbEsc(i.natureza_codigo) + '</td><td class="esq">' + kbEsc(i.status) +
        '</td><td>' + dreMoeda(i.valor) + '</td></tr>').join('') + '</tbody></table></div>';
  }
  return h;
}

/** Busca + botões do drill-down de receita (uma ligação por abertura; o corpo é recriado a cada clique). */
function dreDetLigar(corpo) {
  const busca = document.getElementById('dre-det-busca');
  busca.oninput = () => {
    const q = busca.value.trim().toLowerCase();
    corpo.querySelectorAll('tr[data-q]').forEach(tr => { tr.style.display = !q || tr.dataset.q.includes(q) ? '' : 'none'; });
  };
  corpo.onclick = ev => {
    const bt = ev.target.closest('button[data-acao="classe"]');
    if (bt) dreClasseMudar(bt);
  };
}

/**
 * Corrige a classe de UMA NF (contrato ↔ Spot). Responde na hora: a linha sai da lista,
 * o total do drill-down é ajustado aqui e a gravação segue em segundo plano. Só volta
 * atrás (e avisa) se o servidor recusar.
 */
async function dreClasseMudar(bt) {
  const d = DRE.det, nf = d && d.itens[+bt.dataset.n], msg = document.getElementById('dre-det-msg');
  if (!nf || nf.salvando) return;
  const querContrato = d.linha !== 'R.1';
  // se o que se pede é o que a descrição já diz, apaga a correção (AUTO) em vez de gravar outra
  const classe = (!!nf.auto_contrato === querContrato) ? 'AUTO' : (querContrato ? 'CONTRATO' : 'SPOT');
  const tr = bt.closest('tr'), rotulo = bt.textContent;
  nf.salvando = true; bt.disabled = true; bt.textContent = 'Gravando…';
  try {
    if (dreApiLigada()) await drePost('classe_definir', { competencia: d.mes, numero_nf: nf.numero_nf, tipo_nf: nf.tipo_nf, cliente_cod: nf.cliente_cod || '', classe });
    else DRE.exClasse[nf.numero_nf] = classe;
    if (DRE.det !== d) return;   // trocou de célula no meio: o servidor já gravou, a tela nova se vira sozinha
    tr.remove();
    d.total = Math.round((d.total - nf.valor) * 100) / 100; d.quantidade--;
    document.getElementById('dre-det-total').textContent = 'R$ ' + dreMoeda(d.total);
    document.getElementById('dre-det-qtd').textContent = d.quantidade;
    msg.innerHTML = '<div class="dre-ok"><i class="fa-solid fa-circle-check"></i> NF ' + kbEsc(nf.numero_nf) + ' passou para ' + (querContrato ? 'Contratos' : dreDestinoNome(nf)) + '. A tabela já foi atualizada.</div>';
    dreCarregar(false, true);   // o servidor limpou o cache: a tabela sai com o valor novo, sem fechar o detalhe
  } catch (e) {
    nf.salvando = false; bt.disabled = false; bt.textContent = rotulo;
    if (msg) msg.innerHTML = '<div class="dre-erro">Não consegui gravar a NF ' + kbEsc(nf.numero_nf) + ': ' + kbEsc(e.message) + '</div>';
  }
}

/* ── ORÇADO × EXECUTADO (Etapa 3) ── */
const dreBudSinalReceita = l => l.grupo === 'RECEITA' || ['MARGEM', 'RES_OP', 'RESULTADO'].includes(l.id);   // para esses, mais que a meta é bom

/** "1234,5" / "1.234,50" / "1234.5" → número ≥ 0; vazio → null; inválido → NaN. */
function dreBudParse(txt) {
  let t = String(txt || '').trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Number(t);
}

/**
 * Função pura: junta o executado do mês (linhas do `resultado` com 1 mês) com as metas { id: valor }.
 * Conta → meta própria; grupo → soma das metas das contas do grupo; total → mesma fórmula do DRE.
 * Sem nenhuma meta no mês, tudo fica sem orçado (null).
 */
function dreBudCalc(linhas, metas) {
  const r2 = n => Math.round(n * 100) / 100;
  const soma = {};
  let algum = false;
  linhas.forEach(l => { if (l.tipo === 'conta' && metas[l.id] != null) { soma[l.grupo] = (soma[l.grupo] || 0) + metas[l.id]; algum = true; } });
  const g = id => soma[id] || 0;
  const orcTot = { MARGEM: g('RECEITA') - g('CUSTO_OP') };
  orcTot.RES_OP = orcTot.MARGEM - g('FIXA');
  orcTot.RESULTADO = orcTot.RES_OP - g('FIN');
  return linhas.map(l => {
    let orc = null;
    if (algum) {
      if (l.tipo === 'conta') orc = metas[l.id] != null ? metas[l.id] : null;
      else if (l.tipo === 'grupo') orc = g(l.id);
      else orc = orcTot[l.id] != null ? orcTot[l.id] : null;
    }
    const exec = l.valores[0];
    const v = orc == null ? null : r2(exec - orc);
    const pct = orc ? r2((exec - orc) / Math.abs(orc) * 100) : null;
    const bom = v == null || v === 0 ? null : (dreBudSinalReceita(l) ? v > 0 : v < 0);
    return { id: l.id, nome: l.nome, tipo: l.tipo, grupo: l.grupo, exec, orc: orc == null ? null : r2(orc), var: v, pct, bom };
  });
}

async function dreBudCarregar() {
  const mes = document.getElementById('dre-bud-mes').value;
  const tab = document.getElementById('dre-bud-tabela'), msg = document.getElementById('dre-bud-msg');
  if (!/^\d{4}-\d{2}$/.test(mes)) { tab.innerHTML = ''; return; }
  const meu = ++DRE.seqBud;
  msg.innerHTML = '';
  tab.innerHTML = '<div class="dre-nota" style="padding:8px;">Carregando…</div>';
  try {
    const [res, bd] = dreApiLigada()
      ? await Promise.all([drePost('resultado', { de: mes, ate: mes }), drePost('budget_ler', { de: mes, ate: mes })])
      : [dreExemploResultado(mes, mes), { itens: Object.entries(DRE.exBudget[mes] || {}).map(([linha, valor]) => ({ competencia: mes, linha, valor })) }];
    if (meu !== DRE.seqBud) return;
    const metas = {};
    bd.itens.forEach(i => { if (i.competencia === mes) metas[i.linha] = i.valor; });
    DRE.bud = { mes, linhas: res.linhas, metas, sujo: false, invalidos: 0 };
    dreBudRender();
  } catch (e) {
    if (meu !== DRE.seqBud) return;
    DRE.bud = null;
    tab.innerHTML = '';
    msg.innerHTML = '<div class="dre-erro">Não consegui carregar o orçado: ' + kbEsc(e.message) + '</div>';
  }
}

function dreBudRender() {
  const b = DRE.bud, tab = document.getElementById('dre-bud-tabela');
  const calc = dreBudCalc(b.linhas, b.metas);
  tab.innerHTML = '<table><thead><tr><th>Linha</th><th>Orçado</th><th>Executado</th><th>Variação R$</th><th>Variação %</th></tr></thead><tbody>' +
    calc.map(c => {
      const edit = c.tipo === 'conta' && dreIdDetalhavel(c.id);
      return '<tr class="' + kbEsc(c.tipo) + (c.grupo === 'INFO' ? ' info' : '') + '" data-id="' + kbEsc(c.id) + '"><td>' + kbEsc(c.tipo === 'conta' && /^\d/.test(c.id) ? c.id + ' · ' + c.nome : c.nome) + '</td>' +
        '<td>' + (edit ? '<input class="bud-in" inputmode="decimal" data-id="' + kbEsc(c.id) + '" value="' + (c.orc == null ? '' : dreMoeda(c.orc)) + '" aria-label="Meta de ' + kbEsc(c.nome) + '">' : '<span data-col="orc"></span>') + '</td>' +
        '<td data-col="exec"></td><td data-col="var"></td><td data-col="pct"></td></tr>';
    }).join('') + '</tbody></table>';
  tab.oninput = ev => {
    const inp = ev.target.closest('input.bud-in');
    if (!inp) return;
    const v = dreBudParse(inp.value);
    inp.classList.toggle('ruim', Number.isNaN(v));
    if (!Number.isNaN(v)) { if (v == null) delete b.metas[inp.dataset.id]; else b.metas[inp.dataset.id] = v; }
    b.sujo = true;
    dreBudAtualizar();
  };
  tab.onchange = ev => {   // ao sair do campo, mostra o valor formatado
    const inp = ev.target.closest('input.bud-in');
    const v = inp ? dreBudParse(inp.value) : NaN;
    if (inp && v != null && !Number.isNaN(v)) inp.value = dreMoeda(v);
  };
  dreBudAtualizar();
}

/** Recalcula só os números (sem recriar a tabela, para não perder o foco do campo). Nenhuma chamada de rede. */
function dreBudAtualizar() {
  const b = DRE.bud;
  const calc = dreBudCalc(b.linhas, b.metas);
  const tab = document.getElementById('dre-bud-tabela');
  calc.forEach(c => {
    const tr = tab.querySelector('tr[data-id="' + c.id + '"]');
    if (!tr) return;
    const set = (col, txt, cls) => { const el = tr.querySelector('[data-col="' + col + '"]'); if (el) { el.textContent = txt; if (cls !== undefined) el.className = cls; } };
    set('orc', c.orc == null ? '—' : dreMoeda(c.orc));
    set('exec', dreMoeda(c.exec));
    const cls = c.bom == null ? '' : (c.bom ? 'bud-bom' : 'bud-ruim');
    set('var', c.var == null ? '—' : (c.var > 0 ? '+' : '') + dreMoeda(c.var), cls);
    set('pct', c.pct == null ? '—' : (c.pct > 0 ? '+' : '') + dreMoeda(c.pct) + '%', cls);
  });
  b.invalidos = tab.querySelectorAll('input.bud-in.ruim').length;
  document.getElementById('dre-bud-salvar').disabled = !b.sujo || b.invalidos > 0;
}

async function dreBudSalvar() {
  const b = DRE.bud, msg = document.getElementById('dre-bud-msg'), btn = document.getElementById('dre-bud-salvar');
  if (!b || !b.sujo || b.invalidos) return;
  const itens = b.linhas.filter(l => l.tipo === 'conta' && dreIdDetalhavel(l.id)).map(l => ({ linha: l.id, valor: b.metas[l.id] == null ? null : b.metas[l.id] }));
  btn.disabled = true;
  try {
    if (dreApiLigada()) await drePost('budget_gravar', { competencia: b.mes, itens });
    else DRE.exBudget[b.mes] = Object.assign({}, b.metas);
    b.sujo = false;
    msg.innerHTML = '<div class="dre-aviso" style="background:#eef7ee;color:var(--dre-bom);"><i class="fa-solid fa-check"></i> Metas de ' + dreMesRotulo(b.mes) + ' salvas.</div>';
    dreBudAtualizar();
  } catch (e) {
    btn.disabled = false;
    msg.innerHTML = '<div class="dre-erro">Não consegui salvar as metas: ' + kbEsc(e.message) + '</div>';
  }
}

/* ── DADOS DE EXEMPLO (inventados; só para ver o layout enquanto o dre.gs não está no ar) ── */
function dreSemente(txt) { let h = 7; for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) % 1000003; return h; }
function dreValorEx(mes, id, base) { return Math.round(base * (0.7 + (dreSemente(mes + id) % 600) / 1000) * 100) / 100; }

function dreExemploResultado(de, ate) {
  const meses = dreListaMeses(de, ate);
  const conta = (id, nome, grupo, base) => ({ id, nome, tipo: 'conta', grupo, valores: meses.map(m => dreValorEx(m, id, base)) });
  const soma = ls => meses.map((_, i) => Math.round(ls.reduce((a, l) => a + l.valores[i], 0) * 100) / 100);
  const sub = (a, b) => a.map((v, i) => Math.round((v - b[i]) * 100) / 100);
  const rec = [conta('R.1', 'Contratos', 'RECEITA', 180000), conta('R.2', 'Spot Serviços', 'RECEITA', 100000), conta('R.3', 'Spot Peças', 'RECEITA', 150000)];
  const cus = [conta('1.01', 'Peças e insumos (exemplo)', 'CUSTO_OP', 90000), conta('1.02', 'Mão de obra direta (exemplo)', 'CUSTO_OP', 110000)];
  const fix = [conta('2.01', 'Aluguel (exemplo)', 'FIXA', 30000), conta('2.02', 'Administrativo (exemplo)', 'FIXA', 60000)];
  const fin = [conta('3.01', 'Tarifas (exemplo)', 'FIN', 8000), conta('3.03', 'Juros (exemplo)', 'FIN', 12000)];
  const inf = [conta('3.02', 'Empréstimos (exemplo)', 'INFO', 40000), conta('4.01', 'CAPEX (exemplo)', 'INFO', 25000)];
  const R = soma(rec), C = soma(cus), F = soma(fix), N = soma(fin), I = soma(inf);
  const margem = sub(R, C), resOp = sub(margem, F), res = sub(resOp, N);
  const g = (id, nome, grupo, valores) => ({ id, nome, tipo: 'grupo', grupo, valores });
  const t = (id, nome, valores) => ({ id, nome, tipo: 'total', grupo: id, valores });
  const estMes = meses[meses.length - 1];
  const avisos = { [estMes]: ['1 NF(s) parcelada(s) com valor estimado (faltam parcelas no Contas a Receber).'] };
    return {
    meses, gerado_em: new Date().toISOString(),
    linhas: [].concat([g('RECEITA', 'Receita Bruta', 'RECEITA', R)], rec, [g('CUSTO_OP', 'Custos Operacionais', 'CUSTO_OP', C)], cus,
      [t('MARGEM', 'Margem de Contribuição', margem), g('FIXA', 'Despesas Fixas', 'FIXA', F)], fix, [t('RES_OP', 'Resultado Operacional', resOp),
      g('FIN', 'Despesas Financeiras', 'FIN', N)], fin, [t('RESULTADO', 'Resultado do Período', res), g('INFO', 'Fora do resultado (informativo)', 'INFO', I)], inf),
    estimadas: [{ mes: estMes, numero_nf: '9001', tipo_nf: 'SERVICO', cliente: 'CLIENTE EXEMPLO LTDA', num_os: '1234', lancado: 4000, estimado: 20000, parcelas_lancadas: 1, total_parcelas: 5 }],
    avisos,
    avisos_gerais: { receita: { sem_nf: 2, sem_nf_valor: 1500 }, despesas: {} }
  };
}

function dreExemploDetalhe(mes, linha) {
  const lin = DRE.dados.linhas.find(x => x.id === linha);
  const alvo = lin ? lin.valores[DRE.dados.meses.indexOf(mes)] : 1000;
  const rec = linha.charAt(0) === 'R', n = rec ? 7 : 5, pesos = [];
  for (let i = 0; i < n; i++) pesos.push(1 + (dreSemente(mes + linha + i) % 9));
  const ps = pesos.reduce((a, b) => a + b, 0);
  let acum = 0;
  const vals = pesos.map((p, i) => { const v = i === n - 1 ? Math.round((alvo - acum) * 100) / 100 : Math.round(alvo * p / ps * 100) / 100; acum += v; return v; });
  vals.sort((a, b) => b - a);
  const itens = vals.map((v, i) => rec
    ? { numero_nf: String(9100 + i), tipo_nf: linha === 'R.3' ? 'PECA' : 'SERVICO', cliente: 'CLIENTE EXEMPLO ' + (i + 1), cliente_cod: String(40 + i), num_os: String(2000 + i), valor: v, estimada: i === 1 && linha === 'R.2', parcelas: '1/1',
      descricao: linha === 'R.1' ? 'Contrato Elétrica Guarulhos (exemplo)' : (linha === 'R.2' ? 'Revisão geral (exemplo)' : ''), origem_classe: linha === 'R.1' ? 'descricao' : 'padrao', auto_contrato: linha === 'R.1' }
    : { id: 'T-' + (500 + i), emissao: mes + '-' + dreP2(5 + i * 3), fornecedor: 'FORNECEDOR EXEMPLO ' + (i + 1), descricao: 'Lançamento de exemplo', numero_nf: String(700 + i), natureza_codigo: linha, status: i % 2 ? 'PAGO' : 'ABERTO', valor: v });
  return { tipo: rec ? 'receita' : 'despesa', mes, linha, total: Math.round(alvo * 100) / 100, quantidade: n, cortado: false, itens };
}
