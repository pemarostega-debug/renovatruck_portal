/**
 * Teste de fumaça do portal: abre cada módulo num navegador de verdade (Edge ou
 * Chrome, sem janela) e confere o que dá para conferir sem mexer em produção.
 *
 *   npm install --no-save puppeteer-core     (uma vez)
 *   node ferramentas/testar-portal.js
 *
 * O que ele verifica, para cada módulo registrado em js/router.js:
 *   - os arquivos do módulo existem e a <div id="screen-…"> vazia está no index.html;
 *   - a tela abre (template + CSS + JS + bibliotecas) sem erro de JavaScript;
 *   - quanto tempo a primeira abertura leva;
 *   - se sobra rolagem horizontal em 375px, 768px e 1024px.
 *
 * Segurança: toda chamada ao Apps Script e às planilhas Google é BLOQUEADA — o
 * teste nunca lê nem grava dado real. O dados.json vem da cópia local da pasta.
 * A sessão é falsa (admin), só para as telas restritas abrirem.
 *
 * Sai com código 1 se algo falhar — dá para usar antes de cada push.
 */
const http = require('http'), fs = require('fs'), path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { console.error('Falta o puppeteer-core. Rode: npm install --no-save puppeteer-core'); process.exit(1); }

const RAIZ = path.join(__dirname, '..');
const NAVEGADORES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const LARGURAS = [375, 768, 1024];
const PORTA = 8765;

// Lê o registro de módulos direto do router, para o teste nunca ficar desatualizado.
function lerModulos() {
  const src = fs.readFileSync(path.join(RAIZ, 'js/router.js'), 'utf8');
  const bloco = src.match(/const MODULOS = \{([\s\S]*?)\n\};/);
  if (!bloco) throw new Error('Não achei const MODULOS em js/router.js');
  return [...bloco[1].matchAll(/^\s*([\w-]+):\s*\{\s*pasta:'([\w-]+)'.*?css:(true|false)/gm)].map(m => ({ id: m[1], pasta: m[2], css: m[3] === 'true' }));
}

function servir() {
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      const arq = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      if (!arq.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
      fs.readFile(arq, (e, buf) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' }); res.end(buf);
      });
    }).listen(PORTA, () => ok(s));
  });
}

async function abrirPagina(browser, largura) {
  const page = await browser.newPage();
  await page.setViewport({ width: largura, height: 800, isMobile: largura < 1024, hasTouch: largura < 1024 });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('dialog', d => { erros.push('alerta: ' + d.message()); d.accept(); });
  page.on('response', r => { if (r.status() >= 400 && r.url().includes('localhost')) erros.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.setRequestInterception(true);
  const dados = fs.existsSync(path.join(RAIZ, 'dados.json')) ? fs.readFileSync(path.join(RAIZ, 'dados.json')) : '{"ordens":[]}';
  page.on('request', req => {
    const u = req.url();
    if (u.includes('raw.githubusercontent.com') && u.includes('dados.json'))
      return req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: dados });
    if (/script\.google\.com|docs\.google\.com/.test(u)) return req.abort('blockedbyclient');
    req.continue();
  });
  await page.evaluateOnNewDocument(() => sessionStorage.setItem('rv_sessao',
    JSON.stringify({ token: 'teste', usuario: 'teste', nome: 'Teste', papel: 'admin', degradado: false })));
  await page.goto(`http://localhost:${PORTA}/index.html`, { waitUntil: 'load' });
  return { page, erros };
}

(async () => {
  const falhas = [];
  const modulos = lerModulos();
  const index = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

  for (const m of modulos) {
    const dir = path.join(RAIZ, 'modules', m.pasta);
    const precisa = ['template.html', 'index.js', 'README.md', ...(m.css ? ['style.css'] : [])];
    for (const f of precisa) if (!fs.existsSync(path.join(dir, f))) falhas.push(`${m.id}: falta modules/${m.pasta}/${f}`);
    if (!index.includes(`<div id="screen-${m.id}"></div>`)) falhas.push(`${m.id}: falta <div id="screen-${m.id}"></div> no index.html`);
  }

  const exe = NAVEGADORES.find(p => fs.existsSync(p));
  if (!exe) { console.error('Não achei Edge nem Chrome instalados.'); process.exit(1); }
  const servidor = await servir();
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new' });
  try {
    for (const largura of LARGURAS) {
      const { page, erros } = await abrirPagina(browser, largura);
      const linha = [];
      for (const m of modulos) {
        const antes = erros.length;
        const ms = await page.evaluate(async id => { const t = performance.now(); await openModule(id); return Math.round(performance.now() - t); }, m.id);
        await new Promise(r => setTimeout(r, 1200));   // deixa a tela terminar de desenhar
        const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const visivel = await page.evaluate(id => getComputedStyle(document.getElementById('screen-' + id)).display !== 'none', m.id);
        erros.slice(antes).forEach(e => falhas.push(`${m.id} @${largura}px: ${e}`));
        if (!visivel) falhas.push(`${m.id} @${largura}px: a tela não ficou visível`);
        if (sobra > 0) falhas.push(`${m.id} @${largura}px: ${sobra}px de rolagem horizontal`);
        linha.push(`${m.id} ${ms}ms`);
        await page.evaluate(() => { document.querySelectorAll('.overlay.open,.modal.open').forEach(e => e.classList.remove('open')); goHome(); });
      }
      console.log(`${largura}px  1ª abertura: ${linha.join(' · ')}`);
      await page.close();
    }
  } finally {
    await browser.close(); servidor.close();
  }

  if (falhas.length) { console.log('\nFALHOU:\n  ' + falhas.join('\n  ')); process.exit(1); }
  console.log(`\nOK — ${modulos.length} módulos, ${LARGURAS.length} larguras, nenhum erro.`);
})().catch(e => { console.error(e); process.exit(1); });
