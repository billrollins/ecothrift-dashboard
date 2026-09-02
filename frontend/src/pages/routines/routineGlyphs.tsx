import BoltRounded from '@mui/icons-material/BoltRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DateRangeRounded from '@mui/icons-material/DateRangeRounded';
import EventRepeatRounded from '@mui/icons-material/EventRepeatRounded';
import PriorityHighRounded from '@mui/icons-material/PriorityHighRounded';
import PushPinRounded from '@mui/icons-material/PushPinRounded';
import ReportRounded from '@mui/icons-material/ReportRounded';
import TimelapseRounded from '@mui/icons-material/TimelapseRounded';
import WbSunnyRounded from '@mui/icons-material/WbSunnyRounded';
import type { ReactElement } from 'react';
import type { RoutineTrigger } from '../../api/routines.api';
import type { RunGlyph } from './runStatus';

/** Icon for a run row's tile. The tone comes from `presentRun`. */
export function runGlyphIcon(glyph: RunGlyph): ReactElement {
  switch (glyph) {
    case 'alert': return <PriorityHighRounded />;
    case 'pin': return <PushPinRounded />;
    case 'today': return <WbSunnyRounded />;
    case 'progress': return <TimelapseRounded />;
    case 'passed': return <CheckRounded />;
    case 'failed': return <CloseRounded />;
    case 'critical': return <ReportRounded />;
    case 'week':
    default: return <DateRangeRounded />;
  }
}

/** Icon for a catalog row's tile — says how often it comes round. */
export function triggerGlyphIcon(trigger: RoutineTrigger | string): ReactElement {
  switch (trigger) {
    case 'daily': return <WbSunnyRounded />;
    case 'weekly': return <DateRangeRounded />;
    case 'biweekly': return <EventRepeatRounded />;
    case 'on_demand': return <BoltRounded />;
    case 'monthly':
    case 'quarterly':
    case 'annual':
    default: return <CalendarMonthRounded />;
  }
}
