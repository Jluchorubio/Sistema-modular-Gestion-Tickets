import { BadRequestException } from '@nestjs/common';

export interface PasswordPolicy {
  min_length:        number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_number:    boolean;
  require_special:   boolean;
  expiry_days:       number;
  totp_required:     boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  min_length:        8,
  require_uppercase: true,
  require_lowercase: true,
  require_number:    true,
  require_special:   false,
  expiry_days:       0,
  totp_required:     false,
};

export function enforcePasswordPolicy(password: string, policy: PasswordPolicy): void {
  if (password.length < policy.min_length)
    throw new BadRequestException(`La contraseña debe tener al menos ${policy.min_length} caracteres`);
  if (policy.require_uppercase && !/[A-Z]/.test(password))
    throw new BadRequestException('La contraseña debe contener al menos una letra mayúscula');
  if (policy.require_lowercase && !/[a-z]/.test(password))
    throw new BadRequestException('La contraseña debe contener al menos una letra minúscula');
  if (policy.require_number && !/[0-9]/.test(password))
    throw new BadRequestException('La contraseña debe contener al menos un número');
  if (policy.require_special && !/[^A-Za-z0-9]/.test(password))
    throw new BadRequestException('La contraseña debe contener al menos un carácter especial (!@#$%^&*…)');
}
