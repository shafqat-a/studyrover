import { useId, useMemo } from 'react';

/**
 * U08 — MasteryTimeline
 *
 * A presentational, accessible line chart of topic mastery over time. Renders a
 * lightweight inline SVG (one polyline per topic) plus a visually-hidden data
 * table fallback so the same information is available to assistive tech and to
 * automation. Props-driven only: no data fetching, no hooks beyond `useId`, no
 * business logic. Styling uses the StudyRover design tokens from
 * `tailwind.config.ts` (e.g. `text-foreground`, `border-border`).
 *
 * The data shape mirrors the Phase-2 Dashboard contract field
 * `masteryTimeline: { date, topicId, mastery }[]`, with an optional `topics`
 * lookup to resolve human-readable topic names and stable colors.
 */

/** A single mastery sample: `mastery` is a 0..1 (or 0..100) fraction/percent. */
export interface MasteryTimelinePoint {
  /** ISO date string (e.g. `2026-06-22`) the sample was recorded. */
  date: string;
  /** Topic identifier the sample belongs to. */
  topicId: string;
  /** Mastery value. Treated as a percentage when > 1, else a 0..1 fraction. */
  mastery: number;
}

/** Optional metadata to label/colour a topic's series. */
export interface MasteryTimelineTopic {
  id: string;
  /** Human-readable name shown in the legend and table. */
  name: string;
  /** Optional explicit series colour (any valid CSS color). */
  color?: string;
}

export interface MasteryTimelineProps {
  /** Flat list of samples across all topics and dates. */
  points: MasteryTimelinePoint[];
  /** Optional topic metadata keyed display; falls back to the raw id. */
  topics?: MasteryTimelineTopic[];
  /** Accessible name for the chart. Defaults to a generic label. */
  title?: string;
  /** Optional longer description announced via `aria-describedby`. */
  description?: string;
  /** Drawing height in px (the chart is responsive in width). Default 220. */
  height?: number;
  /** Message shown when there is no data. */
  emptyLabel?: string;
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Default qualitative palette (kept distinct and color-blind friendly-ish). */
const PALETTE = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#ca8a04',
  '#db2777',
];

/** Normalises a raw mastery value to a 0..100 percentage. */
function toPercent(value: number): number {
  const v = Number.isFinite(value) ? value : 0;
  const pct = v > 1 ? v : v * 100;
  return Math.max(0, Math.min(100, pct));
}

interface Series {
  topicId: string;
  name: string;
  color: string;
  /** Sorted by date ascending. */
  samples: Array<{ date: string; pct: number }>;
}

const VIEW_W = 1000;

export function MasteryTimeline({
  points,
  topics,
  title = 'Mastery over time',
  description,
  height = 220,
  emptyLabel = 'No mastery data yet.',
  className,
}: MasteryTimelineProps) {
  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const topicMeta = useMemo(() => {
    const map = new Map<string, MasteryTimelineTopic>();
    for (const t of topics ?? []) map.set(t.id, t);
    return map;
  }, [topics]);

  const { series, dates } = useMemo(() => {
    // Unique, chronologically-sorted set of dates across all points.
    const dateSet = Array.from(new Set(points.map((p) => p.date))).sort();
    const dateIndex = new Map(dateSet.map((d, i) => [d, i] as const));

    const byTopic = new Map<string, Series>();
    let colorCursor = 0;
    for (const p of points) {
      let s = byTopic.get(p.topicId);
      if (!s) {
        const meta = topicMeta.get(p.topicId);
        s = {
          topicId: p.topicId,
          name: meta?.name ?? p.topicId,
          color: meta?.color ?? PALETTE[colorCursor++ % PALETTE.length],
          samples: [],
        };
        byTopic.set(p.topicId, s);
      }
      s.samples.push({ date: p.date, pct: toPercent(p.mastery) });
    }

    for (const s of byTopic.values()) {
      s.samples.sort(
        (a, b) => (dateIndex.get(a.date) ?? 0) - (dateIndex.get(b.date) ?? 0),
      );
    }

    return {
      dates: dateSet,
      series: Array.from(byTopic.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }, [points, topicMeta]);

  const hasData = dates.length > 0 && series.length > 0;

  // Map a (dateIndex, pct) pair into SVG user-space coordinates.
  const denom = Math.max(1, dates.length - 1);
  const xFor = (dateIdx: number) =>
    dates.length === 1 ? VIEW_W / 2 : (dateIdx / denom) * VIEW_W;
  const yFor = (pct: number) => 100 - pct; // 0% at bottom, 100% at top.

  const gridLines = [0, 25, 50, 75, 100];

  return (
    <figure
      className={cx('text-foreground', className)}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <figcaption id={titleId} className="mb-2 font-display font-bold">
        {title}
      </figcaption>
      {description && (
        <p id={descId} className="mb-3 text-sm text-foreground-muted">
          {description}
        </p>
      )}

      {!hasData ? (
        <p className="rounded-card border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
          {emptyLabel}
        </p>
      ) : (
        <>
          {/* Legend */}
          {series.length > 1 && (
            <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {series.map((s) => (
                <li key={s.topicId} className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>{s.name}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Visual chart: hidden from AT in favour of the table below. */}
          <div
            aria-hidden="true"
            className="rounded-card border border-border bg-surface p-3"
          >
            <svg
              viewBox={`0 0 ${VIEW_W} 100`}
              width="100%"
              height={height}
              preserveAspectRatio="none"
              focusable="false"
              role="presentation"
            >
              {/* Horizontal gridlines */}
              {gridLines.map((g) => (
                <line
                  key={g}
                  x1={0}
                  x2={VIEW_W}
                  y1={yFor(g)}
                  y2={yFor(g)}
                  stroke="currentColor"
                  strokeWidth={0.4}
                  className="text-border"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* One polyline (+ markers) per topic series */}
              {series.map((s) => {
                const coords = s.samples.map((sample) => {
                  const di = dates.indexOf(sample.date);
                  return { x: xFor(di < 0 ? 0 : di), y: yFor(sample.pct) };
                });
                const pointsAttr = coords
                  .map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`)
                  .join(' ');
                return (
                  <g key={s.topicId}>
                    {coords.length > 1 && (
                      <polyline
                        points={pointsAttr}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {coords.map((c, i) => (
                      <circle
                        key={i}
                        cx={c.x}
                        cy={c.y}
                        r={1.6}
                        fill={s.color}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
            {/* Axis hint (decorative; real values live in the table) */}
            <div className="mt-1 flex justify-between text-xs text-foreground-muted">
              <span>{dates[0]}</span>
              {dates.length > 1 && <span>{dates[dates.length - 1]}</span>}
            </div>
          </div>

          {/* Accessible table fallback: the canonical data representation. */}
          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                {dates.map((d) => (
                  <th key={d} scope="col">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => {
                const byDate = new Map(s.samples.map((x) => [x.date, x.pct]));
                return (
                  <tr key={s.topicId}>
                    <th scope="row">{s.name}</th>
                    {dates.map((d) => {
                      const pct = byDate.get(d);
                      return (
                        <td key={d}>
                          {pct == null ? '—' : `${Math.round(pct)}%`}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}
