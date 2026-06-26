import { useEffect, useState } from 'react';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { NumberStepper } from '../components/NumberStepper';
import { PageHeader } from '../components/PageHeader';
import { Select } from '../components/Select';
import { Toggle } from '../components/Toggle';
import type { components } from '../api/schema';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';

/**
 * P10 — Settings (screen 2.9)
 *
 * The global defaults form for the application Settings singleton (H07). Lets a
 * parent edit the spec defaults that gate exam creation — default exam size,
 * pass bar, and cooldown (U13 NumberStepper), the knowledge backend (U03
 * Select), and the difficulty-ramp toggle (U14). The Guardian-side reward knobs
 * (reward rate, daily cap) are shown but disabled with a "enabled with Guardian
 * (Phase 3)" note, since they are stored now and only consumed in Phase 3.
 *
 * All data flows through the H07 useSettings / useUpdateSettings hooks; nothing
 * here hand-rolls a fetch. States: loading (skeleton), error (retry), and the
 * populated, editable form. Save sends only the changed defaults via H07; the
 * hook surfaces failures as a toast.
 */

type Settings = components['schemas']['Settings'];
type KnowledgeBackend = components['schemas']['KnowledgeBackend'];

interface FormState {
  defaultExamSize: number;
  defaultPassBar: number;
  defaultCooldownMin: number;
  knowledgeBackend: KnowledgeBackend;
  difficultyRamp: boolean;
}

const KNOWLEDGE_BACKEND_OPTIONS: Array<{
  value: KnowledgeBackend;
  label: string;
}> = [
  { value: 'notebooklm', label: 'NotebookLM (default)' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'ollama', label: 'Ollama Cloud' },
];

function formFromSettings(settings: Settings): FormState {
  return {
    defaultExamSize: settings.defaultExamSize,
    defaultPassBar: settings.defaultPassBar,
    defaultCooldownMin: settings.defaultCooldownMin,
    knowledgeBackend: settings.knowledgeBackend,
    difficultyRamp: settings.difficultyRamp,
  };
}

/** Returns only the fields that differ from the loaded settings. */
function diff(settings: Settings, form: FormState): Partial<Settings> {
  const changes: Partial<Settings> = {};
  if (form.defaultExamSize !== settings.defaultExamSize) {
    changes.defaultExamSize = form.defaultExamSize;
  }
  if (form.defaultPassBar !== settings.defaultPassBar) {
    changes.defaultPassBar = form.defaultPassBar;
  }
  if (form.defaultCooldownMin !== settings.defaultCooldownMin) {
    changes.defaultCooldownMin = form.defaultCooldownMin;
  }
  if (form.knowledgeBackend !== settings.knowledgeBackend) {
    changes.knowledgeBackend = form.knowledgeBackend;
  }
  if (form.difficultyRamp !== settings.difficultyRamp) {
    changes.difficultyRamp = form.difficultyRamp;
  }
  return changes;
}

export default function Settings() {
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Global defaults that gate exam creation and the AI knowledge backend."
      />

      {settingsQuery.isPending ? (
        <SettingsSkeleton />
      ) : settingsQuery.isError ? (
        <ErrorState
          message={settingsQuery.error.message}
          onRetry={() => void settingsQuery.refetch()}
          retrying={settingsQuery.isFetching}
        />
      ) : (
        <SettingsForm
          key={settingsQuery.data.id}
          settings={settingsQuery.data}
          saving={updateSettings.isPending}
          onSave={async (changes) => {
            await updateSettings.mutateAsync(changes);
          }}
        />
      )}
    </div>
  );
}

interface SettingsFormProps {
  settings: Settings;
  saving: boolean;
  onSave: (changes: Partial<Settings>) => Promise<void>;
}

function SettingsForm({ settings, saving, onSave }: SettingsFormProps) {
  const [form, setForm] = useState<FormState>(() => formFromSettings(settings));

  // Re-sync local edits whenever a fresh settings object arrives (e.g. after a
  // successful save invalidates and refetches the singleton).
  useEffect(() => {
    setForm(formFromSettings(settings));
  }, [settings]);

  const changes = diff(settings, form);
  const dirty = Object.keys(changes).length > 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving) return;
    void onSave(changes);
  }

  function handleReset() {
    setForm(formFromSettings(settings));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card padding="md" className="space-y-6">
        <div>
          <h2 className="font-display text-display-sm text-foreground">
            Exam defaults
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Applied to every new exam unless overridden on the exam itself.
          </p>
        </div>

        <SettingRow
          title="Default exam size"
          description="Number of questions assembled for a new exam."
          htmlFor="setting-exam-size"
        >
          <NumberStepper
            id="setting-exam-size"
            label="Default exam size"
            value={form.defaultExamSize}
            min={1}
            max={200}
            step={1}
            suffix="questions"
            onChange={(value) =>
              setForm((f) => ({ ...f, defaultExamSize: value }))
            }
          />
        </SettingRow>

        <SettingRow
          title="Default pass bar"
          description="Score threshold a student must reach to pass."
          htmlFor="setting-pass-bar"
        >
          <NumberStepper
            id="setting-pass-bar"
            label="Default pass bar"
            value={form.defaultPassBar}
            min={0}
            max={100}
            step={5}
            suffix="%"
            onChange={(value) =>
              setForm((f) => ({ ...f, defaultPassBar: value }))
            }
          />
        </SettingRow>

        <SettingRow
          title="Default cooldown"
          description="Wait time before a new attempt is allowed after a failed exam."
          htmlFor="setting-cooldown"
        >
          <NumberStepper
            id="setting-cooldown"
            label="Default cooldown"
            value={form.defaultCooldownMin}
            min={0}
            max={1440}
            step={5}
            suffix="min"
            onChange={(value) =>
              setForm((f) => ({ ...f, defaultCooldownMin: value }))
            }
          />
        </SettingRow>

        <SettingRow
          title="Difficulty ramp"
          description="Ramp questions from easy to hard across the delivered exam."
        >
          <Toggle
            checked={form.difficultyRamp}
            aria-label="Difficulty ramp"
            labelPosition="after"
            onChange={(checked) =>
              setForm((f) => ({ ...f, difficultyRamp: checked }))
            }
          />
        </SettingRow>
      </Card>

      <Card padding="md" className="space-y-6">
        <div>
          <h2 className="font-display text-display-sm text-foreground">
            Knowledge backend
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            The backend used by the AI tutor and ingestion (Phase 2).
          </p>
        </div>

        <SettingRow
          title="Backend"
          description="The AI provider for the tutor and generation (Ollama Cloud, Gemini, or NotebookLM)."
          htmlFor="setting-knowledge-backend"
        >
          <Select
            id="setting-knowledge-backend"
            label="Knowledge backend"
            options={KNOWLEDGE_BACKEND_OPTIONS}
            value={form.knowledgeBackend}
            onChange={(event) =>
              setForm((f) => ({
                ...f,
                knowledgeBackend: event.target.value as KnowledgeBackend,
              }))
            }
          />
        </SettingRow>
      </Card>

      <Card padding="md" className="space-y-6">
        <div>
          <h2 className="font-display text-display-sm text-foreground">
            Rewards
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Reward knobs are stored now and enabled with Guardian (Phase 3).
          </p>
        </div>

        <SettingRow
          title="Reward rate"
          description="Minutes of earned time per correct question."
          note="Enabled with Guardian (Phase 3)"
        >
          <NumberStepper
            label="Reward rate"
            value={settings.rewardRateMinPerQ}
            min={0}
            max={60}
            step={1}
            suffix="min/Q"
            disabled
            onChange={() => undefined}
          />
        </SettingRow>

        <SettingRow
          title="Daily cap"
          description="Maximum hours of earned time per day."
          note="Enabled with Guardian (Phase 3)"
        >
          <NumberStepper
            label="Daily cap"
            value={settings.dailyCapHours}
            min={0}
            max={24}
            step={1}
            suffix="hours"
            disabled
            onChange={() => undefined}
          />
        </SettingRow>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={handleReset}
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

interface SettingRowProps {
  title: string;
  description?: string;
  note?: string;
  htmlFor?: string;
  children: React.ReactNode;
}

function SettingRow({
  title,
  description,
  note,
  htmlFor,
  children,
}: SettingRowProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:max-w-md">
        {htmlFor ? (
          <label
            htmlFor={htmlFor}
            className="block text-sm font-semibold text-foreground"
          >
            {title}
          </label>
        ) : (
          <p className="text-sm font-semibold text-foreground">{title}</p>
        )}
        {description ? (
          <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>
        ) : null}
        {note ? (
          <p className="mt-1 text-xs font-medium text-foreground-muted">
            {note}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-48 animate-pulse rounded-card border border-border bg-surface-muted"
        />
      ))}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger bg-danger-soft p-8 text-center"
    >
      <h2 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load settings
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-5">
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
