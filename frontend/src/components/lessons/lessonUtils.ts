// Lesson helpers shared by the lesson components and pages. Kept out of the
// component files so Vite HMR's react-refresh rule (component-only exports)
// stays satisfied.

import type { components } from '../../api/schema';

export type Lesson = components['schemas']['Lesson'];
export type LessonResource = components['schemas']['LessonResource'];
export type LessonResourceKind = components['schemas']['LessonResourceKind'];
export type LessonStatus = components['schemas']['LessonStatus'];

/** Resources bucketed by kind, each in `position` order. */
export interface GroupedResources {
  youtube: LessonResource[];
  wikipedia: LessonResource[];
  link: LessonResource[];
}

/** Bucket a lesson's resources by kind, sorted by `position`. */
export function groupResources(
  resources: ReadonlyArray<LessonResource> | undefined,
): GroupedResources {
  const groups: GroupedResources = { youtube: [], wikipedia: [], link: [] };
  for (const r of resources ?? []) {
    (groups[r.kind] ?? groups.link).push(r);
  }
  const byPosition = (a: LessonResource, b: LessonResource) =>
    a.position - b.position;
  groups.youtube.sort(byPosition);
  groups.wikipedia.sort(byPosition);
  groups.link.sort(byPosition);
  return groups;
}

/** Count resources per kind (for compact "▶ 2 · W 1" summaries). */
export function countResources(
  resources: ReadonlyArray<LessonResource> | undefined,
): Record<LessonResourceKind, number> {
  const counts: Record<LessonResourceKind, number> = {
    youtube: 0,
    wikipedia: 0,
    link: 0,
  };
  for (const r of resources ?? []) {
    counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  }
  return counts;
}

/** Privacy-enhanced YouTube embed URL for a video id. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`;
}

/** Default YouTube thumbnail for a video id (used when the API sent none). */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/**
 * Best-effort YouTube video id for a resource: prefers `externalId`, then
 * parses the canonical watch / youtu.be / shorts / embed URL forms.
 */
export function youtubeVideoId(resource: LessonResource): string | undefined {
  if (resource.externalId) return resource.externalId;
  try {
    const url = new URL(resource.url);
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') {
      return url.pathname.slice(1).split('/')[0] || undefined;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = url.searchParams.get('v');
      if (v) return v;
      const m = /^\/(?:embed|shorts|v)\/([^/?#]+)/.exec(url.pathname);
      if (m) return m[1];
    }
  } catch {
    // Not a URL we can parse; fall through.
  }
  return undefined;
}

/** Hostname of a URL for display ("en.wikipedia.org"), or the raw string. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Human label for a lesson status (or "No lesson" when absent). */
export function lessonStatusLabel(status: LessonStatus | undefined): string {
  if (status === 'published') return 'Published';
  if (status === 'draft') return 'Draft';
  return 'No lesson';
}

/** Short relative "updated" label, e.g. "just now", "3h ago", "12 Mar". */
export function formatUpdated(iso: string | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Drop a leading `# Heading` (and the blank lines after it) when it repeats
 * the lesson title, so pages that already show the title don't render it
 * twice. Comparison is case- and whitespace-insensitive.
 */
export function stripLeadingTitle(markdown: string, title: string): string {
  const m = /^\s*#\s+([^\n]+)\n?/.exec(markdown);
  if (!m) return markdown;
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (norm(m[1]) !== norm(title)) return markdown;
  return markdown.slice(m[0].length).replace(/^\s*\n/, '');
}
