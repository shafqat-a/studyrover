// Guardian — countdown + time formatting helpers (3-U06 support).
//
// The Guardian endpoints report `remainingSeconds` as a snapshot taken at
// response time. The UI ticks that snapshot down locally (one shared 1 Hz
// clock per consumer) and re-syncs whenever the query refetches. Deadlines are
// derived from the query's `dataUpdatedAt` + `remainingSeconds` rather than
// the server's `expiresAt`, so a skewed client clock cannot make a countdown
// drift.

import { useEffect, useState } from 'react';

/**
 * A `Date.now()` that re-renders once per second while `active` is true.
 * Consumers derive their countdowns from this single clock so a page with
 * several timers still only ticks once per second.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/**
 * Compute the absolute deadline (epoch ms) for a snapshot of
 * `remainingSeconds` taken at `syncedAtMs`. `null` when there is no time left.
 */
export function deadlineFrom(
  remainingSeconds: number | undefined,
  syncedAtMs: number,
): number | null {
  if (remainingSeconds === undefined || remainingSeconds <= 0) return null;
  const base = syncedAtMs > 0 ? syncedAtMs : Date.now();
  return base + remainingSeconds * 1000;
}

/** Whole seconds left until `deadlineMs` as of `nowMs` (never negative). */
export function secondsLeft(deadlineMs: number | null, nowMs: number): number {
  if (deadlineMs === null) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/** Format whole seconds as `M:SS` (or `H:MM:SS` past an hour). */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** Minute-granular, screen-reader-friendly phrasing ("27 minutes left"). */
export function formatMinutesLeft(totalSeconds: number): string {
  const minutes = Math.ceil(Math.max(0, totalSeconds) / 60);
  if (minutes <= 0) return 'No time left';
  if (minutes === 1) return 'About 1 minute left';
  return `${minutes} minutes left`;
}

/** Wall-clock time (`18:42`) for an ISO timestamp or epoch ms. */
export function formatClock(when: string | number | undefined): string {
  if (when === undefined) return '';
  const date = typeof when === 'number' ? new Date(when) : new Date(when);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Compact date + time for history tables ("26 Aug, 14:05"). */
export function formatWhen(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (sameDay) return `Today ${time}`;
  const day = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return `${day}, ${time}`;
}

/** "45 min" / "1 h 30 min" for a minute count. */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe} min`;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
