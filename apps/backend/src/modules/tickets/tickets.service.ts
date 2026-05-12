import { Injectable } from '@nestjs/common';

@Injectable()
export class TicketsService {
  findAll()  { return []; }
  findOne()  { return null; }
  create()   { return null; }
  transition() { return null; }
}
