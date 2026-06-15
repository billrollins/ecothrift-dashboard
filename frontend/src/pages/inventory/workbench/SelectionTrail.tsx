import { Breadcrumbs, Link, Typography } from '@mui/material';
import type { WorkbenchSelection } from '../../../utils/richInventorySearch';

export interface SelectionTrailProps {
  trail: WorkbenchSelection[];
  onNavigate: (sel: WorkbenchSelection) => void;
}

function trailLabel(sel: WorkbenchSelection): string {
  if (sel.label) return sel.label;
  if (sel.type === 'product') return `Product #${sel.id}`;
  if (sel.type === 'checkin') return `Check-in #${sel.id}`;
  return `Item #${sel.id}`;
}

export function SelectionTrail({ trail, onNavigate }: SelectionTrailProps) {
  if (!trail.length) return null;
  return (
    <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.8125rem' }}>
      {trail.map((sel, idx) => {
        const label = trailLabel(sel);
        const isLast = idx === trail.length - 1;
        if (isLast) {
          return (
            <Typography key={`${sel.type}-${sel.id}`} color="text.primary" sx={{ fontWeight: 700, fontSize: 'inherit' }}>
              {label}
            </Typography>
          );
        }
        return (
          <Link
            key={`${sel.type}-${sel.id}`}
            component="button"
            underline="hover"
            color="inherit"
            sx={{ fontSize: 'inherit', cursor: 'pointer' }}
            onClick={() => onNavigate(sel)}
          >
            {label}
          </Link>
        );
      })}
    </Breadcrumbs>
  );
}
