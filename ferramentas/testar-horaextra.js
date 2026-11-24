/**
 * Teste do módulo Hora Extra PJ (modules/horaextra).
 *
 *   node ferramentas/testar-horaextra.js [pasta-para-capturas]
 *
 * Parte 1: funções puras do index.js (totais, fechamento, situação do dia), sem navegador.
 * Parte 2: a tela de verdade num navegador (Edge/Chrome sem janela), falando com o BACKEND REAL
 *          (ColaboradoresPJ.gs, do repositório irmão portaria-renova) rodando no Google simulado.
 *          Precisa do puppeteer-core:  npm install --no-save puppeteer-core   (uma vez, fora do repositório).
 *          Se o repositório irmão não estiver ao lado, a parte 2 é pulada com aviso.
 * Nomes e valores aqui são inventados: o repositório é público.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const MOD = path.join(RAIZ, 'modules', 'horaextra');
const js = fs.readFileSync(path.join(MOD, 'index.js'), 'utf8');

let ok = 0; const falhas = [];
function t(nome, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) ok++; else falhas.push(`${nome}\n    veio:     ${a}\n    esperado: ${b}`);
}

/* ── Parte 1: funções puras ─────────────────────────────────────────────── */
const G = { console, CONFIG: { PJ_API: '' }, RV: { token: 'x' } };
vm.createContext(G);
vm.runInContext(js + '\n;globalThis.__he = { heTotais, heLinhasFechamento, heItensPendentes, heSituacaoDia, heHoras, heHorasNum, heMesSeguinte, heMesRotulo, heMoeda, heEsc, heTemMovimento, heTotalPessoa, heApiLigada };', G);
const H = G.__he;

const pessoa = (cod, nome, tot, extra) => Object.assign({ codigo: cod, nome, curto: nome, totais: Object.assign({ minSS: 0, minDF: 0, valor: 0, pendentes: 0, pendenteMin: 0, pendenteValor: 0,
  incompletos: 0, divergentes: 0, diasComRegistro: 0, socorroQtd: 0, socorroValor: 0, socorroAbsorvidoMin: 0 }, tot) }, extra || {});
const P = [
  pessoa('A', 'Zeca Teste', { minSS: 90, valor: 37.5, diasComRegistro: 3, pendentes: 1, pendenteMin: 60, pendenteValor: 25 }),
  pessoa('B', 'Ana Teste', { minDF: 60, valor: 35, diasComRegistro: 1, socorroQtd: 2, socorroValor: 220.01, socorroAbsorvidoMin: 120 }),
  pessoa('C', 'Sem Movimento', {}),
  pessoa('D', 'Bia Teste', { socorroQtd: 1, socorroValor: 120 })
];
const T = H.heTotais(P);
t('totais: hora extra aprovada', [T.aprovMin, T.aprovValor], [150, 72.5]);
t('totais: socorro (arredonda centavos)', [T.socorroQtd, T.socorroValor, T.absorvidoMin], [3, 340.01, 120]);
t('totais: pendente fica fora do total', [T.pendentes, T.pendenteValor, T.total], [1, 25, 412.51]);
t('movimento: só quem tem registro ou socorro', P.map(H.heTemMovimento), [true, true, false, true]);
const L = H.heLinhasFechamento(P);
t('fechamento: ordem alfabética e sem quem não teve movimento', L.map(l => l.nome), ['Ana Teste', 'Bia Teste', 'Zeca Teste']);
t('fechamento: horas em decimal e total por pessoa', [L[0].horasExtra, L[0].total, L[2].horasExtra, L[2].pendenteValor], [1, 255.01, 1.5, 25]);
t('totais de lista vazia', H.heTotais([]).total, 0);
t('horas', [H.heHoras(0), H.heHoras(45), H.heHoras(60), H.heHoras(150)], ['0 min', '45 min', '1h', '2h30']);
t('mês seguinte e rótulo', [H.heMesSeguinte('2026-11'), H.heMesSeguinte('2026-12'), H.heMesRotulo('2026-03')], ['2026-12', '2027-01', 'março/2026']);
t('texto vira HTML seguro', H.heEsc('<b onclick="x">&\'</b>'), '&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;');
t('módulo sem URL não está ligado', H.heApiLigada(), false);
t('itens pendentes: só dia pendente, completo e com extra', H.heItensPendentes({ codigo: 'A', dias: [
  { dia: '2026-11-02', extraMin: 60, efetivo: { estado: 'PENDENTE' } },
  { dia: '2026-11-03', extraMin: 60, efetivo: { estado: 'APROVADO' } },
  { dia: '2026-11-04', extraMin: 60, incompleto: true, efetivo: { estado: 'PENDENTE' } },
  { dia: '2026-11-05', extraMin: 0, efetivo: { estado: '' } }] }), [{ codigo: 'A', dia: '2026-11-02', acao: 'APROVAR' }]);
const sit = d => H.heSituacaoDia(Object.assign({ extraMin: 0, efetivo: {} }, d));
t('situação: incompleto', sit({ incompleto: true }).txt, 'Registro incompleto');
t('situação: aprovado mostra o tempo', sit({ extraMin: 90, decisao: { status: 'APROVADO', minSS: 90, minDF: 0 } }).txt, 'Aprovado 1h30');
t('situação: aprovação que mudou', sit({ extraMin: 60, decisao: { status: 'APROVADO', minSS: 90, minDF: 0, diverge: true } }).txt.includes('mudou'), true);
t('situação: recusado', sit({ decisao: { status: 'RECUSADO' } }).txt, 'Recusado');
t('situação: pendente', sit({ extraMin: 30, efetivo: { estado: 'PENDENTE' } }), { cls: 'pend', txt: 'Pendente' });
t('situação: sem extra', sit({}).txt, '—');

/* ── Parte 2: a tela, com o backend real no Google simulado ─────────────── */
async function parte2() {
  const irmao = path.join(RAIZ, '..', 'portaria-renova');
  const gs = path.join(irmao, 'apps-script', 'ColaboradoresPJ.gs');
  if (!fs.existsSync(gs)) { console.log('(parte 2 pulada: repositório portaria-renova não está ao lado)'); return; }
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch (e) {
    try { puppeteer = require(require.resolve('puppeteer-core', { paths: [process.cwd()] })); }
    catch (e2) { console.log('(parte 2 pulada: falta o puppeteer-core. Rode: npm install --no-save puppeteer-core)'); return; }
  }
  const NAVEGADORES = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                       'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  const exe = NAVEGADORES.find(p => fs.existsSync(p));
  if (!exe) { console.log('(parte 2 pulada: não achei Edge nem Chrome)'); return; }
  const { criarAmbiente, sp } = require(path.join(irmao, 'ferramentas', 'simulador-gas'));

  /* Backend real: 3 PJ, horário da unidade (padrão), registros e um socorro. */
  const amb = criarAmbiente({ sessoesPortal: { 'tok-admin': { usuario: 'admin', nome: 'Administrador', papel: 'admin' } } });
  amb.carregar(gs);
  amb.relogio(sp('2026-11-23 09:00'));
  const rh = amb.novaPlanilha('RH');
  amb.preencher(rh, 'colaboradores e PJ', [['Status', 'Tipo', 'Codigo RH', 'Colaborador', 'Cargo', 'Horário', 'Departamento', 'Admissão'],
    ['Ativo', 'PJ', 'PJ_901', 'Ana Teste Silva', 'Soldadora', '', 'Oficina', '01/01/2026'],
    ['Ativo', 'PJ', 'PJ_902', 'Bruno Teste Souza', 'Mecânico', '', 'Oficina', '01/01/2026'],
    ['Ativo', 'PJ', 'PJ_903', 'Carla Teste Lima', 'Eletricista', '', 'Oficina', '01/01/2026'],
    ['Ativo', 'PJ', 'PJ_024', 'Davi Teste Fora', 'Analista', '', 'Oficina', '01/01/2026']]);
  amb.preencher(rh, 'valores automáticos', [['Evento ', 'Valor '], ['Gratificação segunda a sabado/hora', 'R$ 25,00'], ['Gratificação domingos e feriados/hora', 'R$ 35,00']]);
  const ctrl = amb.novaPlanilha('Controle');
  amb.ativar(ctrl);
  amb.G.instalar();
  amb.G.pjCfgGravar({ planilha_rh: 'https://docs.google.com/spreadsheets/d/' + rh.getId() + '/edit', senha_portaria: 'senha-teste-1' });
  const tokP = amb.post({ action: 'login', senha: 'senha-teste-1' }).data.token;
  const toque = (quando, codigo, tipo, id) => { amb.relogio(sp(quando)); const r = amb.post({ action: 'pj_registrar', token: tokP, enviadoEm: Date.now(), eventos: [{ id, codigo, tipo, ts: Date.now() }] }); if (!r.success) throw new Error(r.error); };
  toque('2026-11-16 08:00', 'PJ_901', 'ENTRADA', 'he-ana-e1'); toque('2026-11-16 19:30', 'PJ_901', 'SAIDA', 'he-ana-s1');       // segunda: 2h30 de extra (17:00–19:30)
  toque('2026-11-19 08:00', 'PJ_902', 'ENTRADA', 'he-bru-e1'); toque('2026-11-19 22:40', 'PJ_902', 'SAIDA', 'he-bru-s1');       // quinta: extra + socorro
  toque('2026-11-18 08:00', 'PJ_903', 'ENTRADA', 'he-car-e1');                                                                  // quarta: só entrada → incompleto
  amb.relogio(sp('2026-11-19 22:45'));
  const so = amb.post({ action: 'pj_socorro', token: tokP, id: 'soc-he-teste-1', codigo: 'PJ_902', inicio: '2026-11-19 19:30', fim: '2026-11-19 22:30', obs: 'teste' });
  if (!so.success) throw new Error(so.error);
  amb.relogio(sp('2026-11-23 09:00'));

  const API = 'https://script.google.com/macros/s/HE-TESTE/exec';
  const css = fs.readFileSync(path.join(MOD, 'style.css'), 'utf8');
  const tpl = fs.readFileSync(path.join(MOD, 'template.html'), 'utf8');
  const pagina = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>:root{--bg:#f4f4ef;--text:#1a1a1a;--border:#e1e0d9}body{margin:0;font-family:sans-serif}.tool-nav{height:48px;display:flex;gap:12px;align-items:center;padding:0 16px;background:#fff}.back-btn{border:0;background:none}</style>
    <style>${css}</style></head><body>${tpl}
    <script>var CONFIG={PJ_API:'${API}'};var RV={token:'tok-admin'};function goHome(){}
      window.__xl=null; window.XLSX={utils:{aoa_to_sheet:a=>({a}),book_new:()=>({}),book_append_sheet(wb,ws){wb.ws=ws;}},writeFile(wb,nome){window.__xl={nome,aoa:wb.ws.a};}};</script>
    <script>${js}</script></body></html>`;

  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new' });
  const erros = [];
  const capturas = process.argv[2] || '';
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 900 });
    page.on('pageerror', e => erros.push(e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
    const dialogos = [];
    page.on('dialog', d => { dialogos.push(d.type() + ': ' + d.message().split('\n')[0]); d.accept(d.type() === 'prompt' ? (d.defaultValue() || 'motivo de teste') : undefined); });
    await page.setRequestInterception(true);
    page.on('request', req => {
      const u = req.url();
      if (u.startsWith(API)) {
        amb.relogio(sp('2026-11-23 09:00'));
        const corpo = req.method() === 'POST' ? amb.post(JSON.parse(req.postData())) : amb.get(Object.fromEntries(new URL(u).searchParams));
        return req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(corpo) });
      }
      req.continue();
    });
    await page.setContent(pagina, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { document.getElementById('he-mes').value = '2026-11'; initHoraExtra(); });
    await page.waitForSelector('.he-kpi', { timeout: 8000 });
    const kpi = () => page.$$eval('.he-kpi b', e => e.map(x => x.textContent.replace(/\s/g, ' ')));
    const clicar = sel => page.evaluate(s => document.querySelector(s).click(), sel);
    const esperarKpi = async (i, texto) => { await page.waitForFunction((i, tx) => (document.querySelectorAll('.he-kpi b')[i] || {}).textContent === tx, { timeout: 8000 }, i, texto); };

    t('tela liga e mostra o backend real: sem aprovação, só o socorro (R$ 120)', await kpi(), ['R$ 120,00', 'R$ 0,00', 'R$ 120,00', 'R$ 129,17']);
    t('3 colaboradores com movimento (o quarto não teve)', await page.$$eval('tr.he-linha', r => r.length), 3);
    t('quem está fora da portaria aparece na lista', await page.$eval('#he-fora', e => /Davi Teste/.test(e.textContent) && /gestão/.test(e.textContent)), true);
    t('regras em vigor mostram o socorro do comunicado', await page.$eval('#he-regras', e => [/R\$\s*100,00/.test(e.textContent), /R\$\s*120,00/.test(e.textContent)]), [true, true]);
    t('aviso de registro incompleto', await page.$eval('#he-avisos', e => /1 dia\(s\) com registro incompleto/.test(e.textContent)), true);
    t('pagamento no dia 10 do mês seguinte', await page.$eval('#he-pagamento', e => e.textContent.includes('dezembro/2026')), true);

    // Ana: aprovar o dia da segunda (2h30 × R$ 25 = R$ 62,50)
    await page.evaluate(() => document.querySelector('tr.he-linha[data-c="PJ_901"]').click());
    await page.waitForSelector('#he-detalhe-card table', { timeout: 5000 });
    t('detalhe da Ana: o dia pendente aparece', await page.$eval('#he-detalhe-card', e => [/16\/11/.test(e.textContent), /Pendente/.test(e.textContent), /2h30/.test(e.textContent)]), [true, true, true]);
    await clicar('#he-detalhe-card button.ok[onclick*="APROVAR"]');
    await esperarKpi(1, 'R$ 62,50');
    t('aprovou: total = hora extra + socorro', await kpi(), ['R$ 182,50', 'R$ 62,50', 'R$ 120,00', 'R$ 66,67']);
    t('no servidor: decisão gravada com o valor do cálculo', ctrl.getSheetByName('HoraExtra').getRange(2, 11).getValue(), 'APROVADO');

    // Reabrir, depois recusar: sai do total
    await clicar('#he-detalhe-card button[onclick*="REABRIR"]');
    await esperarKpi(1, 'R$ 0,00');
    await clicar('#he-detalhe-card button.ruim[onclick*="RECUSAR"]');
    await esperarKpi(3, 'R$ 66,67');
    t('recusado: não entra no pagamento nem no pendente', await kpi(), ['R$ 120,00', 'R$ 0,00', 'R$ 120,00', 'R$ 66,67']);

    // Bruno: o socorro engoliu 3h; só 2h40 de extra (17:00–19:30 e 22:30–22:40). Aprovar todos os pendentes.
    await page.evaluate(() => document.querySelector('tr.he-linha[data-c="PJ_902"]').click());
    await page.waitForFunction(() => /socorro cobriu 3h/.test(document.getElementById('he-detalhe-card').textContent), { timeout: 5000 });
    t('Bruno: o detalhe diz que o socorro cobriu 3h e lista o socorro da noite', await page.$eval('#he-detalhe-card', e => [/2h40/.test(e.textContent), /Noite/.test(e.textContent), /R\$\s*120,00/.test(e.textContent)]), [true, true, true]);
    await clicar('#he-detalhe-card h3 button.ok');
    await esperarKpi(1, 'R$ 66,67');
    t('Bruno aprovado: total = 66,67 + 120,00', await kpi(), ['R$ 186,67', 'R$ 66,67', 'R$ 120,00', 'R$ 0,00']);

    // Cancelar o socorro: as 3h voltam como hora extra pendente
    await clicar('#he-detalhe-card .he-lista button.ruim');
    await page.waitForFunction(() => document.querySelectorAll('.he-kpi b')[2].textContent === 'R$ 0,00', { timeout: 8000 });
    t('socorro cancelado: a hora extra volta (aprovação antiga divergiu)', await page.$eval('#he-avisos', e => /ficaram diferentes do cálculo/.test(e.textContent)), true);
    t('socorro cancelado na planilha, com auditoria', [ctrl.getSheetByName('Socorros').getRange(2, 11).getValue(), ctrl.getSheetByName('Auditoria').getDataRange().getValues().some(l => l[2] === 'socorro_cancelado')], ['cancelado', true]);

    // Fechamento XLSX
    await clicar('button[onclick="heExportar()"]');
    const xl = await page.evaluate(() => window.__xl);
    t('fechamento: arquivo e linhas (título, cabeçalho, 3 pessoas, total)', [xl && xl.nome, xl && xl.aoa.length], ['hora-extra-pj-2026-11.xlsx', 8]);
    t('fechamento: título com a data de pagamento', xl && xl.aoa[0][0], 'Hora extra e socorro PJ — novembro/2026 — pagamento em 10/12/2026');
    t('fechamento: sem dado pessoal além de código e nome', xl && xl.aoa[2], ['Código RH', 'Colaborador', 'Dias com registro', 'Horas extras aprovadas (h)', 'Valor hora extra (R$)', 'Socorros (qtd)', 'Valor socorros (R$)', 'Total a pagar (R$)', 'Pendente de aprovação (R$)', 'Dias incompletos']);

    // Acesso: usuário comum do portal não passa pelo backend
    const semAcesso = await page.evaluate(async api => (await (await fetch(api + '?action=rh_mes&mes=2026-11&token=tok-comum')).json()).codigo, API);
    t('o backend barra quem não é do RH (e quem não tem sessão)', semAcesso === 'ACESSO' || semAcesso === 'SESSAO', true);

    t('sem rolagem horizontal na página (1100 px)', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0);
    if (capturas) await page.screenshot({ path: path.join(capturas, 'horaextra-1100.png'), fullPage: true });
    await page.setViewport({ width: 375, height: 800, isMobile: true, hasTouch: true });
    await esperar(300);
    t('sem rolagem horizontal na página (celular 375 px)', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0), true);
    if (capturas) await page.screenshot({ path: path.join(capturas, 'horaextra-375.png'), fullPage: true });
    t('a tela usou confirmações e perguntas esperadas', dialogos.length > 0, true);
  } catch (e) {
    falhas.push('parou: ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' / '));
  } finally { await browser.close(); }
  erros.forEach(e => falhas.push('erro de JavaScript: ' + e));
}
const esperar = ms => new Promise(r => setTimeout(r, ms));

parte2().then(() => {
  if (falhas.length) { console.log('FALHOU:\n  ' + falhas.join('\n  ')); process.exit(1); }
  console.log(`OK — ${ok} verificações.`);
}).catch(e => { console.log('FALHOU: ' + e.stack); process.exit(1); });
