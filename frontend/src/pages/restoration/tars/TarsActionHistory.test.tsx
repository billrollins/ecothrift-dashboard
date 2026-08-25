import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TarsActionHistory } from './TarsActionHistory';

vi.mock('../../../hooks/useItemNotes', () => ({
  useJobNotes: () => ({ data: [], isLoading: false }),
  useReviseItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('TarsActionHistory', () => {
  it('has no Clear history button', () => {
    render(
      <TarsActionHistory
        actions={{
          current_action_id: null,
          results: [],
          totals: { total_seconds: 0, by_grade: {}, by_category: {} },
        }}
        events={[]}
        currentUserId={1}
        onDescribe={vi.fn()}
        onEnter={vi.fn()}
        onStartAction={vi.fn()}
        onChangeCategory={vi.fn()}
        onUndo={vi.fn()}
        onDeleteAction={vi.fn()}
        onForgetWords={vi.fn()}
        onResetNote={vi.fn()}
      />,
    );
    expect(screen.queryByText('Clear history')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear history' })).not.toBeInTheDocument();
  });
});
