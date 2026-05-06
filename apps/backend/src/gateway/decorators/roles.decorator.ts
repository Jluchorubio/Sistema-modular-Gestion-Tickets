import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Roles permitidos: 'superadmin' | 'admin_modulo'
 * superadmin siempre pasa. admin_modulo requiere al menos un rol
 * admin_modulo activo en modules.user_module_roles.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
