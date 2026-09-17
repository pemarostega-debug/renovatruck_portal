/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Extrator do Resultado Semanal — Genesis (vw_os_produto_serviço) → Apps Script
 *
 *   node integracao/extrair-resultado-semanal.js                     (só grava o JSON local)
 *   node integracao/extrair-resultado-semanal.js --enviar            (grava e envia)
 *   node integracao/extrair-resultado-semanal.js --desde 2026-01-01 --enviar
 *   node integracao/extrair-resultado-semanal.js --de-arquivo integracao/resultado-semanal-sync.json --enviar
 *                                                                    (reenvia sem consultar o banco)
 *
 * Opções: --view <nome>  --campo-data <coluna>  --api <url /exec>  --token <chave>
 * Para o cron, RS_API_URL e RS_SYNC_TOKEN vêm do .env (fora do git).
 *
 * O QUE VAI: uma linha por item de OS (peça ou serviço), só com as colunas que a
 * análise usa — custo de peça, valores, quantidades, cliente, datas. O portal
 * reconhece as colunas pelo nome, igual ao relatório "OSs detalhe" exportado à
 * mão, então o cálculo é exatamente o mesmo nos dois caminhos.
 *
 * POR QUE NÃO UM JSON NO REPOSITÓRIO: o repo é público. O arquivo local fica em
 * integracao/ e está no .gitignore; o transporte é pela API autenticada.
 *
 * JANELA: a OS finalizada hoje pode ter sido aberta meses atrás, e o gráfico
 * semana a semana olha até 26 semanas. Por isso o padrão é o 1º dia de 8 meses
 * atrás pela data de geração da OS.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (e) { /* sem dotenv: segue com o ambiente */ }

const SAIDA = path.join(__dirname, 'resultado-semanal-sync.json');
const VIEW_PADRAO = 'vw_os_produto_serviço';
const BLOCO = 1000;

const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
};
const tem = nome => args.indexOf('--' + nome) >= 0;

function padraoDesde() {
  const d = new Date();
  d.setMonth(d.getMonth() - 8, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}

const normH = s => String(s == null ? '' : s).trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Colunas que a análise usa (nome normalizado). `obrig` = sem ela não há análise.
const COLUNAS = [
  { n: 'numeroos', obrig: true }, { n: 'codigoproduto', obrig: true }, { n: 'precocusto', obrig: true },
  { n: 'qtdproduto' }, { n: 'descricao' }, { n: 'valorpecas' }, { n: 'valortotal' }, { n: 'valordescontototal' },
  { n: 'quantidadeservico' }, { n: 'descricaosservico' }, { n: 'siglaservico' }, { n: 'valorunitarioservico' },
  { n: 'valortotalservico' }, { n: 'valordescontoitensservico' },
  { n: 'idcliente' }, { n: 'razaocliente' }, { n: 'idvendedor' }, { n: 'nomevendedor' }, { n: 'tiposervico' },
  { n: 'datageracao' }, { n: 'encerrada' }, { n: 'cancelada' }, { n: 'dataencerramentocancelamento' }
];

/** Dos campos reais da view, escolhe os que a análise usa. */
function escolherColunas(campos) {
  const porNorm = {};
  campos.forEach(c => { const k = normH(c); if (!(k in porNorm)) porNorm[k] = c; });
  const escolhidas = [], faltando = [], obrigFaltando = [];
  COLUNAS.forEach(c => {
    if (porNorm[c.n]) escolhidas.push(porNorm[c.n]);
    else (c.obrig ? obrigFaltando : faltando).push(c.n);
  });
  return { escolhidas, faltando, obrigFaltando };
}

const p2 = n => String(n).padStart(2, '0');
/** Datas do MySQL em componentes LOCAIS — UTC empurraria a OS para o dia anterior. */
function valorTexto(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (isNaN(v)) return '';
    const dia = v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
    return (v.getHours() || v.getMinutes()) ? dia + ' ' + p2(v.getHours()) + ':' + p2(v.getMinutes()) : dia;
  }
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  return String(v);
}

function prepararLinhas(rows, colunas) {
  return rows.map(r => colunas.map(c => valorTexto(r[c])));
}

async function lerDoBanco(DESDE) {
  const mysql = require('mysql2/promise');
  if (!process.env.DB_HOST || !process.env.DB_USER) throw new Error('Falta o .env com DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE.');
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    connectTimeout: 20000, charset: 'utf8mb4', dateStrings: false
  });
  try {
    // O nome tem "ç": se o servidor gravou sem acento (ou com outro collation), acha pelo prefixo.
    let view = opt('view', VIEW_PADRAO);
    const [vs] = await c.query('SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ?', ['vw_os_produto_servi%']);
    const nomes = vs.map(x => x.t);
    if (nomes.indexOf(view) < 0) {
      if (!nomes.length) throw new Error('View ' + view + ' não encontrada no banco ' + process.env.DB_DATABASE + '.');
      console.log('Usando a view "' + nomes[0] + '" (nome encontrado no banco).');
      view = nomes[0];
    }
    const esc = s => '`' + String(s).replace(/`/g, '``') + '`';
    const [, campos] = await c.query('SELECT * FROM ' + esc(view) + ' LIMIT 0');
    const sel = escolherColunas(campos.map(f => f.name));
    if (sel.obrigFaltando.length) throw new Error('A view não tem as colunas obrigatórias: ' + sel.obrigFaltando.join(', ') + '. Colunas encontradas: ' + campos.map(f => f.name).join(', '));
    if (sel.faltando.length) console.log('Aviso — colunas ausentes na view (a análise segue sem elas): ' + sel.faltando.join(', '));

    // Filtra por geração OU por encerramento/cancelamento: uma OS aberta antes da janela mas
    // finalizada dentro dela não pode ficar de fora — senão ela aparece no relatório como
    // "sem abertura" (o total é conhecido pela planilha do gerente, mas o item nunca foi extraído).
    const campoData = opt('campo-data', sel.escolhidas.find(x => normH(x) === 'datageracao') || '');
    const campoFechamento = sel.escolhidas.find(x => normH(x) === 'dataencerramentocancelamento') || '';
    const condicoes = [campoData, campoFechamento].filter(Boolean);
    const onde = condicoes.length ? ' WHERE ' + condicoes.map(c => esc(c) + ' >= ?').join(' OR ') : '';
    if (!condicoes.length) console.log('Aviso — sem coluna de data: lendo a view inteira.');
    const t0 = Date.now();
    const [rows] = await c.query('SELECT ' + sel.escolhidas.map(esc).join(', ') + ' FROM ' + esc(view) + onde, condicoes.map(() => DESDE));
    console.log(rows.length + ' linha(s) lidas de ' + view + ' em ' + (Date.now() - t0) + ' ms.');
    return { view, colunas: sel.escolhidas, linhas: prepararLinhas(rows, sel.escolhidas), campoData };
  } finally {
    await c.end();
  }
}

async function enviar(payload, API, TOKEN, log = console.log) {
  if (!API) throw new Error('Informe --api <url /exec> ou RS_API_URL no .env.');
  if (!TOKEN) throw new Error('Informe --token <chave> ou RS_SYNC_TOKEN no .env.');
  const chamar = corpo => fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ token: TOKEN }, corpo))
  }).then(async r => {
    const txt = await r.text();
    try { return JSON.parse(txt); } catch (e) { return { success: false, error: 'Resposta não-JSON (HTTP ' + r.status + '): ' + txt.slice(0, 160) }; }
  });

  const total = payload.linhas.length;
  const blocos = Math.max(1, Math.ceil(total / BLOCO));
  let ultimo = null;
  for (let b = 0; b < blocos; b++) {
    const lote = payload.linhas.slice(b * BLOCO, (b + 1) * BLOCO);
    const d = await chamar({
      action: b === 0 ? 'sync_gravar' : 'sync_acrescentar', colunas: payload.colunas, linhas: lote,
      gerado_em: payload.gerado_em, janela: payload.janela, origem: payload.view, ultimo: b === blocos - 1
    });
    if (!d.success) throw new Error('Bloco ' + (b + 1) + '/' + blocos + ' recusado: ' + d.error);
    ultimo = d.data;
    log('  bloco ' + (b + 1) + '/' + blocos + ' ok (' + lote.length + ' linhas)');
  }
  if (ultimo && ultimo.total !== total) throw new Error('A planilha ficou com ' + ultimo.total + ' linhas, mas foram enviadas ' + total + '.');
  return ultimo;
}

async function main() {
  const DESDE = opt('desde', padraoDesde());
  let payload;
  const arquivo = opt('de-arquivo', '');
  if (arquivo) {
    payload = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    console.log('Reenviando ' + payload.linhas.length + ' linha(s) de ' + arquivo + ' (gerado em ' + payload.gerado_em + ').');
  } else {
    console.log('Janela: OSs geradas desde ' + DESDE);
    const lido = await lerDoBanco(DESDE);
    const oss = new Set(lido.linhas.map(l => l[0]));
    payload = {
      gerado_em: new Date().toISOString(), view: lido.view, janela: { desde: DESDE, campo: lido.campoData },
      colunas: lido.colunas, linhas: lido.linhas, resumo: { linhas: lido.linhas.length, oss: oss.size }
    };
    fs.writeFileSync(SAIDA, JSON.stringify(payload));
    console.log(payload.resumo.oss + ' OS(s) · ' + (fs.statSync(SAIDA).size / 1024).toFixed(0) + ' KB em integracao/resultado-semanal-sync.json');
  }

  if (tem('enviar')) {
    const API = opt('api', process.env.RS_API_URL || '');
    const TOKEN = opt('token', process.env.RS_SYNC_TOKEN || '');
    const r = await enviar(payload, API, TOKEN);
    console.log('Enviado: ' + r.total + ' linha(s) na planilha do Resultado Semanal.');
  } else {
    console.log('Confira o arquivo e rode com --enviar para mandar ao portal.');
  }
}

if (require.main === module) {
  main().catch(e => { console.error('ERRO: ' + e.message); process.exitCode = 1; });
}

module.exports = { escolherColunas, prepararLinhas, valorTexto, enviar, COLUNAS };
