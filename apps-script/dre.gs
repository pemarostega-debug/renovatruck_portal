/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DRE Gerencial — backend (Apps Script sobre uma planilha PRIVADA)
 *
 *   planilha financeira (Titulos + RecTitulos + PlanoContas) ──► aqui ──► portal (só admin)
 *
 * Regime de competência pela DATA DE EMISSÃO (NF e título), não pelo vencimento.
 * Só LÊ a planilha financeira (a mesma do Contas a Pagar e a Receber); nunca
 * grava nela. O que é só do DRE (lista de NFs de contrato, budget, log) mora na
 * planilha própria à qual este script está vinculado.
 *
 * Estrutura (gabarito DRE-Renova-Outubro-2026.xlsx + decisões do dono 17/11/2026):
 *   Receita bruta (R.1 Contratos · R.2 Spot Serviços · R.3 Spot Peças)
 *   − Custos operacionais (1.xx)          = Margem de Contribuição
 *   − Despesas fixas (2.xx)               = Resultado Operacional
 *   − Financeiras (3.xx menos 3.02, 3.06) = Resultado do Período
 *   Informativo, fora do resultado: 3.02, 3.06, CAPEX (4.xx) e 9.99.
 *
 * Abas da planilha do DRE:
 *   DreContratos — EXCEÇÕES à regra automática: competencia (YYYY-MM), numero_nf, tipo_nf,
 *                  cliente_cod (opcional), regra (CONTRATO | SPOT; vazio = CONTRATO).
 *
 * Contrato é detectado sozinho: NF de SERVIÇO cuja OS tem, na descrição de algum item de
 * serviço, a palavra "contrato" (aba Itens da planilha Resultado Semanal, ligada pelo
 * número da OS). A aba DreContratos só guarda o que o dono corrigiu à mão na tela.
 * A planilha Resultado Semanal é achada pela propriedade do script ITENS_PLANILHA_ID.
 *   DreBudget    — competencia (YYYY-MM), linha (R.1-3 ou N.NN), valor (meta do mês, número com ponto)
 *   Log
 *
 * O arquivo tem duas metades: ACESSO (planilha, sessão, cache) e CÁLCULO
 * (funções puras, sem SpreadsheetApp — testadas em ferramentas/testar-dre.js).
 *
 * Implantação: ver integracao/LEIA-ME-dre.md
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_MANUAL = 'https://script.google.com/macros/s/AKfycbxmdLCRPZwf6u7l8BnbtqbomFRcjplzJOKCeNWSTRNCKq8M9NtO2uWO7DjEP-xN7WBkkg/exec';

// Planilha financeira única (Contas a Pagar + Contas a Receber). Só leitura.
const DRE_FONTE_ID = '1EftBE75ZtNOolVwpYN-Zs1OqhdvbpDNm4-DieoHuW_E';
const ABA_TITULOS = 'Titulos';
const ABA_REC_TITULOS = 'RecTitulos';
const ABA_PLANO = 'PlanoContas';

const ABA_CONTRATOS = 'DreContratos';
const ABA_LOG = 'Log';
const ABA_BUDGET = 'DreBudget';
const CAB_CONTRATOS = ['competencia', 'numero_nf', 'tipo_nf', 'cliente_cod', 'regra'];
const ABA_ITENS = 'Itens';                 // da planilha Resultado Semanal (só leitura)
const PROP_ITENS_ID = 'ITENS_PLANILHA_ID';
const DRE_CONTRATO_INICIO = '2026-10';     // o contrato começou em out/2026: antes disso não se cobra aviso
const CAB_BUDGET = ['competencia', 'linha', 'valor'];
const CAB_LOG = ['quando', 'quem', 'acao', 'detalhe'];

// Contas do macro 3 que ficam FORA do resultado (decisão do dono, 17/11/2026).
const DRE_FIN_INFORMATIVAS = ['3.02', '3.06'];
const DRE_MAX_MESES = 24;
const DRE_CACHE_CHAVE = 'dre_base_v1';
const DRE_CACHE_SEG = 600;   // 10 min: a tela abre rápido e um lançamento novo aparece logo

// ═════════════════════════════════════════════════════════════════════════════
// ROTEADOR
// ═════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  // Nenhum dado por GET: token em URL vaza em log. GET só responde "estou vivo".
  if (action === 'ping') return json({ success: true, versao: 1 });
  return json({ success: false, error: 'Use POST com sessão.' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || '';
    const sessao = validarToken(body.token);

    if (action === 'resultado') return json({ success: true, data: resultado(body) });
    if (action === 'detalhe') return json({ success: true, data: detalhe(body) });
    if (action === 'budget_ler') return json({ success: true, data: budgetLer(body) });
    if (action === 'budget_gravar') return json({ success: true, data: budgetGravar(body, sessao) });
    if (action === 'classe_definir') return json({ success: true, data: classeDefinir(body, sessao) });

    return json({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return json({ success: false, error: erroTexto(err) });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACESSO — só admin (mesma sessão do Manual da Empresa)
// ═════════════════════════════════════════════════════════════════════════════

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
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ action: 'sessao_validar', token: token }),
        muteHttpExceptions: true, followRedirects: true
      });
    } catch (e) {
      throw new Error('Não consegui validar seu acesso agora (' + erroTexto(e) + ').');
    }
    let d;
    try { d = JSON.parse(resposta.getContentText()); }
    catch (e) { throw new Error('Resposta inesperada do serviço de login.'); }
    if (!d.success) throw new Error(d.error || 'Sessão inválida ou expirada. Entre novamente.');
    sessao = { usuario: d.usuario, nome: d.nome, papel: d.papel };
    cache.put(chave, JSON.stringify(sessao), 300);
  }

  if (String(sessao.papel) !== 'admin') {
    throw new Error('O DRE Gerencial é restrito a administradores.');
  }
  return sessao;
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION resultado — body: { de: 'YYYY-MM', ate: 'YYYY-MM', forcar?: true }
// ═════════════════════════════════════════════════════════════════════════════

function resultado(body) {
  const meses = listaMeses(String(body.de || ''), String(body.ate || ''));
  const base = baseDre(!!body.forcar);
  return montarDre(base, meses);
}

/**
 * ACTION detalhe — body: { mes: 'YYYY-MM', linha: 'R.1' | '1.01' | ... }
 * Lê a planilha na hora (não vai para o cache: é consulta pontual de um mês).
 */
function detalhe(body) {
  const mes = String(body.mes || '');
  const linha = String(body.linha || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Mês inválido: use AAAA-MM.');
  if (!/^(R\.[123]|\d{1,2}\.\d{2})$/.test(linha)) throw new Error('Linha inválida para detalhar: ' + linha);
  const ss = abrirFonte();
  let d;
  if (linha.charAt(0) === 'R') {
    const rec = lerAba(ss, ABA_REC_TITULOS);
    d = detalheReceita(rec.cab, rec.linhas, lerContratos(), mes, linha, lerServicos().mapa);
    d.tipo = 'receita';
  } else {
    const t = lerAba(ss, ABA_TITULOS);
    d = detalheDespesas(t.cab, t.linhas, mes, linha);
    d.tipo = 'despesa';
  }
  d.mes = mes; d.linha = linha;
  return d;
}

/**
 * ACTION classe_definir — body: { competencia, numero_nf, tipo_nf, cliente_cod, classe: 'CONTRATO' | 'SPOT' | 'AUTO' }
 * Corrige à mão a classe de UMA NF (exceção à regra automática). 'AUTO' apaga a
 * correção e a NF volta a seguir a descrição. Só admin (validarToken), com Log.
 * Limpa o cache da base para o DRE refletir na hora.
 */
function classeDefinir(body, sessao) {
  const m = validarMarca(body);
  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  let alterado = 0;
  try {
    const sh = aba(ABA_CONTRATOS, CAB_CONTRATOS);
    garantirColunaRegra(sh);
    const n = Math.max(sh.getLastRow() - 1, 0);
    const atuais = n ? sh.getRange(2, 1, n, CAB_CONTRATOS.length).getDisplayValues() : [];
    const casam = marcasQueCobrem(atuais, m);
    const mesma = casam.length === 1 && regraDaLinha(atuais[casam[0]]) === m.classe;
    if (!mesma) {
      // de baixo para cima, para os números de linha não deslocarem
      casam.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { sh.deleteRow(i + 2); alterado++; });
      if (m.classe !== 'AUTO') {
        const linha = sh.getLastRow() + 1;
        const alvo = sh.getRange(linha, 1, 1, CAB_CONTRATOS.length);
        alvo.setNumberFormat('@');   // texto puro: "2026-10" viraria data, "0539" perderia o zero
        alvo.setValues([[m.competencia, m.numero_nf, m.tipo_nf, m.cliente_cod, m.classe]]);
        alterado++;
      }
    }
  } finally {
    trava.releaseLock();
  }
  if (alterado) {
    cacheLimpar(CacheService.getScriptCache(), DRE_CACHE_CHAVE);
    registrar(sessao && sessao.usuario, 'classe_' + m.classe.toLowerCase(),
      [m.competencia, m.numero_nf, m.tipo_nf, m.cliente_cod].join(' | '));
  }
  return { competencia: m.competencia, numero_nf: m.numero_nf, tipo_nf: m.tipo_nf, cliente_cod: m.cliente_cod, classe: m.classe, alterado: alterado };
}

/** Planilhas criadas antes da coluna "regra" ganham o cabeçalho na primeira correção. */
function garantirColunaRegra(sh) {
  const i = CAB_CONTRATOS.indexOf('regra') + 1;
  if (!String(sh.getRange(1, i, 1, 1).getDisplayValues()[0][0]).trim()) sh.getRange(1, i).setValue('regra');
}

/**
 * ACTION budget_ler — body: { de: 'YYYY-MM', ate: 'YYYY-MM' }
 * Metas gravadas no período: { itens: [{ competencia, linha, valor }] }. Não usa cache (é pequeno).
 */
function budgetLer(body) {
  const meses = listaMeses(String(body.de || ''), String(body.ate || ''));
  const sh = aba(ABA_BUDGET, CAB_BUDGET);
  const n = Math.max(sh.getLastRow() - 1, 0);
  const linhas = n ? sh.getRange(2, 1, n, CAB_BUDGET.length).getDisplayValues() : [];
  return { itens: budgetDoPeriodo(linhas, meses) };
}

/**
 * ACTION budget_gravar — body: { competencia, itens: [{ linha, valor }] }
 * Troca as metas DAQUELE mês pelas enviadas (valor vazio/nulo = sem meta).
 * Só admin, com Log. Não mexe nos outros meses.
 */
function budgetGravar(body, sessao) {
  const b = validarBudget(body);
  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    const sh = aba(ABA_BUDGET, CAB_BUDGET);
    const n = Math.max(sh.getLastRow() - 1, 0);
    const atuais = n ? sh.getRange(2, 1, n, CAB_BUDGET.length).getDisplayValues() : [];
    const novas = budgetAplicar(atuais, b.competencia, b.itens);
    if (n) sh.getRange(2, 1, n, CAB_BUDGET.length).clearContent();
    if (novas.length) {
      const alvo = sh.getRange(2, 1, novas.length, CAB_BUDGET.length);
      alvo.setNumberFormat('@');   // texto puro: o valor vai com ponto e nunca é reinterpretado
      alvo.setValues(novas);
    }
  } finally {
    trava.releaseLock();
  }
  registrar(sessao && sessao.usuario, 'budget_gravar', b.competencia + ' | ' + b.itens.length + ' linha(s)');
  return { competencia: b.competencia, itens: b.itens.filter(function (i) { return i.valor !== null; }) };
}

/**
 * A "base" é o agregado de TODOS os meses (mês × linha). É pequena (dezenas de
 * linhas × poucos anos), então vai inteira para o cache e qualquer período que
 * a tela pedir sai dela sem abrir a planilha de novo.
 */
function baseDre(forcar) {
  const cache = CacheService.getScriptCache();
  if (!forcar) {
    const guardada = cacheLer(cache, DRE_CACHE_CHAVE);
    if (guardada) return guardada;
  }
  const ss = abrirFonte();
  const plano = lerAba(ss, ABA_PLANO);
  const titulos = lerAba(ss, ABA_TITULOS);
  const rec = lerAba(ss, ABA_REC_TITULOS);
  const contratos = lerContratos();
  const serv = lerServicos();

  const base = {
    gerado_em: new Date().toISOString(),
    plano: normalizarPlano(plano.cab, plano.linhas),
    despesas: agregarDespesas(titulos.cab, titulos.linhas),
    receita: agregarReceita(rec.cab, rec.linhas, contratos, serv.mapa),
    servicos: serv.status
  };
  cacheGravar(cache, DRE_CACHE_CHAVE, base, DRE_CACHE_SEG);
  return base;
}

// A planilha financeira é grande e openById nela não é grátis: abre uma vez
// por execução (mesma correção do abrirCP / abrirCR).
let _dreFonte = null;
function abrirFonte() {
  if (!_dreFonte) _dreFonte = SpreadsheetApp.openById(DRE_FONTE_ID);
  return _dreFonte;
}

/**
 * Lê a aba inteira de uma vez (getValues em bloco; nunca linha a linha).
 * As colunas são achadas pelo NOME do cabeçalho: este projeto não carrega o
 * CAB_TITULOS / CAB_REC_TITULOS dos outros scripts, e se lá acrescentarem uma
 * coluna no fim nada aqui quebra.
 */
function lerAba(ss, nome) {
  const sh = ss.getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada na planilha financeira.');
  const ultLinha = sh.getLastRow(), ultCol = sh.getLastColumn();
  if (ultLinha < 1 || ultCol < 1) return { cab: [], linhas: [] };
  const valores = sh.getRange(1, 1, ultLinha, ultCol).getValues();
  return { cab: valores[0].map(function (c) { return String(c).trim(); }), linhas: valores.slice(1) };
}

function lerContratos() {
  const sh = aba(ABA_CONTRATOS, CAB_CONTRATOS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, CAB_CONTRATOS.length).getDisplayValues()
    .map(function (l) { return { competencia: l[0], numero_nf: l[1], tipo_nf: l[2], cliente_cod: l[3], regra: l[4] }; });
}

/**
 * Descrições dos serviços por OS, da aba Itens da planilha Resultado Semanal.
 * Nunca derruba o DRE: se a planilha não está ligada ou mudou de formato, devolve
 * mapa vazio e um `status` que a tela mostra uma vez (tudo cai na regra manual).
 */
function lerServicos() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_ITENS_ID);
  if (!id) return { mapa: {}, status: { ok: false, motivo: 'sem_planilha' } };
  try {
    const sh = SpreadsheetApp.openById(id).getSheetByName(ABA_ITENS);
    if (!sh || sh.getLastRow() < 2) return { mapa: {}, status: { ok: false, motivo: 'sem_itens' } };
    const valores = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    return servicosPorOs(valores[0], valores.slice(1));
  } catch (e) {
    Logger.log('Itens do Resultado Semanal: ' + e);
    return { mapa: {}, status: { ok: false, motivo: 'erro_leitura' } };
  }
}

// ── Cache: CacheService aceita no máximo ~100 KB por chave → fatia em pedaços.
function cacheGravar(cache, chave, obj, seg) {
  const txt = JSON.stringify(obj);
  const TAM = 90000;
  const partes = {};
  const n = Math.ceil(txt.length / TAM);
  for (let i = 0; i < n; i++) partes[chave + '_' + i] = txt.slice(i * TAM, (i + 1) * TAM);
  partes[chave] = String(n);
  try { cache.putAll(partes, seg); } catch (e) { Logger.log('Cache do DRE não gravou: ' + e); }
}

function cacheLer(cache, chave) {
  const n = Number(cache.get(chave) || 0);
  if (!n) return null;
  const nomes = [];
  for (let i = 0; i < n; i++) nomes.push(chave + '_' + i);
  const partes = cache.getAll(nomes);
  let txt = '';
  for (let i = 0; i < n; i++) {
    if (partes[nomes[i]] === undefined) return null;   // um pedaço expirou antes
    txt += partes[nomes[i]];
  }
  try { return JSON.parse(txt); } catch (e) { return null; }
}

function cacheLimpar(cache, chave) {
  const n = Number(cache.get(chave) || 0);
  const nomes = [chave];
  for (let i = 0; i < n; i++) nomes.push(chave + '_' + i);
  cache.removeAll(nomes);
}

/** Projeto "vinculado" à planilha do DRE (Extensões → Apps Script). */
function planilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Este script precisa ser criado a partir da planilha do DRE (Extensões → Apps Script).');
  return ss;
}

function aba(nome, cabecalho) {
  const ss = planilha();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    sh.setFrozenRows(1);
    // Texto puro: em pt-BR "2026-10" viraria data e "0539" perderia o zero.
    sh.getRange(2, 1, sh.getMaxRows() - 1, cabecalho.length).setNumberFormat('@');
  }
  return sh;
}

/** Rode uma vez depois de colar o script: cria as abas e pede as autorizações. */
function instalar() {
  aba(ABA_CONTRATOS, CAB_CONTRATOS);
  aba(ABA_BUDGET, CAB_BUDGET);
  aba(ABA_LOG, CAB_LOG);
  abrirFonte().getSheetByName(ABA_PLANO);
  UrlFetchApp.fetch(API_MANUAL + '?action=ping', { muteHttpExceptions: true });
  return 'ok';
}

function registrar(quem, acao, detalhe) {
  try { aba(ABA_LOG, CAB_LOG).appendRow([new Date(), quem || '', acao, detalhe || '']); }
  catch (e) { Logger.log('Falha no log: ' + e); }
}

function erroTexto(err) { return String(err && err.message ? err.message : err); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ═════════════════════════════════════════════════════════════════════════════
// CÁLCULO — funções puras. Nada abaixo daqui toca SpreadsheetApp, Cache ou
// rede: recebem matrizes (como o getValues devolve) e devolvem objetos simples.
// ═════════════════════════════════════════════════════════════════════════════

/** Aceita "1.234,56" (pt-BR), "1234.56", número. */
function numero(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (s === '') return 0;
  const temVirgula = s.indexOf(',') >= 0, temPonto = s.indexOf('.') >= 0;
  if (temVirgula && temPonto) s = s.replace(/\./g, '').replace(',', '.');
  else if (temVirgula)        s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function arred(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function texto(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function anoValido(a) { return a >= 2000 && a <= 2100; }

function ym(ano, mes) { return ano + '-' + ('0' + mes).slice(-2); }

/**
 * 'YYYY-MM' de uma data (Date, 'YYYY-MM-DD', 'DD/MM/YYYY'). Data digitada errada
 * (ex.: "20261-10-13", ano 1899) → cai na competência do título.
 * Devolve '' se nenhuma das duas servir.
 */
function mesDe(data, competencia) {
  const m = mesDeUm(data);
  if (m) return m;
  return mesDeUm(competencia);
}

function mesDeUm(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime()) || !anoValido(v.getFullYear())) return '';
    return ym(v.getFullYear(), v.getMonth() + 1);
  }
  const s = String(v).trim();
  let r = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:$|[T\s])/.exec(s);
  if (r && anoValido(+r[1]) && +r[2] >= 1 && +r[2] <= 12) return ym(+r[1], +r[2]);
  r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (r && anoValido(+r[3]) && +r[2] >= 1 && +r[2] <= 12) return ym(+r[3], +r[2]);
  r = /^(\d{1,2})\/(\d{4})$/.exec(s);   // "10/2026"
  if (r && anoValido(+r[2]) && +r[1] >= 1 && +r[1] <= 12) return ym(+r[2], +r[1]);
  return '';
}

/** Dia 'YYYY-MM-DD' (para a chave da NF). '' se inválido. */
function diaDe(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return ym(v.getFullYear(), v.getMonth() + 1) + '-' + ('0' + v.getDate()).slice(-2);
  }
  const s = String(v).trim();
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) return ym(+r[1], +r[2]) + '-' + ('0' + +r[3]).slice(-2);
  r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (r) return ym(+r[3], +r[2]) + '-' + ('0' + +r[1]).slice(-2);
  return s;
}

/** Meses de 'de' até 'ate' inclusive. Máximo DRE_MAX_MESES. */
function listaMeses(de, ate) {
  const re = /^(\d{4})-(\d{2})$/;
  const a = re.exec(de), b = re.exec(ate);
  if (!a || !b) throw new Error('Período inválido: use de/ate no formato AAAA-MM.');
  let ano = +a[1], mes = +a[2];
  const fim = +b[1] * 12 + +b[2];
  if (ano * 12 + mes > fim) throw new Error('O mês inicial é depois do final.');
  const out = [];
  while (ano * 12 + mes <= fim) {
    out.push(ym(ano, mes));
    if (out.length > DRE_MAX_MESES) throw new Error('No máximo ' + DRE_MAX_MESES + ' meses por consulta.');
    mes++; if (mes > 12) { mes = 1; ano++; }
  }
  return out;
}

/** { nome_da_coluna: índice } a partir da linha de cabeçalho. */
function indices(cab) {
  const ix = {};
  (cab || []).forEach(function (c, i) { ix[String(c).trim()] = i; });
  return ix;
}

function exigirColunas(ix, nomes, aba) {
  const falta = nomes.filter(function (n) { return ix[n] === undefined; });
  if (falta.length) throw new Error('Aba ' + aba + ' sem a(s) coluna(s): ' + falta.join(', '));
}

/**
 * Código da natureza → código da LINHA do DRE (dois níveis: "1.01").
 * "1.01.03" soma em 1.01. Vazio vai para 9.99 (A Classificar).
 * O código é gravado como texto na planilha; se algum vier número (planilha
 * pt-BR), 1.01 continua "1.01", mas 2.1 vira "2.10" — os códigos do plano
 * sempre têm dois dígitos no 2º nível.
 */
function linhaDaNatureza(codigo) {
  let c;
  if (typeof codigo === 'number') {
    c = codigo % 1 === 0 ? String(codigo) : codigo.toFixed(2);
  } else {
    c = texto(codigo);
  }
  if (!c) return '9.99';
  const p = c.split('.');
  return p.length >= 2 ? p[0] + '.' + p[1] : p[0];
}

/** Grupo do DRE pelo 1º segmento do código (o código manda, não o nome). */
function grupoDaLinha(linha) {
  if (DRE_FIN_INFORMATIVAS.indexOf(linha) >= 0) return 'INFO';
  const s = String(linha).split('.')[0];
  if (s === '1') return 'CUSTO_OP';
  if (s === '2') return 'FIXA';
  if (s === '3') return 'FIN';
  return 'INFO';   // 4.xx CAPEX, 9.99 e o que mais aparecer
}

/** PlanoContas → [{ codigo, nome, nivel, macro, ativo, ordem }] (só linhas de 2 níveis). */
function normalizarPlano(cab, linhas) {
  const ix = indices(cab);
  exigirColunas(ix, ['codigo', 'nome'], 'PlanoContas');
  const out = [];
  const visto = {};
  (linhas || []).forEach(function (l) {
    const bruto = l[ix.codigo];
    if (bruto === '' || bruto === null || bruto === undefined) return;
    const cod = typeof bruto === 'number' ? linhaDaNatureza(bruto) : texto(bruto);
    if (cod.split('.').length !== 2 || visto[cod]) return;
    visto[cod] = true;
    out.push({
      codigo: cod,
      nome: texto(l[ix.nome]),
      macro: ix.macro !== undefined ? texto(l[ix.macro]) : '',
      ativo: ix.ativo === undefined || texto(l[ix.ativo]).toUpperCase() !== 'NAO',
      ordem: ix.ordem !== undefined ? numero(l[ix.ordem]) : 0
    });
  });
  return out;
}

/**
 * Titulos → { 'YYYY-MM': { '1.01': valor, ... } } + contadores para avisos.
 * Cancelado não entra. Pago, parcial e aberto entram pelo valor_total.
 */
function agregarDespesas(cab, linhas) {
  const ix = indices(cab);
  exigirColunas(ix, ['data_emissao', 'natureza_codigo', 'valor_total', 'status'], 'Titulos');
  const porMes = {}, nomes = {}, avisos = { sem_mes: 0, sem_mes_valor: 0, emissao_corrigida: 0 };

  (linhas || []).forEach(function (l) {
    if (ix.id !== undefined && !texto(l[ix.id])) return;
    if (texto(l[ix.status]).toUpperCase() === 'CANCELADO') return;
    const valor = numero(l[ix.valor_total]);
    if (!valor) return;
    const comp = ix.competencia !== undefined ? l[ix.competencia] : '';
    const mes = mesDe(l[ix.data_emissao], comp);
    if (!mes) { avisos.sem_mes++; avisos.sem_mes_valor = arred(avisos.sem_mes_valor + valor); return; }
    if (!mesDeUm(l[ix.data_emissao])) avisos.emissao_corrigida++;
    const linha = linhaDaNatureza(l[ix.natureza_codigo]);
    if (!nomes[linha] && ix.natureza !== undefined) nomes[linha] = texto(l[ix.natureza]);
    const m = porMes[mes] || (porMes[mes] = {});
    m[linha] = arred((m[linha] || 0) + valor);
  });
  return { por_mes: porMes, nomes: nomes, avisos: avisos };
}

/** Chave do contrato: competência + número + tipo (+ cliente, quando informado). */
function chaveContrato(competencia, numeroNf, tipoNf) {
  return [texto(competencia), texto(numeroNf).replace(/^0+/, ''), texto(tipoNf).toUpperCase()].join('|');
}

/** Mesma regra do tipoNfRec() do Contas a Receber (lá é a fonte; aqui é cópia). */
function tipoNf(valor) {
  const v = texto(valor).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (v === 'PECA' || v === 'SERVICO') return v;
  if (v.indexOf('SERVI') >= 0 || v.indexOf('PRESTA') >= 0) return 'SERVICO';
  if (v.indexOf('MERCADORIA') >= 0 || v.indexOf('VENDA') === 0 || v.indexOf('REMESSA') === 0) return 'PECA';
  return '';
}

/**
 * RecTitulos (uma linha por PARCELA) → receita por mês × classe.
 *
 * A NF é identificada por numero_nf + tipo_nf + data_emissao + cliente_cod (a
 * numeração repete entre peça e serviço). Vale o TOTAL da NF (decisão do dono):
 * se faltam parcelas no CR, estima as faltantes pela média das lançadas e marca
 * a NF como estimada. Parcela cancelada não soma, mas também não é "faltante".
 *
 * Classe, em ordem de força:
 *   1. correção manual (aba DreContratos): regra CONTRATO → R.1, regra SPOT → Spot;
 *   2. automática: NF de SERVIÇO cuja OS tem "contrato" na descrição de algum serviço → R.1;
 *   3. senão PECA → R.3; senão → R.2.
 */
function agregarReceita(cab, linhas, contratos, servicos) {
  const c = consolidarNfs(cab, linhas, contratos, servicos);
  const porMes = {};
  c.nfs.forEach(function (nf) {
    const m = porMes[nf.mes] || (porMes[nf.mes] = { 'R.1': 0, 'R.2': 0, 'R.3': 0, nfs: { 'R.1': 0, 'R.2': 0, 'R.3': 0 } });
    m[nf.classe] = arred(m[nf.classe] + nf.valor);
    m.nfs[nf.classe]++;
  });
  const estimadas = c.nfs.filter(function (nf) { return nf.estimada; }).map(function (nf) {
    return { mes: nf.mes, numero_nf: nf.numero_nf, tipo_nf: nf.tipo_nf, cliente: nf.cliente,
      num_os: nf.num_os, lancado: nf.lancado, estimado: nf.valor,
      parcelas_lancadas: nf.parcelas_lancadas, total_parcelas: nf.total_parcelas };
  });
  return { por_mes: porMes, estimadas: estimadas, avisos: c.avisos };
}

/**
 * Passo comum do agregado e do drill-down: devolve UMA entrada por NF
 * ({ mes, numero_nf, tipo_nf, cliente, num_os, valor, classe, estimada, ... })
 * já com a regra do total estimado e da classe aplicadas.
 */
function consolidarNfs(cab, linhas, contratos, servicos) {
  const ix = indices(cab);
  exigirColunas(ix, ['data_emissao', 'numero_nf', 'valor_total', 'status'], 'RecTitulos');

  const listaContrato = {};
  (contratos || []).forEach(function (c) {
    const k = chaveContrato(c.competencia, c.numero_nf, tipoNf(c.tipo_nf) || 'SERVICO');
    (listaContrato[k] || (listaContrato[k] = [])).push({ cli: texto(c.cliente_cod), regra: regraDaLinha([0, 0, 0, 0, c.regra]) });
  });
  const serv = servicos || {};

  const nfs = {};
  const avisos = { sem_nf: 0, sem_nf_valor: 0, sem_mes: 0, sem_mes_valor: 0, sem_tipo: 0 };

  (linhas || []).forEach(function (l) {
    if (ix.id !== undefined && !texto(l[ix.id])) return;
    const cancelado = texto(l[ix.status]).toUpperCase() === 'CANCELADO';
    const valor = numero(l[ix.valor_total]);
    const numeroNf = texto(l[ix.numero_nf]);
    if (!numeroNf) {
      if (!cancelado && valor) { avisos.sem_nf++; avisos.sem_nf_valor = arred(avisos.sem_nf_valor + valor); }
      return;
    }
    const comp = ix.competencia !== undefined ? l[ix.competencia] : '';
    const mes = mesDe(l[ix.data_emissao], comp);
    if (!mes) {
      if (!cancelado && valor) { avisos.sem_mes++; avisos.sem_mes_valor = arred(avisos.sem_mes_valor + valor); }
      return;
    }
    let tipo = tipoNf(ix.tipo_nf !== undefined ? l[ix.tipo_nf] : '');
    if (!tipo && ix.natureza_operacao !== undefined) tipo = tipoNf(l[ix.natureza_operacao]);
    const clienteCod = ix.cliente_cod !== undefined ? texto(l[ix.cliente_cod]) : '';
    const chave = [numeroNf, tipo, diaDe(l[ix.data_emissao]) || mes, clienteCod].join('|');

    const nf = nfs[chave] || (nfs[chave] = {
      mes: mes, numero_nf: numeroNf, tipo_nf: tipo, cliente_cod: clienteCod,
      cliente: ix.cliente !== undefined ? texto(l[ix.cliente]) : '',
      num_os: ix.num_os !== undefined ? texto(l[ix.num_os]) : '',
      lancado: 0, ativas: 0, parcelas: {}, total_parcelas: 1
    });
    const p = ix.parcela !== undefined ? (Math.floor(numero(l[ix.parcela])) || 1) : 1;
    nf.parcelas[p] = true;
    if (ix.total_parcelas !== undefined) nf.total_parcelas = Math.max(nf.total_parcelas, Math.floor(numero(l[ix.total_parcelas])) || 1);
    if (!cancelado) { nf.lancado = arred(nf.lancado + valor); nf.ativas++; }
  });

  const lista = [];
  Object.keys(nfs).forEach(function (k) {
    const nf = nfs[k];
    if (!nf.ativas) return;   // todas as parcelas canceladas
    if (!nf.tipo_nf) avisos.sem_tipo++;
    const vistas = Object.keys(nf.parcelas).length;
    const faltam = Math.max(nf.total_parcelas - vistas, 0);
    const valor = faltam ? arred(nf.lancado + (nf.lancado / nf.ativas) * faltam) : nf.lancado;
    const kc = chaveContrato(nf.mes, nf.numero_nf, nf.tipo_nf || 'SERVICO');
    const marcas = (listaContrato[kc] || []).filter(function (x) { return x.cli === '' || x.cli === nf.cliente_cod; });
    const manual = marcas.length ? (marcas.some(function (x) { return x.regra === 'SPOT'; }) ? 'SPOT' : 'CONTRATO') : '';
    const sv = serv[nf.num_os] || null;
    const auto = nf.tipo_nf !== 'PECA' && !!sv && sv.contrato;
    const contrato = manual ? manual === 'CONTRATO' : auto;
    lista.push({
      mes: nf.mes, numero_nf: nf.numero_nf, tipo_nf: nf.tipo_nf, cliente_cod: nf.cliente_cod,
      cliente: nf.cliente, num_os: nf.num_os, lancado: nf.lancado, valor: valor,
      classe: contrato ? 'R.1' : (nf.tipo_nf === 'PECA' ? 'R.3' : 'R.2'),
      origem_classe: manual ? 'manual' : (auto ? 'descricao' : 'padrao'),
      auto_contrato: auto,
      descricao: sv ? sv.descricoes.join(' · ') : '',
      estimada: faltam > 0, parcelas_lancadas: vistas, total_parcelas: nf.total_parcelas
    });
  });
  return { nfs: lista, avisos: avisos };
}

// ═════════════════════════════════════════════════════════════════════════════
// MARCAÇÃO DE CONTRATOS — NFs do mês e validação da marca
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Valida o que vai para a aba DreContratos. Rígida de propósito: o valor vira
 * célula de planilha, então nada que comece com = + - @ passa.
 */
function validarMarca(body) {
  const competencia = texto(body.competencia);
  const numeroNf = texto(body.numero_nf);
  const tipo = tipoNf(body.tipo_nf);
  const cliente = texto(body.cliente_cod);
  const classe = texto(body.classe).toUpperCase();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw new Error('Competência inválida: use AAAA-MM.');
  if (!/^[0-9A-Za-z][0-9A-Za-z.\-\/]{0,19}$/.test(numeroNf)) throw new Error('Número de NF inválido.');
  if (!tipo) throw new Error('Tipo da NF inválido: use PECA ou SERVICO.');
  if (cliente !== '' && !/^[0-9A-Za-z][0-9A-Za-z.\-]{0,19}$/.test(cliente)) throw new Error('Código de cliente inválido.');
  if (['CONTRATO', 'SPOT', 'AUTO'].indexOf(classe) < 0) throw new Error('Classe inválida: use CONTRATO, SPOT ou AUTO.');
  return { competencia: competencia, numero_nf: numeroNf, tipo_nf: tipo, cliente_cod: cliente, classe: classe };
}

/** Regra de uma linha da DreContratos (coluna 5): SPOT ou, em branco/qualquer outra coisa, CONTRATO. */
function regraDaLinha(l) {
  return texto(l[4]).toUpperCase() === 'SPOT' ? 'SPOT' : 'CONTRATO';
}

/**
 * Posições (0-based, dentro de `atuais`) das linhas de DreContratos que dizem
 * algo sobre a NF `m`: mesma competência/número/tipo e cliente igual ou em
 * branco (em branco vale para qualquer cliente). Mesma regra do consolidarNfs.
 */
function marcasQueCobrem(atuais, m) {
  const k = chaveContrato(m.competencia, m.numero_nf, m.tipo_nf);
  const out = [];
  (atuais || []).forEach(function (l, i) {
    const cli = texto(l[3]);
    if (chaveContrato(l[0], l[1], tipoNf(l[2]) || 'SERVICO') === k && (cli === '' || cli === m.cliente_cod)) out.push(i);
  });
  return out;
}

/** Texto sem acento e em minúsculas, para achar "contrato" em qualquer grafia. */
function semAcento(v) {
  return texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Nome de coluna normalizado (como o extrator do Resultado Semanal): sem acento nem pontuação. */
function normCol(v) { return semAcento(v).replace(/[^a-z0-9]/g, ''); }

/**
 * Aba Itens do Resultado Semanal (uma linha por item de OS) → { numero_os: { contrato, descricoes } }.
 * `contrato` = algum serviço da OS tem a palavra "contrato". A coluna da OS e a da
 * descrição do serviço são achadas pelo nome normalizado (o nome muda conforme a
 * versão da view). OS repetida em várias linhas acumula, sem repetir descrição.
 */
function servicosPorOs(cab, linhas) {
  const ix = {};
  (cab || []).forEach(function (c, i) { const k = normCol(c); if (!(k in ix)) ix[k] = i; });
  const cOs = ix.numeroos !== undefined ? ix.numeroos : ix.numos;
  const cDesc = ix.descricaosservico !== undefined ? ix.descricaosservico : ix.descricaoservico;
  if (cOs === undefined || cDesc === undefined) return { mapa: {}, status: { ok: false, motivo: 'sem_colunas' } };
  const mapa = {};
  (linhas || []).forEach(function (l) {
    const os = texto(l[cOs]).replace(/\.0+$/, '');
    const d = texto(l[cDesc]);
    if (!os || !d) return;
    const e = mapa[os] || (mapa[os] = { contrato: false, descricoes: [] });
    if (semAcento(d).indexOf('contrato') >= 0) e.contrato = true;
    if (e.descricoes.indexOf(d) < 0 && e.descricoes.length < 3) e.descricoes.push(d.length > 120 ? d.slice(0, 117) + '...' : d);
  });
  return { mapa: mapa, status: { ok: true, os: Object.keys(mapa).length } };
}

// ═════════════════════════════════════════════════════════════════════════════
// BUDGET — metas por mês × linha da DRE
// ═════════════════════════════════════════════════════════════════════════════

const DRE_BUDGET_MAX_ITENS = 200;

/** Valida o corpo do budget_gravar. valor: número ≥ 0 (ou "1.234,56"); vazio/nulo = remover a meta. */
function validarBudget(body) {
  const competencia = texto(body.competencia);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw new Error('Competência inválida: use AAAA-MM.');
  if (!Array.isArray(body.itens)) throw new Error('Envie a lista de metas em "itens".');
  if (body.itens.length > DRE_BUDGET_MAX_ITENS) throw new Error('Metas demais de uma vez (máximo ' + DRE_BUDGET_MAX_ITENS + ').');
  const vistos = {};
  const itens = body.itens.map(function (i) {
    const linha = texto(i && i.linha);
    if (!/^(R\.[123]|\d{1,2}\.\d{2})$/.test(linha)) throw new Error('Linha inválida para meta: ' + linha);
    if (vistos[linha]) throw new Error('Linha repetida: ' + linha);
    vistos[linha] = true;
    const v = i.valor;
    if (v === null || v === undefined || texto(v) === '') return { linha: linha, valor: null };
    let n;
    if (typeof v === 'number') n = v;
    else if (/^\d{1,12}([.,]\d{1,2})?$/.test(texto(v))) n = numero(v);
    else throw new Error('Valor inválido na linha ' + linha + '.');
    if (!isFinite(n) || n < 0 || n > 1e10) throw new Error('Valor inválido na linha ' + linha + '.');
    return { linha: linha, valor: arred(n) };
  });
  return { competencia: competencia, itens: itens };
}

/**
 * Troca as metas de `competencia` pelas de `itens`, mantendo os outros meses.
 * Devolve a matriz nova [competencia, linha, valor] (valor como texto com ponto),
 * ordenada por mês e linha. Metas do mês que não vieram em `itens` ficam como estão.
 */
function budgetAplicar(atuais, competencia, itens) {
  const mapa = {};
  (atuais || []).forEach(function (l) {
    const c = texto(l[0]), ln = texto(l[1]);
    if (c && ln) mapa[c + '|' + ln] = texto(l[2]);
  });
  itens.forEach(function (i) {
    const k = competencia + '|' + i.linha;
    if (i.valor === null) delete mapa[k]; else mapa[k] = String(i.valor);
  });
  return Object.keys(mapa).sort().map(function (k) {
    const p = k.split('|');
    return [p[0], p[1], mapa[k]];
  });
}

/** Linhas da aba → [{competencia, linha, valor}] dos meses pedidos (valor numérico). */
function budgetDoPeriodo(linhas, meses) {
  const out = [];
  (linhas || []).forEach(function (l) {
    const c = texto(l[0]), ln = texto(l[1]);
    if (meses.indexOf(c) < 0 || !ln || texto(l[2]) === '') return;
    out.push({ competencia: c, linha: ln, valor: arred(numero(l[2])) });
  });
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// DRILL-DOWN — o que compõe uma linha da DRE num mês
// ═════════════════════════════════════════════════════════════════════════════

/** Máximo de itens devolvidos (o resto vem como "cortado" + o total real). */
const DRE_DETALHE_MAX = 500;

/** Receita: as NFs de uma classe (R.1/R.2/R.3) no mês, maiores primeiro. */
function detalheReceita(cab, linhas, contratos, mes, classe, servicos) {
  const nfs = consolidarNfs(cab, linhas, contratos, servicos).nfs.filter(function (nf) {
    return nf.mes === mes && nf.classe === classe;
  });
  nfs.sort(function (a, b) { return b.valor - a.valor; });
  return fecharDetalhe(nfs.map(function (nf) {
    return { numero_nf: nf.numero_nf, tipo_nf: nf.tipo_nf || 'SERVICO', cliente: nf.cliente, cliente_cod: nf.cliente_cod, num_os: nf.num_os,
      valor: nf.valor, estimada: nf.estimada, parcelas: nf.parcelas_lancadas + '/' + nf.total_parcelas,
      descricao: nf.descricao, origem_classe: nf.origem_classe, auto_contrato: nf.auto_contrato };
  }));
}

/** Despesa: os títulos da linha (ex.: "1.01") no mês, mesma regra do agregado. */
function detalheDespesas(cab, linhas, mes, linhaDre) {
  const ix = indices(cab);
  exigirColunas(ix, ['data_emissao', 'natureza_codigo', 'valor_total', 'status'], 'Titulos');
  const itens = [];
  (linhas || []).forEach(function (l) {
    if (ix.id !== undefined && !texto(l[ix.id])) return;
    if (texto(l[ix.status]).toUpperCase() === 'CANCELADO') return;
    const valor = numero(l[ix.valor_total]);
    if (!valor) return;
    if (mesDe(l[ix.data_emissao], ix.competencia !== undefined ? l[ix.competencia] : '') !== mes) return;
    if (linhaDaNatureza(l[ix.natureza_codigo]) !== linhaDre) return;
    itens.push({
      id: ix.id !== undefined ? texto(l[ix.id]) : '',
      emissao: diaDe(l[ix.data_emissao]) || mes,
      fornecedor: ix.fornecedor !== undefined ? texto(l[ix.fornecedor]) : '',
      descricao: ix.descricao !== undefined ? texto(l[ix.descricao]) : '',
      numero_nf: ix.numero_nf !== undefined ? texto(l[ix.numero_nf]) : '',
      natureza_codigo: texto(l[ix.natureza_codigo]),
      status: texto(l[ix.status]).toUpperCase(),
      valor: valor
    });
  });
  itens.sort(function (a, b) { return b.valor - a.valor; });
  return fecharDetalhe(itens);
}

function fecharDetalhe(itens) {
  const total = itens.reduce(function (s, i) { return s + i.valor; }, 0);
  return { total: arred(total), quantidade: itens.length,
    cortado: itens.length > DRE_DETALHE_MAX, itens: itens.slice(0, DRE_DETALHE_MAX) };
}

/**
 * Base agregada + meses pedidos → a DRE pronta para a tela.
 * linhas: [{ id, nome, tipo: 'grupo'|'conta'|'total', grupo, valores: [..um por mês..] }]
 * Contas do plano entram mesmo zeradas (estrutura estável igual ao xlsx);
 * conta inativa ou fora do plano só aparece se tiver valor no período.
 */
function montarDre(base, meses) {
  const desp = base.despesas.por_mes, rec = base.receita.por_mes;
  const valoresDe = function (fn) { return meses.map(function (mes) { return arred(fn(mes)); }); };
  const soma = function (a, b, sinal) { return a.map(function (v, i) { return arred(v + (sinal || 1) * b[i]); }); };
  const zeros = meses.map(function () { return 0; });

  // contas por grupo: plano (ordem) + o que tiver valor sem estar no plano
  const contas = {};
  (base.plano || []).forEach(function (c) { contas[c.codigo] = { codigo: c.codigo, nome: c.nome, ativo: c.ativo, ordem: c.ordem }; });
  meses.forEach(function (mes) {
    Object.keys(desp[mes] || {}).forEach(function (cod) {
      if (!contas[cod]) contas[cod] = { codigo: cod, nome: base.despesas.nomes[cod] || cod, ativo: false, ordem: 1e9 };
    });
  });
  const porGrupo = { CUSTO_OP: [], FIXA: [], FIN: [], INFO: [] };
  Object.keys(contas).forEach(function (cod) {
    const c = contas[cod];
    const valores = valoresDe(function (mes) { return (desp[mes] || {})[cod] || 0; });
    const temValor = valores.some(function (v) { return v !== 0; });
    if (!c.ativo && !temValor) return;
    porGrupo[grupoDaLinha(cod)].push({ id: cod, nome: c.nome, tipo: 'conta', grupo: grupoDaLinha(cod), valores: valores, _ordem: c.ordem });
  });
  Object.keys(porGrupo).forEach(function (g) {
    porGrupo[g].sort(function (a, b) {
      return a._ordem - b._ordem || a.id.localeCompare(b.id, 'pt-BR', { numeric: true });
    });
    porGrupo[g].forEach(function (c) { delete c._ordem; });
  });
  const totalDe = function (lista) { return lista.reduce(function (acc, c) { return soma(acc, c.valores); }, zeros); };

  const receitaClasses = [
    { id: 'R.1', nome: 'Contratos' }, { id: 'R.2', nome: 'Spot Serviços' }, { id: 'R.3', nome: 'Spot Peças' }
  ].map(function (r) {
    return { id: r.id, nome: r.nome, tipo: 'conta', grupo: 'RECEITA',
      valores: valoresDe(function (mes) { return (rec[mes] || {})[r.id] || 0; }) };
  });

  const receita = totalDe(receitaClasses);
  const custoOp = totalDe(porGrupo.CUSTO_OP);
  const fixas = totalDe(porGrupo.FIXA);
  const fin = totalDe(porGrupo.FIN);
  const info = totalDe(porGrupo.INFO);
  const margem = soma(receita, custoOp, -1);
  const resOp = soma(margem, fixas, -1);
  const resultadoPeriodo = soma(resOp, fin, -1);

  const linhas = [].concat(
    [{ id: 'RECEITA', nome: 'Receita Bruta', tipo: 'grupo', grupo: 'RECEITA', valores: receita }],
    receitaClasses,
    [{ id: 'CUSTO_OP', nome: 'Custos Operacionais', tipo: 'grupo', grupo: 'CUSTO_OP', valores: custoOp }],
    porGrupo.CUSTO_OP,
    [{ id: 'MARGEM', nome: 'Margem de Contribuição', tipo: 'total', grupo: 'MARGEM', valores: margem }],
    [{ id: 'FIXA', nome: 'Despesas Fixas', tipo: 'grupo', grupo: 'FIXA', valores: fixas }],
    porGrupo.FIXA,
    [{ id: 'RES_OP', nome: 'Resultado Operacional', tipo: 'total', grupo: 'RES_OP', valores: resOp }],
    [{ id: 'FIN', nome: 'Despesas Financeiras', tipo: 'grupo', grupo: 'FIN', valores: fin }],
    porGrupo.FIN,
    [{ id: 'RESULTADO', nome: 'Resultado do Período', tipo: 'total', grupo: 'RESULTADO', valores: resultadoPeriodo }],
    [{ id: 'INFO', nome: 'Fora do resultado (informativo)', tipo: 'grupo', grupo: 'INFO', valores: info }],
    porGrupo.INFO
  );

  // avisos por mês: o que a tela precisa mostrar para ninguém confiar num número torto
  const avisos = {};
  meses.forEach(function (mes) {
    const a = [];
    const r = rec[mes];
    if (r && mes >= DRE_CONTRATO_INICIO && (r['R.2'] || r['R.3']) && !r['R.1']) a.push('Nenhuma NF de contrato identificada neste mês: tudo está como Spot.');
    const est = base.receita.estimadas.filter(function (e) { return e.mes === mes; });
    if (est.length) a.push(est.length + ' NF(s) parcelada(s) com valor estimado (faltam parcelas no Contas a Receber).');
    if (a.length) avisos[mes] = a;
  });

  return {
    meses: meses,
    linhas: linhas,
    estimadas: base.receita.estimadas.filter(function (e) { return meses.indexOf(e.mes) >= 0; }),
    avisos: avisos,
    avisos_gerais: { receita: base.receita.avisos, despesas: base.despesas.avisos },
    servicos: base.servicos || { ok: false, motivo: 'sem_planilha' },
    gerado_em: base.gerado_em
  };
}
