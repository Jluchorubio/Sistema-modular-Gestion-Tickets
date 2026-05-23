/**
 * Seed empresarial — datos de prueba realistas
 * Run: node seed_empresa.js
 * Idempotente: usa ON CONFLICT DO NOTHING / IF NOT EXISTS
 */
const { Client } = require('./apps/backend/node_modules/pg');
const bcrypt      = require('./apps/backend/node_modules/bcrypt');
const { randomUUID } = require('crypto');

const DB = 'postgresql://postgres:QddVqogSJPlPVqTmxpkEmrKHKhiviFFX@tramway.proxy.rlwy.net:16466/railway';

// ─── IDs fijos para referenciar entre tablas ──────────────────────────────────

const IDS = {
  // Módulos
  MOD_HELPDESK:    '65376f35-7953-44c0-9b98-047488b12995', // ya existe
  MOD_INVENTARIO:  'efc744ae-fe62-49cd-ad75-ae531ce841fd', // ya existe
  MOD_SOPORTE:     '61e1d3fb-f3fa-4efe-b57f-fd1d731b4088',
  MOD_ADMIN:       'f8b6399a-dd2e-4a7d-a2e2-4642870a1e50',

  // Global roles
  ROLE_USUARIO:    'a9d0f54b-c179-4164-8595-23ef61019021',
  ROLE_SUPERADMIN: 'ff8a2259-9101-47bd-8f69-b10a09b610f8',

  // Users existentes
  SUPERADMIN_ID:   '284b8a9a-469e-4ac1-87b0-1a406bc76f2d',
};

// ─── Usuarios fake ────────────────────────────────────────────────────────────

const USERS = [
  // Admins de módulo
  { id: randomUUID(), firstName: 'Carlos',    lastName: 'Mendoza',  username: 'carlos.mendoza',  email: 'carlos.mendoza@empresa.co',  sede: 'Sede Principal', dept: 'Sistemas',      job: 'Admin Helpdesk',    role: 'usuario' },
  { id: randomUUID(), firstName: 'Laura',     lastName: 'Vargas',   username: 'laura.vargas',    email: 'laura.vargas@empresa.co',    sede: 'Sede Norte',     dept: 'Inventario',    job: 'Admin Inventario',  role: 'usuario' },
  // Jefes técnicos
  { id: randomUUID(), firstName: 'Miguel',    lastName: 'Torres',   username: 'miguel.torres',   email: 'miguel.torres@empresa.co',   sede: 'Sede Principal', dept: 'Sistemas',      job: 'Jefe Técnico TI',   role: 'usuario' },
  { id: randomUUID(), firstName: 'Valentina', lastName: 'Rios',     username: 'valentina.rios',  email: 'valentina.rios@empresa.co',  sede: 'Sede Sur',       dept: 'Soporte',       job: 'Jefe de Soporte',   role: 'usuario' },
  // Técnicos
  { id: randomUUID(), firstName: 'Diego',     lastName: 'Herrera',  username: 'diego.herrera',   email: 'diego.herrera@empresa.co',   sede: 'Sede Principal', dept: 'Sistemas',      job: 'Técnico TI',        role: 'usuario' },
  { id: randomUUID(), firstName: 'Juliana',   lastName: 'Mora',     username: 'juliana.mora',    email: 'juliana.mora@empresa.co',    sede: 'Centro Operativo', dept: 'Soporte',   job: 'Técnico Soporte',   role: 'usuario' },
  { id: randomUUID(), firstName: 'Sebastián', lastName: 'Castro',   username: 'sebastian.castro',email: 'sebastian.castro@empresa.co',sede: 'Sede Norte',     dept: 'Sistemas',      job: 'Técnico Redes',     role: 'usuario' },
  // Usuarios normales
  { id: randomUUID(), firstName: 'Camila',    lastName: 'Pérez',    username: 'camila.perez',    email: 'camila.perez@empresa.co',    sede: 'Sede Principal', dept: 'Administrativo',job: 'Asistente Admin',   role: 'usuario' },
  { id: randomUUID(), firstName: 'Andrés',    lastName: 'Gómez',    username: 'andres.gomez',    email: 'andres.gomez@empresa.co',    sede: 'Sede Sur',       dept: 'Administrativo',job: 'Coordinador',       role: 'usuario' },
  { id: randomUUID(), firstName: 'Natalia',   lastName: 'López',    username: 'natalia.lopez',   email: 'natalia.lopez@empresa.co',   sede: 'Centro Operativo', dept: 'Sistemas',  job: 'Analista TI',       role: 'usuario' },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log('✓ Conectado a Railway DB');

  const pwHash = await bcrypt.hash('Password123!', 12);
  console.log('✓ Password hash generado');

  // ── 1. Fix módulos existentes ──────────────────────────────────────────────
  await client.query(`UPDATE modules.modules SET type = 'inventory' WHERE id = $1`, [IDS.MOD_INVENTARIO]);
  await client.query(`UPDATE modules.modules SET deleted_at = now() WHERE name = 'tdfyghijkl'`);
  console.log('✓ Módulos existentes corregidos');

  // ── 2. Insertar módulos nuevos ─────────────────────────────────────────────
  const newModules = [
    { id: IDS.MOD_SOPORTE, name: 'Soporte Técnico',      slug: 'soporte',     type: 'support',        description: 'Centro de soporte técnico y atención a incidentes.' },
    { id: IDS.MOD_ADMIN,   name: 'Gestión Administrativa',slug: 'gestion-adm', type: 'administrative', description: 'Solicitudes administrativas, cambios de rol y acceso a módulos.' },
  ];
  for (const m of newModules) {
    await client.query(
      `INSERT INTO modules.modules (id, name, slug, type, description, is_active, color)
       VALUES ($1,$2,$3,$4,$5,true,'#6366F1')
       ON CONFLICT DO NOTHING`,
      [m.id, m.name, m.slug, m.type, m.description],
    );
  }
  console.log('✓ Módulos nuevos creados');

  // ── 3. Locations (sedes) por módulo ──────────────────────────────────────
  const SEDES = ['Sede Principal', 'Sede Norte', 'Sede Sur', 'Centro Operativo'];
  const SEDE_ADDRESSES = [
    'Av. El Dorado #68B-85, Bogotá',
    'Calle 80 #45-23, Bogotá Norte',
    'Carrera 30 #12-67, Bogotá Sur',
    'Cra 7 #32-16, Centro, Bogotá',
  ];
  const ALL_MODULES = [IDS.MOD_HELPDESK, IDS.MOD_INVENTARIO, IDS.MOD_SOPORTE, IDS.MOD_ADMIN];
  const locationMap = {}; // module_id → { sede_name → location_id }

  for (const modId of ALL_MODULES) {
    locationMap[modId] = {};
    // Check existing locations
    const existing = await client.query(`SELECT id, name FROM modules.locations WHERE module_id = $1 AND deleted_at IS NULL`, [modId]);
    const existingNames = new Set(existing.rows.map(r => r.name));
    existing.rows.forEach(r => { locationMap[modId][r.name] = r.id; });

    for (let i = 0; i < SEDES.length; i++) {
      const sedeName = SEDES[i];
      if (existingNames.has(sedeName)) continue;
      const locId = randomUUID();
      await client.query(
        `INSERT INTO modules.locations (id, module_id, name, address) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [locId, modId, sedeName, SEDE_ADDRESSES[i]],
      );
      locationMap[modId][sedeName] = locId;
    }
  }
  console.log('✓ Locations (sedes) creadas');

  // ── 4. Environments por location ──────────────────────────────────────────
  const ENV_NAMES = {
    [IDS.MOD_HELPDESK]:   ['Oficina Central', 'Laboratorio TI',     'Sala de Servidores'],
    [IDS.MOD_INVENTARIO]: ['Bodega Principal', 'Almacén Norte',      'Sala de Stock'],
    [IDS.MOD_SOPORTE]:    ['Mesa de Ayuda',    'Escritorio Remoto',  'Centro de Control'],
    [IDS.MOD_ADMIN]:      ['Recepción',        'Área Administrativa','Sala de Reuniones'],
  };

  for (const modId of ALL_MODULES) {
    const envNames = ENV_NAMES[modId];
    for (const sedeName of SEDES) {
      const locId = locationMap[modId][sedeName];
      if (!locId) continue;
      const existing = await client.query(`SELECT name FROM modules.environments WHERE location_id = $1 AND module_id = $2`, [locId, modId]);
      const existingNames = new Set(existing.rows.map(r => r.name));
      for (const envName of envNames) {
        if (existingNames.has(envName)) continue;
        await client.query(
          `INSERT INTO modules.environments (id, location_id, module_id, name) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [randomUUID(), locId, modId, envName],
        );
      }
    }
  }
  console.log('✓ Environments creados');

  // ── 5. Categories por módulo ──────────────────────────────────────────────
  const CATEGORIES = {
    [IDS.MOD_HELPDESK]:   ['Hardware', 'Software', 'Red y Conectividad', 'Acceso y Cuentas', 'Impresoras y Periféricos'],
    [IDS.MOD_INVENTARIO]: ['Equipos de Cómputo', 'Periféricos', 'Mobiliario', 'Consumibles', 'Licencias'],
    [IDS.MOD_SOPORTE]:    ['Incidentes', 'Cambios', 'Solicitudes de Servicio', 'Problemas', 'Consultas'],
    [IDS.MOD_ADMIN]:      ['Cambio de Rol', 'Acceso a Módulo', 'Corrección de Datos', 'Cambio de Sede', 'Permisos Especiales'],
  };

  for (const modId of ALL_MODULES) {
    const cats = CATEGORIES[modId];
    const existing = await client.query(`SELECT name FROM modules.categories WHERE module_id = $1 AND deleted_at IS NULL`, [modId]);
    const existingNames = new Set(existing.rows.map(r => r.name));
    for (const catName of cats) {
      if (existingNames.has(catName)) continue;
      await client.query(
        `INSERT INTO modules.categories (id, module_id, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [randomUUID(), modId, catName],
      );
    }
  }
  console.log('✓ Categorías creadas');

  // ── 6. Module roles por módulo ─────────────────────────────────────────────
  const MODULE_ROLE_NAMES = ['admin_modulo', 'jefe_tecnico', 'tecnico', 'usuario'];
  const MODULE_ROLE_DESCS = {
    admin_modulo: 'Administrador del módulo con acceso total.',
    jefe_tecnico: 'Jefe técnico que supervisa operaciones.',
    tecnico:      'Técnico operativo del módulo.',
    usuario:      'Usuario con acceso de consulta.',
  };
  const moduleRoleMap = {}; // module_id → { role_name → role_id }

  for (const modId of ALL_MODULES) {
    moduleRoleMap[modId] = {};
    const existing = await client.query(`SELECT id, name FROM modules.module_roles WHERE module_id = $1 AND is_active = true`, [modId]);
    existing.rows.forEach(r => { moduleRoleMap[modId][r.name] = r.id; });
    const existingNames = new Set(existing.rows.map(r => r.name));

    for (const roleName of MODULE_ROLE_NAMES) {
      if (existingNames.has(roleName)) continue;
      const roleId = randomUUID();
      await client.query(
        `INSERT INTO modules.module_roles (id, module_id, name, description) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [roleId, modId, roleName, MODULE_ROLE_DESCS[roleName]],
      );
      moduleRoleMap[modId][roleName] = roleId;
    }
  }
  console.log('✓ Module roles creados');

  // ── 7. Workflow + States + Transitions + SLA por módulo de tickets ─────────
  const TICKET_MODULES = [IDS.MOD_HELPDESK, IDS.MOD_INVENTARIO, IDS.MOD_SOPORTE];

  for (const modId of TICKET_MODULES) {
    // Check existing workflow
    const existingWf = await client.query(`SELECT id FROM tickets.workflow_versions WHERE module_id = $1 AND is_active = true`, [modId]);
    let wfId;

    if (existingWf.rows.length > 0) {
      wfId = existingWf.rows[0].id;
    } else {
      wfId = randomUUID();
      await client.query(
        `INSERT INTO tickets.workflow_versions (id, module_id, version, description, is_active) VALUES ($1,$2,1,'Workflow inicial',true)`,
        [wfId, modId],
      );
    }

    // States
    const statesDef = [
      { name: 'abierto',     label: 'Abierto',     isInitial: true,  isFinal: false },
      { name: 'en_proceso',  label: 'En Proceso',  isInitial: false, isFinal: false },
      { name: 'resuelto',    label: 'Resuelto',    isInitial: false, isFinal: false },
      { name: 'cerrado',     label: 'Cerrado',     isInitial: false, isFinal: true  },
      { name: 'rechazado',   label: 'Rechazado',   isInitial: false, isFinal: true  },
    ];

    const existingStates = await client.query(`SELECT id, name FROM tickets.states WHERE module_id = $1 AND is_active = true`, [modId]);
    const stateMap = {};
    existingStates.rows.forEach(r => { stateMap[r.name] = r.id; });

    for (const sd of statesDef) {
      if (!stateMap[sd.name]) {
        const sid = randomUUID();
        await client.query(
          `INSERT INTO tickets.states (id, workflow_version_id, module_id, name, label, is_initial, is_final) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [sid, wfId, modId, sd.name, sd.label, sd.isInitial, sd.isFinal],
        );
        stateMap[sd.name] = sid;
      }
    }

    // Transitions
    const transitionsDef = [
      { from: 'abierto',    to: 'en_proceso', name: 'Tomar ticket'   },
      { from: 'en_proceso', to: 'resuelto',   name: 'Marcar resuelto'},
      { from: 'resuelto',   to: 'cerrado',    name: 'Cerrar'         },
      { from: 'en_proceso', to: 'rechazado',  name: 'Rechazar'       },
      { from: 'resuelto',   to: 'en_proceso', name: 'Reabrir'        },
    ];

    for (const td of transitionsDef) {
      const fromId = stateMap[td.from];
      const toId   = stateMap[td.to];
      if (!fromId || !toId) continue;
      await client.query(
        `INSERT INTO tickets.transitions (id, workflow_version_id, module_id, from_state_id, to_state_id, name)
         SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS (
           SELECT 1 FROM tickets.transitions WHERE workflow_version_id=$2 AND from_state_id=$4 AND to_state_id=$5
         )`,
        [randomUUID(), wfId, modId, fromId, toId, td.name],
      );
    }

    // SLA Policy
    const existingSla = await client.query(`SELECT id FROM tickets.sla_policies WHERE module_id = $1 AND is_active = true`, [modId]);
    if (existingSla.rows.length === 0) {
      const policyId = randomUUID();
      await client.query(
        `INSERT INTO tickets.sla_policies (id, module_id, name, description, version, is_active) VALUES ($1,$2,'SLA Estándar','Política SLA por defecto',1,true)`,
        [policyId, modId],
      );
      // SLA rules by priority
      const slaRules = [
        { priority: 'critica', hours: 4  },
        { priority: 'alta',    hours: 8  },
        { priority: 'media',   hours: 24 },
        { priority: 'baja',    hours: 72 },
      ];
      for (let i = 0; i < slaRules.length; i++) {
        const r = slaRules[i];
        await client.query(
          `INSERT INTO tickets.sla_rules (id, policy_id, priority_result, resolution_time_hours, rule_order) VALUES ($1,$2,$3,$4,$5)`,
          [randomUUID(), policyId, r.priority, r.hours, i + 1],
        );
      }
    }
  }
  console.log('✓ Workflow + States + Transitions + SLA creados');

  // ── 8. Crear usuarios fake (idempotente — usa IDs reales de DB) ──────────────
  const resolvedUsers = [];
  for (const u of USERS) {
    const existingCred = await client.query(`SELECT c.user_id FROM auth.credentials c WHERE c.email = $1`, [u.email]);
    if (existingCred.rows.length > 0) {
      resolvedUsers.push({ ...u, id: existingCred.rows[0].user_id });
      continue;
    }

    await client.query(
      `INSERT INTO users.profiles (id, first_name, last_name, username, display_email, phone,
        job_title, department, primary_sede, profile_complete, is_active, global_role_id,
        country, state_province, city)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true,$10,'Colombia','Cundinamarca','Bogotá')
       ON CONFLICT DO NOTHING`,
      [u.id, u.firstName, u.lastName, u.username, u.email, '+57 300 ' + Math.floor(1000000 + Math.random() * 9000000),
       u.job, u.dept, u.sede, IDS.ROLE_USUARIO],
    );
    await client.query(
      `INSERT INTO auth.credentials (id, user_id, email, password_hash, is_active, failed_login_attempts, force_password_change, otp_enabled)
       VALUES ($1,$2,$3,$4,true,0,false,true)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), u.id, u.email, pwHash],
    );
    resolvedUsers.push(u);
  }
  console.log('✓ Usuarios fake resueltos:', resolvedUsers.map(u => u.username).join(', '));

  // ── 9. Asignar usuarios a módulos con roles ────────────────────────────────
  const assignUser = async (userId, modId, roleName) => {
    const roleId = moduleRoleMap[modId]?.[roleName];
    if (!roleId) return;
    await client.query(
      `INSERT INTO modules.user_module_roles (id, user_id, module_id, role_id, assigned_by, is_active)
       SELECT $1,$2,$3,$4,$5,true WHERE NOT EXISTS (
         SELECT 1 FROM modules.user_module_roles WHERE user_id=$2 AND module_id=$3 AND role_id=$4 AND is_active=true
       )`,
      [randomUUID(), userId, modId, roleId, IDS.SUPERADMIN_ID],
    );
  };

  const [carlos, laura, miguel, valentina, diego, juliana, sebastian, camila, andres, natalia] = resolvedUsers;

  // Helpdesk
  await assignUser(carlos.id,    IDS.MOD_HELPDESK, 'admin_modulo');
  await assignUser(miguel.id,    IDS.MOD_HELPDESK, 'jefe_tecnico');
  await assignUser(diego.id,     IDS.MOD_HELPDESK, 'tecnico');
  await assignUser(sebastian.id, IDS.MOD_HELPDESK, 'tecnico');
  await assignUser(natalia.id,   IDS.MOD_HELPDESK, 'usuario');

  // Inventario
  await assignUser(laura.id,     IDS.MOD_INVENTARIO, 'admin_modulo');
  await assignUser(diego.id,     IDS.MOD_INVENTARIO, 'tecnico');
  await assignUser(camila.id,    IDS.MOD_INVENTARIO, 'usuario');

  // Soporte
  await assignUser(valentina.id, IDS.MOD_SOPORTE, 'admin_modulo');
  await assignUser(juliana.id,   IDS.MOD_SOPORTE, 'jefe_tecnico');
  await assignUser(diego.id,     IDS.MOD_SOPORTE, 'tecnico');
  await assignUser(andres.id,    IDS.MOD_SOPORTE, 'usuario');

  // Gestión Administrativa
  await assignUser(miguel.id,    IDS.MOD_ADMIN, 'admin_modulo');
  await assignUser(camila.id,    IDS.MOD_ADMIN, 'usuario');
  await assignUser(natalia.id,   IDS.MOD_ADMIN, 'usuario');

  console.log('✓ Usuarios asignados a módulos');

  // ── 10. Sample admin_requests ─────────────────────────────────────────────
  const REQUEST_TYPES = ['module_access','role_change','info_correction','sede_change','permission_adjustment'];
  const REQUEST_STATUSES = ['pending','taken','in_progress','approved','rejected'];
  const PRIORITIES = ['baja','media','alta','critica'];
  const sampleUsers = resolvedUsers.slice(4); // técnicos y usuarios normales

  for (let i = 0; i < 8; i++) {
    const u = sampleUsers[i % sampleUsers.length];
    const type = REQUEST_TYPES[i % REQUEST_TYPES.length];
    const status = REQUEST_STATUSES[i % REQUEST_STATUSES.length];
    const priority = PRIORITIES[i % PRIORITIES.length];
    const isTaken = status !== 'pending';

    await client.query(
      `INSERT INTO requests.admin_requests
         (id, requester_id, type, title, description, status, priority, task_source,
          taken_at, sla_due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'user',$8,$9)
       ON CONFLICT DO NOTHING`,
      [
        randomUUID(), u.id, type,
        `Solicitud de ${type.replace(/_/g,' ')} #${i+1}`,
        `Descripción detallada de la solicitud número ${i+1} creada por ${u.firstName} ${u.lastName}.`,
        status, priority,
        isTaken ? new Date(Date.now() - 2 * 3600_000).toISOString() : null,
        isTaken ? new Date(Date.now() + 2 * 3600_000).toISOString() : null,
      ],
    );
  }
  console.log('✓ Solicitudes administrativas de muestra creadas');

  // ── 11. Sample tickets ────────────────────────────────────────────────────
  const ticketModulesList = [
    { modId: IDS.MOD_HELPDESK, stateName: 'abierto'    },
    { modId: IDS.MOD_HELPDESK, stateName: 'en_proceso'  },
    { modId: IDS.MOD_SOPORTE,  stateName: 'resuelto'    },
    { modId: IDS.MOD_SOPORTE,  stateName: 'cerrado'     },
  ];

  for (const { modId, stateName } of ticketModulesList) {
    const stateRow = await client.query(`SELECT id FROM tickets.states WHERE module_id=$1 AND name=$2 AND is_active=true`, [modId, stateName]);
    if (!stateRow.rows[0]) continue;
    const stateId = stateRow.rows[0].id;

    const wfRow = await client.query(`SELECT id FROM tickets.workflow_versions WHERE module_id=$1 AND is_active=true`, [modId]);
    if (!wfRow.rows[0]) continue;
    const wfId = wfRow.rows[0].id;

    // environment_id required — get first available env for this module
    const envRow = await client.query(`SELECT id FROM modules.environments WHERE module_id=$1 AND is_active=true LIMIT 1`, [modId]);
    if (!envRow.rows[0]) continue;
    const envId = envRow.rows[0].id;

    const catRow = await client.query(`SELECT id FROM modules.categories WHERE module_id=$1 AND is_active=true LIMIT 1`, [modId]);
    const catId = catRow.rows[0]?.id ?? null;

    const slaRow = await client.query(`SELECT id FROM tickets.sla_policies WHERE module_id=$1 AND is_active=true LIMIT 1`, [modId]);
    if (!slaRow.rows[0]) continue;
    const slaId = slaRow.rows[0].id;

    const u = sampleUsers[Math.floor(Math.random() * sampleUsers.length)];
    const daysAgo = Math.floor(Math.random() * 7) + 1;
    await client.query(
      `INSERT INTO tickets.tickets
         (id, module_id, workflow_version_id, current_state_id, environment_id, category_id,
          sla_policy_id, created_by, priority, title, description, version, reprocess_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'media'::priority_level,$9,$10,1,0,now()-($11||' days')::interval)
       ON CONFLICT DO NOTHING`,
      [
        randomUUID(), modId, wfId, stateId, envId, catId, slaId, u.id,
        'Ticket de prueba — ' + stateName.replace('_',' '),
        'Ticket de muestra generado por el seed empresarial.',
        daysAgo,
      ],
    );
  }
  console.log('✓ Tickets de muestra creados');

  await client.end();
  console.log('\n✅ Seed completado exitosamente');
  console.log('   Contraseña de todos los usuarios seed: Password123!');
  console.log('   Usuarios creados:', USERS.map(u => u.email).join(', '));
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
