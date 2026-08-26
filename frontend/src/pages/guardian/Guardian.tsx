import { Outlet } from 'react-router-dom';
import {
  Activity,
  Smartphone,
  SlidersHorizontal,
  Unlock,
} from 'lucide-react';

import { PageHeader } from '../../components/PageHeader';
import { Tabs } from '../../components/Tabs';
import { useGuardianStatus } from '../../hooks/useGuardian';
import { GuardianDisabledState, GuardianQueryError, GuardianSkeleton } from './shared';

/**
 * 3-P01 — Guardian (parent area hub, `/parent/guardian`)
 *
 * Hosts the routed tabs for the Guardian add-on — Overview, Devices, Policy,
 * Override — each mounted through the nested <Outlet/>. The hub owns the one
 * question every tab shares: is the Guardian wired into this server at all?
 * `GET /guardian/status` answers `enabled:false` (not an error) when it is
 * not, in which case the tabs are replaced by the "not enabled" empty state
 * with the environment instructions.
 */

const GUARDIAN_TABS = [
  {
    id: 'overview',
    label: 'Overview',
    to: '/parent/guardian',
    icon: <Activity className="h-4 w-4" aria-hidden="true" />,
  },
  {
    id: 'devices',
    label: 'Devices',
    to: '/parent/guardian/devices',
    icon: <Smartphone className="h-4 w-4" aria-hidden="true" />,
  },
  {
    id: 'policy',
    label: 'Policy',
    to: '/parent/guardian/policy',
    icon: <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />,
  },
  {
    id: 'override',
    label: 'Override',
    to: '/parent/guardian/override',
    icon: <Unlock className="h-4 w-4" aria-hidden="true" />,
  },
];

export default function Guardian() {
  const statusQuery = useGuardianStatus();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guardian"
        subtitle="Earned internet time — passed exams open the student's devices on the network wall for a while."
      />

      {statusQuery.isPending ? (
        <GuardianSkeleton rows={2} />
      ) : statusQuery.isError ? (
        <GuardianQueryError
          error={statusQuery.error}
          onRetry={() => void statusQuery.refetch()}
          retrying={statusQuery.isFetching}
        />
      ) : !statusQuery.data.enabled ? (
        <GuardianDisabledState />
      ) : (
        <>
          <Tabs
            routed
            items={GUARDIAN_TABS}
            aria-label="Guardian sections"
            className="overflow-x-auto"
          />
          <Outlet />
        </>
      )}
    </div>
  );
}
