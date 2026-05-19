const { Client } = require('./apps/backend/node_modules/pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = 'postgresql://postgres:QddVqogSJPlPVqTmxpkEmrKHKhiviFFX@tramway.proxy.rlwy.net:16466/railway';

async function run() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node run-migration.js <sql-file>');
    process.exit(1);
  }

  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('Connected to Railway DB');
    const result = await client.query(sql);
    const rows = Array.isArray(result) ? result : [result];
    rows.forEach(r => {
      if (r.rows?.length) {
        console.table(r.rows);
      }
    });
    console.log('\nMigration completed successfully.');
  } catch (err) {
    console.error('Migration FAILED:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
