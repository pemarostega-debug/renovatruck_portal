/**
 * Ordens de Serviço — backend (Google Sheets como banco)
 * Portal de Gestão Renova (dash.renovatruck.com.br)
 *
 * COMO PUBLICAR (uma vez só):
 *  1. Abra a planilha base:
 *     https://docs.google.com/spreadsheets/d/1EftBE75ZtNOolVwpYN-Zs1OqhdvbpDNm4-DieoHuW_E/edit
 *  2. Menu  Extensões → Apps Script
 *  3. Crie um projeto NOVO (não reaproveite o do Contas a Pagar/Receber: cada
 *     projeto Apps Script só admite um doGet/doPost). Apague o Codigo.gs e
 *     cole ESTE arquivo inteiro. Salve.
 *  4. ⚙ Configurações do projeto → Propriedades do script → adicione
 *     CHAVE_SERVICO = <string longa e aleatória>. É o que autentica o cron
 *     do extrator (extrator-ordens.js na VPS) sem precisar de sessão de
 *     navegador.
 *  5. Rode uma vez a função  instalar()  (menu de execução) para criar a aba.
 *     Autorize quando pedir.
 *  6. Implantar → Nova implantação
 *       Tipo:            App da Web
 *       Executar como:   Eu
 *       Quem tem acesso: Qualquer pessoa
 *  7. Copie a URL /exec e cole em  CONFIG.ORDENS_API  no js/core.js, e na
 *     mesma chave de serviço do passo 4 no .env da VPS (ORDENS_CHAVE_SERVICO).
 *
 * QUANDO ATUALIZAR ESTE ARQUIVO: cole a nova versão e use
 * Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão.
 * Sem esse passo o Apps Script continua servindo o código antigo.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * Antes, o extrator (exportar-dados.js) escrevia um dados.json com cliente,
 * NF e valor de cada OS e dava git push nele direto para o repositório do
 * portal — que é público, porque é o que faz o GitHub Pages servir o site.
 * Qualquer pessoa, logada ou não, conseguia baixar o histórico financeiro
 * completo da empresa só de abrir a URL do repositório no GitHub.
 *
 * Aqui os dados ficam na mesma planilha privada do Contas a Pagar/Receber, e
 * só saem para quem tiver uma sessão válida do portal (ver validarTokenOS
 * no fim do arquivo) — igual ao resto do sistema financeiro.
 */

const OS_PLANILHA_ID = '1EftBE75ZtNOolVwpYN-Zs1OqhdvbpDNm4-DieoHuW_E';

let _osSS = null;
function abrirOS() {
  if (!_osSS) _osSS = SpreadsheetApp.openById(OS_PLANILHA_ID);
  return _osSS;
}

const ABA_ORDENS = 'Ordens';

/**
 * Mesma ordem de colunas que a view vw_ordens_servico do MySQL. É contrato:
 * o extrator (extrator-ordens.js) depende desta ordem. Só acrescente no FIM.
 */
const CAB_ORDENS = [
  'id_ordem_servico', 'numero_os', 'num_os', 'codigo_cliente', 'razao_cliente',
  'placa', 'descricao_fase', 'num_nf', 'valor_total', 'data', 'data_geracao',
  'data_encerramento', 'encerrada', 'cancelada'
];
const CO = {};
CAB_ORDENS.forEach(function (nome, i) { CO[nome] = i; });

// Colunas que o Sheets tenta interpretar como data/número e que precisam
// ficar em texto puro (mesmo problema do Contas a Pagar: "1.01" virando data).
const OS_COLUNAS_TEXTO = ['num_os', 'codigo_cliente', 'num_nf'];

// ═════════════════════════════════════════════════════════════════════════════
// INSTALAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

/** Rode uma vez, na mão, depois de colar o script. Idempotente. */
function instalar() {
  const ss = abrirOS();
  garantirAbaOS(ss, ABA_ORDENS, CAB_ORDENS);
  Logger.log('Instalação concluída. Aba Ordens pronta.');
  return 'ok';
}

function garantirAbaOS(ss, nome, cabecalho) {
  let sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);

  const largura = Math.max(sh.getLastColumn(), cabecalho.length);
  const atual = sh.getLastRow() >= 1
    ? sh.getRange(1, 1, 1, largura).getValues()[0].map(String)
    : [];

  const precisa = cabecalho.some(function (c, i) { return atual[i] !== c; });
  if (precisa) {
    sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
      .setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ═════════════════════════════════════════════════════════════════════════════
// ROTEADOR HTTP
// ═════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    if (action === 'ping') return jsonOS({ success: true, versao: 1, planilha: OS_PLANILHA_ID });

    if (action === 'ordens_listar') {
      // Dado financeiro: só sai com sessão válida, nunca sem token.
      validarTokenOS((e.parameter || {}).token);
      return jsonOS({ success: true, data: lerOrdens() });
    }

    return jsonOS({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return jsonOS({ success: false, error: erroTextoOS(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || '';
    const sessao = validarTokenOS(body.token);

    // Só o cron (chave de serviço) grava. Ninguém mais tem motivo para
    // reescrever a aba inteira na mão.
    if (action === 'ordens_sync') {
      if (!sessao.servico) return jsonOS({ success: false, error: 'Só o serviço de sincronização pode gravar ordens.' });
      return jsonOS({ success: true, data: gravarOrdens(body.ordens || [], body.gerado_em) });
    }

    return jsonOS({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return jsonOS({ success: false, error: erroTextoOS(err) });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ORDENS DE SERVIÇO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Recebe do extrator-ordens.js (cron na VPS) o dump inteiro da
 * vw_ordens_servico e substitui o conteúdo da aba. O que interessa é sempre
 * a última leitura do banco — não faz sentido acumular versões antigas de
 * uma OS que já teve status, valor ou NF atualizados no Genesis.
 */
function gravarOrdens(ordens, geradoEm) {
  const ss = abrirOS();
  const sh = ss.getSheetByName(ABA_ORDENS) || garantirAbaOS(ss, ABA_ORDENS, CAB_ORDENS);

  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, CAB_ORDENS.length).clearContent();
  }

  const linhas = ordens.map(function (o) {
    return CAB_ORDENS.map(function (campo) {
      if (OS_COLUNAS_TEXTO.indexOf(campo) >= 0) return o[campo] === null || o[campo] === undefined ? '' : String(o[campo]);
      return o[campo] === null || o[campo] === undefined ? '' : o[campo];
    });
  });

  if (linhas.length) {
    // Formata as colunas de texto ANTES de escrever: igual ao Contas a
    // Pagar, setValues() interpreta o valor antes de olhar para o formato
    // da célula se a célula ainda estiver vazia/genérica.
    OS_COLUNAS_TEXTO.forEach(function (campo) {
      sh.getRange(2, CO[campo] + 1, linhas.length, 1).setNumberFormat('@');
    });
    sh.getRange(2, 1, linhas.length, CAB_ORDENS.length).setValues(linhas);
  }

  PropertiesService.getScriptProperties().setProperty('ordens_gerado_em', geradoEm || new Date().toISOString());
  return { gravadas: linhas.length };
}

function lerOrdens() {
  const ss = abrirOS();
  const sh = ss.getSheetByName(ABA_ORDENS);
  if (!sh || sh.getLastRow() < 2) return { gerado_em: '', total: 0, ordens: [] };

  const linhas = sh.getRange(2, 1, sh.getLastRow() - 1, CAB_ORDENS.length).getValues();
  const ordens = linhas.map(function (l) {
    const o = {};
    CAB_ORDENS.forEach(function (campo, i) { o[campo] = l[i]; });
    return o;
  });

  const geradoEm = PropertiesService.getScriptProperties().getProperty('ordens_gerado_em') || '';
  return { gerado_em: geradoEm, total: ordens.length, ordens: ordens };
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

const OS_API_MANUAL = 'https://script.google.com/macros/s/AKfycbxmdLCRPZwf6u7l8BnbtqbomFRcjplzJOKCeNWSTRNCKq8M9NtO2uWO7DjEP-xN7WBkkg/exec';

/**
 * Mesma lógica do Contas a Pagar/Receber: quem emite token é o backend do
 * Manual da Empresa. Diferente deles, aqui NÃO existe restrição de papel —
 * Kanban, Dashboard e ABC são consultados por qualquer usuário logado, só
 * não entram sem sessão nenhuma.
 */
function validarTokenOS(token) {
  if (!token) throw new Error('Sessão expirada. Entre no sistema novamente.');

  const chaveServico = PropertiesService.getScriptProperties().getProperty('CHAVE_SERVICO');
  if (chaveServico && token === chaveServico) {
    return { usuario: 'servico', nome: 'Serviço (cron)', papel: 'financeiro', servico: true };
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
      resposta = UrlFetchApp.fetch(OS_API_MANUAL, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ action: 'sessao_validar', token: token }),
        muteHttpExceptions: true, followRedirects: true
      });
    } catch (e) {
      throw new Error('Não consegui validar seu acesso agora (' + erroTextoOS(e) + '). Tente de novo em instantes.');
    }
    let d;
    try { d = JSON.parse(resposta.getContentText()); }
    catch (e) { throw new Error('Resposta inesperada do serviço de login. Tente novamente.'); }

    if (!d.success) throw new Error(d.error || 'Sessão inválida ou expirada. Entre novamente.');
    sessao = { usuario: d.usuario, nome: d.nome, papel: d.papel };
    cache.put(chave, JSON.stringify(sessao), 300);
  }

  return sessao;
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═════════════════════════════════════════════════════════════════════════════

function erroTextoOS(err) {
  return String(err && err.message ? err.message : err);
}

function jsonOS(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
