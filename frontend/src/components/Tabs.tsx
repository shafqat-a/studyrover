import { forwardRef, useCallback, useId, useRef } from 'react';
import type {
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from 'react';
import { NavLink } from 'react-router-dom';

/**
 * U09 — Tabs
 *
 * A presentational, accessible tab navigation. Props-driven only: no data
 * fetching, no business logic. Styling uses the StudyRover design tokens from
 * `tailwind.config.ts` (e.g. `bg-surface`, `rounded-card`, `border-border`,
 * `text-foreground`, `shadow-focus`).
 *
 * Two modes:
 * - Controlled panels: pass `value` + `onValueChange`. Renders
 *   `role=tablist`/`role=tab` buttons that follow the ARIA tabs pattern with
 *   roving-tabindex and Left/Right/Home/End keyboard navigation. Use the
 *   companion `TabPanel` to render the associated `role=tabpanel` regions.
 * - Routed tabs: pass `routed`. Each tab renders a React Router `NavLink`
 *   (`to` from the tab item). The browser/router owns the active state, so the
 *   active link is derived from the current route. Arrow keys move focus
 *   between the links.
 */

export interface TabItem {
  /** Stable identifier used for selection and panel association. */
  id: string;
  /** Visible label. */
  label: ReactNode;
  /** Optional element rendered before the label. */
  icon?: ReactNode;
  /** Disable selection/navigation for this tab. */
  disabled?: boolean;
  /** Routed mode only: destination for the underlying `NavLink`. */
  to?: string;
}

interface TabsBaseProps {
  /** The tabs to render. */
  items: TabItem[];
  /** Accessible label for the tablist. */
  'aria-label'?: string;
  /** Visual size. Defaults to `md`. */
  size?: TabsSize;
  /** Stretch tabs to fill the available width. */
  fullWidth?: boolean;
  className?: string;
}

interface ControlledTabsProps extends TabsBaseProps {
  routed?: false;
  /** The id of the currently active tab. */
  value: string;
  /** Called with the id of a newly selected tab. */
  onValueChange: (id: string) => void;
}

interface RoutedTabsProps extends TabsBaseProps {
  routed: true;
  value?: undefined;
  onValueChange?: undefined;
}

export type TabsProps = ControlledTabsProps | RoutedTabsProps;

export type TabsSize = 'sm' | 'md';

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const sizeClasses: Record<TabsSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-base',
};

const tabBase =
  'relative inline-flex items-center justify-center gap-2 font-semibold ' +
  'whitespace-nowrap border-b-2 transition-colors duration-150 select-none ' +
  '-mb-px focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-background rounded-t-card ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const inactiveTab =
  'border-transparent text-foreground-muted hover:text-foreground ' +
  'hover:bg-surface-muted';

const activeTab = 'border-primary text-primary';

const listBase = 'flex items-stretch border-b border-border';

/** Moves focus across the focusable tab elements, honoring disabled items. */
function focusByOffset(
  container: HTMLElement | null,
  current: number,
  delta: number,
): void {
  if (container == null) return;
  const tabs = Array.from(
    container.querySelectorAll<HTMLElement>('[data-tab="true"]'),
  ).filter((el) => el.getAttribute('aria-disabled') !== 'true');
  if (tabs.length === 0) return;

  const focusable = tabs;
  const activeEl = document.activeElement as HTMLElement | null;
  const currentIndex = activeEl != null ? focusable.indexOf(activeEl) : -1;
  const start = currentIndex >= 0 ? currentIndex : current;
  const next =
    (((start + delta) % focusable.length) + focusable.length) %
    focusable.length;
  focusable[next]?.focus();
}

function focusEdge(
  container: HTMLElement | null,
  edge: 'first' | 'last',
): void {
  if (container == null) return;
  const tabs = Array.from(
    container.querySelectorAll<HTMLElement>('[data-tab="true"]'),
  ).filter((el) => el.getAttribute('aria-disabled') !== 'true');
  if (tabs.length === 0) return;
  (edge === 'first' ? tabs[0] : tabs[tabs.length - 1])?.focus();
}

function useTabKeyDown(listRef: RefObject<HTMLDivElement>) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>, index: number) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          focusByOffset(listRef.current, index, 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          focusByOffset(listRef.current, index, -1);
          break;
        case 'Home':
          event.preventDefault();
          focusEdge(listRef.current, 'first');
          break;
        case 'End':
          event.preventDefault();
          focusEdge(listRef.current, 'last');
          break;
        default:
          break;
      }
    },
    [listRef],
  );
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  props,
  ref,
) {
  const {
    items,
    size = 'md',
    fullWidth = false,
    className,
    'aria-label': ariaLabel,
  } = props;

  const localRef = useRef<HTMLDivElement>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      (localRef as { current: HTMLDivElement | null }).current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref != null)
        (ref as { current: HTMLDivElement | null }).current = node;
    },
    [ref],
  );

  const onKeyDown = useTabKeyDown(localRef);
  const baseId = useId();

  if (props.routed) {
    return (
      <div
        ref={setRefs}
        role="tablist"
        aria-label={ariaLabel}
        className={cx(listBase, className)}
      >
        {items.map((item, index) => (
          <NavLink
            key={item.id}
            to={item.to ?? '.'}
            role="tab"
            data-tab="true"
            end
            aria-disabled={item.disabled || undefined}
            tabIndex={item.disabled ? -1 : undefined}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={(event) => {
              if (item.disabled) event.preventDefault();
            }}
            className={({ isActive }) =>
              cx(
                tabBase,
                sizeClasses[size],
                fullWidth && 'flex-1',
                item.disabled
                  ? 'pointer-events-none border-transparent text-foreground-muted opacity-60'
                  : isActive
                    ? activeTab
                    : inactiveTab,
              )
            }
          >
            {({ isActive }) => (
              <TabContent item={item} active={isActive} />
            )}
          </NavLink>
        ))}
      </div>
    );
  }

  const { value, onValueChange } = props;

  return (
    <div
      ref={setRefs}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cx(listBase, className)}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab="true"
            id={`${baseId}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${item.id}`}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (!item.disabled) onValueChange(item.id);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              tabBase,
              sizeClasses[size],
              fullWidth && 'flex-1',
              selected ? activeTab : inactiveTab,
            )}
          >
            <TabContent item={item} active={selected} />
          </button>
        );
      })}
    </div>
  );
});

function TabContent({ item, active }: { item: TabItem; active: boolean }) {
  return (
    <>
      {item.icon != null && (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span>{item.label}</span>
      {active && <span className="sr-only"> (selected)</span>}
    </>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** The tab id this panel is associated with. */
  tabId: string;
  /** Whether this panel is currently active/visible. */
  active: boolean;
  /**
   * Id prefix shared with the controlling `Tabs`. Must match so that
   * `aria-controls`/`aria-labelledby` line up. Pass the same `useId()` base
   * you give to the controlled `Tabs`, or rely on a stable shared string.
   */
  idBase: string;
  children?: ReactNode;
}

/**
 * Companion panel for controlled (non-routed) `Tabs`. Render one per tab; the
 * inactive panels are hidden but kept mounted for state preservation.
 */
export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(
  function TabPanel(
    { tabId, active, idBase, className, children, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`${idBase}-panel-${tabId}`}
        aria-labelledby={`${idBase}-tab-${tabId}`}
        hidden={!active}
        tabIndex={0}
        className={cx(
          'focus-visible:outline-none focus-visible:ring-2 ' +
            'focus-visible:ring-ring focus-visible:ring-offset-2 ' +
            'focus-visible:ring-offset-background rounded-card',
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
