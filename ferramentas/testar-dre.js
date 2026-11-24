/**
 * Prova do DRE Gerencial (apps-script/dre.gs) — roda em Node, sem tocar no Google.
 *
 *   node ferramentas/testar-dre.js
 *
 * 1. CÁLCULO — as funções puras (meses, datas, código da natureza, despesas,
 *    receita, montagem da DRE) contra casos conferidos à mão.
 * 2. BACKEND — o dre.gs inteiro contra a planilha hostil (apps-script-falso.js),
 *    com as abas Titulos / RecTitulos no cabeçalho REAL dos outros scripts:
 *    acesso só admin, cache, "só leitura" na planilha financeira.
 * 3. ESCALA — 24 meses com volume acima do real, com tempo medido.
 *
 * Todos os números, clientes e NFs são inventados. Sai com código 1 se algo falhar.
 */
const path = require('path'), fs = require('fs');
const { criarAmbiente } = require('./apps-script-falso');
const RAIZ = path.join(__dirname, '..');
const GS = path.join(RAIZ, 'apps-script/dre.gs');

let ok = 0; const falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; }
  catch (e) { falhas.push(nome + '\n      ' + String(e && e.message ? e.message : e).split('\n').join('\n      ')); }
}
function igual(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'diferente') + ': esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }
function verdade(x, msg) { if (!x) throw new Error(msg || 'deveria ser verdadeiro'); }
function recusa(resp, trecho, msg) {
  if (resp.success) throw new Error((msg || 'deveria recusar') + ' — passou: ' + JSON.stringify(resp.data).slice(0, 160));
  if (trecho && String(resp.error).toLowerCase().indexOf(trecho.toLowerCase()) < 0) throw new Error((msg || 'erro') + ': esperava mensagem com "' + trecho + '", veio "' + resp.error + '"');
}
function aceita(resp, msg) { if (!resp.success) throw new Error((msg || 'deveria aceitar') + ' — erro: ' + resp.error); return resp.data; }
function lancaErro(fn, trecho) {
  try { fn(); } catch (e) { if (trecho && String(e.message).indexOf(trecho) < 0) throw new Error('erro diferente: ' + e.message); return; }
  throw new Error('deveria ter dado erro' + (trecho ? ' com "' + trecho + '"' : ''));
}

/**
 * Cabeçalhos REAIS, lidos dos outros scripts. Se alguém renomear uma coluna lá,
 * este teste quebra antes do DRE quebrar em produção.
 */
function cabecalhoDe(arquivo, constante) {
  const src = fs.readFileSync(path.join(RAIZ, 'apps-script', arquivo), 'utf8');
  const m = new RegExp('const ' + constante + ' = (\\[[\\s\\S]*?\\]);').exec(src);
  if (!m) throw new Error(constante + ' não encontrado em ' + arquivo);
  return new Function('return ' + m[1])();
}
const CAB_TITULOS = cabecalhoDe('contas-pagar.gs', 'CAB_TITULOS');
const CAB_REC = cabecalhoDe('contas-receber.gs', 'CAB_REC_TITULOS');
const CAB_PLANO = cabecalhoDe('contas-pagar.gs', 'CAB_PLANO');

/** Objeto → linha na ordem do cabeçalho (o resto fica vazio). */
const linhaDe = (cab, o) => cab.map(c => (o[c] === undefined ? '' : o[c]));

/** Escreve a aba como o getValues devolveria (Date fica Date, número fica número). */
function preencher(amb, nome, cab, objetos) {
  const sh = amb.folha(nome) || amb.criarFolha(nome);
  sh.v = [cab.slice()].concat(objetos.map(o => linhaDe(cab, o)));
  sh.f = sh.v.map(l => l.map(() => '@'));
  return sh;
}

// Funções puras chamadas direto (cada uma numa "execução" nova do Apps Script).
const PURO = criarAmbiente().carregar(GS);
const f = (nome, ...args) => PURO.executar(nome, ...args);
const D = (a, m, d) => new Date(a, m - 1, d);

// ─────────────────────────────────────────────────────────────────────────────
// Massa de outubro/setembro de 2026 (conferida à mão — ver os totais nos testes)
// ─────────────────────────────────────────────────────────────────────────────
const PLANO = [
  ['1', 'OPERACIONAL', '', 1, 'SINTETICA', 'OPERACIONAL', 'SIM', 1],
  ['1.01', 'Peças e Insumos', '1', 2, 'ANALITICA', 'OPERACIONAL', 'SIM', 2],
  ['1.01.01', 'Peças de motor', '1.01', 3, 'ANALITICA', 'OPERACIONAL', 'SIM', 3],
  ['1.02', 'Mão de obra terceirizada', '1', 2, 'ANALITICA', 'OPERACIONAL', 'SIM', 4],
  ['2', 'FIXO', '', 1, 'SINTETICA', 'FIXO', 'SIM', 10],
  ['2.02', 'Conta desativada', '2', 2, 'ANALITICA', 'FIXO', 'NAO', 12],
  ['2.01', 'Aluguel', '2', 2, 'ANALITICA', 'FIXO', 'SIM', 11],
  ['3.01', 'Tarifas bancárias', '3', 2, 'ANALITICA', 'FINANCEIRO', 'SIM', 20],
  ['3.02', 'Empréstimos', '3', 2, 'ANALITICA', 'FINANCEIRO', 'SIM', 21],
  ['3.06', 'Sócios / Aportes', '3', 2, 'ANALITICA', 'FINANCEIRO', 'SIM', 22],
  ['3.07', 'Juros de Operações Financeiras', '3', 2, 'ANALITICA', 'FINANCEIRO', 'SIM', 23],
  ['4.01', 'Máquinas e equipamentos', '4', 2, 'ANALITICA', 'CAPEX', 'SIM', 30],
  ['9.99', 'A Classificar', '9', 2, 'ANALITICA', 'A CLASSIFICAR', 'SIM', 99]
].map(l => { const o = {}; CAB_PLANO.forEach((c, i) => { o[c] = l[i]; }); return o; });

const T = (id, emissao, cod, nome, valor, status, comp) =>
  ({ id, origem: 'MANUAL', data_emissao: emissao, natureza_codigo: cod, natureza: nome, valor_total: valor, status, competencia: comp || '' });
const TITULOS = [
  T('T-1', D(2026, 10, 5), '1.01', 'A Classificar', 1000, 'PAGO'),              // código manda, não o nome
  T('T-2', '2026-10-10', '1.01.01', 'Peças de motor', '1.234,56', 'ABERTO'),     // 3º nível soma em 1.01; valor pt-BR
  T('T-3', '2026-10-11', '2.01', 'Aluguel', 3000, 'CANCELADO'),                  // fora
  T('T-4', '20261-10-13', '2.01', 'Aluguel', 2000, 'PARCIAL', '2026-10'),        // emissão errada → competência
  T('T-5', '2026-10-15', '3.02', 'Empréstimos', 9000, 'ABERTO'),                 // informativo
  T('T-6', '2026-10-15', '3.06', 'Sócios / Aportes', 5000, 'PAGO'),              // informativo
  T('T-7', '2026-10-16', '3.07', 'Juros', 300, 'PAGO'),
  T('T-8', '2026-10-16', '3.01', 'Tarifas', 100, 'PAGO'),
  T('T-9', '2026-10-20', '4.01', 'Máquinas', 7000, 'ABERTO'),                    // CAPEX informativo
  T('T-10', '2026-10-20', '', '', 50, 'ABERTO'),                                 // sem código → 9.99
  T('T-11', '2026-10-21', '5.01', 'Conta nova fora do plano', 80, 'ABERTO'),     // aparece mesmo fora do plano
  T('T-12', '15/09/2026', '1.02', 'Terceiros', 400, 'PAGO'),                     // setembro, dd/mm/aaaa
  T('T-13', 'xx', '1.02', 'Terceiros', 999, 'ABERTO', ''),                       // sem mês nenhum → aviso
  T('', '2026-10-21', '1.02', 'linha sem id', 777, 'ABERTO')                     // lixo: ignorada
];

const R = (id, emissao, nf, tipo, cli, valor, status, parcela, total, extra) => Object.assign(
  { id, origem: 'GENESIS', data_emissao: emissao, numero_nf: nf, tipo_nf: tipo, cliente: 'Cliente ' + cli, cliente_cod: cli,
    num_os: 'OS-' + nf, valor_total: valor, status, parcela, total_parcelas: total, competencia: '2026-11' }, extra || {});
const REC = [
  R('R-1', D(2026, 10, 2), '539', 'SERVICO', '10', 46767, 'ABERTO', 1, 1),       // contrato ("0539" na lista)
  R('R-2', '2026-10-02', '540', 'SERVICO', '10', 2000, 'RECEBIDO', 1, 1),        // contrato com cliente certo
  R('R-3', '2026-10-02', '541', 'SERVICO', '99', 1500, 'ABERTO', 1, 1),          // lista pede cliente 10 → Spot
  R('R-4', '2026-10-03', '480', 'SERVICO', '20', 4880, 'ABERTO', 1, 5),          // parcelada incompleta → 24.400
  R('R-5', '2026-10-03', '481', 'SERVICO', '21', 1000, 'ABERTO', 1, 3),
  R('R-6', '2026-10-03', '481', 'SERVICO', '21', 1000, 'ABERTO', 2, 3),
  R('R-7', '2026-10-03', '481', 'SERVICO', '21', 1000, 'PARCIAL', 3, 3),         // completa → 3.000, sem estimativa
  R('R-8', '2026-10-04', '482', 'SERVICO', '22', 500, 'ABERTO', 1, 2),
  R('R-9', '2026-10-04', '482', 'SERVICO', '22', 500, 'CANCELADO', 2, 2),        // cancelada não é "faltante"
  R('R-10', '2026-10-04', '483', 'PECA', '23', 900, 'CANCELADO', 1, 1),          // NF toda cancelada → fora
  R('R-11', '2026-10-05', '372', 'PECA', '30', 700, 'ABERTO', 1, 1),             // mesmo número…
  R('R-12', '2026-10-05', '372', '', '30', 300, 'ABERTO', 1, 1, { natureza_operacao: 'PRESTAÇÃO DE SERVIÇO' }), // …é outra NF
  R('R-13', '20261-10-13', '600', 'PECA', '31', 150, 'ABERTO', 1, 1, { competencia: '2026-10' }), // emissão errada
  R('R-14', '2026-10-06', '', '', '32', 111, 'ABERTO', 1, 1),                    // sem NF → aviso
  R('R-15', '2026-09-30', '300', 'PECA', '33', 2000, 'RECEBIDO', 1, 1),          // setembro
  R('', '2026-10-06', '999', 'PECA', '34', 5555, 'ABERTO', 1, 1)                 // lixo: ignorada
];
const CONTRATOS = [['2026-10', '0539', 'SERVICO', ''], ['2026-10', '540', 'SERVICO', '10'], ['2026-10', '541', 'SERVICO', '10']];

const valorDe = (dre, id, mes) => { const l = dre.linhas.find(x => x.id === id); if (!l) throw new Error('linha ' + id + ' não veio'); return l.valores[dre.meses.indexOf(mes)]; };

// ═════════════════════════════════════════════════════════════════════════════
// 1. CÁLCULO
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n— CÁLCULO (funções puras do dre.gs) —');

teste('listaMeses: intervalo, virada de ano, limites', () => {
  igual(f('listaMeses', '2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  igual(f('listaMeses', '2026-10', '2026-10'), ['2026-10']);
  igual(f('listaMeses', '2025-01', '2026-12').length, 24);
  lancaErro(() => f('listaMeses', '2024-12', '2026-12'), 'No máximo 24');
  lancaErro(() => f('listaMeses', '2026-10', '2026-09'), 'depois do final');
  lancaErro(() => f('listaMeses', '10/2026', '2026-12'), 'AAAA-MM');
});

teste('mesDe: emissão válida vale; emissão errada cai na competência', () => {
  igual(f('mesDe', D(2026, 10, 31), '2026-11'), '2026-10');
  igual(f('mesDe', '2026-10-13', ''), '2026-10');
  igual(f('mesDe', '2026-10-13T03:00:00.000Z', ''), '2026-10');
  igual(f('mesDe', '13/10/2026', ''), '2026-10');
  igual(f('mesDe', '20261-10-13', '2026-10'), '2026-10');
  igual(f('mesDe', D(1899, 12, 30), '2026-10'), '2026-10', 'data zero da planilha');
  igual(f('mesDe', '', D(2026, 10, 1)), '2026-10', 'competência que a planilha virou data');
  igual(f('mesDe', '', '10/2026'), '2026-10');
  igual(f('mesDe', '2026-13-01', ''), '', 'mês 13');
  igual(f('mesDe', 'xx', ''), '');
});

teste('linhaDaNatureza / grupoDaLinha: o código manda', () => {
  igual(f('linhaDaNatureza', '1.01.03'), '1.01');
  igual(f('linhaDaNatureza', ' 2.11 '), '2.11');
  igual(f('linhaDaNatureza', ''), '9.99');
  igual(f('linhaDaNatureza', 2.1), '2.10', 'número da planilha pt-BR');
  igual(f('linhaDaNatureza', 1.01), '1.01');
  igual(['1.05', '2.11', '3.01', '3.07', '3.02', '3.06', '4.01', '9.99', '5.01'].map(c => f('grupoDaLinha', c)),
    ['CUSTO_OP', 'FIXA', 'FIN', 'FIN', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO']);
});

teste('normalizarPlano: só contas de 2 níveis, sem duplicar, ativo respeitado', () => {
  const p = f('normalizarPlano', CAB_PLANO, PLANO.map(o => linhaDe(CAB_PLANO, o)).concat([['1.01', 'duplicada', '1', 2, '', '', 'SIM', 5], ['', '', '', '', '', '', '', '']]));
  igual(p.map(c => c.codigo), ['1.01', '1.02', '2.02', '2.01', '3.01', '3.02', '3.06', '3.07', '4.01', '9.99']);
  igual(p.find(c => c.codigo === '1.01').nome, 'Peças e Insumos');
  igual(p.find(c => c.codigo === '2.02').ativo, false);
});

const DESP = () => f('agregarDespesas', CAB_TITULOS, TITULOS.map(o => linhaDe(CAB_TITULOS, o)));

teste('despesas: cancelado fora, 1.01 "A Classificar" soma em 1.01, emissão errada cai na competência', () => {
  const d = DESP();
  igual(d.por_mes['2026-10']['1.01'], 2234.56, '1.01 = 1.000 + 1.234,56');
  igual(d.por_mes['2026-10']['2.01'], 2000, 'só o PARCIAL; o CANCELADO de 3.000 fica fora');
  igual(d.por_mes['2026-10']['9.99'], 50);
  igual(d.por_mes['2026-10']['5.01'], 80);
  igual(d.por_mes['2026-09'], { '1.02': 400 });
  verdade(!('1.02' in d.por_mes['2026-10']), 'linha sem id entrou');
  igual(d.avisos, { sem_mes: 1, sem_mes_valor: 999, emissao_corrigida: 1 });
});

teste('despesas: falta coluna obrigatória → erro claro', () => {
  lancaErro(() => f('agregarDespesas', ['id', 'valor_total'], []), 'natureza_codigo');
});

const RECEITA = () => f('agregarReceita', CAB_REC, REC.map(o => linhaDe(CAB_REC, o)),
  CONTRATOS.map(c => ({ competencia: c[0], numero_nf: c[1], tipo_nf: c[2], cliente_cod: c[3] })));

teste('receita: contrato pela lista (com zero à esquerda e com cliente)', () => {
  const r = RECEITA();
  igual(r.por_mes['2026-10']['R.1'], 48767, '539 + 540');
  igual(r.por_mes['2026-10'].nfs['R.1'], 2);
});

teste('receita: NF parcelada incompleta vale o total estimado; completa e cancelada não estimam', () => {
  const r = RECEITA();
  igual(r.estimadas.length, 1, 'só a 480');
  const e = r.estimadas[0];
  igual([e.numero_nf, e.lancado, e.estimado, e.parcelas_lancadas, e.total_parcelas], ['480', 4880, 24400, 1, 5]);
});

teste('receita: NF de peça e de serviço com o mesmo número são notas diferentes', () => {
  const r = RECEITA();
  // R.2 = 541 (1.500) + 480 (24.400) + 481 (3.000) + 482 (500) + 372 serviço (300)
  igual(r.por_mes['2026-10']['R.2'], 29700);
  // R.3 = 372 peça (700) + 600 (150, emissão errada → competência); 483 cancelada fora
  igual(r.por_mes['2026-10']['R.3'], 850);
  igual(r.por_mes['2026-10'].nfs, { 'R.1': 2, 'R.2': 5, 'R.3': 2 });
  igual(r.por_mes['2026-09']['R.3'], 2000);
});

teste('receita: lançamento sem número de NF vira aviso, não receita', () => {
  igual(RECEITA().avisos, { sem_nf: 1, sem_nf_valor: 111, sem_mes: 0, sem_mes_valor: 0, sem_tipo: 0 });
});

teste('receita: mesma NF repetida para clientes diferentes não se mistura', () => {
  const cab = ['id', 'data_emissao', 'numero_nf', 'tipo_nf', 'cliente_cod', 'valor_total', 'status', 'parcela', 'total_parcelas'];
  const r = f('agregarReceita', cab, [['a', '2026-10-01', '10', 'PECA', 'A', 100, 'ABERTO', 1, 2], ['b', '2026-10-01', '10', 'PECA', 'B', 50, 'ABERTO', 2, 2]], []);
  igual(r.estimadas.map(e => e.estimado), [200, 100], 'cada uma estimada pela sua parcela');
});

const BASE = () => ({ gerado_em: 'agora', plano: f('normalizarPlano', CAB_PLANO, PLANO.map(o => linhaDe(CAB_PLANO, o))), despesas: DESP(), receita: RECEITA() });

teste('montarDre: cascata Receita → Margem → Res. Operacional → Resultado (conferida à mão)', () => {
  const dre = f('montarDre', BASE(), ['2026-09', '2026-10']);
  const out = m => ['RECEITA', 'CUSTO_OP', 'MARGEM', 'FIXA', 'RES_OP', 'FIN', 'RESULTADO', 'INFO'].map(id => valorDe(dre, id, m));
  igual(out('2026-10'), [79317, 2234.56, 77082.44, 2000, 75082.44, 400, 74682.44, 21130]);
  igual(out('2026-09'), [2000, 400, 1600, 0, 1600, 0, 1600, 0]);
});

teste('montarDre: 3.02 e 3.06 fora do resultado; CAPEX, 9.99 e conta nova no informativo', () => {
  const dre = f('montarDre', BASE(), ['2026-10']);
  const grupo = id => dre.linhas.find(l => l.id === id).grupo;
  igual(['3.01', '3.07', '3.02', '3.06', '4.01', '9.99', '5.01'].map(grupo), ['FIN', 'FIN', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO']);
  igual(valorDe(dre, 'FIN', '2026-10'), 400, 'só 3.01 + 3.07');
  igual(dre.linhas.find(l => l.id === '5.01').nome, 'Conta nova fora do plano');
});

teste('montarDre: estrutura estável (conta do plano zerada aparece; inativa sem valor some) e na ordem do plano', () => {
  const dre = f('montarDre', BASE(), ['2026-10']);
  const ids = dre.linhas.map(l => l.id);
  igual(ids, ['RECEITA', 'R.1', 'R.2', 'R.3', 'CUSTO_OP', '1.01', '1.02', 'MARGEM', 'FIXA', '2.01', 'RES_OP',
    'FIN', '3.01', '3.07', 'RESULTADO', 'INFO', '3.02', '3.06', '4.01', '9.99', '5.01']);
  igual(valorDe(dre, '1.02', '2026-10'), 0);
});

teste('montarDre: avisos por mês (sem contrato, NF estimada) e só as estimadas do período', () => {
  const dre = f('montarDre', BASE(), ['2026-09', '2026-10']);
  igual(dre.avisos['2026-09'], undefined, 'antes do início do contrato (out/2026) não há aviso de "sem contrato"');
  const b11 = BASE();
  b11.receita.por_mes['2026-11'] = { 'R.1': 0, 'R.2': 100, 'R.3': 0, nfs: { 'R.1': 0, 'R.2': 1, 'R.3': 0 } };
  igual(f('montarDre', b11, ['2026-11']).avisos['2026-11'], ['Nenhuma NF de contrato identificada neste mês: tudo está como Spot.']);
  igual(dre.avisos['2026-10'].length, 1);
  verdade(/estimado/.test(dre.avisos['2026-10'][0]));
  igual(f('montarDre', BASE(), ['2026-09']).estimadas, []);
  igual(dre.avisos_gerais.receita.sem_nf, 1);
});

teste('montarDre: mês sem nenhum lançamento sai zerado, sem quebrar', () => {
  const dre = f('montarDre', BASE(), ['2027-01']);
  verdade(dre.linhas.every(l => l.valores.length === 1 && l.valores[0] === 0));
});

const CONTR = CONTRATOS.map(c => ({ competencia: c[0], numero_nf: c[1], tipo_nf: c[2], cliente_cod: c[3] }));
const DET_REC = (mes, cl) => f('detalheReceita', CAB_REC, REC.map(o => linhaDe(CAB_REC, o)), CONTR, mes, cl);
const DET_DESP = (mes, ln) => f('detalheDespesas', CAB_TITULOS, TITULOS.map(o => linhaDe(CAB_TITULOS, o)), mes, ln);

teste('detalhe receita: cada classe soma EXATAMENTE o valor da linha da DRE (e marca a estimada)', () => {
  const dre = f('montarDre', BASE(), ['2026-10']);
  ['R.1', 'R.2', 'R.3'].forEach(c => igual(DET_REC('2026-10', c).total, valorDe(dre, c, '2026-10'), 'drill-down de ' + c + ' não fecha com a DRE'));
  const r2 = DET_REC('2026-10', 'R.2');
  igual(r2.quantidade, 5);
  igual(r2.itens[0].numero_nf, '480', 'maior primeiro');
  igual([r2.itens[0].estimada, r2.itens[0].parcelas, r2.itens[0].valor], [true, '1/5', 24400]);
  igual(r2.itens.filter(i => i.estimada).length, 1);
  igual(DET_REC('2026-10', 'R.1').itens.map(i => i.numero_nf), ['539', '540']);
  igual(DET_REC('2027-01', 'R.2'), { total: 0, quantidade: 0, cortado: false, itens: [] });
});

teste('detalhe despesa: cada linha soma EXATAMENTE o valor da DRE (cancelado fora, 3º nível junto)', () => {
  const dre = f('montarDre', BASE(), ['2026-10']);
  ['1.01', '2.01', '3.02', '9.99', '5.01'].forEach(c => igual(DET_DESP('2026-10', c).total, valorDe(dre, c, '2026-10'), 'drill-down de ' + c));
  const d = DET_DESP('2026-10', '1.01');
  igual(d.itens.map(i => i.id), ['T-2', 'T-1'], 'T-2 (1.234,56) vem antes de T-1 (1.000)');
  igual(DET_DESP('2026-10', '2.01').itens.map(i => i.id), ['T-4'], 'o cancelado não aparece; a emissão errada entra pela competência');
});

teste('detalhe: corta em 500 itens mas o total é o real', () => {
  const linhas = Array.from({ length: 600 }, (_, i) => linhaDe(CAB_TITULOS, T('T-' + i, '2026-10-05', '1.01', 'x', 10, 'ABERTO')));
  const d = f('detalheDespesas', CAB_TITULOS, linhas, '2026-10', '1.01');
  igual([d.quantidade, d.itens.length, d.cortado, d.total], [600, 500, true, 6000]);
});

teste('cache em pedaços: objeto acima de 100 KB vai e volta inteiro', () => {
  const mem = {};
  const cache = {
    get: k => (mem[k] === undefined ? null : mem[k]),
    putAll: o => Object.keys(o).forEach(k => { if (o[k].length > 100 * 1024) throw new Error('Argument too large'); mem[k] = o[k]; }),
    getAll: ks => { const o = {}; ks.forEach(k => { if (mem[k] !== undefined) o[k] = mem[k]; }); return o; }
  };
  const grande = { lista: Array.from({ length: 20000 }, (_, i) => ({ i, t: 'título ' + i })) };
  f('cacheGravar', cache, 'x', grande, 60);
  verdade(Number(mem.x) >= 3, 'deveria fatiar em vários pedaços, veio ' + mem.x);
  igual(f('cacheLer', cache, 'x'), grande);
  delete mem.x_1;
  igual(f('cacheLer', cache, 'x'), null, 'pedaço perdido → lê de novo da planilha');
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. BACKEND
// ═════════════════════════════════════════════════════════════════════════════
console.log('— BACKEND (dre.gs inteiro, planilha hostil) —');

function novoAmbiente() {
  const amb = criarAmbiente().carregar(GS);
  amb.sessoes['tok-admin'] = { usuario: 'pedro', nome: 'Pedro', papel: 'admin' };
  amb.sessoes['tok-comum'] = { usuario: 'joao', nome: 'João', papel: 'comum' };
  preencher(amb, 'PlanoContas', CAB_PLANO, PLANO);
  preencher(amb, 'Titulos', CAB_TITULOS, TITULOS);
  preencher(amb, 'RecTitulos', CAB_REC, REC);
  amb.executar('instalar');
  amb.folha('DreContratos').getRange(2, 1, CONTRATOS.length, 4).setValues(CONTRATOS);
  return amb;
}
const pedir = (amb, extra, token) => amb.post(Object.assign({ action: 'resultado', token: token === undefined ? 'tok-admin' : token, de: '2026-09', ate: '2026-10' }, extra || {}));

teste('acesso: sem sessão, sessão inválida e não-admin são barrados; GET não entrega dado', () => {
  const amb = novoAmbiente();
  recusa(pedir(amb, {}, ''), 'Sessão expirada');
  recusa(pedir(amb, {}, 'tok-falso'), 'inválida');
  recusa(pedir(amb, {}, 'tok-comum'), 'restrito a administradores');
  recusa(amb.get({ action: 'resultado' }), 'POST');
  igual(amb.get({ action: 'ping' }).success, true);
  recusa(amb.post({ action: 'apagar_tudo', token: 'tok-admin' }), 'desconhecida');
});

teste('resultado: admin recebe a DRE de outubro com os mesmos totais do cálculo', () => {
  const amb = novoAmbiente();
  const dre = aceita(pedir(amb));
  igual(dre.meses, ['2026-09', '2026-10']);
  igual(valorDe(dre, 'RECEITA', '2026-10'), 79317);
  igual(valorDe(dre, 'R.1', '2026-10'), 48767, 'lista de contratos lida da aba DreContratos');
  igual(valorDe(dre, 'RESULTADO', '2026-10'), 74682.44);
  igual(dre.estimadas.map(e => e.numero_nf), ['480']);
});

teste('resultado: período inválido ou maior que 24 meses é recusado', () => {
  const amb = novoAmbiente();
  recusa(pedir(amb, { de: '2024-01', ate: '2026-12' }), '24 meses');
  recusa(pedir(amb, { de: '', ate: '' }), 'AAAA-MM');
});

teste('cache: 2ª consulta não abre a planilha; "forcar" relê e enxerga lançamento novo', () => {
  const amb = novoAmbiente();
  aceita(pedir(amb));
  const antes = amb.chamadasPlanilha;
  const outroPeriodo = aceita(pedir(amb, { de: '2026-10', ate: '2026-10' }));
  igual(amb.chamadasPlanilha, antes, 'leu a planilha mesmo com cache');
  igual(valorDe(outroPeriodo, 'RECEITA', '2026-10'), 79317);

  const sh = amb.folha('Titulos');
  sh.v.push(linhaDe(CAB_TITULOS, T('T-99', '2026-10-30', '2.01', 'Aluguel', 1000, 'ABERTO')));
  sh.f.push(sh.v[sh.v.length - 1].map(() => '@'));
  igual(valorDe(aceita(pedir(amb)), 'FIXA', '2026-10'), 2000, 'dentro dos 10 min vale o cache');
  igual(valorDe(aceita(pedir(amb, { forcar: true })), 'FIXA', '2026-10'), 3000);
});

teste('só leitura: a planilha financeira sai intacta; abas do DRE sem célula corrompida', () => {
  const amb = novoAmbiente();
  const foto = () => JSON.stringify(['PlanoContas', 'Titulos', 'RecTitulos'].map(n => amb.folha(n).v));
  const antes = foto();
  aceita(pedir(amb, { forcar: true }));
  igual(foto(), antes, 'o DRE alterou a planilha financeira');
  igual(amb.celulasRuins(), [], 'competência "2026-10" ou NF "0539" corrompida na DreContratos');
});

teste('detalhe (backend): só admin, entrada validada, planilha financeira intacta', () => {
  const amb = novoAmbiente();
  const det = (extra, token) => amb.post(Object.assign({ action: 'detalhe', token: token === undefined ? 'tok-admin' : token, mes: '2026-10', linha: 'R.2' }, extra || {}));
  recusa(det({}, ''), 'Sessão expirada');
  recusa(det({}, 'tok-comum'), 'restrito a administradores');
  recusa(det({ mes: '10/2026' }), 'Mês inválido');
  recusa(det({ linha: "1.01'; DROP" }), 'Linha inválida');
  recusa(det({ linha: 'RECEITA' }), 'Linha inválida');
  const foto = () => JSON.stringify(['PlanoContas', 'Titulos', 'RecTitulos'].map(n => amb.folha(n).v));
  const antes = foto();
  const r = aceita(det({}));
  igual([r.tipo, r.quantidade, r.total], ['receita', 5, 29700]);
  const d = aceita(det({ linha: '2.01' }));
  igual([d.tipo, d.quantidade, d.total], ['despesa', 1, 2000]);
  igual(foto(), antes, 'o detalhe alterou a planilha financeira');
});

// ─── Classe da NF: contrato automático pela descrição + correção manual ──────
const classe = (amb, extra, token) => amb.post(Object.assign({ action: 'classe_definir', token: token === undefined ? 'tok-admin' : token,
  competencia: '2026-10', numero_nf: '653', tipo_nf: 'SERVICO', cliente_cod: '53', classe: 'SPOT' }, extra || {}));

// NFs novas de outubro (inventadas) e as descrições dos serviços das OSs delas
const REC_AUTO = [
  R('R-16', '2026-10-07', '650', 'SERVICO', '50', 3000, 'ABERTO', 1, 1),   // "Contrato Elétrica Guarulhos" → R.1
  R('R-17', '2026-10-07', '651', 'SERVICO', '51', 4000, 'ABERTO', 1, 1),   // serviço comum → R.2
  R('R-18', '2026-10-07', '652', 'PECA', '52', 800, 'ABERTO', 1, 1),       // peça nunca é contrato → R.3
  R('R-19', '2026-10-07', '653', 'SERVICO', '53', 2500, 'ABERTO', 1, 1)    // "contrato empurrada guarulhos" → R.1
];
const CAB_ITENS = ['Numero_OS', 'Codigo_Produto', 'Descricao_Servico', 'Preco_Custo'];
const ITENS = [
  { Numero_OS: 'OS-650', Codigo_Produto: 'A1', Descricao_Servico: 'Contrato Elétrica Guarulhos', Preco_Custo: '10' },
  { Numero_OS: 'OS-650', Codigo_Produto: 'A2', Descricao_Servico: 'Contrato Elétrica Guarulhos', Preco_Custo: '20' },   // repetida: não duplica
  { Numero_OS: 'OS-651', Codigo_Produto: 'B1', Descricao_Servico: 'Revisão geral', Preco_Custo: '10' },
  { Numero_OS: 'OS-652', Codigo_Produto: 'C1', Descricao_Servico: 'CONTRATO de peça', Preco_Custo: '10' },
  { Numero_OS: 'OS-653', Codigo_Produto: 'D1', Descricao_Servico: 'Troca de filtro', Preco_Custo: '10' },
  { Numero_OS: 'OS-653', Codigo_Produto: 'D2', Descricao_Servico: 'contrato empurrada guarulhos', Preco_Custo: '10' }
];
/** Ambiente com as NFs novas e a planilha Resultado Semanal "ligada" (no simulador é a mesma planilha). */
function ambienteAuto(ligado) {
  const amb = novoAmbiente();
  const rec = amb.folha('RecTitulos');
  REC_AUTO.forEach(o => { rec.v.push(linhaDe(CAB_REC, o)); rec.f.push(CAB_REC.map(() => '@')); });
  preencher(amb, 'Itens', CAB_ITENS, ITENS);
  if (ligado !== false) amb.props.ITENS_PLANILHA_ID = 'planilha-resultado-semanal';
  return amb;
}
const R1_BASE = 48767;   // 539 + 540 (correção manual que já está na aba DreContratos)
const nContratos = amb => amb.folha('DreContratos').v.slice(1).filter(l => l.some(x => x !== '')).length;

teste('servicosPorOs: acha "contrato" sem ligar para acento/maiúscula, acumula e não repete descrição', () => {
  const r = f('servicosPorOs', CAB_ITENS, ITENS.map(o => linhaDe(CAB_ITENS, o)));
  igual(r.status.ok, true);
  igual(r.mapa['OS-650'], { contrato: true, descricoes: ['Contrato Elétrica Guarulhos'] });
  igual(r.mapa['OS-651'].contrato, false);
  igual(r.mapa['OS-652'].contrato, true);
  igual(r.mapa['OS-653'].contrato, true, 'um dos serviços da OS basta');
  igual(r.mapa['OS-653'].descricoes.length, 2);
  const acento = f('servicosPorOs', ['Número OS', 'Descrição Serviço'], [[4638.0, 'CONTRATÓ x'], ['', 'sem os'], [7, '']]);
  igual(Object.keys(acento.mapa), ['4638'], 'OS vazia ou descrição vazia ficam fora; "4638" numérico vira texto');
  igual(acento.mapa['4638'].contrato, true, 'acento e caixa alta não atrapalham');
  igual(f('servicosPorOs', ['a', 'b'], [[1, 2]]).status, { ok: false, motivo: 'sem_colunas' });
});

teste('classe automática: NF de serviço com "contrato" na descrição vira R.1; peça e serviço comum não', () => {
  const amb = ambienteAuto();
  const dre = aceita(pedir(amb));
  const sem = aceita(pedir(novoAmbiente()));
  igual(valorDe(dre, 'R.1', '2026-10'), R1_BASE + 3000 + 2500, '650 e 653 entraram sozinhas');
  igual(valorDe(dre, 'R.2', '2026-10'), valorDe(sem, 'R.2', '2026-10') + 4000, 'só a 651 é Spot de serviço');
  igual(valorDe(dre, 'R.3', '2026-10'), valorDe(sem, 'R.3', '2026-10') + 800, 'peça com "contrato" continua R.3');
  igual(dre.servicos, { ok: true, os: 4 });
});

teste('classe automática: sem a planilha ligada (ou com colunas trocadas) o DRE funciona e a tela é avisada', () => {
  const amb = ambienteAuto(false);
  const dre = aceita(pedir(amb));
  igual(valorDe(dre, 'R.1', '2026-10'), R1_BASE, 'só valem as correções manuais');
  igual(dre.servicos, { ok: false, motivo: 'sem_planilha' });
  amb.props.ITENS_PLANILHA_ID = 'x';
  amb.folha('Itens').v = [['Coluna', 'Outra'], ['a', 'b']];
  igual(aceita(pedir(amb, { forcar: true })).servicos, { ok: false, motivo: 'sem_colunas' });
});

teste('detalhe R.1: mostra a descrição do serviço e de onde veio a classe', () => {
  const amb = ambienteAuto();
  const d = aceita(amb.post({ action: 'detalhe', token: 'tok-admin', mes: '2026-10', linha: 'R.1' }));
  igual(d.total, R1_BASE + 5500);
  const por = nf => d.itens.find(i => i.numero_nf === nf);
  igual([por('650').origem_classe, por('650').auto_contrato], ['descricao', true]);
  verdade(/Contrato Elétrica Guarulhos/.test(por('650').descricao));
  igual(por('653').descricao, 'Troca de filtro · contrato empurrada guarulhos');
  igual([por('539').origem_classe, por('539').auto_contrato], ['manual', false], '539 só está na lista manual');
  const r2 = aceita(amb.post({ action: 'detalhe', token: 'tok-admin', mes: '2026-10', linha: 'R.2' }));
  igual(r2.itens.find(i => i.numero_nf === '651').origem_classe, 'padrao');
});

teste('classe_definir SPOT: tira uma NF automática de contrato; AUTO devolve; repetir não duplica', () => {
  const amb = ambienteAuto();
  igual(valorDe(aceita(pedir(amb)), 'R.1', '2026-10'), R1_BASE + 5500);   // enche o cache
  const antes = nContratos(amb);
  const r = aceita(classe(amb));
  igual([r.classe, r.alterado], ['SPOT', 1]);
  igual(nContratos(amb), antes + 1);
  igual(valorDe(aceita(pedir(amb)), 'R.1', '2026-10'), R1_BASE + 3000, '653 foi para Spot (sem "forcar": o cache foi limpo)');
  igual(aceita(classe(amb)).alterado, 0, 'segunda vez não duplica');
  const ult = amb.folha('DreContratos').v.filter(l => l.some(x => x !== '')).slice(-1)[0];
  igual(ult, ['2026-10', '653', 'SERVICO', '53', 'SPOT']);
  igual(amb.celulasRuins(), []);
  igual(aceita(classe(amb, { classe: 'AUTO' })).alterado, 1);
  igual(valorDe(aceita(pedir(amb)), 'R.1', '2026-10'), R1_BASE + 5500, 'voltou a seguir a descrição');
  igual(nContratos(amb), antes, 'a correção saiu da aba');
  igual(aceita(classe(amb, { classe: 'AUTO' })).alterado, 0);
});

teste('classe_definir CONTRATO: força uma NF sem descrição; linha antiga (4 colunas) vale como contrato', () => {
  const amb = ambienteAuto();
  aceita(pedir(amb));
  aceita(classe(amb, { numero_nf: '651', cliente_cod: '51', classe: 'CONTRATO' }));
  igual(valorDe(aceita(pedir(amb)), 'R.1', '2026-10'), R1_BASE + 5500 + 4000);
  const ult = amb.folha('DreContratos').v.filter(l => l.some(x => x !== '')).slice(-1)[0];
  igual(ult, ['2026-10', '651', 'SERVICO', '51', 'CONTRATO']);
  // 539 é uma linha antiga, sem a coluna "regra": segue contrato; dá para tirá-la de contrato
  igual(aceita(classe(amb, { numero_nf: '539', cliente_cod: '10', classe: 'SPOT' })).alterado, 2, 'troca a linha antiga pela nova (apaga + grava)');
  igual(valorDe(aceita(pedir(amb)), 'R.1', '2026-10'), R1_BASE + 5500 + 4000 - 46767);
});

teste('classe_definir: planilha antiga sem o cabeçalho "regra" ganha a coluna na primeira correção', () => {
  const amb = ambienteAuto();
  amb.folha('DreContratos').v[0][4] = '';
  aceita(classe(amb));
  igual(amb.folha('DreContratos').v[0].slice(0, 5), ['competencia', 'numero_nf', 'tipo_nf', 'cliente_cod', 'regra']);
});

teste('classe_definir: só admin; entrada hostil recusada; log gravado; planilha financeira intacta', () => {
  const amb = ambienteAuto();
  const n = nContratos(amb);
  recusa(classe(amb, {}, ''), 'Sessão expirada');
  recusa(classe(amb, {}, 'tok-falso'), 'inválida');
  recusa(classe(amb, {}, 'tok-comum'), 'restrito a administradores');
  recusa(classe(amb, { competencia: '10/2026' }), 'Competência');
  recusa(classe(amb, { numero_nf: '=1+1' }), 'Número de NF');
  recusa(classe(amb, { numero_nf: '-5' }), 'Número de NF');
  recusa(classe(amb, { numero_nf: '' }), 'Número de NF');
  recusa(classe(amb, { tipo_nf: 'OUTRO' }), 'Tipo');
  recusa(classe(amb, { cliente_cod: '=HYPERLINK("x")' }), 'cliente');
  recusa(classe(amb, { classe: '=SPOT' }), 'Classe');
  recusa(classe(amb, { classe: '' }), 'Classe');
  igual(nContratos(amb), n, 'entrada recusada não pode gravar nada');
  recusa(amb.post({ action: 'contrato_marcar', token: 'tok-admin' }), 'desconhecida');   // ação antiga foi removida
  const foto = () => JSON.stringify(['PlanoContas', 'Titulos', 'RecTitulos', 'Itens'].map(x => amb.folha(x).v));
  const antes = foto();
  aceita(classe(amb));
  aceita(classe(amb, { classe: 'AUTO' }));
  igual(foto(), antes, 'classe_definir alterou a planilha financeira ou a do Resultado Semanal');
  const log = amb.folha('Log').v.slice(1).filter(l => l.some(x => x !== ''));
  igual(log.map(l => [l[1], l[2]]), [['pedro', 'classe_spot'], ['pedro', 'classe_auto']]);
  igual(amb.celulasRuins(), []);
  igual(amb.travas, 0, 'trava não foi liberada');
});

// ─── Budget (Etapa 3) ────────────────────────────────────────────────────────
const bGravar = (amb, extra, token) => amb.post(Object.assign({ action: 'budget_gravar', token: token === undefined ? 'tok-admin' : token,
  competencia: '2026-10', itens: [{ linha: 'R.1', valor: 190000 }, { linha: '2.01', valor: '1234,5' }] }, extra || {}));
const bLer = (amb, extra, token) => amb.post(Object.assign({ action: 'budget_ler', token: token === undefined ? 'tok-admin' : token, de: '2026-09', ate: '2026-11' }, extra || {}));
const cheias = (amb, nome) => amb.folha(nome).v.filter(l => l.some(x => x !== ''));

teste('budget: só admin; entrada hostil recusada sem gravar nada', () => {
  const amb = novoAmbiente();
  recusa(bGravar(amb, {}, ''), 'Sessão expirada');
  recusa(bGravar(amb, {}, 'tok-comum'), 'restrito a administradores');
  recusa(bLer(amb, {}, 'tok-comum'), 'restrito a administradores');
  recusa(bGravar(amb, { competencia: '10/2026' }), 'Competência');
  recusa(bGravar(amb, { itens: 'x' }), 'itens');
  recusa(bGravar(amb, { itens: [{ linha: 'RECEITA', valor: 1 }] }), 'Linha inválida');
  recusa(bGravar(amb, { itens: [{ linha: '=1+1', valor: 1 }] }), 'Linha inválida');
  recusa(bGravar(amb, { itens: [{ linha: 'R.1', valor: '=1+1' }] }), 'Valor inválido');
  recusa(bGravar(amb, { itens: [{ linha: 'R.1', valor: -5 }] }), 'Valor inválido');
  recusa(bGravar(amb, { itens: [{ linha: 'R.1', valor: 1 }, { linha: 'R.1', valor: 2 }] }), 'repetida');
  recusa(bLer(amb, { de: '2024-01', ate: '2026-12' }), '24 meses');
  igual(cheias(amb, 'DreBudget').length, 1, 'só o cabeçalho');
});

teste('budget: grava, relê, troca só o mês enviado e remove meta com valor vazio', () => {
  const amb = novoAmbiente();
  aceita(bGravar(amb));
  aceita(bGravar(amb, { competencia: '2026-11', itens: [{ linha: 'R.1', valor: 5 }] }));
  const ler = () => aceita(bLer(amb)).itens.map(i => [i.competencia, i.linha, i.valor]);
  igual(ler(), [['2026-10', '2.01', 1234.5], ['2026-10', 'R.1', 190000], ['2026-11', 'R.1', 5]]);
  aceita(bGravar(amb, { itens: [{ linha: 'R.1', valor: '' }, { linha: '3.01', valor: 0 }] }));
  igual(ler(), [['2026-10', '2.01', 1234.5], ['2026-10', '3.01', 0], ['2026-11', 'R.1', 5]], 'R.1 de outubro saiu; novembro intacto');
  igual(aceita(bLer(amb, { de: '2026-09', ate: '2026-09' })).itens, []);
  igual(amb.celulasRuins(), [], 'competência ou valor corrompido na DreBudget');
  igual(amb.travas, 0);
  const log = cheias(amb, 'Log').slice(1).map(l => [l[1], l[2]]);
  igual(log, [['pedro', 'budget_gravar'], ['pedro', 'budget_gravar'], ['pedro', 'budget_gravar']]);
});

teste('budget: não altera a planilha financeira nem o resultado do DRE', () => {
  const amb = novoAmbiente();
  const foto = () => JSON.stringify(['PlanoContas', 'Titulos', 'RecTitulos'].map(n => amb.folha(n).v));
  const antes = foto(), res = JSON.stringify(aceita(pedir(amb)));
  aceita(bGravar(amb));
  igual(foto(), antes);
  igual(JSON.stringify(aceita(pedir(amb))), res);
});

// ─── Tela: Orçado × Executado (cálculo local, sem rede) ──────────────────────
teste('tela budget: parse pt-BR, soma por grupo/total, favorável × desfavorável', () => {
  const vm = require('vm');
  const ctx = { console, kbEsc: x => String(x), fetch: () => { throw new Error('a tela não pode chamar a rede ao recalcular'); }, document: {}, CONFIG: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'modules/dre/index.js'), 'utf8') + ';this.T={dreBudParse,dreBudCalc};', ctx);
  const { dreBudParse, dreBudCalc } = ctx.T;
  igual([dreBudParse('1234,5'), dreBudParse('1.234,50'), dreBudParse('1234.5'), dreBudParse(''), dreBudParse('  ')], [1234.5, 1234.5, 1234.5, null, null]);
  verdade(['abc', '-5', '=1+1', '1,234,5'].every(t => Number.isNaN(dreBudParse(t))), 'texto inválido deve virar NaN');

  const L = (id, tipo, grupo, v) => ({ id, nome: id, tipo, grupo, valores: [v] });
  const linhas = [L('RECEITA', 'grupo', 'RECEITA', 300), L('R.1', 'conta', 'RECEITA', 200), L('R.2', 'conta', 'RECEITA', 100),
    L('CUSTO_OP', 'grupo', 'CUSTO_OP', 120), L('1.01', 'conta', 'CUSTO_OP', 120), L('MARGEM', 'total', 'MARGEM', 180),
    L('FIXA', 'grupo', 'FIXA', 50), L('2.01', 'conta', 'FIXA', 50), L('RES_OP', 'total', 'RES_OP', 130),
    L('FIN', 'grupo', 'FIN', 10), L('3.01', 'conta', 'FIN', 10), L('RESULTADO', 'total', 'RESULTADO', 120)];
  const por = c => Object.fromEntries(c.map(x => [x.id, x]));

  igual(dreBudCalc(linhas, {}).every(x => x.orc === null && x.var === null), true, 'sem meta nenhuma: tudo sem orçado');

  const c = por(dreBudCalc(linhas, { 'R.1': 250, 'R.2': 100, '1.01': 100, '2.01': 60 }));
  igual([c.RECEITA.orc, c.MARGEM.orc, c.RES_OP.orc, c.RESULTADO.orc], [350, 250, 190, 190], 'totais somam só o que tem meta');
  igual([c['R.1'].var, c['R.1'].pct, c['R.1'].bom], [-50, -20, false], 'receita abaixo da meta é ruim');
  igual([c['1.01'].var, c['1.01'].bom], [20, false], 'custo acima da meta é ruim');
  igual([c['2.01'].var, c['2.01'].bom], [-10, true], 'despesa abaixo da meta é bom');
  igual([c['R.2'].var, c['R.2'].bom], [0, null], 'igual à meta: neutro');
  igual(c['3.01'].orc, null, 'conta sem meta fica sem orçado');
  igual(c.RESULTADO.var, -70);
  igual(c.FIN.orc, 0, 'grupo sem metas soma 0 quando há meta em outro grupo');

  // meta zero não pode dar divisão por zero
  igual(por(dreBudCalc(linhas, { '3.01': 0 }))['3.01'].pct, null);

  // editar uma meta recalcula tudo, localmente e rápido
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 100; i++) dreBudCalc(linhas, { 'R.1': 250 + i, '1.01': 100, '2.01': 60 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 100;
  verdade(ms < 300, 'recálculo lento: ' + ms + ' ms');
});

teste('tela cenário + gráfico + export: recalcula local, fecha com o DRE, volta ao real', () => {
  const vm = require('vm');
  const ctx = { console, kbEsc: x => String(x), fetch: () => { throw new Error('a tela não pode chamar a rede ao simular'); }, document: {}, CONFIG: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'modules/dre/index.js'), 'utf8') + ';this.T={dreCenParse,dreCenario,dreGraficoDados,dreAoa,dreExemploResultado,dreListaMeses};', ctx);
  const { dreCenParse, dreCenario, dreGraficoDados, dreAoa, dreExemploResultado } = ctx.T;
  const J = x => JSON.parse(JSON.stringify(x));   // tira o protótipo do contexto vm para o igual() comparar
  igual([dreCenParse('10'), dreCenParse('-5'), dreCenParse('+2,5'), dreCenParse(''), dreCenParse('10%')], [10, -5, 2.5, 0, 10]);
  verdade(['abc', '101', '-100,5', '1e3', '--2'].every(t => Number.isNaN(dreCenParse(t))), 'entrada inválida deve virar NaN');

  const L = (id, tipo, grupo, v) => ({ id, nome: id, tipo, grupo, valores: v });
  const real = { meses: ['2026-01', '2026-02'], linhas: [
    L('RECEITA', 'grupo', 'RECEITA', [300, 400]), L('R.1', 'conta', 'RECEITA', [200, 300]), L('R.2', 'conta', 'RECEITA', [100, 100]),
    L('CUSTO_OP', 'grupo', 'CUSTO_OP', [120, 100]), L('1.01', 'conta', 'CUSTO_OP', [120, 100]), L('MARGEM', 'total', 'MARGEM', [180, 300]),
    L('FIXA', 'grupo', 'FIXA', [50, 50]), L('2.01', 'conta', 'FIXA', [50, 50]), L('RES_OP', 'total', 'RES_OP', [130, 250]),
    L('FIN', 'grupo', 'FIN', [10, 10]), L('3.01', 'conta', 'FIN', [10, 10]), L('RESULTADO', 'total', 'RESULTADO', [120, 240]),
    L('INFO', 'grupo', 'INFO', [70, 70]), L('3.02', 'conta', 'INFO', [70, 70])] };
  const antes = JSON.stringify(real);
  const por = d => Object.fromEntries(d.linhas.map(l => [l.id, l.valores]));

  igual(J(por(dreCenario(real, {}))), J(por(real)), 'sem ajuste = o próprio real');
  const c = por(dreCenario(real, { RECEITA: 10, CUSTO_OP: -5 }));
  igual(J([c['R.1'], c.RECEITA, c['1.01'], c.CUSTO_OP]), [[220, 330], [330, 440], [114, 95], [114, 95]], 'contas e grupos');
  igual(J([c.MARGEM, c.RES_OP, c.RESULTADO]), [[216, 345], [166, 295], [156, 285]], 'totais refeitos');
  igual(J([c.INFO, c['3.02']]), [[70, 70], [70, 70]], 'informativo não muda');
  igual(JSON.stringify(real), antes, 'o real não pode ser alterado');
  igual(J(por(dreCenario(real, { RECEITA: 0, CUSTO_OP: 0, FIXA: 0, FIN: 0 }))), J(por(real)), 'voltar ao real zera tudo');

  // gráfico: últimos 12 meses do que já está na tela, sem rede
  const ex = dreExemploResultado('2025-06', '2026-11');   // 18 meses
  const g = dreGraficoDados(ex);
  igual([g.meses.length, g.meses[0], g.meses[11], g.receita.length, g.resOp.length, g.resultado.length], [12, '2025-12', '2026-11', 12, 12, 12]);
  const lin = id => ex.linhas.find(l => l.id === id).valores.slice(6);
  igual(J([g.receita, g.resOp, g.resultado]), J([lin('RECEITA'), lin('RES_OP'), lin('RESULTADO')]), 'série do gráfico = linhas do DRE');
  igual(dreGraficoDados(dreExemploResultado('2026-09', '2026-11')).meses.length, 3, 'menos de 12 meses: mostra o que há');
  const gc = dreGraficoDados(dreCenario(ex, { RECEITA: 10 }));
  verdade(gc.receita.every((v, i) => Math.abs(v - Math.round(g.receita[i] * 110) / 100) < 0.011), 'gráfico acompanha o cenário');

  // export: matriz do XLSX fecha com a tela
  const aoa = dreAoa(real, 'T');
  igual([aoa[0][0], aoa[2].length, aoa.length], ['T', 4, 3 + real.linhas.length]);
  const rr = aoa.find(r => r[0] === 'RESULTADO');
  igual(rr.slice(1), [120, 240, 360]);
  verdade(aoa.slice(3).every(r => r.slice(1).every(v => typeof v === 'number')), 'valores do XLSX devem ser números');
});

teste('aba faltando na planilha financeira → mensagem clara', () => {
  const amb = novoAmbiente();
  amb.folhas = amb.folhas.filter(s => s.nome !== 'RecTitulos');
  recusa(pedir(amb, { forcar: true }), 'RecTitulos');
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. ESCALA — 24 meses, ~3× o volume real
// ═════════════════════════════════════════════════════════════════════════════
console.log('— ESCALA (24 meses) —');

teste('24 meses com 15.000 títulos e 10.000 parcelas: base < 2 s, consulta em cache < 200 ms', () => {
  const amb = novoAmbiente();
  const meses = f('listaMeses', '2025-01', '2026-12');
  const codigos = ['1.01', '1.02', '2.01', '3.01', '3.07', '3.02', '4.01', ''];
  const tit = [], rec = [];
  for (let i = 0; i < 15000; i++) {
    const m = meses[i % 24];
    tit.push(T('T-' + i, m + '-1' + (i % 9), codigos[i % codigos.length], 'x', 10 + (i % 97), i % 31 ? 'ABERTO' : 'CANCELADO'));
  }
  for (let i = 0; i < 10000; i++) {
    const m = meses[i % 24];
    rec.push(R('R-' + i, m + '-0' + (1 + (i % 9)), String(1000 + Math.floor(i / 2)), i % 3 ? 'SERVICO' : 'PECA', 'C' + (i % 40), 100, 'ABERTO', 1 + (i % 2), 2));
  }
  preencher(amb, 'Titulos', CAB_TITULOS, tit);
  preencher(amb, 'RecTitulos', CAB_REC, rec);

  let t0 = Date.now();
  const dre = aceita(pedir(amb, { de: '2025-01', ate: '2026-12', forcar: true }));
  const tBase = Date.now() - t0;
  t0 = Date.now();
  aceita(pedir(amb, { de: '2025-01', ate: '2026-12' }));
  const tCache = Date.now() - t0;
  console.log('    base: ' + tBase + ' ms · em cache: ' + tCache + ' ms · ' + dre.linhas.length + ' linhas × ' + dre.meses.length + ' meses');
  verdade(dre.meses.length === 24 && dre.linhas.every(l => l.valores.length === 24));
  verdade(tBase < 2000, 'base lenta: ' + tBase + ' ms');
  verdade(tCache < 200, 'consulta em cache lenta: ' + tCache + ' ms');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + ok + ' ok, ' + falhas.length + ' falha(s)');
falhas.forEach(x => console.log('  ✗ ' + x));
process.exit(falhas.length ? 1 : 0);
