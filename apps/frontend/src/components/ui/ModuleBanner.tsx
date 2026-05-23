import type { LucideIcon } from 'lucide-react';
import styles from './module-banner.module.css';

interface Props {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  gradientFrom: string;
  gradientTo: string;
  imageUrl?: string | null;
  action?: React.ReactNode;
  iconSize?: number;
}

export function ModuleBanner({
  title,
  subtitle,
  icon: Icon,
  gradientFrom,
  gradientTo,
  imageUrl,
  action,
  iconSize = 26,
}: Props) {
  const style: React.CSSProperties = imageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.48), rgba(0,0,0,0.52)), url(${imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)` };

  return (
    <div
      className={`${styles.banner}${imageUrl ? ` ${styles.hasImage}` : ''}`}
      style={style}
    >
      <div className={styles.left}>
        <div className={styles.iconWrap}>
          <Icon size={iconSize} strokeWidth={1.8} />
        </div>
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export { styles as bannerStyles };
