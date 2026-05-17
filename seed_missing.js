/**
 * seed_missing.js — siembra datos faltantes en Railway
 * Cubre: technician_profiles, sla_conditions, notification_templates, inventory.assets
 * Idempotente: usa ON CONFLICT DO NOTHING / IF NOT EXISTS patterns
 */
const { Client } = require('./apps/backend/node_modules/pg');
const { randomUUID } = require('crypto');

const DB = process.env.DATABASE_URL ||
  'postgresql://postgres:QddVqogSJPlPVqTmxpkEmrKHKhiviFFX@tramway.proxy.rlwy.net:16466/railway';

async function main() {
  const c = new Client({ connectionString: DB });
  await c.connect();
  console.log('✓ Conectado');

  // ── Lookup helpers ──────────────────────────────────────────────────────────
  const moduleBySlug = async (slug) => {
    const r = await c.query('SELECT id FROM modules.modules WHERE slug=$1', [slug]);
    return r.rows[0]?.id ?? null;
  };

  const userByEmail = async (email) => {
    const r = await c.query('SELECT user_id FROM auth.credentials WHERE email=$1', [email]);
    return r.rows[0]?.user_id ?? null;
  };

  const getEnv = async (moduleId) => {
    const r = await c.query('SELECT id FROM modules.environments WHERE module_id=$1 AND is_active=true LIMIT 1', [moduleId]);
    return r.rows[0]?.id ?? null;
  };

  const getCat = async (moduleId) => {
    const r = await c.query('SELECT id FROM modules.categories WHERE module_id=$1 AND is_active=true LIMIT 1', [moduleId]);
    return r.rows[0]?.id ?? null;
  };

  // ── Módulos ─────────────────────────────────────────────────────────────────
  const MOD = {
    helpdesk:  await moduleBySlug('helpdesk'),
    inventario: await moduleBySlug('inventario'),
    soporte:   await moduleBySlug('soporte'),
    admin:     await moduleBySlug('gestion-administrativa') ?? await moduleBySlug('gestion-adm'),
  };
  console.log('✓ Módulos resueltos:', Object.entries(MOD).map(([k,v]) => `${k}=${v?.slice(0,8)}...`).join(', '));

  // ── 1. technician_profiles ──────────────────────────────────────────────────
  // Técnicos: diego (helpdesk+inventario+soporte), sebastian (helpdesk),
  //           miguel (helpdesk jefe_tec), juliana (soporte jefe_tec)
  const TECH_USERS = [
    { email: 'miguel.torres@empresa.co',   module: 'helpdesk',  type: 'generalist' },
    { email: 'diego.herrera@empresa.co',   module: 'helpdesk',  type: 'generalist' },
    { email: 'diego.herrera@empresa.co',   module: 'inventario',type: 'generalist' },
    { email: 'diego.herrera@empresa.co',   module: 'soporte',   type: 'generalist' },
    { email: 'sebastian.castro@empresa.co',module: 'helpdesk',  type: 'generalist' },
    { email: 'juliana.mora@empresa.co',    module: 'soporte',   type: 'generalist' },
  ];

  let techProfilesInserted = 0;
  for (const tu of TECH_USERS) {
    const userId = await userByEmail(tu.email);
    const moduleId = MOD[tu.module];
    if (!userId || !moduleId) {
      console.warn(`  ⚠ No se encontró usuario/módulo para ${tu.email} / ${tu.module}`);
      continue;
    }
    const r = await c.query(
      `INSERT INTO tickets.technician_profiles (id, user_id, module_id, technician_type, is_active)
       SELECT $1,$2,$3,$4,true
       WHERE NOT EXISTS (SELECT 1 FROM tickets.technician_profiles WHERE user_id=$2 AND module_id=$3)`,
      [randomUUID(), userId, moduleId, tu.type],
    );
    if (r.rowCount > 0) techProfilesInserted++;
  }
  console.log(`✓ technician_profiles: ${techProfilesInserted} insertados`);

  // ── 2. sla_conditions ───────────────────────────────────────────────────────
  // Reglas existentes por módulo: critica(4h), alta(8h), media(24h), baja(72h)
  // Condiciones lógica:
  //   Rule order 1 (critica): urgency = 'alta'
  //   Rule order 2 (alta):    urgency = 'media'
  //   Rule order 3 (media):   impact  = 'medio'
  //   Rule order 4 (baja):    sin condición → fallback siempre

  const slaRulesResult = await c.query(`
    SELECT sr.id, sr.priority_result, sr.rule_order, sp.module_id
    FROM tickets.sla_rules sr
    JOIN tickets.sla_policies sp ON sp.id = sr.policy_id
    WHERE sp.is_active = true
    ORDER BY sp.module_id, sr.rule_order
  `);

  let slaCondInserted = 0;
  const COND_MAP = {
    critica: { field: 'urgency', operator: '=', value: 'alta'  },
    alta:    { field: 'urgency', operator: '=', value: 'media' },
    media:   { field: 'impact',  operator: '=', value: 'medio' },
    baja:    null, // fallback — sin condición
  };

  for (const rule of slaRulesResult.rows) {
    const cond = COND_MAP[rule.priority_result];
    if (!cond) continue; // baja = fallback, no inserta condición

    // Verificar si ya tiene condiciones
    const existing = await c.query(
      'SELECT 1 FROM tickets.sla_conditions WHERE rule_id=$1 LIMIT 1',
      [rule.id]
    );
    if (existing.rows.length > 0) continue;

    await c.query(
      `INSERT INTO tickets.sla_conditions (id, rule_id, field, operator, value, logical_group, order_index)
       VALUES ($1,$2,$3,$4,$5,1,1)`,
      [randomUUID(), rule.id, cond.field, cond.operator, cond.value],
    );
    slaCondInserted++;
  }
  console.log(`✓ sla_conditions: ${slaCondInserted} insertadas`);

  // ── 3. notification_templates ───────────────────────────────────────────────
  // Verifica si la tabla tiene constraint único por event_type + channel
  const templates = [
    // Papelera — usadas por el backend Phase 6 (cleanup service)
    {
      event_type: 'trash_warning',
      channel: 'email',
      subject: 'Alerta: {{entity_count}} elemento(s) expiran en {{days_remaining}} día(s)',
      body: `Hola {{first_name}},\n\nEste es un recordatorio de que los siguientes elementos serán eliminados permanentemente en {{days_remaining}} día(s):\n\n{{entity_list}}\n\nSi deseas conservarlos, restaurarlos antes del {{expiry_date}}.\n\nSistema de Gestión`,
      variables: { first_name: 'string', entity_count: 'number', days_remaining: 'number', entity_list: 'string', expiry_date: 'string' },
    },
    {
      event_type: 'trash_warning',
      channel: 'in_app',
      subject: null,
      body: '{{entity_count}} elemento(s) serán eliminados permanentemente en {{days_remaining}} día(s). Restaura antes del {{expiry_date}}.',
      variables: { entity_count: 'number', days_remaining: 'number', expiry_date: 'string' },
    },
    // Tickets — asignación
    {
      event_type: 'ticket_assigned',
      channel: 'email',
      subject: 'Nuevo ticket asignado: {{ticket_title}}',
      body: `Hola {{first_name}},\n\nSe te ha asignado el ticket:\n\n• Título: {{ticket_title}}\n• Módulo: {{module_name}}\n• Prioridad: {{priority}}\n• SLA: {{sla_due_at}}\n\nAccede al sistema para gestionar el ticket.`,
      variables: { first_name: 'string', ticket_title: 'string', module_name: 'string', priority: 'string', sla_due_at: 'string' },
    },
    {
      event_type: 'ticket_assigned',
      channel: 'in_app',
      subject: null,
      body: 'Se te asignó el ticket "{{ticket_title}}" en {{module_name}} — Prioridad {{priority}}.',
      variables: { ticket_title: 'string', module_name: 'string', priority: 'string' },
    },
    // Tickets — cambio de estado
    {
      event_type: 'ticket_status_changed',
      channel: 'in_app',
      subject: null,
      body: 'Tu ticket "{{ticket_title}}" cambió de estado: {{old_status}} → {{new_status}}.',
      variables: { ticket_title: 'string', old_status: 'string', new_status: 'string' },
    },
    // Calificación de servicio
    {
      event_type: 'ticket_rating_request',
      channel: 'email',
      subject: 'Tu ticket fue resuelto — ¿Cómo fue la atención?',
      body: `Hola {{first_name}},\n\nTu ticket "{{ticket_title}}" fue resuelto por {{technician_name}}.\n\nTu opinión nos ayuda a mejorar. Tienes {{ttl_days}} días para calificar el servicio.\n\nCalificar ahora: {{rating_url}}\n\nGracias.`,
      variables: { first_name: 'string', ticket_title: 'string', technician_name: 'string', ttl_days: 'number', rating_url: 'string' },
    },
    {
      event_type: 'ticket_rating_request',
      channel: 'in_app',
      subject: null,
      body: '¿Cómo fue la atención en "{{ticket_title}}"? Califica el servicio ({{ttl_days}} días disponibles).',
      variables: { ticket_title: 'string', ttl_days: 'number' },
    },
    // Videollamadas
    {
      event_type: 'meeting_invitation',
      channel: 'email',
      subject: 'Invitación a reunión: {{ticket_title}}',
      body: `Hola {{first_name}},\n\nFuiste invitado a una reunión relacionada con el ticket "{{ticket_title}}":\n\n• Fecha: {{scheduled_at}}\n• Plataforma: {{provider}}\n• Enlace: {{meeting_url}}\n• Motivo: {{reason}}\n\nAccede desde el sistema o usa el enlace directo.`,
      variables: { first_name: 'string', ticket_title: 'string', scheduled_at: 'string', provider: 'string', meeting_url: 'string', reason: 'string' },
    },
    {
      event_type: 'meeting_invitation',
      channel: 'in_app',
      subject: null,
      body: 'Fuiste invitado a una reunión para el ticket "{{ticket_title}}" el {{scheduled_at}}.',
      variables: { ticket_title: 'string', scheduled_at: 'string' },
    },
    // Calendario
    {
      event_type: 'calendar_reminder',
      channel: 'in_app',
      subject: null,
      body: 'Recordatorio: "{{event_title}}" inicia en {{minutes_before}} minutos.',
      variables: { event_title: 'string', minutes_before: 'number' },
    },
    // Bienvenida
    {
      event_type: 'welcome_user',
      channel: 'email',
      subject: 'Bienvenido al sistema de gestión, {{first_name}}',
      body: `Hola {{first_name}},\n\nTu cuenta ha sido creada exitosamente.\n\n• Usuario: {{username}}\n• Correo: {{email}}\n• Contraseña temporal: {{temp_password}}\n\nTe recomendamos cambiar tu contraseña al ingresar por primera vez.\n\nEl equipo de soporte.`,
      variables: { first_name: 'string', username: 'string', email: 'string', temp_password: 'string' },
    },
    // Solicitudes administrativas
    {
      event_type: 'request_status_changed',
      channel: 'in_app',
      subject: null,
      body: 'Tu solicitud "{{request_title}}" cambió de estado: {{old_status}} → {{new_status}}.',
      variables: { request_title: 'string', old_status: 'string', new_status: 'string' },
    },
    {
      event_type: 'request_status_changed',
      channel: 'email',
      subject: 'Actualización en tu solicitud: {{request_title}}',
      body: `Hola {{first_name}},\n\nTu solicitud "{{request_title}}" fue actualizada:\n\nEstado anterior: {{old_status}}\nNuevo estado: {{new_status}}\n\n{{review_notes}}\n\nAccede al sistema para más detalles.`,
      variables: { first_name: 'string', request_title: 'string', old_status: 'string', new_status: 'string', review_notes: 'string' },
    },
  ];

  let tmplInserted = 0;
  for (const t of templates) {
    const exists = await c.query(
      `SELECT 1 FROM notifications.notification_templates
       WHERE event_type = $1 AND channel = $2::notification_channel`,
      [t.event_type, t.channel],
    );
    if (exists.rows.length > 0) continue;
    await c.query(
      `INSERT INTO notifications.notification_templates
         (id, event_type, channel, subject, template_body, variables, is_active)
       VALUES ($1, $2, $3::notification_channel, $4, $5, $6::jsonb, true)`,
      [randomUUID(), t.event_type, t.channel, t.subject, t.body, JSON.stringify(t.variables)],
    );
    tmplInserted++;
  }
  console.log(`✓ notification_templates: ${tmplInserted} insertadas`);

  // ── 4. inventory.assets (demo) ───────────────────────────────────────────────
  const invModId = MOD.inventario;
  const invEnvId = await getEnv(invModId);
  const invCatId = await getCat(invModId);

  if (!invModId || !invEnvId || !invCatId) {
    console.warn('  ⚠ Módulo inventario sin environment/category — saltando assets');
  } else {
    // Buscar categorías específicas del inventario
    const cats = await c.query(
      `SELECT id, name FROM modules.categories WHERE module_id=$1 AND is_active=true ORDER BY name`,
      [invModId]
    );
    const catMap = {};
    cats.rows.forEach(r => { catMap[r.name] = r.id; });

    const envs = await c.query(
      `SELECT me.id, me.name FROM modules.environments me
       JOIN modules.locations l ON l.id = me.location_id
       WHERE me.module_id=$1 AND me.is_active=true
       ORDER BY me.name LIMIT 5`,
      [invModId]
    );

    const ASSETS = [
      // Equipos de cómputo
      { name: 'Laptop Dell Latitude 5420',    cat: 'Equipos de Cómputo', serial: 'DELL-5420-001', specs: { marca: 'Dell', modelo: 'Latitude 5420', ram: '16GB', storage: '512GB SSD', os: 'Windows 11' }},
      { name: 'Laptop HP ProBook 450 G9',     cat: 'Equipos de Cómputo', serial: 'HP-450G9-002',  specs: { marca: 'HP', modelo: 'ProBook 450 G9', ram: '8GB', storage: '256GB SSD', os: 'Windows 11' }},
      { name: 'Desktop Lenovo ThinkCentre',   cat: 'Equipos de Cómputo', serial: 'LEN-TC-003',    specs: { marca: 'Lenovo', modelo: 'ThinkCentre M720', ram: '16GB', storage: '1TB HDD', os: 'Windows 10' }},
      { name: 'MacBook Pro M3 14"',           cat: 'Equipos de Cómputo', serial: 'APL-MBP-004',   specs: { marca: 'Apple', modelo: 'MacBook Pro M3', ram: '16GB', storage: '512GB SSD', os: 'macOS Sonoma' }},
      // Periféricos
      { name: 'Monitor LG 24" IPS',           cat: 'Periféricos', serial: 'LG-24IPS-005', specs: { marca: 'LG', pulgadas: 24, resolucion: '1920x1080', tipo: 'IPS' }},
      { name: 'Monitor Samsung 27" Curvo',    cat: 'Periféricos', serial: 'SAM-27C-006',  specs: { marca: 'Samsung', pulgadas: 27, resolucion: '2560x1440', tipo: 'Curvo' }},
      { name: 'Teclado Logitech MX Keys',     cat: 'Periféricos', serial: 'LOG-MX-007',   specs: { marca: 'Logitech', modelo: 'MX Keys', conexion: 'Bluetooth/USB' }},
      { name: 'Mouse Logitech M720',          cat: 'Periféricos', serial: 'LOG-M720-008', specs: { marca: 'Logitech', modelo: 'M720 Triathlon', conexion: 'Bluetooth' }},
      // Mobiliario
      { name: 'Escritorio modular gris',      cat: 'Mobiliario', serial: 'MUEBLE-001', specs: { material: 'MDF', ancho: '180cm', color: 'Gris' }},
      { name: 'Silla ergonómica Herman Miller', cat: 'Mobiliario', serial: 'SILLA-001', specs: { marca: 'Herman Miller', modelo: 'Aeron', talla: 'B' }},
      // Consumibles
      { name: 'Resma papel A4 x500',          cat: 'Consumibles', serial: null, specs: { unidades: 500, gramaje: '75gr' }},
      { name: 'Cartucho HP 664XL Negro',      cat: 'Consumibles', serial: null, specs: { marca: 'HP', modelo: '664XL', color: 'Negro', rendimiento: '480 páginas' }},
      // Licencias
      { name: 'Licencia Microsoft 365 E3',    cat: 'Licencias', serial: 'MS365-E3-CORP', specs: { tipo: 'Suscripción anual', usuarios: 25, apps: ['Word', 'Excel', 'Teams', 'OneDrive'] }},
      { name: 'Adobe Creative Cloud Team',    cat: 'Licencias', serial: 'ADO-CC-TEAM',   specs: { tipo: 'Suscripción anual', usuarios: 5, apps: ['Photoshop', 'Illustrator', 'Premiere'] }},
      { name: 'Antivirus Kaspersky Business', cat: 'Licencias', serial: 'KAS-BIZ-2026',  specs: { tipo: 'Licencia anual', dispositivos: 20, vencimiento: '2027-05-01' }},
    ];

    let assetsInserted = 0;
    const envId = envs.rows[0]?.id ?? invEnvId;

    for (const a of ASSETS) {
      const catId = catMap[a.cat] ?? invCatId;
      const existing = await c.query(
        'SELECT 1 FROM inventory.assets WHERE serial_number=$1 AND module_id=$2',
        [a.serial, invModId]
      );
      if (existing.rows.length > 0) continue;
      if (a.serial === null) {
        // consumibles sin serial — buscar por nombre
        const existingName = await c.query(
          'SELECT 1 FROM inventory.assets WHERE name=$1 AND module_id=$2',
          [a.name, invModId]
        );
        if (existingName.rows.length > 0) continue;
      }

      await c.query(
        `INSERT INTO inventory.assets
           (id, module_id, environment_id, category_id, name, description, specifications,
            qr_code, serial_number, status, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'disponible',1)`,
        [
          randomUUID(), invModId, envId, catId,
          a.name, `${a.name} — Activo de inventario`,
          JSON.stringify(a.specs),
          'QR-PENDING-' + randomUUID().slice(0, 8),  // trigger lo reescribe
          a.serial,
        ],
      );
      assetsInserted++;
    }
    console.log(`✓ inventory.assets: ${assetsInserted} activos insertados`);
  }

  // ── 5. config.module_settings faltantes ─────────────────────────────────────
  // TTL de calificaciones (para ticket_ratings.expires_at)
  const settingsToAdd = [
    { module_id: null, key: 'rating_ttl_days',    value: '7',    type: 'string', desc: 'Días disponibles para calificar un ticket cerrado' },
    { module_id: null, key: 'trash_warning_days', value: '7,3,1', type: 'string', desc: 'Días antes del hard-delete en que se envía aviso (CSV)' },
  ];
  let settingsInserted = 0;
  for (const s of settingsToAdd) {
    const exists = await c.query(
      `SELECT 1 FROM config.module_settings WHERE key = $1 AND module_id IS NOT DISTINCT FROM $2`,
      [s.key, s.module_id],
    );
    if (exists.rows.length > 0) continue;
    await c.query(
      `INSERT INTO config.module_settings (id, module_id, key, value, value_type, description, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [randomUUID(), s.module_id, s.key, s.value, s.type, s.desc],
    );
    settingsInserted++;
  }
  console.log(`✓ config.module_settings: ${settingsInserted} nuevas entradas`);

  await c.end();
  console.log('\n✅ seed_missing completado');
}

main().catch(e => { console.error('❌ Error:', e.message, e.detail || ''); process.exit(1); });
