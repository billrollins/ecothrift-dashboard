import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImageViewerDialog } from './ImageViewerDialog';

describe('ImageViewerDialog', () => {
  it('renders title, fit/zoom controls, download, and closes', () => {
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
    expect(screen.getByLabelText(/zoom in/i)).toBeTruthy();
    expect(screen.getByLabelText(/zoom out/i)).toBeTruthy();
    expect(screen.getByLabelText(/fit to screen/i)).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^download$/i })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes download handler', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /^download$/i }));
    expect(onDownload).toHaveBeenCalled();
  });

  it('shows Replace and invokes onReplaceFile when a file is chosen', () => {
    const onReplaceFile = vi.fn().mockResolvedValue(undefined);
    render(
      <ImageViewerDialog
        open
        onClose={() => {}}
        src="https://example.com/photo.jpg"
        alt="BOL"
        title="BOL"
        onReplaceFile={onReplaceFile}
      />,
    );
    expect(screen.getByRole('button', { name: /^replace$/i })).toBeTruthy();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File(['fake'], 'new-bol.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onReplaceFile).toHaveBeenCalledWith(file);
  });

  it('hides Replace when onReplaceFile is omitted', () => {
    render(
      <ImageViewerDialog
        open
        onClose={() => {}}
        src="https://example.com/photo.jpg"
        alt="BOL"
        title="BOL"
      />,
    );
    expect(screen.queryByRole('button', { name: /^replace$/i })).toBeNull();
  });

  it('enters crop/rotate edit mode when canEdit', () => {
    render(
      <ImageViewerDialog
        open
        onClose={() => {}}
        src="https://example.com/photo.jpg"
        alt="BOL"
        title="BOL"
        canEdit
        onSaveEdited={vi.fn()}
      />,
    );
    const img = screen.getByAltText('BOL');
    fireEvent.load(img);
    const cropBtn = screen.getByRole('button', { name: /crop \/ rotate/i });
    expect(cropBtn).not.toBeDisabled();
    fireEvent.click(cropBtn);
    expect(screen.getByLabelText(/rotate right/i)).toBeTruthy();
    expect(screen.getByLabelText(/rotate left/i)).toBeTruthy();
    expect(screen.getByText(/corners \/ edges/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
  });

  it('navigates with arrows and keyboard', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <ImageViewerDialog
        open
        onClose={() => {}}
        src="https://example.com/photo.jpg"
        alt="BOL"
        title="Bill of Lading"
        positionLabel="1 / 3"
        hasPrev={false}
        hasNext
        onPrev={onPrev}
        onNext={onNext}
      />,
    );
    expect(screen.getByText(/1 \/ 3/)).toBeTruthy();
    expect(screen.getByLabelText(/previous photo/i)).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/next photo/i));
    expect(onNext).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPrev).not.toHaveBeenCalled(); // hasPrev false
  });
});
