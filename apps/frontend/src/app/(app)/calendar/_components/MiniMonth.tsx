'use client';

import { useMemo } from 'react';
import { pad, MONTHS_SHORT, MINI_DAYS, type DayData } from './_types';
import styles from '../calendar.module.css';

export function MiniMonth({ year, month, eventsByDay, onSelect }: {
  year:        number;
  month:       number;
  eventsByDay: Map<string, DayData>;
  onSelect:    () => void;
}) {
  const firstDay  = new Date(year, month, 1);
  const lastDate  = new Date(year, month + 1, 0).getDate();
  const firstDow  = firstDay.getDay();
  const startOff  = firstDow === 0 ? 6 : firstDow - 1;
  const todayStr  = `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-${pad(new Date().getDate())}`;
  const now       = new Date();
  const isCurrent = month === now.getMonth() && year === now.getFullYear();

  const totals = useMemo(() => {
    let reqs = 0, sla = 0, meet = 0, cal = 0;
    for (let d = 1; d <= lastDate; d++) {
      const ds = `${year}-${pad(month + 1)}-${pad(d)}`;
      const dd = eventsByDay.get(ds);
      if (dd) { reqs += dd.reqs; sla += dd.sla; meet += dd.meet; cal += dd.cal; }
    }
    return { reqs, sla, meet, cal, total: reqs + sla + meet + cal };
  }, [year, month, lastDate, eventsByDay]);

  const cells: Array<{ d: number | null; ds: string | null }> = [];
  for (let i = 0; i < startOff; i++) cells.push({ d: null, ds: null });
  for (let d = 1; d <= lastDate; d++) cells.push({ d, ds: `${year}-${pad(month + 1)}-${pad(d)}` });
  while (cells.length % 7 !== 0) cells.push({ d: null, ds: null });

  return (
    <div className={styles.miniMonth} onClick={onSelect} title={`Ver ${MONTHS_SHORT[month]} ${year}`}>
      <div className={styles.miniMonthHeader}>
        <span className={`${styles.miniMonthName} ${isCurrent ? styles.miniMonthNameCurrent : ''}`}>
          {MONTHS_SHORT[month]}
        </span>
        {totals.total > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: '#8fa0af' }}>{totals.total}</span>}
      </div>
      <div className={styles.miniWeekdays}>
        {MINI_DAYS.map((d) => <span key={d} className={styles.miniWeekday}>{d}</span>)}
      </div>
      <div className={styles.miniDaysGrid}>
        {cells.map((cell, i) => {
          if (!cell.ds) return <span key={i} className={styles.miniDay} />;
          const isToday = cell.ds === todayStr;
          const data    = eventsByDay.get(cell.ds);
          const total   = data ? data.reqs + data.sla + data.meet + data.cal : 0;

          let bg = '#f1f5f9';
          if (isToday) {
            bg = '#ff5e3a';
          } else if (total > 0 && data) {
            const m = Math.max(data.reqs, data.sla, data.meet, data.cal);
            const opacity = Math.min(0.2 + total * 0.1, 0.75);
            if      (data.sla  === m) bg = `rgba(245,158,11,${opacity})`;
            else if (data.meet === m) bg = `rgba(52,168,83,${opacity})`;
            else if (data.cal  === m) bg = `rgba(139,92,246,${opacity})`;
            else                      bg = `rgba(255,94,58,${opacity})`;
          }

          return <span key={i} className={`${styles.miniDay} ${isToday ? styles.miniDayToday : ''}`} style={{ background: bg }} />;
        })}
      </div>
      <div className={styles.miniMonthStats}>
        {totals.total === 0 ? (
          <span className={styles.miniMonthEmpty}>Sin actividad</span>
        ) : (
          <>
            {totals.reqs > 0 && <span className={styles.miniStat} style={{ color: '#ff5e3a' }}>{totals.reqs}sol</span>}
            {totals.sla  > 0 && <span className={styles.miniStat} style={{ color: '#f59e0b' }}>{totals.sla}sla</span>}
            {totals.meet > 0 && <span className={styles.miniStat} style={{ color: '#34a853' }}>{totals.meet}reu</span>}
            {totals.cal  > 0 && <span className={styles.miniStat} style={{ color: '#8b5cf6' }}>{totals.cal}evt</span>}
          </>
        )}
      </div>
    </div>
  );
}
