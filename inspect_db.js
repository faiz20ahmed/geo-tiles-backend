import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

async function inspectDatabase(connectionString, label) {
  try {
    const isLocal = connectionString.includes("localhost");

    const pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false }
    });

    console.log(`\n==============================`);
    console.log(`📦 Inspecting ${label} Database`);
    console.log(`==============================`);

    const tablesRes = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public';
    `);

    if (tablesRes.rows.length === 0) {
      console.log("❌ No tables found.");
      return;
    }

    for (const tableRow of tablesRes.rows) {
      const tableName = tableRow.tablename;

      console.log(`\n📊 TABLE: ${tableName}`);

      // عرض الأعمدة
      const columnsRes = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
      `, [tableName]);

      console.log("   Columns:");
      columnsRes.rows.forEach(col => {
        console.log(`    - ${col.column_name} (${col.data_type})`);
      });

      // عدد الصفوف
      const countRes = await pool.query(
        `SELECT COUNT(*) FROM ${tableName}`
      );

      console.log(`   Rows Count: ${countRes.rows[0].count}`);

      // عرض أول 5 صفوف
      const dataRes = await pool.query(
        `SELECT * FROM ${tableName} LIMIT 5`
      );

      console.log("   Sample Data:");
      console.table(dataRes.rows);
    }

    await pool.end();

  } catch (err) {
    console.error(`❌ Failed to inspect ${label}:`, err.message);
  }
}

(async () => {
  await inspectDatabase(process.env.DATABASE_URL_RAILWAY, "Railway");
  await inspectDatabase(process.env.DATABASE_URL_LOCAL, "Local");
})();