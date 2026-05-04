import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type OTPInputProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * Accessible 6-digit OTP/TOTP input. Used by MFA enroll/verify/recovery
 * flows. Sprint 0.1 component — pure HTML/CSS, no external lib.
 *
 * Behavior:
 * - Single character per input cell. Numeric only (filters non-digits).
 * - Auto-advances to next cell on input.
 * - Backspace on empty cell jumps to previous cell.
 * - Paste of full N-digit code spreads across cells.
 * - Fires `onComplete` exactly once per full fill (parent typically submits).
 */
export function OTPInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  autoFocus = false,
  className,
  "aria-label": ariaLabel = "Verification code",
}: OTPInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (autoFocus && !disabled) {
      inputs.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (value.length === length && !completed) {
      setCompleted(true);
      onComplete?.(value);
    } else if (value.length < length && completed) {
      setCompleted(false);
    }
  }, [value, length, completed, onComplete]);

  const setCharAt = (index: number, char: string) => {
    const chars = value.split("");
    while (chars.length < length) chars.push("");
    chars[index] = char;
    onChange(chars.join("").slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setCharAt(index, "");
      return;
    }
    setCharAt(index, digits[0]);
    if (index + 1 < length) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (value[index]) {
        setCharAt(index, "");
      } else if (index > 0) {
        setCharAt(index - 1, "");
        inputs.current[index - 1]?.focus();
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
      return;
    }
    if (event.key === "ArrowRight" && index + 1 < length) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
      return;
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    onChange(text.padEnd(length, "").slice(0, length).trimEnd());
    const focusIndex = Math.min(text.length, length - 1);
    inputs.current[focusIndex]?.focus();
  };

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[index] ?? ""}
          disabled={disabled}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          aria-label={`Digit ${index + 1} of ${length}`}
          className={cn(
            "h-12 w-10 rounded-md border border-border bg-transparent text-center text-lg font-mono tabular-nums outline-none",
            "focus:ring-2 focus:ring-ring focus:border-transparent",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
