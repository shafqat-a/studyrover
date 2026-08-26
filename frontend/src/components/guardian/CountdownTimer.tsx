import { useEffect, useRef } from 'react';

import {
  formatCountdown,
  formatMinutesLeft,
  secondsLeft,
  useNow,
} from './countdown';

/**
 * CountdownTimer — a ticking `M:SS` readout for a Guardian grant.
 *
 * Accessibility: the visible seconds readout changes every second, which
 * would be unbearable if announced. The visible text is therefore
 * `aria-hidden`, and a visually-hidden, minute-granular sibling ("27 minutes
 * left") lives inside the `aria-live="polite"` container, so assistive tech
 * hears at most one update per minute.
 */
export interface CountdownTimerProps {
  /** Absolute deadline in epoch ms; `null` renders `0:00`. */
  deadlineMs: number | null;
  /** Fired once when the countdown reaches zero (e.g. to refetch). */
  onExpire?: () => void;
  /** Extra classes for the visible readout. */
  className?: string;
}

export function CountdownTimer({
  deadlineMs,
  onExpire,
  className,
}: CountdownTimerProps) {
  const active = deadlineMs !== null && deadlineMs > Date.now();
  const now = useNow(active);
  const seconds = secondsLeft(deadlineMs, now);

  // Fire `onExpire` exactly once per deadline when the clock hits zero.
  const firedFor = useRef<number | null>(null);
  useEffect(() => {
    if (deadlineMs === null) return;
    if (seconds > 0) return;
    if (firedFor.current === deadlineMs) return;
    firedFor.current = deadlineMs;
    onExpire?.();
  }, [seconds, deadlineMs, onExpire]);

  return (
    <span aria-live="polite" aria-atomic="true" className="inline-flex">
      <span
        aria-hidden="true"
        className={className ?? 'font-semibold tabular-nums text-foreground'}
      >
        {formatCountdown(seconds)}
      </span>
      <span className="sr-only">{formatMinutesLeft(seconds)}</span>
    </span>
  );
}
