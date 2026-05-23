export const MODULE_ROLES = {
  USUARIO: 'usuario',
  TECNICO: 'tecnico',
  JEFE_TECNICO: 'jefe_tecnico',
  ADMIN_MODULO: 'admin_modulo',
} as const;

export type ModuleRole = (typeof MODULE_ROLES)[keyof typeof MODULE_ROLES];

export const MODULE_ROLE_LABELS: Record<ModuleRole, string> = {
  usuario: 'Usuario',
  tecnico: 'Técnico',
  jefe_tecnico: 'Jefe Técnico',
  admin_modulo: 'Administrador de Módulo',
};

export const MODULE_ROLE_HIERARCHY: Record<ModuleRole, number> = {
  usuario: 1,
  tecnico: 2,
  jefe_tecnico: 3,
  admin_modulo: 4,
};

export function hasModuleRole(
  userRole: ModuleRole,
  requiredRole: ModuleRole,
): boolean {
  return MODULE_ROLE_HIERARCHY[userRole] >= MODULE_ROLE_HIERARCHY[requiredRole];
}

/** Roles with admin-level access (reports, module management) */
export const ADMIN_ROLES: ModuleRole[] = [MODULE_ROLES.ADMIN_MODULO, MODULE_ROLES.JEFE_TECNICO];

/** Roles that can be assigned technical work */
export const TECH_ROLES: ModuleRole[] = [MODULE_ROLES.JEFE_TECNICO, MODULE_ROLES.TECNICO];
