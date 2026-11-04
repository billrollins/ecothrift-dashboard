import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle } from 'react';
import type { SigningSource, SigningState } from './api';
import { SignerFlow } from './SignerFlow';
import { blanksIn, syncFields } from './blanks';

// jsdom has no canvas: a stand-in pad that "draws" on a tap and returns a PNG blob.
vi.mock('./FingerPad', () => ({
  default: forwardRef(function FakePad({ onInk }: { onInk: (b: boolean) => void }, ref) {
    useImperativeHandle(ref, () => ({ clear: () => onInk(false), toBlob: async () => new Blob(['png'], { type: 'image/png' }) }));
    return <button data-testid="esign-signature-pad" onClick={() => onInk(true)}>draw</button>;
  }),
}));

// jsdom cannot run pdf.js: a stand-in that draws one 600 x 800 page and whatever goes over it.
vi.mock('./PdfPages', () => ({
  boxWord: (k: string) => ({ signature: 'Signature', name: 'Printed name', date: 'Date' } as Record<string, string>)[k] ?? k,
  PdfPages: ({ data, overlay }: { data: ArrayBuffer; overlay?: (s: { page: number; width: number; height: number }) => React.ReactNode }) => (
    <div data-testid="pdf-pages" data-bytes={data.byteLength}>{overlay?.({ page: 1, width: 600, height: 800 })}</div>
  ),
}));

const TEXT = 'Salon Director Agreement\n\n## 1. The role\nSam Sample is the director.\n\n## 2. Check-ins\nDay 30, 60 and 90.';
const ok = (over: Partial<SigningState> = {}): SigningState => ({
  ok: true, state: 'ok', title: 'Salon Director Agreement', text: TEXT, signer_name: 'Sam Sample', signer_title: '', role_label: 'Director',
  acknowledgments: ['I have read the duties list.'], consent: 'I agree to sign this document electronically.', company: 'Acme Test Co',
  others_after: 2, ...over,
});

function source(state: SigningState, signResult = { ok: true, signed: true, complete: false }) {
  const s: SigningSource = {
    load: vi.fn().mockResolvedValue(state), sign: vi.fn().mockResolvedValue(signResult), pdf: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  };
  return s;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('signing screens (one step per screen)', () => {
  it('reads, confirms each statement, agrees, signs, and sends exactly that', async () => {
    const src = source(ok());
    const user = userEvent.setup();
    render(<SignerFlow source={src} />);
    expect(await screen.findByTestId('step-read')).toBeInTheDocument();
    expect(screen.getByTestId('sign-progress')).toHaveTextContent('Step 1 of 4');
    expect(screen.getByTestId('document-text')).toHaveTextContent('Sam Sample is the director.');
    expect(screen.getByRole('heading', { name: '1. The role' })).toBeInTheDocument();
    await user.click(screen.getByTestId('step-next'));

    // Every statement must be ticked to go on.
    expect(screen.getByTestId('step-confirm')).toBeInTheDocument();
    await user.click(screen.getByTestId('step-next'));
    expect(screen.getByRole('alert')).toHaveTextContent('Tick every statement');
    await user.click(screen.getByTestId('ack-0'));
    await user.click(screen.getByTestId('step-next'));

    // Consent and a name; the title is optional.
    await user.click(screen.getByTestId('step-next'));
    expect(screen.getByRole('alert')).toHaveTextContent('Tick the box to sign electronically.');
    await user.click(screen.getByTestId('consent-tick'));
    await user.click(screen.getByTestId('step-next'));

    expect(screen.getByTestId('sign-progress')).toHaveTextContent('Step 4 of 4');
    expect(screen.getByTestId('sign-submit')).toBeDisabled();
    await user.click(screen.getByTestId('esign-signature-pad'));
    await user.click(screen.getByTestId('sign-submit'));
    expect(await screen.findByTestId('sign-done')).toHaveTextContent('The others still need to sign');
    expect(src.sign).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Sam Sample', consent: true, acknowledgments: [true], signature: expect.stringMatching(/^data:image\/png;base64,/),
    }));
  });

  it('with no statements there is no confirm step; the last signer hears everyone has signed', async () => {
    const user = userEvent.setup();
    render(<SignerFlow source={source(ok({ acknowledgments: [] }), { ok: true, signed: true, complete: true })} />);
    await user.click(await screen.findByTestId('step-next'));
    expect(screen.getByTestId('sign-progress')).toHaveTextContent('Step 2 of 3');
    await user.click(screen.getByTestId('consent-tick'));
    await user.click(screen.getByTestId('step-next'));
    await user.click(screen.getByTestId('esign-signature-pad'));
    await user.click(screen.getByTestId('sign-submit'));
    expect(await screen.findByTestId('sign-done')).toHaveTextContent('Everyone has now signed');
  });

  it('says plainly when a link is used, expired, cancelled, or it is not your turn', async () => {
    for (const [state, title] of [['used', 'Already signed'], ['expired', 'This link has expired'], ['void', 'Cancelled'], ['waiting', 'Not your turn yet']] as const) {
      const { unmount } = render(<SignerFlow source={source({ ok: false, state, detail: 'Words from the server.' })} />);
      expect(await screen.findByTestId(`sign-gone-${state}`)).toHaveTextContent(title);
      expect(screen.getByTestId('sign-gone-message')).toHaveTextContent('Words from the server.');
      unmount();
    }
  });
});

describe('template blanks', () => {
  it('finds the fill-ins and skips the built-ins and party blanks', () => {
    const sections = [{ heading: '{{party_1_name}}', body: 'Starts {{start_date}} for {{company_name}}; pay {{pay}}; {{party_2_role}}' }];
    expect(blanksIn(sections)).toEqual(['start_date', 'pay']);
    expect(syncFields(sections, [{ key: 'pay', label: 'Monthly pay', kind: 'text', required: false, options: [], default: '' }]).map((f) => [f.key, f.label]))
      .toEqual([['start_date', 'Start date'], ['pay', 'Monthly pay']]);
  });
});

describe('an uploaded PDF', () => {
  it("shows its pages with the signer's own boxes marked, and the signature goes in every box of theirs", async () => {
    const src = source(ok({
      source: 'pdf', text: '', page_count: 3, acknowledgments: [],
      boxes: [
        { signer: 2, kind: 'signature', page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
        { signer: 2, kind: 'date', page: 1, x: 0.5, y: 0.8, w: 0.15, h: 0.03 },
        { signer: 2, kind: 'signature', page: 3, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
      ],
    }));
    const user = userEvent.setup();
    render(<SignerFlow source={src} />);
    expect(await screen.findByTestId('pdf-pages')).toHaveAttribute('data-bytes', '8');
    expect(src.pdf).toHaveBeenCalledTimes(1);
    const boxes = screen.getAllByTestId('my-box');
    expect(boxes).toHaveLength(2); // the page shown is page 1
    expect(boxes[0]).toHaveTextContent('You sign here');
    expect(boxes[0]).toHaveStyle({ left: '60px', top: '640px', width: '180px' });
    expect(boxes[1]).toHaveTextContent('Date');
    expect(screen.getByText(/3 pages\. The marked boxes are yours/)).toBeInTheDocument();
    await user.click(screen.getByTestId('step-next'));
    await user.click(screen.getByTestId('consent-tick'));
    await user.click(screen.getByTestId('step-next'));
    expect(screen.getByTestId('step-sign')).toHaveTextContent('It goes in all 2 boxes marked for you.');
  });
});
