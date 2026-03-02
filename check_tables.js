import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

async function listTables(connectionString, label) {
  try {

    const isLocal = connectionString.includes("localhost");

    const pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false }
    });

    const res = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public';
    `);

    console.log(`\n📊 Tables in ${label}:`);

    if (res.rows.length === 0) {
      console.log("❌ No tables found.");
    } else {
      res.rows.forEach(row => console.log(" -", row.tablename));
    }

    await pool.end();

  } catch (err) {
    console.error(`❌ Failed to connect to ${label}:`, err.message);
  }
}

(async () => {
  await listTables(process.env.DATABASE_URL_RAILWAY, "Railway");
  await listTables(process.env.DATABASE_URL_LOCAL, "Local");
})();