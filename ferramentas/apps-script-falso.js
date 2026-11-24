/**
 * Apps Script de mentira, para rodar um .gs em Node sem tocar em nada do Google.
 *
 * Não é um emulador fiel — é um emulador HOSTIL: ele reproduz de propósito as
 * armadilhas que já custaram caro neste projeto, para que o teste quebre se o
 * código cair nelas:
 *
 *   - célula gravada SEM formato de texto ('@') tem o valor "interpretado", como
 *     a planilha em pt-BR faz ("2026-08" vira data, "007" perde os zeros,
 *     "1.01" vira 01/jan). Aqui a célula passa a valer "#CORROMPIDO:…";
 *   - texto começando com = + @ vira "#FORMULA(…)" — fórmula executada;
 *   - appendRow() interpreta antes de olhar o formato (o bug do Contas a Pagar);
 *   - setValues() com matriz de tamanho errado estoura, como no Google;
 *   - cada requisição roda num contexto novo: cache em variável global não
 *     atravessa chamadas, igual ao Apps Script de verdade.
 *
 * O apóstrofo na frente de um texto ("'=1+1") é consumido como no Sheets. Passe
 * { consomeApostrofo:false } para testar o outro comportamento possível.
 *
 * Uso:  const amb = criarAmbiente();  amb.carregar('apps-script/rh.gs');
 *       amb.post({ action:'bootstrap', token:'tok-admin' })
 */
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const INTERPRETAVEL = [/^\d{4}-\d{1,2}(-\d{1,2})?$/, /^-?\d+[.,]\d+$/, /^0\d+$/, /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/, /^\d{1,2}:\d{2}$/];

function criarAmbiente(opcoes) {
  opcoes = Object.assign({ consomeApostrofo: true }, opcoes || {});
  const amb = { opcoes, folhas: [], props: {}, cache: {}, arquivos: {}, pastas: {}, sessoes: {}, logs: [], fetches: 0, travas: 0, chamadasPlanilha: 0 };

  // ── Planilha ────────────────────────────────────────────────────────────────
  function gravar(valor, fmt) {
    if (valor === null || valor === undefined) return '';
    if (typeof valor !== 'string') return String(valor);
    if (valor === '') return '';
    if (fmt !== '@') {
      if (/^[=+@]/.test(valor)) return '#FORMULA(' + valor + ')';
      if (valor.charAt(0) === "'") return valor.slice(1);
      if (INTERPRETAVEL.some(r => r.test(valor))) return '#CORROMPIDO:' + valor;
      return valor;
    }
    if (valor.charAt(0) === "'") return opcoes.consomeApostrofo ? valor.slice(1) : valor;
    // Modelo pessimista: mesmo em célula de texto, um "=" sem apóstrofo executa.
    if (/^[=+@]/.test(valor)) return '#FORMULA(' + valor + ')';
    return valor;
  }

  class Folha {
    constructor(nome) { this.nome = nome; this.v = []; this.f = []; }
    getName() { return this.nome; }
    _garantir(l, c) {
      while (this.v.length < l) { this.v.push([]); this.f.push([]); }
      for (let i = 0; i < l; i++) while (this.v[i].length < c) { this.v[i].push(''); this.f[i].push(''); }
    }
    getLastRow() { for (let i = this.v.length - 1; i >= 0; i--) if (this.v[i].some(x => x !== '')) return i + 1; return 0; }
    getLastColumn() { let m = 0; this.v.forEach(l => { for (let j = l.length - 1; j >= m; j--) if (l[j] !== '') { m = j + 1; break; } }); return m; }
    getMaxRows() { return Math.max(this.v.length, 1000); }
    getRange(l, c, nl, nc) {
      nl = nl === undefined ? 1 : nl; nc = nc === undefined ? 1 : nc;
      if (!(l >= 1 && c >= 1 && nl >= 1 && nc >= 1)) throw new Error('As coordenadas do intervalo estão fora das dimensões da página. (' + [l, c, nl, nc] + ')');
      return new Intervalo(this, l, c, nl, nc);
    }
    getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
    deleteRow(n) { if (!(n >= 1 && n <= this.v.length)) throw new Error('Linha fora da página: ' + n); this.v.splice(n - 1, 1); this.f.splice(n - 1, 1); amb.chamadasPlanilha++; }
    appendRow(arr) {
      const l = this.getLastRow() + 1;
      this._garantir(l, arr.length);
      arr.forEach((x, j) => { this.v[l - 1][j] = gravar(x instanceof Date ? x.toISOString() : x, ''); });   // ignora o formato: é o bug real
      amb.chamadasPlanilha++;
    }
    setFrozenRows() { return this; } setColumnWidth() { return this; }
  }

  class Intervalo {
    constructor(sh, l, c, nl, nc) { Object.assign(this, { sh, l, c, nl, nc }); }
    _ler() {
      amb.chamadasPlanilha++;
      const out = [];
      for (let i = 0; i < this.nl; i++) {
        const linha = [];
        for (let j = 0; j < this.nc; j++) { const r = this.sh.v[this.l - 1 + i]; linha.push(r && r[this.c - 1 + j] !== undefined ? r[this.c - 1 + j] : ''); }
        out.push(linha);
      }
      return out;
    }
    getValues() { return this._ler(); }
    getDisplayValues() { return this._ler().map(l => l.map(String)); }
    setValues(m) {
      if (!Array.isArray(m) || m.length !== this.nl) throw new Error('O número de linhas nos dados (' + (m && m.length) + ') não corresponde ao do intervalo (' + this.nl + ').');
      m.forEach(l => { if (!Array.isArray(l) || l.length !== this.nc) throw new Error('O número de colunas nos dados (' + (l && l.length) + ') não corresponde ao do intervalo (' + this.nc + ').'); });
      this.sh._garantir(this.l + this.nl - 1, this.c + this.nc - 1);
      for (let i = 0; i < this.nl; i++) for (let j = 0; j < this.nc; j++) {
        this.sh.v[this.l - 1 + i][this.c - 1 + j] = gravar(m[i][j], this.sh.f[this.l - 1 + i][this.c - 1 + j]);
      }
      amb.chamadasPlanilha++;
      return this;
    }
    setValue(x) { return this.setValues([[x]]); }
    setNumberFormat(fmt) {
      this.sh._garantir(this.l + this.nl - 1, this.c + this.nc - 1);
      for (let i = 0; i < this.nl; i++) for (let j = 0; j < this.nc; j++) this.sh.f[this.l - 1 + i][this.c - 1 + j] = fmt;
      amb.chamadasPlanilha++;
      return this;
    }
    clearContent() { for (let i = 0; i < this.nl; i++) for (let j = 0; j < this.nc; j++) { const r = this.sh.v[this.l - 1 + i]; if (r && r[this.c - 1 + j] !== undefined) r[this.c - 1 + j] = ''; } return this; }
    setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  }

  const planilha = {
    getSheetByName: n => amb.folhas.find(s => s.nome === n) || null,
    insertSheet: n => { const s = new Folha(n); amb.folhas.push(s); return s; },
    getSheets: () => amb.folhas.slice(),
    deleteSheet: s => { amb.folhas = amb.folhas.filter(x => x !== s); },
    getId: () => 'planilha-falsa'
  };
  amb.folha = n => planilha.getSheetByName(n);
  amb.criarFolha = n => planilha.insertSheet(n);

  // ── Drive ───────────────────────────────────────────────────────────────────
  class Arquivo {
    constructor(blob, pasta) { this.id = 'arq-' + crypto.randomBytes(6).toString('hex'); this.blob = blob; this.pasta = pasta; this.lixeira = false; amb.arquivos[this.id] = this; }
    getId() { return this.id; } getName() { return this.blob.nome; }
    getBlob() { return this.blob; } setTrashed(x) { this.lixeira = !!x; return this; }
  }
  class Pasta {
    constructor(nome) { this.id = 'pasta-' + crypto.randomBytes(6).toString('hex'); this.nome = nome; this.filhas = []; this.arquivos = []; amb.pastas[this.id] = this; }
    getId() { return this.id; } getName() { return this.nome; }
    createFolder(n) { const p = new Pasta(n); this.filhas.push(p); return p; }
    getFoldersByName(n) { const a = this.filhas.filter(p => p.nome === n); let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; }
    createFile(blob) { const f = new Arquivo(blob, this); this.arquivos.push(f); return f; }
  }
  const blobDe = (bytes, mime, nome) => ({ bytes, mime, nome, getBytes: () => bytes, getContentType: () => mime, getName: () => nome });

  // ── Serviços ────────────────────────────────────────────────────────────────
  const p2 = n => String(n).padStart(2, '0');
  const globais = {
    SpreadsheetApp: { getActiveSpreadsheet: () => planilha, openById: () => planilha },
    LockService: { getScriptLock: () => ({ waitLock() { amb.travas++; }, releaseLock() { amb.travas--; } }) },
    // Como no Google: valor acima de 100 KB por chave estoura ("Argument too large").
    CacheService: { getScriptCache: () => {
      const caber = (k, v) => { if (String(v).length > 100 * 1024) throw new Error('Argument too large: ' + k); };
      return {
        get: k => (amb.cache[k] === undefined ? null : amb.cache[k]),
        put: (k, v) => { caber(k, v); amb.cache[k] = String(v); },
        putAll: o => { Object.keys(o).forEach(k => caber(k, o[k])); Object.keys(o).forEach(k => { amb.cache[k] = String(o[k]); }); },
        getAll: ks => { const o = {}; ks.forEach(k => { if (amb.cache[k] !== undefined) o[k] = amb.cache[k]; }); return o; },
        remove: k => { delete amb.cache[k]; },
        removeAll: ks => { ks.forEach(k => { delete amb.cache[k]; }); }
      };
    } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (amb.props[k] === undefined ? null : amb.props[k]), setProperty: (k, v) => { amb.props[k] = String(v); }, deleteProperty: k => { delete amb.props[k]; } }) },
    UrlFetchApp: {
      fetch(url, o) {
        amb.fetches++;
        let corpo = {};
        try { corpo = JSON.parse((o && o.payload) || '{}'); } catch (e) { }
        if (amb.loginForaDoAr) throw new Error('DNS error');
        const s = amb.sessoes[corpo.token];
        const resp = corpo.action === 'sessao_validar'
          ? (s ? Object.assign({ success: true }, s) : { success: false, error: 'Sessão inválida ou expirada.' })
          : { success: true };
        return { getContentText: () => JSON.stringify(resp) };
      }
    },
    Utilities: {
      // Fuso fixo de Brasília (UTC-3), independente da máquina que roda o teste.
      formatDate(d, fuso, fmt) {
        const t = new Date(d.getTime() - 3 * 3600 * 1000);
        const dia = t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate());
        if (fmt === 'yyyy-MM-dd') return dia;
        if (fmt === "yyyy-MM-dd'T'HH:mm:ss") return dia + 'T' + p2(t.getUTCHours()) + ':' + p2(t.getUTCMinutes()) + ':' + p2(t.getUTCSeconds());
        throw new Error('formato não emulado: ' + fmt);
      },
      getUuid: () => crypto.randomUUID(),
      base64Decode: s => Array.from(Buffer.from(String(s), 'base64')),
      base64Encode: b => Buffer.from(b).toString('base64'),
      newBlob: blobDe
    },
    DriveApp: {
      createFolder: n => new Pasta(n),
      getFolderById(id) { if (!amb.pastas[id]) throw new Error('pasta não encontrada'); return amb.pastas[id]; },
      getFileById(id) { if (!amb.arquivos[id]) throw new Error('arquivo não encontrado'); return amb.arquivos[id]; }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ conteudo: s, setMimeType() { return this; } }) },
    Logger: { log: m => amb.logs.push(String(m)) },
    console
  };

  // ── Execução ────────────────────────────────────────────────────────────────
  let script = null;
  amb.carregar = arq => { script = new vm.Script(fs.readFileSync(path.resolve(arq), 'utf8'), { filename: path.basename(arq) }); return amb; };

  /** Roda uma função do .gs num contexto NOVO (uma "execução" do Apps Script). */
  amb.executar = (nome, ...args) => {
    const ctx = vm.createContext(Object.assign({}, globais));
    script.runInContext(ctx);
    if (typeof ctx[nome] !== 'function') throw new Error('função não existe no script: ' + nome);
    const antes = amb.travas;
    try { return ctx[nome](...args); }
    finally { if (amb.travas !== antes) { const sobra = amb.travas - antes; amb.travas = antes; throw new Error('trava não liberada em ' + nome + ' (' + sobra + ')'); } }
  };
  amb.post = corpo => JSON.parse(amb.executar('doPost', { postData: { contents: JSON.stringify(corpo) } }).conteudo);
  amb.get = params => JSON.parse(amb.executar('doGet', { parameter: params }).conteudo);

  /** Toda célula de toda aba, para caçar "#CORROMPIDO" e "#FORMULA". */
  amb.celulasRuins = () => {
    const ruins = [];
    amb.folhas.forEach(s => s.v.forEach((l, i) => l.forEach((x, j) => { if (/^#(CORROMPIDO|FORMULA)/.test(String(x))) ruins.push(s.nome + '!L' + (i + 1) + 'C' + (j + 1) + ' = ' + x); })));
    return ruins;
  };
  return amb;
}

module.exports = { criarAmbiente };
