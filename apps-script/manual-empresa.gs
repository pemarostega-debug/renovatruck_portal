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

/**
 * Devolve a aba no formato novo, criando-a se preciso.
 * Se encontrar a aba no formato antigo (id, nome, cargo, reporta_a_id, area),
 * migra o conteúdo preservando os nomes já digitados e guarda a original
 * renomeada como backup — nada é apagado.
 */
function obterAba() {
  const ss = SpreadsheetApp.openById(PLANILHA_ID);
  let sh = ss.getSheetByName(ABA);

  if (sh && ehFormatoAntigo(sh)) {
    const migradas = migrarFormatoAntigo(ss, sh);
    sh = ss.getSheetByName(ABA);
    Logger.log('Migradas ' + migradas + ' posições do formato antigo.');
  }

  if (!sh) sh = criarAba(ss, ABA);
  return sh;
}

function criarAba(ss, nome) {
  const sh = ss.insertSheet(nome);
  sh.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setColumnWidth(4, 220); // cargo
  sh.setColumnWidth(7, 200); // nome
  sh.setColumnWidth(8, 320); // foto_url
  return sh;
}

function ehFormatoAntigo(sh) {
  if (sh.getLastRow() < 1) return false;
  const cab = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
    .map(function (c) { return String(c).trim().toLowerCase(); });
  return cab.indexOf('reporta_a_id') !== -1 || (cab[0] === 'id' && cab.indexOf('uid') === -1);
}

/**
 * Normaliza texto para comparação: sem acento, minúsculo, só letras e números.
 * O NFD separa a letra do acento e o filtro final descarta tudo que não for
 * [a-z0-9] — inclusive os acentos soltos. Evita de propósito um intervalo de
 * caracteres combinantes no código, que se corrompe fácil ao copiar e colar.
 */
function chaveDe(txt) {
  return String(txt || '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Liga o cargo da planilha à descrição correspondente no portal. */
function mapearCargo(cargo) {
  const k = chaveDe(cargo);
  const tabela = [
    ['planejamentoestrategico', 'planejamento-estrategico'],
    ['gerenteoperacional',      'gerente-operacional'],
    ['administrativo',          'administrativo'],
    ['almoxarife',              'almoxarife'],
    ['porteiro',                'porteiro'],
    ['lideroperacional',        'lider-operacional'],
    ['mecanico12oficial',       'mecanico-12-oficial'],
    ['mecanicomeiooficial',     'mecanico-12-oficial'],
    ['mecanicooficial',         'mecanico-oficial'],
    ['analistafinanceira',      'analista-financeira'],
    ['gestorderh',              'gestor-rh'],
    ['gestoraderh',             'gestor-rh'],
    ['marketingdigital',        'marketing-digital'],
    ['comercial',               'comercial']
  ];
  // "mecanico12oficial" contém "mecanicooficial"? não — mas a ordem acima
  // garante que o mais específico seja testado primeiro de qualquer forma.
  for (var i = 0; i < tabela.length; i++) {
    if (k.indexOf(tabela[i][0]) !== -1) return tabela[i][1];
  }
  return '';
}

/** Separa "Líder Operacional - Implementos" em cargo + especialidade. */
function separarEspecialidade(cargo) {
  const partes = String(cargo || '').split(/\s+[-–—]\s+/);
  if (partes.length >= 2) {
    return { cargo: partes[0].trim(), especialidade: partes.slice(1).join(' - ').trim() };
  }
  return { cargo: String(cargo || '').trim(), especialidade: '' };
}

function migrarFormatoAntigo(ss, shAntiga) {
  const ultima = shAntiga.getLastRow();
  const ultimaCol = shAntiga.getLastColumn();
  const valores = ultima > 1 ? shAntiga.getRange(2, 1, ultima - 1, ultimaCol).getValues() : [];

  // Índices pelo cabeçalho, não por posição fixa.
  const cab = shAntiga.getRange(1, 1, 1, ultimaCol).getValues()[0]
    .map(function (c) { return String(c).trim().toLowerCase(); });
  const iId = cab.indexOf('id'), iNome = cab.indexOf('nome');
  const iCargo = cab.indexOf('cargo'), iPai = cab.indexOf('reporta_a_id'), iArea = cab.indexOf('area');

  const RAIZ = 'raiz';
  const linhas = [{
    uid: RAIZ, parent_uid: '', ordem: 0, cargo: 'DIRETORIA', especialidade: '',
    cargo_key: '', nome: '', foto_url: '', tipo: 'diretoria', recolhido: ''
  }];

  const ordemPorPai = {};
  valores.forEach(function (r) {
    const id = String(r[iId] || '').trim();
    if (!id) return;

    // Em algumas linhas o cargo foi digitado na coluna "area" — usa o que houver.
    let cargoBruto = String(r[iCargo] || '').trim();
    const area = String(r[iArea] || '').trim();
    if (!cargoBruto) cargoBruto = area;
    if (!cargoBruto) return;

    const paiBruto = String(r[iPai] || '').trim();
    const duplo = paiBruto.indexOf(',') !== -1;   // reporta a ambos os diretores
    const pai = (!paiBruto || duplo) ? RAIZ : ('n' + paiBruto.split(',')[0].trim());
    const sep = separarEspecialidade(cargoBruto);

    ordemPorPai[pai] = (ordemPorPai[pai] || 0) + 1;
    linhas.push({
      uid: 'n' + id,
      parent_uid: pai,
      ordem: ordemPorPai[pai],
      cargo: sep.cargo,
      especialidade: sep.especialidade,
      // Diretores não recebem cargo_key: "Diretor Financeiro/Comercial" casaria
      // com a descrição do cargo "Comercial", que é outra função.
      cargo_key: !paiBruto ? '' : mapearCargo(cargoBruto),
      nome: String(r[iNome] || '').trim(),
      foto_url: '',
      tipo: !paiBruto ? 'diretoria' : (duplo ? 'assessoria' : 'cargo'),
      recolhido: ''
    });
  });

  // Preserva a aba original antes de assumir o nome "Organograma".
  const backup = 'Organograma (formato antigo)';
  const jaExiste = ss.getSheetByName(backup);
  if (jaExiste) ss.deleteSheet(jaExiste);
  shAntiga.setName(backup);

  const nova = criarAba(ss, ABA);
  const matriz = linhas.map(function (l) {
    return CABECALHO.map(function (col) { return l[col] === undefined ? '' : l[col]; });
  });
  nova.getRange(2, 1, matriz.length, CABECALHO.length).setValues(matriz);
  return matriz.length;
}

function lerLinhas() {
  const sh = obterAba();
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  // Nunca pedir mais colunas do que a aba tem: getRange estoura a grade.
  const cols = Math.min(CABECALHO.length, sh.getLastColumn());
  const valores = sh.getRange(2, 1, ultima - 1, cols).getValues();
  return valores
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      const o = {};
      CABECALHO.forEach(function (col, i) { o[col] = i < cols ? r[i] : ''; });
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
