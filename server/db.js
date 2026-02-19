const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'royalmind',
  password: 'babayaga 47',
  port: 5432,
});

module.exports = pool;
