// Guardian — plain-text labels shared by the tabs (kept out of the component
// files so React Fast Refresh keeps working).

import type { components } from '../../api/schema';

type WallKind = components['schemas']['WallKind'];

/** Human label for the wall implementation. */
export function wallLabel(wall: WallKind): string {
  return wall === 'routeros' ? 'MikroTik RouterOS' : 'Fake wall (dev)';
}
