import { Injectable } from '@nestjs/common';

@Injectable()
export class SkillBasedStrategy {
  findBySkill(_categoryId: string, _availableTechnicianIds: string[]): string | null {
    return null;
  }
}
