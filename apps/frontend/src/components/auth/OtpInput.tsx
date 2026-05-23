'use client';

import { useRef } from 'react';

interface OtpInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  onComplete?: () => void;
  wrapClassName?: string;
  digitClassName?: string;
  disabled?: boolean;
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  wrapClassName,
  digitClassName,
  disabled,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function handleInput(i: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[i] = digit;
    onChange(next);
    if (digit && i < 5) {
      refs.current[i + 1]?.focus();
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
    if (e.key === 'Enter') {
      onComplete?.();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '');
    const digits = paste.slice(0, 6).split('');
    const next = Array(6).fill('');
    digits.forEach((d, j) => { next[j] = d; });
    onChange(next);
    const focusIdx = Math.min(digits.length, 5);
    refs.current[focusIdx]?.focus();
  }

  return (
    <div className={wrapClassName} onPaste={handlePaste}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          maxLength={1}
          inputMode="numeric"
          value={digit}
          className={digitClassName}
          disabled={disabled}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
        />
      ))}
    </div>
  );
}
