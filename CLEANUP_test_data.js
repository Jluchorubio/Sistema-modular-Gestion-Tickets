/**
 * CLEANUP_test_data.js
 * Borra todos los registros de prueba del sistema manteniendo:
 *   - 3 módulos por defecto (Helpdesk, Inventario, Gestión Administrativa)
 *   - 1 cuenta superadmin
 *   - Semillas de config (SLA rules, priority rules, request_type_config)
 *   - Datos de org (headquarters, departments, areas, positions)
 *   - Datos de empresa (organizations)
 *
 * Uso: node CLEANUP_test_data.js
 */

const { Client } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:QddVqogSJPlPVqTmxpkEmrKHKhiviFFX@tramway.proxy.rlwy.net:16466/railway';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado a Railway DB');

  try {
    await client.query('BEGIN');

    /* ── 1. Solicitudes y su historial ── */
    const { rowCount: tl } = await client.query(`DELETE FROM requests.request_timeline`);
    console.log(`  request_timeline eliminados: ${tl}`);

    const { rowCount: ar } = await client.query(`DELETE FROM requests.admin_requests`);
    console.log(`  admin_requests eliminados: ${ar}`);

    /* ── 2. Tickets (helpdesk) ── */
    const { rowCount: tc } = await client.query(`DELETE FROM tickets.comments`).catch(() => ({ rowCount: 0 }));
    const { rowCount: ta } = await client.query(`DELETE FROM tickets.attachments`).catch(() => ({ rowCount: 0 }));
    const { rowCount: tt } = await client.query(`DELETE FROM tickets.tickets`).catch(() => ({ rowCount: 0 }));
    console.log(`  tickets eliminados: ${tt} (${tc} comentarios, ${ta} adjuntos)`);

    /* ── 3. Inventario ── */
    const { rowCount: inv } = await client.query(`DELETE FROM inventory.items`).catch(() => ({ rowCount: 0 }));
    console.log(`  inventory.items eliminados: ${inv}`);

    /* ── 4. Módulos asignados a usuarios + roles de módulos de usuarios ──
       Conservar los roles propios de cada módulo (module_roles), solo borrar asignaciones de usuarios */
    const { rowCount: umr } = await client.query(`DELETE FROM modules.user_module_roles`).catch(() => ({ rowCount: 0 }));
    console.log(`  user_module_roles eliminados: ${umr}`);

    /* ── 5. Notificaciones ── */
    await client.query(`DELETE FROM notifications.notifications`).catch(() => {});

    /* ── 6. Usuarios — conservar superadmin ──
       El superadmin se identifica por global_role en config.global_roles name='superadmin'
       o por tener is_superadmin = TRUE en profiles, según schema actual */

    // Buscar el global_role_id de superadmin
    const { rows: sroles } = await client.query(
      `SELECT id FROM config.global_roles WHERE name ILIKE 'superadmin' LIMIT 1`
    );
    const superadminRoleId = sroles[0]?.id ?? null;
    console.log(`  superadmin role_id: ${superadminRoleId}`);

    // Identificar usuario superadmin (el que tiene ese global_role_id)
    let superadminProfileId = null;
    if (superadminRoleId) {
      const { rows: sadmins } = await client.query(
        `SELECT id FROM users.profiles WHERE global_role_id = $1 LIMIT 1`,
        [superadminRoleId]
      );
      superadminProfileId = sadmins[0]?.id ?? null;
    }
    console.log(`  superadmin profile_id: ${superadminProfileId}`);

    if (!superadminProfileId) {
      throw new Error('No se encontró cuenta superadmin. Abortando para no borrar todos los usuarios.');
    }

    // Borrar auth.credentials de usuarios que no son superadmin
    const { rowCount: creds } = await client.query(
      `DELETE FROM auth.credentials WHERE user_id != $1`,
      [superadminProfileId]
    );
    console.log(`  auth.credentials eliminados: ${creds}`);

    // Borrar profiles que no son superadmin
    const { rowCount: profiles } = await client.query(
      `DELETE FROM users.profiles WHERE id != $1`,
      [superadminProfileId]
    );
    console.log(`  users.profiles eliminados: ${profiles}`);

    /* ── 7. Conservar los 3 módulos por defecto, borrar el resto ──
       Los módulos por defecto son aquellos con is_built_in = TRUE o por nombre */
    const { rowCount: mods } = await client.query(
      `DELETE FROM modules.modules
       WHERE is_built_in IS NOT TRUE
         AND name NOT ILIKE '%helpdesk%'
         AND name NOT ILIKE '%inventario%'
         AND name NOT ILIKE '%gesti%'`
    ).catch(async () => {
      // Fallback: intentar por nombre directamente
      return client.query(
        `DELETE FROM modules.modules
         WHERE name NOT ILIKE '%helpdesk%'
           AND name NOT ILIKE '%inventario%'
           AND name NOT ILIKE '%gesti%'`
      );
    });
    console.log(`  módulos no-default eliminados: ${mods}`);

    await client.query('COMMIT');
    console.log('\nLimpieza completada.');

    /* ── Resumen final ── */
    const counts = await client.query(`
      SELECT
        (SELECT count(*) FROM users.profiles)            AS profiles,
        (SELECT count(*) FROM modules.modules)           AS modules,
        (SELECT count(*) FROM requests.admin_requests)   AS requests,
        (SELECT count(*) FROM config.request_type_config) AS req_types,
        (SELECT count(*) FROM config.sla_rules)          AS sla_rules
    `);
    console.log('\nEstado actual:');
    console.log('  profiles:', counts.rows[0].profiles);
    console.log('  modules:', counts.rows[0].modules);
    console.log('  requests:', counts.rows[0].requests);
    console.log('  request_type_config:', counts.rows[0].req_types);
    console.log('  sla_rules:', counts.rows[0].sla_rules);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR — rollback aplicado:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
