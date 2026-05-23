import { SetMetadata } from '@nestjs/common';
import { PERMISSION_KEY } from '../guards/permission.guard';

export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);
