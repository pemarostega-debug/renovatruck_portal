const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = __dirname;
const ARQUIVO = path.join(DIR, 'dados.json');

const config = require('./config.local.json');

const git = cmd => execSync('git ' + cmd, { cwd: DIR, stdio: 'pipe' }).toString().trim();

async function exportar() {
  const inicio = new Date();
  console.log('[' + inicio.toLocaleString('pt-BR') + '] Iniciando exportação...');

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

    const payload = {
      gerado_em: new Date().toISOString(),
      total: rows.length,
      ordens: rows
    };

    fs.writeFileSync(ARQUIVO, JSON.stringify(payload));
    const kb = (fs.statSync(ARQUIVO).size / 1024).toFixed(0);
    console.log(rows.length + ' registro(s) exportado(s) — ' + kb + ' KB.');

  } catch (error) {
    console.error('Falha na consulta ao banco: ' + error.message + ' (' + error.code + ')');
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('→ Sem acesso ao banco. Confirme se está na rede do escritório.');
    }
    process.exitCode = 1;
    return;
  } finally {
    if (connection) await connection.end();
  }

  // Publica no Netlify via git push.
  // Commita apenas dados.json para não arrastar edições em andamento.
  try {
    git('add dados.json');
    if (!git('status --porcelain dados.json')) {
      console.log('Dados inalterados — nada a publicar.');
      return;
    }
    git('commit -m "dados: atualização automática" -- dados.json');

    try {
      git('push');
    } catch (e) {
      // Remoto à frente: sincroniza e tenta de novo
      console.log('Push recusado, sincronizando com o remoto...');
      git('pull --rebase');
      git('push');
    }
    console.log('Publicado com sucesso.');
  } catch (error) {
    console.error('Falha ao publicar: ' + (error.stderr || error.stdout || error.message).toString().trim());
    process.exitCode = 1;
  }
}

exportar();
