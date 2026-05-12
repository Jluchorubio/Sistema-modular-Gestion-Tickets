import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:QddVqogSJPlPVqTmxpkEmrKHKhiviFFX@tramway.proxy.rlwy.net:16466/railway',
  ssl: { rejectUnauthorized: false },
});

await ds.initialize();

const ticketCols = await ds.query(
  `SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema='tickets' AND table_name='tickets'
   ORDER BY ordinal_position`
);
const auditCols = await ds.query(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='audit' AND table_name='event_log' ORDER BY ordinal_position`
);
const auditCount = await ds.query(`SELECT COUNT(*) as total FROM audit.event_log`);

console.log('TICKET_COLS:', JSON.stringify(ticketCols.map(c => c.column_name)));
console.log('AUDIT_COLS:', JSON.stringify(auditCols.map(c => c.column_name)));
console.log('AUDIT_COUNT:', JSON.stringify(auditCount));

await ds.destroy();
