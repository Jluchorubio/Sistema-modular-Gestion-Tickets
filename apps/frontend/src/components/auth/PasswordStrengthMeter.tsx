interface PasswordStrengthMeterProps {
  password: string;
  wrapClassName?: string;
  barClassName?: string;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e'];

function computeStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

export function PasswordStrengthMeter({
  password,
  wrapClassName,
  barClassName,
}: PasswordStrengthMeterProps) {
  const strength = computeStrength(password);

  return (
    <div className={wrapClassName}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={barClassName}
          style={{ background: i < strength ? COLORS[strength - 1] : undefined }}
        />
      ))}
    </div>
  );
}
