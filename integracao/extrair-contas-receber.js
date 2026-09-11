/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Extrator de Contas a Receber — Genesis (MySQL) → fila de aprovação do portal
 *
 *   node integracao/extrair-contas-receber.js [--desde AAAA-MM-DD] [--ate ...]
 *                                             [--enviar] [--api <url>] [--token <t>]
 *
 * Sem --enviar o script só grava integracao/contas-receber-sync.json para você
 * conferir. Com --enviar manda para a aba RecSyncStaging, onde nada vira título
 * antes de alguém aprovar no portal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE ONDE VÊM OS DADOS — e por que a ordem das fontes é o INVERSO do contas a pagar
 *
 * No contas a pagar a fonte primária é a `vw_contas_a_pagar`, porque ela cobre
 * 216 das 217 compras do ano e já vem uma linha por parcela.
 *
 * Aqui não dá para fazer o mesmo. A `vw_contas_a_receber` só tem 164 linhas e
 * cobre pouco mais da metade das notas de venda: agosto/2026, por exemplo, tem
 * 77 notas emitidas e apenas 8 títulos na view. O módulo de contas a receber do
 * Genesis não é alimentado com disciplina, e confiar nele deixaria metade do
 * faturamento invisível — que é exatamente o buraco que este módulo existe para
 * fechar.
 *
 * Então a fonte primária é a `vw_notas_fiscais`: toda nota de venda vira
 * parcelas por `numero_parcelas` + `Venc01..Venc12`. A `vw_contas_a_receber`
 * entra como CONFERÊNCIA — quando ela tem o título, o vencimento e o valor dela
 * mandam, e o campo `fonte` registra que houve confirmação.
 *
 * CUIDADO COM AS COLUNAS Venc: aqui o lixo é diferente do contas a pagar. Nas
 * notas de saída o Genesis preenche as parcelas não usadas com a DATA DE
 * EMISSÃO, não com a sentinela 2002-04-05. Por isso só lemos as primeiras
 * `numero_parcelas` colunas e descartamos qualquer vencimento que não seja
 * posterior à emissão (exceto quando a nota é mesmo à vista, com parcela única).
 *
 * `num_pedido` é o número da OS que gerou a nota — 100% preenchido nas 380
 * notas de venda de 2026. É o elo que faz uma OS antecipada em AGUARDANDO
 * PEDIDO reconhecer as próprias notas quando o faturamento sai.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Fica em integracao/ (pasta ignorada pelo git), não na raiz publicada.
const SAIDA = path.join(__dirname, 'contas-receber-sync.json');
const CONFIG = path.join(__dirname, 'config.local.json');

// ── Argumentos ──
const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
};
const tem = nome => args.indexOf('--' + nome) >= 0;

// Janela padrão: do primeiro dia de três meses atrás. Prazo de recebível é mais
// longo que o de pagamento (30/60/90 é comum), então a janela é maior que a do
// contas a pagar para não deixar nota antiga fora da fila.
function padraoDesde() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3, 1);
  return d.toISOString().slice(0, 10);
}

const DESDE = opt('desde', padraoDesde());
const ATE = opt('ate', '2099-12-31');
// --api / --token na linha de comando (sessão RV.token do portal) ou, para o
// cron, "apiReceber" + "syncTokenReceber" dentro de integracao/config.local.json.
// Assim o segredo não aparece no crontab nem no cron.log.
let API = opt('api', '');
let TOKEN = opt('token', '');

// ═════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═════════════════════════════════════════════════════════════════════════════

const iso = v => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return '';
  // As datas vêm do MySQL como DATE; usar os componentes locais evita que o
  // fuso empurre o vencimento para o dia anterior.
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

const num = v => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const pad2 = n => String(n).padStart(2, '0');

/** Mesma normalização do contas-receber.gs. As duas pontas TÊM de bater. */
const normalizarChave = v =>
  String(v === null || v === undefined ? '' : v)
    .trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');

/**
 * Idem chaveNaturalRec() do contas-receber.gs. Divergir aqui fura a trava
 * anti-duplicidade e a mesma nota entra duas vezes.
 *
 * `numero_nf` entra SEMPRE puro ("369"), nunca "369/02": a parcela já é campo
 * próprio, e misturar os dois faria a mesma duplicata gerar duas chaves.
 *
 * A DATA DE EMISSÃO faz parte da chave, e isso não é excesso de zelo: o Genesis
 * reaproveita numeração de NF entre séries. Existem hoje 7 pares de notas
 * diferentes com o mesmo num_nf para o mesmo cliente — NF 301 da JSL IN LOADER
 * é R$ 281,46 da OS 4463 em 15/07 e também R$ 1.610,00 da OS 4267 em 04/08.
 * Sem a emissão na chave uma das duas seria descartada como duplicata, e a
 * empresa perderia o recebível calada.
 */
function chaveNatural(t) {
  const parc = num(t.parcela) || 1;
  const nf = normalizarChave(t.numero_nf);
  const cod = normalizarChave(t.cliente_cod);
  const emi = t.data_emissao || '';

  if (nf && cod) return 'NF|' + nf + '|' + cod + '|' + emi + '|' + parc;
  if (nf) return 'NF|' + nf + '|' + normalizarChave(t.cliente) + '|' + emi + '|' + parc;

  return 'AV|' + normalizarChave(t.cliente) + '|' +
    (t.data_vencimento || '') + '|' + num(t.valor_total).toFixed(2) + '|' + parc;
}

/** "NF000369/3" → { nf: '369', parcela: 3 }. "NF000359" → { nf:'359', parcela:1 } */
function lerTituloCR(titulo) {
  const s = String(titulo || '').trim();
  let m = /^NF0*(\d+)\/(\d+)$/i.exec(s);
  if (m) return { nf: m[1], parcela: parseInt(m[2], 10) };
  m = /^NF0*(\d+)$/i.exec(s);
  if (m) return { nf: m[1], parcela: 1 };
  return null;
}

const somaDias = (isoData, dias) => {
  const d = new Date(isoData + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return iso(d);
};

// ═════════════════════════════════════════════════════════════════════════════
// PARTIÇÃO DE PARCELAS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Explode uma NF de venda em parcelas.
 *
 * Regras que o Genesis exige nas notas de SAÍDA:
 *  - só as primeiras `numero_parcelas` colunas Venc valem; as demais repetem a
 *    data de emissão e não são vencimento nenhum;
 *  - um vencimento igual ou anterior à emissão só é aceito quando a nota é de
 *    parcela única (venda à vista de verdade). Nos demais casos é lixo, e a
 *    parcela é projetada de 30 em 30 dias a partir da última data boa;
 *  - o rateio joga os centavos da divisão na ÚLTIMA parcela, para a soma bater
 *    exatamente com o valor da nota. Conferido contra a vw_contas_a_receber:
 *    NF 369, 3 parcelas de 8.710,79 = 26.132,37, os mesmos centavos.
 */
function particionar(nota) {
  const emissao = iso(nota.data);
  let n = parseInt(nota.numero_parcelas, 10);
  if (!n || n < 1) n = 1;
  if (n > 12) n = 12;

  const vencimentos = [];
  for (let i = 1; i <= n; i++) {
    const v = iso(nota['Venc' + pad2(i)]);
    const bom = v && (v > emissao || (n === 1 && v === emissao));
    vencimentos.push(bom ? v : '');
  }

  // Preenche os buracos projetando 30 dias a partir da última data conhecida
  // (ou da emissão, quando nem a primeira veio).
  let ultima = emissao;
  for (let i = 0; i < n; i++) {
    if (vencimentos[i]) { ultima = vencimentos[i]; continue; }
    ultima = somaDias(ultima, 30);
    vencimentos[i] = ultima;
    nota._projetou = true;
  }

  const total = num(nota.valor_total_nf);
  const fatia = Math.floor((total / n) * 100) / 100;

  const parcelas = [];
  for (let i = 1; i <= n; i++) {
    const valor = i === n ? Math.round((total - fatia * (n - 1)) * 100) / 100 : fatia;
    parcelas.push({ parcela: i, total_parcelas: n, vencimento: vencimentos[i - 1], valor: valor });
  }
  return parcelas;
}

// ═════════════════════════════════════════════════════════════════════════════
// CONSULTAS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Notas de saída. O Genesis grava o texto completo do CFOP, que muda de nota
 * para nota ("Venda de mercadoria adqu/Venda de mercadoria, adq..."), então
 * casamos por prefixo. Devolução fica de fora: é saída de mercadoria, não
 * recebível.
 */
const SQL_NOTAS = `
  SELECT cod_id, num_nf, data, natureza_operacao, cancelada, cr_emitida,
         codigo_cliente, razao_cli, cnpj_cli, vendedor, forma_pagamento,
         valor_produto, valor_total_nf, valor_icms, numero_parcelas, num_pedido,
         Venc01, Venc02, Venc03, Venc04, Venc05, Venc06,
         Venc07, Venc08, Venc09, Venc10, Venc11, Venc12
  FROM vw_notas_fiscais
  WHERE data BETWEEN ? AND ?
    AND (cancelada IS NULL OR cancelada <> 'Sim')
    AND (natureza_operacao LIKE 'Venda%' OR natureza_operacao LIKE 'Presta%')
  ORDER BY data, cod_id`;

const SQL_RECEBER = `
  SELECT codigo_id, codigo_cliente, nome_devedor, cnpj_cliente,
         emissao, vencimento, data_baixa, titulo, valor, valor_pago,
         origem, os_fat, num_os, parcela, parcelamento
  FROM vw_contas_a_receber
  WHERE emissao BETWEEN ? AND ?
  ORDER BY vencimento, codigo_id`;

// As OSs em AGUARDANDO PEDIDO viajam junto: são a matéria-prima da antecipação
// de recebível futuro, e o portal precisa delas com valor e cliente certos.
const SQL_OS_PENDENTES = `
  SELECT numero_os, codigo_cliente, razao_cliente, valor_total,
         data_geracao, data, descricao_fase
  FROM vw_ordens_servico
  WHERE descricao_fase = 'AGUARDANDO PEDIDO'
    AND (cancelada IS NULL OR cancelada <> 'Sim')
  ORDER BY valor_total DESC`;

// ═════════════════════════════════════════════════════════════════════════════
// PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════

async function extrair() {
  if (!fs.existsSync(CONFIG)) {
    console.error('Falta o arquivo integracao/config.local.json com as credenciais do banco.');
    console.error('Modelo: {"host":"...","port":3311,"user":"...","password":"...","database":"sas0003"}');
    process.exitCode = 1;
    return;
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

  // Essas quatro chaves NÃO são do banco — separa antes de passar o resto para
  // o mysql2, senão ele avisa "Ignoring invalid configuration option".
  const { api, syncToken, apiReceber, syncTokenReceber, ...dbCfg } = cfg;
  if (!TOKEN) TOKEN = String(syncTokenReceber || syncToken || '');
  if (!API) API = String(apiReceber || '');

  console.log(`Janela: ${DESDE} → ${ATE}`);
  let cn;
  try {
    cn = await mysql.createConnection(Object.assign({}, dbCfg, { connectTimeout: 15000, dateStrings: false }));
    console.log('Conectado ao Genesis.');
  } catch (e) {
    console.error('Falha ao conectar: ' + e.message + ' (' + e.code + ')');
    if (e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED') {
      console.error('→ Sem acesso ao banco. Confirme se está na rede do escritório / VPN.');
    }
    process.exitCode = 1;
    return;
  }

  let notas, receber, osPendentes;
  try {
    [[notas], [receber], [osPendentes]] = await Promise.all([
      cn.query(SQL_NOTAS, [DESDE, ATE]),
      cn.query(SQL_RECEBER, [DESDE, ATE]),
      cn.query(SQL_OS_PENDENTES)
    ]);
  } finally {
    await cn.end();
  }
  console.log(`${notas.length} nota(s) de saída, ${receber.length} título(s) na vw_contas_a_receber, ` +
              `${osPendentes.length} OS em AGUARDANDO PEDIDO.`);

  // ── Índice da conferência ──
  // Dois índices, e a OS é o primeiro por um motivo concreto: como o Genesis
  // repete numeração de NF entre séries, `nf|cliente|parcela` casa com duas
  // notas diferentes em 7 casos e a conferência escolheria a errada. A OS
  // desempata — a vw_contas_a_receber traz `num_os` justamente para isso.
  // O índice sem OS fica de reserva para os títulos que vieram sem ela.
  const porOS = new Map();
  const porTitulo = new Map();
  for (const t of receber) {
    const ref = lerTituloCR(t.titulo);
    if (!ref) continue;
    const base = ref.nf + '|' + String(t.codigo_cliente) + '|' + ref.parcela;
    const os = String(t.num_os || t.os_fat || '').trim();
    if (os) porOS.set(base + '|' + os, t);
    if (!porTitulo.has(base)) porTitulo.set(base, t);
  }

  const registros = [];
  let confirmados = 0, projetados = 0;

  const confUsados = new Set();
  for (const n of notas) {
    const parcelas = particionar(n);
    const os = String(n.num_pedido || '').trim();
    for (const p of parcelas) {
      const base = String(n.num_nf) + '|' + String(n.codigo_cliente) + '|' + p.parcela;
      // Pela OS primeiro; sem OS, cai no índice solto — mas nunca reaproveita
      // um título de conferência que já casou com outra nota.
      let conf = os ? porOS.get(base + '|' + os) : null;
      if (!conf) {
        const solto = porTitulo.get(base);
        if (solto && !confUsados.has(solto.codigo_id)) conf = solto;
      }
      if (conf) { confirmados++; confUsados.add(conf.codigo_id); }

      // Quando a view de contas a receber tem o título, ela manda: é o número
      // que o financeiro do Genesis enxerga, e divergir dele geraria conflito
      // na conciliação bancária.
      const vencimento = conf ? iso(conf.vencimento) : p.vencimento;
      const valor = conf ? num(conf.valor) : p.valor;
      const baixa = conf ? iso(conf.data_baixa) : '';
      const recebido = conf ? num(conf.valor_pago) : 0;

      registros.push({
        fonte: conf ? 'NF+CONTAS_A_RECEBER' : 'NOTA_FISCAL',
        genesis_id: n.cod_id,
        genesis_cr_id: conf ? conf.codigo_id : '',
        numero_nf: String(n.num_nf),
        num_os: String(n.num_pedido || '').trim(),
        cliente: String(n.razao_cli || '').trim(),
        cliente_cod: String(n.codigo_cliente || ''),
        cliente_cnpj: String(n.cnpj_cli || ''),
        vendedor: String(n.vendedor || ''),
        data_emissao: iso(n.data),
        data_vencimento: vencimento,
        valor_total: valor,
        valor_recebido: recebido,
        data_recebimento: baixa,
        status: baixa ? 'RECEBIDO' : 'ABERTO',
        parcela: p.parcela,
        total_parcelas: p.total_parcelas,
        natureza_operacao: String(n.natureza_operacao || ''),
        forma_pagamento: String(n.forma_pagamento || ''),
        descricao: n.num_pedido ? 'OS ' + n.num_pedido : '',
        empresa: 'RENOVA',
        origem: 'GENESIS'
      });
    }
    if (n._projetou) projetados++;
  }

  // ── Chave natural + dedupe dentro do próprio lote ──
  const vistos = new Set();
  const finais = [];
  let repetidosNoLote = 0;
  for (const r of registros) {
    r.chave_origem = chaveNatural(r);
    if (vistos.has(r.chave_origem)) { repetidosNoLote++; continue; }
    vistos.add(r.chave_origem);
    finais.push(r);
  }
  finais.sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));

  // ── OSs pendentes: entram no payload para conferência, não viram título ──
  const os = osPendentes.map(o => ({
    num_os: String(o.numero_os),
    cliente: String(o.razao_cliente || '').trim(),
    cliente_cod: String(o.codigo_cliente || ''),
    valor_total: num(o.valor_total),
    data_geracao: iso(o.data_geracao),
    data: iso(o.data)
  }));

  const payload = {
    gerado_em: new Date().toISOString(),
    janela: { desde: DESDE, ate: ATE },
    total: finais.length,
    resumo: {
      notas: notas.length,
      confirmados_pela_view_cr: confirmados,
      notas_com_vencimento_projetado: projetados,
      repetidos_descartados: repetidosNoLote,
      valor_total: Math.round(finais.reduce((s, r) => s + r.valor_total, 0) * 100) / 100,
      os_aguardando_pedido: os.length,
      valor_os_aguardando_pedido: Math.round(os.reduce((s, o) => s + o.valor_total, 0) * 100) / 100
    },
    notas_fila: finais,
    os_aguardando_pedido: os
  };

  fs.writeFileSync(SAIDA, JSON.stringify(payload, null, 2));
  const kb = (fs.statSync(SAIDA).size / 1024).toFixed(0);
  console.log(`${finais.length} título(s) prontos para aprovação — ${kb} KB em integracao/contas-receber-sync.json`);
  console.log(`  confirmados pela vw_contas_a_receber: ${confirmados}`);
  console.log(`  notas com vencimento projetado:       ${projetados}`);
  console.log(`  repetidos no lote:                    ${repetidosNoLote}`);
  console.log(`  valor total:                          R$ ${payload.resumo.valor_total.toLocaleString('pt-BR')}`);
  console.log(`  OS em AGUARDANDO PEDIDO:              ${os.length} · R$ ${payload.resumo.valor_os_aguardando_pedido.toLocaleString('pt-BR')}`);

  if (tem('enviar')) await enviar(payload);
  else console.log('\nConfira o arquivo e rode de novo com  --enviar --api <url> --token <token>\npara mandar as notas para a fila de aprovação do portal.');
}

/**
 * Manda o lote para a aba RecSyncStaging pela API autenticada.
 * Em blocos de 300 para não estourar o limite de payload do Apps Script.
 */
async function enviar(payload) {
  if (!API) { console.error('Informe --api <url do /exec do contas-receber>.'); process.exitCode = 1; return; }
  if (!TOKEN) { console.error('Informe --token <token da sessão>. Pegue no console do portal: RV.token'); process.exitCode = 1; return; }

  const chamar = corpo => fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ token: TOKEN }, corpo))
  }).then(r => r.json());

  // O primeiro bloco substitui o lote anterior; os demais são acrescentados.
  const BLOCO = 300;
  const lista = payload.notas_fila;
  for (let i = 0; i < lista.length; i += BLOCO) {
    const lote = lista.slice(i, i + BLOCO);
    process.stdout.write(`Enviando ${i + 1}–${i + lote.length} de ${lista.length}... `);
    const d = await chamar({
      action: i === 0 ? 'sync_gravar' : 'sync_acrescentar',
      notas: lote, gerado_em: payload.gerado_em, janela: payload.janela
    });
    if (!d.success) { console.log('FALHOU: ' + d.error); process.exitCode = 1; return; }
    console.log('ok');
  }
  console.log(`\n${lista.length} nota(s) na fila de aprovação. Abra o portal → Contas a Receber → Sincronizar Notas de Saída.`);
}

extrair().catch(e => {
  console.error('Erro inesperado: ' + e.stack);
  process.exitCode = 1;
});
