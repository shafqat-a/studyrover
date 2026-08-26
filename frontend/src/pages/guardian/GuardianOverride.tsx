import { useEffect, useState, type FormEvent } from 'react';
import { Unlock } from 'lucide-react';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { NumberStepper } from '../../components/NumberStepper';
import { Select } from '../../components/Select';
import { Table, type TableColumn } from '../../components/Table';
import { TextInput } from '../../components/TextInput';
import { formatWhen } from '../../components/guardian/countdown';
import type { components } from '../../api/schema';
import { useToast } from '../../app/providers';
import {
  useCreateGuardianGrant,
  useGuardianDevices,
  useGuardianOverrideLog,
} from '../../hooks/useGuardian';
import { GuardianQueryError, GuardianSkeleton, SectionHeading } from './shared';

/**
 * 3-P05 — Guardian override (`/parent/guardian/override`)
 *
 * "Open internet now": a parent-only escape hatch that opens a registered
 * device for N minutes without an exam (3-A10). Every use is written to the
 * override log (shown below the form, newest first) and does not count
 * against the student's daily cap.
 */

type GuardianDevice = components['schemas']['GuardianDevice'];
type GuardianOverrideLog = components['schemas']['GuardianOverrideLog'];

const DEFAULT_MINUTES = 30;

export default function GuardianOverride() {
  const devicesQuery = useGuardianDevices();
  const logQuery = useGuardianOverrideLog();

  if (devicesQuery.isPending || logQuery.isPending) {
    return <GuardianSkeleton rows={2} />;
  }
  if (devicesQuery.isError) {
    return (
      <GuardianQueryError
        error={devicesQuery.error}
        onRetry={() => void devicesQuery.refetch()}
        retrying={devicesQuery.isFetching}
        title="Couldn’t load devices"
      />
    );
  }

  return (
    <div className="space-y-6">
      <OverrideForm devices={devicesQuery.data} />
      <div className="space-y-3">
        <SectionHeading
          title="Override log"
          description="Every manual grant, newest first."
        />
        {logQuery.isError ? (
          <GuardianQueryError
            error={logQuery.error}
            onRetry={() => void logQuery.refetch()}
            retrying={logQuery.isFetching}
            title="Couldn’t load the override log"
          />
        ) : (
          <OverrideLogTable entries={logQuery.data} />
        )}
      </div>
    </div>
  );
}

function OverrideForm({ devices }: { devices: GuardianDevice[] }) {
  const grant = useCreateGuardianGrant();
  const { toast } = useToast();
  const [deviceId, setDeviceId] = useState<string>(devices[0]?.id ?? '');
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  // Keep the selection valid if the device list changes under us.
  useEffect(() => {
    if (!devices.some((d) => d.id === deviceId)) {
      setDeviceId(devices[0]?.id ?? '');
    }
  }, [devices, deviceId]);

  const noDevices = devices.length === 0;
  const deviceError =
    touched && deviceId === '' ? 'Pick a device to open.' : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (deviceId === '') return;
    grant.mutate(
      { deviceId, minutes, reason: reason.trim() || undefined },
      {
        onSuccess: (opened) => {
          toast(`Opened ${opened.deviceName} for ${opened.minutes} minutes`, {
            variant: 'success',
          });
          setReason('');
          setTouched(false);
        },
      },
    );
  }

  return (
    <Card padding="md">
      <SectionHeading
        title="Open internet now"
        description="Open a device for a while without an exam. This is logged and does not count against the daily cap."
      />
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label="Device"
            required
            value={deviceId}
            error={deviceError}
            placeholder={noDevices ? 'No registered devices' : 'Choose a device'}
            disabled={noDevices}
            hint={
              noDevices
                ? 'Register a device on the Devices tab first.'
                : undefined
            }
            options={devices.map((d) => ({
              value: d.id,
              label: `${d.name} · ${d.mac}`,
            }))}
            onChange={(e) => setDeviceId(e.target.value)}
          />
          <TextInput
            label="Reason (optional)"
            value={reason}
            placeholder="e.g. homework research"
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <label
              htmlFor="override-minutes"
              className="text-sm font-medium text-foreground"
            >
              Minutes
            </label>
            <NumberStepper
              id="override-minutes"
              label="Minutes"
              value={minutes}
              min={5}
              max={240}
              step={5}
              suffix="min"
              onChange={setMinutes}
            />
          </div>
          <Button
            type="submit"
            loading={grant.isPending}
            disabled={noDevices}
            leadingIcon={<Unlock className="h-4 w-4" aria-hidden="true" />}
          >
            Open internet now
          </Button>
        </div>
      </form>
    </Card>
  );
}

const LOG_COLUMNS: Array<TableColumn<GuardianOverrideLog>> = [
  {
    key: 'when',
    header: 'When',
    label: 'When',
    width: '9rem',
    cell: (e) => (
      <span className="whitespace-nowrap text-foreground-muted">
        {formatWhen(e.at)}
      </span>
    ),
  },
  {
    key: 'device',
    header: 'Device',
    label: 'Device',
    cell: (e) => <span className="font-medium">{e.deviceName}</span>,
  },
  {
    key: 'minutes',
    header: 'Minutes',
    label: 'Minutes',
    align: 'right',
    width: '6rem',
    cell: (e) => <span className="tabular-nums">{e.minutes}</span>,
  },
  {
    key: 'reason',
    header: 'Reason',
    label: 'Reason',
    cell: (e) => (
      <span className="text-foreground-muted">{e.reason ?? '—'}</span>
    ),
  },
];

function OverrideLogTable({ entries }: { entries: GuardianOverrideLog[] }) {
  return (
    <Table<GuardianOverrideLog>
      columns={LOG_COLUMNS}
      rows={entries}
      rowKey={(e) => e.id}
      caption="Parent override log"
      emptyTitle="No overrides yet"
      emptyDescription="Manual grants you open from the form above are listed here."
    />
  );
}
