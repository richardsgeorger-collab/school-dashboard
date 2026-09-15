import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { dateOf, fmtDate } from '../domain/dates';
import type { Course } from '../domain/types';
import { classVerifications, type ClassVerification } from '../halo/verification';
import { useStore } from '../storage/store';

function status(v: ClassVerification, tz: string): string {
  if (!v.last) return 'never checked';
  const day = fmtDate(dateOf(v.last.at, tz), 'short');
  if (v.last.partial) return `partial · ${day}${v.last.skipped?.length ? ` · ${v.last.skipped.length} skipped` : v.last.coverage ? ` · ${v.last.coverage.visited} of ${v.last.coverage.planned} pages` : ''}`;
  if (v.last.clean) return `clean · ${day}${v.streak > 1 ? ` · ${v.streak} in a row` : ''}`;
  return `${v.last.findings} finding${v.last.findings === 1 ? '' : 's'} · ${day}`;
}

/** Every class, one at a time, or a single class to re-check. Weakest first, so the next thing to check is on top. */
export function HaloClassPicker({ onPick, onClose }: { onPick: (course: Course | null) => void; onClose: () => void }) {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const vs = classVerifications(data.settings.haloChecks, data.courses, data.items, today, tz);
  const never = vs.filter((v) => v.state === 'never').length;
  return (
    <Modal title="Check Halo" onClose={onClose}>
      <div className="modal-body">
        <p className="hint">The prompt goes on the clipboard and Halo opens. Claude works one class at a time to full depth, whichever you pick.</p>
        <button type="button" className="halo-pick-row halo-pick-all" onClick={() => onPick(null)}>
          <span className="halo-pick-name">
            <b>All classes, one at a time</b>
          </span>
          <span className="halo-pick-status mono">{never ? `${never} never checked` : `${vs.length} classes`}</span>
        </button>
        <p className="hint" style={{ marginTop: 6 }}>
          Or re-check just one:
        </p>
        <ul className="halo-pick">
          {vs.map((v) => (
            <li key={v.course.id}>
              <button type="button" className="halo-pick-row" data-state={v.state} onClick={() => onPick(v.course)}>
                <span className="halo-pick-name">
                  <CourseChip course={v.course} /> <span>{v.course.name}</span>
                </span>
                <span className="halo-pick-status mono">{status(v, tz)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
