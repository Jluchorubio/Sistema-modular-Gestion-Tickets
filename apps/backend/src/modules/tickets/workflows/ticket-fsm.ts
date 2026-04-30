export type TicketState =
  | 'open'
  | 'waiting'
  | 'in_progress'
  | 'done'
  | 'closed'
  | 'rework';

export type TicketEvent =
  | 'ASSIGN'
  | 'START'
  | 'COMPLETE'
  | 'APPROVE'
  | 'REJECT'
  | 'ESCALATE'
  | 'AUTO_CLOSE'
  | 'REOPEN';

type Transitions = Partial<Record<TicketState, Partial<Record<TicketEvent, TicketState>>>>;

const TRANSITIONS: Transitions = {
  open:        { ASSIGN: 'waiting' },
  waiting:     { START: 'in_progress' },
  in_progress: { COMPLETE: 'done' },
  done:        { APPROVE: 'closed', REJECT: 'rework', AUTO_CLOSE: 'closed', ESCALATE: 'in_progress' },
  rework:      { START: 'in_progress' },
  closed:      {},
};

export function transition(state: TicketState, event: TicketEvent): TicketState {
  const next = TRANSITIONS[state]?.[event];
  if (!next) throw new Error(`Invalid transition: ${state} + ${event}`);
  return next;
}

export function canTransition(state: TicketState, event: TicketEvent): boolean {
  return !!TRANSITIONS[state]?.[event];
}
