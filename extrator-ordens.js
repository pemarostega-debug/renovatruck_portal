/**
 * Extrator de Ordens de Serviço: lê vw_ordens_servico no MySQL e envia para o
 * Apps Script (apps-script/ordens-servico.gs), que grava numa planilha
 * privada. Roda por cron na VPS — ver SETUP-ENV.md.
 *
 * Substitui o antigo exportar-dados.js, que escrevia um dados.json com
 * cliente, NF e valor de cada OS e dava git push nele direto no repositório
 * do portal — público, porque é o que faz o GitHub Pages servir o site.
 * Qualquer pessoa, sem precisar logar, conseguia baixar esse histórico
 * financeiro só abrindo a URL do repo no GitHub.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE
};

const ORDENS_API = process.env.ORDENS_API_URL;
const ORDENS_CHAVE_SERVICO = process.env.ORDENS_CHAVE_SERVICO;

async function postar(action, body) {
  const resposta = await fetch(ORDENS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action, token: ORDENS_CHAVE_SERVICO }, body))
  });
  const texto = await resposta.text();
  let d;
  try { d = JSON.parse(texto); }
  catch (e) { throw new Error('Resposta inesperada do Apps Script: ' + texto.slice(0, 200)); }
  if (!d.success) throw new Error(d.error || 'Falha desconhecida no Apps Script.');
  return d.data;
}

async function extrair() {
  const inicio = new Date();
  console.log('[' + inicio.toLocaleString('pt-BR') + '] Iniciando extração...');

  if (!ORDENS_API || !ORDENS_CHAVE_SERVICO) {
    console.error('Faltam ORDENS_API_URL e/ou ORDENS_CHAVE_SERVICO no .env. Veja SETUP-ENV.md.');
    process.exitCode = 1;
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection({ ...config, connectTimeout: 15000 });
    console.log('Conectado ao banco.');

    const [rows] = await connection.query(`
      SELECT
        id_ordem_servico,
        numero_os,
        num_os,
        codigo_cliente,
        razao_cliente,
        placa,
        descricao_fase,
        num_nf,
        valor_total,
        data,
        data_geracao,
        data_encerramento,
        encerrada,
        cancelada
      FROM vw_ordens_servico
    `);

    const geradoEm = new Date().toISOString();
    const resultado = await postar('ordens_sync', { ordens: rows, gerado_em: geradoEm });
    console.log(resultado.gravadas + ' registro(s) enviado(s) para o Apps Script.');

  } catch (error) {
    console.error('Falha na extração: ' + error.message + (error.code ? ' (' + error.code + ')' : ''));
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('→ Sem acesso ao banco. Confirme se está na rede do escritório/VPS.');
    }
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

extrair();
