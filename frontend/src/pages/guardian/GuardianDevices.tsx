import { useRef, useState, type FormEvent } from 'react';
import { Plus, ScanSearch, Trash2 } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { Table, type TableColumn } from '../../components/Table';
import { TextInput } from '../../components/TextInput';
import { Toggle } from '../../components/Toggle';
import type { components } from '../../api/schema';
import { useToast } from '../../app/providers';
import {
  useCreateGuardianDevice,
  useDeleteGuardianDevice,
  useGuardianDevices,
  useScanGuardianDevices,
  useUpdateGuardianDevice,
} from '../../hooks/useGuardian';
import { normalizeMac } from './mac';
import { GuardianQueryError, GuardianSkeleton, SectionHeading } from './shared';

/**
 * 3-P03 — Guardian devices (`/parent/guardian/devices`)
 *
 * Registers the student's devices (by MAC) with the network wall. Only
 * registered, gated devices are ever blocked — every other device on the
 * network is unaffected. The page offers the registered-devices table (inline
 * gated toggle, delete with confirmation), an "Add device" form with
 * client-side MAC normalisation, and a "Scan network" dialog that lists what
 * the wall can currently see and prefills the form for one click registration.
 */

type GuardianDevice = components['schemas']['GuardianDevice'];
type DiscoveredDevice = components['schemas']['DiscoveredDevice'];

interface DeviceFormState {
  name: string;
  mac: string;
  ip: string;
  hostname: string;
  gated: boolean;
}

const EMPTY_FORM: DeviceFormState = {
  name: '',
  mac: '',
  ip: '',
  hostname: '',
  gated: true,
};

export default function GuardianDevices() {
  const devicesQuery = useGuardianDevices();

  if (devicesQuery.isPending) return <GuardianSkeleton rows={2} />;
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

  return <DevicesBody devices={devicesQuery.data} />;
}

function DevicesBody({ devices }: { devices: GuardianDevice[] }) {
  const [form, setForm] = useState<DeviceFormState>(EMPTY_FORM);
  const [scanOpen, setScanOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const scan = useScanGuardianDevices();

  function prefillFrom(found: DiscoveredDevice) {
    setForm({
      name: found.hostname ?? '',
      mac: found.mac,
      ip: found.ip ?? '',
      hostname: found.hostname ?? '',
      gated: true,
    });
    setScanOpen(false);
    // Land the parent in the name field so they can finish the registration.
    window.setTimeout(() => nameRef.current?.focus(), 0);
  }

  function openScan() {
    setScanOpen(true);
    scan.mutate();
  }

  const registeredMacs = new Set(devices.map((d) => d.mac));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionHeading
          title="Registered devices"
          description="The wall gates only the devices listed here. Everyone else on the network is unaffected."
          actions={
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<ScanSearch className="h-4 w-4" aria-hidden="true" />}
              onClick={openScan}
            >
              Scan network
            </Button>
          }
        />
        <DevicesTable devices={devices} />
      </div>

      <AddDeviceForm
        form={form}
        onChange={setForm}
        onReset={() => setForm(EMPTY_FORM)}
        nameRef={nameRef}
      />

      <ScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        loading={scan.isPending}
        error={scan.error}
        results={scan.data ?? []}
        registeredMacs={registeredMacs}
        onRescan={() => scan.mutate()}
        onRegister={prefillFrom}
      />
    </div>
  );
}

function DevicesTable({ devices }: { devices: GuardianDevice[] }) {
  const update = useUpdateGuardianDevice();
  const remove = useDeleteGuardianDevice();
  const [deleting, setDeleting] = useState<GuardianDevice | null>(null);

  const columns: Array<TableColumn<GuardianDevice>> = [
    {
      key: 'name',
      header: 'Name',
      label: 'Name',
      cell: (d) => <span className="font-medium text-foreground">{d.name}</span>,
    },
    {
      key: 'mac',
      header: 'MAC',
      label: 'MAC',
      cell: (d) => <span className="font-mono text-xs">{d.mac}</span>,
      width: '11rem',
    },
    {
      key: 'net',
      header: 'IP / hostname',
      label: 'IP / hostname',
      cell: (d) =>
        d.ip || d.hostname ? (
          <span className="text-foreground-muted">
            {d.ip ?? ''}
            {d.ip && d.hostname ? ' · ' : ''}
            {d.hostname ?? ''}
          </span>
        ) : (
          <span className="text-foreground-muted">—</span>
        ),
    },
    {
      key: 'gated',
      header: 'Gated',
      label: 'Gated',
      width: '7rem',
      cell: (d) => (
        <span className="inline-flex items-center gap-2">
          <Toggle
            size="sm"
            checked={d.gated}
            aria-label={`Gate ${d.name}`}
            disabled={update.isPending && update.variables?.id === d.id}
            onChange={(gated) =>
              update.mutate({ id: d.id, changes: { gated } })
            }
          />
          <span className="text-xs text-foreground-muted">
            {d.gated ? 'Gated' : 'Always on'}
          </span>
        </span>
      ),
    },
  ];

  return (
    <>
      <Table<GuardianDevice>
        columns={columns}
        rows={devices}
        rowKey={(d) => d.id}
        caption="Registered devices"
        emptyTitle="No devices registered"
        emptyDescription="Add the student's phone, tablet or laptop by MAC address, or scan the network to find it."
        rowActions={(d) => (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove ${d.name}`}
            leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setDeleting(d)}
          >
            Remove
          </Button>
        )}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Remove this device?"
        message={
          deleting
            ? `${deleting.name} (${deleting.mac}) will be unregistered and any open internet session on it revoked. The device itself is no longer gated afterwards.`
            : undefined
        }
        confirmLabel="Remove"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
          } finally {
            setDeleting(null);
          }
        }}
      />
    </>
  );
}

interface AddDeviceFormProps {
  form: DeviceFormState;
  onChange: (next: DeviceFormState) => void;
  onReset: () => void;
  nameRef: React.RefObject<HTMLInputElement>;
}

function AddDeviceForm({ form, onChange, onReset, nameRef }: AddDeviceFormProps) {
  const create = useCreateGuardianDevice();
  const { toast } = useToast();
  const [touched, setTouched] = useState(false);

  const normalizedMac = normalizeMac(form.mac);
  const macError =
    touched && form.mac.trim().length > 0 && normalizedMac === null
      ? 'Enter a MAC like aa:bb:cc:dd:ee:ff (colons, dashes or dots are fine).'
      : touched && form.mac.trim().length === 0
        ? 'A MAC address is required.'
        : undefined;
  const nameError =
    touched && form.name.trim().length === 0 ? 'A name is required.' : undefined;

  function patch(changes: Partial<DeviceFormState>) {
    onChange({ ...form, ...changes });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (form.name.trim().length === 0 || normalizedMac === null) return;
    create.mutate(
      {
        name: form.name.trim(),
        mac: normalizedMac,
        ip: form.ip.trim() || undefined,
        hostname: form.hostname.trim() || undefined,
        gated: form.gated,
      },
      {
        onSuccess: (device) => {
          toast(`Registered ${device.name}`, { variant: 'success' });
          setTouched(false);
          onReset();
        },
      },
    );
  }

  return (
    <Card padding="md">
      <SectionHeading
        title="Add device"
        description="Find the MAC address in the device's Wi-Fi settings. It is registered for the student profile."
      />
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextInput
            ref={nameRef}
            label="Name"
            required
            value={form.name}
            error={nameError}
            placeholder="e.g. Maya's laptop"
            onChange={(e) => patch({ name: e.target.value })}
          />
          <TextInput
            label="MAC address"
            required
            value={form.mac}
            error={macError}
            hint={
              normalizedMac && normalizedMac !== form.mac
                ? `Will be saved as ${normalizedMac}`
                : 'Any common format: aa:bb:cc:dd:ee:ff, AA-BB-…, or aabb.ccdd.eeff'
            }
            placeholder="aa:bb:cc:dd:ee:ff"
            inputMode="text"
            autoCapitalize="off"
            spellCheck={false}
            inputClassName="font-mono"
            onChange={(e) => patch({ mac: e.target.value })}
            onBlur={() => setTouched(true)}
          />
          <TextInput
            label="IP address (optional)"
            value={form.ip}
            placeholder="192.168.88.23"
            inputMode="decimal"
            onChange={(e) => patch({ ip: e.target.value })}
          />
          <TextInput
            label="Hostname (optional)"
            value={form.hostname}
            placeholder="mayas-laptop"
            onChange={(e) => patch({ hostname: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Toggle
            checked={form.gated}
            onChange={(gated) => patch({ gated })}
            label="Gated"
            description="Off = always online (never blocked by the wall)."
            labelPosition="after"
          />
          <Button
            type="submit"
            loading={create.isPending}
            leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            Add device
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface ScanDialogProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: Error | null;
  results: DiscoveredDevice[];
  registeredMacs: Set<string>;
  onRescan: () => void;
  onRegister: (device: DiscoveredDevice) => void;
}

function ScanDialog({
  open,
  onClose,
  loading,
  error,
  results,
  registeredMacs,
  onRescan,
  onRegister,
}: ScanDialogProps) {
  const columns: Array<TableColumn<DiscoveredDevice>> = [
    {
      key: 'mac',
      header: 'MAC',
      label: 'MAC',
      cell: (d) => <span className="font-mono text-xs">{d.mac}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      label: 'IP',
      cell: (d) => <span className="text-foreground-muted">{d.ip ?? '—'}</span>,
    },
    {
      key: 'hostname',
      header: 'Hostname',
      label: 'Hostname',
      cell: (d) => (
        <span className="text-foreground-muted">{d.hostname ?? '—'}</span>
      ),
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Devices on the network"
      description="What the wall can see right now. Register the student's device to gate it."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={onRescan} loading={loading}>
            Scan again
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-foreground-muted" aria-live="polite">
          Scanning the network…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : (
        <Table<DiscoveredDevice>
          columns={columns}
          rows={results}
          rowKey={(d) => d.mac}
          caption="Discovered devices"
          emptyTitle="Nothing found"
          emptyDescription="No devices are visible to the wall right now. Make sure the device is connected to the Wi-Fi and scan again."
          rowActions={(d) =>
            d.registered || registeredMacs.has(d.mac) ? (
              <Badge tone="success" size="sm" dot>
                Registered
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Register ${d.hostname ?? d.mac}`}
                onClick={() => onRegister(d)}
              >
                Register
              </Button>
            )
          }
        />
      )}
    </Dialog>
  );
}
