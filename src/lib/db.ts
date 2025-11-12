// lib/db.ts
import mysql from 'mysql2/promise';

const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT ? Number(MYSQL_PORT) : 3306,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

if (process.env.NODE_ENV !== 'production') {
  (globalThis as any).__mysqlPool = pool;
}

export default pool;
