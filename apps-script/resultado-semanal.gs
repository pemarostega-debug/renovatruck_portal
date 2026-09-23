/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Resultado Semanal — backend (Apps Script sobre uma planilha PRIVADA)
 *
 *   Genesis (vw_os_produto_serviço) ──extrair-resultado-semanal.js──► aqui ──► portal (só admin)
 *
 * Por que existe: custo de peça, margem e folha não podem ir para o
 * repositório (é público). O extrator da VPS grava as linhas da view nesta
 * planilha; o portal lê daqui com a sessão do usuário, e só papel "admin" passa.
 *
 * Abas:
 *   Itens        — linhas da view, uma por item de OS (tudo em texto simples)
 *   Parametros   — parâmetros base e metas do placar (compartilhados entre admins)
 *   Fechamentos  — o fechamento de cada semana: indicadores e parâmetros da época
 *   Log
 *
 * Implantação: ver integracao/LEIA-ME-resultado-semanal.md
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_MANUAL = 'https://script.google.com/macros/s/AKfycbxmdLCRPZwf6u7l8BnbtqbomFRcjplzJOKCeNWSTRNCKq8M9NtO2uWO7DjEP-xN7WBkkg/exec';

const ABA_ITENS = 'Itens';
const ABA_PARAM = 'Parametros';
const ABA_FECH = 'Fechamentos';
const ABA_LOG = 'Log';
const CAB_PARAM = ['chave', 'valor_json', 'atualizado_em', 'atualizado_por'];
const CAB_FECH = ['de', 'ate', 'salvo_em', 'salvo_por', 'indicadores_json', 'parametros_json'];
const CAB_LOG = ['quando', 'quem', 'acao', 'detalhe'];

const ACOES_SERVICO = ['sync_gravar', 'sync_acrescentar', 'sync_status'];

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

    if (sessao.servico && ACOES_SERVICO.indexOf(action) < 0) {
      return json({ success: false, error: 'Chave de serviço só pode sincronizar itens.' });
    }

    if (action === 'sync_gravar')      return json({ success: true, data: gravarItens(body, sessao, true) });
    if (action === 'sync_acrescentar') return json({ success: true, data: gravarItens(body, sessao, false) });
    if (action === 'sync_status')      return json({ success: true, data: statusSync() });
    if (action === 'dados')            return json({ success: true, data: lerItens() });
    if (action === 'parametros_ler')   return json({ success: true, data: lerParametros() });
    if (action === 'parametros_salvar') return json({ success: true, data: salvarParametros(body, sessao) });
    if (action === 'fechamentos_ler')  return json({ success: true, data: lerFechamentos() });
    if (action === 'fechamento_salvar') return json({ success: true, data: salvarFechamento(body.fechamento || {}, sessao) });

    return json({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return json({ success: false, error: erroTexto(err) });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACESSO — só admin (ou a chave de serviço, restrita ao sync)
// ═════════════════════════════════════════════════════════════════════════════

function validarToken(token) {
  if (!token) throw new Error('Sessão expirada. Entre no sistema novamente.');

  // CHAVE_SERVICO vive só nas Propriedades do script — nunca no repositório.
  const chaveServico = PropertiesService.getScriptProperties().getProperty('CHAVE_SERVICO');
  if (chaveServico && token === chaveServico) {
    return { usuario: 'servico', nome: 'Serviço (cron)', papel: 'servico', servico: true };
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
    throw new Error('O Resultado Semanal é restrito a administradores.');
  }
  return sessao;
}

// ═════════════════════════════════════════════════════════════════════════════
// ITENS DA VIEW
// ═════════════════════════════════════════════════════════════════════════════

/**
 * body: { colunas: [...], linhas: [[...]], gerado_em, janela }
 * O 1º bloco (substituir=true) troca o cabeçalho e apaga o lote anterior: vale
 * sempre a última leitura do Genesis, que já inclui correções feitas nas OSs.
 *
 * Tudo entra como TEXTO SIMPLES. Planilha em pt-BR transforma "2026-09-01" em
 * data e "148.72" em 14872 — e o front voltaria a ler lixo.
 */
function gravarItens(body, sessao, substituir) {
  const colunas = (body.colunas || []).map(String);
  const linhas = body.linhas || [];
  if (!colunas.length) throw new Error('Lote sem colunas.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = planilha();
    let sh = ss.getSheetByName(ABA_ITENS) || ss.insertSheet(ABA_ITENS);

    if (substituir) {
      sh.clearContents();
      sh.getRange(1, 1, 1, colunas.length).setValues([colunas]);
      sh.setFrozenRows(1);
    } else {
      const atual = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
      if (atual.join('|') !== colunas.join('|')) throw new Error('Colunas diferentes do primeiro bloco. Reenvie desde o início.');
    }

    if (linhas.length) {
      const matriz = linhas.map(function (l) {
        const out = [];
        for (let i = 0; i < colunas.length; i++) out.push(l[i] === null || l[i] === undefined ? '' : String(l[i]));
        return out;
      });
      const primeira = Math.max(sh.getLastRow() + 1, 2);
      const rg = sh.getRange(primeira, 1, matriz.length, colunas.length);
      rg.setNumberFormat('@');
      rg.setValues(matriz);
    }

    const props = PropertiesService.getScriptProperties();
    if (substituir) {
      props.setProperty('sync_gerado_em', String(body.gerado_em || new Date().toISOString()));
      props.setProperty('sync_janela', JSON.stringify(body.janela || {}));
      props.setProperty('sync_origem', String(body.origem || ''));
    }
    const total = Math.max(sh.getLastRow() - 1, 0);
    if (substituir || body.ultimo) registrar(sessao.usuario, 'SYNC', total + ' linha(s) da view');
    return { gravadas: linhas.length, total: total };
  } finally {
    lock.releaseLock();
  }
}

function statusSync() {
  const sh = planilha().getSheetByName(ABA_ITENS);
  const props = PropertiesService.getScriptProperties();
  let janela = null;
  try { janela = JSON.parse(props.getProperty('sync_janela') || 'null'); } catch (e) { }
  return {
    linhas: sh ? Math.max(sh.getLastRow() - 1, 0) : 0,
    gerado_em: props.getProperty('sync_gerado_em') || '',
    janela: janela,
    origem: props.getProperty('sync_origem') || ''
  };
}

/** Formato colunar: metade do tamanho de uma lista de objetos. */
function lerItens() {
  const st = statusSync();
  const sh = planilha().getSheetByName(ABA_ITENS);
  if (!sh || sh.getLastRow() < 2) return Object.assign(st, { colunas: [], linhas: [] });
  const valores = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  return Object.assign(st, { colunas: valores[0], linhas: valores.slice(1) });
}

// ═════════════════════════════════════════════════════════════════════════════
// PARÂMETROS (base e metas — o cenário "E se" fica só na tela)
// ═════════════════════════════════════════════════════════════════════════════

function lerParametros() {
  const sh = aba(ABA_PARAM, CAB_PARAM);
  const out = {};
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, CAB_PARAM.length).getValues().forEach(function (l) {
    if (!l[0]) return;
    try { out[String(l[0])] = { valor: JSON.parse(l[1]), atualizado_em: String(l[2]), atualizado_por: String(l[3]) }; } catch (e) { }
  });
  return out;
}

/** body: { chave: 'base' | 'metas', valor: {...} } */
function salvarParametros(body, sessao) {
  const chave = String(body.chave || '');
  if (['base', 'metas'].indexOf(chave) < 0) throw new Error('Parâmetro desconhecido: ' + chave);
  if (!body.valor || typeof body.valor !== 'object') throw new Error('Valor inválido.');
  const sh = aba(ABA_PARAM, CAB_PARAM);
  const linha = [chave, JSON.stringify(body.valor), new Date().toISOString(), sessao.usuario];
  const n = sh.getLastRow();
  const chaves = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues().map(function (l) { return String(l[0]); }) : [];
  const i = chaves.indexOf(chave);
  const rg = i >= 0 ? sh.getRange(i + 2, 1, 1, CAB_PARAM.length) : sh.getRange(n + 1, 1, 1, CAB_PARAM.length);
  rg.setNumberFormat('@');
  rg.setValues([linha]);
  return { chave: chave, atualizado_em: linha[2], atualizado_por: linha[3] };
}

// ═════════════════════════════════════════════════════════════════════════════
// FECHAMENTOS — o registro do que foi apresentado em cada segunda
// ═════════════════════════════════════════════════════════════════════════════

function lerFechamentos() {
  const sh = aba(ABA_FECH, CAB_FECH);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, CAB_FECH.length).getValues().map(function (l) {
    const f = { de: String(l[0]), ate: String(l[1]), salvoEm: String(l[2]), salvoPor: String(l[3]) };
    try { f.ind = JSON.parse(l[4] || '{}'); } catch (e) { f.ind = {}; }
    try { f.base = JSON.parse(l[5] || '{}'); } catch (e) { f.base = {}; }
    return f;
  }).filter(function (f) { return /^\d{4}-\d{2}-\d{2}$/.test(f.de); });
}

function salvarFechamento(f, sessao) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(String(f.de)) || !iso.test(String(f.ate))) throw new Error('Período inválido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = aba(ABA_FECH, CAB_FECH);
    const linha = [f.de, f.ate, new Date().toISOString(), sessao.usuario,
      JSON.stringify(f.ind || {}), JSON.stringify(f.base || {})];
    const n = sh.getLastRow();
    let alvo = n + 1;
    if (n > 1) {
      const per = sh.getRange(2, 1, n - 1, 2).getDisplayValues();
      for (let i = 0; i < per.length; i++) if (per[i][0] === f.de && per[i][1] === f.ate) { alvo = i + 2; break; }
    }
    const rg = sh.getRange(alvo, 1, 1, CAB_FECH.length);
    rg.setNumberFormat('@');
    rg.setValues([linha]);
    registrar(sessao.usuario, 'FECHAMENTO', f.de + ' a ' + f.ate);
    return { de: f.de, ate: f.ate, salvoEm: linha[2], salvoPor: linha[3] };
  } finally {
    lock.releaseLock();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═════════════════════════════════════════════════════════════════════════════

/** Projeto "vinculado" à planilha (Extensões → Apps Script). */
function planilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Este script precisa ser criado a partir da planilha (Extensões → Apps Script).');
  return ss;
}

function aba(nome, cabecalho) {
  const ss = planilha();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Rode uma vez depois de colar o script: cria as abas e pede as autorizações. */
function instalar() {
  aba(ABA_PARAM, CAB_PARAM);
  aba(ABA_FECH, CAB_FECH);
  aba(ABA_LOG, CAB_LOG);
  const ss = planilha();
  if (!ss.getSheetByName(ABA_ITENS)) ss.insertSheet(ABA_ITENS);
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
