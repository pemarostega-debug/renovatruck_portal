/**
 * Manual da Empresa — backend do Organograma
 * Portal de Gestão Renova (dash.renovatruck.com.br)
 *
 * COMO PUBLICAR (uma vez só):
 *  1. Abra a planilha do Manual:
 *     https://docs.google.com/spreadsheets/d/1zHJwKw88K0ArhN9qpWM8T0bzSMFpglebn5PZIdfgev0/edit
 *  2. Menu  Extensões → Apps Script
 *  3. Apague o conteúdo do Codigo.gs e cole ESTE arquivo inteiro. Salve.
 *  4. Botão  Implantar → Nova implantação
 *       Tipo:            App da Web
 *       Executar como:   Eu
 *       Quem tem acesso: Qualquer pessoa
 *  5. Autorize quando pedir (vai avisar que o app não é verificado —
 *     é o seu próprio script; siga em "Avançado → Acessar projeto").
 *  6. Copie a URL que termina em /exec e me envie.
 *
 * QUANDO EU ATUALIZAR ESTE ARQUIVO: cole a nova versão e use
 * Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão.
 * Sem esse passo o Apps Script continua servindo o código antigo.
 */

const PLANILHA_ID = '1zHJwKw88K0ArhN9qpWM8T0bzSMFpglebn5PZIdfgev0';
const ABA         = 'Organograma';
const PASTA_FOTOS = 'Renova - Fotos do Organograma';

// A ordem aqui define a ordem das colunas na planilha. Não reordene sem
// ajustar o cliente (index.html, funções mnAchatar/mnMontarArvore).
const CABECALHO = ['uid','parent_uid','ordem','cargo','especialidade','cargo_key','nome','foto_url','tipo','recolhido'];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    if (action === 'organograma_get') return json({ success: true, data: lerLinhas() });
    if (action === 'ping')            return json({ success: true, versao: 1 });
    return json({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || '';
    if (action === 'organograma_set') {
      return json({ success: true, gravadas: gravarLinhas(body.linhas || []) });
    }
    if (action === 'organograma_foto') {
      return json({ success: true, url: salvarFoto(body.nome, body.base64, body.mime) });
    }
    return json({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

/** Devolve a aba, criando-a com o cabeçalho na primeira execução. */
function obterAba() {
  const ss = SpreadsheetApp.openById(PLANILHA_ID);
  let sh = ss.getSheetByName(ABA);
  if (!sh) {
    sh = ss.insertSheet(ABA);
    sh.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(4, 220); // cargo
    sh.setColumnWidth(7, 200); // nome
    sh.setColumnWidth(8, 320); // foto_url
  }
  return sh;
}

function lerLinhas() {
  const sh = obterAba();
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  const valores = sh.getRange(2, 1, ultima - 1, CABECALHO.length).getValues();
  return valores
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      const o = {};
      CABECALHO.forEach(function (col, i) { o[col] = r[i]; });
      return o;
    });
}

/**
 * Regrava a aba inteira. O cliente sempre manda a árvore completa, então
 * reescrever tudo evita estado parcial se uma linha falhar no meio.
 * O lock impede que dois usuários salvando ao mesmo tempo se atropelem.
 */
function gravarLinhas(linhas) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = obterAba();
    if (sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, CABECALHO.length).clearContent();
    }
    if (!linhas.length) return 0;
    const matriz = linhas.map(function (l) {
      return CABECALHO.map(function (col) {
        return (l[col] === undefined || l[col] === null) ? '' : l[col];
      });
    });
    sh.getRange(2, 1, matriz.length, CABECALHO.length).setValues(matriz);
    return matriz.length;
  } finally {
    lock.releaseLock();
  }
}

function obterPastaFotos() {
  const it = DriveApp.getFoldersByName(PASTA_FOTOS);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PASTA_FOTOS);
}

/**
 * Grava a foto no Drive e devolve um link público de imagem.
 * Guardar a imagem em base64 na célula não funciona: o limite do Sheets
 * é 50 mil caracteres por célula e a foto estoura isso rapidamente.
 */
function salvarFoto(nome, base64, mime) {
  const pasta = obterPastaFotos();
  const limpo = String(base64).replace(/^data:[^;]+;base64,/, '');
  const arquivo = pasta.createFile(
    Utilities.newBlob(Utilities.base64Decode(limpo), mime || 'image/jpeg',
      (nome || 'foto').replace(/[^\w\s-]/g, '').trim() + '-' + Date.now() + '.jpg')
  );
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // Formato lh3: funciona em <img>. O antigo drive.google.com/uc?id= passou
  // a devolver página de confirmação e quebra a imagem.
  return 'https://lh3.googleusercontent.com/d/' + arquivo.getId();
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
