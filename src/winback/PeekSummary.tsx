import { useEffect, useMemo } from 'react';
import { bump } from '../analytics/usage';
import { Modal } from '../components/Modal';
import { PRICES } from '../config/tiers';
import { dateOf, fmtDate } from '../domain/dates';
import type { HaloExport } from '../halo/types';
import { InviteButton } from '../referral/Invite';
import { useStore } from '../storage/store';
import { syncClose } from '../ui/presses';
import { UpgradeButton } from '../views/PlanWall';
import { peekLine, peekSummary } from './peek';
import { winbackFrom } from './WinbackHooks';

/** What a Free student's sync would have brought in, counted from their own Halo data. Nothing is applied. */
export function PeekSummary({ payload, onClose }: { payload: HaloExport; onClose: () => void }) {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const peek = useMemo(() => peekSummary(payload, data, tz), [payload, data, tz]);
  useEffect(() => {
    bump('winback:peek');
    syncClose.current?.();
  }, []);
  const source = winbackFrom() === 'stale' ? 'stale' : 'peek';
  const since = peek.since ? fmtDate(dateOf(peek.since, tz), 'short') : null;
  return (
    <Modal title="What Halo has that your planner doesn't" onClose={onClose}>
      <div className="modal-body peek">
        <p className="peek-line">{peekLine(peek, since)}</p>
        <ul className="peek-counts" aria-label="Counts">
          <li><b>{peek.newAssignments}</b><span>{peek.newAssignments === 1 ? 'new assignment' : 'new assignments'}</span></li>
          <li><b>{peek.movedDates}</b><span>{peek.movedDates === 1 ? 'due date moved' : 'due dates moved'}</span></li>
          <li><b>{peek.workAnnouncements}</b><span>{peek.workAnnouncements === 1 ? 'announcement that looks like work' : 'announcements that look like work'}</span></li>
          <li><b>{peek.newGrades}</b><span>{peek.newGrades === 1 ? 'new grade' : 'new grades'}</span></li>
        </ul>
        <p className="hint">Nothing was added to your planner: on Free, Halo+ only counts. Everything you have stays as it is.</p>
        <div className="peek-actions">
          <UpgradeButton tier="plus" label={`Bring it all in with Plus $${PRICES.plus.month.toFixed(2)}`} source={source} />
          <UpgradeButton tier="max" label={`Get Max $${PRICES.max.month.toFixed(2)}`} primary={false} source={source} cancelNote={false} />
          <InviteButton label="Invite a friend for 30 days free" primary={false} />
        </div>
      </div>
    </Modal>
  );
}
