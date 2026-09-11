/**
 * Contas a Receber + Operações Financeiras — backend (Google Sheets como banco)
 * Portal de Gestão Renova (dash.renovatruck.com.br)
 *
 * COMO PUBLICAR (uma vez só):
 *  1. Crie um projeto NOVO em https://script.google.com  (não reaproveite o do
 *     Contas a Pagar: cada projeto Apps Script só admite um doGet/doPost).
 *  2. Apague o Codigo.gs e cole ESTE arquivo inteiro. Salve.
 *  3. Rode a função  instalar()  uma vez. Ela cria as abas na MESMA planilha do
 *     Contas a Pagar e semeia os parceiros/políticas de exemplo. Autorize.
 *  4. Implantar → Nova implantação
 *       Tipo:            App da Web
 *       Executar como:   Eu
 *       Quem tem acesso: Qualquer pessoa
 *  5. Copie a URL /exec e cole em  CR.API  no index.html.
 *
 * QUANDO ATUALIZAR ESTE ARQUIVO: cole a nova versão e use
 * Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão.
 * Sem esse passo o Apps Script continua servindo o código antigo.
 *
 * AUTENTICAÇÃO: reaproveita as sessões emitidas pelo backend do Manual da
 * Empresa, igual ao Contas a Pagar. Ver validarToken() no fim do arquivo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE MÓDULO É UM SÓ
 *
 * Antecipação não é um relatório sobre o contas a receber: é uma mudança de
 * dono do título. Depois de antecipado, o dinheiro do vencimento não entra
 * mais no caixa da Renova — mas a cobrança continua sendo problema dela,
 * porque a coobrigação não vai embora junto com o título. Separar as duas
 * telas produziria dois números de "a receber" que nunca fecham entre si.
 * Aqui existe um número só, e a coluna `antecipado` diz de quem ele é.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Mesma planilha do Contas a Pagar: é o banco financeiro único da empresa.
const CR_PLANILHA_ID = '1EftBE75ZtNOolVwpYN-Zs1OqhdvbpDNm4-DieoHuW_E';

/**
 * URL /exec do Contas a Pagar. É por aqui que o custo da operação vira despesa
 * financeira lançada e baixada — ver liquidarOperacao().
 *
 * Poderia escrever direto na aba `Titulos` (é a mesma planilha), e foi assim na
 * primeira versão. Não é seguro: LockService.getScriptLock() é POR PROJETO, e
 * dois projetos diferentes escrevendo com getLastRow()+1 na mesma aba podem
 * gravar na mesma linha e perder um título. Passando pela API do Contas a
 * Pagar quem grava é sempre o mesmo script, sob o mesmo lock, com o mesmo
 * gerador de id e a mesma proteção de formato de texto.
 */
const CR_API_CONTAS_PAGAR = 'https://script.google.com/macros/s/AKfycbyES-4fUjuDv_4t-Jm4_cqgMiVrnGm_fOvb5qgGMcjZDXt5FKPldZtNPiUMhLoaRYa0/exec';

/** Conta do plano que recebe o deságio das operações. */
const CR_NATUREZA_JUROS = '3.07';
const CR_NATUREZA_JUROS_NOME = 'Juros de Operações Financeiras';

const ABA_REC_TITULOS   = 'RecTitulos';
const ABA_REC_PARCEIROS = 'RecParceiros';
const ABA_REC_POLITICAS = 'RecPoliticas';
const ABA_REC_OPERACOES = 'RecOperacoes';
const ABA_REC_ITENS     = 'RecOperacaoItens';
const ABA_REC_ANTECIP   = 'RecAntecipOS';
const ABA_REC_SYNC      = 'RecSyncStaging';
const ABA_REC_LOG       = 'RecLog';

/**
 * Ordem das colunas da aba RecTitulos. É contrato: o cliente (index.html) e o
 * extrator Node dependem desta ordem. Só acrescente no FIM, nunca reordene.
 */
const CAB_REC_TITULOS = [
  'id',                // R-000001 — chave primária estável
  'origem',            // GENESIS | MANUAL
  'chave_origem',      // chave natural anti-duplicidade (ver chaveNaturalRec)
  'empresa',           // RENOVA | VALE
  'data_emissao',
  'data_vencimento',
  'cliente',
  'cliente_cod',       // codigo_cliente no Genesis
  'cliente_cnpj',      // o fundo exige CNPJ do sacado no borderô
  'numero_nf',
  'num_os',            // num_pedido da vw_notas_fiscais — é o elo com a OS
  'natureza_operacao',
  'descricao',
  'forma_pagamento',
  'valor_total',
  'valor_recebido',
  'status',            // ABERTO | PARCIAL | RECEBIDO | CANCELADO
  'data_recebimento',
  'parcela',
  'total_parcelas',
  'competencia',       // YYYY-MM — derivada do vencimento
  'antecipado',        // SIM | NAO
  'operacao_id',       // O-000001 quando antecipado
  'parceiro_id',       // P-001 quando antecipado
  'situacao_antec',    // '' | ANTECIPADO | LIQUIDADO | RECOMPRADO
  'recompra_em',       // data em que a empresa recomprou o título do parceiro
  'observacao',
  'criado_em',
  'criado_por',
  'atualizado_em',
  'atualizado_por'
];

const RT = {};
CAB_REC_TITULOS.forEach(function (nome, i) { RT[nome] = i; });

const CAB_REC_PARCEIROS = [
  'id', 'nome', 'tipo', 'cnpj', 'contato', 'email', 'telefone',
  'taxa_mes',        // % ao mês cobrada sobre o valor de face
  'tarifa_titulo',   // R$ fixo por duplicata (TAD)
  'tac',             // R$ fixo por operação
  'dias_float',      // dias que o parceiro soma ao prazo na hora de calcular
  'limite',          // teto de exposição concedido pelo parceiro
  'ativo', 'observacao',
  'criado_em', 'criado_por', 'atualizado_em', 'atualizado_por'
];
const PA = {};
CAB_REC_PARCEIROS.forEach(function (nome, i) { PA[nome] = i; });

const CAB_REC_POLITICAS = [
  'cliente_cod', 'cliente',
  'permite_os',        // SIM | NAO — pode antecipar OS ainda sem pedido?
  'pct_max_os',        // % máximo do valor da OS que entra no borderô
  'dias_ate_faturar',  // OS → NF, em dias
  'dias_prazo_venc',   // NF → vencimento, em dias
  'teto_exposicao',    // R$ máximo antecipado em aberto para este cliente
  'ativo', 'observacao', 'atualizado_em', 'atualizado_por'
];
const PO = {};
CAB_REC_POLITICAS.forEach(function (nome, i) { PO[nome] = i; });

const CAB_REC_OPERACOES = [
  'id',              // O-000001
  'numero',          // sequencial legível, usado no borderô
  'parceiro_id', 'parceiro',
  'data_operacao',
  'status',          // RASCUNHO | ENVIADA | APROVADA | LIQUIDADA | CANCELADA
  'qtd_titulos', 'qtd_os',
  'valor_bruto',
  'prazo_medio',     // dias, média ponderada pelo valor
  'taxa_mes', 'tarifa_titulo', 'tac',
  'desagio_estimado', 'liquido_estimado',
  'valor_liquido',   // o que o parceiro creditou de verdade
  'custo_real',      // bruto − líquido
  'taxa_efetiva_mes',
  'data_credito',
  'titulo_despesa_id', // id do título 3.07 gerado no Contas a Pagar
  'observacao',
  'criado_em', 'criado_por', 'atualizado_em', 'atualizado_por'
];
const OP = {};
CAB_REC_OPERACOES.forEach(function (nome, i) { OP[nome] = i; });

const CAB_REC_ITENS = [
  'operacao_id',
  'tipo',            // TITULO | OS
  'ref_id',          // R-000001 (título) ou A-000001 (antecipação de OS)
  'num_os', 'numero_nf', 'parcela',
  'cliente', 'cliente_cod',
  'vencimento', 'valor', 'prazo_dias'
];
const IT = {};
CAB_REC_ITENS.forEach(function (nome, i) { IT[nome] = i; });

const CAB_REC_ANTECIP = [
  'id',              // A-000001
  'num_os', 'cliente', 'cliente_cod',
  'valor_os',        // valor da OS no Genesis quando foi antecipada
  'valor_antecipado',// o que efetivamente entrou no borderô (pct da política)
  'vencimento_estimado',
  'operacao_id', 'parceiro_id',
  'status',          // AGUARDANDO_FATURAMENTO | FATURADA | CANCELADA
  'nfs_geradas',     // "356, 367" — preenchido na reconciliação
  'valor_faturado',  // soma dos títulos das NFs geradas
  'faturado_em',
  'observacao',
  'criado_em', 'criado_por', 'atualizado_em', 'atualizado_por'
];
const AN = {};
CAB_REC_ANTECIP.forEach(function (nome, i) { AN[nome] = i; });

const CAB_REC_SYNC = ['gerado_em', 'chave_origem', 'data_emissao', 'data_vencimento',
                      'cliente', 'cliente_cod', 'numero_nf', 'num_os',
                      'valor_total', 'parcela', 'total_parcelas', 'json'];

const CAB_REC_LOG = ['quando', 'quem', 'acao', 'ref', 'detalhe'];

const REC_STATUS_VALIDOS = ['ABERTO', 'PARCIAL', 'RECEBIDO', 'CANCELADO'];
const OP_STATUS_VALIDOS  = ['RASCUNHO', 'ENVIADA', 'APROVADA', 'LIQUIDADA', 'CANCELADA'];

const REC_COLUNAS_DATA = ['data_emissao', 'data_vencimento', 'data_recebimento', 'recompra_em'];
const REC_COLUNAS_NUM  = ['valor_total', 'valor_recebido', 'parcela', 'total_parcelas'];

/**
 * Colunas que precisam de formato "Texto simples" na planilha.
 *
 * A lição veio pronta do Contas a Pagar e custou 53 naturezas perdidas lá: o
 * Sheets adivinha o tipo do que está sendo escrito. "2026-08" vira agosto/2026,
 * e um num_os como "4.753" viraria número. appendRow() interpreta ANTES de
 * encostar na célula, ignorando o formato — por isso toda escrita aqui é
 * forcarTextoRec() seguido de setValues(), nunca appendRow.
 */
const REC_COLUNAS_TEXTO = ['competencia', 'numero_nf', 'num_os', 'cliente_cod', 'cliente_cnpj'];

// Naturezas de operação que geram contas a receber. O Genesis grava o texto
// completo do CFOP, que muda de nota para nota ("Venda de mercadoria adqu/..."),
// então casamos por prefixo em vez de igualdade.
const CR_NATUREZAS_VENDA = ['VENDA', 'PRESTA', 'SERVI', 'REMESSA'];

// ═════════════════════════════════════════════════════════════════════════════
// ROTEADOR HTTP
// ═════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    if (action === 'ping')       return jsonR({ success: true, versao: 1, planilha: CR_PLANILHA_ID });
    if (action === 'bootstrap')  return jsonR({ success: true, data: bootstrapRec() });
    if (action === 'titulos')    return jsonR({ success: true, data: lerTitulosRec() });
    if (action === 'parceiros')  return jsonR({ success: true, data: lerParceiros() });
    if (action === 'politicas')  return jsonR({ success: true, data: lerPoliticas() });
    if (action === 'operacoes')  return jsonR({ success: true, data: lerOperacoes() });
    return jsonR({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return jsonR({ success: false, error: erroTextoRec(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || '';
    const sessao = validarTokenRec(body.token);

    // A chave de serviço (cron) só mexe na fila de sincronização. Se vazar, o
    // pior que dá para fazer é reescrever a fila de aprovação — nada vira
    // título sem alguém clicar "aprovar" no portal.
    if (sessao.servico && ['sync_gravar', 'sync_acrescentar', 'sync_ler'].indexOf(action) < 0) {
      return jsonR({ success: false, error: 'Chave de serviço só pode sincronizar notas de saída.' });
    }

    if (action === 'titulo_salvar')     return jsonR({ success: true, data: salvarTituloRec(body.titulo, sessao) });
    if (action === 'titulo_cancelar')   return jsonR({ success: true, data: cancelarTituloRec(body.id, sessao) });
    if (action === 'titulo_baixar')     return jsonR({ success: true, data: baixarTitulosRec(body.baixas || [], sessao) });
    if (action === 'titulo_recompra')   return jsonR({ success: true, data: marcarRecompra(body.ids || [], body.data, sessao) });

    if (action === 'parceiro_salvar')   return jsonR({ success: true, data: salvarParceiro(body.parceiro, sessao) });
    if (action === 'parceiro_remover')  return jsonR({ success: true, data: removerParceiro(body.id, sessao) });

    if (action === 'politica_salvar')   return jsonR({ success: true, data: salvarPolitica(body.politica, sessao) });
    if (action === 'politica_remover')  return jsonR({ success: true, data: removerPolitica(body.cliente_cod, sessao) });

    if (action === 'operacao_criar')    return jsonR({ success: true, data: criarOperacao(body.operacao || {}, body.itens || [], sessao) });
    if (action === 'operacao_status')   return jsonR({ success: true, data: mudarStatusOperacao(body.id, body.status, sessao) });
    if (action === 'operacao_liquidar') return jsonR({ success: true, data: liquidarOperacao(body, sessao) });
    if (action === 'operacao_relancar') return jsonR({ success: true, data: relancarDespesa(body.id, sessao) });
    if (action === 'operacao_cancelar') return jsonR({ success: true, data: cancelarOperacao(body.id, sessao) });

    if (action === 'sync_gravar')       return jsonR({ success: true, data: gravarStagingRec(body.notas || [], body.gerado_em, body.janela, true) });
    if (action === 'sync_acrescentar')  return jsonR({ success: true, data: gravarStagingRec(body.notas || [], body.gerado_em, body.janela, false) });
    if (action === 'sync_ler')          return jsonR({ success: true, data: lerStagingRec() });
    if (action === 'sync_aprovar')      return jsonR({ success: true, data: aprovarStagingRec(body.chaves || [], sessao) });

    if (action === 'reconciliar_os')    return jsonR({ success: true, data: reconciliarAntecipacoesOS(sessao) });

    return jsonR({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return jsonR({ success: false, error: erroTextoRec(err) });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// INSTALAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

/** Rode uma vez, na mão, depois de colar o script. Idempotente. */
function instalar() {
  const ss = SpreadsheetApp.openById(CR_PLANILHA_ID);
  garantirAbaRec(ss, ABA_REC_TITULOS,   CAB_REC_TITULOS);
  garantirAbaRec(ss, ABA_REC_PARCEIROS, CAB_REC_PARCEIROS);
  garantirAbaRec(ss, ABA_REC_POLITICAS, CAB_REC_POLITICAS);
  garantirAbaRec(ss, ABA_REC_OPERACOES, CAB_REC_OPERACOES);
  garantirAbaRec(ss, ABA_REC_ITENS,     CAB_REC_ITENS);
  garantirAbaRec(ss, ABA_REC_ANTECIP,   CAB_REC_ANTECIP);
  garantirAbaRec(ss, ABA_REC_SYNC,      CAB_REC_SYNC);
  garantirAbaRec(ss, ABA_REC_LOG,       CAB_REC_LOG);

  formatarRecTitulos(ss);
  Logger.log('Contas a Receber instalado. Abas criadas na planilha ' + CR_PLANILHA_ID);
  return 'ok';
}

function garantirAbaRec(ss, nome, cabecalho) {
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

function formatarRecTitulos(ss) {
  const sh = ss.getSheetByName(ABA_REC_TITULOS);
  const linhas = Math.max(sh.getMaxRows() - 1, 1);
  REC_COLUNAS_DATA.forEach(function (c) {
    sh.getRange(2, RT[c] + 1, linhas, 1).setNumberFormat('dd/mm/yyyy');
  });
  ['valor_total', 'valor_recebido'].forEach(function (c) {
    sh.getRange(2, RT[c] + 1, linhas, 1).setNumberFormat('#,##0.00');
  });
  REC_COLUNAS_TEXTO.forEach(function (c) {
    sh.getRange(2, RT[c] + 1, linhas, 1).setNumberFormat('@');
  });
  sh.setColumnWidth(RT.cliente + 1, 280);
  sh.setColumnWidth(RT.natureza_operacao + 1, 220);
}

function forcarTextoRec(sh, linha) {
  REC_COLUNAS_TEXTO.forEach(function (c) {
    sh.getRange(linha, RT[c] + 1).setNumberFormat('@');
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// LEITURA
// ═════════════════════════════════════════════════════════════════════════════

function abaRec(nome, cabecalho) {
  const ss = SpreadsheetApp.openById(CR_PLANILHA_ID);
  let sh = ss.getSheetByName(nome);
  if (!sh) { instalar(); sh = ss.getSheetByName(nome); }
  return sh;
}

/** Lê a aba inteira de uma vez: ler linha a linha estoura os 6 min do Apps Script. */
function lerBruto(nome, cabecalho) {
  const sh = abaRec(nome, cabecalho);
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  return sh.getRange(2, 1, ultima - 1, cabecalho.length).getValues();
}

function objetoDe(linha, cabecalho, colunasData, colunasNum) {
  const o = {};
  cabecalho.forEach(function (nome, i) {
    let v = linha[i];
    if (colunasData && colunasData.indexOf(nome) >= 0)     v = dataParaISORec(v);
    else if (colunasNum && colunasNum.indexOf(nome) >= 0)  v = numeroRec(v);
    else v = v === null || v === undefined ? '' : String(v);
    o[nome] = v;
  });
  return o;
}

function lerTitulosRec() {
  return lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS)
    .filter(function (l) { return l[RT.id]; })
    .map(function (l) { return objetoDe(l, CAB_REC_TITULOS, REC_COLUNAS_DATA, REC_COLUNAS_NUM); });
}

function lerParceiros() {
  const num = ['taxa_mes', 'tarifa_titulo', 'tac', 'dias_float', 'limite'];
  return lerBruto(ABA_REC_PARCEIROS, CAB_REC_PARCEIROS)
    .filter(function (l) { return l[PA.id]; })
    .map(function (l) {
      const o = objetoDe(l, CAB_REC_PARCEIROS, [], num);
      o.ativo = String(l[PA.ativo]).toUpperCase() !== 'NAO';
      return o;
    });
}

function lerPoliticas() {
  const num = ['pct_max_os', 'dias_ate_faturar', 'dias_prazo_venc', 'teto_exposicao'];
  return lerBruto(ABA_REC_POLITICAS, CAB_REC_POLITICAS)
    .filter(function (l) { return String(l[PO.cliente_cod] || '').trim(); })
    .map(function (l) {
      const o = objetoDe(l, CAB_REC_POLITICAS, [], num);
      o.permite_os = String(l[PO.permite_os]).toUpperCase() !== 'NAO';
      o.ativo = String(l[PO.ativo]).toUpperCase() !== 'NAO';
      return o;
    });
}

function lerOperacoes() {
  const num = ['qtd_titulos', 'qtd_os', 'valor_bruto', 'prazo_medio', 'taxa_mes',
               'tarifa_titulo', 'tac', 'desagio_estimado', 'liquido_estimado',
               'valor_liquido', 'custo_real', 'taxa_efetiva_mes'];
  const dat = ['data_operacao', 'data_credito'];
  const ops = lerBruto(ABA_REC_OPERACOES, CAB_REC_OPERACOES)
    .filter(function (l) { return l[OP.id]; })
    .map(function (l) { return objetoDe(l, CAB_REC_OPERACOES, dat, num); });

  // Os itens vão junto: a tela de operações precisa saber o que tem dentro de
  // cada borderô, e uma segunda chamada só para isso dobraria a latência.
  const porOp = {};
  lerBruto(ABA_REC_ITENS, CAB_REC_ITENS).forEach(function (l) {
    const id = String(l[IT.operacao_id] || '');
    if (!id) return;
    (porOp[id] = porOp[id] || []).push(objetoDe(l, CAB_REC_ITENS, ['vencimento'], ['valor', 'prazo_dias', 'parcela']));
  });
  ops.forEach(function (o) { o.itens = porOp[o.id] || []; });
  return ops;
}

function lerAntecipacoesOS() {
  const num = ['valor_os', 'valor_antecipado', 'valor_faturado'];
  const dat = ['vencimento_estimado', 'faturado_em'];
  return lerBruto(ABA_REC_ANTECIP, CAB_REC_ANTECIP)
    .filter(function (l) { return l[AN.id]; })
    .map(function (l) { return objetoDe(l, CAB_REC_ANTECIP, dat, num); });
}

/**
 * Tudo o que a tela precisa numa chamada só. Uma rajada de GETs no Apps Script
 * custa mais em latência do que em processamento — o portal abre com um fetch.
 */
function bootstrapRec() {
  return {
    titulos: lerTitulosRec(),
    parceiros: lerParceiros(),
    politicas: lerPoliticas(),
    operacoes: lerOperacoes(),
    antecipacoes_os: lerAntecipacoesOS(),
    fila_sync: contarStagingRec(),
    hoje: Utilities.formatDate(new Date(), 'GMT-3', 'yyyy-MM-dd')
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAVE NATURAL E IDs
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Identidade de um título a receber: nota + cliente + emissão + parcela.
 *
 * A DATA DE EMISSÃO faz parte da chave, e não é excesso de zelo: o Genesis
 * reaproveita numeração de NF entre séries. Existem hoje 7 pares de notas
 * diferentes com o mesmo num_nf para o mesmo cliente — a NF 301 da JSL IN
 * LOADER é R$ 281,46 da OS 4463 em 15/07 e também R$ 1.610,00 da OS 4267 em
 * 04/08. Sem a emissão na chave, uma das duas seria barrada como duplicata e a
 * empresa perderia o recebível calada.
 *
 * Sem NF (adiantamento, acerto manual) cai no fallback por cliente +
 * vencimento + valor, que é o que identifica um lançamento repetido digitado
 * à mão.
 *
 * Esta função existe idêntica em extrair-contas-receber.js. Mudou aqui, mude lá.
 */
function chaveNaturalRec(t) {
  const parc = numeroRec(t.parcela) || 1;
  const nf   = normalizarChaveRec(nfBaseRec(t.numero_nf, parc));
  const cod  = normalizarChaveRec(t.cliente_cod);
  const emi  = dataParaISORec(t.data_emissao);

  if (nf && cod) return 'NF|' + nf + '|' + cod + '|' + emi + '|' + parc;
  if (nf)        return 'NF|' + nf + '|' + normalizarChaveRec(t.cliente) + '|' + emi + '|' + parc;

  return 'AV|' + normalizarChaveRec(t.cliente) + '|' +
         (dataParaISORec(t.data_vencimento) || '') + '|' + numeroRec(t.valor_total).toFixed(2) + '|' + parc;
}

/**
 * `numero_nf` é guardado SEMPRE puro ("369"), nunca "369/02" — a parcela já é
 * campo próprio, e a tela remonta o rótulo na hora de exibir.
 *
 * Esta função existe só para o cadastro manual: quem digita copia o número do
 * boleto e escreve "369/2" por hábito. Corta o sufixo apenas quando ele bate
 * com a parcela informada, para não estragar um número de nota que legitimamente
 * termine em barra-dígito.
 */
function nfBaseRec(numeroNF, parcela) {
  const s = String(numeroNF === null || numeroNF === undefined ? '' : numeroNF).trim();
  const m = /^(.+)\/(\d{1,2})$/.exec(s);
  if (m && parseInt(m[2], 10) === (numeroRec(parcela) || 1)) return m[1];
  return s;
}

function normalizarChaveRec(v) {
  return String(v === null || v === undefined ? '' : v)
    .trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function proximoIdRec(linhas, coluna, prefixo, largura) {
  let maior = 0;
  const re = new RegExp('^' + prefixo + '(\\d+)$');
  for (let i = 0; i < linhas.length; i++) {
    const m = re.exec(String(linhas[i][coluna] || ''));
    if (m) maior = Math.max(maior, parseInt(m[1], 10));
  }
  return function () {
    maior++;
    return prefixo + (new Array(largura + 1).join('0') + maior).slice(-largura);
  };
}

function acharLinhaRec(linhas, coluna, id) {
  for (let i = 0; i < linhas.length; i++) {
    if (String(linhas[i][coluna]) === String(id)) return i;
  }
  return -1;
}

// ═════════════════════════════════════════════════════════════════════════════
// TÍTULOS A RECEBER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Monta a linha da planilha. Status, data de recebimento e competência são
 * DERIVADOS aqui — o cliente pode mandar o que quiser, quem decide é o servidor.
 */
function montarLinhaRec(t, existente, quem) {
  const agora = new Date();
  const linha = new Array(CAB_REC_TITULOS.length).fill('');

  const valorTotal = numeroRec(t.valor_total);
  let recebido     = numeroRec(t.valor_recebido);
  const venc       = paraDataRec(t.data_vencimento);

  let status = String(t.status || '').toUpperCase();
  if (REC_STATUS_VALIDOS.indexOf(status) < 0) status = 'ABERTO';

  // Marcado como recebido sem valor: o recebido é o total. Rebaixar para
  // ABERTO aqui apagaria uma baixa que alguém já deu.
  if (status === 'RECEBIDO' && recebido === 0) recebido = valorTotal;

  // Coerência entre valor e status: quem manda é o dinheiro.
  if (status !== 'CANCELADO') {
    if (recebido === 0)                                          status = 'ABERTO';
    else if (valorTotal > 0 && recebido + 0.005 < valorTotal)     status = 'PARCIAL';
    else                                                         status = 'RECEBIDO';
  }

  let dataReceb = '';
  if (status === 'RECEBIDO' || status === 'PARCIAL') {
    dataReceb = paraDataRec(t.data_recebimento) || venc || '';
  }

  const antecipado = String(t.antecipado || '').toUpperCase() === 'SIM' ? 'SIM' : 'NAO';

  linha[RT.id]                = (existente && existente[RT.id]) || t.id || '';
  linha[RT.origem]            = String(t.origem || (existente ? existente[RT.origem] : 'MANUAL') || 'MANUAL');
  linha[RT.chave_origem]      = chaveNaturalRec(t);
  linha[RT.empresa]           = String(t.empresa || 'RENOVA').toUpperCase();
  linha[RT.data_emissao]      = paraDataRec(t.data_emissao) || '';
  linha[RT.data_vencimento]   = venc || '';
  linha[RT.cliente]           = String(t.cliente || '').trim();
  linha[RT.cliente_cod]       = String(t.cliente_cod || '').trim();
  linha[RT.cliente_cnpj]      = String(t.cliente_cnpj || '').trim();
  linha[RT.numero_nf]         = nfBaseRec(t.numero_nf, t.parcela);
  linha[RT.num_os]            = String(t.num_os || '').trim();
  linha[RT.natureza_operacao] = String(t.natureza_operacao || '').trim();
  linha[RT.descricao]         = String(t.descricao || '').trim();
  linha[RT.forma_pagamento]   = String(t.forma_pagamento || '').trim();
  linha[RT.valor_total]       = valorTotal;
  linha[RT.valor_recebido]    = recebido;
  linha[RT.status]            = status;
  linha[RT.data_recebimento]  = dataReceb;
  linha[RT.parcela]           = numeroRec(t.parcela) || 1;
  linha[RT.total_parcelas]    = numeroRec(t.total_parcelas) || 1;
  linha[RT.competencia]       = venc ? Utilities.formatDate(venc, 'GMT-3', 'yyyy-MM') : '';
  linha[RT.antecipado]        = antecipado;
  linha[RT.operacao_id]       = String(t.operacao_id || '').trim();
  linha[RT.parceiro_id]       = String(t.parceiro_id || '').trim();
  linha[RT.situacao_antec]    = antecipado === 'SIM' ? String(t.situacao_antec || 'ANTECIPADO').toUpperCase() : '';
  linha[RT.recompra_em]       = paraDataRec(t.recompra_em) || '';
  linha[RT.observacao]        = String(t.observacao || '').trim();
  linha[RT.criado_em]         = (existente && existente[RT.criado_em]) || agora;
  linha[RT.criado_por]        = (existente && existente[RT.criado_por]) || quem;
  linha[RT.atualizado_em]     = agora;
  linha[RT.atualizado_por]    = quem;

  return linha;
}

function salvarTituloRec(t, sessao) {
  if (!t) throw new Error('Título vazio.');
  if (!String(t.cliente || '').trim()) throw new Error('Informe o cliente.');
  if (!t.data_vencimento) throw new Error('Informe o vencimento.');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const linhas = lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const quem = sessao.usuario;

    if (t.id) {
      const i = acharLinhaRec(linhas, RT.id, t.id);
      if (i < 0) throw new Error('Título ' + t.id + ' não encontrado.');

      // Antecipação não se edita por aqui: quem muda de dono é a operação.
      // Ignorar isso deixaria o título "desantecipado" sem baixar o borderô.
      const anterior = linhas[i];
      t.antecipado     = String(anterior[RT.antecipado] || 'NAO');
      t.operacao_id    = String(anterior[RT.operacao_id] || '');
      t.parceiro_id    = String(anterior[RT.parceiro_id] || '');
      t.situacao_antec = String(anterior[RT.situacao_antec] || '');
      t.recompra_em    = anterior[RT.recompra_em];

      const nova = montarLinhaRec(t, anterior, quem);
      forcarTextoRec(sh, i + 2);
      sh.getRange(i + 2, 1, 1, CAB_REC_TITULOS.length).setValues([nova]);
      registrarRec(quem, 'EDITAR_TITULO', t.id, t.cliente + ' — ' + numeroRec(t.valor_total).toFixed(2));
      return { id: t.id, atualizado: true };
    }

    const chave = chaveNaturalRec(t);
    for (let i = 0; i < linhas.length; i++) {
      if (String(linhas[i][RT.chave_origem]) === chave) {
        throw new Error('Este título já existe na base (' + linhas[i][RT.id] + '). ' +
                        'Se for mesmo outro lançamento, mude a NF ou a parcela.');
      }
    }

    const gerar = proximoIdRec(linhas, RT.id, 'R-', 6);
    t.id = gerar();
    const nova = montarLinhaRec(t, null, quem);
    const linhaNova = sh.getLastRow() + 1;
    forcarTextoRec(sh, linhaNova);
    sh.getRange(linhaNova, 1, 1, CAB_REC_TITULOS.length).setValues([nova]);
    registrarRec(quem, 'CRIAR_TITULO', t.id, t.cliente + ' — ' + numeroRec(t.valor_total).toFixed(2));
    return { id: t.id, criado: true };
  } finally {
    lock.releaseLock();
  }
}

/** Não apaga: marca CANCELADO. Título sumido é dinheiro esquecido. */
function cancelarTituloRec(id, sessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const linhas = lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const i = acharLinhaRec(linhas, RT.id, id);
    if (i < 0) throw new Error('Título ' + id + ' não encontrado.');

    if (String(linhas[i][RT.antecipado]).toUpperCase() === 'SIM') {
      throw new Error('Este título está antecipado na operação ' + linhas[i][RT.operacao_id] +
                      '. Cancele ou ajuste a operação antes.');
    }

    sh.getRange(i + 2, RT.status + 1).setValue('CANCELADO');
    sh.getRange(i + 2, RT.atualizado_em + 1, 1, 2).setValues([[new Date(), sessao.usuario]]);
    // Libera a chave natural para o título poder ser relançado.
    sh.getRange(i + 2, RT.chave_origem + 1).setValue('');
    registrarRec(sessao.usuario, 'CANCELAR_TITULO', id, '');
    return { id: id, cancelado: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Baixa em lote. Recebe [{id, valor_recebido, data_recebimento}] e escreve numa
 * única passada — a tela de "vencendo hoje" costuma baixar 20 de uma vez.
 *
 * A baixa é sempre manual, inclusive no antecipado: se o cliente não paga, a
 * responsabilidade volta para a empresa por causa da coobrigação, e um sistema
 * que baixa sozinho no vencimento esconderia exatamente o risco que precisa
 * aparecer.
 */
function baixarTitulosRec(baixas, sessao) {
  if (!baixas.length) return { baixados: 0 };

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const linhas = lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const agora = new Date();
    let n = 0;

    baixas.forEach(function (b) {
      const i = acharLinhaRec(linhas, RT.id, b.id);
      if (i < 0) return;
      const total = numeroRec(linhas[i][RT.valor_total]);
      const receb = numeroRec(b.valor_recebido) || total;
      const data  = paraDataRec(b.data_recebimento) || paraDataRec(linhas[i][RT.data_vencimento]) || agora;
      const status = (receb + 0.005 >= total || total === 0) ? 'RECEBIDO' : 'PARCIAL';

      linhas[i][RT.valor_recebido]   = receb;
      linhas[i][RT.status]           = status;
      linhas[i][RT.data_recebimento] = data;
      linhas[i][RT.atualizado_em]    = agora;
      linhas[i][RT.atualizado_por]   = sessao.usuario;

      // Título antecipado que o cliente pagou: a operação está liquidada para
      // este papel. O parceiro recebeu, a coobrigação acabou.
      if (String(linhas[i][RT.antecipado]).toUpperCase() === 'SIM' && status === 'RECEBIDO') {
        linhas[i][RT.situacao_antec] = 'LIQUIDADO';
      }
      n++;
    });

    if (n) sh.getRange(2, 1, linhas.length, CAB_REC_TITULOS.length).setValues(linhas);
    registrarRec(sessao.usuario, 'BAIXAR', '', n + ' título(s)');
    return { baixados: n };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Recompra: a empresa devolveu o dinheiro ao parceiro porque o cliente não
 * pagou. O título continua ABERTO — a dívida do cliente não some — mas sai da
 * exposição do parceiro e para de contar como risco de coobrigação.
 */
function marcarRecompra(ids, data, sessao) {
  if (!ids.length) return { marcados: 0 };

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const linhas = lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const quando = paraDataRec(data) || new Date();
    let n = 0;

    ids.forEach(function (id) {
      const i = acharLinhaRec(linhas, RT.id, id);
      if (i < 0) return;
      if (String(linhas[i][RT.antecipado]).toUpperCase() !== 'SIM') return;
      linhas[i][RT.situacao_antec]  = 'RECOMPRADO';
      linhas[i][RT.recompra_em]     = quando;
      linhas[i][RT.atualizado_em]   = new Date();
      linhas[i][RT.atualizado_por]  = sessao.usuario;
      n++;
    });

    if (n) sh.getRange(2, 1, linhas.length, CAB_REC_TITULOS.length).setValues(linhas);
    registrarRec(sessao.usuario, 'RECOMPRA', '', n + ' título(s)');
    return { marcados: n };
  } finally {
    lock.releaseLock();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PARCEIROS FINANCEIROS
// ═════════════════════════════════════════════════════════════════════════════

function salvarParceiro(p, sessao) {
  if (!p || !String(p.nome || '').trim()) throw new Error('Informe o nome do parceiro.');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_PARCEIROS, CAB_REC_PARCEIROS);
    const linhas = lerBruto(ABA_REC_PARCEIROS, CAB_REC_PARCEIROS);
    const agora = new Date();
    const quem = sessao.usuario;

    const i = p.id ? acharLinhaRec(linhas, PA.id, p.id) : -1;
    if (p.id && i < 0) throw new Error('Parceiro ' + p.id + ' não encontrado.');

    const linha = new Array(CAB_REC_PARCEIROS.length).fill('');
    linha[PA.id]            = p.id || proximoIdRec(linhas, PA.id, 'P-', 3)();
    linha[PA.nome]          = String(p.nome).trim();
    linha[PA.tipo]          = String(p.tipo || 'FIDC').toUpperCase();
    linha[PA.cnpj]          = String(p.cnpj || '').trim();
    linha[PA.contato]       = String(p.contato || '').trim();
    linha[PA.email]         = String(p.email || '').trim();
    linha[PA.telefone]      = String(p.telefone || '').trim();
    linha[PA.taxa_mes]      = numeroRec(p.taxa_mes);
    linha[PA.tarifa_titulo] = numeroRec(p.tarifa_titulo);
    linha[PA.tac]           = numeroRec(p.tac);
    linha[PA.dias_float]    = numeroRec(p.dias_float);
    linha[PA.limite]        = numeroRec(p.limite);
    linha[PA.ativo]         = p.ativo === false ? 'NAO' : 'SIM';
    linha[PA.observacao]    = String(p.observacao || '').trim();
    linha[PA.criado_em]     = i >= 0 ? linhas[i][PA.criado_em] : agora;
    linha[PA.criado_por]    = i >= 0 ? linhas[i][PA.criado_por] : quem;
    linha[PA.atualizado_em] = agora;
    linha[PA.atualizado_por] = quem;

    const destino = i >= 0 ? i + 2 : sh.getLastRow() + 1;
    sh.getRange(destino, 1, 1, CAB_REC_PARCEIROS.length).setValues([linha]);
    registrarRec(quem, i >= 0 ? 'EDITAR_PARCEIRO' : 'CRIAR_PARCEIRO', linha[PA.id], linha[PA.nome]);
    return { id: linha[PA.id] };
  } finally {
    lock.releaseLock();
  }
}

/** Recusa remover parceiro com operação lançada — vira só inativo. */
function removerParceiro(id, sessao) {
  const ops = lerBruto(ABA_REC_OPERACOES, CAB_REC_OPERACOES)
    .filter(function (l) { return String(l[OP.parceiro_id]) === String(id); }).length;
  if (ops) throw new Error('Este parceiro tem ' + ops + ' operação(ões) registrada(s). ' +
                           'Marque como inativo em vez de remover — o histórico precisa dele.');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_PARCEIROS, CAB_REC_PARCEIROS);
    const linhas = lerBruto(ABA_REC_PARCEIROS, CAB_REC_PARCEIROS);
    const i = acharLinhaRec(linhas, PA.id, id);
    if (i < 0) throw new Error('Parceiro não encontrado.');
    sh.deleteRow(i + 2);
    registrarRec(sessao.usuario, 'REMOVER_PARCEIRO', id, '');
    return { removido: true };
  } finally {
    lock.releaseLock();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// POLÍTICA DE ANTECIPAÇÃO POR CLIENTE
// ═════════════════════════════════════════════════════════════════════════════

function salvarPolitica(p, sessao) {
  const cod = String(p && p.cliente_cod || '').trim();
  if (!cod) throw new Error('Informe o código do cliente.');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_POLITICAS, CAB_REC_POLITICAS);
    const linhas = lerBruto(ABA_REC_POLITICAS, CAB_REC_POLITICAS);
    const i = acharLinhaRec(linhas, PO.cliente_cod, cod);

    const pct = numeroRec(p.pct_max_os);
    const linha = new Array(CAB_REC_POLITICAS.length).fill('');
    linha[PO.cliente_cod]      = cod;
    linha[PO.cliente]          = String(p.cliente || '').trim();
    linha[PO.permite_os]       = p.permite_os === false ? 'NAO' : 'SIM';
    linha[PO.pct_max_os]       = pct > 0 ? Math.min(pct, 100) : 100;
    linha[PO.dias_ate_faturar] = numeroRec(p.dias_ate_faturar);
    linha[PO.dias_prazo_venc]  = numeroRec(p.dias_prazo_venc);
    linha[PO.teto_exposicao]   = numeroRec(p.teto_exposicao);
    linha[PO.ativo]            = p.ativo === false ? 'NAO' : 'SIM';
    linha[PO.observacao]       = String(p.observacao || '').trim();
    linha[PO.atualizado_em]    = new Date();
    linha[PO.atualizado_por]   = sessao.usuario;

    const destino = i >= 0 ? i + 2 : sh.getLastRow() + 1;
    sh.getRange(destino, PO.cliente_cod + 1).setNumberFormat('@');
    sh.getRange(destino, 1, 1, CAB_REC_POLITICAS.length).setValues([linha]);
    registrarRec(sessao.usuario, 'POLITICA', cod, linha[PO.cliente]);
    return { cliente_cod: cod };
  } finally {
    lock.releaseLock();
  }
}

function removerPolitica(cod, sessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_POLITICAS, CAB_REC_POLITICAS);
    const linhas = lerBruto(ABA_REC_POLITICAS, CAB_REC_POLITICAS);
    const i = acharLinhaRec(linhas, PO.cliente_cod, String(cod));
    if (i < 0) throw new Error('Política não encontrada.');
    sh.deleteRow(i + 2);
    registrarRec(sessao.usuario, 'REMOVER_POLITICA', cod, '');
    return { removido: true };
  } finally {
    lock.releaseLock();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// OPERAÇÕES FINANCEIRAS (BORDERÔS)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Custo estimado de uma operação.
 *
 * deságio = face × taxa_mês × (prazo médio ponderado + float) / 30
 *         + tarifa por título × quantidade
 *         + TAC da operação
 *
 * O prazo médio é ponderado PELO VALOR, não pela quantidade: um título de
 * R$ 50 mil a 60 dias custa muito mais que dez de R$ 500 a 15 dias, e a média
 * simples esconderia isso. É a mesma conta que o fundo faz — o número aqui
 * serve para conferir o borderô que volta, não para enfeitar a tela.
 */
function calcularCustoOperacao(itens, parceiro, dataOperacao) {
  const base = paraDataRec(dataOperacao) || new Date();
  let bruto = 0, ponderado = 0;

  itens.forEach(function (it) {
    const v = numeroRec(it.valor);
    const venc = paraDataRec(it.vencimento);
    const dias = venc ? Math.max(Math.round((venc - base) / 86400000), 0) : 0;
    it.prazo_dias = dias;
    bruto += v;
    ponderado += v * dias;
  });

  const prazoMedio = bruto > 0 ? ponderado / bruto : 0;
  const taxa   = numeroRec(parceiro && parceiro.taxa_mes);
  const tarifa = numeroRec(parceiro && parceiro.tarifa_titulo);
  const tac    = numeroRec(parceiro && parceiro.tac);
  const float_ = numeroRec(parceiro && parceiro.dias_float);

  const juros = bruto * (taxa / 100) * ((prazoMedio + float_) / 30);
  const desagio = juros + tarifa * itens.length + tac;

  return {
    valor_bruto: arred(bruto),
    prazo_medio: Math.round(prazoMedio * 10) / 10,
    taxa_mes: taxa, tarifa_titulo: tarifa, tac: tac,
    desagio_estimado: arred(desagio),
    liquido_estimado: arred(bruto - desagio)
  };
}

/**
 * Cria o borderô. Recebe os itens já escolhidos na tela:
 *   { tipo: 'TITULO', ref_id: 'R-000123' }
 *   { tipo: 'OS', num_os: '4566', cliente, cliente_cod, valor, vencimento }
 *
 * Os títulos existentes têm valor e vencimento lidos da planilha, não do que o
 * navegador mandou — número de dinheiro não vem do cliente.
 */
function criarOperacao(op, itens, sessao) {
  if (!itens.length) throw new Error('Selecione ao menos um título ou uma OS.');
  const parceiroId = String(op.parceiro_id || '').trim();
  if (!parceiroId) throw new Error('Escolha o parceiro financeiro.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const parceiros = lerParceiros();
    const parceiro = parceiros.filter(function (p) { return p.id === parceiroId; })[0];
    if (!parceiro) throw new Error('Parceiro ' + parceiroId + ' não encontrado.');

    const shT = abaRec(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const linhasT = lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const linhasOps = lerBruto(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    const linhasAnt = lerBruto(ABA_REC_ANTECIP, CAB_REC_ANTECIP);

    const gerarOp  = proximoIdRec(linhasOps, OP.id, 'O-', 6);
    const gerarAnt = proximoIdRec(linhasAnt, AN.id, 'A-', 6);
    const opId = gerarOp();
    const numero = linhasOps.length + 1;
    const dataOp = paraDataRec(op.data_operacao) || new Date();
    const quem = sessao.usuario;
    const agora = new Date();

    const politicas = {};
    lerPoliticas().forEach(function (p) { politicas[String(p.cliente_cod)] = p; });

    const resolvidos = [];
    const novasAntecip = [];
    let qtdTitulos = 0, qtdOS = 0;

    itens.forEach(function (it) {
      if (String(it.tipo).toUpperCase() === 'OS') {
        const numOS = String(it.num_os || '').trim();
        if (!numOS) throw new Error('OS sem número no pacote.');

        // Já antecipada e ainda esperando faturamento? Antecipar de novo é
        // vender o mesmo recebível duas vezes.
        for (let i = 0; i < linhasAnt.length; i++) {
          if (String(linhasAnt[i][AN.num_os]) === numOS &&
              String(linhasAnt[i][AN.status]) === 'AGUARDANDO_FATURAMENTO') {
            throw new Error('A OS ' + numOS + ' já está antecipada na operação ' +
                            linhasAnt[i][AN.operacao_id] + '.');
          }
        }

        const pol = politicas[String(it.cliente_cod || '')];
        if (pol && !pol.permite_os) {
          throw new Error('A política do cliente ' + (it.cliente || it.cliente_cod) +
                          ' não permite antecipar OS sem pedido.');
        }
        const pct = pol && pol.pct_max_os > 0 ? pol.pct_max_os : 100;
        const valorOS = numeroRec(it.valor_os || it.valor);
        const valor = arred(valorOS * pct / 100);
        const venc = paraDataRec(it.vencimento) || vencimentoEstimado(dataOp, pol);

        const antId = gerarAnt();
        novasAntecip.push({
          id: antId, num_os: numOS, cliente: String(it.cliente || ''),
          cliente_cod: String(it.cliente_cod || ''), valor_os: valorOS,
          valor_antecipado: valor, vencimento_estimado: venc
        });
        resolvidos.push({
          tipo: 'OS', ref_id: antId, num_os: numOS, numero_nf: '', parcela: 1,
          cliente: String(it.cliente || ''), cliente_cod: String(it.cliente_cod || ''),
          vencimento: venc, valor: valor
        });
        qtdOS++;
        return;
      }

      const i = acharLinhaRec(linhasT, RT.id, it.ref_id);
      if (i < 0) throw new Error('Título ' + it.ref_id + ' não encontrado.');
      const l = linhasT[i];
      if (String(l[RT.antecipado]).toUpperCase() === 'SIM') {
        throw new Error('O título ' + l[RT.id] + ' (NF ' + l[RT.numero_nf] +
                        ') já está antecipado na operação ' + l[RT.operacao_id] + '.');
      }
      if (String(l[RT.status]) === 'RECEBIDO' || String(l[RT.status]) === 'CANCELADO') {
        throw new Error('O título ' + l[RT.id] + ' está ' + l[RT.status] + ' e não pode ser antecipado.');
      }
      resolvidos.push({
        tipo: 'TITULO', ref_id: String(l[RT.id]), num_os: String(l[RT.num_os] || ''),
        numero_nf: String(l[RT.numero_nf] || ''), parcela: numeroRec(l[RT.parcela]) || 1,
        cliente: String(l[RT.cliente] || ''), cliente_cod: String(l[RT.cliente_cod] || ''),
        vencimento: paraDataRec(l[RT.data_vencimento]), valor: numeroRec(l[RT.valor_total])
      });
      qtdTitulos++;
    });

    const custo = calcularCustoOperacao(resolvidos, parceiro, dataOp);

    // ── grava a operação ──
    const linhaOp = new Array(CAB_REC_OPERACOES.length).fill('');
    linhaOp[OP.id]               = opId;
    linhaOp[OP.numero]           = numero;
    linhaOp[OP.parceiro_id]      = parceiro.id;
    linhaOp[OP.parceiro]         = parceiro.nome;
    linhaOp[OP.data_operacao]    = dataOp;
    linhaOp[OP.status]           = 'RASCUNHO';
    linhaOp[OP.qtd_titulos]      = qtdTitulos;
    linhaOp[OP.qtd_os]           = qtdOS;
    linhaOp[OP.valor_bruto]      = custo.valor_bruto;
    linhaOp[OP.prazo_medio]      = custo.prazo_medio;
    linhaOp[OP.taxa_mes]         = custo.taxa_mes;
    linhaOp[OP.tarifa_titulo]    = custo.tarifa_titulo;
    linhaOp[OP.tac]              = custo.tac;
    linhaOp[OP.desagio_estimado] = custo.desagio_estimado;
    linhaOp[OP.liquido_estimado] = custo.liquido_estimado;
    linhaOp[OP.observacao]       = String(op.observacao || '').trim();
    linhaOp[OP.criado_em]        = agora;
    linhaOp[OP.criado_por]       = quem;
    linhaOp[OP.atualizado_em]    = agora;
    linhaOp[OP.atualizado_por]   = quem;

    const shOp = abaRec(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    shOp.getRange(shOp.getLastRow() + 1, 1, 1, CAB_REC_OPERACOES.length).setValues([linhaOp]);

    // ── grava os itens ──
    const shIt = abaRec(ABA_REC_ITENS, CAB_REC_ITENS);
    const linhasIt = resolvidos.map(function (r) {
      const l = new Array(CAB_REC_ITENS.length).fill('');
      l[IT.operacao_id] = opId;      l[IT.tipo] = r.tipo;
      l[IT.ref_id] = r.ref_id;       l[IT.num_os] = r.num_os;
      l[IT.numero_nf] = r.numero_nf; l[IT.parcela] = r.parcela;
      l[IT.cliente] = r.cliente;     l[IT.cliente_cod] = r.cliente_cod;
      l[IT.vencimento] = r.vencimento; l[IT.valor] = r.valor;
      l[IT.prazo_dias] = r.prazo_dias;
      return l;
    });
    const inicioIt = shIt.getLastRow() + 1;
    shIt.getRange(inicioIt, IT.numero_nf + 1, linhasIt.length, 1).setNumberFormat('@');
    shIt.getRange(inicioIt, IT.num_os + 1, linhasIt.length, 1).setNumberFormat('@');
    shIt.getRange(inicioIt, 1, linhasIt.length, CAB_REC_ITENS.length).setValues(linhasIt);

    // ── grava as antecipações de OS ──
    if (novasAntecip.length) {
      const shAnt = abaRec(ABA_REC_ANTECIP, CAB_REC_ANTECIP);
      const linhasAntNovas = novasAntecip.map(function (a) {
        const l = new Array(CAB_REC_ANTECIP.length).fill('');
        l[AN.id] = a.id;                l[AN.num_os] = a.num_os;
        l[AN.cliente] = a.cliente;      l[AN.cliente_cod] = a.cliente_cod;
        l[AN.valor_os] = a.valor_os;    l[AN.valor_antecipado] = a.valor_antecipado;
        l[AN.vencimento_estimado] = a.vencimento_estimado;
        l[AN.operacao_id] = opId;       l[AN.parceiro_id] = parceiro.id;
        l[AN.status] = 'AGUARDANDO_FATURAMENTO';
        l[AN.criado_em] = agora;        l[AN.criado_por] = quem;
        l[AN.atualizado_em] = agora;    l[AN.atualizado_por] = quem;
        return l;
      });
      const inicioAnt = shAnt.getLastRow() + 1;
      shAnt.getRange(inicioAnt, AN.num_os + 1, linhasAntNovas.length, 1).setNumberFormat('@');
      shAnt.getRange(inicioAnt, 1, linhasAntNovas.length, CAB_REC_ANTECIP.length).setValues(linhasAntNovas);
    }

    // ── carimba os títulos ──
    // Já entram como antecipados no RASCUNHO, de propósito: é o que impede a
    // mesma duplicata de entrar em dois borderôs enquanto um deles está em
    // análise no fundo. Cancelar a operação devolve todos.
    let mexeu = 0;
    resolvidos.forEach(function (r) {
      if (r.tipo !== 'TITULO') return;
      const i = acharLinhaRec(linhasT, RT.id, r.ref_id);
      if (i < 0) return;
      linhasT[i][RT.antecipado]     = 'SIM';
      linhasT[i][RT.operacao_id]    = opId;
      linhasT[i][RT.parceiro_id]    = parceiro.id;
      linhasT[i][RT.situacao_antec] = 'ANTECIPADO';
      linhasT[i][RT.atualizado_em]  = agora;
      linhasT[i][RT.atualizado_por] = quem;
      mexeu++;
    });
    if (mexeu) shT.getRange(2, 1, linhasT.length, CAB_REC_TITULOS.length).setValues(linhasT);

    registrarRec(quem, 'OPERACAO_CRIAR', opId,
                 parceiro.nome + ' — ' + custo.valor_bruto.toFixed(2) + ' em ' + resolvidos.length + ' item(ns)');
    return { id: opId, numero: numero, custo: custo, itens: resolvidos.length };
  } finally {
    lock.releaseLock();
  }
}

/** Vencimento projetado de uma OS ainda sem nota: hoje + prazo de faturar + prazo de vencimento. */
function vencimentoEstimado(base, politica) {
  const d = new Date(base.getTime());
  const ate = politica ? numeroRec(politica.dias_ate_faturar) : 0;
  const prazo = politica ? numeroRec(politica.dias_prazo_venc) : 0;
  d.setDate(d.getDate() + (ate || 30) + (prazo || 30));
  return d;
}

function mudarStatusOperacao(id, status, sessao) {
  status = String(status || '').toUpperCase();
  if (OP_STATUS_VALIDOS.indexOf(status) < 0) throw new Error('Status inválido: ' + status);
  if (status === 'LIQUIDADA') throw new Error('Liquidação passa por "Informar líquido recebido".');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    const linhas = lerBruto(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    const i = acharLinhaRec(linhas, OP.id, id);
    if (i < 0) throw new Error('Operação ' + id + ' não encontrada.');
    if (String(linhas[i][OP.status]) === 'LIQUIDADA') {
      throw new Error('Operação já liquidada. Cancele o lançamento no Contas a Pagar antes de reabrir.');
    }
    sh.getRange(i + 2, OP.status + 1).setValue(status);
    sh.getRange(i + 2, OP.atualizado_em + 1, 1, 2).setValues([[new Date(), sessao.usuario]]);
    registrarRec(sessao.usuario, 'OPERACAO_STATUS', id, status);
    return { id: id, status: status };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Liquidação: o parceiro creditou. É aqui que a operação encosta no resto do
 * sistema.
 *
 *  1. Guarda o líquido recebido e a data do crédito → é a entrada que o Fluxo
 *     de Caixa vai ler.
 *  2. A diferença entre bruto e líquido é o custo da operação, e vira um
 *     título no Contas a Pagar na conta 3.07, JÁ BAIXADO — porque o dinheiro
 *     não vai sair depois: ele já saiu, descontado no crédito.
 *
 * O passo 2 é feito pela API do Contas a Pagar, não escrevendo na aba direto.
 * Ver o comentário de CR_API_CONTAS_PAGAR no topo.
 */
function liquidarOperacao(body, sessao) {
  const id = String(body.id || '');
  const liquido = numeroRec(body.valor_liquido);
  if (!id) throw new Error('Operação não informada.');
  if (liquido <= 0) throw new Error('Informe o valor líquido recebido.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = abaRec(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    const linhas = lerBruto(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    const i = acharLinhaRec(linhas, OP.id, id);
    if (i < 0) throw new Error('Operação ' + id + ' não encontrada.');
    if (String(linhas[i][OP.status]) === 'LIQUIDADA') throw new Error('Esta operação já foi liquidada.');
    if (String(linhas[i][OP.status]) === 'CANCELADA') throw new Error('Operação cancelada não liquida.');

    const bruto = numeroRec(linhas[i][OP.valor_bruto]);
    if (liquido > bruto + 0.005) {
      throw new Error('O líquido (' + liquido.toFixed(2) + ') é maior que o valor de face (' +
                      bruto.toFixed(2) + '). Confira o extrato antes de gravar.');
    }
    const custo = arred(bruto - liquido);
    const prazo = numeroRec(linhas[i][OP.prazo_medio]);
    const credito = paraDataRec(body.data_credito) || new Date();
    const parceiro = String(linhas[i][OP.parceiro] || '');
    const numero = linhas[i][OP.numero];
    const agora = new Date();

    // Taxa efetiva mensal do que realmente aconteceu. É o número que compara
    // parceiros de verdade: taxa de tabela sem prazo não diz nada.
    const efetiva = (bruto > 0 && prazo > 0) ? (custo / bruto) / (prazo / 30) * 100 : 0;

    linhas[i][OP.status]           = 'LIQUIDADA';
    linhas[i][OP.valor_liquido]    = liquido;
    linhas[i][OP.custo_real]       = custo;
    linhas[i][OP.taxa_efetiva_mes] = Math.round(efetiva * 1000) / 1000;
    linhas[i][OP.data_credito]     = credito;
    linhas[i][OP.atualizado_em]    = agora;
    linhas[i][OP.atualizado_por]   = sessao.usuario;

    // Grava a liquidação ANTES de tentar o lançamento da despesa. Se o Contas
    // a Pagar estiver fora do ar, o crédito recebido não pode se perder — o
    // título faltante é recuperável pelo botão "relançar despesa".
    sh.getRange(2, 1, linhas.length, CAB_REC_OPERACOES.length).setValues(linhas);

    let despesa = { id: '', erro: '' };
    if (custo > 0.005) {
      despesa = lancarDespesaFinanceira({
        operacao_id: id, numero: numero, parceiro: parceiro,
        custo: custo, data: credito, bruto: bruto, prazo: prazo
      }, body.token);
      if (despesa.id) {
        sh.getRange(i + 2, OP.titulo_despesa_id + 1).setValue(despesa.id);
      }
    }

    registrarRec(sessao.usuario, 'OPERACAO_LIQUIDAR', id,
                 'líquido ' + liquido.toFixed(2) + ' · custo ' + custo.toFixed(2) +
                 (despesa.id ? ' · título ' + despesa.id : ''));

    return {
      id: id, valor_liquido: liquido, custo_real: custo,
      taxa_efetiva_mes: Math.round(efetiva * 1000) / 1000,
      titulo_despesa_id: despesa.id, aviso_despesa: despesa.erro
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cria o título de despesa financeira no Contas a Pagar, já baixado.
 *
 * Nunca joga exceção: a liquidação já foi gravada quando esta função roda, e
 * derrubar tudo por causa do lançamento acessório faria o usuário digitar o
 * crédito de novo. Devolve o erro em texto para a tela avisar e oferecer o
 * relançamento.
 */
function lancarDespesaFinanceira(dados, token) {
  if (!token) return { id: '', erro: 'Sessão não repassada — use "relançar despesa" na tela de operações.' };
  try {
    const resposta = UrlFetchApp.fetch(CR_API_CONTAS_PAGAR, {
      method: 'post',
      contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({
        action: 'titulo_salvar',
        token: token,
        titulo: {
          origem: 'ANTECIPACAO',
          empresa: 'RENOVA',
          fornecedor: dados.parceiro,
          // Sem NF de verdade: o número da operação é o documento que
          // identifica esta despesa, e é ele que amarra os dois módulos.
          numero_nf: 'OP-' + dados.numero,
          tipo_docto: 'A vista',
          data_emissao: Utilities.formatDate(dados.data, 'GMT-3', 'yyyy-MM-dd'),
          data_vencimento: Utilities.formatDate(dados.data, 'GMT-3', 'yyyy-MM-dd'),
          natureza_codigo: CR_NATUREZA_JUROS,
          natureza: CR_NATUREZA_JUROS_NOME,
          descricao: 'Deságio da operação ' + dados.operacao_id + ' — ' + dados.parceiro,
          observacao_1: 'Face ' + dados.bruto.toFixed(2) + ' · prazo médio ' + dados.prazo + 'd',
          observacao_2: 'Lançado pelo módulo Contas a Receber',
          forma_pagamento: 'Transferência',
          valor_total: dados.custo,
          valor_pago: dados.custo,
          status: 'PAGO',
          data_baixa: Utilities.formatDate(dados.data, 'GMT-3', 'yyyy-MM-dd'),
          parcela: 1, total_parcelas: 1
        }
      }),
      muteHttpExceptions: true, followRedirects: true
    });
    const d = JSON.parse(resposta.getContentText());
    if (!d.success) return { id: '', erro: d.error || 'O Contas a Pagar recusou o lançamento.' };
    return { id: (d.data && d.data.id) || '', erro: '' };
  } catch (e) {
    return { id: '', erro: 'Não consegui falar com o Contas a Pagar (' + erroTextoRec(e) + ').' };
  }
}

/** Segunda chance para o lançamento da despesa quando o Contas a Pagar falhou. */
function relancarDespesa(id, sessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = abaRec(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    const linhas = lerBruto(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    const i = acharLinhaRec(linhas, OP.id, id);
    if (i < 0) throw new Error('Operação não encontrada.');
    if (String(linhas[i][OP.status]) !== 'LIQUIDADA') throw new Error('A operação ainda não foi liquidada.');
    if (String(linhas[i][OP.titulo_despesa_id] || '').trim()) {
      throw new Error('Esta operação já tem o título ' + linhas[i][OP.titulo_despesa_id] +
                      ' no Contas a Pagar. Lançar de novo criaria despesa em dobro.');
    }
    const custo = numeroRec(linhas[i][OP.custo_real]);
    if (custo <= 0.005) throw new Error('Operação sem custo: não há despesa a lançar.');

    const r = lancarDespesaFinanceira({
      operacao_id: id, numero: linhas[i][OP.numero], parceiro: String(linhas[i][OP.parceiro]),
      custo: custo, data: paraDataRec(linhas[i][OP.data_credito]) || new Date(),
      bruto: numeroRec(linhas[i][OP.valor_bruto]), prazo: numeroRec(linhas[i][OP.prazo_medio])
    }, sessao.token);

    if (!r.id) throw new Error(r.erro || 'Não consegui lançar a despesa.');
    sh.getRange(i + 2, OP.titulo_despesa_id + 1).setValue(r.id);
    registrarRec(sessao.usuario, 'DESPESA_RELANCADA', id, r.id);
    return { titulo_despesa_id: r.id };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cancela a operação e devolve tudo para o estado anterior: os títulos voltam
 * a ser da empresa e as OSs voltam para a fila de antecipáveis.
 */
function cancelarOperacao(id, sessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const shOp = abaRec(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    const linhasOp = lerBruto(ABA_REC_OPERACOES, CAB_REC_OPERACOES);
    const i = acharLinhaRec(linhasOp, OP.id, id);
    if (i < 0) throw new Error('Operação ' + id + ' não encontrada.');
    if (String(linhasOp[i][OP.status]) === 'LIQUIDADA') {
      throw new Error('Operação liquidada não se cancela: o dinheiro já entrou. ' +
                      'Se foi engano, estorne o título ' + (linhasOp[i][OP.titulo_despesa_id] || '') +
                      ' no Contas a Pagar e registre o estorno do crédito no Fluxo de Caixa.');
    }
    const agora = new Date();
    shOp.getRange(i + 2, OP.status + 1).setValue('CANCELADA');
    shOp.getRange(i + 2, OP.atualizado_em + 1, 1, 2).setValues([[agora, sessao.usuario]]);

    // devolve os títulos
    const shT = abaRec(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const linhasT = lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS);
    let n = 0;
    linhasT.forEach(function (l) {
      if (String(l[RT.operacao_id]) !== String(id)) return;
      l[RT.antecipado] = 'NAO'; l[RT.operacao_id] = ''; l[RT.parceiro_id] = '';
      l[RT.situacao_antec] = ''; l[RT.atualizado_em] = agora; l[RT.atualizado_por] = sessao.usuario;
      n++;
    });
    if (n) shT.getRange(2, 1, linhasT.length, CAB_REC_TITULOS.length).setValues(linhasT);

    // devolve as OSs
    const shA = abaRec(ABA_REC_ANTECIP, CAB_REC_ANTECIP);
    const linhasA = lerBruto(ABA_REC_ANTECIP, CAB_REC_ANTECIP);
    let m = 0;
    linhasA.forEach(function (l) {
      if (String(l[AN.operacao_id]) !== String(id)) return;
      if (String(l[AN.status]) === 'FATURADA') return;   // já virou nota: não mexe
      l[AN.status] = 'CANCELADA'; l[AN.atualizado_em] = agora; l[AN.atualizado_por] = sessao.usuario;
      m++;
    });
    if (m) shA.getRange(2, 1, linhasA.length, CAB_REC_ANTECIP.length).setValues(linhasA);

    registrarRec(sessao.usuario, 'OPERACAO_CANCELAR', id, n + ' título(s) e ' + m + ' OS devolvidos');
    return { id: id, titulos_liberados: n, os_liberadas: m };
  } finally {
    lock.releaseLock();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// RECONCILIAÇÃO OS → NOTA FISCAL
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O elo do módulo inteiro.
 *
 * Uma OS antecipada em AGUARDANDO PEDIDO é uma promessa: não existe duplicata
 * ainda. Quando o cliente libera e a OS é faturada, a `vw_notas_fiscais` grava
 * o número da OS em `num_pedido` — e é por aí que os títulos que acabaram de
 * nascer descobrem que já foram vendidos ao fundo.
 *
 * Sem isto o título entraria como livre e poderia ser antecipado de novo: a
 * mesma receita vendida duas vezes, que é o erro caro deste tipo de operação.
 *
 * Roda sozinha depois de cada aprovação de sincronização e também no botão
 * "reconciliar" da tela — porque a NF pode ter entrado antes de alguém
 * registrar a antecipação da OS.
 */
function reconciliarAntecipacoesOS(sessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const shA = abaRec(ABA_REC_ANTECIP, CAB_REC_ANTECIP);
    const linhasA = lerBruto(ABA_REC_ANTECIP, CAB_REC_ANTECIP);
    const pendentes = {};
    linhasA.forEach(function (l, idx) {
      if (String(l[AN.status]) === 'AGUARDANDO_FATURAMENTO') {
        pendentes[String(l[AN.num_os]).trim()] = idx;
      }
    });
    if (!Object.keys(pendentes).length) return { titulos_marcados: 0, os_faturadas: 0 };

    const shT = abaRec(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const linhasT = lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const agora = new Date();
    const quem = sessao.usuario;

    const porOS = {};   // num_os → { nfs:{}, valor:0 }
    let marcados = 0;

    linhasT.forEach(function (l) {
      const os = String(l[RT.num_os] || '').trim();
      if (!os || !(os in pendentes)) return;
      if (String(l[RT.status]) === 'CANCELADO') return;
      if (String(l[RT.antecipado]).toUpperCase() === 'SIM') {
        // já marcado numa rodada anterior: continua contando para o faturado
        const a0 = porOS[os] = porOS[os] || { nfs: {}, valor: 0 };
        a0.nfs[String(l[RT.numero_nf])] = true;
        a0.valor += numeroRec(l[RT.valor_total]);
        return;
      }
      const idx = pendentes[os];
      l[RT.antecipado]     = 'SIM';
      l[RT.operacao_id]    = String(linhasA[idx][AN.operacao_id] || '');
      l[RT.parceiro_id]    = String(linhasA[idx][AN.parceiro_id] || '');
      l[RT.situacao_antec] = 'ANTECIPADO';
      l[RT.observacao]     = ('Antecipado ainda como OS ' + os + ' (' + linhasA[idx][AN.id] + ')').trim();
      l[RT.atualizado_em]  = agora;
      l[RT.atualizado_por] = quem;
      marcados++;

      const a = porOS[os] = porOS[os] || { nfs: {}, valor: 0 };
      a.nfs[String(l[RT.numero_nf])] = true;
      a.valor += numeroRec(l[RT.valor_total]);
    });

    let faturadas = 0;
    Object.keys(porOS).forEach(function (os) {
      const idx = pendentes[os];
      linhasA[idx][AN.status]         = 'FATURADA';
      linhasA[idx][AN.nfs_geradas]    = Object.keys(porOS[os].nfs).filter(String).join(', ');
      linhasA[idx][AN.valor_faturado] = arred(porOS[os].valor);
      linhasA[idx][AN.faturado_em]    = agora;
      linhasA[idx][AN.atualizado_em]  = agora;
      linhasA[idx][AN.atualizado_por] = quem;
      faturadas++;
    });

    if (marcados) shT.getRange(2, 1, linhasT.length, CAB_REC_TITULOS.length).setValues(linhasT);
    if (faturadas) shA.getRange(2, 1, linhasA.length, CAB_REC_ANTECIP.length).setValues(linhasA);

    if (marcados || faturadas) {
      registrarRec(quem, 'RECONCILIAR_OS', '', marcados + ' título(s) · ' + faturadas + ' OS faturada(s)');
    }
    return { titulos_marcados: marcados, os_faturadas: faturadas };
  } finally {
    lock.releaseLock();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SINCRONIZAÇÃO COM O GENESIS (fila de aprovação)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A fila fica aqui, e não num JSON publicado no GitHub Pages, porque o
 * repositório do portal é público: nome de cliente, CNPJ, número de nota e
 * valor a receber não podem sair daqui.
 */
function gravarStagingRec(notas, geradoEm, janela, substituir) {
  const ss = SpreadsheetApp.openById(CR_PLANILHA_ID);
  const sh = ss.getSheetByName(ABA_REC_SYNC) || garantirAbaRec(ss, ABA_REC_SYNC, CAB_REC_SYNC);

  if (substituir && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, CAB_REC_SYNC.length).clearContent();
  }
  if (!notas.length) return { gravadas: 0 };

  const quando = geradoEm || new Date().toISOString();
  const linhas = notas.map(function (n) {
    return [quando, String(n.chave_origem || ''), n.data_emissao || '', n.data_vencimento || '',
            String(n.cliente || ''), String(n.cliente_cod || ''), String(n.numero_nf || ''),
            String(n.num_os || ''), numeroRec(n.valor_total), numeroRec(n.parcela) || 1,
            numeroRec(n.total_parcelas) || 1, JSON.stringify(n)];
  });

  const inicio = sh.getLastRow() + 1;
  // numero_nf / num_os / cliente_cod em texto: "4.753" viraria número.
  [CAB_REC_SYNC.indexOf('numero_nf'), CAB_REC_SYNC.indexOf('num_os'), CAB_REC_SYNC.indexOf('cliente_cod')]
    .forEach(function (c) { sh.getRange(inicio, c + 1, linhas.length, 1).setNumberFormat('@'); });
  sh.getRange(inicio, 1, linhas.length, CAB_REC_SYNC.length).setValues(linhas);

  return { gravadas: linhas.length, janela: janela || '' };
}

function lerStagingRec() {
  const ss = SpreadsheetApp.openById(CR_PLANILHA_ID);
  const sh = ss.getSheetByName(ABA_REC_SYNC);
  if (!sh || sh.getLastRow() < 2) return { gerado_em: '', notas: [], existentes: {} };

  const linhas = sh.getRange(2, 1, sh.getLastRow() - 1, CAB_REC_SYNC.length).getValues();
  const notas = linhas.map(function (l) {
    try { return JSON.parse(l[CAB_REC_SYNC.indexOf('json')]); } catch (e) { return null; }
  }).filter(Boolean);

  // Diz quais já viraram título, para a tela não oferecer duplicata.
  const existentes = {};
  lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS).forEach(function (l) {
    const k = String(l[RT.chave_origem] || '');
    if (k) existentes[k] = String(l[RT.id]);
  });

  return {
    gerado_em: linhas.length ? String(linhas[0][0]) : '',
    notas: notas, existentes: existentes
  };
}

function contarStagingRec() {
  const ss = SpreadsheetApp.openById(CR_PLANILHA_ID);
  const sh = ss.getSheetByName(ABA_REC_SYNC);
  if (!sh || sh.getLastRow() < 2) return { total: 0, novas: 0, gerado_em: '' };

  const linhas = sh.getRange(2, 1, sh.getLastRow() - 1, CAB_REC_SYNC.length).getValues();
  const existentes = {};
  lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS).forEach(function (l) {
    const k = String(l[RT.chave_origem] || '');
    if (k) existentes[k] = true;
  });
  let novas = 0;
  linhas.forEach(function (l) { if (!existentes[String(l[1] || '')]) novas++; });
  return { total: linhas.length, novas: novas, gerado_em: String(linhas[0][0] || '') };
}

/** Aprova as notas escolhidas: vira título de verdade e reconcilia as OSs. */
function aprovarStagingRec(chaves, sessao) {
  if (!chaves.length) return { criados: 0 };
  const fila = lerStagingRec();
  const escolhidas = {};
  chaves.forEach(function (c) { escolhidas[String(c)] = true; });

  const novos = fila.notas.filter(function (n) {
    return escolhidas[String(n.chave_origem)] && !fila.existentes[String(n.chave_origem)];
  });
  if (!novos.length) return { criados: 0, ignorados: chaves.length };

  const lock = LockService.getScriptLock();
  lock.waitLock(40000);
  let criados = 0;
  try {
    const sh = abaRec(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const linhas = lerBruto(ABA_REC_TITULOS, CAB_REC_TITULOS);
    const existe = {};
    linhas.forEach(function (l) { if (l[RT.chave_origem]) existe[String(l[RT.chave_origem])] = true; });

    const gerar = proximoIdRec(linhas, RT.id, 'R-', 6);
    const novasLinhas = [];
    novos.forEach(function (n) {
      const chave = chaveNaturalRec(n);
      if (existe[chave]) return;
      existe[chave] = true;
      n.id = gerar();
      n.origem = n.origem || 'GENESIS';
      novasLinhas.push(montarLinhaRec(n, null, sessao.usuario));
      criados++;
    });

    if (novasLinhas.length) {
      const inicio = sh.getLastRow() + 1;
      REC_COLUNAS_TEXTO.forEach(function (c) {
        sh.getRange(inicio, RT[c] + 1, novasLinhas.length, 1).setNumberFormat('@');
      });
      sh.getRange(inicio, 1, novasLinhas.length, CAB_REC_TITULOS.length).setValues(novasLinhas);
    }
    registrarRec(sessao.usuario, 'SYNC_APROVAR', '', criados + ' título(s)');
  } finally {
    lock.releaseLock();
  }

  // Fora do lock anterior: reconciliar pega o seu próprio.
  const rec = reconciliarAntecipacoesOS(sessao);
  return { criados: criados, reconciliacao: rec };
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

const CR_API_MANUAL = 'https://script.google.com/macros/s/AKfycbxmdLCRPZwf6u7l8BnbtqbomFRcjplzJOKCeNWSTRNCKq8M9NtO2uWO7DjEP-xN7WBkkg/exec';
const CR_PAPEIS_COM_ESCRITA = ['admin', 'financeiro'];

/**
 * Mesma lógica do Contas a Pagar: quem emite token é o backend do Manual da
 * Empresa. Cada projeto Apps Script tem PropertiesService próprio, então não
 * dá para ler a sessão daqui — perguntamos para lá, com 5 min de cache.
 *
 * O token volta dentro da sessão porque liquidarOperacao() precisa repassá-lo
 * para o Contas a Pagar ao lançar a despesa financeira.
 */
function validarTokenRec(token) {
  if (!token) throw new Error('Sessão expirada. Entre no sistema novamente.');

  const chaveServico = PropertiesService.getScriptProperties().getProperty('CHAVE_SERVICO');
  if (chaveServico && token === chaveServico) {
    return { usuario: 'servico', nome: 'Serviço (cron)', papel: 'financeiro', servico: true, token: token };
  }

  const cache = CacheService.getScriptCache();
  const chave = 'sess_' + token;
  let sessao = null;

  const emCache = cache.get(chave);
  if (emCache) {
    sessao = JSON.parse(emCache);
  } else {
    let resposta;
    try {
      resposta = UrlFetchApp.fetch(CR_API_MANUAL, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ action: 'sessao_validar', token: token }),
        muteHttpExceptions: true, followRedirects: true
      });
    } catch (e) {
      throw new Error('Não consegui validar seu acesso agora (' + erroTextoRec(e) + '). Tente de novo em instantes.');
    }
    let d;
    try { d = JSON.parse(resposta.getContentText()); }
    catch (e) { throw new Error('Resposta inesperada do serviço de login. Tente novamente.'); }

    if (!d.success) throw new Error(d.error || 'Sessão inválida ou expirada. Entre novamente.');
    sessao = { usuario: d.usuario, nome: d.nome, papel: d.papel };
    cache.put(chave, JSON.stringify(sessao), 300);
  }

  if (CR_PAPEIS_COM_ESCRITA.indexOf(String(sessao.papel)) < 0) {
    throw new Error('Seu usuário não tem permissão para alterar contas a receber.');
  }
  sessao.token = token;
  return sessao;
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═════════════════════════════════════════════════════════════════════════════

/** Aceita "1.234,56" (pt-BR), "1234.56", número e Date. */
function numeroRec(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v).trim().replace(/[R$\s%]/g, '');
  if (s === '') return 0;
  const temVirgula = s.indexOf(',') >= 0, temPonto = s.indexOf('.') >= 0;
  if (temVirgula && temPonto) s = s.replace(/\./g, '').replace(',', '.');
  else if (temVirgula)        s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function arred(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** Aceita Date, 'YYYY-MM-DD' e 'DD/MM/YYYY'. Devolve Date ou null. */
function paraDataRec(v) {
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

function dataParaISORec(v) {
  const d = paraDataRec(v);
  return d ? Utilities.formatDate(d, 'GMT-3', 'yyyy-MM-dd') : '';
}

function registrarRec(quem, acao, ref, detalhe) {
  try {
    const ss = SpreadsheetApp.openById(CR_PLANILHA_ID);
    const sh = ss.getSheetByName(ABA_REC_LOG) || garantirAbaRec(ss, ABA_REC_LOG, CAB_REC_LOG);
    sh.appendRow([new Date(), quem || '', acao, ref || '', detalhe || '']);
  } catch (e) {
    // Log é apoio: se falhar, a operação principal não pode cair junto.
    Logger.log('Falha ao registrar log: ' + e);
  }
}

function erroTextoRec(err) {
  return String(err && err.message ? err.message : err);
}

function jsonR(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
