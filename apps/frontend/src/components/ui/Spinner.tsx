import styles from './spinner.module.css';

interface SpinnerProps {
  className?: string;
}

export function Spinner({ className }: SpinnerProps) {
  return (
    <div className={`${styles.wrap}${className ? ` ${className}` : ''}`}>
      <div className={styles.spinner} />
    </div>
  );
}
