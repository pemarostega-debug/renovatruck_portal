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
// Pasta do Drive onde ficam as fotos das pessoas do organograma.
const PASTA_FOTOS_ID = '1TXIMglGCPwrkgN3sJRbN-_GHxLqP4bH4';

// A ordem aqui define a ordem das colunas na planilha. Não reordene sem
// ajustar o cliente (index.html, funções mnAchatar/mnMontarArvore).
const CABECALHO = ['uid','parent_uid','ordem','cargo','especialidade','cargo_key','nome','foto_url','tipo','recolhido'];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    if (action === 'organograma_get') return json({ success: true, data: lerLinhas() });
    if (action === 'cargos_get')      return json({ success: true, data: lerCargos() });
    if (action === 'ping')            return json({ success: true, versao: 2 });
    return json({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || '';

    // ── Público ──
    if (action === 'login') return json(autenticar(body.usuario, body.senha));

    // Validação de sessão para os OUTROS backends do portal (Contas a Pagar,
    // etc.). Cada projeto Apps Script tem PropertiesService próprio, então quem
    // precisa conferir um token tem de perguntar aqui, que é onde ele nasceu.
    // Só confirma um token que o chamador já possui — não lista nada.
    if (action === 'sessao_validar') {
      const s = lerSessao(body.token);
      if (!s) return json({ success: false, error: 'Sessão inválida ou expirada.' });
      return json({ success: true, usuario: s.usuario, nome: s.nome, papel: s.papel, expira: s.expira });
    }

    // ── Exige sessão válida ──
    if (action === 'organograma_set') {
      exigirAdmin(body.token);
      return json({ success: true, gravadas: gravarLinhas(body.linhas || []) });
    }
    if (action === 'organograma_foto') {
      exigirAdmin(body.token);
      return json({ success: true, url: salvarFoto(body.nome, body.base64, body.mime) });
    }
    if (action === 'cargos_set') {
      exigirAdmin(body.token);
      return json({ success: true, gravadas: gravarCargos(body.cargos || []) });
    }
    if (action === 'usuarios_get') {
      exigirAdmin(body.token);
      return json({ success: true, data: listarUsuarios() });
    }
    if (action === 'usuario_salvar') {
      exigirAdmin(body.token);
      return json({ success: true, data: salvarUsuario(body.usuario) });
    }
    if (action === 'usuario_remover') {
      const sessao = exigirAdmin(body.token);
      return json({ success: true, removidos: removerUsuario(body.login, sessao.usuario) });
    }
    if (action === 'trocar_senha') {
      const sessao = exigirSessao(body.token);
      return json({ success: true, ok: trocarSenha(sessao.usuario, body.senhaAtual, body.senhaNova) });
    }
    if (action === 'logout') { encerrarSessao(body.token); return json({ success: true }); }

    return json({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return json({ success: false, error: String(err && err.message ? err.message : err) });
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

    // "1,2" (reporta a ambos os diretores) chega como o NÚMERO 1.2: a planilha
    // está em pt-BR e o Sheets lê a vírgula como separador decimal. Por isso
    // aceitamos vírgula e ponto como indicação de reporte duplo.
    const paiBruto = String(r[iPai] === null || r[iPai] === undefined ? '' : r[iPai]).trim();
    const duplo = /[.,]/.test(paiBruto);
    const pai = (!paiBruto || duplo) ? RAIZ : ('n' + paiBruto.split(/[.,]/)[0].trim());
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
  return DriveApp.getFolderById(PASTA_FOTOS_ID);
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

/* ══════════════════════════════════════════════════════════════
   DESCRIÇÕES DE CARGO — aba "Cargos" na planilha compartilhada
   ══════════════════════════════════════════════════════════════ */

const ABA_CARGOS = 'Cargos';
// Os campos de lista (responsabilidades, atividades, interfaces, documentos)
// são guardados como texto com um item por linha dentro da célula.
const CAB_CARGOS = ['cargo_key','cargo','area','reporta_a','subordinados','especialidades',
                    'objetivo','responsabilidades','atividades','interfaces','documentos',
                    'indicadores','nota','ordem'];

function abaCargos() {
  const ss = SpreadsheetApp.openById(PLANILHA_ID);
  let sh = ss.getSheetByName(ABA_CARGOS);
  if (!sh) {
    sh = ss.insertSheet(ABA_CARGOS);
    sh.getRange(1, 1, 1, CAB_CARGOS.length).setValues([CAB_CARGOS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 200);
    for (var c = 7; c <= 13; c++) sh.setColumnWidth(c, 420);
  }
  return sh;
}

function lerCargos() {
  const sh = abaCargos();
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  const cols = Math.min(CAB_CARGOS.length, sh.getLastColumn());
  const valores = sh.getRange(2, 1, ultima - 1, cols).getValues();
  const listas = ['responsabilidades', 'atividades', 'interfaces', 'documentos', 'especialidades'];
  return valores
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      const o = {};
      CAB_CARGOS.forEach(function (col, i) {
        let v = i < cols ? r[i] : '';
        if (listas.indexOf(col) !== -1) {
          v = String(v || '').split('\n')
            .map(function (x) { return x.replace(/^[-•\s]+/, '').trim(); })
            .filter(function (x) { return x !== ''; });
        } else {
          v = String(v === null || v === undefined ? '' : v);
        }
        o[col] = v;
      });
      o.ordem = Number(o.ordem) || 0;
      return o;
    })
    .sort(function (a, b) { return a.ordem - b.ordem; });
}

function gravarCargos(cargos) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = abaCargos();
    if (sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, CAB_CARGOS.length).clearContent();
    }
    if (!cargos.length) return 0;
    const matriz = cargos.map(function (c, idx) {
      return CAB_CARGOS.map(function (col) {
        if (col === 'ordem') return c.ordem === undefined ? idx : c.ordem;
        const v = c[col];
        if (Array.isArray(v)) return v.join('\n');
        return v === undefined || v === null ? '' : v;
      });
    });
    sh.getRange(2, 1, matriz.length, CAB_CARGOS.length).setValues(matriz);
    return matriz.length;
  } finally {
    lock.releaseLock();
  }
}

/* ══════════════════════════════════════════════════════════════
   USUÁRIOS E SESSÕES

   Os usuários ficam numa planilha SEPARADA e PRIVADA, criada pelo
   próprio script. A planilha do Manual é compartilhada por link, então
   guardar senha lá deixaria a lista visível para qualquer pessoa que
   abrisse o arquivo. Só o Apps Script (que roda como o dono) lê esta.

   Limitação que vale saber: o portal é um site estático, então isto
   organiza quem faz o quê no dia a dia — não é barreira contra alguém
   técnico determinado. Para isso seria preciso um servidor de verdade.
   ══════════════════════════════════════════════════════════════ */

const PROP_PLANILHA_USUARIOS = 'planilha_usuarios_id';
const PROP_SESSAO = 'sessao_';
const HORAS_SESSAO = 12;
const CAB_USUARIOS = ['login', 'nome', 'senha_hash', 'salt', 'papel', 'ativo', 'criado_em'];

function abaUsuarios() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_PLANILHA_USUARIOS);
  let ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Renova - Usuarios do Portal (NAO COMPARTILHAR)');
    props.setProperty(PROP_PLANILHA_USUARIOS, ss.getId());
  }
  let sh = ss.getSheetByName('Usuarios');
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName('Usuarios');
    sh.getRange(1, 1, 1, CAB_USUARIOS.length).setValues([CAB_USUARIOS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() < 2) criarAdminInicial(sh);
  return sh;
}

/** Primeiro acesso: admin / renova2026. A troca é cobrada na interface. */
function criarAdminInicial(sh) {
  const salt = Utilities.getUuid();
  sh.appendRow(['admin', 'Administrador', hashSenha('renova2026', salt), salt, 'admin', 'sim',
                new Date().toISOString()]);
}

function hashSenha(senha, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(salt) + '|' + String(senha), Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

function lerUsuariosBrutos() {
  const sh = abaUsuarios();
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  const valores = sh.getRange(2, 1, ultima - 1, CAB_USUARIOS.length).getValues();
  return valores
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r, i) {
      const o = { _linha: i + 2 };
      CAB_USUARIOS.forEach(function (c, j) { o[c] = String(r[j] === null ? '' : r[j]); });
      return o;
    });
}

/** Nunca devolve hash nem salt para o cliente. */
function listarUsuarios() {
  return lerUsuariosBrutos().map(function (u) {
    return { login: u.login, nome: u.nome, papel: u.papel, ativo: u.ativo, criado_em: u.criado_em };
  });
}

function autenticar(login, senha) {
  const alvo = String(login || '').trim().toLowerCase();
  if (!alvo) return { success: false, error: 'Informe o usuário.' };
  const u = lerUsuariosBrutos().filter(function (x) {
    return x.login.trim().toLowerCase() === alvo;
  })[0];
  // Mensagem única para usuário inexistente e senha errada: não entregar
  // quais logins existem.
  const generico = { success: false, error: 'Usuário ou senha inválidos.' };
  if (!u) return generico;
  if (String(u.ativo).trim().toLowerCase() !== 'sim') {
    return { success: false, error: 'Este acesso está desativado. Procure o administrador.' };
  }
  if (hashSenha(senha, u.salt) !== u.senha_hash) return generico;

  const token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(PROP_SESSAO + token, JSON.stringify({
    usuario: u.login, nome: u.nome, papel: u.papel,
    expira: Date.now() + HORAS_SESSAO * 3600 * 1000
  }));
  limparSessoesVencidas();
  return { success: true, token: token, nome: u.nome, papel: u.papel, usuario: u.login,
           senhaPadrao: hashSenha('renova2026', u.salt) === u.senha_hash };
}

function lerSessao(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_SESSAO + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (Date.now() > s.expira) {
    PropertiesService.getScriptProperties().deleteProperty(PROP_SESSAO + token);
    return null;
  }
  return s;
}

function exigirSessao(token) {
  const s = lerSessao(token);
  if (!s) throw new Error('Sessão expirada. Entre novamente.');
  return s;
}

function exigirAdmin(token) {
  const s = exigirSessao(token);
  if (s.papel !== 'admin') throw new Error('Ação permitida apenas para administradores.');
  return s;
}

function encerrarSessao(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty(PROP_SESSAO + token);
}

function limparSessoesVencidas() {
  const props = PropertiesService.getScriptProperties();
  const todas = props.getProperties();
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf(PROP_SESSAO) !== 0) return;
    try {
      if (Date.now() > JSON.parse(todas[k]).expira) props.deleteProperty(k);
    } catch (e) { props.deleteProperty(k); }
  });
}

function salvarUsuario(dados) {
  const login = String(dados && dados.login || '').trim().toLowerCase();
  if (!login) throw new Error('Informe o login.');
  if (!/^[a-z0-9._-]+$/.test(login)) {
    throw new Error('Login deve ter apenas letras, números, ponto, hífen ou sublinhado.');
  }
  const sh = abaUsuarios();
  const existentes = lerUsuariosBrutos();
  const atual = existentes.filter(function (u) { return u.login.trim().toLowerCase() === login; })[0];
  const papel = dados.papel === 'admin' ? 'admin' : 'comum';
  const ativo = dados.ativo === false ? 'nao' : 'sim';

  if (atual) {
    // Impede remover o último admin ativo rebaixando-o.
    if (atual.papel === 'admin' && papel !== 'admin' && contarAdminsAtivos(existentes, atual.login) === 0) {
      throw new Error('É preciso manter ao menos um administrador ativo.');
    }
    if (atual.papel === 'admin' && ativo === 'nao' && contarAdminsAtivos(existentes, atual.login) === 0) {
      throw new Error('É preciso manter ao menos um administrador ativo.');
    }
    sh.getRange(atual._linha, 2).setValue(String(dados.nome || atual.nome));
    sh.getRange(atual._linha, 5).setValue(papel);
    sh.getRange(atual._linha, 6).setValue(ativo);
    if (dados.senha) {
      const salt = Utilities.getUuid();
      sh.getRange(atual._linha, 3).setValue(hashSenha(dados.senha, salt));
      sh.getRange(atual._linha, 4).setValue(salt);
    }
    return { login: login, criado: false };
  }

  if (!dados.senha) throw new Error('Defina uma senha para o novo usuário.');
  const salt = Utilities.getUuid();
  sh.appendRow([login, String(dados.nome || login), hashSenha(dados.senha, salt), salt,
                papel, ativo, new Date().toISOString()]);
  return { login: login, criado: true };
}

function contarAdminsAtivos(usuarios, exceto) {
  return usuarios.filter(function (u) {
    return u.papel === 'admin' && String(u.ativo).toLowerCase() === 'sim' &&
           u.login.trim().toLowerCase() !== String(exceto || '').trim().toLowerCase();
  }).length;
}

function removerUsuario(login, solicitante) {
  const alvo = String(login || '').trim().toLowerCase();
  if (alvo === String(solicitante || '').trim().toLowerCase()) {
    throw new Error('Você não pode remover o próprio acesso.');
  }
  const usuarios = lerUsuariosBrutos();
  const u = usuarios.filter(function (x) { return x.login.trim().toLowerCase() === alvo; })[0];
  if (!u) throw new Error('Usuário não encontrado.');
  if (u.papel === 'admin' && contarAdminsAtivos(usuarios, u.login) === 0) {
    throw new Error('É preciso manter ao menos um administrador ativo.');
  }
  abaUsuarios().deleteRow(u._linha);
  return 1;
}

function trocarSenha(login, senhaAtual, senhaNova) {
  if (!senhaNova || String(senhaNova).length < 6) {
    throw new Error('A nova senha precisa ter ao menos 6 caracteres.');
  }
  const sh = abaUsuarios();
  const u = lerUsuariosBrutos().filter(function (x) {
    return x.login.trim().toLowerCase() === String(login).trim().toLowerCase();
  })[0];
  if (!u) throw new Error('Usuário não encontrado.');
  if (hashSenha(senhaAtual, u.salt) !== u.senha_hash) throw new Error('Senha atual incorreta.');
  const salt = Utilities.getUuid();
  sh.getRange(u._linha, 3).setValue(hashSenha(senhaNova, salt));
  sh.getRange(u._linha, 4).setValue(salt);
  return true;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
