import { Popover } from '@mui/material';
import { ccTokens } from '../../../theme';

export function NudgePopover({
  anchor,
  owner,
  message,
  onCopy,
  onClose,
}: {
  anchor: HTMLElement | null;
  owner: string;
  message: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <Popover
      open={Boolean(anchor)}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { p: 1.5, width: 280, fontFamily: ccTokens.font } } }}
    >
      <div className="nudge-pop">
        <b>{owner}</b>
        <p>{message}</p>
        <button type="button" onClick={onCopy}>Copy</button>
      </div>
    </Popover>
  );
}
