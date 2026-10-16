import { Alert, Box } from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { TrainingBanner } from '../../components/pos/TrainingRegister';
import { useRegisters } from '../../hooks/usePOS';
import { pickTrainingRegister, TEST_TERMINAL_TITLE } from '../../utils/testTerminal';
import TerminalPage from './TerminalPage';

/**
 * /pos/test (owner, 2026-10-16): the terminal on the training register, on any computer, any time, for training
 * and for trying out new roll-outs. It never reads or changes this computer's saved device setup, so
 * /pos/terminal here stays on its own register. The practice drawer opens by itself (TerminalPage, testRegister).
 */
export default function TestTerminalPage() {
  const { data, isLoading, isError } = useRegisters({ page_size: 200 });

  if (isLoading) return <LoadingScreen message="Loading the test terminal..." />;

  const training = pickTrainingRegister(data?.results ?? []);
  if (!training) {
    return (
      <Box>
        <TrainingBanner />
        <PageHeader title={TEST_TERMINAL_TITLE} />
        <Alert severity="error" sx={{ maxWidth: 640 }}>
          {isError
            ? 'Could not load the registers. Check the connection and reload this page.'
            : 'There is no training register (TRAIN), so the test terminal cannot start. A manager can set one up '
              + 'in Django admin: a register marked "is training". Real registers are never used here.'}
        </Alert>
      </Box>
    );
  }

  return <TerminalPage key={training.id} testRegister={training} />;
}
