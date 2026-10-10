import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TrainingBanner, TrainingPaymentDialog } from './TrainingRegister';

describe('Training register (2026-10-10)', () => {
  it('always says it is not a real sale', () => {
    render(<TrainingBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('TRAINING REGISTER: NOT A REAL SALE');
  });

  it('stops every payment at THIS IS JUST A TEST', async () => {
    const onFinish = vi.fn();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<TrainingPaymentDialog open onFinish={onFinish} onBack={onBack} />);
    expect(screen.getByText('THIS IS JUST A TEST')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Finish practice sale' }));
    expect(onFinish).toHaveBeenCalled();
  });
});
