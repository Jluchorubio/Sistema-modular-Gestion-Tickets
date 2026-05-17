const { Client } = require('./apps/backend/node_modules/pg');
const DB = 'postgresql://postgres:QddVqogSJPlPVqTmxpkEmrKHKhiviFFX@tramway.proxy.rlwy.net:16466/railway';

async function inspect() {
  const c = new Client({ connectionString: DB });
  await c.connect();

  // 1. Schemas
  const schemas = await c.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast','pg_toast_temp_1')
    ORDER BY schema_name
  `);
  console.log('\n=== SCHEMAS ===');
  schemas.rows.forEach(r => console.log(' ', r.schema_name));

  // 2. Tables per schema
  const tables = await c.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY table_schema, table_name
  `);
  console.log('\n=== TABLES ===');
  let lastSchema = '';
  tables.rows.forEach(r => {
    if (r.table_schema !== lastSchema) { console.log('\n [' + r.table_schema + ']'); lastSchema = r.table_schema; }
    console.log('   ', r.table_name);
  });

  // 3. Column audit — key tables
  const keyTables = [
    ['auth','credentials'],
    ['auth','sessions'],
    ['users','profiles'],
    ['modules','modules'],
    ['modules','locations'],
    ['requests','admin_requests'],
    ['requests','request_timeline'],
    ['config','global_roles'],
    ['tickets','tickets'],
    ['tickets','technician_profiles'],
    ['inventory','assets'],
  ];
  for (const [schema, table] of keyTables) {
    const cols = await c.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [schema, table]);
    if (cols.rows.length === 0) { console.log(`\n [${schema}.${table}] — NOT FOUND`); continue; }
    console.log(`\n=== ${schema}.${table} ===`);
    cols.rows.forEach(r => {
      const nullable = r.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const def = r.column_default ? ` DEFAULT ${r.column_default.substring(0,40)}` : '';
      console.log(`  ${r.column_name.padEnd(35)} ${r.data_type.padEnd(20)} ${nullable}${def}`);
    });
  }

  // 4. Triggers
  const triggers = await c.query(`
    SELECT trigger_schema, trigger_name, event_object_table, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE trigger_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY trigger_schema, event_object_table, trigger_name
  `);
  console.log('\n=== TRIGGERS ===');
  triggers.rows.forEach(r =>
    console.log(`  ${r.trigger_schema}.${r.event_object_table} | ${r.trigger_name} | ${r.action_timing} ${r.event_manipulation}`)
  );

  // 5. Functions/procedures (user-defined)
  const funcs = await c.query(`
    SELECT routine_schema, routine_name, routine_type
    FROM information_schema.routines
    WHERE routine_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY routine_schema, routine_name
  `);
  console.log('\n=== FUNCTIONS ===');
  funcs.rows.forEach(r => console.log(`  ${r.routine_schema}.${r.routine_name} (${r.routine_type})`));

  // 6. Enums
  const enums = await c.query(`
    SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    GROUP BY t.typname
    ORDER BY t.typname
  `);
  console.log('\n=== ENUMS ===');
  enums.rows.forEach(r => console.log(`  ${r.typname}: ${r.values}`));

  // 7. Row counts for key tables
  const countTables = [
    'modules.modules', 'modules.module_roles', 'modules.user_module_roles',
    'users.profiles', 'auth.credentials',
    'tickets.tickets', 'tickets.technician_profiles', 'tickets.workflow_versions',
    'requests.admin_requests', 'requests.request_timeline',
    'inventory.assets', 'config.global_roles',
    'notifications.notification_templates', 'notifications.notification_logs_2026_05',
    'audit.event_log_2026_05',
  ];
  console.log('\n=== ROW COUNTS ===');
  for (const t of countTables) {
    try {
      const r = await c.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`  ${t.padEnd(45)} ${r.rows[0].count}`);
    } catch(e) {
      console.log(`  ${t.padEnd(45)} ERROR: ${e.message.split('\n')[0]}`);
    }
  }

  // 8. Check deprecated tables exist
  const deprecated = [
    ['app','settings'],
    ['modules','config'],
    ['modules','assets'],
    ['modules','ticket_assets'],
    ['modules','technician_skills'],
  ];
  console.log('\n=== DEPRECATED TABLES CHECK ===');
  for (const [s, t] of deprecated) {
    const r = await c.query(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2`, [s, t]);
    console.log(`  ${s}.${t}: ${r.rows[0].count === '1' ? 'EXISTS' : 'NOT FOUND'}`);
  }

  // 9. Materialized views
  const mvs = await c.query(`
    SELECT schemaname, matviewname FROM pg_matviews ORDER BY schemaname, matviewname
  `);
  console.log('\n=== MATERIALIZED VIEWS ===');
  mvs.rows.forEach(r => console.log(`  ${r.schemaname}.${r.matviewname}`));

  // 10. RLS policies
  const rls = await c.query(`
    SELECT schemaname, tablename, policyname, cmd, qual
    FROM pg_policies
    ORDER BY schemaname, tablename
  `);
  console.log('\n=== RLS POLICIES ===');
  rls.rows.forEach(r => console.log(`  ${r.schemaname}.${r.tablename} | ${r.policyname} | ${r.cmd}`));

  await c.end();
}

inspect().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
