const mysql = require('mysql2/promise');

exports.handler = async function (event, context) {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 10000
    });

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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows)
    };

  } catch (error) {
    console.error('Erro ao consultar vw_ordens_servico:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falha ao consultar o banco de dados.' })
    };
  } finally {
    if (connection) await connection.end();
  }
};
