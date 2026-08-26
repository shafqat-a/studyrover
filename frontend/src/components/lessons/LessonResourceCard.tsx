import { useState } from 'react';
import { ExternalLink, Link2, Play, Trash2 } from 'lucide-react';

import { Badge } from '../Badge';
import { Button } from '../Button';
import {
  displayHost,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  youtubeVideoId,
  type LessonResource,
} from './lessonUtils';

/**
 * Lesson resource cards.
 *
 * - `YouTubeFacade`: a click-to-load video. Shows the thumbnail with a play
 *   button; the privacy-enhanced (`youtube-nocookie.com`) iframe mounts only
 *   once the learner clicks, so nothing is fetched from YouTube up-front.
 * - `WikipediaCard`: thumbnail (when present), title, extract and a
 *   "Read on Wikipedia" link.
 * - `LinkCard`: a generic external link card.
 * - `LessonResourceCard`: dispatches on `resource.kind` and adds the optional
 *   source badge ("Enriched" / "Manual") and a Remove action for the parent
 *   editor.
 */

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const cardBase =
  'overflow-hidden rounded-card border border-border bg-surface shadow-card';

interface FacadeProps {
  resource: LessonResource;
  className?: string;
}

/** Click-to-load YouTube embed (thumbnail + play button until activated). */
export function YouTubeFacade({ resource, className }: FacadeProps) {
  const [loaded, setLoaded] = useState(false);
  const videoId = youtubeVideoId(resource);
  const thumbnail =
    resource.thumbnailUrl ?? (videoId ? youtubeThumbnailUrl(videoId) : undefined);

  if (!videoId) {
    // Not embeddable — fall back to a plain link card.
    return <LinkCard resource={resource} className={className} />;
  }

  return (
    <div className={cx('relative aspect-video w-full bg-black', className)}>
      {loaded ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={youtubeEmbedUrl(videoId)}
          title={resource.title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => setLoaded(true)}
          aria-label={`Play video: ${resource.title}`}
          className="group absolute inset-0 flex h-full w-full items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-opacity group-hover:opacity-90"
            />
          ) : null}
          <span
            aria-hidden="true"
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop transition-transform group-hover:scale-105"
          >
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
        </button>
      )}
    </div>
  );
}

interface ExternalCardProps {
  resource: LessonResource;
  className?: string;
}

/** Wikipedia article card: thumbnail, title, extract, and an outbound link. */
export function WikipediaCard({ resource, className }: ExternalCardProps) {
  return (
    <div className={cx('flex gap-3 p-3', className)}>
      {resource.thumbnailUrl ? (
        <img
          src={resource.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-surface-muted font-display text-2xl font-bold text-foreground-muted"
        >
          W
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold text-foreground">
          {resource.title}
        </p>
        {resource.description ? (
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-foreground-muted">
            {resource.description}
          </p>
        ) : null}
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          Read on Wikipedia
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/** Generic external link card. */
export function LinkCard({ resource, className }: ExternalCardProps) {
  return (
    <div className={cx('flex gap-3 p-3', className)}>
      {resource.thumbnailUrl ? (
        <img
          src={resource.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-surface-muted text-foreground-muted"
        >
          <Link2 className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold text-foreground">
          {resource.title}
        </p>
        {resource.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground-muted">
            {resource.description}
          </p>
        ) : null}
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <span className="truncate">{displayHost(resource.url)}</span>
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

export interface LessonResourceCardProps {
  resource: LessonResource;
  /** Show the "Enriched" / "Manual" source badge (parent editor). */
  showSource?: boolean;
  /** When set, renders a Remove button that calls back with the resource. */
  onRemove?: (resource: LessonResource) => void;
  /** Disables the Remove button while a removal is in flight. */
  removing?: boolean;
  className?: string;
}

/** A single lesson resource rendered according to its kind. */
export function LessonResourceCard({
  resource,
  showSource = false,
  onRemove,
  removing = false,
  className,
}: LessonResourceCardProps) {
  const hasMeta = showSource || Boolean(onRemove);
  return (
    <article className={cx(cardBase, className)} aria-label={resource.title}>
      {resource.kind === 'youtube' ? (
        <>
          <YouTubeFacade resource={resource} />
          <div className="p-3">
            <p className="font-display text-sm font-semibold text-foreground">
              {resource.title}
            </p>
            {resource.description ? (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground-muted">
                {resource.description}
              </p>
            ) : null}
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Watch on YouTube
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </>
      ) : resource.kind === 'wikipedia' ? (
        <WikipediaCard resource={resource} />
      ) : (
        <LinkCard resource={resource} />
      )}

      {hasMeta ? (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          {showSource ? (
            <Badge tone={resource.source === 'enrich' ? 'info' : 'neutral'} size="sm">
              {resource.source === 'enrich' ? 'Enriched' : 'Manual'}
            </Badge>
          ) : (
            <span />
          )}
          {onRemove ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(resource)}
              disabled={removing}
              aria-label={`Remove ${resource.title}`}
              leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
