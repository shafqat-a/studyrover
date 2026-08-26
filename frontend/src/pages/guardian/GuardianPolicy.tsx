import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { NumberStepper } from '../../components/NumberStepper';
import { Select } from '../../components/Select';
import { Toggle } from '../../components/Toggle';
import type { components } from '../../api/schema';
import { useToast } from '../../app/providers';
import {
  useGuardianPolicy,
  useUpdateGuardianPolicy,
} from '../../hooks/useGuardian';
import { formatMinutes } from '../../components/guardian/countdown';
import { GuardianQueryError, GuardianSkeleton, SectionHeading } from './shared';

/**
 * 3-P04 — Guardian policy (`/parent/guardian/policy`)
 *
 * The reward policy form (spec §7, §10): the parent switch, flat vs scaled
 * reward, diminishing returns, the per-question rate and the daily cap. The
 * pass bar, cooldown and difficulty ramp mirror the platform Settings and are
 * read-only here with a link across. A live example shows what a standard
 * 20-question pass earns with the current values. Save sends only the changed
 * fields (3-H02) and toasts on success.
 */

type GuardianPolicy = components['schemas']['GuardianPolicy'];
type UpdateGuardianPolicy = components['schemas']['UpdateGuardianPolicy'];
type RewardStyle = components['schemas']['RewardStyle'];

interface FormState {
  enabled: boolean;
  rewardStyle: RewardStyle;
  diminishingReturns: boolean;
  rateMinPerQ: number;
  dailyCapHours: number;
}

const REWARD_STYLE_OPTIONS: Array<{ value: RewardStyle; label: string }> = [
  { value: 'flat', label: 'Flat — full time on any pass' },
  { value: 'scaled', label: 'Scaled — score% × full time' },
];

const REWARD_STYLE_HINT: Record<RewardStyle, string> = {
  flat: 'Simple and predictable: 20 questions at 3 min each = 60 min on any pass (spec §7, recommended).',
  scaled:
    'Rewards mastery, not just clearing the bar: an 85% pass on a 60-minute exam earns 51 min.',
};

/** The standard session used for the live example (spec §7). */
const EXAMPLE_QUESTIONS = 20;
const EXAMPLE_SCALED_SCORE = 85;

function formFromPolicy(policy: GuardianPolicy): FormState {
  return {
    enabled: policy.enabled,
    rewardStyle: policy.rewardStyle,
    diminishingReturns: policy.diminishingReturns,
    rateMinPerQ: policy.rateMinPerQ,
    dailyCapHours: policy.dailyCapHours,
  };
}

/** Returns only the fields that differ from the loaded policy. */
function diff(policy: GuardianPolicy, form: FormState): UpdateGuardianPolicy {
  const changes: UpdateGuardianPolicy = {};
  if (form.enabled !== policy.enabled) changes.enabled = form.enabled;
  if (form.rewardStyle !== policy.rewardStyle) {
    changes.rewardStyle = form.rewardStyle;
  }
  if (form.diminishingReturns !== policy.diminishingReturns) {
    changes.diminishingReturns = form.diminishingReturns;
  }
  if (form.rateMinPerQ !== policy.rateMinPerQ) {
    changes.rateMinPerQ = form.rateMinPerQ;
  }
  if (form.dailyCapHours !== policy.dailyCapHours) {
    changes.dailyCapHours = form.dailyCapHours;
  }
  return changes;
}

/** Minutes a pass earns under the form's current values (before the cap). */
function minutesFor(
  form: FormState,
  questions: number,
  scorePct: number,
): number {
  const full = questions * form.rateMinPerQ;
  const base =
    form.rewardStyle === 'scaled' ? (full * scorePct) / 100 : full;
  return Math.round(base);
}

/** Apply the daily cap (0 = no cap). */
function capped(minutes: number, dailyCapHours: number): number {
  if (dailyCapHours <= 0) return minutes;
  return Math.min(minutes, dailyCapHours * 60);
}

export default function GuardianPolicyPage() {
  const policyQuery = useGuardianPolicy();
  const update = useUpdateGuardianPolicy();
  const { toast } = useToast();

  if (policyQuery.isPending) return <GuardianSkeleton rows={2} />;
  if (policyQuery.isError) {
    return (
      <GuardianQueryError
        error={policyQuery.error}
        onRetry={() => void policyQuery.refetch()}
        retrying={policyQuery.isFetching}
        title="Couldn’t load the reward policy"
      />
    );
  }

  return (
    <PolicyForm
      key={policyQuery.data.updatedAt}
      policy={policyQuery.data}
      saving={update.isPending}
      onSave={async (changes) => {
        await update.mutateAsync(changes);
        toast('Reward policy saved', { variant: 'success' });
      }}
    />
  );
}

interface PolicyFormProps {
  policy: GuardianPolicy;
  saving: boolean;
  onSave: (changes: UpdateGuardianPolicy) => Promise<void>;
}

function PolicyForm({ policy, saving, onSave }: PolicyFormProps) {
  const [form, setForm] = useState<FormState>(() => formFromPolicy(policy));

  // Re-sync local edits whenever a fresh policy arrives (after a save).
  useEffect(() => {
    setForm(formFromPolicy(policy));
  }, [policy]);

  const changes = diff(policy, form);
  const dirty = Object.keys(changes).length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving) return;
    void onSave(changes);
  }

  const exampleFull = minutesFor(form, EXAMPLE_QUESTIONS, 100);
  const exampleScaled = minutesFor(form, EXAMPLE_QUESTIONS, EXAMPLE_SCALED_SCORE);
  const exampleThird = Math.round(exampleFull * 0.75);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card padding="md">
        <SectionHeading
          title="Earned internet time"
          description="The parent switch. When off, passed exams are still recorded but open no internet time."
        />
        <div className="mt-6 space-y-5">
          <PolicyRow
            title="Enabled"
            description="Turn earned internet time on or off for all devices."
          >
            <Toggle
              checked={form.enabled}
              aria-label="Turn earned internet time on or off"
              onChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
            />
          </PolicyRow>
        </div>
      </Card>

      <Card padding="md">
        <SectionHeading
          title="Reward"
          description="How a passed exam turns into minutes (spec §7, §10)."
        />
        <div className="mt-6 space-y-5">
          <PolicyRow
            title="Reward style"
            description={REWARD_STYLE_HINT[form.rewardStyle]}
            htmlFor="policy-reward-style"
            wide
          >
            <Select
              id="policy-reward-style"
              label="Reward style"
              options={REWARD_STYLE_OPTIONS}
              value={form.rewardStyle}
              onChange={(event) =>
                setForm((f) => ({
                  ...f,
                  rewardStyle: event.target.value as RewardStyle,
                }))
              }
              className="[&>label]:sr-only"
            />
          </PolicyRow>

          <PolicyRow
            title="Diminishing returns"
            description="The Nth pass of the day pays less: 1st–2nd full, 3rd 75%, 4th 50%, 5th+ 25%."
          >
            <Toggle
              checked={form.diminishingReturns}
              aria-label="Diminishing returns"
              onChange={(diminishingReturns) =>
                setForm((f) => ({ ...f, diminishingReturns }))
              }
            />
          </PolicyRow>

          <PolicyRow
            title="Rate"
            description="Minutes of internet per question on a pass."
            htmlFor="policy-rate"
          >
            <NumberStepper
              id="policy-rate"
              label="Rate (minutes per question)"
              value={form.rateMinPerQ}
              min={1}
              max={60}
              step={1}
              suffix="min/Q"
              onChange={(rateMinPerQ) =>
                setForm((f) => ({ ...f, rateMinPerQ }))
              }
            />
          </PolicyRow>

          <PolicyRow
            title="Daily cap"
            description="Maximum earnable hours per day. 0 means no cap."
            htmlFor="policy-cap"
          >
            <NumberStepper
              id="policy-cap"
              label="Daily cap (hours)"
              value={form.dailyCapHours}
              min={0}
              max={24}
              step={1}
              suffix="hours"
              onChange={(dailyCapHours) =>
                setForm((f) => ({ ...f, dailyCapHours }))
              }
            />
          </PolicyRow>
        </div>

        <div
          className="mt-6 rounded-card border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-foreground"
          aria-live="polite"
        >
          <p className="font-semibold">
            A {EXAMPLE_QUESTIONS}-question pass earns{' '}
            {formatMinutes(capped(exampleFull, form.dailyCapHours))}
            {form.rewardStyle === 'scaled' ? ' at 100%' : ''}.
          </p>
          <ul className="mt-1 space-y-0.5 text-foreground-muted">
            {form.rewardStyle === 'scaled' && (
              <li>
                At {EXAMPLE_SCALED_SCORE}% it earns{' '}
                {formatMinutes(capped(exampleScaled, form.dailyCapHours))}.
              </li>
            )}
            {form.diminishingReturns && (
              <li>
                The 3rd pass of the day earns{' '}
                {formatMinutes(capped(exampleThird, form.dailyCapHours))} (75%).
              </li>
            )}
            <li>
              {form.dailyCapHours > 0
                ? `Never more than ${formatMinutes(form.dailyCapHours * 60)} in a day.`
                : 'No daily cap.'}
            </li>
          </ul>
        </div>
      </Card>

      <Card padding="md">
        <SectionHeading
          title="From Settings"
          description="These mirror the platform Settings and apply to every exam."
          actions={
            <Link
              to="/parent/settings"
              className="text-sm font-medium text-primary hover:underline"
            >
              Change in Settings
            </Link>
          }
        />
        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ReadOnlyRow label="Pass bar" value={`${policy.passBar}%`} />
          <ReadOnlyRow label="Cooldown after a fail" value={`${policy.cooldownMin} min`} />
          <ReadOnlyRow
            label="Difficulty ramp"
            value={policy.difficultyRamp ? 'On' : 'Off'}
          />
        </dl>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setForm(formFromPolicy(policy))}
          disabled={!dirty || saving}
        >
          Reset
        </Button>
        <Button type="submit" loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

interface PolicyRowProps {
  title: string;
  description?: ReactNode;
  htmlFor?: string;
  /** Let the control take the full width on small screens (selects). */
  wide?: boolean;
  children: ReactNode;
}

function PolicyRow({ title, description, htmlFor, wide, children }: PolicyRowProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:max-w-md">
        {htmlFor ? (
          <label
            htmlFor={htmlFor}
            className="block text-sm font-medium text-foreground"
          >
            {title}
          </label>
        ) : (
          <p className="text-sm font-medium text-foreground">{title}</p>
        )}
        {description ? (
          <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>
        ) : null}
      </div>
      <div className={wide ? 'w-full sm:w-80' : 'shrink-0'}>{children}</div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface-muted/60 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 text-base font-semibold text-foreground">{value}</dd>
    </div>
  );
}
