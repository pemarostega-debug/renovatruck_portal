/**
 * Contas a Pagar — backend (Google Sheets como banco)
 * Portal de Gestão Renova (dash.renovatruck.com.br)
 *
 * COMO PUBLICAR (uma vez só):
 *  1. Abra a planilha base:
 *     https://docs.google.com/spreadsheets/d/1EftBE75ZtNOolVwpYN-Zs1OqhdvbpDNm4-DieoHuW_E/edit
 *  2. Menu  Extensões → Apps Script
 *  3. Apague o Codigo.gs e cole ESTE arquivo inteiro. Salve.
 *  4. Rode uma vez a função  instalar()  (menu de execução) para criar as abas
 *     e semear o Plano de Contas. Autorize quando pedir.
 *  5. Implantar → Nova implantação
 *       Tipo:            App da Web
 *       Executar como:   Eu
 *       Quem tem acesso: Qualquer pessoa
 *  6. Copie a URL /exec e cole em  CP.API  no index.html.
 *
 * QUANDO ATUALIZAR ESTE ARQUIVO: cole a nova versão e use
 * Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão.
 * Sem esse passo o Apps Script continua servindo o código antigo.
 *
 * AUTENTICAÇÃO: reaproveita as sessões emitidas pelo backend do Manual da
 * Empresa (mesma equipe, mesmas senhas). Ver validarToken() no fim do arquivo.
 */

const CP_PLANILHA_ID = '1EftBE75ZtNOolVwpYN-Zs1OqhdvbpDNm4-DieoHuW_E';

const ABA_TITULOS = 'Titulos';
const ABA_PLANO   = 'PlanoContas';
const ABA_FORN    = 'Fornecedores';
const ABA_LOG     = 'Log';
const ABA_CONFIG  = 'Config';
const ABA_SYNC    = 'SyncStaging';

// Notas do Genesis esperando aprovação. Ficam aqui, e não num JSON publicado
// no GitHub Pages, porque o repositório do portal é público: nome de
// fornecedor, CNPJ, número de nota e valor a pagar não podem sair daqui.
const CAB_SYNC = ['gerado_em', 'chave_origem', 'data_vencimento', 'fornecedor',
                  'fornecedor_cod', 'numero_nf', 'valor_total', 'json'];

/**
 * Ordem das colunas da aba Titulos. É contrato: o cliente (index.html) e os
 * scripts Node dependem desta ordem. Só acrescente no FIM, nunca reordene.
 */
const CAB_TITULOS = [
  'id',              // T-000001 — chave primária estável
  'origem',          // MANUAL | MIGRACAO | GENESIS
  'chave_origem',    // chave natural anti-duplicidade (ver chaveNatural)
  'empresa',         // RENOVA | VALE
  'data_emissao',
  'data_vencimento',
  'fornecedor',
  'fornecedor_cod',  // código no Genesis (vazio em lançamento manual)
  'numero_nf',
  'numero_boleto',
  'tipo_docto',
  'descricao',
  'natureza_codigo', // FK → PlanoContas.codigo
  'natureza',        // nome denormalizado (legibilidade na planilha)
  'observacao_1',
  'observacao_2',
  'forma_pagamento',
  'valor_total',
  'valor_pago',
  'status',          // ABERTO | PARCIAL | PAGO | CANCELADO
  'data_baixa',      // gerada pelo sistema
  'parcela',
  'total_parcelas',
  'competencia',     // YYYY-MM — eixo do DRE futuro
  'criado_em',
  'criado_por',
  'atualizado_em',
  'atualizado_por'
];

const COL = {};
CAB_TITULOS.forEach(function (nome, i) { COL[nome] = i; });

const CAB_PLANO = ['codigo', 'nome', 'codigo_pai', 'nivel', 'tipo', 'macro', 'ativo', 'ordem'];
const CAB_FORN  = ['codigo', 'nome', 'cnpj', 'natureza_padrao', 'ativo'];
const CAB_LOG   = ['quando', 'quem', 'acao', 'id_titulo', 'detalhe'];

const STATUS_VALIDOS = ['ABERTO', 'PARCIAL', 'PAGO', 'CANCELADO'];

// Colunas que guardam data de verdade (Date), não texto.
const COLUNAS_DATA = ['data_emissao', 'data_vencimento', 'data_baixa'];
// Colunas numéricas. Nunca gravar string aqui: a planilha está em pt-BR e
// converte "1,2" em 1.2 silenciosamente.
const COLUNAS_NUM = ['valor_total', 'valor_pago', 'parcela', 'total_parcelas'];

/**
 * Colunas que precisam de formato "Texto simples" forçado na planilha.
 *
 * Sem isso o Sheets tenta adivinhar o tipo do que está sendo escrito. Um
 * código de natureza como "1.01" é lido como DD.MM e vira a data 01/jan; a
 * competência "2026-08" é lida como agosto/2026 e também vira Date. O bug foi
 * pego em produção: bootstrap() devolvia "Thu Jan 01 2026 00:00:00 GMT-0300…"
 * no lugar do código toda vez que o dia.mês formava uma data válida — só
 * "9.99" sobreviveu, porque não existe dia 99.
 *
 * setNumberFormat('@') faz a planilha guardar o texto exatamente como veio,
 * sem tentar interpretar.
 */
const COLUNAS_TEXTO_FORCADO = ['natureza_codigo', 'competencia', 'numero_nf', 'numero_boleto'];

// ─────────────────────────────────────────────────────────────────────────────
// PLANO DE CONTAS INICIAL
// Quatro macro-naturezas exigidas pela Diretoria + um ramo de escape para
// lançamentos sem classificação. Nada entra no sistema sem cair em algum nó:
// o que não casa vai para 9.99 e aparece em vermelho no dashboard.
// ─────────────────────────────────────────────────────────────────────────────
const PLANO_INICIAL = [
  ['1',    'Despesas Operacionais',            '',  1, 'SINTETICA', 'OPERACIONAL',      'SIM', 100],
  ['1.01', 'Peças e Insumos',                  '1', 2, 'ANALITICA', 'OPERACIONAL',      'SIM', 101],
  ['1.02', 'Custos Produtivos',                '1', 2, 'ANALITICA', 'OPERACIONAL',      'SIM', 102],
  ['1.03', 'Combustível e Pedágio',            '1', 2, 'ANALITICA', 'OPERACIONAL',      'SIM', 103],
  ['1.04', 'Serviços de Terceiros',            '1', 2, 'ANALITICA', 'OPERACIONAL',      'SIM', 104],
  ['1.05', 'Frota e Manutenção',               '1', 2, 'ANALITICA', 'OPERACIONAL',      'SIM', 105],
  ['1.06', 'Comissões',                        '1', 2, 'ANALITICA', 'OPERACIONAL',      'SIM', 106],

  ['2',    'Despesas Fixas/Administrativas',   '',  1, 'SINTETICA', 'FIXO',             'SIM', 200],
  ['2.01', 'Aluguel',                          '2', 2, 'ANALITICA', 'FIXO',             'SIM', 201],
  ['2.02', 'Luz, Água e Internet',             '2', 2, 'ANALITICA', 'FIXO',             'SIM', 202],
  ['2.03', 'Folha de Pagamento',               '2', 2, 'ANALITICA', 'FIXO',             'SIM', 203],
  ['2.04', 'Despesas de Pessoal',              '2', 2, 'ANALITICA', 'FIXO',             'SIM', 204],
  ['2.05', 'Despesas Administrativas',         '2', 2, 'ANALITICA', 'FIXO',             'SIM', 205],
  ['2.06', 'Despesas de TI e Sistema',         '2', 2, 'ANALITICA', 'FIXO',             'SIM', 206],
  ['2.07', 'Despesas de Alimentação',          '2', 2, 'ANALITICA', 'FIXO',             'SIM', 207],
  ['2.08', 'Material de Uso e Copa',           '2', 2, 'ANALITICA', 'FIXO',             'SIM', 208],
  ['2.09', 'Infraestrutura e Segurança',       '2', 2, 'ANALITICA', 'FIXO',             'SIM', 209],
  ['2.10', 'Impostos e Taxas',                 '2', 2, 'ANALITICA', 'FIXO',             'SIM', 210],
  ['2.11', 'Marketing',                        '2', 2, 'ANALITICA', 'FIXO',             'SIM', 211],

  ['3',    'Despesas Financeiras',             '',  1, 'SINTETICA', 'FINANCEIRO',       'SIM', 300],
  ['3.01', 'Juros e Multas',                   '3', 2, 'ANALITICA', 'FINANCEIRO',       'SIM', 301],
  ['3.02', 'Empréstimos e Financiamentos',     '3', 2, 'ANALITICA', 'FINANCEIRO',       'SIM', 302],
  ['3.03', 'Tarifas Bancárias',                '3', 2, 'ANALITICA', 'FINANCEIRO',       'SIM', 303],
  ['3.04', 'Acordos e Parcelamentos',          '3', 2, 'ANALITICA', 'FINANCEIRO',       'SIM', 304],
  ['3.05', 'Protestos e Cartório',             '3', 2, 'ANALITICA', 'FINANCEIRO',       'SIM', 305],
  ['3.06', 'Sócios, Aportes e Acertos',        '3', 2, 'ANALITICA', 'FINANCEIRO',       'SIM', 306],

  ['4',    'CAPEX/Investimentos',              '',  1, 'SINTETICA', 'CAPEX',            'SIM', 400],
  ['4.01', 'Máquinas e Equipamentos',          '4', 2, 'ANALITICA', 'CAPEX',            'SIM', 401],
  ['4.02', 'Benfeitorias e Instalações',       '4', 2, 'ANALITICA', 'CAPEX',            'SIM', 402],
  ['4.03', 'Veículos',                         '4', 2, 'ANALITICA', 'CAPEX',            'SIM', 403],
  ['4.04', 'Software e Licenças',              '4', 2, 'ANALITICA', 'CAPEX',            'SIM', 404],

  ['9',    'Não Classificado',                 '',  1, 'SINTETICA', 'NAO_CLASSIFICADO', 'SIM', 900],
  ['9.99', 'A Classificar',                    '9', 2, 'ANALITICA', 'NAO_CLASSIFICADO', 'SIM', 999]
];

// ═════════════════════════════════════════════════════════════════════════════
// ROTEADOR HTTP
// ═════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    if (action === 'ping')         return json({ success: true, versao: 1, planilha: CP_PLANILHA_ID });
    if (action === 'bootstrap')    return json({ success: true, data: bootstrap(e.parameter) });
    if (action === 'titulos')      return json({ success: true, data: listarTitulos(e.parameter) });
    if (action === 'plano')        return json({ success: true, data: lerPlano() });
    if (action === 'fornecedores') return json({ success: true, data: lerFornecedores() });
    if (action === 'dashboard')    return json({ success: true, data: dashboard(e.parameter) });
    return json({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return json({ success: false, error: erroTexto(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || '';
    const sessao = validarToken(body.token);

    if (action === 'titulo_salvar')   return json({ success: true, data: salvarTitulo(body.titulo, sessao) });
    if (action === 'titulo_remover')  return json({ success: true, data: removerTitulo(body.id, sessao) });
    if (action === 'titulo_baixar')   return json({ success: true, data: baixarTitulos(body.baixas || [], sessao) });
    if (action === 'importar')        return json({ success: true, data: importar(body.titulos || [], body.origem || 'GENESIS', sessao) });
    if (action === 'checar_duplicidade') return json({ success: true, data: checarDuplicidade(body.chaves || []) });
    if (action === 'sync_gravar')      return json({ success: true, data: gravarStaging(body.notas || [], body.gerado_em, body.janela, sessao, true) });
    if (action === 'sync_acrescentar') return json({ success: true, data: gravarStaging(body.notas || [], body.gerado_em, body.janela, sessao, false) });
    if (action === 'sync_ler')         return json({ success: true, data: lerStaging() });
    if (action === 'plano_salvar')    return json({ success: true, data: salvarPlano(body.contas || [], sessao) });
    if (action === 'plano_remover')   return json({ success: true, data: removerConta(body.codigo, sessao) });

    return json({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return json({ success: false, error: erroTexto(err) });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// INSTALAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

/** Rode uma vez, na mão, depois de colar o script. Idempotente. */
function instalar() {
  const ss = SpreadsheetApp.openById(CP_PLANILHA_ID);
  garantirAba(ss, ABA_TITULOS, CAB_TITULOS);
  garantirAba(ss, ABA_PLANO,   CAB_PLANO);
  garantirAba(ss, ABA_FORN,    CAB_FORN);
  garantirAba(ss, ABA_LOG,     CAB_LOG);
  garantirAba(ss, ABA_CONFIG,  ['chave', 'valor']);
  garantirAba(ss, ABA_SYNC,    CAB_SYNC);

  // Formata ANTES de semear: a coluna já nasce em texto simples, então o
  // Sheets nunca chega a tentar interpretar "1.01" como data.
  formatarPlano(ss);
  formatarTitulos(ss);
  semearPlano(ss);

  // A planilha nova vem com uma "Página1" vazia que só atrapalha.
  const sobra = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (sobra && ss.getSheets().length > 1) ss.deleteSheet(sobra);

  Logger.log('Instalação concluída. Abas prontas e plano de contas semeado.');
  return 'ok';
}

function garantirAba(ss, nome, cabecalho) {
  let sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);

  const largura = Math.max(sh.getLastColumn(), cabecalho.length);
  const atual = sh.getLastRow() >= 1
    ? sh.getRange(1, 1, 1, largura).getValues()[0].map(String)
    : [];

  // Só reescreve o cabeçalho se estiver faltando coluna. Assim uma coluna
  // acrescentada no fim numa versão futura entra sem destruir o que já existe.
  const precisa = cabecalho.some(function (c, i) { return atual[i] !== c; });
  if (precisa) {
    sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
      .setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function formatarTitulos(ss) {
  const sh = ss.getSheetByName(ABA_TITULOS);
  const linhas = Math.max(sh.getMaxRows() - 1, 1);
  const fmtData = 'dd/mm/yyyy';
  COLUNAS_DATA.forEach(function (c) {
    sh.getRange(2, COL[c] + 1, linhas, 1).setNumberFormat(fmtData);
  });
  ['valor_total', 'valor_pago'].forEach(function (c) {
    sh.getRange(2, COL[c] + 1, linhas, 1).setNumberFormat('#,##0.00');
  });
  // Ver COLUNAS_TEXTO_FORCADO: sem isto "1.01" vira data e "2026-08" também.
  // O formato fica gravado na coluna inteira, então cada título novo (appendRow
  // ou setValues em bloco) já nasce protegido, sem precisar reaplicar.
  COLUNAS_TEXTO_FORCADO.forEach(function (c) {
    sh.getRange(2, COL[c] + 1, linhas, 1).setNumberFormat('@');
  });
  sh.setColumnWidth(COL.fornecedor + 1, 260);
  sh.setColumnWidth(COL.descricao + 1, 200);
  sh.setColumnWidth(COL.natureza + 1, 200);
}

/**
 * Mesma proteção da linha acima, para a coluna 'codigo' e 'codigo_pai' do
 * plano de contas. É onde o bug apareceu primeiro: "1.01" virando 01/jan.
 */
function formatarPlano(ss) {
  const sh = ss.getSheetByName(ABA_PLANO);
  const linhas = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, 1, linhas, 1).setNumberFormat('@');   // codigo
  sh.getRange(2, 3, linhas, 1).setNumberFormat('@');   // codigo_pai
}

function semearPlano(ss) {
  const sh = ss.getSheetByName(ABA_PLANO);
  if (sh.getLastRow() > 1) return; // já semeado, não mexe
  sh.getRange(2, 1, PLANO_INICIAL.length, CAB_PLANO.length).setValues(PLANO_INICIAL);
}

// ═════════════════════════════════════════════════════════════════════════════
// LEITURA
// ═════════════════════════════════════════════════════════════════════════════

function abaTitulos() {
  const ss = SpreadsheetApp.openById(CP_PLANILHA_ID);
  let sh = ss.getSheetByName(ABA_TITULOS);
  if (!sh) { instalar(); sh = ss.getSheetByName(ABA_TITULOS); }
  return sh;
}

/**
 * Lê a aba inteira de uma vez. Uma chamada de getValues em ~5.000 linhas custa
 * menos de um segundo; ler linha a linha estoura os 6 minutos do Apps Script.
 */
function lerTitulosBrutos() {
  const sh = abaTitulos();
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  return sh.getRange(2, 1, ultima - 1, CAB_TITULOS.length).getValues();
}

function linhaParaObjeto(linha) {
  const o = {};
  CAB_TITULOS.forEach(function (nome, i) {
    let v = linha[i];
    if (COLUNAS_DATA.indexOf(nome) >= 0)      v = dataParaISO(v);
    else if (COLUNAS_NUM.indexOf(nome) >= 0)  v = numero(v);
    else                                      v = v === null || v === undefined ? '' : String(v);
    o[nome] = v;
  });
  return o;
}

function listarTitulos(params) {
  params = params || {};
  const de  = params.de  || '';   // 'YYYY-MM-DD'
  const ate = params.ate || '';
  const emAberto = String(params.em_aberto || '') === '1';
  // Vem da query string, então é sempre texto: "0" também é uma string cheia.
  const comCancelados = String(params.incluir_cancelados || '') === '1';

  const linhas = lerTitulosBrutos();
  const out = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i][COL.id]) continue;
    const t = linhaParaObjeto(linhas[i]);
    if (t.status === 'CANCELADO' && !comCancelados) continue;
    if (emAberto && t.status === 'PAGO') continue;
    // Filtro por vencimento. Título sem vencimento nunca é escondido: some do
    // radar é justamente o que não pode acontecer numa conta a pagar.
    if (t.data_vencimento) {
      if (de && t.data_vencimento < de) continue;
      if (ate && t.data_vencimento > ate) continue;
    }
    out.push(t);
  }
  return out;
}

function lerPlano() {
  const ss = SpreadsheetApp.openById(CP_PLANILHA_ID);
  const sh = ss.getSheetByName(ABA_PLANO);
  if (!sh || sh.getLastRow() < 2) return [];
  const linhas = sh.getRange(2, 1, sh.getLastRow() - 1, CAB_PLANO.length).getValues();
  return linhas.filter(function (l) { return l[0] !== '' && l[0] !== null; }).map(function (l) {
    return {
      codigo: String(l[0]), nome: String(l[1]), codigo_pai: String(l[2] || ''),
      nivel: numero(l[3]) || 1, tipo: String(l[4] || 'ANALITICA'),
      macro: String(l[5] || 'OPERACIONAL'), ativo: String(l[6] || 'SIM').toUpperCase() !== 'NAO',
      ordem: numero(l[7]) || 0
    };
  }).sort(function (a, b) { return a.ordem - b.ordem; });
}

function lerFornecedores() {
  const ss = SpreadsheetApp.openById(CP_PLANILHA_ID);
  const sh = ss.getSheetByName(ABA_FORN);
  if (!sh || sh.getLastRow() < 2) return [];
  const linhas = sh.getRange(2, 1, sh.getLastRow() - 1, CAB_FORN.length).getValues();
  return linhas.filter(function (l) { return l[1]; }).map(function (l) {
    return {
      codigo: String(l[0] || ''), nome: String(l[1]), cnpj: String(l[2] || ''),
      natureza_padrao: String(l[3] || ''), ativo: String(l[4] || 'SIM').toUpperCase() !== 'NAO'
    };
  });
}

/** Uma chamada só para a tela abrir: evita 3 round-trips no Apps Script. */
function bootstrap(params) {
  return {
    titulos: listarTitulos(params || {}),
    plano: lerPlano(),
    fornecedores: lerFornecedores(),
    hoje: dataParaISO(new Date())
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ESCRITA — TÍTULOS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Chave natural de um título. É o que impede a mesma NF de entrar duas vezes.
 * Formato: NF|<num_nf>|<cod_fornecedor>|<parcela>
 *
 * O número da NF entra SEM o sufixo de parcela: na planilha ele aparece como
 * "45694/02" para o operador ler, mas a parcela já é um campo próprio. Se a
 * chave usasse o texto com sufixo, mudar a forma de exibir quebraria a trava
 * e a mesma nota entraria de novo.
 *
 * Quando não há NF (despesa avulsa, folha, aluguel), cai no fallback por
 * fornecedor + vencimento + valor, que é o que identifica um lançamento
 * repetido digitado à mão.
 */
function chaveNatural(t) {
  const parc = numero(t.parcela) || 1;
  const nf   = normalizarChave(nfBase(t.numero_nf, parc));
  const cod  = normalizarChave(t.fornecedor_cod);

  if (nf && cod) return 'NF|' + nf + '|' + cod + '|' + parc;
  if (nf)        return 'NF|' + nf + '|' + normalizarChave(t.fornecedor) + '|' + parc;

  return 'AV|' + normalizarChave(t.fornecedor) + '|' +
         (t.data_vencimento || '') + '|' + (numero(t.valor_total)).toFixed(2) + '|' + parc;
}

function normalizarChave(v) {
  return String(v === null || v === undefined ? '' : v)
    .trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Tira o sufixo de parcela do número da NF — e SÓ ele.
 *
 * Corta "45694/02" para "45694" quando a parcela é a 2. Não corta "2820/2026/01"
 * de uma parcela 1 para "2820" (aí o /01 é parte do número da nota, e duas
 * notas do mesmo fornecedor virariam a mesma chave), nem "Parcela 2/24", onde
 * o 24 é o total e não a parcela.
 *
 * Esta função existe idêntica em extrair-contas-pagar.js e migrar-planilha.js.
 * Se mudar aqui, mude nos três — é o que mantém a trava consistente.
 */
function nfBase(numeroNF, parcela) {
  const s = String(numeroNF === null || numeroNF === undefined ? '' : numeroNF).trim();
  const m = /^(.+)\/(\d{1,2})$/.exec(s);
  if (m && parseInt(m[2], 10) === (numero(parcela) || 1)) return m[1];
  return s;
}

/** Mapa chave_origem → id, montado numa leitura só. */
function indiceChaves(linhas) {
  const idx = {};
  for (let i = 0; i < linhas.length; i++) {
    const k = String(linhas[i][COL.chave_origem] || '');
    if (k) idx[k] = String(linhas[i][COL.id]);
  }
  return idx;
}

function proximoId(linhas) {
  let maior = 0;
  for (let i = 0; i < linhas.length; i++) {
    const m = /^T-(\d+)$/.exec(String(linhas[i][COL.id] || ''));
    if (m) maior = Math.max(maior, parseInt(m[1], 10));
  }
  return function () { maior++; return 'T-' + ('000000' + maior).slice(-6); };
}

/**
 * Monta a linha da planilha a partir do objeto do cliente.
 * Aqui é onde status, data de baixa e competência são DERIVADOS — o cliente
 * pode mandar o que quiser, quem decide é o servidor.
 */
function montarLinha(t, existente, quem) {
  const agora = new Date();
  const linha = new Array(CAB_TITULOS.length).fill('');

  const valorTotal = numero(t.valor_total);
  let valorPago    = numero(t.valor_pago);
  const venc       = paraData(t.data_vencimento);

  let status = String(t.status || '').toUpperCase();
  if (STATUS_VALIDOS.indexOf(status) < 0) status = 'ABERTO';

  // Quem foi marcado como pago mas veio sem valor: o valor pago é o total.
  // Rebaixar para ABERTO aqui apagaria uma baixa que alguém já fez.
  if (status === 'PAGO' && valorPago === 0) valorPago = valorTotal;

  // Coerência entre valor pago e status: quem manda é o dinheiro.
  // Pago acima do total (juros, multa) continua PAGO, não vira PARCIAL.
  if (status !== 'CANCELADO') {
    if (valorPago === 0)                                             status = 'ABERTO';
    else if (valorTotal > 0 && valorPago + 0.005 < valorTotal)       status = 'PARCIAL';
    else                                                             status = 'PAGO';
  }

  // Data da baixa: só existe quando saiu dinheiro. Se o operador informou,
  // respeita; senão usa o vencimento (regra de migração da Diretoria).
  let baixa = '';
  if (status === 'PAGO' || status === 'PARCIAL') {
    baixa = paraData(t.data_baixa) || venc || '';
  }

  const competencia = venc ? Utilities.formatDate(venc, 'GMT-3', 'yyyy-MM') : '';

  linha[COL.id]              = (existente && existente[COL.id]) || t.id || '';
  linha[COL.origem]          = String(t.origem || (existente ? existente[COL.origem] : 'MANUAL') || 'MANUAL');
  linha[COL.chave_origem]    = chaveNatural(t);
  linha[COL.empresa]         = String(t.empresa || 'RENOVA').toUpperCase();
  linha[COL.data_emissao]    = paraData(t.data_emissao) || '';
  linha[COL.data_vencimento] = venc || '';
  linha[COL.fornecedor]      = String(t.fornecedor || '').trim();
  linha[COL.fornecedor_cod]  = String(t.fornecedor_cod || '').trim();
  linha[COL.numero_nf]       = String(t.numero_nf || '').trim();
  linha[COL.numero_boleto]   = String(t.numero_boleto || '').trim();
  linha[COL.tipo_docto]      = String(t.tipo_docto || '').trim();
  linha[COL.descricao]       = String(t.descricao || '').trim();
  linha[COL.natureza_codigo] = String(t.natureza_codigo || '9.99').trim();
  linha[COL.natureza]        = String(t.natureza || '').trim();
  linha[COL.observacao_1]    = String(t.observacao_1 || '').trim();
  linha[COL.observacao_2]    = String(t.observacao_2 || '').trim();
  linha[COL.forma_pagamento] = String(t.forma_pagamento || '').trim();
  linha[COL.valor_total]     = valorTotal;
  linha[COL.valor_pago]      = valorPago;
  linha[COL.status]          = status;
  linha[COL.data_baixa]      = baixa;
  linha[COL.parcela]         = numero(t.parcela) || 1;
  linha[COL.total_parcelas]  = numero(t.total_parcelas) || 1;
  linha[COL.competencia]     = competencia;
  linha[COL.criado_em]       = (existente && existente[COL.criado_em]) || agora;
  linha[COL.criado_por]      = (existente && existente[COL.criado_por]) || quem;
  linha[COL.atualizado_em]   = agora;
  linha[COL.atualizado_por]  = quem;

  return linha;
}

function salvarTitulo(t, sessao) {
  if (!t) throw new Error('Título vazio.');
  if (!String(t.fornecedor || '').trim()) throw new Error('Informe o fornecedor.');
  if (!t.data_vencimento) throw new Error('Informe o vencimento.');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaTitulos();
    const linhas = lerTitulosBrutos();
    const quem = sessao.usuario;

    if (t.id) {
      const i = acharLinha(linhas, t.id);
      if (i < 0) throw new Error('Título ' + t.id + ' não encontrado.');
      const nova = montarLinha(t, linhas[i], quem);
      sh.getRange(i + 2, 1, 1, CAB_TITULOS.length).setValues([nova]);
      registrar(quem, 'EDITAR', t.id, t.fornecedor + ' — ' + numero(t.valor_total).toFixed(2));
      return { id: t.id, atualizado: true };
    }

    // Novo: barra duplicidade antes de gravar.
    const chave = chaveNatural(t);
    const idx = indiceChaves(linhas);
    if (idx[chave]) {
      throw new Error('Este título já existe na base (' + idx[chave] + '). ' +
                      'Se for mesmo outro lançamento, mude a NF ou a parcela.');
    }

    const gerar = proximoId(linhas);
    t.id = gerar();
    const nova = montarLinha(t, null, quem);
    sh.appendRow(nova);
    registrar(quem, 'CRIAR', t.id, t.fornecedor + ' — ' + numero(t.valor_total).toFixed(2));
    return { id: t.id, criado: true };
  } finally {
    lock.releaseLock();
  }
}

function acharLinha(linhas, id) {
  for (let i = 0; i < linhas.length; i++) {
    if (String(linhas[i][COL.id]) === String(id)) return i;
  }
  return -1;
}

/** Não apaga: marca CANCELADO. Conta a pagar sumida é conta a pagar esquecida. */
function removerTitulo(id, sessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaTitulos();
    const linhas = lerTitulosBrutos();
    const i = acharLinha(linhas, id);
    if (i < 0) throw new Error('Título ' + id + ' não encontrado.');

    sh.getRange(i + 2, COL.status + 1).setValue('CANCELADO');
    sh.getRange(i + 2, COL.atualizado_em + 1, 1, 2).setValues([[new Date(), sessao.usuario]]);
    // Libera a chave natural para o título poder ser relançado.
    sh.getRange(i + 2, COL.chave_origem + 1).setValue('');
    registrar(sessao.usuario, 'CANCELAR', id, '');
    return { id: id, cancelado: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Baixa em lote. Recebe [{id, valor_pago, data_baixa}] e escreve tudo numa
 * única passada de setValues por bloco contíguo — a tela de "vencendo hoje"
 * costuma baixar 20 títulos de uma vez.
 */
function baixarTitulos(baixas, sessao) {
  if (!baixas.length) return { baixados: 0 };

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaTitulos();
    const linhas = lerTitulosBrutos();
    const agora = new Date();
    let n = 0;

    baixas.forEach(function (b) {
      const i = acharLinha(linhas, b.id);
      if (i < 0) return;
      const total = numero(linhas[i][COL.valor_total]);
      const pago  = numero(b.valor_pago) || total;
      const baixa = paraData(b.data_baixa) || dataDe(linhas[i][COL.data_vencimento]) || agora;
      const status = (pago + 0.005 >= total || total === 0) ? 'PAGO' : 'PARCIAL';

      linhas[i][COL.valor_pago]    = pago;
      linhas[i][COL.status]        = status;
      linhas[i][COL.data_baixa]    = baixa;
      linhas[i][COL.atualizado_em] = agora;
      linhas[i][COL.atualizado_por] = sessao.usuario;
      n++;
    });

    if (n) sh.getRange(2, 1, linhas.length, CAB_TITULOS.length).setValues(linhas);
    registrar(sessao.usuario, 'BAIXAR', '', n + ' título(s)');
    return { baixados: n };
  } finally {
    lock.releaseLock();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// IMPORTAÇÃO EM LOTE (sincronização do Genesis e migração da planilha antiga)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Duas camadas de detecção, chamadas pelo modal ANTES de mostrar a lista.
 *
 * 1. EXATA — a chave natural já existe. Bloqueia: o título não entra.
 *
 * 2. SUSPEITA — mesmo número de NF e valor parecido, com qualquer fornecedor
 *    e QUALQUER parcela. Não bloqueia: avisa.
 *
 *    A comparação é solta de propósito, por dois motivos que aparecem no dado
 *    real da Renova:
 *
 *    a) A planilha antiga foi digitada sem o código do fornecedor, então
 *       "BLACK PRIME" migrado e "BLACK PRIME SUDESTE PROD. IND." vindo do
 *       Genesis (código 347) geram chaves diferentes para o mesmo título.
 *
 *    b) A planilha antiga também não diz QUAL parcela cada linha é — o
 *       controle ficava no número do boleto. A NF 215016 tem três parcelas no
 *       Genesis e só uma linha na planilha. Exigir a mesma parcela deixaria
 *       passar justamente a duplicata que interessa.
 *
 *    Bloquear seria errado (duas notas distintas podem ter o mesmo número em
 *    fornecedores diferentes), então marcamos e o operador decide.
 *
 * Recebe [{chave, numero_nf, parcela, valor_total, fornecedor}].
 * Aceita também um array de strings (só as chaves), para compatibilidade.
 */
function checarDuplicidade(itens) {
  const linhas = lerTitulosBrutos();
  const idx = indiceChaves(linhas);

  // Índice pelo número da NF → títulos já lançados (todas as parcelas).
  const porNF = {};
  for (let i = 0; i < linhas.length; i++) {
    if (String(linhas[i][COL.status]) === 'CANCELADO') continue;
    const parcelaLinha = numero(linhas[i][COL.parcela]) || 1;
    const nf = normalizarChave(nfBase(linhas[i][COL.numero_nf], parcelaLinha));
    if (!nf) continue;
    (porNF[nf] = porNF[nf] || []).push({
      id: String(linhas[i][COL.id]),
      fornecedor: String(linhas[i][COL.fornecedor]),
      fornecedor_cod: String(linhas[i][COL.fornecedor_cod]),
      valor_total: numero(linhas[i][COL.valor_total]),
      data_vencimento: dataParaISO(linhas[i][COL.data_vencimento]),
      parcela: parcelaLinha,
      total_parcelas: numero(linhas[i][COL.total_parcelas]) || 1
    });
  }

  const existentes = {};
  const suspeitos = {};

  (itens || []).forEach(function (it) {
    const item = typeof it === 'string' ? { chave: it } : (it || {});
    const chave = item.chave;
    if (!chave) return;

    if (idx[chave]) { existentes[chave] = idx[chave]; return; }

    const parcelaItem = numero(item.parcela) || 1;
    const nf = normalizarChave(nfBase(item.numero_nf, parcelaItem));
    if (!nf) return;
    const candidatos = porNF[nf] || [];
    if (!candidatos.length) return;

    // Valor próximo reforça que é o mesmo título; 2% cobre juros e desconto.
    const valor = numero(item.valor_total);
    const provaveis = candidatos.filter(function (c) {
      if (!valor || !c.valor_total) return true;
      return Math.abs(c.valor_total - valor) <= Math.max(valor * 0.02, 1);
    });
    if (provaveis.length) suspeitos[chave] = provaveis;
  });

  return { existentes: existentes, suspeitos: suspeitos };
}

/**
 * Grava N títulos numa única operação de escrita.
 *
 * A trava anti-duplicidade roda em duas camadas:
 *   1. contra o que já está na planilha (índice de chaves);
 *   2. contra o próprio lote (o Genesis pode devolver a mesma parcela duas
 *      vezes se a NF foi reemitida).
 * Ignorado nunca é erro: volta na resposta para o operador ver o que não entrou.
 */
function importar(titulos, origem, sessao) {
  if (!titulos.length) return { inseridos: 0, ignorados: [], erros: [] };
  if (titulos.length > 500) throw new Error('Lote grande demais (' + titulos.length + '). Envie em blocos de até 500.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = abaTitulos();
    const linhas = lerTitulosBrutos();
    const idx = indiceChaves(linhas);
    const gerar = proximoId(linhas);
    const quem = sessao.usuario;

    const novas = [];
    const ignorados = [];
    const erros = [];
    const noLote = {};

    titulos.forEach(function (t, pos) {
      try {
        if (!String(t.fornecedor || '').trim()) throw new Error('sem fornecedor');
        if (!t.data_vencimento) throw new Error('sem vencimento');

        const chave = chaveNatural(t);
        if (idx[chave])   { ignorados.push({ pos: pos, chave: chave, id: idx[chave], motivo: 'já existe na base' }); return; }
        if (noLote[chave]) { ignorados.push({ pos: pos, chave: chave, id: '', motivo: 'repetido no próprio lote' }); return; }

        noLote[chave] = true;
        t.origem = origem;
        t.id = gerar();
        novas.push(montarLinha(t, null, quem));
      } catch (err) {
        erros.push({ pos: pos, fornecedor: t && t.fornecedor, motivo: erroTexto(err) });
      }
    });

    if (novas.length) {
      sh.getRange(sh.getLastRow() + 1, 1, novas.length, CAB_TITULOS.length).setValues(novas);
    }
    registrar(quem, 'IMPORTAR', '', origem + ': ' + novas.length + ' incluído(s), ' +
              ignorados.length + ' ignorado(s), ' + erros.length + ' com erro');

    return { inseridos: novas.length, ignorados: ignorados, erros: erros };
  } finally {
    lock.releaseLock();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// STAGING DA SINCRONIZAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Recebe do extrair-contas-pagar.js as notas de entrada do Genesis.
 *
 * Com substituir=true limpa o lote anterior: o que interessa é sempre a última
 * leitura do ERP. Os blocos seguintes do mesmo envio vêm com substituir=false.
 * Nada aqui vira título — é uma sala de espera para o operador aprovar.
 */
function gravarStaging(notas, geradoEm, janela, sessao, substituir) {
  const ss = SpreadsheetApp.openById(CP_PLANILHA_ID);
  const sh = ss.getSheetByName(ABA_SYNC) || garantirAba(ss, ABA_SYNC, CAB_SYNC);
  const carimbo = geradoEm || new Date().toISOString();

  if (substituir && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, CAB_SYNC.length).clearContent();
  }

  const linhas = notas.map(function (n) {
    return [
      carimbo, String(n.chave_origem || ''), String(n.data_vencimento || ''),
      String(n.fornecedor || ''), String(n.fornecedor_cod || ''),
      String(n.numero_nf || ''), numero(n.valor_total), JSON.stringify(n)
    ];
  });
  if (linhas.length) {
    const primeira = Math.max(sh.getLastRow() + 1, 2);
    sh.getRange(primeira, 1, linhas.length, CAB_SYNC.length).setValues(linhas);
  }

  PropertiesService.getScriptProperties().setProperty('sync_janela', JSON.stringify(janela || {}));
  registrar(sessao.usuario, 'SYNC', '', linhas.length + ' nota(s) do Genesis em espera');
  return { gravadas: linhas.length, gerado_em: carimbo };
}

function lerStaging() {
  const ss = SpreadsheetApp.openById(CP_PLANILHA_ID);
  const sh = ss.getSheetByName(ABA_SYNC);
  if (!sh || sh.getLastRow() < 2) return { notas: [], gerado_em: '', janela: null };

  const linhas = sh.getRange(2, 1, sh.getLastRow() - 1, CAB_SYNC.length).getValues();
  const notas = [];
  linhas.forEach(function (l) {
    if (!l[7]) return;
    try { notas.push(JSON.parse(l[7])); } catch (e) { /* linha corrompida: ignora */ }
  });

  let janela = null;
  try { janela = JSON.parse(PropertiesService.getScriptProperties().getProperty('sync_janela') || 'null'); } catch (e) {}

  return { notas: notas, gerado_em: linhas.length ? String(linhas[0][0]) : '', janela: janela };
}

// ═════════════════════════════════════════════════════════════════════════════
// PLANO DE CONTAS (CRUD da árvore)
// ═════════════════════════════════════════════════════════════════════════════

function salvarPlano(contas, sessao) {
  const ss = SpreadsheetApp.openById(CP_PLANILHA_ID);
  const sh = ss.getSheetByName(ABA_PLANO);

  const codigos = {};
  contas.forEach(function (c) {
    const cod = String(c.codigo || '').trim();
    if (!cod) throw new Error('Conta sem código.');
    if (codigos[cod]) throw new Error('Código repetido: ' + cod);
    codigos[cod] = true;
  });
  // Pai tem que existir: árvore órfã quebra o rollup do dashboard.
  contas.forEach(function (c) {
    const pai = String(c.codigo_pai || '').trim();
    if (pai && !codigos[pai]) throw new Error('A conta ' + c.codigo + ' aponta para o pai ' + pai + ', que não existe.');
  });

  const linhas = contas.map(function (c, i) {
    return [
      String(c.codigo).trim(), String(c.nome || '').trim(), String(c.codigo_pai || '').trim(),
      numero(c.nivel) || (String(c.codigo).split('.').length),
      String(c.tipo || 'ANALITICA').toUpperCase(),
      String(c.macro || 'OPERACIONAL').toUpperCase(),
      c.ativo === false ? 'NAO' : 'SIM',
      numero(c.ordem) || (i + 1) * 10
    ];
  });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, CAB_PLANO.length).clearContent();
  if (linhas.length) sh.getRange(2, 1, linhas.length, CAB_PLANO.length).setValues(linhas);

  registrar(sessao.usuario, 'PLANO', '', linhas.length + ' conta(s)');
  return { gravadas: linhas.length };
}

/** Recusa apagar conta com filho ou com título lançado. */
function removerConta(codigo, sessao) {
  const plano = lerPlano();
  const filhos = plano.filter(function (c) { return c.codigo_pai === String(codigo); });
  if (filhos.length) throw new Error('A conta ' + codigo + ' tem ' + filhos.length + ' subconta(s). Remova-as antes.');

  const linhas = lerTitulosBrutos();
  const usos = linhas.filter(function (l) { return String(l[COL.natureza_codigo]) === String(codigo); }).length;
  if (usos) throw new Error('A conta ' + codigo + ' está em ' + usos + ' título(s). Reclassifique-os antes de remover.');

  return salvarPlano(plano.filter(function (c) { return c.codigo !== String(codigo); }), sessao);
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD — agregações feitas no servidor
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Devolve os números da Diretoria já consolidados. Fazer isso aqui em vez de
 * no navegador mantém a tela leve mesmo com anos de histórico na planilha.
 */
function dashboard(params) {
  params = params || {};
  const hoje = params.hoje ? paraData(params.hoje) : new Date();
  const iso = dataParaISO(hoje);
  const ref = params.competencia || iso.slice(0, 7); // 'YYYY-MM'

  const plano = lerPlano();
  const macroDe = {};
  plano.forEach(function (c) { macroDe[c.codigo] = c.macro; });

  const linhas = lerTitulosBrutos();
  const r = {
    competencia: ref,
    hoje: iso,
    previsto: 0, realizado: 0, em_aberto: 0,
    por_macro: {}, por_fornecedor: {}, por_natureza: {},
    atraso: { d1_14: { qtd: 0, valor: 0 }, d15_30: { qtd: 0, valor: 0 }, d30m: { qtd: 0, valor: 0 } },
    semanas: [], vencendo_hoje: 0, vencendo_hoje_valor: 0
  };

  const semanas = {};

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l[COL.id]) continue;
    const status = String(l[COL.status]);
    if (status === 'CANCELADO') continue;

    const venc = dataDe(l[COL.data_vencimento]);
    const vencISO = dataParaISO(venc);
    const total = numero(l[COL.valor_total]);
    const pago  = numero(l[COL.valor_pago]);
    const comp  = String(l[COL.competencia] || vencISO.slice(0, 7));

    // ── Mês de referência ──
    if (comp === ref) {
      r.previsto  += total;
      r.realizado += pago;
      if (status !== 'PAGO') r.em_aberto += (total - pago);

      const macro = macroDe[String(l[COL.natureza_codigo])] || 'NAO_CLASSIFICADO';
      r.por_macro[macro] = (r.por_macro[macro] || 0) + total;

      const forn = String(l[COL.fornecedor] || '(sem fornecedor)');
      r.por_fornecedor[forn] = (r.por_fornecedor[forn] || 0) + total;

      const nat = String(l[COL.natureza] || 'A Classificar');
      r.por_natureza[nat] = (r.por_natureza[nat] || 0) + total;

      // Burn rate: acumulado por semana do mês, pelo vencimento.
      if (venc) {
        const sem = Math.floor((venc.getDate() - 1) / 7) + 1;
        semanas[sem] = (semanas[sem] || 0) + total;
      }
    }

    // ── Régua de atraso: independe do mês de referência ──
    if (status !== 'PAGO' && vencISO && vencISO < iso) {
      const dias = Math.floor((hoje - venc) / 86400000);
      const saldo = total - pago;
      const faixa = dias > 30 ? 'd30m' : (dias >= 15 ? 'd15_30' : 'd1_14');
      r.atraso[faixa].qtd++;
      r.atraso[faixa].valor += saldo;
    }
    if (status !== 'PAGO' && vencISO === iso) {
      r.vencendo_hoje++;
      r.vencendo_hoje_valor += (total - pago);
    }
  }

  let acumulado = 0;
  for (let s = 1; s <= 5; s++) {
    acumulado += (semanas[s] || 0);
    r.semanas.push({ semana: s, valor: semanas[s] || 0, acumulado: acumulado });
  }

  r.top_fornecedores = Object.keys(r.por_fornecedor)
    .map(function (k) { return { fornecedor: k, valor: r.por_fornecedor[k] }; })
    .sort(function (a, b) { return b.valor - a.valor; })
    .slice(0, 5);

  return r;
}

// ═════════════════════════════════════════════════════════════════════════════
// SESSÃO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Os usuários e senhas do portal vivem no projeto do Manual da Empresa, que é
 * quem emite os tokens. Cada projeto Apps Script tem PropertiesService próprio,
 * então não dá para ler a sessão daqui: perguntamos para lá.
 *
 * O resultado fica 5 minutos em cache para que uma rajada de baixas não vire
 * uma rajada de UrlFetch. Cinco minutos é curto o bastante para uma revogação
 * de acesso surtir efeito rápido, e longo o bastante para a tela ficar fluida.
 */
const API_MANUAL = 'https://script.google.com/macros/s/AKfycbxmdLCRPZwf6u7l8BnbtqbomFRcjplzJOKCeNWSTRNCKq8M9NtO2uWO7DjEP-xN7WBkkg/exec';
const PAPEIS_COM_ESCRITA = ['admin', 'financeiro'];

function validarToken(token) {
  if (!token) throw new Error('Sessão expirada. Entre no sistema novamente.');

  const cache = CacheService.getScriptCache();
  const chave = 'sess_' + token;
  let sessao = null;

  const emCache = cache.get(chave);
  if (emCache) {
    sessao = JSON.parse(emCache);
  } else {
    let resposta;
    try {
      resposta = UrlFetchApp.fetch(API_MANUAL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ action: 'sessao_validar', token: token }),
        muteHttpExceptions: true,
        followRedirects: true
      });
    } catch (e) {
      throw new Error('Não consegui validar seu acesso agora (' + erroTexto(e) + '). Tente de novo em instantes.');
    }
    let d;
    try { d = JSON.parse(resposta.getContentText()); }
    catch (e) { throw new Error('Resposta inesperada do serviço de login. Tente novamente.'); }

    if (!d.success) throw new Error(d.error || 'Sessão inválida ou expirada. Entre novamente.');
    sessao = { usuario: d.usuario, nome: d.nome, papel: d.papel };
    cache.put(chave, JSON.stringify(sessao), 300);
  }

  if (PAPEIS_COM_ESCRITA.indexOf(String(sessao.papel)) < 0) {
    throw new Error('Seu usuário não tem permissão para alterar contas a pagar.');
  }
  return sessao;
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Converte para número aceitando o que o operador digita de verdade:
 * "1.234,56" (pt-BR), "1234.56" e Date/número puro.
 */
function numero(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (s === '') return 0;
  const temVirgula = s.indexOf(',') >= 0;
  const temPonto = s.indexOf('.') >= 0;
  if (temVirgula && temPonto) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (temVirgula)        s = s.replace(',', '.');                    // 1234,56
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Aceita Date, 'YYYY-MM-DD' e 'DD/MM/YYYY'. Devolve Date ou null. */
function paraData(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function dataDe(v) { return paraData(v); }

function dataParaISO(v) {
  const d = paraData(v);
  if (!d) return '';
  return Utilities.formatDate(d, 'GMT-3', 'yyyy-MM-dd');
}

function registrar(quem, acao, id, detalhe) {
  try {
    const ss = SpreadsheetApp.openById(CP_PLANILHA_ID);
    const sh = ss.getSheetByName(ABA_LOG) || garantirAba(ss, ABA_LOG, CAB_LOG);
    sh.appendRow([new Date(), quem || '', acao, id || '', detalhe || '']);
  } catch (e) {
    // Log é apoio: se falhar, a operação principal não pode cair junto.
    Logger.log('Falha ao registrar log: ' + e);
  }
}

function erroTexto(err) {
  return String(err && err.message ? err.message : err);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
