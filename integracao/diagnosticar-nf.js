/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Diagnóstico de NF — "por que esta nota não aparece em Antecipar?"
 *
 *   node integracao/diagnosticar-nf.js 414 412 426 427 428 429 413 415 410
 *   node integracao/diagnosticar-nf.js 414/P 413/S          (filtra o tipo)
 *   node integracao/diagnosticar-nf.js --os 4771            (tudo de uma OS)
 *
 * Existe porque a pergunta "a nota X não está na lista, por quê?" se repete, e
 * a resposta estava espalhada por três lugares que ninguém consegue olhar ao
 * mesmo tempo: o Genesis, a fila de aprovação e o filtro da aba Antecipar.
 *
 * Só LÊ. Não grava no Genesis, não manda nada para a fila, não cria título.
 *
 * Com --api <url/exec do contas a RECEBER> --token <RV.token do portal> também
 * confere a fila de aprovação e os títulos já lançados, e aí o veredito é
 * completo. Sem isso, diagnostica só o lado do Genesis.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
};

const API = opt('api', process.env.APPS_SCRIPT_CONTAS_RECEBER_URL || '');
const TOKEN = opt('token', '');
const OS_ALVO = opt('os', '');
const DESDE = opt('desde', '2026-01-01');

// Os números soltos da linha de comando são as NFs. "414/P" restringe ao tipo.
const PEDIDOS = args
  .filter(a => /^\d+(\/[PS])?$/i.test(a))
  .map(a => {
    const parte = a.split('/');
    const t = parte[1] ? parte[1].toUpperCase() : '';
    return { nf: String(parseInt(parte[0], 10)), tipo: t === 'P' ? 'PECA' : t === 'S' ? 'SERVICO' : '' };
  });

if (!PEDIDOS.length && !OS_ALVO) {
  console.error('Informe as NFs: node integracao/diagnosticar-nf.js 414 413/S --os 4771');
  process.exit(1);
}

const iso = v => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const brl = v => 'R$ ' + num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const hoje = iso(new Date());

/** Mesma normalização / tipagem do extrator e do contas-receber.gs. */
const normalizarChave = v => String(v === null || v === undefined ? '' : v)
  .trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

function tipoNf(valor) {
  const v = normalizarChave(valor);
  if (v === 'PECA' || v === 'SERVICO') return v;
  if (v.indexOf('SERVICO') >= 0 || v.indexOf('SERVI') >= 0 || v.indexOf('PRESTA') >= 0) return 'SERVICO';
  if (v.indexOf('MERCADORIA') >= 0 || v.indexOf('VENDA') === 0 || v.indexOf('REMESSA') === 0) return 'PECA';
  return '';
}

/**
 * A parte do filtro do SQL_NOTAS que olha a natureza. Separada da checagem de
 * cancelamento de propósito: juntar as duas fazia uma nota cancelada ser
 * acusada também de natureza errada, o que é mentira e manda quem lê procurar
 * no lugar errado.
 */
const naturezaEntra = n => /^(venda|presta)/i.test(String(n.natureza_operacao || '').trim());

/**
 * O primeiro vencimento da nota já passou? Usa Venc01, que é o que o Genesis
 * preenche na parcela 1 — basta para explicar a ausência na fila, porque o
 * extrator deixou de mandar nota vencida.
 */
const vencimentoPassou = n => {
  const v = iso(n.Venc01);
  return !!v && v > iso(n.data) && v < hoje;
};

const SQL = `
  SELECT cod_id, num_nf, data, natureza_operacao, cancelada, cr_emitida,
         codigo_cliente, razao_cli, valor_total_nf, numero_parcelas, num_pedido,
         Venc01
  FROM vw_notas_fiscais
  WHERE data >= ? AND (num_nf IN (?) OR num_pedido = ?)
  ORDER BY num_nf, data`;

const SQL_CR = `
  SELECT codigo_id, titulo, codigo_cliente, vencimento, data_baixa, valor, valor_pago,
         num_os, os_fat, parcela
  FROM vw_contas_a_receber
  WHERE emissao >= ?`;

async function doPortal(action, corpo) {
  const r = await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action, token: TOKEN }, corpo || {}))
  });
  const d = await r.json();
  if (!d.success) throw new Error(d.error || 'falha no portal');
  return d.data;
}

(async () => {
  const cn = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, connectTimeout: 15000
  });
  let notas, cr;
  try {
    const r = await Promise.all([
      cn.query(SQL, [DESDE, PEDIDOS.length ? PEDIDOS.map(p => p.nf) : ['-'], OS_ALVO || '-']),
      cn.query(SQL_CR, [DESDE])
    ]);
    notas = r[0][0];
    cr = r[1][0];
  } finally { await cn.end(); }

  // Títulos já lançados: leitura pública do doGet, não precisa de token.
  let titulos = null;
  if (API) {
    try {
      const r = await fetch(API + '?action=titulos').then(x => x.json());
      if (r.success) titulos = r.data || [];
      else console.log('(não consegui ler os títulos: ' + r.error + ')');
    } catch (e) {
      console.log('(não consegui ler os títulos: ' + e.message + ')');
    }
  } else {
    console.log('(sem --api: não dá para olhar os títulos do portal)');
  }

  // A fila de aprovação é POST autenticado — só com o token de sessão do portal.
  let fila = null;
  if (API && TOKEN) {
    try {
      const d = await doPortal('sync_ler', {});
      fila = d.notas || [];
      console.log('Fila de aprovação: ' + fila.length + ' nota(s) · extração de ' + (d.gerado_em || '?'));
    } catch (e) {
      console.log('(sem leitura da fila: ' + e.message + ')');
    }
  } else {
    console.log('(sem --token: não dá para olhar a fila de aprovação — pegue RV.token no console do portal)');
  }
  console.log('');

  const alvo = notas.filter(n => {
    if (OS_ALVO && String(n.num_pedido || '').trim() === String(OS_ALVO)) return true;
    const p = PEDIDOS.filter(x => x.nf === String(n.num_nf))[0];
    if (!p) return false;
    return !p.tipo || p.tipo === tipoNf(n.natureza_operacao);
  });

  const achadas = alvo.map(n => String(n.num_nf));
  PEDIDOS.forEach(p => {
    if (achadas.indexOf(p.nf) < 0) {
      console.log('NF ' + p.nf + (p.tipo ? '/' + p.tipo : '') + ' — NÃO EXISTE na vw_notas_fiscais desde ' +
        DESDE + '. Nota não emitida, emitida fora da janela, ou numeração de outra série.');
    }
  });

  alvo.forEach(n => {
    const tipo = tipoNf(n.natureza_operacao);
    const emi = iso(n.data);
    const os = String(n.num_pedido || '').trim();
    const motivos = [];

    console.log('── NF ' + n.num_nf + ' (' + (tipo || 'tipo indefinido') + ')  OS ' + (os || '—') +
      '  ' + String(n.razao_cli || '').trim() + '  ' + brl(n.valor_total_nf) +
      '  emissão ' + emi + '  ' + n.numero_parcelas + ' parcela(s)');

    if (String(n.cancelada || '').toLowerCase() === 'sim') motivos.push('CANCELADA no Genesis');
    if (!naturezaEntra(n)) {
      motivos.push('natureza_operacao "' + n.natureza_operacao + '" não casa com o filtro do extrator ' +
        '(só entra o que começa com Venda ou Presta)');
    }
    if (!tipo) motivos.push('tipo peça/serviço indefinido pela natureza — a chave natural sai sem tipo');

    // Conferência com a vw_contas_a_receber: é aqui que vencimento, valor e
    // BAIXA do título são herdados — e uma baixa herdada tira a nota de Antecipar.
    const conf = cr.filter(t => {
      const m = /^NF0*(\d+)(?:\/(\d+))?$/i.exec(String(t.titulo || '').trim());
      if (!m) return false;
      return m[1] === String(n.num_nf) && String(t.codigo_cliente) === String(n.codigo_cliente);
    });
    if (conf.length) {
      conf.forEach(t => {
        const baixa = iso(t.data_baixa);
        console.log('   conferência vw_contas_a_receber: ' + t.titulo + ' venc ' + iso(t.vencimento) +
          ' ' + brl(t.valor) + (baixa ? ' BAIXADO em ' + baixa : '') +
          ' pago ' + brl(t.valor_pago) + ' OS ' + (t.num_os || t.os_fat || '—'));
        if (baixa || num(t.valor_pago) > 0) {
          motivos.push('a conferência traz baixa/valor pago → o título nasce RECEBIDO, e título ' +
            'recebido não é antecipável');
        }
      });
      const irmas = alvo.filter(x => String(x.num_nf) === String(n.num_nf) &&
        String(x.codigo_cliente) === String(n.codigo_cliente));
      if (conf.length < irmas.length) {
        motivos.push('peça e serviço com o mesmo num_nf dividem o MESMO título de conferência ' +
          '(o índice do extrator não olha o tipo) → as duas herdam o mesmo vencimento/valor/baixa');
      }
    }

    if (fila) {
      const naFila = fila.filter(f => String(f.numero_nf) === String(n.num_nf) &&
        String(f.cliente_cod) === String(n.codigo_cliente) &&
        (!tipo || tipoNf(f.natureza_operacao || f.tipo_nf) === tipo));
      console.log('   na fila de aprovação: ' + (naFila.length ? naFila.length + ' parcela(s)' : 'NÃO'));
      if (!naFila.length) {
        motivos.push(vencimentoPassou(n)
          ? 'não está na fila porque já venceu: o extrator não manda vencida ' +
            '(rode com --com-vencidas se precisar dela)'
          : 'não está na fila: a última extração não a trouxe (cron atrasado ou janela curta)');
      }
    }

    if (titulos) {
      const t = titulos.filter(x => String(x.numero_nf) === String(n.num_nf) &&
        String(x.cliente_cod) === String(n.codigo_cliente) &&
        (!tipo || String(x.tipo_nf || '') === tipo));
      if (!t.length) {
        // Nota que o extrator nem coleta não está "esperando aprovação": ela
        // nunca vai chegar à fila, e dizer o contrário manda o financeiro
        // procurar numa tela onde ela não está.
        const coletavel = naturezaEntra(n) && String(n.cancelada || '').toLowerCase() !== 'sim';
        motivos.push(coletavel
          ? 'não virou título: está na fila (ou fora da última extração), esperando "Aprovar selecionadas"'
          : 'não virou título e nunca vai: o extrator não coleta esta nota');
      } else {
        t.forEach(x => {
          console.log('   título ' + x.id + ' status ' + x.status + ' venc ' + x.data_vencimento +
            ' antecipado ' + x.antecipado + ' ' + (x.situacao_antec || '') + ' op ' + (x.operacao_id || '—'));
          if (x.status === 'CANCELADO') motivos.push('título CANCELADO');
          else if (x.status === 'RECEBIDO') motivos.push('título já RECEBIDO — só entra em borderô o que está em aberto');
          else if (String(x.antecipado).toUpperCase() === 'SIM') {
            motivos.push('já antecipado na operação ' + (x.operacao_id || '?') +
              (x.situacao_antec === 'RECOMPRADO'
                ? ' e RECOMPRADO — o filtro da aba não devolve título recomprado para a lista'
                : ''));
          } else if (!x.data_vencimento) motivos.push('título sem vencimento');
          else if (x.data_vencimento <= hoje) {
            motivos.push('vencimento ' + x.data_vencimento + ' já passou (hoje ' + hoje +
              ') — vencido não é antecipável');
          }
        });
      }
    }

    console.log(motivos.length
      ? '   ⇒ ' + motivos.join('\n   ⇒ ')
      : '   ⇒ nada barra esta nota: deveria aparecer em Antecipar (confira os filtros de cliente/data da tela)');
    console.log('');
  });
})().catch(e => { console.error('Erro: ' + (e.code || '') + ' ' + e.message); process.exitCode = 1; });
