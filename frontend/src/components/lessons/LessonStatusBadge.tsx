import { Badge, type BadgeSize } from '../Badge';
import { lessonStatusLabel, type LessonStatus } from './lessonUtils';

/** Status pill for a lesson: "No lesson" (absent) / "Draft" / "Published". */
export interface LessonStatusBadgeProps {
  status: LessonStatus | undefined;
  size?: BadgeSize;
  className?: string;
}

export function LessonStatusBadge({
  status,
  size = 'md',
  className,
}: LessonStatusBadgeProps) {
  const tone =
    status === 'published' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
  return (
    <Badge tone={tone} size={size} dot className={className}>
      {lessonStatusLabel(status)}
    </Badge>
  );
}
