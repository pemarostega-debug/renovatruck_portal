/**
 * Migração da planilha antiga (RENOVA - Contas a pagar 2026.xlsx) para a base
 * nova do módulo Contas a Pagar.
 *
 * USO:
 *   node integracao/migrar-planilha.js "C:/caminho/RENOVA - Contas a pagar 2026.xlsx"
 *   node integracao/migrar-planilha.js <arquivo> --desde Agosto        (padrão)
 *   node integracao/migrar-planilha.js <arquivo> --desde Janeiro
 *   node integracao/migrar-planilha.js <arquivo> --enviar --token <token-da-sessao>
 *
 * Sem --enviar o script só gera  integracao/migracao-contas-pagar.json  e o
 * relatório na tela. Confira o relatório ANTES de enviar: a migração é a única
 * etapa que despeja centenas de linhas de uma vez na base.
 *
 * ── O QUE ESTE SCRIPT RESOLVE ────────────────────────────────────────────────
 *
 * 1. As abas mensais NÃO têm o mesmo layout. Janeiro a Abril não têm coluna
 *    "Natureza"; Maio, Setembro, Outubro e Novembro têm "NÚMERO CUPOM FISCAL"
 *    a mais. Ler por posição fixa embaralha valor com status. Aqui as colunas
 *    são localizadas PELO NOME, na linha 4 de cada aba.
 *
 * 2. A coluna "Observação" aparece duas vezes. A primeira é a observação de
 *    verdade; a segunda costuma guardar "PAGO EM 05/08" — que é a data real da
 *    baixa, muito melhor que o vencimento para o Fluxo de Caixa.
 *
 * 3. "Natureza" vem com variações de caixa e erros de digitação ("Peças e
 *    Isumos", "Despesas de pessoal"), e às vezes com um tipo de documento no
 *    lugar da natureza ("Parcelado 3X"). O de-para abaixo normaliza tudo; o
 *    que não casa vai para 9.99 A Classificar e aparece no relatório.
 *
 * 4. O código do fornecedor não existe na planilha. Sem ele, a mesma NF que
 *    veio do Genesis geraria uma chave diferente e entraria duas vezes. O
 *    script consulta o cadastro do Genesis e resolve o código pelo nome.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(__dirname, 'migracao-contas-pagar.json');
const CONFIG = path.join(__dirname, 'config.local.json');

const args = process.argv.slice(2);
const ARQUIVO = args.find(a => !a.startsWith('--'));
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
};
const tem = nome => args.indexOf('--' + nome) >= 0;

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DESDE = opt('desde', 'Agosto');
const API = opt('api', '');
const TOKEN = opt('token', '');

// ═════════════════════════════════════════════════════════════════════════════
// LEITOR DE XLSX (um .xlsx é um zip de XMLs; não vale puxar dependência)
// ═════════════════════════════════════════════════════════════════════════════

function lerZip(arquivo) {
  const buf = fs.readFileSync(arquivo);
  // Localiza o End of Central Directory a partir do fim.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo não parece um .xlsx válido.');

  const qtd = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const arquivos = {};

  for (let i = 0; i < qtd; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const nomeLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const comentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const nome = buf.slice(p + 46, p + 46 + nomeLen).toString('utf8');

    // Cabeçalho local: os campos de tamanho variável têm comprimento próprio.
    const lnLen = buf.readUInt16LE(offset + 26);
    const leLen = buf.readUInt16LE(offset + 28);
    const inicio = offset + 30 + lnLen + leLen;
    const bruto = buf.slice(inicio, inicio + tamComp);

    arquivos[nome] = metodo === 0 ? bruto : zlib.inflateRawSync(bruto);
    p += 46 + nomeLen + extraLen + comentLen;
  }
  return arquivos;
}

function desescapar(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (x, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&');
}

function abrirPlanilha(arquivo) {
  const z = lerZip(arquivo);
  const txt = nome => (z[nome] ? z[nome].toString('utf8') : '');

  // Textos compartilhados
  const compartilhados = [];
  const rawSS = txt('xl/sharedStrings.xml');
  if (rawSS) {
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(rawSS))) {
      const partes = [];
      const rt = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let t;
      while ((t = rt.exec(m[1]))) partes.push(t[1]);
      compartilhados.push(desescapar(partes.join('')));
    }
  }

  // Estilos → quais índices são data
  const styles = txt('xl/styles.xml');
  const fmts = {};
  const rf = /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let f;
  while ((f = rf.exec(styles))) fmts[f[1]] = desescapar(f[2]);
  const DATA_EMBUTIDA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const blocoXf = (styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0];
  const xfFmt = [];
  const rx = /<xf[^>]*numFmtId="(\d+)"[^>]*\/?>/g;
  let x;
  while ((x = rx.exec(blocoXf))) xfFmt.push(parseInt(x[1], 10));

  const ehData = s => {
    const id = xfFmt[s];
    if (id === undefined) return false;
    if (DATA_EMBUTIDA.has(id)) return true;
    const cod = fmts[String(id)];
    return !!(cod && /[dmyDMY]/.test(cod.replace(/\[[^\]]*\]/g, '')) && !/[#0]/.test(cod));
  };

  const serieParaISO = n => {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    if (isNaN(d)) return String(n);
    const p = v => String(v).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  };

  const colIdx = ref => {
    let n = 0;
    for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };

  // Abas: nome → arquivo
  const wb = txt('xl/workbook.xml');
  const rels = txt('xl/_rels/workbook.xml.rels');
  const alvo = {};
  const rr = /Id="([^"]+)"[^>]*Target="(worksheets\/[^"]+)"/g;
  let r;
  while ((r = rr.exec(rels))) alvo[r[1]] = 'xl/' + r[2];
  // O Target pode vir antes do Id dependendo de quem gravou o arquivo.
  const rr2 = /Target="(worksheets\/[^"]+)"[^>]*Id="([^"]+)"/g;
  while ((r = rr2.exec(rels))) alvo[r[2]] = 'xl/' + r[1];

  const abas = [];
  const rs = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/?>/g;
  while ((r = rs.exec(wb))) abas.push({ nome: desescapar(r[1]), caminho: alvo[r[2]] });

  const lerAba = caminho => {
    const xml = txt(caminho);
    if (!xml) return [];
    const linhas = [];
    const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>|<row[^>]*r="(\d+)"[^>]*\/>/g;
    let rw;
    while ((rw = rowRe.exec(xml))) {
      const corpo = rw[2] || '';
      const celulas = [];
      const cRe = /<c\s+([^>]*?)(\/?)>/g;
      let c;
      while ((c = cRe.exec(corpo))) {
        const attrs = c[1];
        const vazia = c[2] === '/';
        const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
        if (!ref) continue;
        const ms = attrs.match(/\ss="(\d+)"/);
        const st = ms ? parseInt(ms[1], 10) : -1;
        const tipo = (attrs.match(/\st="([^"]+)"/) || [, 'n'])[1];
        let dentro = '';
        if (!vazia) {
          const fim = corpo.indexOf('</c>', cRe.lastIndex);
          dentro = corpo.slice(cRe.lastIndex, fim < 0 ? corpo.length : fim);
          cRe.lastIndex = fim < 0 ? corpo.length : fim + 4;
        }
        const vm = dentro.match(/<v>([\s\S]*?)<\/v>/);
        const im = dentro.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
        let val = '';
        if (im) val = desescapar(im[1]);
        else if (vm) {
          const cru = vm[1];
          if (tipo === 's') val = compartilhados[parseInt(cru, 10)] || '';
          else if (tipo === 'str' || tipo === 'e') val = desescapar(cru);
          else {
            const n = parseFloat(cru);
            val = (ehData(st) && n > 20000 && n < 90000) ? serieParaISO(n) : cru;
          }
        }
        celulas[colIdx(ref)] = val;
      }
      linhas[parseInt(rw[1] || rw[3], 10) - 1] = celulas;
    }
    return linhas;
  };

  return { abas, lerAba };
}

// ═════════════════════════════════════════════════════════════════════════════
// NORMALIZAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Min\u00fasculas, sem acento e com os espa\u00e7os colapsados.
 *
 * O colapso n\u00e3o \u00e9 enfeite: os cabe\u00e7alhos da planilha t\u00eam quebra de linha no
 * meio ("N\u00daMERO\r\n NF", "Forma de\r\nPagamento"). Sem isto o mapeamento n\u00e3o
 * encontra a coluna, o n\u00famero da NF entra vazio e a trava anti-duplicidade
 * passa a comparar t\u00edtulos pelo nome do fornecedor \u2014 que \u00e9 como duas parcelas
 * diferentes do mesmo aporte viram "duplicata".
 */
const norm = s => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ').trim();

const normalizarChave = v => String(v === null || v === undefined ? '' : v)
  .trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9]/g, '');

/**
 * Tira o sufixo de parcela do número da NF — e só ele. Cópia literal do
 * nfBase() do contas-pagar.gs; as três pontas têm de cortar igual.
 */
function nfBase(numeroNF, parcela) {
  const s = String(numeroNF === null || numeroNF === undefined ? '' : numeroNF).trim();
  const m = /^(.+)\/(\d{1,2})$/.exec(s);
  if (m && parseInt(m[2], 10) === (Number(parcela) || 1)) return m[1];
  return s;
}

/** Mesmíssima regra do contas-pagar.gs e do extrair-contas-pagar.js. */
function chaveNatural(t) {
  const parc = Number(t.parcela) || 1;
  const nf = normalizarChave(nfBase(t.numero_nf, parc));
  const cod = normalizarChave(t.fornecedor_cod);
  if (nf && cod) return 'NF|' + nf + '|' + cod + '|' + parc;
  if (nf) return 'NF|' + nf + '|' + normalizarChave(t.fornecedor) + '|' + parc;
  return 'AV|' + normalizarChave(t.fornecedor) + '|' +
    (t.data_vencimento || '') + '|' + (Number(t.valor_total) || 0).toFixed(2) + '|' + parc;
}

/**
 * Aceita "1.234,56", "1234.56" e número.
 *
 * Arredonda para centavos: as colunas de folha vêm de fórmula e chegam com
 * ruído de ponto flutuante (1484.6282526481818). Dinheiro tem duas casas.
 */
function valor(v) {
  if (v === null || v === undefined || v === '') return 0;
  let n;
  if (typeof v === 'number') {
    n = v;
  } else {
    let s = String(v).trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    const temV = s.includes(','), temP = s.includes('.');
    if (temV && temP) s = s.replace(/\./g, '').replace(',', '.');
    else if (temV) s = s.replace(',', '.');
    n = parseFloat(s);
  }
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/** Aceita 'YYYY-MM-DD' (como o leitor devolve) e 'DD/MM/AAAA' digitado. */
function data(v) {
  if (!v) return '';
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return s.slice(0, 10);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return '';
}

// ── De-para de naturezas → plano de contas ──────────────────────────────────
const DE_PARA = {
  'pecas e insumos': ['1.01', 'Peças e Insumos'],
  'pecas e isumos': ['1.01', 'Peças e Insumos'],
  'pecas': ['1.01', 'Peças e Insumos'],
  'tintas': ['1.01', 'Peças e Insumos'],
  'equipamentos': ['4.01', 'Máquinas e Equipamentos'],
  'custos produtivos': ['1.02', 'Custos Produtivos'],
  'combustivel': ['1.03', 'Combustível e Pedágio'],
  'combustivel e insumos': ['1.03', 'Combustível e Pedágio'],
  'pedagio': ['1.03', 'Combustível e Pedágio'],
  'servicos': ['1.04', 'Serviços de Terceiros'],
  'frota': ['1.05', 'Frota e Manutenção'],
  'aluguel carro': ['1.05', 'Frota e Manutenção'],
  'comissao': ['1.06', 'Comissões'],

  'aluguel': ['2.01', 'Aluguel'],
  'luz, agua e internet': ['2.02', 'Luz, Água e Internet'],
  'folha de pagamento': ['2.03', 'Folha de Pagamento'],
  'despesas de pessoal': ['2.04', 'Despesas de Pessoal'],
  'saude do trabalho': ['2.04', 'Despesas de Pessoal'],
  'reembolso': ['2.04', 'Despesas de Pessoal'],
  'despesas administrativas': ['2.05', 'Despesas Administrativas'],
  'documetacao': ['2.05', 'Despesas Administrativas'],
  'documentacao': ['2.05', 'Despesas Administrativas'],
  'contador': ['2.05', 'Despesas Administrativas'],
  'audiencia': ['2.05', 'Despesas Administrativas'],
  'despesas de ti e sistema': ['2.06', 'Despesas de TI e Sistema'],
  'sistema': ['2.06', 'Despesas de TI e Sistema'],
  'despesas de alimentacao': ['2.07', 'Despesas de Alimentação'],
  'despesas de material de uso e copa': ['2.08', 'Material de Uso e Copa'],
  'infraestrutura e seguranca': ['2.09', 'Infraestrutura e Segurança'],
  'impostos': ['2.10', 'Impostos e Taxas'],
  'imposto': ['2.10', 'Impostos e Taxas'],
  'marketing': ['2.11', 'Marketing'],

  'juros mes 4': ['3.01', 'Juros e Multas'],
  'emprestimo': ['3.02', 'Empréstimos e Financiamentos'],
  'acordo aluguel': ['3.04', 'Acordos e Parcelamentos'],
  'cartorio': ['3.05', 'Protestos e Cartório'],
  'protesto': ['3.05', 'Protestos e Cartório'],
  'marcos': ['3.06', 'Sócios, Aportes e Acertos'],
  'wesley': ['3.06', 'Sócios, Aportes e Acertos'],
  'acerto junior': ['3.06', 'Sócios, Aportes e Acertos'],
  'junior acerto': ['3.06', 'Sócios, Aportes e Acertos']
};

const naoClassificados = new Map();

function classificar(natureza, descricao) {
  const n = norm(natureza);
  if (DE_PARA[n]) return DE_PARA[n];

  // Casos com "custo fixo" na natureza: o detalhe está na descrição.
  if (/^custo fixo$/.test(n)) {
    const d = norm(descricao);
    if (DE_PARA[d]) return DE_PARA[d];
    return ['2.05', 'Despesas Administrativas'];
  }
  // Tipo de documento vazado para a coluna de natureza.
  if (/^(a vista|parcelado|parcedo|patcelado|variaveis)/.test(n) || !n) {
    const chave = natureza || '(vazio)';
    naoClassificados.set(chave, (naoClassificados.get(chave) || 0) + 1);
    return ['9.99', 'A Classificar'];
  }
  naoClassificados.set(natureza, (naoClassificados.get(natureza) || 0) + 1);
  return ['9.99', 'A Classificar'];
}

/**
 * Status normalizado.
 * "atraso" NÃO é um estado guardado: um título vencido continua ABERTO e o
 * atraso é calculado comparando o vencimento com hoje. Guardar "atraso" na
 * base faria o título continuar atrasado para sempre depois de pago.
 */
function classificarStatus(bruto, valorTotal, valorPago) {
  const s = norm(bruto);
  if (/cancel/.test(s)) return 'CANCELADO';
  if (/pago|quitad/.test(s)) return valorPago > 0 && valorTotal > 0 && valorPago + 0.005 < valorTotal ? 'PARCIAL' : 'PAGO';
  return 'ABERTO';
}

/**
 * Data da baixa.
 * A regra da Diretoria é usar o vencimento quando o título está pago. Só que a
 * segunda coluna "Observação" muitas vezes traz "PAGO EM 05/08" — a data real
 * em que o dinheiro saiu, que é o que o Fluxo de Caixa vai precisar. Quando ela
 * existe, ela ganha; senão cai na regra do vencimento.
 * Rode com --baixa-vencimento para forçar sempre o vencimento.
 */
function calcularBaixa(status, vencimento, obs2, anoRef) {
  if (status !== 'PAGO' && status !== 'PARCIAL') return '';
  if (!tem('baixa-vencimento')) {
    const m = /pago\s*(?:em|rm)\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/i.exec(String(obs2 || ''));
    if (m) {
      let ano = m[3] ? parseInt(m[3], 10) : anoRef;
      if (ano < 100) ano += 2000;
      const dia = String(parseInt(m[1], 10)).padStart(2, '0');
      const mes = String(parseInt(m[2], 10)).padStart(2, '0');
      if (+mes >= 1 && +mes <= 12 && +dia >= 1 && +dia <= 31) return ano + '-' + mes + '-' + dia;
    }
  }
  return vencimento || '';
}

// ═════════════════════════════════════════════════════════════════════════════
// CADASTRO DE FORNECEDORES (para resolver o código no Genesis)
// ═════════════════════════════════════════════════════════════════════════════

const RUIDO = /\b(LTDA|ME|EPP|EIRELI|SA|COMERCIO|COMERCIAL|DISTRIBUIDORA|IND|INDUSTRIA|AUTO|PECAS|PRODUTOS|DE|DA|DO|E|EM)\b/g;
const limpo = s => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const nucleo = s => limpo(s).replace(RUIDO, ' ').replace(/\s+/g, ' ').trim();

async function carregarFornecedores() {
  if (!fs.existsSync(CONFIG)) {
    console.warn('! Sem config.local.json: os títulos vão migrar SEM código de fornecedor.');
    console.warn('  A trava anti-duplicidade contra o Genesis fica mais fraca.');
    return null;
  }
  let mysql;
  try { mysql = require('mysql2/promise'); }
  catch (e) { console.warn('! mysql2 não instalado; seguindo sem código de fornecedor.'); return null; }

  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  let cn;
  try {
    cn = await mysql.createConnection(Object.assign({}, cfg, { connectTimeout: 12000 }));
    // A chave é IdFornecedor, não Codigo: `Codigo` está NULL em 297 dos 299
    // cadastros, e é o IdFornecedor que aparece como codigo_fornecedor na
    // vw_contas_a_pagar (conferido: 29 de 29 códigos batem).
    const [linhas] = await cn.query('SELECT IdFornecedor, Razao, Fantasia, CNPJF FROM fornecedor');
    const mapa = new Map();
    for (const f of linhas) {
      if (f.IdFornecedor === null || f.IdFornecedor === undefined) continue;
      for (const nome of [f.Razao, f.Fantasia]) {
        if (!nome) continue;
        const a = limpo(nome), b = nucleo(nome);
        if (a && !mapa.has(a)) mapa.set(a, f);
        if (b && !mapa.has(b)) mapa.set(b, f);
      }
    }
    console.log(`Cadastro do Genesis: ${linhas.length} fornecedor(es).`);
    return mapa;
  } catch (e) {
    console.warn('! Não consegui ler o cadastro de fornecedores: ' + e.message);
    return null;
  } finally {
    if (cn) await cn.end();
  }
}

function resolverFornecedor(mapa, nome) {
  if (!mapa || !nome) return '';
  const a = limpo(nome), b = nucleo(nome);
  let f = mapa.get(a) || mapa.get(b);
  if (!f && b.length >= 4) {
    for (const [k, v] of mapa) {
      if (k.length >= 4 && (k.startsWith(b) || b.startsWith(k))) { f = v; break; }
    }
  }
  // Nunca devolver "null" como código: String(null) vira "NULL" na chave e
  // faria todos os fornecedores sem código colidirem entre si.
  if (!f || f.IdFornecedor === null || f.IdFornecedor === undefined) return '';
  return String(f.IdFornecedor);
}

// ═════════════════════════════════════════════════════════════════════════════
// PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════

const ALIAS = {
  data_emissao:    ['data'],
  data_vencimento: ['vencimento'],
  fornecedor:      ['fornecedor'],
  numero_nf:       ['numero nf', 'número nf'],
  numero_boleto:   ['numero boleto', 'número boleto'],
  cupom:           ['numero cupom fiscal', 'número cupom fiscal'],
  tipo_docto:      ['tipo docto'],
  descricao:       ['descricao', 'descrição'],
  natureza:        ['natureza'],
  forma_pagamento: ['forma de pagamento'],
  valor_total:     ['valor total'],
  valor_pago:      ['valor pago'],
  status:          ['status']
};

/**
 * Numera as parcelas de cada nota.
 *
 * A planilha antiga não tem coluna de parcela: o controle está no número do
 * boleto ("6662-3", "22622/005", "24459-02"). Sem numerar, as três parcelas da
 * FIX IMPLEMENTOS 8034 gerariam a mesma chave natural e duas delas seriam
 * descartadas como duplicata — R$ 5.489,01 sumiram assim na primeira rodada.
 *
 * Agrupa por fornecedor + número da nota, ordena por vencimento e numera. Nota
 * que aparece uma vez só continua sendo 1 de 1.
 */
function numerarParcelas(titulos) {
  const grupos = new Map();
  for (const t of titulos) {
    const nf = normalizarChave(nfBase(t.numero_nf, 1));
    if (!nf) continue; // sem NF a chave já usa vencimento + valor
    const g = normalizarChave(t.fornecedor_cod || t.fornecedor) + '~' + nf;
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(t);
  }

  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;
    lista.sort((a, b) =>
      (a.data_vencimento || '').localeCompare(b.data_vencimento || '') ||
      limpo(a.numero_boleto).localeCompare(limpo(b.numero_boleto)));
    lista.forEach((t, i) => {
      t.parcela = i + 1;
      t.total_parcelas = lista.length;
    });
  }
}

function mapearColunas(cabecalho) {
  const idx = {};
  const obs = [];
  cabecalho.forEach((h, i) => {
    const hn = norm(h);
    if (hn === 'observacao') { obs.push(i); return; }
    for (const [chave, nomes] of Object.entries(ALIAS)) {
      if (nomes.includes(hn) && idx[chave] === undefined) idx[chave] = i;
    }
  });
  idx.observacao_1 = obs[0];
  idx.observacao_2 = obs[1];
  return idx;
}

async function migrar() {
  if (!ARQUIVO || !fs.existsSync(ARQUIVO)) {
    console.error('Informe o caminho do .xlsx.');
    console.error('Ex.: node integracao/migrar-planilha.js "C:/Users/.../RENOVA - Contas a pagar 2026.xlsx"');
    process.exitCode = 1;
    return;
  }

  const corte = MESES.indexOf(DESDE);
  if (corte < 0) { console.error('Mês inválido em --desde: ' + DESDE); process.exitCode = 1; return; }

  const cadastro = await carregarFornecedores();
  const { abas, lerAba } = abrirPlanilha(ARQUIVO);

  const alvos = abas.filter(a => {
    const m = /^([A-Za-zç]+)-(\d{2})$/.exec(a.nome.trim());
    if (!m) return false;
    const i = MESES.findIndex(x => norm(x) === norm(m[1]));
    return i >= corte;
  });

  if (!alvos.length) {
    console.error('Nenhuma aba mensal a partir de ' + DESDE + '. Abas encontradas: ' + abas.map(a => a.nome).join(', '));
    process.exitCode = 1;
    return;
  }
  console.log('Abas a migrar: ' + alvos.map(a => a.nome).join(', '));

  const titulos = [];
  const relatorio = [];
  const chaves = new Set();
  let repetidas = 0, semFornecedor = 0, resolvidos = 0;

  for (const aba of alvos) {
    const linhas = lerAba(aba.caminho);
    const cab = linhas[3] || [];
    const I = mapearColunas(cab);

    if (I.fornecedor === undefined || I.data_vencimento === undefined || I.valor_total === undefined) {
      console.warn(`! Aba ${aba.nome}: cabeçalho não reconhecido, pulando.`);
      continue;
    }

    const anoRef = 2000 + parseInt(/-(\d{2})$/.exec(aba.nome.trim())[1], 10);
    let n = 0;

    for (let r = 4; r < linhas.length; r++) {
      const c = linhas[r] || [];
      const fornecedor = String(c[I.fornecedor] || '').trim();
      if (!fornecedor) continue;

      const vt = valor(c[I.valor_total]);
      const vp = valor(c[I.valor_pago]);
      const venc = data(c[I.data_vencimento]);
      const obs2 = String(c[I.observacao_2] || '').trim();

      if (!venc) { semFornecedor++; continue; }

      const status = classificarStatus(c[I.status], vt, vp);
      const [natCod, natNome] = classificar(c[I.natureza], c[I.descricao]);
      const cod = resolverFornecedor(cadastro, fornecedor);
      if (cod) resolvidos++;

      const t = {
        origem: 'MIGRACAO',
        empresa: 'RENOVA',
        data_emissao: data(c[I.data_emissao]),
        data_vencimento: venc,
        fornecedor: fornecedor,
        fornecedor_cod: cod,
        numero_nf: String(c[I.numero_nf] || '').trim(),
        numero_boleto: String(c[I.numero_boleto] || '').trim(),
        tipo_docto: String(c[I.tipo_docto] || '').trim(),
        descricao: String(c[I.descricao] || '').trim(),
        natureza_codigo: natCod,
        natureza: natNome,
        observacao_1: String(c[I.observacao_1] || '').trim(),
        observacao_2: obs2,
        forma_pagamento: String(c[I.forma_pagamento] || '').trim(),
        valor_total: vt,
        // Um título pago sem valor lançado teve o total pago: é o que "pago" quer dizer.
        valor_pago: status === 'PAGO' && vp === 0 ? vt : vp,
        status: status,
        data_baixa: calcularBaixa(status, venc, obs2, anoRef),
        parcela: 1,
        total_parcelas: 1,
        _aba: aba.nome,
        _linha: r + 1
      };
      // A assinatura completa é o único descarte seguro: só sai de cena a
      // linha que repete TUDO. Duas linhas com a mesma NF mas boleto, valor ou
      // vencimento diferentes são parcelas distintas, não cópia.
      const assinatura = [
        limpo(fornecedor), venc, vt.toFixed(2),
        limpo(t.numero_nf), limpo(t.numero_boleto), limpo(t.descricao), limpo(t.observacao_1)
      ].join('~');

      if (chaves.has(assinatura)) {
        repetidas++;
        relatorio.push({ aba: aba.nome, linha: r + 1, fornecedor, valor: vt, motivo: 'linha idêntica já migrada' });
        continue;
      }
      chaves.add(assinatura);
      titulos.push(t);
      n++;
    }
    console.log(`  ${aba.nome}: ${n} título(s)`);
  }

  numerarParcelas(titulos);
  for (const t of titulos) t.chave_origem = chaveNatural(t);

  // Rede de segurança: depois de numerar, nenhuma chave pode se repetir.
  const vistas = new Map();
  for (const t of titulos) {
    if (vistas.has(t.chave_origem)) {
      const outro = vistas.get(t.chave_origem);
      console.warn(`! Chave repetida após numeração: ${t.chave_origem}`);
      console.warn(`    ${outro._aba} L${outro._linha} (${outro.fornecedor})  x  ${t._aba} L${t._linha} (${t.fornecedor})`);
    }
    vistas.set(t.chave_origem, t);
  }

  // ── Relatório ──
  const soma = titulos.reduce((s, t) => s + t.valor_total, 0);
  const pago = titulos.reduce((s, t) => s + t.valor_pago, 0);
  const porStatus = titulos.reduce((a, t) => (a[t.status] = (a[t.status] || 0) + 1, a), {});

  console.log('\n══ RESUMO ══');
  console.log(`Títulos:            ${titulos.length}`);
  console.log(`Valor total:        R$ ${soma.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`Valor pago:         R$ ${pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`Por status:         ${JSON.stringify(porStatus)}`);
  console.log(`Código de fornecedor resolvido: ${resolvidos} de ${titulos.length}`);
  console.log(`Linhas repetidas descartadas:   ${repetidas}`);
  console.log(`Linhas sem vencimento puladas:  ${semFornecedor}`);
  console.log(`Com data de baixa:  ${titulos.filter(t => t.data_baixa).length}`);

  if (naoClassificados.size) {
    console.log('\n══ NATUREZAS QUE CAÍRAM EM 9.99 (revise no sistema) ══');
    [...naoClassificados.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
  }

  fs.writeFileSync(SAIDA, JSON.stringify({
    gerado_em: new Date().toISOString(),
    origem: path.basename(ARQUIVO),
    desde: DESDE,
    total: titulos.length,
    resumo: { valor_total: soma, valor_pago: pago, por_status: porStatus },
    nao_classificados: [...naoClassificados.entries()].map(([k, v]) => ({ natureza: k, linhas: v })),
    descartados: relatorio,
    titulos: titulos
  }, null, 2));
  console.log(`\nGravado: ${SAIDA}`);

  if (tem('enviar')) await enviar(titulos);
  else console.log('\nConfira o relatório e rode de novo com  --enviar --token <token>  para gravar na base.');
}

/** Envia em blocos de 200 — o Apps Script tem 6 minutos por execução. */
async function enviar(titulos) {
  if (!API) { console.error('Informe --api <url do /exec do contas-pagar>.'); process.exitCode = 1; return; }
  if (!TOKEN) { console.error('Informe --token <token da sessão>. Pegue no console do portal: RV.token'); process.exitCode = 1; return; }

  const BLOCO = 200;
  let inseridos = 0, ignorados = 0, erros = 0;

  for (let i = 0; i < titulos.length; i += BLOCO) {
    const lote = titulos.slice(i, i + BLOCO).map(t => {
      const c = Object.assign({}, t);
      delete c._aba; delete c._linha;
      return c;
    });
    process.stdout.write(`Enviando ${i + 1}–${i + lote.length} de ${titulos.length}... `);

    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'importar', token: TOKEN, origem: 'MIGRACAO', titulos: lote })
    });
    const d = await resp.json();
    if (!d.success) { console.log('FALHOU: ' + d.error); process.exitCode = 1; return; }

    inseridos += d.data.inseridos;
    ignorados += d.data.ignorados.length;
    erros += d.data.erros.length;
    console.log(`ok (${d.data.inseridos} incluídos, ${d.data.ignorados.length} ignorados, ${d.data.erros.length} com erro)`);
    if (d.data.erros.length) d.data.erros.slice(0, 5).forEach(e => console.log('    ! ' + e.fornecedor + ': ' + e.motivo));
  }

  console.log(`\n══ MIGRAÇÃO CONCLUÍDA ══`);
  console.log(`Incluídos: ${inseridos} | Ignorados (já existiam): ${ignorados} | Com erro: ${erros}`);
}

migrar().catch(e => {
  console.error('Erro inesperado: ' + e.stack);
  process.exitCode = 1;
});
