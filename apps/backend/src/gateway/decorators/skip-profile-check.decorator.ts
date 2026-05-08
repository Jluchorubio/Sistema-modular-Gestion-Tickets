import { SetMetadata } from '@nestjs/common';

export const SKIP_PROFILE_CHECK_KEY = 'skip_profile_check';
export const SkipProfileCheck = () => SetMetadata(SKIP_PROFILE_CHECK_KEY, true);
