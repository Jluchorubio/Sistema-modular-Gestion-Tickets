'use client';

import { useMemo } from 'react';
import { toDateStr, WEEKDAYS_ES, type DayData } from './_types';
import styles from '../calendar.module.css';

export interface MonthGridProps {
  year:              number;
  month:             number;
  daysWithEvents:    Set<string>;
  daysWithSla:       Set<string>;
  daysWithMeetings:  Set<string>;
  daysWithCalEvents: Set<string>;
  eventsByDay:       Map<string, DayData>;
  selectedDay:       Date | null;
  hoveredDay:        Date | null;
  onDaySelect:       (d: Date) => void;
  onDayHover:        (d: Date | null) => void;
}

export function MonthGrid({
  year, month, daysWithEvents, daysWithSla, daysWithMeetings, daysWithCalEvents,
  eventsByDay, selectedDay, hoveredDay, onDaySelect, onDayHover,
}: MonthGridProps) {
  const todayStr    = toDateStr(new Date());
  const selectedStr = selectedDay ? toDateStr(selectedDay) : null;
  const hoveredStr  = hoveredDay  ? toDateStr(hoveredDay)  : null;

  const cells = useMemo(() => {
    const first    = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0).getDate();
    const startDow = first.getDay();
    const result: Array<{ date: Date; cur: boolean }> = [];

    for (let i = startDow - 1; i >= 0; i--)
      result.push({ date: new Date(year, month, -i), cur: false });
    for (let d = 1; d <= lastDate; d++)
      result.push({ date: new Date(year, month, d), cur: true });
    const rem = 42 - result.length;
    for (let d = 1; d <= rem; d++)
      result.push({ date: new Date(year, month + 1, d), cur: false });
    return result;
  }, [year, month]);

  return (
    <div className={styles.monthGrid}>
      <div className={styles.weekdayRow}>
        {WEEKDAYS_ES.map((d) => <span key={d} className={styles.weekdayLabel}>{d}</span>)}
      </div>
      <div className={styles.daysGrid}>
        {cells.map(({ date, cur }, i) => {
          const ds         = toDateStr(date);
          const isToday    = ds === todayStr;
          const isSelected = ds === selectedStr;
          const isHovered  = cur && ds === hoveredStr && !isSelected;
          const hasReqs    = daysWithEvents.has(ds);
          const hasSla     = daysWithSla.has(ds);
          const hasMeet    = daysWithMeetings.has(ds);
          const hasCalEvt  = daysWithCalEvents.has(ds);
          const data       = cur ? (eventsByDay.get(ds) ?? null) : null;
          const hasAny     = hasReqs || hasSla || hasMeet || hasCalEvt;

          let cls = styles.dayCell;
          if (!cur)            cls += ` ${styles.dayCellOther}`;
          else if (isSelected) cls += ` ${styles.dayCellSelected}`;
          else if (isToday)    cls += ` ${styles.dayCellToday}`;

          return (
            <div
              key={i}
              className={cls}
              style={isHovered && !isSelected ? { background: '#f0f4f8' } : undefined}
              onClick={() => cur && onDaySelect(date)}
              onMouseEnter={() => cur && onDayHover(date)}
              onMouseLeave={() => onDayHover(null)}
            >
              <span className={styles.dayNum}>{date.getDate()}</span>
              {!isSelected && hasAny && (
                <div className={styles.dotRow}>
                  {hasReqs   && <span className={styles.dotCoral} />}
                  {hasSla    && <span className={styles.dotSla}   />}
                  {hasMeet   && <span className={styles.dotMeet}  />}
                  {hasCalEvt && <span className={styles.dotCal}   />}
                </div>
              )}
              {isHovered && data && (data.reqs + data.sla + data.meet + data.cal) > 0 && (
                <div className={styles.dayTooltip}>
                  {data.reqs  > 0 && <span className={styles.dayTooltipRow}><span className={styles.dayTooltipDot} style={{ background: '#ff5e3a' }} />{data.reqs} solicitud{data.reqs > 1 ? 'es' : ''}</span>}
                  {data.sla   > 0 && <span className={styles.dayTooltipRow}><span className={styles.dayTooltipDot} style={{ background: '#f59e0b' }} />{data.sla} SLA</span>}
                  {data.meet  > 0 && <span className={styles.dayTooltipRow}><span className={styles.dayTooltipDot} style={{ background: '#34a853' }} />{data.meet} reunión{data.meet > 1 ? 'es' : ''}</span>}
                  {data.cal   > 0 && <span className={styles.dayTooltipRow}><span className={styles.dayTooltipDot} style={{ background: '#8b5cf6' }} />{data.cal} evento{data.cal > 1 ? 's' : ''}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
