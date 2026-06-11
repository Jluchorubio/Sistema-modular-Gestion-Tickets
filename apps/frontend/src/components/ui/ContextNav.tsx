'use client';

import Link         from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import styles from './ContextNav.module.css';

export interface NavCrumb {
  label: string;
  href?:  string;
}

interface Props {
  /** href string → push, true → router.back(), omit → no back button */
  back?:   string | boolean;
  crumbs?: NavCrumb[];
}

export function ContextNav({ back = true, crumbs = [] }: Props) {
  const router = useRouter();

  function handleBack() {
    if (typeof back === 'string') router.push(back);
    else router.back();
  }

  return (
    <nav className={styles.nav}>
      {back !== false && (
        <button type="button" className={styles.backBtn} onClick={handleBack}>
          <ArrowLeft size={11} />
          Volver
        </button>
      )}

      {back !== false && crumbs.length > 0 && <div className={styles.divider} />}

      {crumbs.length > 0 && (
        <div className={styles.crumbs}>
          {crumbs.map((c, i) => (
            <span key={i} className={styles.crumbItem}>
              {i > 0 && <ChevronRight size={10} className={styles.crumbSep} />}
              {c.href
                ? <Link href={c.href} className={styles.crumbLink}>{c.label}</Link>
                : <span className={`${styles.crumbText} ${i === crumbs.length - 1 ? styles.crumbActive : ''}`}>{c.label}</span>
              }
            </span>
          ))}
        </div>
      )}
    </nav>
  );
}
