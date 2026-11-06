import { Box } from '@mui/material';
import type { ReactNode, Ref } from 'react';

/**
 * One step of the Return window: the top and the bottom stay put and only the middle scrolls, so the search box and
 * the next button never scroll away.
 */
export default function StepFrame({ top, children, bottom, scrollRef }: {
  top?: ReactNode;
  children: ReactNode;
  bottom?: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
}) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {top ? <Box sx={{ flexShrink: 0 }}>{top}</Box> : null}
      <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', mx: -1, px: 1 }}>{children}</Box>
      {bottom ? <Box sx={{ flexShrink: 0 }}>{bottom}</Box> : null}
    </Box>
  );
}
