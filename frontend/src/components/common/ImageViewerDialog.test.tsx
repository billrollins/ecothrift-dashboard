import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImageViewerDialog } from './ImageViewerDialog';

describe('ImageViewerDialog', () => {
  it('renders title and closes', () => {
    const onClose = vi.fn();
    render(
      <ImageViewerDialog
        open
        onClose={onClose}
        src="https://example.com/photo.jpg"
        alt="BOL"
        title="BOL photo"
        filename="bol.jpg"
      />,
    );
    expect(screen.getByText('BOL photo')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes optional download action', async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(
      <ImageViewerDialog
        open
        onClose={() => {}}
        src="https://example.com/photo.jpg"
        alt="Truck"
        title="Truck"
        onDownload={onDownload}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /download original/i }));
    expect(onDownload).toHaveBeenCalled();
  });
});
