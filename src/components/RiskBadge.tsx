import type { Risk } from '../domain/types';

const LABEL: Record<NonNullable<Risk>, string> = {
  overdue: 'Overdue',
  at_risk: 'At risk',
  due_soon: 'Due soon',
  start_today: 'Start today',
};

export function riskLabel(risk: Risk): string | null {
  return risk ? LABEL[risk] : null;
}

export function RiskBadge({ risk }: { risk: Risk }) {
  if (!risk) return null;
  return (
    <span className="badge" data-risk={risk}>
      {LABEL[risk]}
    </span>
  );
}
