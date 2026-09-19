/**
 * Módulo: Resultado Semanal
 * Fechamento semanal da diretoria (somente admin): OSs finalizadas × valores/custos.
 * Carregado sob demanda por js/router.js na primeira vez em que a tela abre.
 */

/* RS-CALC-INICIO — funções puras (sem DOM). O harness de teste roda este bloco em Node. */
const RS_CALC = (() => {
  const normH = s => (s == null ? '' : String(s)).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  /** Aceita 1234.5, "1234.5", "1.234,50", "R$ 1.234,50". Lixo vira 0. */
  function toNum(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v).replace(/R\$/g, '').replace(/\s/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  const p2 = n => String(n).padStart(2, '0');
  const diaDe = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const deDia = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

  /** Qualquer data → "AAAA-MM-DD" no fuso local, ou ''. ISO nunca passa por new Date(): em
   *  Brasília "2026-09-01" em UTC vira 31/08 às 21h e a OS muda de semana. */
  function toDia(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : diaDe(v);
    if (typeof v === 'number') {
      if (v < 20000 || v > 80000) return '';
      const d = new Date(1899, 11, 30); d.setDate(d.getDate() + Math.floor(v));
      return diaDe(d);
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return m[3] + '-' + p2(+m[2]) + '-' + p2(+m[1]);
    if (/^\d+(\.\d+)?$/.test(s)) return toDia(parseFloat(s));
    return '';
  }

  const somarDias = (k, n) => { const d = deDia(k); d.setDate(d.getDate() + n); return diaDe(d); };
  const osKey = v => {
    const s = String(v == null ? '' : v).trim().replace(/\.0+$/, '');
    return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s.toUpperCase();
  };
  const ehSim = v => /^(s|sim|1|true)$/i.test(String(v == null ? '' : v).trim());

  /** Segunda a sábado dentro do intervalo — a semana de trabalho da oficina. */
  function diasUteis(de, ate) {
    if (!de || !ate || de > ate) return 0;
    let n = 0;
    for (let k = de, guarda = 0; k <= ate && guarda < 400; k = somarDias(k, 1), guarda++) {
      if (deDia(k).getDay() !== 0) n++;
    }
    return n;
  }

  function mapaColunas(rows) {
    const m = {};
    rows.slice(0, 30).forEach(r => Object.keys(r).forEach(k => { const n = normH(k); if (n && !(n in m)) m[n] = k; }));
    return m;
  }
  function tipoDaAba(m) {
    if ('numeroos' in m && 'codigoproduto' in m && 'precocusto' in m) return 'detalhe';
    if ('numeroos' in m && 'valorservicos' in m && 'valorpecas' in m) return 'oss';
    return null;
  }

  /**
   * abas: [{nome, rows}] — cada aba de cada arquivo, já em objetos por cabeçalho.
   * Reconhece a aba pelo cabeçalho, não pelo nome, então a planilha da reunião
   * (com TabDin, Finalizadas etc.) serve inteira.
   */
  function lerPlanilhas(abas) {
    const res = { itens: [], oss: {}, osDetalhe: {}, fontes: [], ignoradas: [], descontos: 0, divCodigos: {}, canceladas: 0 };
    const donoDetalhe = {}; // OS → aba que forneceu os itens (evita somar duas vezes a mesma OS)
    (abas || []).forEach((a, ia) => {
      const rows = a.rows || [];
      const m = mapaColunas(rows);
      const tipo = tipoDaAba(m);
      if (!tipo) { if (rows.length) res.ignoradas.push(a.nome); return; }
      const g = (r, campo) => (m[campo] === undefined ? null : r[m[campo]]);
      let usadas = 0;
      if (tipo === 'detalhe') {
        rows.forEach(r => {
          const os = osKey(g(r, 'numeroos'));
          if (!os) return;
          if (ehSim(g(r, 'cancelada'))) { res.canceladas++; return; }
          if (donoDetalhe[os] !== undefined && donoDetalhe[os] !== ia) return;
          donoDetalhe[os] = ia;
          usadas++;
          const cliente = String(g(r, 'razaocliente') || '').trim();
          if (!res.osDetalhe[os]) res.osDetalhe[os] = { cliente, encerramento: toDia(g(r, 'dataencerramentocancelamento')) };
          const cod = String(g(r, 'codigoproduto') == null ? '' : g(r, 'codigoproduto')).trim();
          if (cod) {
            const qtd = toNum(g(r, 'qtdproduto')) || 1;
            let receita = toNum(g(r, 'valortotal'));
            if (!receita) receita = toNum(g(r, 'valorpecas')) * qtd;
            const div = /DIV/i.test(cod);
            if (div) res.divCodigos[cod.toUpperCase()] = (res.divCodigos[cod.toUpperCase()] || 0) + 1;
            const descPec = toNum(g(r, 'valordescontototal'));
            res.descontos += descPec;
            res.itens.push({ os, cliente, tipo: div ? 'div' : 'est', codigo: cod,
              descricao: String(g(r, 'descricao') || '').trim(), qtd, receita, desconto: descPec,
              custo: toNum(g(r, 'precocusto')) * qtd, custoUnit: toNum(g(r, 'precocusto')) });
          }
          const servDesc = String(g(r, 'descricaosservico') || '').trim();
          const servTot = toNum(g(r, 'valortotalservico'));
          if (servDesc || servTot) {
            const qtdS = toNum(g(r, 'quantidadeservico')) || 1;
            const receita = servTot || toNum(g(r, 'valorunitarioservico')) * qtdS;
            const descServ = toNum(g(r, 'valordescontoitensservico'));
            res.descontos += descServ;
            res.itens.push({ os, cliente, tipo: 'serv', codigo: String(g(r, 'siglaservico') || '').trim(),
              descricao: servDesc, qtd: qtdS, receita, desconto: descServ, custo: 0, custoUnit: 0 });
          }
        });
      } else {
        rows.forEach(r => {
          const os = osKey(g(r, 'numeroos'));
          if (!os) return;
          if (ehSim(g(r, 'cancelada'))) { res.canceladas++; return; }
          usadas++;
          const serv = toNum(g(r, 'valorservicos')), pec = toNum(g(r, 'valorpecas'));
          res.oss[os] = { cliente: String(g(r, 'razaocliente') || '').trim(), serv, pec,
            total: toNum(g(r, 'valortotal')) || serv + pec, encerramento: toDia(g(r, 'dataencerramento')) };
        });
      }
      res.fontes.push({ nome: a.nome, tipo, linhas: usadas });
    });
    return res;
  }

  /** Linhas CSV da planilha do gerente → [{os, dia, cliente, valor}]. */
  function lerFinalizadas(rows) {
    const out = [];
    (rows || []).forEach(row => {
      const keys = Object.keys(row);
      const k = nome => keys.find(x => normH(x) === nome);
      const kData = k('data') || keys[0], kOs = k('os') || keys[1];
      const kStatus = k('status');
      const os = osKey(row[kOs]);
      const dia = toDia(row[kData]);
      if (!os || !dia) return;
      if (kStatus && /cancel/i.test(String(row[kStatus] || ''))) return;
      out.push({ os, dia, cliente: String(row[k('cliente')] || '').trim(), valor: toNum(row[k('valor')]) });
    });
    return out;
  }

  /**
   * Monta as OSs do período com os valores já separados em serviço, peça de
   * estoque, peça DIV e "sem abertura" (valor conhecido, mas sem detalhe).
   */
  function montarPeriodo(o) {
    const { de, ate } = o;
    const dados = o.dados || lerPlanilhas([]);
    const lista = [], avisos = [], vistos = {};
    if (o.fonte === 'encerramento') {
      const add = (os, dia) => {
        if (dia && dia >= de && dia <= ate && !vistos[os]) { vistos[os] = { rep: 0 }; lista.push({ os, dia, cliente: '', valor: 0 }); }
      };
      Object.keys(dados.oss).forEach(os => add(os, dados.oss[os].encerramento));
      Object.keys(dados.osDetalhe).forEach(os => add(os, dados.osDetalhe[os].encerramento));
    } else {
      const fin = o.finalizadas || [];
      const primeira = {};
      fin.forEach(f => { if (!primeira[f.os] || f.dia < primeira[f.os]) primeira[f.os] = f.dia; });
      fin.forEach(f => {
        if (f.dia < de || f.dia > ate) return;
        if (vistos[f.os]) { vistos[f.os].rep++; return; }
        if (primeira[f.os] < de) {
          vistos[f.os] = { rep: 0, fora: true };
          avisos.push({ tipo: 'anterior', os: f.os, dia: f.dia, primeira: primeira[f.os] });
          return;
        }
        vistos[f.os] = { rep: 0 };
        lista.push({ os: f.os, dia: f.dia, cliente: f.cliente, valor: f.valor });
      });
      Object.keys(vistos).forEach(os => {
        if (vistos[os].rep && !vistos[os].fora) avisos.push({ tipo: 'repetida', os, vezes: vistos[os].rep + 1 });
      });
    }

    // Agrupado uma vez por leitura: a série de 26 semanas chama montarPeriodo 26 vezes.
    if (!dados._porOS) {
      const g = {};
      dados.itens.forEach(it => { (g[it.os] = g[it.os] || []).push(it); });
      Object.defineProperty(dados, '_porOS', { value: g, enumerable: false });
    }
    const itensPorOS = dados._porOS;

    const oss = lista.map(l => {
      const its = itensPorOS[l.os] || [];
      const cab = dados.oss[l.os];
      const r = { os: l.os, dia: l.dia, cliente: '', serv: 0, pecEst: 0, pecDiv: 0, custoEst: 0, custoDiv: 0,
        semDetalhe: 0, desconto: 0, total: 0, situacao: 'ok', itens: its, totalCabecalho: null };
      if (its.length) {
        its.forEach(it => {
          r.desconto += it.desconto || 0;
          if (it.tipo === 'serv') r.serv += it.receita;
          else if (it.tipo === 'div') { r.pecDiv += it.receita; r.custoDiv += it.custo; }
          else { r.pecEst += it.receita; r.custoEst += it.custo; }
        });
        r.cliente = (dados.osDetalhe[l.os] || {}).cliente || '';
        if (cab && Math.abs(cab.total - (r.serv + r.pecEst + r.pecDiv)) > 1) { r.situacao = 'diverge'; r.totalCabecalho = cab.total; }
      } else if (dados.osDetalhe[l.os]) {
        r.cliente = dados.osDetalhe[l.os].cliente; // OS existe no detalhe, mas sem itens com valor
        if (cab) { r.serv = cab.serv; r.semDetalhe = cab.pec; }
        r.situacao = r.semDetalhe > 0 ? 'sem-detalhe' : 'ok';
      } else if (cab) {
        r.serv = cab.serv; r.semDetalhe = cab.pec; r.cliente = cab.cliente;
        r.situacao = cab.pec > 0 ? 'sem-detalhe' : 'ok';
      } else {
        r.semDetalhe = l.valor || 0;
        r.situacao = 'sem-dados';
      }
      if (!r.cliente) r.cliente = l.cliente || '(sem cliente)';
      r.total = r.serv + r.pecEst + r.pecDiv + r.semDetalhe;
      return r;
    });
    oss.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : +a.os - +b.os));
    return { de, ate, oss, avisos };
  }

  /** Folha → custo do período. Mesma sequência da planilha: (folha + HE) ÷ dias do mês × encargos × dias. */
  function custoMaoDeObra(P, dias) {
    if (!(P.folha > 0) || !(P.diasMes > 0)) return null;
    const comHE = P.folha * (1 + P.he / 100);
    const dia = comHE / P.diasMes;
    const diaEnc = dia * (1 + P.encargos / 100);
    return { folha: P.folha, comHE, dia, diaEnc, dias, total: diaEnc * dias };
  }

  function calcular(per, P, custoMO) {
    const t = { serv: 0, pecEst: 0, pecDiv: 0, custoEst: 0, custoDiv: 0, semDetalhe: 0 };
    per.oss.forEach(o => { Object.keys(t).forEach(k => { t[k] += o[k]; }); });
    const fs = 1 + P.reajServ / 100, fp = 1 + P.reajPec / 100;
    const despBase = (P.simples + P.adm + P.fin) / 100;

    const bloco = (id, nome, receita, custo, comissao, meta) => {
      const imp = receita * P.simples / 100, adm = receita * P.adm / 100, fin = receita * P.fin / 100, com = receita * comissao / 100;
      const b = { id, nome, receita, custo, imp, adm, fin, com, meta: meta / 100, semCusto: custo == null };
      if (b.semCusto) { b.lucro = b.margem = b.precoMin = b.folga = null; return b; }
      b.lucro = receita - custo - imp - adm - fin - com;
      b.margem = receita > 0 ? b.lucro / receita : null;
      const divisor = 1 - despBase - comissao / 100 - meta / 100;
      b.precoMin = divisor > 0 ? custo / divisor : null;
      b.folga = b.precoMin == null ? null : receita - b.precoMin;
      return b;
    };
    const somar = (id, nome, partes) => {
      const b = { id, nome, semCusto: partes.some(p => p.semCusto) };
      ['receita', 'imp', 'adm', 'fin', 'com'].forEach(k => { b[k] = partes.reduce((s, p) => s + p[k], 0); });
      b.meta = b.receita > 0 ? partes.reduce((s, p) => s + p.meta * p.receita, 0) / b.receita : null;
      if (b.semCusto) { b.custo = b.lucro = b.margem = b.precoMin = b.folga = null; return b; }
      b.custo = partes.reduce((s, p) => s + p.custo, 0);
      b.lucro = partes.reduce((s, p) => s + p.lucro, 0);
      b.margem = b.receita > 0 ? b.lucro / b.receita : null;
      b.precoMin = partes.every(p => p.precoMin != null) ? partes.reduce((s, p) => s + p.precoMin, 0) : null;
      b.folga = b.precoMin == null ? null : b.receita - b.precoMin;
      return b;
    };

    const rDiv = t.pecDiv * fp;
    const serv = bloco('serv', 'Serviços', t.serv * fs, custoMO == null ? null : custoMO, P.comissao, P.metaServ);
    const est = bloco('est', 'Peças de estoque', t.pecEst * fp, t.custoEst, P.comissao, P.metaPec);
    const div = bloco('div', 'Peças DIV', rDiv, t.custoDiv + rDiv * P.custoDivPct / 100, P.comissao, P.metaPec);
    const pecas = somar('pecas', 'Peças (todas)', [est, div]);
    const globalEst = somar('globalEst', 'Global sem DIV', [serv, est]);
    const globalTodas = somar('globalTodas', 'Global com DIV', [serv, est, div]);

    const despPec = despBase + P.comissao / 100;
    const abaixo = [];
    per.oss.forEach(o => o.itens.forEach(it => {
      if (it.tipo !== 'est') return;
      const receita = it.receita * fp;
      const sobra = receita * (1 - despPec) - it.custo;
      if (sobra < -0.005) abaixo.push({ os: o.os, cliente: o.cliente, codigo: it.codigo, descricao: it.descricao, qtd: it.qtd,
        receita, custo: it.custo, sobra, margem: receita > 0 ? sobra / receita : null });
    }));
    abaixo.sort((a, b) => a.sobra - b.sobra);

    return { t, serv, est, div, pecas, globalEst, globalTodas, abaixo };
  }

  /** Números do placar — sempre com os parâmetros BASE, nunca com o cenário. */
  function indicadores(per, r) {
    const fat = per.oss.reduce((s, o) => s + o.total, 0);
    const n = per.oss.length;
    const pecTot = r.t.pecEst + r.t.pecDiv;
    return {
      fat, n, ticket: n ? fat / n : null,
      mServ: r.serv.margem, mEst: r.est.margem, mGlobal: r.globalEst.margem,
      divPct: pecTot > 0 ? r.t.pecDiv / pecTot : null
    };
  }

  /** Segunda-feira da semana de uma data "AAAA-MM-DD". */
  const segundaDe = k => somarDias(k, -((deDia(k).getDay() + 6) % 7));

  /** Semanas (segunda a domingo) que têm OS finalizada, da mais recente para a mais antiga. */
  function semanasDisponiveis(o) {
    const contagem = {};
    const conta = (os, dia) => { if (!dia) return; const s = segundaDe(dia); (contagem[s] = contagem[s] || new Set()).add(os); };
    if (o.fonte === 'encerramento') {
      const d = o.dados || { oss: {}, osDetalhe: {} };
      Object.keys(d.oss).forEach(os => conta(os, d.oss[os].encerramento));
      Object.keys(d.osDetalhe).forEach(os => conta(os, d.osDetalhe[os].encerramento));
    } else (o.finalizadas || []).forEach(f => conta(f.os, f.dia));
    return Object.keys(contagem).sort().reverse().slice(0, 104)
      .map(de => ({ de, ate: somarDias(de, 6), oss: contagem[de].size }));
  }

  /**
   * Indicadores de N semanas terminando na semana de `ateSemana`, sempre com os
   * MESMOS parâmetros (os da base) para as semanas serem comparáveis entre si.
   * `cobertura` = parte do faturamento com peças e serviços abertos no detalhe.
   */
  function serieSemanal(o) {
    const out = [];
    let de = somarDias(segundaDe(o.ateSemana), -7 * (o.n - 1));
    for (let i = 0; i < o.n; i++, de = somarDias(de, 7)) {
      const ate = somarDias(de, 6);
      const per = montarPeriodo({ fonte: o.fonte, finalizadas: o.finalizadas, dados: o.dados, de, ate });
      const mo = custoMaoDeObra(o.P, diasUteis(de, ate));
      const r = calcular(per, o.P, mo && mo.total);
      const ind = indicadores(per, r);
      const semAbrir = r.t.semDetalhe;
      out.push(Object.assign({ de, ate, serv: r.t.serv, pecEst: r.t.pecEst, pecDiv: r.t.pecDiv, semAbrir,
        lucroGlobal: r.globalEst.lucro, metaGlobal: r.globalEst.meta,
        cobertura: ind.fat > 0 ? (ind.fat - semAbrir) / ind.fat : null }, ind));
    }
    return out;
  }

  return { toNum, toDia, diasUteis, somarDias, segundaDe, lerPlanilhas, lerFinalizadas, montarPeriodo, custoMaoDeObra, calcular, indicadores, semanasDisponiveis, serieSemanal, normH };
})();
/* RS-CALC-FIM */

// ═══════════════════════════════════════════════════════════════════════════
// Resultado Semanal — tela
// ═══════════════════════════════════════════════════════════════════════════
const RS_PADRAO = { simples: 12, adm: 5, fin: 5, comissao: 0, metaServ: 25, metaPec: 25,
  folha: null, he: 10, encargos: 52, diasMes: 24, reajServ: 0, reajPec: 0, custoDivPct: 0 };
const RS_METAS_PADRAO = { fat: 75000, divPct: null };

// Cada campo do painel. `cen:false` = só existe na base (metas do placar).
const RS_CAMPOS = [
  { g: 'Despesas sobre a venda (% da receita)' },
  { k: 'simples', l: 'Simples Nacional', u: '%', step: 0.1 },
  { k: 'adm', l: 'Custo administrativo', u: '%', step: 0.1 },
  { k: 'fin', l: 'Custo financeiro', u: '%', step: 0.1 },
  { k: 'comissao', l: 'Comissão de vendas', s: 'sobre a receita, peças e serviços', u: '%', step: 0.1 },
  { g: 'Metas de rentabilidade' },
  { k: 'metaServ', l: 'Meta — serviços', u: '%', step: 0.5 },
  { k: 'metaPec', l: 'Meta — peças', u: '%', step: 0.5 },
  { g: 'Mão de obra produtiva' },
  { k: 'folha', l: 'Folha mensal dos produtivos', s: 'só colaboradores produtivos', u: 'R$', step: 500, obrig: true },
  { k: 'he', l: 'Hora extra estimada', u: '%', step: 1 },
  { k: 'encargos', l: 'Encargos', u: '%', step: 1 },
  { k: 'diasMes', l: 'Dias de trabalho no mês', u: 'dias', step: 1 },
  { g: 'E se… (simulação)' },
  { k: 'reajServ', l: 'Reajuste no preço dos serviços', s: 'negativo = desconto', u: '%', step: 1 },
  { k: 'reajPec', l: 'Reajuste no preço das peças', s: 'negativo = desconto', u: '%', step: 1 },
  { k: 'custoDivPct', l: 'Custo estimado das peças DIV', s: '% do preço de venda', u: '%', step: 5 },
  { g: 'Metas do placar (opcionais)' },
  { k: 'fat', l: 'Faturamento da semana', u: 'R$', step: 1000, meta: true },
  { k: 'divPct', l: 'Peças DIV — máximo', s: '% do total de peças', u: '%', step: 1, meta: true }
];

const RS = {
  // URL /exec do apps-script/resultado-semanal.gs (guia: integracao/LEIA-ME-resultado-semanal.md).
  // Enquanto não for colada, o módulo funciona só com o arquivo arrastado e guarda tudo no navegador.
  API: CONFIG.RESULTADO_SEMANAL_API,
  iniciado: false, arquivos: {}, dados: null, finalizadas: null, finErro: null, carregandoFin: false,
  banco: null, bancoErro: null, carregandoBanco: false, fechamentos: [],
  fonte: 'planilha', de: '', ate: '', diasManual: null, base: null, cen: null, metas: null,
  grafico: null, graficosEvo: {}, ultimo: null };

const rs$ = id => document.getElementById(id);
const rsEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rsR = (v, dec = 2) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: dec, maximumFractionDigits: dec });
const rsP = (v, dec = 1) => (v == null || !isFinite(v)) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
const rsPP = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' p.p.';
const rsN = (v, dec = 0) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const rsDia = k => { if (!k) return '—'; const [y, m, d] = k.split('-'); return d + '/' + m + '/' + y; };
const rsDiaCurto = k => { if (!k) return '—'; const [y, m, d] = k.split('-'); return d + '/' + m + '/' + y; };
/** Só para o eixo X dos gráficos: com 26 semanas, o ano não cabe. */
const rsDiaEixo = k => { if (!k) return '—'; const [, m, d] = k.split('-'); return d + '/' + m; };

function rsLer(chave, padrao) {
  try { const v = JSON.parse(localStorage.getItem(chave) || 'null'); return rsMigrar(Object.assign({}, padrao, v || {})); }
  catch (e) { return Object.assign({}, padrao); }
}

/** A comissão era separada em serviços e peças. Vale a maior das duas — assumir
 *  a menor esconderia despesa e inflaria a margem. */
function rsMigrar(P) {
  if (P && P.comissao == null && (P.comissaoServ != null || P.comissaoPec != null)) {
    P.comissao = Math.max(Number(P.comissaoServ) || 0, Number(P.comissaoPec) || 0);
  }
  delete P.comissaoServ; delete P.comissaoPec;
  return P;
}
function rsGravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* navegador sem storage: segue sem lembrar */ } }

function initResultado() {
  if (!rvPodeEditar()) { goHome(); return; }
  if (!RS.iniciado) {
    RS.iniciado = true;
    RS.base = rsLer('rs_params_base', RS_PADRAO);
    RS.cen = rsLer('rs_params_cenario', RS.base);
    RS.metas = rsLer('rs_metas', RS_METAS_PADRAO);
    RS.fechamentos = rsFechamentosLocais();
    rsPeriodoPreset('anterior', false);
    rsMontarCampos();
    rsLigarArrastar();
    // Sem folha não há rentabilidade de serviço: abre o painel já no campo (depois de ver se o servidor tem a base).
    rsCarregarRemoto().then(() => { if (!(RS.base.folha > 0)) rsAlternarParametros(true); });
  }
  rsRenderFontes();
  if (!RS.finalizadas) rsRecarregarFinalizadas(); else rsRecalcular();
}

// ── Período ──
function rsPeriodoPreset(qual, recalcular = true) {
  const hoje = new Date();
  const k = RS_CALC.toDia(hoje);
  const dow = (hoje.getDay() + 6) % 7; // 0 = segunda
  let seg = RS_CALC.somarDias(k, -dow);
  if (qual === 'anterior') seg = RS_CALC.somarDias(seg, -7);
  rsDefinirPeriodo(seg, RS_CALC.somarDias(seg, 6), recalcular);
}
function rsDeslocar(n) { rsDefinirPeriodo(RS_CALC.somarDias(RS.de, n), RS_CALC.somarDias(RS.ate, n)); }
function rsMudarPeriodo() {
  let de = rs$('rs-de').value, ate = rs$('rs-ate').value;
  if (!de || !ate) return;
  if (de > ate) { const x = de; de = ate; ate = x; }
  rsDefinirPeriodo(de, ate);
}
function rsDefinirPeriodo(de, ate, recalcular = true) {
  RS.de = de; RS.ate = ate; RS.diasManual = null;
  rs$('rs-de').value = de; rs$('rs-ate').value = ate;
  rs$('rs-titulo-periodo').textContent = rsDia(de) + ' a ' + rsDia(ate);
  if (recalcular) rsRecalcular();
}

// ── Fontes ──
function rsMudarFonte(v) { RS.fonte = v; rsRecalcular(); }

async function rsRecarregarFinalizadas() {
  RS.carregandoFin = true; RS.finErro = null; rsRenderFontes();
  try {
    const res = await fetch(csvURLExt(CONFIG.SHEET_FINALIZADAS_ID, CONFIG.SHEET_FINALIZADAS_ABA));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const texto = await res.text();
    const rows = Papa.parse(texto, { header: true, skipEmptyLines: true }).data;
    RS.finalizadas = RS_CALC.lerFinalizadas(rows);
  } catch (e) {
    RS.finErro = e.message || String(e);
  } finally {
    RS.carregandoFin = false;
  }
  rsRecalcular();
}

function rsLigarArrastar() {
  const z = rs$('rs-drop');
  ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add('arrastando'); }));
  ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove('arrastando'); }));
  z.addEventListener('drop', e => rsReceberArquivos(e.dataTransfer.files));
}

function rsLerTexto(buf) {
  const utf = new TextDecoder('utf-8').decode(buf);
  return utf.indexOf('�') >= 0 ? new TextDecoder('windows-1252').decode(buf) : utf;
}

async function rsReceberArquivos(lista) {
  const arquivos = Array.from(lista || []);
  if (!arquivos.length) return;
  const erros = [];
  for (const f of arquivos) {
    try {
      const buf = await f.arrayBuffer();
      let abas;
      if (/\.csv$/i.test(f.name)) {
        const rows = Papa.parse(rsLerTexto(buf), { header: true, skipEmptyLines: true, dynamicTyping: false }).data;
        abas = [{ nome: f.name, rows }];
      } else {
        const wb = XLSX.read(buf, { type: 'array' });
        abas = wb.SheetNames.map(n => ({ nome: f.name + ' › ' + n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null, raw: true }) }));
      }
      RS.arquivos[f.name] = abas; // mesmo nome de novo = substitui, não duplica
    } catch (e) {
      erros.push(f.name + ': ' + (e.message || e));
    }
  }
  rsReprocessarArquivos();
  if (erros.length) alert('Não consegui ler:\n\n' + erros.join('\n'));
}
function rsRemoverArquivo(nome) { delete RS.arquivos[nome]; rsReprocessarArquivos(); }
function rsReprocessarArquivos() {
  // Arquivo primeiro: quem arrasta um arquivo quer que ele valha nas OSs que traz.
  const abas = Object.values(RS.arquivos).flat().concat(RS.banco ? [RS.banco.aba] : []);
  RS.dados = abas.length ? RS_CALC.lerPlanilhas(abas) : null;
  rsRecalcular();
}

function rsRenderFontes() {
  const bc = rs$('rs-fonte-banco');
  if (bc) {
    if (!rsApiLigada()) bc.innerHTML = 'Ainda não conectado — falta publicar o <code>apps-script/resultado-semanal.gs</code> (guia em <code>integracao/LEIA-ME-resultado-semanal.md</code>). Enquanto isso, use o arquivo ao lado.';
    else if (RS.carregandoBanco) bc.textContent = 'Buscando as linhas da vw_os_produto_serviço…';
    else if (RS.bancoErro) bc.innerHTML = '<span style="color:var(--rs-ruim);font-weight:700;">Não consegui buscar: ' + rsEsc(RS.bancoErro) + '</span>';
    else if (RS.banco) {
      const horas = RS.banco.gerado_em ? (Date.now() - new Date(RS.banco.gerado_em).getTime()) / 36e5 : null;
      bc.innerHTML = rsN(RS.banco.linhas) + ' linhas · extraídas em ' + rsDataHora(RS.banco.gerado_em)
        + (RS.banco.janela && RS.banco.janela.desde ? ' · OSs geradas desde ' + rsDia(RS.banco.janela.desde) : '')
        + (horas != null && horas > 30 ? '<br><span style="color:var(--rs-alerta);font-weight:700;">Extração com mais de um dia — confira o cron da VPS.</span>' : '');
    }
  }
  const el = rs$('rs-fonte-fin');
  if (el) {
    if (RS.carregandoFin) el.textContent = 'Carregando a planilha do gerente…';
    else if (RS.finErro) el.innerHTML = '<span style="color:var(--rs-ruim);font-weight:700;">Não consegui ler a planilha (' + rsEsc(RS.finErro) + ').</span> Tente recarregar ou use a data de encerramento do arquivo.';
    else if (RS.finalizadas) {
      const noPer = RS.ultimo && RS.fonte === 'planilha' ? RS.ultimo.per.oss.length : null;
      el.textContent = RS.finalizadas.length + ' lançamentos na planilha' + (noPer != null ? ' · ' + noPer + ' OSs no período' : '') + '.';
    }
  }
  const arq = rs$('rs-arquivos');
  if (arq) {
    const nomes = Object.keys(RS.arquivos);
    const f = RS.dados ? RS.dados.fontes : [];
    arq.innerHTML = nomes.map(n => {
      const usadas = f.filter(x => x.nome === n || x.nome.indexOf(n + ' › ') === 0);
      const desc = usadas.length ? usadas.map(x => (x.tipo === 'detalhe' ? 'detalhe' : 'OSs') + ' · ' + rsN(x.linhas) + ' linhas').join(' | ') : '<span style="color:var(--rs-ruim);">nenhuma aba reconhecida</span>';
      return '<div class="rs-arq"><i class="fa-solid fa-file-excel" style="color:#16a34a;"></i><b style="font-size:.74rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + rsEsc(n) + '</b><span class="rs-nota">' + desc + '</span>'
        + '<span class="rs-spacer"></span><button type="button" title="Remover" aria-label="Remover ' + rsEsc(n) + '" onclick="event.preventDefault();event.stopPropagation();rsRemoverArquivo(\'' + rsEsc(n).replace(/'/g, "\\'") + '\')"><i class="fa-solid fa-xmark"></i></button></div>';
    }).join('');
  }
}

// ── Cálculo e desenho ──
function rsRecalcular() {
  rsAtualizarSemanas();
  const vazio = rs$('rs-vazio'), cont = rs$('rs-conteudo');
  const mostrarVazio = (icone, titulo, texto) => {
    RS.ultimo = null;
    vazio.hidden = false; cont.hidden = true;
    vazio.innerHTML = '<i class="fa-solid ' + icone + '"></i><b>' + titulo + '</b>' + (texto || '');
    rs$('rs-avisos').innerHTML = '';
    rsRenderFontes();
  };
  if (RS.fonte === 'planilha') {
    if (RS.carregandoFin || (!RS.finalizadas && !RS.finErro)) return mostrarVazio('fa-hourglass-half', 'Carregando as OSs finalizadas…');
    if (!RS.finalizadas) return mostrarVazio('fa-triangle-exclamation', 'A planilha de OSs finalizadas não respondeu.', 'Clique em Recarregar ou troque o critério para "Data de encerramento no arquivo".');
  } else if (!RS.dados) {
    return mostrarVazio('fa-file-arrow-up', 'Carregue o relatório de OSs detalhe.', 'Com este critério a lista de OSs sai da data de encerramento do próprio arquivo.');
  }
  const per = RS_CALC.montarPeriodo({ fonte: RS.fonte, finalizadas: RS.finalizadas, dados: RS.dados, de: RS.de, ate: RS.ate });
  if (!per.oss.length) {
    return mostrarVazio('fa-calendar-xmark', 'Nenhuma OS finalizada entre ' + rsDia(RS.de) + ' e ' + rsDia(RS.ate) + '.',
      RS.fonte === 'planilha' ? 'Confira se o gerente operacional já lançou a semana na planilha.' : 'Nenhuma OS do arquivo foi encerrada nesse intervalo.');
  }
  vazio.hidden = true; cont.hidden = false;
  RS.ultimo = { per };
  rsRender();
  rsRenderFontes();
}

function rsRender() {
  if (!RS.ultimo) return;
  const per = RS.ultimo.per;
  const dias = RS.diasManual != null ? RS.diasManual : RS_CALC.diasUteis(RS.de, RS.ate);
  const moBase = RS_CALC.custoMaoDeObra(RS.base, dias);
  const moCen = RS_CALC.custoMaoDeObra(RS.cen, dias);
  const rb = RS_CALC.calcular(per, RS.base, moBase && moBase.total);
  const rc = RS_CALC.calcular(per, RS.cen, moCen && moCen.total);
  const ind = RS_CALC.indicadores(per, rb);
  Object.assign(RS.ultimo, { dias, moBase, moCen, rb, rc, ind });

  const difs = rsDiferencas();
  rs$('screen-resultado').classList.toggle('rs-cenario', difs.length > 0);

  rsRenderAvisos(per, rb);
  rsRenderPlacar(per, rb, ind);
  rsRenderClientes(per);
  rsRenderRentabilidade(per, rb, rc, difs);
  rsRenderMaoDeObra(moCen, dias);
  rsRenderPecas(per, rc);
  rsRenderABC(per);
  rsRenderOSs(per);
  rsRenderEvolucao();
}

/** Curva ABC por código de item, separada em peças (estoque + DIV) e serviços. */
function rsClassificarABC(itens) {
  const porCodigo = {};
  itens.forEach(it => {
    const k = it.codigo || it.descricao || '(sem código)';
    const g = porCodigo[k] || (porCodigo[k] = { codigo: k, descricao: it.descricao, qtd: 0, receita: 0 });
    g.qtd += it.qtd || 0; g.receita += it.receita || 0;
  });
  const ranked = Object.values(porCodigo).sort((a, b) => b.receita - a.receita);
  const total = ranked.reduce((s, x) => s + x.receita, 0);
  let acc = 0;
  return { total, linhas: ranked.map(x => { acc += x.receita; const ap = total > 0 ? acc / total * 100 : 0; return Object.assign(x, { pct: total > 0 ? x.receita / total * 100 : 0, acc: ap, cls: ap <= 80 ? 'A' : ap <= 95 ? 'B' : 'C' }); }) };
}

function rsRenderABCTabela(destino, resumo, itens) {
  const { total, linhas } = rsClassificarABC(itens);
  rs$(resumo).textContent = linhas.length ? linhas.length + ' itens · ' + rsR(total) : '';
  if (!linhas.length) { rs$(destino).innerHTML = '<p class="rs-nota" style="padding:12px;">Nenhum item no período.</p>'; return; }
  const badge = { A: 'bom', B: 'alerta', C: '' };
  rs$(destino).innerHTML = '<table class="rs-t"><thead><tr><th>Código</th><th>Descrição</th><th class="n">Qtd</th><th class="n">Receita</th><th class="n">%</th><th class="n">Acum.</th><th>Classe</th></tr></thead><tbody>'
    + linhas.slice(0, 60).map(x => '<tr><td>' + rsEsc(x.codigo) + '</td><td title="' + rsEsc(x.descricao) + '">' + rsEsc(x.descricao || '—') + '</td><td class="n">' + rsN(x.qtd, x.qtd % 1 ? 2 : 0) + '</td><td class="n">' + rsR(x.receita) + '</td><td class="n">' + rsN(x.pct, 1) + '%</td><td class="n">' + rsN(x.acc, 1) + '%</td>'
      + '<td><span class="rs-chip ' + (badge[x.cls] || '') + '">' + x.cls + '</span></td></tr>').join('')
    + (linhas.length > 60 ? '<tr class="sub"><td colspan="7">… e mais ' + (linhas.length - 60) + ' itens (todos no Excel).</td></tr>' : '') + '</tbody></table>';
}

function rsRenderABC(per) {
  const pecas = [], servicos = [];
  per.oss.forEach(o => o.itens.forEach(it => { (it.tipo === 'serv' ? servicos : pecas).push(it); }));
  rsRenderABCTabela('rs-tabela-abc-pec', 'rs-abc-pec-resumo', pecas);
  rsRenderABCTabela('rs-tabela-abc-serv', 'rs-abc-serv-resumo', servicos);
}

function rsDiferencas() {
  return RS_CAMPOS.filter(c => c.k && !c.meta && RS.cen[c.k] !== RS.base[c.k]).map(c => c.k);
}

function rsRenderAvisos(per, rb) {
  const av = [];
  const semDet = per.oss.filter(o => o.situacao === 'sem-detalhe');
  const semDados = per.oss.filter(o => o.situacao === 'sem-dados');
  const diverge = per.oss.filter(o => o.situacao === 'diverge');
  const lista = arr => arr.map(o => o.os).join(', ');
  if (!RS.dados) {
    av.push(['info', 'fa-circle-info', 'A planilha do gerente diz <b>quais OSs</b> fecharam na semana, mas ainda falta o <b>conteúdo</b> de cada uma — peças e serviços vêm da <b>vw_os_produto_serviço</b>. Publique o <code>apps-script/resultado-semanal.gs</code> e cole o /exec em <code>CONFIG.RESULTADO_SEMANAL_API</code> (guia em <code>integracao/LEIA-ME-resultado-semanal.md</code>). Enquanto isso, dá para arrastar o relatório "OSs detalhe" à mão.']);
  } else if (semDados.length) {
    av.push(['', 'fa-triangle-exclamation', '<b>' + semDados.length + ' OS(s) finalizada(s) sem itens no detalhe</b> (banco ou arquivo) — ' + rsR(semDados.reduce((s, o) => s + o.semDetalhe, 0)) + ', valor da planilha do gerente, fica fora da rentabilidade: ' + lista(semDados) + '. Amplie a janela do extrator (--desde) ou use um arquivo com intervalo de datas maior.']);
  }
  if (semDet.length) {
    av.push(['', 'fa-triangle-exclamation', '<b>' + semDet.length + ' OS(s) sem linhas no detalhe</b>: o serviço entra pelo relatório de OSs, mas ' + rsR(semDet.reduce((s, o) => s + o.semDetalhe, 0)) + ' de peças ficam sem custo e fora da rentabilidade de peças: ' + lista(semDet) + '.']);
  }
  if (diverge.length) {
    av.push(['', 'fa-scale-unbalanced', '<b>Valores diferentes entre detalhe e relatório de OSs</b> em ' + diverge.length + ' OS(s): ' + diverge.map(o => o.os + ' (' + rsR(o.serv + o.pecEst + o.pecDiv) + ' × ' + rsR(o.totalCabecalho) + ')').join(', ') + '. A análise usa o detalhe.']);
  }
  const rep = per.avisos.filter(a => a.tipo === 'repetida');
  if (rep.length) av.push(['info', 'fa-clone', rep.length + ' OS(s) aparecem mais de uma vez na planilha no período e foram contadas uma vez só: ' + rep.map(a => a.os + ' (' + a.vezes + '×)').join(', ') + '.']);
  const ant = per.avisos.filter(a => a.tipo === 'anterior');
  if (ant.length) av.push(['', 'fa-calendar-minus', ant.length + ' OS(s) relançadas nesta semana já tinham sido finalizadas antes e <b>não foram contadas de novo</b>: ' + ant.map(a => a.os + ' (1ª vez em ' + rsDiaCurto(a.primeira) + ')').join(', ') + '.']);
  if (RS.dados && RS.dados.descontos > 0.005) av.push(['', 'fa-percent', 'O arquivo tem ' + rsR(RS.dados.descontos) + ' em descontos nos itens. Confira se o valor dos itens já vem líquido do desconto.']);
  if (RS.dados && RS.dados.ignoradas.length) av.push(['info', 'fa-eye-slash', 'Abas ignoradas (cabeçalho não reconhecido): ' + RS.dados.ignoradas.map(rsEsc).join(', ') + '.']);
  if (rb.serv.semCusto) av.push(['', 'fa-helmet-safety', 'Informe a <b>folha mensal dos produtivos</b> no painel de parâmetros para calcular a rentabilidade dos serviços e a global.']);
  rs$('rs-avisos').innerHTML = av.map(a => '<div class="rs-aviso ' + a[0] + '"><i class="fa-solid ' + a[1] + '" style="margin-top:3px;"></i><div>' + a[2] + '</div></div>').join('');
}

// ── Placar (método da skill Placar: poucos números, meta, status, tendência) ──
function rsStatusMargem(v, meta) {
  if (v == null || meta == null) return null;
  if (v >= meta) return 'bom';
  if (v >= meta - 0.03 && v >= 0) return 'alerta';
  return 'ruim';
}
function rsStatusValor(v, meta, menorMelhor) {
  if (v == null || meta == null || !(meta > 0 || menorMelhor)) return null;
  if (menorMelhor) return v <= meta ? 'bom' : v <= meta * 1.15 ? 'alerta' : 'ruim';
  return v >= meta ? 'bom' : v >= meta * 0.9 ? 'alerta' : 'ruim';
}
const RS_STATUS = { bom: ['fa-circle-check', 'Na meta'], alerta: ['fa-circle-exclamation', 'Perto da meta'], ruim: ['fa-circle-xmark', 'Fora da meta'] };

function rsFechamentosLocais() {
  try { return JSON.parse(localStorage.getItem('rs_historico') || '[]'); } catch (e) { return []; }
}
const rsFechamentoDoPeriodo = () => (RS.fechamentos || []).find(f => f.de === RS.de && f.ate === RS.ate) || null;
function rsFechamentoAnterior() {
  return (RS.fechamentos || []).filter(x => x.ate < RS.de).sort((a, b) => (a.ate < b.ate ? 1 : -1))[0] || null;
}

function rsIndicadoresPlacar(ind) {
  const b = RS.base, m = RS.metas;
  return [
    { id: 'fat', l: 'Faturamento finalizado', v: ind.fat, f: v => rsR(v, 0), meta: m.fat, fm: v => rsR(v, 0), st: rsStatusValor(ind.fat, m.fat), dif: 'pct' },
    { id: 'n', l: 'OSs finalizadas', v: ind.n, f: v => rsN(v), sub: 'Ticket médio ' + rsR(ind.ticket, 0), dif: 'num' },
    { id: 'mServ', l: 'Margem — serviços', v: ind.mServ, f: v => rsP(v), meta: b.metaServ / 100, fm: v => rsP(v), st: rsStatusMargem(ind.mServ, b.metaServ / 100), dif: 'pp' },
    { id: 'mEst', l: 'Margem — peças de estoque', v: ind.mEst, f: v => rsP(v), meta: b.metaPec / 100, fm: v => rsP(v), st: rsStatusMargem(ind.mEst, b.metaPec / 100), dif: 'pp' },
    { id: 'mGlobal', l: 'Margem global (sem DIV)', v: ind.mGlobal, f: v => rsP(v), meta: RS.ultimo.rb.globalEst.meta, fm: v => rsP(v), st: rsStatusMargem(ind.mGlobal, RS.ultimo.rb.globalEst.meta), dif: 'pp' },
    { id: 'divPct', l: 'Peças DIV / total de peças', v: ind.divPct, f: v => rsP(v, 0), meta: m.divPct != null ? m.divPct / 100 : null, fm: v => 'máx. ' + rsP(v, 0), st: m.divPct != null ? rsStatusValor(ind.divPct, m.divPct / 100, true) : null, dif: 'pp', menor: true }
  ];
}

function rsRenderPlacar(per, rb, ind) {
  rsRenderBannerFechamento();
  const ant = rsFechamentoAnterior();
  const itens = rsIndicadoresPlacar(ind);
  rs$('rs-placar').innerHTML = itens.map(i => {
    let tend = '';
    if (ant && ant.ind && ant.ind[i.id] != null && i.v != null) {
      const d = i.v - ant.ind[i.id];
      const seta = Math.abs(d) < 1e-9 ? '→' : d > 0 ? '↑' : '↓';
      const txt = i.dif === 'pp' ? rsPP(d) : i.dif === 'pct' ? (ant.ind[i.id] ? (d >= 0 ? '+' : '−') + rsN(Math.abs(d / ant.ind[i.id]) * 100, 0) + '%' : '') : (d >= 0 ? '+' : '−') + rsN(Math.abs(d));
      tend = '<span class="rs-tend" title="Comparado ao fechamento de ' + rsDia(ant.de) + ' a ' + rsDia(ant.ate) + '">' + seta + ' ' + txt + ' vs ' + rsDiaCurto(ant.de) + '</span>';
    }
    const st = i.st ? '<span class="rs-chip ' + i.st + '"><i class="fa-solid ' + RS_STATUS[i.st][0] + '"></i>' + RS_STATUS[i.st][1] + '</span>' : '';
    const meta = i.meta != null ? 'Meta ' + i.fm(i.meta) : (i.sub || (i.id === 'n' ? '' : '<span title="Defina no painel de parâmetros">Sem meta definida</span>'));
    return '<div class="rs-kpi"><span class="rs-kpi-lbl">' + i.l + '</span><span class="rs-kpi-val">' + (i.v == null ? '—' : i.f(i.v)) + '</span>'
      + '<span class="rs-kpi-meta">' + meta + '</span><div class="rs-kpi-rodape">' + st + tend + '</div></div>';
  }).join('');
  rs$('rs-frases').innerHTML = rsFrases(per, rb, ind).map(f => '<li>' + f + '</li>').join('');
}

/** Três frases em linguagem de dono. Só afirma o que o número mostra — nada de causa inventada. */
function rsFrases(per, rb, ind) {
  const fr = [];
  const cli = rsAgruparClientes(per);
  const top = cli[0];
  fr.push('Foram <b>' + ind.n + ' OSs finalizadas</b>, somando <b>' + rsR(ind.fat, 0) + '</b>' + (top && ind.fat > 0 ? '; ' + rsEsc(rsNomeCurto(top.cliente)) + ' respondeu por ' + rsP(top.total / ind.fat, 0) + ' do valor.' : '.'));
  const blocos = [rb.serv, rb.est].filter(b => b.margem != null && b.receita > 0);
  if (blocos.length) {
    fr.push(blocos.map(b => {
      const ok = b.margem >= b.meta;
      return b.nome + ' fecharam com margem de <b>' + rsP(b.margem) + '</b> (meta ' + rsP(b.meta) + ')' +
        (b.folga != null ? (ok ? ', ' + rsR(b.folga, 0) + ' acima do preço mínimo' : ', <b>faltaram ' + rsR(-b.folga, 0) + '</b> de faturamento para bater a meta') : '');
    }).join('; ') + '.');
  } else if (rb.serv.semCusto && RS.dados) {
    fr.push('A rentabilidade dos serviços aguarda a folha dos produtivos no painel de parâmetros.');
  }
  if (rb.t.pecDiv > 0 && rb.globalEst.margem != null && rb.globalTodas.margem != null) {
    fr.push('Peças DIV somaram <b>' + rsR(rb.t.pecDiv, 0) + '</b> (' + rsP(ind.divPct, 0) + ' das peças) praticamente sem custo registrado: com elas a margem global vai de ' + rsP(rb.globalEst.margem) + ' para <b>' + rsP(rb.globalTodas.margem) + '</b> — a diferença é lucro que depende de sucata e peça fora do inventário.');
  } else if (rb.abaixo.length) {
    fr.push(rb.abaixo.length + ' itens de estoque foram vendidos abaixo do custo mais despesas, somando ' + rsR(-rb.abaixo.reduce((s, a) => s + a.sobra, 0), 0) + ' de prejuízo.');
  }
  return fr.slice(0, 3);
}

async function rsSalvarFechamento() {
  if (!RS.ultimo || !RS.ultimo.ind) return;
  const f = { de: RS.de, ate: RS.ate, ind: RS.ultimo.ind, base: Object.assign({}, RS.base) };
  const remoto = rsApiLigada() && RV.token;
  if (remoto) {
    try { const r = await rsPost('fechamento_salvar', { fechamento: f }); f.salvoEm = r.salvoEm; f.salvoPor = r.salvoPor; }
    catch (e) { alert('Não consegui salvar o fechamento no servidor: ' + e.message); return; }
  } else { f.salvoEm = new Date().toISOString(); f.salvoPor = RV.usuario || ''; }
  RS.fechamentos = (RS.fechamentos || []).filter(x => !(x.de === f.de && x.ate === f.ate)).concat([f]);
  if (!remoto) rsGravar('rs_historico', RS.fechamentos.slice(-104));
  rsAtualizarSemanas(); rsRender();
  alert('Fechamento de ' + rsDia(RS.de) + ' a ' + rsDia(RS.ate) + ' salvo ' + (remoto ? 'para todos os administradores.' : 'neste navegador.') + ' Na próxima semana o placar mostra a tendência contra ele.');
}

// ── Clientes ──
const rsNomeCurto = s => String(s || '').replace(/\b(LTDA|S\/A|S\.A\.|EIRELI|EPP|ME)\b\.?/gi, '').replace(/\s{2,}/g, ' ').trim();

function rsAgruparClientes(per) {
  // Agrupa pelo nome curto normalizado: a planilha do gerente escreve "CLIENTE - UNIDADE" e o Genesis "CLIENTE S/A - UNIDADE".
  const m = {};
  per.oss.forEach(o => {
    const chave = RS_CALC.normH(rsNomeCurto(o.cliente)) || o.cliente;
    const c = m[chave] || (m[chave] = { cliente: o.cliente, serv: 0, pec: 0, total: 0, n: 0 });
    if (o.cliente.length > c.cliente.length) c.cliente = o.cliente;
    c.serv += o.serv; c.pec += o.pecEst + o.pecDiv + o.semDetalhe; c.total += o.total; c.n++;
  });
  return Object.values(m).sort((a, b) => b.total - a.total);
}

function rsRenderClientes(per) {
  const cli = rsAgruparClientes(per);
  const tot = cli.reduce((s, c) => ({ serv: s.serv + c.serv, pec: s.pec + c.pec, total: s.total + c.total, n: s.n + c.n }), { serv: 0, pec: 0, total: 0, n: 0 });
  rs$('rs-cli-resumo').textContent = cli.length + ' clientes · ' + tot.n + ' OSs · ' + rsR(tot.total);

  rs$('rs-tabela-clientes').innerHTML = '<table class="rs-t"><thead><tr><th>Cliente</th><th class="n">OSs</th><th class="n"><span class="rs-sw" style="background:var(--rs-serv)"></span>Serviços</th><th class="n"><span class="rs-sw" style="background:var(--rs-pec)"></span>Peças</th>'
    + '<th class="n">Total</th><th class="n">%</th></tr></thead><tbody>'
    + cli.map(c => '<tr><td class="cli" title="' + rsEsc(c.cliente) + '">' + rsEsc(rsNomeCurto(c.cliente)) + '</td><td class="n">' + c.n + '</td><td class="n">' + rsR(c.serv) + '</td><td class="n">' + rsR(c.pec) + '</td>'
      + '<td class="n"><b>' + rsR(c.total) + '</b></td><td class="n">' + rsP(tot.total ? c.total / tot.total : null, 1) + '</td></tr>').join('')
    + '<tr class="tot"><td>Total</td><td class="n">' + tot.n + '</td><td class="n">' + rsR(tot.serv) + '</td><td class="n">' + rsR(tot.pec) + '</td>' + '<td class="n">' + rsR(tot.total) + '</td><td class="n">100%</td></tr></tbody></table>';

  const wrap = rs$('rs-grafico-wrap');
  wrap.style.height = Math.max(180, cli.length * 34 + 70) + 'px';
  if (RS.grafico) { RS.grafico.destroy(); RS.grafico = null; }
  if (typeof Chart === 'undefined') { wrap.innerHTML = '<p class="rs-nota">Gráfico indisponível (biblioteca não carregou). A tabela ao lado tem os mesmos números.</p>'; return; }
  const rotulos = cli.map(c => rsNomeCurto(c.cliente));
  const ds = [
    { label: 'Serviços', data: cli.map(c => c.serv), backgroundColor: '#2a78d6' },
    { label: 'Peças', data: cli.map(c => c.pec), backgroundColor: '#eb6834' }
  ];
  ds.forEach(d => Object.assign(d, { borderColor: '#ffffff', borderWidth: { right: 2 }, borderSkipped: false, barPercentage: 0.78, categoryPercentage: 0.9 }));
  const totais = cli.map(c => c.total);
  const maximo = Math.max(1, ...totais);
  const pluginTotais = {
    id: 'rsTotais',
    afterDatasetsDraw(ch) {
      const { ctx, scales } = ch;
      ctx.save();
      ctx.font = '700 11px "DM Sans", system-ui, sans-serif';
      ctx.fillStyle = '#52514e'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      totais.forEach((t, i) => ctx.fillText(rsR(t, 0), scales.x.getPixelForValue(t) + 6, scales.y.getPixelForValue(i)));
      ctx.restore();
    }
  };
  // Função e não objeto: o PDF desenha o mesmo gráfico num canvas próprio, e dois gráficos não podem dividir os mesmos datasets.
  RS.cfgClientes = () => ({
    type: 'bar',
    data: { labels: rotulos, datasets: ds.map(d => Object.assign({}, d, { data: d.data.slice() })) },
    plugins: [pluginTotais],
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      layout: { padding: { right: 8 } },
      scales: {
        x: { stacked: true, suggestedMax: maximo * 1.2, grid: { color: '#e1e0d9' }, border: { display: false },
          ticks: { color: '#898781', font: { size: 10 }, maxTicksLimit: 6, callback: v => v >= 1000 ? 'R$ ' + rsN(v / 1000, 0) + ' mil' : 'R$ ' + rsN(v) } },
        y: { stacked: true, grid: { display: false }, border: { color: '#c3c2b7' },
          ticks: { color: '#1e293b', font: { size: 11, weight: '600' }, callback(v, i) { const s = rotulos[i] || '', lim = this.chart.width < 520 ? 15 : 26; return s.length > lim ? s.slice(0, lim - 1) + '…' : s; } } }
      },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, color: '#52514e', font: { size: 11, weight: '600' } } },
        tooltip: { callbacks: { title: it => cli[it[0].dataIndex].cliente, label: it => ' ' + it.dataset.label + ': ' + rsR(it.parsed.x), footer: it => 'Total: ' + rsR(totais[it[0].dataIndex]) + ' · ' + cli[it[0].dataIndex].n + ' OS(s)' } }
      }
    }
  });
  RS.clientesQtd = cli.length;
  RS.grafico = new Chart(rs$('rs-grafico-clientes'), RS.cfgClientes());
}

// ── Rentabilidade ──
function rsRenderRentabilidade(per, rb, rc, difs) {
  const semArquivo = !RS.dados;
  rs$('rs-rent-cenario').innerHTML = difs.length ? '<span class="rs-chip" style="background:#e0e7ff;color:#3730a3;"><i class="fa-solid fa-flask"></i> Cenário "E se" — ' + difs.length + ' parâmetro(s) diferente(s) da base</span>' : '';
  if (semArquivo) {
    rs$('rs-cmp').innerHTML = '';
    rs$('rs-margens').innerHTML = '<div class="rs-vazio" style="padding:24px;"><i class="fa-solid fa-file-arrow-up"></i><b>Falta o relatório de OSs detalhe</b>É dele que saem o custo das peças e a separação entre peças e serviços.</div>';
    rs$('rs-tabela-rent').innerHTML = '';
    return;
  }

  // Comparação base × cenário: o coração da conversa "e se".
  if (difs.length) {
    const cmp = [rc.serv, rc.est, rc.globalTodas].map(c => {
      const b = rb[c.id];
      if (c.lucro == null || b.lucro == null) return '';
      const d = c.lucro - b.lucro;
      const dm = (c.margem != null && b.margem != null) ? c.margem - b.margem : null;
      return '<div class="rs-cmp-item"><div class="l">' + c.nome + ' · resultado</div><div class="v">' + rsR(b.lucro, 0) + ' → ' + rsR(c.lucro, 0) + '</div>'
        + '<div class="d" style="color:' + (d >= 0 ? 'var(--rs-bom)' : 'var(--rs-ruim)') + ';">' + (d >= 0 ? '+' : '−') + rsR(Math.abs(d), 0) + (dm != null ? ' · margem ' + rsPP(dm) : '') + '</div></div>';
    }).join('');
    rs$('rs-cmp').innerHTML = cmp ? '<div class="rs-cmp">' + cmp + '</div>' : '';
  } else rs$('rs-cmp').innerHTML = '';

  // Barras de margem com a meta marcada.
  const blocos = [rc.serv, rc.est, rc.pecas, rc.globalEst, rc.globalTodas].filter(b => b.receita > 0);
  const valores = blocos.map(b => b.margem).filter(v => v != null).concat(blocos.map(b => b.meta).filter(v => v != null));
  const min = Math.min(-0.1, ...valores) - 0.02, max = Math.max(0.5, ...valores) + 0.04;
  const pos = v => ((v - min) / (max - min)) * 100;
  const legendas = { serv: 'receita de serviços − mão de obra', est: 'só peças com custo no inventário', pecas: 'estoque + DIV', globalEst: 'serviços + peças de estoque', globalTodas: 'serviços + todas as peças' };
  rs$('rs-margens').innerHTML = blocos.map(b => {
    if (b.margem == null) return '<div class="rs-mg"><div class="rs-mg-nome">' + b.nome + '<small>' + legendas[b.id] + '</small></div><div class="rs-mg-trilho"></div><div class="rs-mg-val rs-nota">Informe a folha</div></div>';
    const st = rsStatusMargem(b.margem, b.meta);
    const cor = b.margem < 0 ? '#d03b3b' : st === 'bom' ? '#0ca30c' : st === 'alerta' ? '#e0a100' : '#ec835a';
    const z = pos(0), p = pos(b.margem);
    const barra = b.margem >= 0 ? 'left:' + z + '%;width:' + (p - z) + '%;' : 'left:' + p + '%;width:' + (z - p) + '%;';
    return '<div class="rs-mg"><div class="rs-mg-nome">' + b.nome + '<small>' + legendas[b.id] + '</small></div>'
      + '<div class="rs-mg-trilho" title="Margem ' + rsP(b.margem) + ' · meta ' + rsP(b.meta) + '"><div class="rs-mg-zero" style="left:' + z + '%"></div>'
      + '<div class="rs-mg-barra' + (b.margem < 0 ? ' neg' : '') + '" style="' + barra + 'background:' + cor + ';"></div>'
      + (b.meta != null ? '<div class="rs-mg-meta" style="left:' + pos(b.meta) + '%" data-rotulo="meta ' + rsP(b.meta) + '"></div>' : '') + '</div>'
      + '<div class="rs-mg-val">' + rsP(b.margem) + (st ? ' <span class="rs-chip ' + st + '"><i class="fa-solid ' + RS_STATUS[st][0] + '"></i>' + RS_STATUS[st][1] + '</span>' : '') + '</div></div>';
  }).join('');

  const cols = [rc.serv, rc.est, rc.div, rc.pecas, rc.globalEst, rc.globalTodas];
  const destaque = id => (id === 'globalEst' || id === 'globalTodas') ? ' col-destaque' : '';
  const cel = (b, v, cls = '') => '<td class="n' + cls + destaque(b.id) + '">' + v + '</td>';
  const linha = (rot, fn, trCls = '') => '<tr class="' + trCls + '"><td>' + rot + '</td>' + cols.map(fn).join('') + '</tr>';
  const menos = v => v == null ? '—' : v === 0 ? rsR(0) : '− ' + rsR(v);
  rs$('rs-tabela-rent').innerHTML = '<table class="rs-t"><thead><tr><th></th>' + cols.map(b => '<th class="n' + destaque(b.id) + '">' + b.nome + '</th>').join('') + '</tr></thead><tbody>'
    + linha('Receita', b => cel(b, '<b>' + rsR(b.receita) + '</b>'))
    + linha('Custo direto <span class="rs-nota">(mão de obra / custo das peças)</span>', b => cel(b, menos(b.custo)))
    + linha('Simples Nacional (' + rsN(RS.cen.simples, 1) + '%)', b => cel(b, menos(b.imp)), 'sub')
    + linha('Administrativo (' + rsN(RS.cen.adm, 1) + '%)', b => cel(b, menos(b.adm)), 'sub')
    + linha('Financeiro (' + rsN(RS.cen.fin, 1) + '%)', b => cel(b, menos(b.fin)), 'sub')
    + linha('Comissão', b => cel(b, menos(b.com)), 'sub')
    + linha('<b>Resultado</b>', b => cel(b, rsR(b.lucro), b.lucro == null ? '' : b.lucro >= 0 ? ' pos' : ' neg'), 'res')
    + linha('Margem', b => cel(b, '<b>' + rsP(b.margem) + '</b>'))
    + linha('Meta', b => cel(b, rsP(b.meta)), 'sub')
    + linha('Preço mínimo para a meta', b => cel(b, rsR(b.precoMin)))
    + linha('Folga vs. preço mínimo', b => cel(b, b.folga == null ? '—' : (b.folga >= 0 ? '+' : '−') + ' ' + rsR(Math.abs(b.folga)), b.folga == null ? '' : b.folga >= 0 ? ' pos' : ' neg'))
    + '</tbody></table>';
}

function rsRenderMaoDeObra(mo, dias) {
  const autoDias = RS_CALC.diasUteis(RS.de, RS.ate);
  const inpDias = '<input type="number" min="0" max="31" step="1" value="' + dias + '" aria-label="Dias trabalhados no período" onchange="rsMudarDias(this.value)">';
  const dicaDias = '<small>dias trabalhados' + (RS.diasManual != null && RS.diasManual !== autoDias ? ' (calendário: ' + autoDias + ')' : ' · seg a sáb') + '</small>';
  if (!mo) {
    rs$('rs-memo').innerHTML = '<div class="rs-memo-passo" style="border-color:var(--rs-ruim);"><small>Folha mensal dos produtivos</small><b>não informada</b></div>'
      + '<div class="rs-memo-seta"><i class="fa-solid fa-arrow-right"></i></div><div class="rs-memo-passo">' + dicaDias + inpDias + '</div>'
      + '<button class="rs-btn peq" style="align-self:center;" onclick="rsAlternarParametros(true)"><i class="fa-solid fa-sliders"></i> Informar folha</button>';
    return;
  }
  const P = RS.cen;
  const passo = (rot, val, cls = '') => '<div class="rs-memo-passo ' + cls + '"><small>' + rot + '</small><b>' + val + '</b></div>';
  const seta = '<div class="rs-memo-seta"><i class="fa-solid fa-arrow-right"></i></div>';
  rs$('rs-memo').innerHTML = passo('Folha produtiva', rsR(mo.folha, 0)) + seta
    + passo('+ ' + rsN(P.he, 0) + '% hora extra', rsR(mo.comHE, 0)) + seta
    + passo('÷ ' + rsN(P.diasMes, 0) + ' dias do mês', rsR(mo.dia)) + seta
    + passo('+ ' + rsN(P.encargos, 0) + '% encargos', rsR(mo.diaEnc) + '<span class="rs-nota">/dia</span>') + seta
    + '<div class="rs-memo-passo">' + dicaDias + '× ' + inpDias + '</div>' + seta
    + passo('Custo no período', rsR(mo.total), 'fim');
}
function rsMudarDias(v) {
  const n = Math.max(0, Math.min(31, parseInt(v, 10) || 0));
  RS.diasManual = n === RS_CALC.diasUteis(RS.de, RS.ate) ? null : n;
  rsRender();
}

// ── Peças ──
function rsRenderPecas(per, rc) {
  const ab = rc.abaixo;
  rs$('rs-abaixo-resumo').textContent = ab.length ? '· ' + ab.length + ' itens · ' + rsR(-ab.reduce((s, a) => s + a.sobra, 0)) + ' a menos' : '';
  rs$('rs-tabela-abaixo').innerHTML = !RS.dados ? '<p class="rs-nota" style="padding:12px;">Aguardando o arquivo de detalhe.</p>'
    : !ab.length ? '<p class="rs-nota" style="padding:12px;"><i class="fa-solid fa-circle-check" style="color:#0ca30c;"></i> Nenhuma peça de estoque vendida abaixo do custo + despesas com os parâmetros atuais.</p>'
    : '<table class="rs-t"><thead><tr><th>OS</th><th>Peça</th><th class="n">Qtd</th><th class="n">Venda</th><th class="n">Custo</th><th class="n">Sobra</th></tr></thead><tbody>'
      + ab.slice(0, 60).map(a => '<tr><td>' + rsEsc(a.os) + '</td><td title="' + rsEsc(a.cliente) + '">' + rsEsc(a.descricao || a.codigo) + '<br><span class="rs-nota">' + rsEsc(a.codigo) + '</span></td><td class="n">' + rsN(a.qtd, a.qtd % 1 ? 2 : 0) + '</td><td class="n">' + rsR(a.receita) + '</td><td class="n">' + rsR(a.custo) + '</td><td class="n neg">' + rsR(a.sobra) + '</td></tr>').join('')
      + (ab.length > 60 ? '<tr class="sub"><td colspan="6">… e mais ' + (ab.length - 60) + ' itens (todos no Excel).</td></tr>' : '') + '</tbody></table>';

  const divs = [];
  per.oss.forEach(o => o.itens.forEach(it => { if (it.tipo === 'div') divs.push(Object.assign({ cliente: o.cliente }, it)); }));
  divs.sort((a, b) => b.receita - a.receita);
  const codigos = RS.dados ? Object.keys(RS.dados.divCodigos) : [];
  rs$('rs-div-resumo').textContent = divs.length ? '· ' + divs.length + ' itens · ' + rsR(divs.reduce((s, d) => s + d.receita, 0)) + (codigos.length ? ' · códigos: ' + codigos.join(', ') : '') : '';
  rs$('rs-tabela-div').innerHTML = !RS.dados ? '<p class="rs-nota" style="padding:12px;">Aguardando o arquivo de detalhe.</p>'
    : !divs.length ? '<p class="rs-nota" style="padding:12px;">Nenhum item DIV nas OSs do período.</p>'
    : '<table class="rs-t"><thead><tr><th>OS</th><th>Item</th><th class="n">Qtd</th><th class="n">Venda</th><th class="n">Custo lançado</th></tr></thead><tbody>'
      + divs.slice(0, 60).map(d => '<tr><td>' + rsEsc(d.os) + '</td><td title="' + rsEsc(d.cliente) + '">' + rsEsc(d.descricao) + '<br><span class="rs-nota">' + rsEsc(d.codigo) + ' · ' + rsEsc(rsNomeCurto(d.cliente)) + '</span></td><td class="n">' + rsN(d.qtd, d.qtd % 1 ? 2 : 0) + '</td><td class="n">' + rsR(d.receita) + '</td><td class="n">' + rsR(d.custo) + '</td></tr>').join('')
      + (divs.length > 60 ? '<tr class="sub"><td colspan="5">… e mais ' + (divs.length - 60) + ' itens (todos no Excel).</td></tr>' : '') + '</tbody></table>';
}

// ── OSs ──
const RS_SITUACAO = {
  'ok': ['bom', 'fa-check', 'Completa'],
  'diverge': ['alerta', 'fa-scale-unbalanced', 'Valor diverge'],
  'sem-detalhe': ['alerta', 'fa-circle-exclamation', 'Peças sem custo'],
  'sem-dados': ['ruim', 'fa-circle-xmark', 'Sem itens no detalhe']
};
function rsRenderOSs(per) {
  const t = per.oss.reduce((s, o) => ({ serv: s.serv + o.serv, est: s.est + o.pecEst, div: s.div + o.pecDiv, desconto: s.desconto + (o.desconto || 0), custo: s.custo + o.custoEst + o.custoDiv, total: s.total + o.total }), { serv: 0, est: 0, div: 0, desconto: 0, custo: 0, total: 0 });
  const temDesconto = t.desconto > 0.005;
  rs$('rs-oss-resumo').textContent = per.oss.length + ' OSs · ' + rsR(t.total) + (temDesconto ? ' · ' + rsR(t.desconto) + ' em desconto' : '');
  rs$('rs-tabela-oss').innerHTML = '<table class="rs-t"><thead><tr><th>OS</th><th>Finalizada</th><th>Cliente</th><th class="n">Serviços</th><th class="n">Peças estoque</th><th class="n">Peças DIV</th>' + '<th class="n">Custo peças</th>' + (temDesconto ? '<th class="n">Desconto</th>' : '') + '<th class="n">Total</th><th>Situação</th></tr></thead><tbody>'
    + per.oss.map(o => {
      const s = RS_SITUACAO[o.situacao];
      return '<tr><td><b>' + rsEsc(o.os) + '</b></td><td>' + rsDiaCurto(o.dia) + '</td><td title="' + rsEsc(o.cliente) + '">' + rsEsc(rsNomeCurto(o.cliente)) + '</td><td class="n">' + rsR(o.serv) + '</td><td class="n">' + rsR(o.pecEst) + '</td><td class="n">' + rsR(o.pecDiv) + '</td>'
        + '<td class="n">' + rsR(o.custoEst + o.custoDiv) + '</td>'
        + (temDesconto ? '<td class="n' + (o.desconto > 0.005 ? ' neg' : '') + '">' + (o.desconto > 0.005 ? rsR(o.desconto) : '—') + '</td>' : '') + '<td class="n"><b>' + rsR(o.total) + '</b></td>'
        + '<td><span class="rs-chip ' + s[0] + '"><i class="fa-solid ' + s[1] + '"></i>' + s[2] + '</span></td></tr>';
    }).join('')
    + '<tr class="tot"><td colspan="3">Total</td><td class="n">' + rsR(t.serv) + '</td><td class="n">' + rsR(t.est) + '</td><td class="n">' + rsR(t.div) + '</td>' + '<td class="n">' + rsR(t.custo) + '</td>' + (temDesconto ? '<td class="n">' + rsR(t.desconto) + '</td>' : '') + '<td class="n">' + rsR(t.total) + '</td><td></td></tr></tbody></table>';
}

// ── Backend (apps-script/resultado-semanal.gs) ──
const rsDataHora = iso => { const d = new Date(iso); return !iso || isNaN(d) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
function rsApiLigada() { return /^https?:\/\//.test(RS.API || ''); }

async function rsPost(action, corpo) {
  const r = await fetch(RS.API, {
    method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action, token: RV.token }, corpo || {}))
  });
  const d = await r.json();
  if (!d.success) throw new Error(d.error || 'Falha no servidor do Resultado Semanal.');
  return d.data;
}

async function rsCarregarRemoto() {
  if (!rsApiLigada() || !RV.token) { rsRenderFontes(); return; }
  await Promise.all([
    rsPost('parametros_ler').then(p => {
      const cenarioEraBase = rsDiferencas().length === 0;
      if (p.base && p.base.valor) { RS.base = rsMigrar(Object.assign({}, RS_PADRAO, p.base.valor)); rsGravar('rs_params_base', RS.base); }
      if (p.metas && p.metas.valor) { RS.metas = Object.assign({}, RS_METAS_PADRAO, p.metas.valor); rsGravar('rs_metas', RS.metas); }
      if (cenarioEraBase) { RS.cen = Object.assign({}, RS.base); rsGravar('rs_params_cenario', RS.cen); }
      if (!p.base && RS.base.folha > 0) rsSalvarRemoto('base'); // 1ª vez com servidor: sobe a base deste navegador
      rsPreencherCampos();
    }).catch(e => console.warn('Resultado Semanal — parâmetros:', e.message)),
    rsPost('fechamentos_ler').then(f => {
      // Fechamentos antigos só deste navegador continuam valendo até serem salvos de novo no servidor.
      const locais = rsFechamentosLocais().filter(l => !f.some(x => x.de === l.de && x.ate === l.ate));
      RS.fechamentos = f.concat(locais);
      }).catch(e => console.warn('Resultado Semanal — fechamentos:', e.message)),
    rsCarregarBanco(false)
  ]);
  rsRecalcular();
}

async function rsCarregarBanco(avisar) {
  if (!rsApiLigada()) { rsRenderFontes(); if (avisar) alert('O backend do Resultado Semanal ainda não foi publicado.'); return; }
  RS.carregandoBanco = true; RS.bancoErro = null; rsRenderFontes();
  try {
    const d = await rsPost('dados');
    const cols = d.colunas || [];
    const rows = (d.linhas || []).map(l => { const o = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = l[i]; return o; });
    RS.banco = { gerado_em: d.gerado_em, origem: d.origem, janela: d.janela, linhas: rows.length,
      aba: { nome: 'Banco › ' + (d.origem || 'vw_os_produto_serviço'), rows } };
  } catch (e) {
    RS.bancoErro = e.message || String(e);
    if (avisar) alert('Não consegui buscar do banco: ' + RS.bancoErro);
  } finally {
    RS.carregandoBanco = false;
  }
  rsReprocessarArquivos();
}

const rsTimersRemoto = {};
function rsSalvarRemoto(chave) {
  if (!rsApiLigada() || !RV.token) return;
  clearTimeout(rsTimersRemoto[chave]);
  rsTimersRemoto[chave] = setTimeout(() => {
    rsPost('parametros_salvar', { chave, valor: chave === 'base' ? RS.base : RS.metas })
      .catch(e => alert('Não consegui salvar os parâmetros no servidor: ' + e.message));
  }, 900);
}

// ── Semanas anteriores ──
function rsSemanaISO(k) {
  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 3 - ((dt.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((dt - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

function rsAtualizarSemanas() {
  const sel = rs$('rs-semana');
  if (!sel) return;
  const lista = RS_CALC.semanasDisponiveis({ fonte: RS.fonte, finalizadas: RS.finalizadas, dados: RS.dados });
  const fech = {};
  (RS.fechamentos || []).forEach(f => { fech[f.de + '_' + f.ate] = true; });
  const naLista = lista.some(s => s.de === RS.de && s.ate === RS.ate);
  sel.innerHTML = (naLista ? '' : '<option value="">' + (RS.de ? 'Período ' + rsDiaCurto(RS.de) + ' a ' + rsDiaCurto(RS.ate) : 'Semanas…') + '</option>')
    + lista.map(s => '<option value="' + s.de + '"' + (s.de === RS.de && s.ate === RS.ate ? ' selected' : '') + '>'
      + (fech[s.de + '_' + s.ate] ? '✓ ' : '') + 'Sem. ' + rsSemanaISO(s.de) + ' · ' + rsDiaCurto(s.de) + ' a ' + rsDiaCurto(s.ate) + ' · ' + s.oss + (s.oss === 1 ? ' OS' : ' OSs') + '</option>').join('');
}
function rsEscolherSemana(de) { if (de) rsDefinirPeriodo(de, RS_CALC.somarDias(de, 6)); }

const rsValorCampo = (c, v) => v == null ? 'vazio' : c.u === 'R$' ? rsR(v, 0) : rsN(v, 1) + (c.u === '%' ? '%' : ' ' + c.u);
function rsRenderBannerFechamento() {
  const el = rs$('rs-fech-banner');
  if (!el) return;
  const f = rsFechamentoDoPeriodo();
  if (!f) { el.innerHTML = ''; return; }
  const difs = RS_CAMPOS.filter(c => c.k && !c.meta && f.base && f.base[c.k] !== undefined && f.base[c.k] !== RS.base[c.k]);
  el.innerHTML = '<div class="rs-fech"><i class="fa-solid fa-thumbtack" style="margin-top:4px;"></i><div><b>Semana fechada</b> em ' + rsDataHora(f.salvoEm) + (f.salvoPor ? ' por ' + rsEsc(f.salvoPor) : '') + '.'
    + (f.ind && f.ind.fat != null ? ' Apresentado na época: faturamento ' + rsR(f.ind.fat, 0) + ', margem global ' + rsP(f.ind.mGlobal) + '.' : '')
    + (difs.length ? '<br>Parâmetros da época diferentes dos atuais: ' + difs.map(c => rsEsc(c.l) + ' ' + rsValorCampo(c, f.base[c.k]) + ' (hoje ' + rsValorCampo(c, RS.base[c.k]) + ')').join('; ') + '.' : '')
    + '</div>' + (difs.length ? '<button class="rs-btn peq rs-bastidor" onclick="rsUsarParametrosDaEpoca()"><i class="fa-solid fa-clock-rotate-left"></i> Ver com os parâmetros da época</button>' : '') + '</div>';
}
function rsUsarParametrosDaEpoca() {
  const f = rsFechamentoDoPeriodo();
  if (!f) return;
  RS.cen = Object.assign({}, RS_PADRAO, f.base);
  rsGravar('rs_params_cenario', RS.cen);
  rsPreencherCampos(); rsRender();
}

// ── Evolução semana a semana ──
/** Configurações dos dois gráficos — as mesmas servem à tela e ao PDF. */
function rsCfgEvolucao(serie, idxAtual) {
  const rot = serie.map(s => rsDiaEixo(s.de));
  const titulo = it => { const s = serie[it[0].dataIndex]; return rsDia(s.de) + ' a ' + rsDia(s.ate) + ' · ' + s.n + ' OSs'; };
  const faixa = {
    id: 'rsFaixa',
    beforeDatasetsDraw(ch) {
      if (idxAtual < 0) return;
      const x = ch.scales.x, a = ch.chartArea;
      const passo = serie.length > 1 ? Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0)) : (a.right - a.left);
      ch.ctx.save(); ch.ctx.fillStyle = 'rgba(79,70,229,.09)';
      ch.ctx.fillRect(x.getPixelForValue(idxAtual) - passo / 2, a.top, passo, a.bottom - a.top); ch.ctx.restore();
    }
  };
  const eixoX = { grid: { display: false }, border: { color: '#c3c2b7' }, ticks: { color: '#52514e', font: { size: 10 }, maxRotation: 0, autoSkip: true } };
  const legenda = { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, color: '#52514e', font: { size: 11 }, filter: it => !/^Meta/.test(it.text) } };

  const barras = [
    { label: 'Serviços', k: 'serv', cor: '#2a78d6' }, { label: 'Peças de estoque', k: 'pecEst', cor: '#eb6834' },
    { label: 'Peças DIV', k: 'pecDiv', cor: '#1baf7a' }
  ].filter(b => serie.some(s => s[b.k] > 0.005))
    .map(b => ({ label: b.label, data: serie.map(s => s[b.k]), backgroundColor: b.cor, borderColor: '#ffffff', borderWidth: { top: 2 }, borderSkipped: false, maxBarThickness: 46 }));
  const fat = {
    type: 'bar', data: { labels: rot, datasets: barras }, plugins: [faixa],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      scales: {
        x: Object.assign({ stacked: true }, eixoX),
        y: { stacked: true, grid: { color: '#e1e0d9' }, border: { display: false }, ticks: { color: '#898781', font: { size: 10 }, maxTicksLimit: 5, callback: v => v >= 1000 ? rsN(v / 1000, 0) + ' mil' : rsN(v) } }
      },
      plugins: { legend: legenda, tooltip: { mode: 'index', intersect: false, callbacks: { title: titulo, label: it => ' ' + it.dataset.label + ': ' + rsR(it.parsed.y, 0), footer: it => 'Total: ' + rsR(serie[it[0].dataIndex].fat, 0) } } }
    }
  };

  const parcial = serie.map(s => s.cobertura != null && s.cobertura < 0.95);
  const linha = (label, k, cor) => ({
    label, data: serie.map(s => s[k] == null ? null : s[k] * 100), borderColor: cor, backgroundColor: cor, borderWidth: 2, tension: 0.25, spanGaps: true,
    pointRadius: serie.map((s, i) => i === idxAtual ? 5.5 : 4), pointHoverRadius: 6, pointBackgroundColor: parcial.map(p => p ? '#ffffff' : cor), pointBorderColor: cor, pointBorderWidth: 2
  });
  const meta = (label, v, cor) => ({ label, data: serie.map(() => v), borderColor: cor, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, pointHitRadius: 0, fill: false });
  const mg = {
    type: 'line', plugins: [faixa],
    data: { labels: rot, datasets: [linha('Serviços', 'mServ', '#2a78d6'), linha('Peças de estoque', 'mEst', '#eb6834'), linha('Global (sem DIV)', 'mGlobal', '#4a3aa7'),
      meta('Meta serviços', RS.base.metaServ, 'rgba(42,120,214,.6)'), meta('Meta peças', RS.base.metaPec, 'rgba(235,104,52,.6)')] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      scales: { x: eixoX, y: { grid: { color: '#e1e0d9' }, border: { display: false }, ticks: { color: '#898781', font: { size: 10 }, maxTicksLimit: 6, callback: v => rsN(v, 0) + '%' } } },
      plugins: {
        legend: legenda,
        tooltip: { mode: 'index', intersect: false, filter: it => !/^Meta/.test(it.dataset.label),
          callbacks: { title: titulo, label: it => ' ' + it.dataset.label + ': ' + rsN(it.parsed.y, 1) + '%', footer: it => parcial[it[0].dataIndex] ? 'Cobertura ' + rsP(serie[it[0].dataIndex].cobertura, 0) + ' — margem parcial' : '' } }
      }
    }
  };
  return { fat, mg };
}

function rsRenderEvolucao() {
  const u = RS.ultimo;
  if (!u || !u.per) return;
  if (RS.fonte === 'planilha' && !RS.finalizadas) return;
  const n = +(rs$('rs-evo-n').value || 12);
  const serie = RS_CALC.serieSemanal({ fonte: RS.fonte, finalizadas: RS.finalizadas, dados: RS.dados, ateSemana: RS.ate, n, P: RS.base });
  const idxAtual = serie.findIndex(s => s.de === RS.de && s.ate === RS.ate);
  u.serie = serie; u.serieIdx = idxAtual;

  const fech = {};
  (RS.fechamentos || []).forEach(f => { fech[f.de + '_' + f.ate] = f; });
  rs$('rs-evo-tabela').innerHTML = '<table class="rs-t"><thead><tr><th>Semana</th><th class="n">OSs</th><th class="n">Faturamento</th><th class="n">Margem serviços</th><th class="n">Margem peças est.</th><th class="n">Margem global</th><th class="n">Peças DIV</th><th>Fechamento</th></tr></thead><tbody>'
    + serie.slice().reverse().map(s => {
      const f = fech[s.de + '_' + s.ate];
      return '<tr class="clicavel' + (s.de === RS.de && s.ate === RS.ate ? ' atual' : '') + '" onclick="rsEscolherSemana(\'' + s.de + '\')" title="Abrir a análise desta semana">'
        + '<td>' + rsDiaCurto(s.de) + ' a ' + rsDiaCurto(s.ate) + '</td><td class="n">' + s.n + '</td><td class="n">' + rsR(s.fat, 0) + '</td>'
        + '<td class="n">' + rsP(s.mServ) + '</td><td class="n">' + rsP(s.mEst) + '</td><td class="n">' + rsP(s.mGlobal) + '</td><td class="n">' + rsP(s.divPct, 0) + '</td>'
        + '<td>' + (f ? '<span class="rs-chip neutro" title="Fechamento salvo por ' + rsEsc(f.salvoPor || '—') + '"><i class="fa-solid fa-thumbtack"></i>' + rsDataHora(f.salvoEm).slice(0, 5) + '</span>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>';

  ['fat', 'mg'].forEach(k => { if (RS.graficosEvo[k]) { RS.graficosEvo[k].destroy(); RS.graficosEvo[k] = null; } });
  if (typeof Chart === 'undefined') return;
  const cfg = rsCfgEvolucao(serie, idxAtual);
  ['fat', 'mg'].forEach(k => {
    const ch = RS.graficosEvo[k] = new Chart(rs$('rs-evo-' + k), cfg[k]);
    ch.canvas.onclick = evt => {
      const p = ch.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
      if (p.length) rsEscolherSemana(serie[p[0].index].de);
    };
  });
}

// ── Parâmetros ──
function rsMontarCampos() {
  rs$('rs-campos').innerHTML = RS_CAMPOS.map(c => {
    if (c.g) return '</div><div class="rs-grupo"><div class="rs-grupo-t">' + c.g + '</div>';
    return '<div class="rs-campo" id="rs-campo-' + c.k + '"><label for="rs-p-' + c.k + '">' + c.l + (c.s ? '<small>' + c.s + '</small>' : '') + '<small class="rs-base-dica"></small></label>'
      + '<div class="rs-inp">' + (c.u === 'R$' ? '<span style="padding:0 0 0 7px;">R$</span>' : '') + '<input type="number" inputmode="decimal" id="rs-p-' + c.k + '" step="' + c.step + '" oninput="rsMudarCampo(\'' + c.k + '\', this.value)">' + (c.u !== 'R$' ? '<span>' + c.u + '</span>' : '') + '</div></div>';
  }).join('').replace(/^<\/div>/, '') + '</div>';
  rsPreencherCampos();
}
function rsPreencherCampos() {
  RS_CAMPOS.forEach(c => {
    if (!c.k) return;
    const v = c.meta ? RS.metas[c.k] : RS.cen[c.k];
    const inp = rs$('rs-p-' + c.k);
    if (inp && document.activeElement !== inp) inp.value = v == null ? '' : v;
  });
  rsMarcarCampos();
}
function rsMarcarCampos() {
  RS_CAMPOS.forEach(c => {
    if (!c.k) return;
    const el = rs$('rs-campo-' + c.k);
    if (!el) return;
    const mudou = !c.meta && RS.cen[c.k] !== RS.base[c.k];
    el.classList.toggle('mudou', mudou);
    el.classList.toggle('falta', !!c.obrig && !(RS.cen[c.k] > 0));
    const dica = el.querySelector('.rs-base-dica');
    if (dica) dica.textContent = mudou ? 'base: ' + (RS.base[c.k] == null ? 'vazio' : (c.u === 'R$' ? rsR(RS.base[c.k], 0) : rsN(RS.base[c.k], 1) + ' ' + c.u)) : '';
  });
}
function rsMudarCampo(k, valor) {
  const c = RS_CAMPOS.find(x => x.k === k);
  const n = valor === '' ? null : parseFloat(String(valor).replace(',', '.'));
  const v = n == null || !isFinite(n) ? (c.obrig || c.meta ? null : 0) : n;
  if (c.meta) { RS.metas[k] = v; rsGravar('rs_metas', RS.metas); rsSalvarRemoto('metas'); }
  else {
    RS.cen[k] = v;
    // Enquanto não existe base com folha, a primeira folha digitada já vira base: não é "cenário", é o dado que faltava.
    if (k === 'folha' && !(RS.base.folha > 0) && v > 0) { RS.base.folha = v; rsGravar('rs_params_base', RS.base); rsSalvarRemoto('base'); }
    rsGravar('rs_params_cenario', RS.cen);
  }
  rsMarcarCampos();
  rsRender();
}
function rsTornarBase() {
  RS.base = Object.assign({}, RS.cen);
  rsGravar('rs_params_base', RS.base);
  rsSalvarRemoto('base');
  rsPreencherCampos(); rsRender();
}
function rsVoltarBase() {
  RS.cen = Object.assign({}, RS.base);
  rsGravar('rs_params_cenario', RS.cen);
  rsPreencherCampos(); rsRender();
}
function rsAlternarParametros(forcar) {
  const tela = rs$('screen-resultado');
  const abrir = forcar === true ? true : !tela.classList.contains('rs-com-param');
  tela.classList.toggle('rs-com-param', abrir);
  rs$('rs-btn-param').classList.toggle('on', abrir);
  if (abrir) { rsPreencherCampos(); if (!(RS.cen.folha > 0)) setTimeout(() => { const i = rs$('rs-p-folha'); if (i) i.focus(); }, 50); }
  if (RS.grafico) setTimeout(() => RS.grafico && RS.grafico.resize(), 60);
}
function rsAlternarApresentacao() {
  const tela = rs$('screen-resultado');
  const on = !tela.classList.contains('rs-apres');
  tela.classList.toggle('rs-apres', on);
  rs$('rs-btn-apres').classList.toggle('on', on);
  try {
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => { });
  } catch (e) { }
  if (RS.grafico) setTimeout(() => RS.grafico && RS.grafico.resize(), 120);
}

// ── PDF (jsPDF + autotable, carregados só quando o botão é usado) ──
const RS_LIBS_PDF = ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'];
function rsLibsPdf() {
  const carregar = src => new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => erro(new Error('não carregou ' + src.split('/').pop()));
    document.head.appendChild(s);
  });
  if (!RS._libsPdf) {
    RS._libsPdf = (async () => {
      if (!(window.jspdf && window.jspdf.jsPDF)) await carregar(RS_LIBS_PDF[0]);
      if (typeof new window.jspdf.jsPDF().autoTable !== 'function') await carregar(RS_LIBS_PDF[1]);
    })().catch(e => { RS._libsPdf = null; throw e; });
  }
  return RS._libsPdf;
}

/** Fonte padrão do PDF é WinAnsi: sem "−", "→", setas, espaço estreito. Tira HTML junto. */
const rsPdfTxt = s => String(s == null ? '' : s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/[−–]/g, '-').replace(/→/g, '->').replace(/↑/g, '+').replace(/↓/g, '-')
  .replace(/[✓✔]/g, '').replace(/[   ]/g, ' ');

async function rsGraficoImagem(cfg, largPx, altPx) {
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + largPx + 'px;height:' + altPx + 'px;';
  const cv = document.createElement('canvas');
  cv.width = largPx; cv.height = altPx;
  caixa.appendChild(cv); document.body.appendChild(caixa);
  const fundo = { id: 'rsFundo', beforeDraw(ch) { ch.ctx.save(); ch.ctx.fillStyle = '#ffffff'; ch.ctx.fillRect(0, 0, ch.width, ch.height); ch.ctx.restore(); } };
  const conf = Object.assign({}, cfg, {
    plugins: (cfg.plugins || []).concat([fundo]),
    options: Object.assign({}, cfg.options, { responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: 2 })
  });
  const ch = new Chart(cv, conf);
  const url = ch.toBase64Image('image/png', 1);
  ch.destroy(); caixa.remove();
  return url;
}

async function rsLogoDataUrl() {
  try {
    const b = await (await fetch('assets/logo-renova.jpg')).blob();
    return await new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = erro; fr.readAsDataURL(b); });
  } catch (e) { return null; }
}

async function rsGerarPdf() {
  const u = RS.ultimo;
  if (!u || !u.rc) { alert('Ainda não há análise para gerar o PDF.'); return; }
  const btn = rs$('rs-btn-pdf'), rotulo = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando…';
  try {
    await rsLibsPdf();
    const doc = await rsMontarPdf(u);
    doc.save('Resultado_semanal_' + RS.de + '_a_' + RS.ate + '.pdf');
  } catch (e) {
    console.error('PDF:', e);
    alert('Não consegui gerar o PDF (' + e.message + ').\nVou abrir a impressão do navegador: escolha "Salvar como PDF".');
    rsImprimir();
  } finally {
    btn.disabled = false; btn.innerHTML = rotulo;
  }
}

async function rsMontarPdf(u) {
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const W = 210, H = 297, M = 14, CW = W - 2 * M, RODAPE = 16;
  const NAVY = [30, 58, 95], TINTA = [11, 11, 11], CINZA = [82, 81, 78], MUTED = [137, 135, 129], LINHA = [225, 224, 217];
  const COR = { bom: [0, 99, 0], alerta: [138, 90, 0], ruim: [192, 45, 45] };
  const FUNDO = { bom: [232, 245, 232], alerta: [255, 245, 219], ruim: [253, 238, 238] };
  const T = rsPdfTxt;
  let y = M;

  const fonte = (tam, estilo = 'normal', cor = TINTA) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(cor[0], cor[1], cor[2]); };
  const garantir = alt => { if (y + alt > H - RODAPE) { doc.addPage(); y = M + 2; } };
  const secao = (titulo, altMin = 30) => {
    garantir(altMin);
    fonte(8.5, 'bold', NAVY); doc.text(T(titulo).toUpperCase(), M, y + 4);
    doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2]); doc.setLineWidth(0.3); doc.line(M, y + 6, W - M, y + 6);
    y += 10;
  };
  const texto = (t, o = {}) => {
    const tam = o.tam || 9.5, larg = o.larg || CW, x = o.x == null ? M : o.x;
    fonte(tam, o.estilo || 'normal', o.cor || TINTA);
    const linhas = doc.splitTextToSize(T(t), larg), alt = linhas.length * tam * 0.42;
    garantir(alt + 1);
    doc.text(linhas, x, y + tam * 0.35);
    y += alt + (o.depois == null ? 1.8 : o.depois);
  };
  const tabela = (cab, corpo, o = {}) => {
    const direita = {};
    (o.direita || []).forEach(i => { direita[i] = { halign: 'right' }; });
    // Largura e alinhamento na mesma coluna se somam — um não pode apagar o outro.
    Object.keys(o.colunas || {}).forEach(i => { direita[i] = Object.assign({}, direita[i], o.colunas[i]); });
    o = Object.assign({}, o, { colunas: {} });
    doc.autoTable(Object.assign({
      head: [cab], body: corpo, startY: y, margin: { left: M, right: M, top: M + 2, bottom: RODAPE + 2 }, theme: 'plain',
      styles: { font: 'helvetica', fontSize: o.tam || 8, cellPadding: { top: 1.4, bottom: 1.4, left: 1.6, right: 1.6 }, textColor: TINTA, lineColor: LINHA, lineWidth: { bottom: 0.2 }, overflow: 'linebreak' },
      headStyles: { fontStyle: 'bold', textColor: MUTED, fontSize: (o.tam || 8) - 1, fillColor: [248, 250, 252] },
      columnStyles: Object.assign(direita, o.colunas || {}),
      didParseCell: d => {
        d.cell.text = d.cell.text.map(T);
        if (o.celula) o.celula(d);
      }
    }, o.extra || {}));
    y = doc.lastAutoTable.finalY + 7;
  };

  // ── Cabeçalho ──
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(0, 0, W, 30, 'F');
  const logo = await rsLogoDataUrl();
  if (logo) doc.addImage(logo, 'JPEG', M, 5, 20, 20);
  const xT = logo ? M + 25 : M;
  fonte(7.5, 'bold', [148, 163, 184]); doc.text('GRUPO RENOVA  ·  REUNIÃO DE DIRETORIA', xT, 11);
  fonte(17, 'bold', [255, 255, 255]); doc.text('Resultado da semana', xT, 19);
  fonte(10, 'normal', [226, 232, 240]); doc.text(T(rsDia(RS.de) + ' a ' + rsDia(RS.ate) + '  ·  semana ' + rsSemanaISO(RS.de)), xT, 25.5);
  fonte(7, 'normal', [148, 163, 184]);
  doc.text(T('Gerado em ' + new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + (RV && RV.nome ? ' por ' + RV.nome : '')), W - M, 25.5, { align: 'right' });
  y = 38;

  // ── Placar ──
  secao('Placar da semana', 60);
  const ant = rsFechamentoAnterior();
  const itens = rsIndicadoresPlacar(u.ind);
  const gap = 4, colW = (CW - 2 * gap) / 3, tileH = 25;
  itens.forEach((i, k) => {
    if (k % 3 === 0) { if (k) y += tileH + gap; garantir(tileH); }
    const x = M + (k % 3) * (colW + gap), ty = y;
    doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2]); doc.setLineWidth(0.3); doc.roundedRect(x, ty, colW, tileH, 2, 2, 'S');
    fonte(6.3, 'bold', MUTED); doc.text(T(i.l).toUpperCase(), x + 3, ty + 5);
    fonte(16, 'bold', TINTA); doc.text(T(i.v == null ? '—' : i.f(i.v)), x + 3, ty + 13.5);
    fonte(7, 'normal', CINZA); doc.text(T(i.meta != null ? 'Meta ' + i.fm(i.meta) : (i.sub || 'Sem meta definida')), x + 3, ty + 18.5);
    if (i.st) {
      const rot = RS_STATUS[i.st][1];
      fonte(6.3, 'bold', COR[i.st]);
      const lw = doc.getTextWidth(rot) + 6;
      doc.setFillColor(FUNDO[i.st][0], FUNDO[i.st][1], FUNDO[i.st][2]); doc.roundedRect(x + 3, ty + 20, lw, 3.8, 1.8, 1.8, 'F');
      doc.setFillColor(COR[i.st][0], COR[i.st][1], COR[i.st][2]); doc.circle(x + 5, ty + 21.9, 0.8, 'F');
      doc.text(rot, x + 6.6, ty + 22.8);
    }
    if (ant && ant.ind && ant.ind[i.id] != null && i.v != null) {
      const d = i.v - ant.ind[i.id];
      const txt = i.dif === 'pp' ? rsPP(d) : i.dif === 'pct' ? (ant.ind[i.id] ? (d >= 0 ? '+' : '-') + rsN(Math.abs(d / ant.ind[i.id]) * 100, 0) + '%' : '') : (d >= 0 ? '+' : '-') + rsN(Math.abs(d));
      fonte(6.3, 'normal', MUTED); doc.text(T(txt + ' vs ' + rsDiaCurto(ant.de)), x + colW - 3, ty + 22.8, { align: 'right' });
    }
  });
  y += tileH + 8;

  // ── Leitura ──
  secao('Leitura da semana', 40);
  rsFrases(u.per, u.rb, u.ind).forEach(f => {
    garantir(8);
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.circle(M + 1.2, y + 2.4, 0.75, 'F');
    texto(f, { x: M + 4.5, larg: CW - 4.5, depois: 2.2 });
  });
  y += 4;

  const avisos = Array.from(rs$('rs-avisos').children).map(el => el.textContent.trim()).filter(Boolean);
  const difs = rsDiferencas();
  if (difs.length) avisos.unshift('A rentabilidade deste relatório está num cenário "E se": ' + RS_CAMPOS.filter(c => difs.indexOf(c.k) >= 0).map(c => c.l + ' ' + rsValorCampo(c, RS.cen[c.k]) + ' (base ' + rsValorCampo(c, RS.base[c.k]) + ')').join('; ') + '.');
  if (avisos.length) {
    secao('Qualidade dos dados', 20);
    avisos.forEach(a => texto('• ' + a, { tam: 8, cor: CINZA, depois: 1.2 }));
    y += 3;
  }

  // ── Evolução ──
  if (u.serie && u.serie.length) {
    doc.addPage(); y = M + 2;
    secao('Evolução semana a semana (' + u.serie.length + ' semanas, parâmetros base atuais)', 90);
    const cfg = rsCfgEvolucao(u.serie, u.serieIdx);
    const gw = (CW - 6) / 2, gh = 62;
    const [imgFat, imgMg] = await Promise.all([rsGraficoImagem(cfg.fat, 520, Math.round(520 * gh / gw)), rsGraficoImagem(cfg.mg, 520, Math.round(520 * gh / gw))]);
    fonte(8, 'bold', TINTA); doc.text('Faturamento finalizado', M, y + 3); doc.text('Margens (tracejado = meta)', M + gw + 6, y + 3);
    doc.addImage(imgFat, 'PNG', M, y + 5, gw, gh); doc.addImage(imgMg, 'PNG', M + gw + 6, y + 5, gw, gh);
    y += gh + 11;
    const fech = {};
    (RS.fechamentos || []).forEach(f => { fech[f.de + '_' + f.ate] = f; });
    tabela(['Semana', 'OSs', 'Faturamento', 'Mg. serviços', 'Mg. peças est.', 'Mg. global', 'Peças DIV', 'Fechada'],
      u.serie.slice().reverse().map(s => [rsDiaCurto(s.de) + ' a ' + rsDiaCurto(s.ate), s.n, rsR(s.fat, 0), rsP(s.mServ), rsP(s.mEst), rsP(s.mGlobal), rsP(s.divPct, 0), fech[s.de + '_' + s.ate] ? 'sim' : '']),
      { direita: [1, 2, 3, 4, 5, 6, 7], tam: 7.8, celula: d => { if (d.section === 'body' && u.serie.slice().reverse()[d.row.index].de === RS.de) d.cell.styles.fillColor = [238, 242, 255]; } });
  }

  // ── Clientes ──
  const cli = rsAgruparClientes(u.per);
  const altCli = Math.min(120, 14 + cli.length * 7);
  secao('Faturamento por cliente', altCli + 20);
  if (RS.cfgClientes && typeof Chart !== 'undefined') {
    const img = await rsGraficoImagem(RS.cfgClientes(), 1100, Math.round(1100 * altCli / CW));
    doc.addImage(img, 'PNG', M, y, CW, altCli);
    y += altCli + 5;
  }
  const totCli = cli.reduce((s, c) => s + c.total, 0);
  tabela(['Cliente', 'OSs', 'Serviços', 'Peças', 'Total', '%'],
    cli.map(c => [c.cliente, c.n, rsR(c.serv), rsR(c.pec), rsR(c.total), rsP(totCli ? c.total / totCli : null)]),
    { direita: [1, 2, 3, 4, 5], colunas: { 0: { cellWidth: 62 } } });

  // ── Rentabilidade ──
  secao('Rentabilidade — peças e serviços' + (difs.length ? ' (cenário "E se")' : ''), 80);
  const cols = [u.rc.serv, u.rc.est, u.rc.div, u.rc.pecas, u.rc.globalEst, u.rc.globalTodas];
  const menos = v => v == null ? '—' : v === 0 ? rsR(0) : '- ' + rsR(v);
  const linhasRent = [
    ['Receita'].concat(cols.map(b => rsR(b.receita))),
    ['Custo direto'].concat(cols.map(b => menos(b.custo))),
    ['Simples (' + rsN(RS.cen.simples, 1) + '%)'].concat(cols.map(b => menos(b.imp))),
    ['Administrativo (' + rsN(RS.cen.adm, 1) + '%)'].concat(cols.map(b => menos(b.adm))),
    ['Financeiro (' + rsN(RS.cen.fin, 1) + '%)'].concat(cols.map(b => menos(b.fin))),
    ['Comissão'].concat(cols.map(b => menos(b.com))),
    ['Resultado'].concat(cols.map(b => rsR(b.lucro))),
    ['Margem'].concat(cols.map(b => rsP(b.margem))),
    ['Meta'].concat(cols.map(b => rsP(b.meta))),
    ['Preço mínimo p/ meta'].concat(cols.map(b => rsR(b.precoMin, 0))),
    ['Folga vs. preço mínimo'].concat(cols.map(b => b.folga == null ? '—' : (b.folga >= 0 ? '+ ' : '- ') + rsR(Math.abs(b.folga), 0)))
  ];
  tabela([''].concat(cols.map(b => b.nome)), linhasRent, {
    direita: [1, 2, 3, 4, 5, 6], tam: 7.6, colunas: { 0: { cellWidth: 36, fontStyle: 'bold' } },
    celula: d => {
      if (d.section !== 'body' || d.column.index === 0) return;
      const rot = linhasRent[d.row.index][0];
      if (rot === 'Resultado' || rot === 'Margem' || rot.indexOf('Folga') === 0) {
        d.cell.styles.fontStyle = 'bold';
        const b = cols[d.column.index - 1];
        const v = rot === 'Resultado' ? b.lucro : rot === 'Margem' ? (b.margem == null ? null : b.margem - b.meta) : b.folga;
        if (v != null) d.cell.styles.textColor = v >= 0 ? COR.bom : COR.ruim;
      }
      if (d.column.index >= 5) d.cell.styles.fillColor = [245, 248, 252];
    }
  });
  if (u.moCen) {
    const P = RS.cen;
    texto('Mão de obra produtiva: folha ' + rsR(u.moCen.folha, 0) + ' + ' + rsN(P.he, 0) + '% hora extra = ' + rsR(u.moCen.comHE, 0) + ' ÷ ' + rsN(P.diasMes, 0) + ' dias = ' + rsR(u.moCen.dia) + '/dia + ' + rsN(P.encargos, 0) + '% encargos = ' + rsR(u.moCen.diaEnc) + '/dia × ' + u.dias + ' dias trabalhados = ' + rsR(u.moCen.total) + ' no período.', { tam: 8, cor: CINZA });
  }
  texto('Resultado = receita - custo direto - Simples - administrativo - financeiro - comissão. Preço mínimo = custo ÷ (1 - despesas - meta).', { tam: 7.5, cor: MUTED, depois: 5 });

  const campos = RS_CAMPOS.filter(c => c.k && !c.meta);
  tabela(difs.length ? ['Parâmetro', 'Base', 'Cenário do relatório'] : ['Parâmetro', 'Valor'],
    campos.map(c => [c.l].concat(difs.length ? [rsValorCampo(c, RS.base[c.k]), rsValorCampo(c, RS.cen[c.k])] : [rsValorCampo(c, RS.cen[c.k])])),
    { direita: difs.length ? [1, 2] : [1], tam: 7.5, extra: { tableWidth: 120 },
      celula: d => { if (d.section === 'body' && difs.length && difs.indexOf(campos[d.row.index].k) >= 0) d.cell.styles.fillColor = [238, 242, 255]; } });

  // ── Peças ──
  if (u.rc.abaixo.length) {
    secao('Peças de estoque vendidas abaixo do custo + despesas', 30);
    tabela(['OS', 'Peça', 'Código', 'Qtd', 'Venda', 'Custo', 'Sobra'],
      u.rc.abaixo.slice(0, 40).map(a => [a.os, a.descricao, a.codigo, rsN(a.qtd, a.qtd % 1 ? 2 : 0), rsR(a.receita), rsR(a.custo), rsR(a.sobra)]),
      { direita: [3, 4, 5, 6], tam: 7.5, colunas: { 0: { cellWidth: 12 }, 3: { cellWidth: 10 }, 4: { cellWidth: 24 }, 5: { cellWidth: 24 }, 6: { cellWidth: 24 } },
        celula: d => { if (d.section === 'body' && d.column.index === 6) d.cell.styles.textColor = COR.ruim; } });
  }
  const divs = [];
  u.per.oss.forEach(o => o.itens.forEach(it => { if (it.tipo === 'div') divs.push(Object.assign({ cliente: o.cliente }, it)); }));
  if (divs.length) {
    divs.sort((a, b) => b.receita - a.receita);
    secao('Itens DIV — sucata, recondicionada ou fora do inventário (' + divs.length + ' itens, ' + rsR(divs.reduce((s, d) => s + d.receita, 0), 0) + ')', 30);
    tabela(['OS', 'Item', 'Cliente', 'Qtd', 'Venda', 'Custo lançado'],
      divs.slice(0, 40).map(d => [d.os, d.descricao, rsNomeCurto(d.cliente), rsN(d.qtd, d.qtd % 1 ? 2 : 0), rsR(d.receita), rsR(d.custo)]),
      { direita: [3, 4, 5], tam: 7.5, colunas: { 0: { cellWidth: 12 }, 3: { cellWidth: 10 }, 4: { cellWidth: 24 }, 5: { cellWidth: 22 } } });
    if (divs.length > 40) texto('… e mais ' + (divs.length - 40) + ' itens (lista completa no Excel).', { tam: 7.5, cor: MUTED });
  }

  // ── Curva ABC ──
  const abcTabela = (titulo, itens) => {
    const { total, linhas } = rsClassificarABC(itens);
    if (!linhas.length) return;
    secao(titulo + ' — Curva ABC (' + linhas.length + ' itens, ' + rsR(total, 0) + ')', 30);
    tabela(['Código', 'Descrição', 'Qtd', 'Receita', '%', 'Acum.', 'Classe'],
      linhas.slice(0, 25).map(x => [x.codigo, x.descricao || '—', rsN(x.qtd, x.qtd % 1 ? 2 : 0), rsR(x.receita), rsN(x.pct, 1) + '%', rsN(x.acc, 1) + '%', x.cls]),
      { direita: [2, 3, 4, 5], tam: 7.5, colunas: { 1: { cellWidth: 50 }, 6: { cellWidth: 14, halign: 'center' } },
        celula: d => { if (d.section === 'body' && d.column.index === 6) { const cls = linhas[d.row.index].cls; d.cell.styles.textColor = cls === 'A' ? COR.bom : cls === 'B' ? COR.alerta : CINZA; } } });
    if (linhas.length > 25) texto('… e mais ' + (linhas.length - 25) + ' itens (lista completa no Excel).', { tam: 7.5, cor: MUTED });
  };
  const pecasAbc = [], servicosAbc = [];
  u.per.oss.forEach(o => o.itens.forEach(it => (it.tipo === 'serv' ? servicosAbc : pecasAbc).push(it)));
  abcTabela('Peças', pecasAbc);
  abcTabela('Serviços', servicosAbc);

  // ── OSs ──
  const temDescontoPdf = u.per.oss.some(o => (o.desconto || 0) > 0.005);
  secao('OSs consideradas (' + u.per.oss.length + ')', 30);
  const posDesc = 6, posTotal = posDesc + (temDescontoPdf ? 1 : 0);
  const direitaOs = [3, 4, 5].concat(temDescontoPdf ? [posDesc] : []).concat([posTotal]);
  tabela(['OS', 'Data', 'Cliente', 'Serviços', 'Peças est.', 'Peças DIV'].concat(temDescontoPdf ? ['Desconto'] : []).concat(['Total', 'Situação']),
    u.per.oss.map(o => [o.os, rsDiaCurto(o.dia), rsNomeCurto(o.cliente), rsR(o.serv), rsR(o.pecEst), rsR(o.pecDiv)]
      .concat(temDescontoPdf ? [o.desconto > 0.005 ? rsR(o.desconto) : '—'] : []).concat([rsR(o.total), RS_SITUACAO[o.situacao][2]])),
    { direita: direitaOs, tam: 7, colunas: { 2: { cellWidth: 40 } },
      celula: d => { const ultima = posTotal + 1; if (d.section === 'body' && d.column.index === ultima) { const s = RS_SITUACAO[u.per.oss[d.row.index].situacao][0]; d.cell.styles.textColor = COR[s] || CINZA; } } });

  // ── Rodapé em todas as páginas ──
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2]); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11);
    fonte(7, 'normal', MUTED);
    doc.text(T('Confidencial — uso interno da diretoria  ·  Resultado da semana ' + rsDia(RS.de) + ' a ' + rsDia(RS.ate)), M, H - 7);
    doc.text('Página ' + p + ' de ' + paginas, W - M, H - 7, { align: 'right' });
  }
  doc.setProperties({ title: 'Resultado da semana ' + rsDia(RS.de) + ' a ' + rsDia(RS.ate), subject: 'Reunião de diretoria', author: 'Grupo Renova', creator: 'Sistema de Gestão Renova' });
  return doc;
}

// ── Saídas ──
function rsImprimir() {
  document.body.classList.add('rs-imprimindo');
  const limpar = () => { document.body.classList.remove('rs-imprimindo'); window.removeEventListener('afterprint', limpar); };
  window.addEventListener('afterprint', limpar);
  setTimeout(() => window.print(), 50);
}

function rsTextoResumo() {
  const u = RS.ultimo;
  if (!u || !u.ind) return '';
  const tira = s => String(s).replace(/<[^>]+>/g, '');
  const icone = { bom: '🟢', alerta: '🟡', ruim: '🔴' };
  const linhas = ['*Resultado da semana — ' + rsDia(RS.de) + ' a ' + rsDia(RS.ate) + '*', ''];
  rsIndicadoresPlacar(u.ind).forEach(i => {
    linhas.push((i.st ? icone[i.st] + ' ' : '• ') + i.l + ': ' + (i.v == null ? '—' : i.f(i.v)) + (i.meta != null ? ' (meta ' + i.fm(i.meta) + ')' : ''));
  });
  linhas.push('', '*Leitura*');
  rsFrases(u.per, u.rb, u.ind).forEach(f => linhas.push('• ' + tira(f)));
  return linhas.join('\n');
}
async function rsCopiarResumo() {
  const txt = rsTextoResumo();
  if (!txt) { alert('Ainda não há análise para resumir.'); return; }
  try { await navigator.clipboard.writeText(txt); alert('Resumo copiado. É só colar no WhatsApp ou no e-mail.'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); alert('Resumo copiado.'); } catch (e2) { prompt('Copie o resumo:', txt); }
    ta.remove();
  }
}

function rsBaixarExcel() {
  const u = RS.ultimo;
  if (!u || !u.rc) { alert('Ainda não há análise para exportar.'); return; }
  if (typeof XLSX === 'undefined') { alert('Biblioteca de Excel não carregou.'); return; }
  const wb = XLSX.utils.book_new();
  const add = (nome, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nome);
  const r2 = v => v == null ? null : Math.round(v * 100) / 100;
  const r4 = v => v == null ? null : Math.round(v * 10000) / 10000;

  add('Placar', [['Resultado semanal', rsDia(RS.de) + ' a ' + rsDia(RS.ate)], [], ['Indicador', 'Valor', 'Meta', 'Status']]
    .concat(rsIndicadoresPlacar(u.ind).map(i => [i.l, i.dif === 'pp' ? r4(i.v) : r2(i.v), i.meta == null ? null : (i.dif === 'pp' ? r4(i.meta) : r2(i.meta)), i.st ? RS_STATUS[i.st][1] : '']))
    .concat([[], ['Leitura']], rsFrases(u.per, u.rb, u.ind).map(f => [String(f).replace(/<[^>]+>/g, '')])));

  add('Por cliente', [['Cliente', 'OSs', 'Serviços', 'Peças', 'Sem abertura', 'Total']].concat(rsAgruparClientes(u.per).map(c => [c.cliente, c.n, r2(c.serv), r2(c.pec), r2(c.sem), r2(c.total)])));

  const cols = [u.rc.serv, u.rc.est, u.rc.div, u.rc.pecas, u.rc.globalEst, u.rc.globalTodas];
  const lin = (rot, k, f = r2) => [rot].concat(cols.map(b => f(b[k])));
  add('Rentabilidade', [[''].concat(cols.map(b => b.nome)), lin('Receita', 'receita'), lin('Custo direto', 'custo'), lin('Simples', 'imp'), lin('Administrativo', 'adm'),
    lin('Financeiro', 'fin'), lin('Comissão', 'com'), lin('Resultado', 'lucro'), lin('Margem', 'margem', r4), lin('Meta', 'meta', r4), lin('Preço mínimo', 'precoMin'), lin('Folga', 'folga'),
    [], ['Mão de obra no período', r2(u.moCen && u.moCen.total), 'dias', u.dias]]);

  add('OSs', [['OS', 'Finalizada', 'Cliente', 'Serviços', 'Peças estoque', 'Peças DIV', 'Custo estoque', 'Custo DIV', 'Desconto', 'Total', 'Situação']]
    .concat(u.per.oss.map(o => [o.os, rsDia(o.dia), o.cliente, r2(o.serv), r2(o.pecEst), r2(o.pecDiv), r2(o.custoEst), r2(o.custoDiv), r2(o.desconto || 0), r2(o.total), RS_SITUACAO[o.situacao][2]])));

  const itens = [['OS', 'Cliente', 'Tipo', 'Código', 'Descrição', 'Qtd', 'Venda', 'Desconto', 'Custo']];
  u.per.oss.forEach(o => o.itens.forEach(it => itens.push([o.os, o.cliente, it.tipo === 'serv' ? 'Serviço' : it.tipo === 'div' ? 'Peça DIV' : 'Peça estoque', it.codigo, it.descricao, it.qtd, r2(it.receita), r2(it.desconto || 0), r2(it.custo)])));

  const abcCab = [['Código', 'Descrição', 'Qtd', 'Receita', '%', 'Acumulado %', 'Classe']];
  const abcLinhas = g => rsClassificarABC(g).linhas.map(x => [x.codigo, x.descricao, r2(x.qtd), r2(x.receita), r4(x.pct / 100), r4(x.acc / 100), x.cls]);
  const pecasTodas = [], servicosTodos = [];
  u.per.oss.forEach(o => o.itens.forEach(it => (it.tipo === 'serv' ? servicosTodos : pecasTodas).push(it)));
  add('Curva ABC - Peças', abcCab.concat(abcLinhas(pecasTodas)));
  add('Curva ABC - Serviços', abcCab.concat(abcLinhas(servicosTodos)));
  add('Itens', itens);
  add('Abaixo do custo', [['OS', 'Cliente', 'Código', 'Descrição', 'Qtd', 'Venda', 'Custo', 'Sobra']].concat(u.rc.abaixo.map(a => [a.os, a.cliente, a.codigo, a.descricao, a.qtd, r2(a.receita), r2(a.custo), r2(a.sobra)])));
  if (u.serie) add('Evolução', [['Semana (segunda)', 'Até', 'OSs', 'Faturamento', 'Serviços', 'Peças estoque', 'Peças DIV', 'Margem serviços', 'Margem peças estoque', 'Margem global sem DIV', 'Peças DIV / peças']]
    .concat(u.serie.map(s => [rsDia(s.de), rsDia(s.ate), s.n, r2(s.fat), r2(s.serv), r2(s.pecEst), r2(s.pecDiv), r4(s.mServ), r4(s.mEst), r4(s.mGlobal), r4(s.divPct)])));
  add('Parâmetros', [['Parâmetro', 'Base', 'Cenário']].concat(RS_CAMPOS.filter(c => c.k && !c.meta).map(c => [c.l + ' (' + c.u + ')', RS.base[c.k], RS.cen[c.k]])));

  XLSX.writeFile(wb, 'Resultado_semanal_' + RS.de + '_a_' + RS.ate + '.xlsx');
}
