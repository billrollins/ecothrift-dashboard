import { Box, Stack } from '@mui/material';
import { StudioStepDot } from './TarsStudioPrimitives';
import { studio } from './tarsStudioTheme';

export function StudioStepper({
  steps,
  activeIndex,
  completed,
  onStepClick,
}: {
  steps: Array<{ id: string; label: string; short: string }>;
  activeIndex: number;
  completed: boolean[];
  onStepClick?: (id: string) => void;
}) {
  return (
    <Box
      sx={{
        px: 0.75,
        py: 0.65,
        mb: 0.75,
        borderRadius: `${studio.radius.md}px`,
        bgcolor: studio.panel,
        border: `1px solid ${studio.panelBorder}`,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={0.25}>
        {steps.map((entry, index) => (
          <StudioStepDot
            key={entry.id}
            index={index}
            label={entry.short}
            active={index === activeIndex}
            done={completed[index] ?? false}
            onClick={onStepClick ? () => onStepClick(entry.id) : undefined}
          />
        ))}
      </Stack>
    </Box>
  );
}
