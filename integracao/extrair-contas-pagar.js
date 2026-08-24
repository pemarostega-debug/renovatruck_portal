/**
 * Extrator Genesis (MySQL) → notas de entrada esperando aprovação.
 *
 * Envia o resultado para a aba SyncStaging da planilha (privada), via Apps
 * Script. O front lê de lá, mostra as notas no modal "Sincronizar Notas de
 * Entrada" e o operador decide o que entra. Nada vira título sem aprovação
 * humana.
 *
 * USO:
 *   node integracao/extrair-contas-pagar.js                      (só simula)
 *   node integracao/extrair-contas-pagar.js --desde 2026-07-01
 *   node integracao/extrair-contas-pagar.js --enviar --api <url/exec> --token <token>
 *
 * Sem --enviar o script apenas grava contas-pagar-sync.json na pasta integracao/
 * para você conferir. Esse arquivo NÃO vai para o git.
 *
 * ── POR QUE NÃO PUBLICAR O JSON NO REPOSITÓRIO ───────────────────────────────
 * O repositório do portal é público (é o que faz o GitHub Pages servir o site).
 * Um contas-pagar-sync.json commitado ficaria legível por qualquer pessoa na
 * internet, com nome de fornecedor, CNPJ, número de nota, vencimento e valor.
 * Por isso o transporte é pela API autenticada, e não por arquivo publicado.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Credenciais do banco: integracao/config.local.json (mesmo formato do
 * config.local.json já usado pelo exportar-dados.js). Fica fora do git.
 *
 * ── DE ONDE VÊM OS DADOS ─────────────────────────────────────────────────────
 * O Genesis guarda a mesma compra em dois lugares, e cada um sabe uma metade:
 *
 *   vw_contas_a_pagar   → o título de verdade: já vem UMA LINHA POR PARCELA,
 *                         com codigo_fornecedor, vencimento e valor corretos.
 *                         É a fonte primária.
 *   vw_notas_fiscais    → a nota: emissão, natureza da operação, valor total da
 *                         NF, forma de pagamento e o vínculo com a OS.
 *                         É o enriquecimento.
 *
 * Nas notas de ENTRADA o Genesis grava o fornecedor no campo `codigo_cliente`
 * (o cadastro é o mesmo para os dois lados). Conferido: NF 45694 tem
 * codigo_cliente 356 / FACCHINI S.A e o título NF045694/1 tem
 * codigo_fornecedor 356 / FACCHINI S.A. É por esse par que as duas views se
 * encontram.
 *
 * Para as notas que ainda não viraram título (a view de contas a pagar cobre
 * 216 das 217 compras de 2026), o particionamento cai no plano B: numero_parcelas
 * + Venc01..Venc12, exatamente como especificado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
// Fica em integracao/ (pasta ignorada pelo git), não na raiz publicada.
const SAIDA = path.join(__dirname, 'contas-pagar-sync.json');
const CONFIG = path.join(__dirname, 'config.local.json');

// ── Argumentos ──
const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
};
const tem = nome => args.indexOf('--' + nome) >= 0;

// Janela padrão: do primeiro dia de dois meses atrás até o fim do horizonte.
// Pega o que venceu e ainda não foi lançado, sem arrastar o ano inteiro.
function padraoDesde() {
  const d = new Date();
  d.setMonth(d.getMonth() - 2, 1);
  return d.toISOString().slice(0, 10);
}

const DESDE = opt('desde', padraoDesde());
const ATE = opt('ate', '2099-12-31');
const API = opt('api', '');
const TOKEN = opt('token', '');

// Datas-lixo: o Genesis preenche colunas Venc não usadas com sentinelas antigas
// (2002-04-05 aparece em centenas de notas). Nada anterior a isto é vencimento.
const PISO_DATA = '2015-01-01';

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

const dataValida = s => !!s && s >= PISO_DATA;

const num = v => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

/** Mesma normalização do contas-pagar.gs. As duas pontas TÊM de bater. */
const normalizarChave = v =>
  String(v === null || v === undefined ? '' : v)
    .trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');

/**
 * Tira o sufixo de parcela do número da NF — e só ele. Cópia literal do
 * nfBase() do contas-pagar.gs; as três pontas têm de cortar igual.
 */
function nfBase(numeroNF, parcela) {
  const s = String(numeroNF === null || numeroNF === undefined ? '' : numeroNF).trim();
  const m = /^(.+)\/(\d{1,2})$/.exec(s);
  if (m && parseInt(m[2], 10) === (num(parcela) || 1)) return m[1];
  return s;
}

/** Idem chaveNatural() do contas-pagar.gs. Divergir aqui fura a trava. */
function chaveNatural(t) {
  const parc = num(t.parcela) || 1;
  const nf = normalizarChave(nfBase(t.numero_nf, parc));
  const cod = normalizarChave(t.fornecedor_cod);

  if (nf && cod) return 'NF|' + nf + '|' + cod + '|' + parc;
  if (nf) return 'NF|' + nf + '|' + normalizarChave(t.fornecedor) + '|' + parc;

  return 'AV|' + normalizarChave(t.fornecedor) + '|' +
    (t.data_vencimento || '') + '|' + num(t.valor_total).toFixed(2) + '|' + parc;
}

const pad2 = n => String(n).padStart(2, '0');

/** "45694" + parcela 2 de 3 → "45694/02". Parcela única fica sem sufixo. */
function rotularNF(numeroNF, parcela, totalParcelas) {
  const base = String(numeroNF || '').trim();
  if (!base) return '';
  return totalParcelas > 1 ? base + '/' + pad2(parcela) : base;
}

/** "NF045694/3" → { nf: '45694', parcela: 3 } */
function lerTitulo(titulo) {
  const m = /^NF0*(\d+)\/(\d+)$/i.exec(String(titulo || '').trim());
  if (!m) return null;
  return { nf: m[1], parcela: parseInt(m[2], 10) };
}

/** "03 de 04" → 4 */
function lerParcelamento(txt) {
  const m = /(\d+)\s*de\s*(\d+)/i.exec(String(txt || ''));
  return m ? parseInt(m[2], 10) : 1;
}

// ═════════════════════════════════════════════════════════════════════════════
// CLASSIFICAÇÃO AUTOMÁTICA
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Palpite de natureza para a nota que chega do Genesis. É só um palpite: o
 * operador vê e troca no modal antes de aprovar. Toda compra de mercadoria
 * cai em Peças e Insumos, que é o que essas notas são em 9 de cada 10 casos.
 */
function sugerirNatureza(nota) {
  const n = (nota.natureza_operacao || '').toLowerCase();
  const plano = (nota.descricao_plano_conta || '').toLowerCase();

  if (n.includes('servi')) return { codigo: '1.04', nome: 'Serviços de Terceiros' };
  if (n.includes('compra') || n.includes('mercadoria')) return { codigo: '1.01', nome: 'Peças e Insumos' };
  if (plano.includes('fornecedor')) return { codigo: '1.01', nome: 'Peças e Insumos' };
  return { codigo: '9.99', nome: 'A Classificar' };
}

// ═════════════════════════════════════════════════════════════════════════════
// PARTIÇÃO DE PARCELAS (plano B — notas sem título no contas a pagar)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Explode uma NF em parcelas a partir de numero_parcelas + Venc01..Venc12.
 *
 * Cuidados que o Genesis exige:
 *  - numero_parcelas vem NULL na maioria das notas de entrada → trata como 1;
 *  - as colunas Venc não usadas trazem datas sentinela (2002-04-05) → descarta
 *    qualquer coisa anterior a PISO_DATA;
 *  - se sobram menos vencimentos válidos do que parcelas, as que faltam são
 *    projetadas de 30 em 30 dias a partir do último vencimento conhecido;
 *  - o rateio distribui os centavos da divisão na ÚLTIMA parcela, para a soma
 *    das parcelas bater exatamente com o valor da nota.
 */
function particionar(nota) {
  const vencimentos = [];
  for (let i = 1; i <= 12; i++) {
    const v = iso(nota['Venc' + pad2(i)]);
    if (dataValida(v)) vencimentos.push(v);
  }

  let n = parseInt(nota.numero_parcelas, 10);
  if (!n || n < 1) n = Math.max(vencimentos.length, 1);

  const emissao = iso(nota.data);
  const base = vencimentos.length ? vencimentos[vencimentos.length - 1] : (emissao || iso(new Date()));

  while (vencimentos.length < n) {
    const d = new Date(vencimentos.length ? vencimentos[vencimentos.length - 1] : base);
    d.setDate(d.getDate() + 30);
    vencimentos.push(iso(d));
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

const SQL_TITULOS = `
  SELECT codigo_id, codigo_fornecedor, nome_credor, cnpj_fornecedor,
         emissao, vencimento, data_baixa, titulo, valor, valor_pago,
         centro_custo, plano_conta, descricao_plano_conta, origem,
         parcela, parcelamento
  FROM vw_contas_a_pagar
  WHERE vencimento BETWEEN ? AND ?
  ORDER BY vencimento, codigo_id`;

const SQL_NOTAS = `
  SELECT cod_id, num_nf, data, natureza_operacao, cancelada,
         codigo_cliente, razao_cli, cnpj_cli, forma_pagamento,
         valor_produto, valor_total_nf, numero_parcelas, num_pedido,
         Venc01, Venc02, Venc03, Venc04, Venc05, Venc06,
         Venc07, Venc08, Venc09, Venc10, Venc11, Venc12
  FROM vw_notas_fiscais
  WHERE data BETWEEN ? AND ?
    AND (cancelada IS NULL OR cancelada <> 'Sim')
    AND (natureza_operacao LIKE 'Compra%' OR natureza_operacao IS NULL)
  ORDER BY data, cod_id`;

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

  console.log(`Janela: ${DESDE} → ${ATE}`);
  let cn;
  try {
    cn = await mysql.createConnection(Object.assign({}, cfg, { connectTimeout: 15000, dateStrings: false }));
    console.log('Conectado ao Genesis.');
  } catch (e) {
    console.error('Falha ao conectar: ' + e.message + ' (' + e.code + ')');
    if (e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED') {
      console.error('→ Sem acesso ao banco. Confirme se está na rede do escritório / VPN.');
    }
    process.exitCode = 1;
    return;
  }

  let titulos, notas;
  try {
    [[titulos], [notas]] = await Promise.all([
      cn.query(SQL_TITULOS, [DESDE, ATE]),
      cn.query(SQL_NOTAS, [DESDE, ATE])
    ]);
  } finally {
    await cn.end();
  }
  console.log(`${titulos.length} título(s) em contas a pagar, ${notas.length} nota(s) de entrada.`);

  // Índice das notas por num_nf + código do fornecedor (= codigo_cliente).
  const porNF = new Map();
  for (const n of notas) {
    porNF.set(String(n.num_nf) + '|' + String(n.codigo_cliente), n);
    // Segunda entrada só pelo número, para o caso de o cadastro do título
    // apontar para outro código do mesmo fornecedor (matriz/filial).
    const soNum = 'nf|' + String(n.num_nf);
    if (!porNF.has(soNum)) porNF.set(soNum, n);
  }

  const registros = [];
  const nfsUsadas = new Set();

  // ── Fonte primária: os títulos, que já vêm parcelados ──
  for (const t of titulos) {
    const ref = lerTitulo(t.titulo);
    const nota = ref
      ? (porNF.get(ref.nf + '|' + String(t.codigo_fornecedor)) || porNF.get('nf|' + ref.nf))
      : null;
    if (nota) nfsUsadas.add(nota.cod_id);

    const totalParcelas = lerParcelamento(t.parcelamento) || 1;
    const parcela = num(t.parcela) || (ref ? ref.parcela : 1) || 1;
    const numeroNF = ref ? ref.nf : (nota ? String(nota.num_nf) : '');
    const nat = sugerirNatureza(Object.assign({}, nota, { descricao_plano_conta: t.descricao_plano_conta }));

    registros.push({
      fonte: 'CONTAS_A_PAGAR',
      genesis_id: t.codigo_id,
      numero_nf: rotularNF(numeroNF, parcela, totalParcelas),
      numero_nf_puro: numeroNF,
      numero_boleto: '',
      fornecedor: String(t.nome_credor || '').trim(),
      fornecedor_cod: String(t.codigo_fornecedor || ''),
      fornecedor_cnpj: String(t.cnpj_fornecedor || ''),
      data_emissao: iso(t.emissao) || (nota ? iso(nota.data) : ''),
      data_vencimento: iso(t.vencimento),
      valor_total: num(t.valor),
      valor_pago: num(t.valor_pago),
      data_baixa: iso(t.data_baixa),
      parcela: parcela,
      total_parcelas: totalParcelas,
      tipo_docto: nota && /vista/i.test(nota.forma_pagamento || '') ? 'A vista' : 'Boleto',
      forma_pagamento: nota ? String(nota.forma_pagamento || '') : '',
      descricao: nota ? String(nota.natureza_operacao || '') : String(t.descricao_plano_conta || ''),
      natureza_codigo: nat.codigo,
      natureza: nat.nome,
      observacao_1: t.centro_custo ? 'Centro de custo: ' + t.centro_custo : '',
      observacao_2: nota && nota.num_pedido ? 'OS ' + nota.num_pedido : '',
      status: iso(t.data_baixa) ? 'PAGO' : 'ABERTO',
      empresa: 'RENOVA',
      origem: 'GENESIS'
    });
  }

  // ── Plano B: notas de entrada que ainda não viraram título ──
  let viaParticao = 0;
  for (const n of notas) {
    if (nfsUsadas.has(n.cod_id)) continue;
    const nat = sugerirNatureza(n);
    for (const p of particionar(n)) {
      viaParticao++;
      registros.push({
        fonte: 'NOTA_FISCAL',
        genesis_id: n.cod_id,
        numero_nf: rotularNF(n.num_nf, p.parcela, p.total_parcelas),
        numero_nf_puro: String(n.num_nf),
        numero_boleto: '',
        fornecedor: String(n.razao_cli || '').trim(),
        fornecedor_cod: String(n.codigo_cliente || ''),
        fornecedor_cnpj: String(n.cnpj_cli || ''),
        data_emissao: iso(n.data),
        data_vencimento: p.vencimento,
        valor_total: p.valor,
        valor_pago: 0,
        data_baixa: '',
        parcela: p.parcela,
        total_parcelas: p.total_parcelas,
        tipo_docto: /vista/i.test(n.forma_pagamento || '') ? 'A vista' : 'Boleto',
        forma_pagamento: String(n.forma_pagamento || ''),
        descricao: String(n.natureza_operacao || ''),
        natureza_codigo: nat.codigo,
        natureza: nat.nome,
        observacao_1: '',
        observacao_2: n.num_pedido ? 'OS ' + n.num_pedido : '',
        status: 'ABERTO',
        empresa: 'RENOVA',
        origem: 'GENESIS'
      });
    }
  }

  // ── Chave natural + dedupe dentro do próprio lote ──
  // O mesmo título pode chegar pelas duas fontes se o Genesis reemitiu a NF.
  // Quem chegou primeiro (contas a pagar) fica.
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

  const payload = {
    gerado_em: new Date().toISOString(),
    janela: { desde: DESDE, ate: ATE },
    total: finais.length,
    resumo: {
      via_contas_a_pagar: finais.filter(r => r.fonte === 'CONTAS_A_PAGAR').length,
      via_particao_nf: viaParticao,
      repetidos_descartados: repetidosNoLote,
      valor_total: Math.round(finais.reduce((s, r) => s + r.valor_total, 0) * 100) / 100
    },
    notas: finais
  };

  fs.writeFileSync(SAIDA, JSON.stringify(payload, null, 2));
  const kb = (fs.statSync(SAIDA).size / 1024).toFixed(0);
  console.log(`${finais.length} título(s) prontos para aprovação — ${kb} KB em integracao/contas-pagar-sync.json`);
  console.log(`  via contas a pagar: ${payload.resumo.via_contas_a_pagar}`);
  console.log(`  via partição de NF: ${viaParticao}`);
  console.log(`  repetidos no lote:  ${repetidosNoLote}`);
  console.log(`  valor total:        R$ ${payload.resumo.valor_total.toLocaleString('pt-BR')}`);

  if (tem('enviar')) await enviar(payload);
  else console.log('\nConfira o arquivo e rode de novo com  --enviar --api <url> --token <token>\npara mandar as notas para a fila de aprovação do portal.');
}

/**
 * Manda o lote para a aba SyncStaging pela API autenticada.
 * Em blocos de 300 para não estourar o limite de payload do Apps Script.
 */
async function enviar(payload) {
  if (!API) { console.error('Informe --api <url do /exec do contas-pagar>.'); process.exitCode = 1; return; }
  if (!TOKEN) { console.error('Informe --token <token da sessão>. Pegue no console do portal: RV.token'); process.exitCode = 1; return; }

  const chamar = corpo => fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ token: TOKEN }, corpo))
  }).then(r => r.json());

  // O primeiro bloco substitui o lote anterior; os demais são acrescentados.
  const BLOCO = 300;
  for (let i = 0; i < payload.notas.length; i += BLOCO) {
    const lote = payload.notas.slice(i, i + BLOCO);
    process.stdout.write(`Enviando ${i + 1}–${i + lote.length} de ${payload.notas.length}... `);
    const d = await chamar({
      action: i === 0 ? 'sync_gravar' : 'sync_acrescentar',
      notas: lote, gerado_em: payload.gerado_em, janela: payload.janela
    });
    if (!d.success) { console.log('FALHOU: ' + d.error); process.exitCode = 1; return; }
    console.log('ok');
  }
  console.log(`\n${payload.notas.length} nota(s) na fila de aprovação. Abra o portal → Contas a Pagar → Sincronizar Notas de Entrada.`);
}

extrair().catch(e => {
  console.error('Erro inesperado: ' + e.stack);
  process.exitCode = 1;
});
