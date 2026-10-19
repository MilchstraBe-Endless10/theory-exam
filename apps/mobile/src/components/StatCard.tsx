import type { TablerIcon } from '@tabler/icons-react';
import { IconChevronRight } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

type StatCardProps = {
  label: string;
  detail: string;
  to: string;
  icon: TablerIcon;
  tone: 'mint' | 'blue' | 'red' | 'amber';
};

export default function StatCard({ label, detail, to, icon: Icon, tone }: StatCardProps) {
  return (
    <Link className="stat-card card" to={to}>
      <span className={`stat-icon icon-tile ${tone}`}><Icon size={29} stroke={1.8} /></span>
      <span className="stat-copy">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">—</strong>
        <span className="stat-detail">{detail}</span>
      </span>
      <IconChevronRight className="stat-arrow" size={19} stroke={1.7} />
    </Link>
  );
}
