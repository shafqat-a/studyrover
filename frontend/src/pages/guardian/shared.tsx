import type { ReactNode } from 'react';
import { ShieldOff } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import type { components } from '../../api/schema';
import { isGuardianDisabledError } from '../../hooks/useGuardian';

/**
 * Small presentational pieces shared by the Guardian tabs (3-P0x): the
 * "not enabled on this server" empty state, a query error panel that
 * downgrades the 409 to that empty state, a section heading, and the grant
 * source badge.
 */

type GrantSource = components['schemas']['GrantSource'];

/** Shown whenever the server answers "Guardian is not enabled". */
export function GuardianDisabledState() {
  return (
    <EmptyState
      icon={<ShieldOff className="h-5 w-5" aria-hidden="true" />}
      title="Guardian is not enabled on this server"
      description={
        <>
          Earned internet time needs the Guardian add-on. Start the server with{' '}
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs text-foreground">
            GUARDIAN_ENABLED=true
          </code>{' '}
          (and a wall: <code className="font-mono text-xs">GUARDIAN_WALL=fake</code>{' '}
          for development or <code className="font-mono text-xs">routeros</code>{' '}
          with the router credentials), then reload this page.
        </>
      }
    />
  );
}

interface GuardianQueryErrorProps {
  error: Error;
  onRetry: () => void;
  retrying: boolean;
  title?: string;
}

/**
 * Error panel for the Guardian queries. The 409 "not enabled" Problem becomes
 * the disabled empty state; anything else gets a retry.
 */
export function GuardianQueryError({
  error,
  onRetry,
  retrying,
  title = 'Couldn’t load the Guardian',
}: GuardianQueryErrorProps) {
  if (isGuardianDisabledError(error)) {
    return <GuardianDisabledState />;
  }
  return (
    <div
      role="alert"
      className="rounded-card border border-danger bg-danger-soft p-4 text-center"
    >
      <h2 className="text-base font-semibold text-danger">{title}</h2>
      <p className="mt-1 text-sm text-foreground-muted">{error.message}</p>
      <div className="mt-5">
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={retrying}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}

interface SectionHeadingProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'h2' | 'h3';
}

/** Card-level heading with optional description and right-aligned actions. */
export function SectionHeading({
  title,
  description,
  actions,
  as: Heading = 'h2',
}: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Heading className="font-display text-base font-semibold text-foreground">
          {title}
        </Heading>
        {description != null && (
          <p className="mt-1 text-sm text-foreground-muted">{description}</p>
        )}
      </div>
      {actions != null && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

/** `exam` → info, `manual` → warning. */
export function SourceBadge({ source }: { source: GrantSource }) {
  return source === 'exam' ? (
    <Badge tone="info" size="sm">
      Exam
    </Badge>
  ) : (
    <Badge tone="warning" size="sm">
      Parent override
    </Badge>
  );
}

/** Skeleton block matching the other parent pages. */
export function GuardianSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-md bg-surface-muted"
        />
      ))}
    </div>
  );
}
