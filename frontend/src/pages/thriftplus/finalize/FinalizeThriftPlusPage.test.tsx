import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ThriftPendingPerson } from '../../../api/thriftplusRegister.api';
import { isThriftCardCode } from '../../../utils/thriftPlusCard';
import FinalizeThriftPlusPage, { SIGNATURE_WORDS, codeMemberMessage } from './FinalizeThriftPlusPage';

const api = vi.hoisted(() => ({ findPendingOrMember: vi.fn(), finishThriftJoin: vi.fn() }));
vi.mock('../../../api/thriftplusRegister.api', async (orig) => ({
  ...(await orig<typeof import('../../../api/thriftplusRegister.api')>()),
  findPendingOrMember: api.findPendingOrMember,
  finishThriftJoin: api.finishThriftJoin,
}));

// jsdom has no camera: the test plays the decoder, handing the page what the camera "read".
const camera = vi.hoisted(() => ({ onDecode: null as null | ((raw: string) => void), enabled: false }));
vi.mock('../scanner/useQrCamera', () => ({
  useQrCamera: (opts: { enabled: boolean; onDecode: (raw: string) => void }) => {
    camera.onDecode = opts.onDecode;
    camera.enabled = opts.enabled;
    return { videoRef: { current: null }, status: 'live', error: '', decoder: 'native', wake: vi.fn(), restart: vi.fn(), poke: vi.fn(), zoom: null, switching: false };
  },
}));

vi.mock('../../../services/receiving/receivingClient', () => ({
  compressImageToJpeg: vi.fn(async (f: Blob) => f),
}));

const CARA: ThriftPendingPerson = {
  person_id: 7, account_id: 3, first_name: 'Cara', last_name: 'Joyner', email: 'cara@example.com',
  joined_at: '2026-10-16T14:05:00Z', code_last4: '1907',
};
const CODE = '402155831900';

beforeEach(() => {
  api.findPendingOrMember.mockReset();
  api.finishThriftJoin.mockReset();
  api.findPendingOrMember.mockResolvedValue({ people: [CARA] });
  api.finishThriftJoin.mockResolvedValue({ person_id: 7, account_id: 3, first_name: 'Cara', last_name: 'Joyner', status: 'active', signed: true, cart: null });
  camera.onDecode = null;
  // jsdom has no 2D canvas: a stand-in that takes the drawing calls, and a PNG out.
  const ctx = new Proxy({}, { get: () => vi.fn(), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(['png'], { type: 'image/png' }));
  };
});

type User = ReturnType<typeof userEvent.setup>;

function renderPage() {
  return render(<MemoryRouter><FinalizeThriftPlusPage /></MemoryRouter>);
}

function sign() {
  const pad = screen.getByTestId('thrift-signature-pad');
  fireEvent.pointerDown(pad, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(pad, { pointerId: 1, clientX: 60, clientY: 40 });
  fireEvent.pointerUp(pad, { pointerId: 1 });
}

async function throughPhoneAndId(user: User, phone = '402.555.0123') {
  await user.type(await screen.findByLabelText('Phone number'), phone);
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByTestId('finalize-readback')).toHaveTextContent('(402) 555-0123 — read it back to them');
  await user.click(screen.getByRole('button', { name: "That's right" }));
  const next = screen.getByRole('button', { name: 'Next' });
  expect(next).toBeDisabled(); // the ID check is required here
  await user.click(screen.getByLabelText('I checked their photo ID'));
  await user.click(screen.getByLabelText('The ID shows 18 or older'));
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

describe('Finalize Thrift+', () => {
  it('scans the member QR with the phone camera and goes to the phone number', async () => {
    const user = userEvent.setup();
    expect(isThriftCardCode(CODE)).toBe(true);
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Scan their member QR' }));
    expect(camera.enabled).toBe(true);
    await act(async () => camera.onDecode?.(`TP${CODE}`));
    expect(api.findPendingOrMember).toHaveBeenLastCalledWith(`TP${CODE}`);
    expect(await screen.findByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.getByTestId('finalize-person')).toHaveTextContent('Cara Joyner');
  });

  it('tells the cashier when the QR is already an active member, and ignores codes that are not member QRs', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Scan their member QR' }));
    await act(async () => camera.onDecode?.('ITM12345'));
    expect(screen.getByTestId('finalize-find-note')).toHaveTextContent("That's not a member QR.");
    api.findPendingOrMember.mockResolvedValueOnce({ people: [], member: { status: 'active', first_name: 'Ana' } });
    await act(async () => camera.onDecode?.(`TP${CODE}`));
    expect(await screen.findByTestId('finalize-find-note')).toHaveTextContent('Ana is already a Thrift+ member.');
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument();
    expect(codeMemberMessage({ status: 'unknown', first_name: '' })).toMatch(/isn't a Thrift\+ member code/);
  });

  it('searches by name, reads the phone back, needs the ID check and the signature, then finishes', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Cara Joyner')).toBeInTheDocument(); // the newest joins first
    await user.type(screen.getByLabelText('Name or email'), 'joyner{Enter}');
    expect(api.findPendingOrMember).toHaveBeenLastCalledWith('joyner');
    await user.click(await screen.findByText('Cara Joyner'));
    await throughPhoneAndId(user);

    // The photo: taken, with Retake.
    const photo = new File(['jpg'], 'cara.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('finalize-photo-input'), photo);
    expect(await screen.findByRole('button', { name: 'Retake' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // The signature under the J5 words: Finish waits for it.
    expect(screen.getByTestId('finalize-sign-words')).toHaveTextContent(SIGNATURE_WORDS);
    // The terms open in a popup on this screen (J13): no link anywhere that leaves the page.
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Read the terms' }));
    expect(await screen.findByTestId('finalize-terms')).toHaveTextContent('3-day returns');
    expect(screen.getByTestId('finalize-terms').querySelectorAll('a')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Back to signing' }));
    await waitFor(() => expect(screen.queryByTestId('finalize-terms')).not.toBeInTheDocument());
    const finish = screen.getByRole('button', { name: 'Finish' });
    expect(finish).toBeDisabled();
    sign();
    expect(finish).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(finish).toBeDisabled();
    sign();
    await user.click(finish);

    await screen.findByTestId('finalize-done');
    const body = api.finishThriftJoin.mock.calls[0][0];
    expect(body).toMatchObject({ person: 7, phone: '4025550123', id_checked: true, verified_18: true, finalize: true });
    expect(body.signature).toBeInstanceOf(Blob);
    expect(body.photo).toBe(photo);
    expect(body.cart).toBeUndefined();
    expect(screen.getByTestId('finalize-done')).toHaveTextContent(
      'Cara is a Thrift+ member.They can show their member QR or give their phone at the register.',
    );
    await user.click(screen.getByRole('button', { name: 'Finalize another' }));
    expect(screen.getByRole('button', { name: 'Scan their member QR' })).toBeInTheDocument();
  });

  it('goes back to the phone number with the message when the phone is on another membership', async () => {
    const user = userEvent.setup();
    api.finishThriftJoin.mockRejectedValueOnce({
      response: { data: { code: 'PHONE_TAKEN', detail: 'That phone number is on another membership. Check the ID and ask a manager.' } },
    });
    renderPage();
    await user.click(await screen.findByText('Cara Joyner'));
    await throughPhoneAndId(user);
    await user.click(screen.getByRole('button', { name: 'No photo today' }));
    sign();
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByTestId('finalize-phone-error')).toHaveTextContent('That phone number is on another membership.');
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    await waitFor(() => expect(api.finishThriftJoin.mock.calls[0][0].photo).toBeNull());
  });

  it('shows the Join QR and ecothrift.us/join full screen for a customer who has not joined', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Not joined yet? Show the Join QR' }));
    expect(await screen.findByTestId('finalize-join-url')).toHaveTextContent('ecothrift.us/join');
    expect(screen.getByRole('img', { name: 'QR code for ecothrift.us/join' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByTestId('finalize-join-sheet')).not.toBeInTheDocument());
  });

  it("the phone's Back closes a popup and never leaves the page", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Not joined yet? Show the Join QR' }));
    await screen.findByTestId('finalize-join-sheet');
    const entries = window.history.length;
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('finalize-join-sheet')).not.toBeInTheDocument());
    expect(screen.getByTestId('finalize-thriftplus')).toBeInTheDocument();
    expect(window.history.length).toBe(entries + 1); // the guard entry is put back
  });

  it('puts the Finalize app manifest in the head (installs beside the scanner)', async () => {
    const { unmount } = renderPage();
    await screen.findByText('Cara Joyner');
    expect(document.head.querySelector('link[rel="manifest"]')).toHaveAttribute('href', '/finalize/manifest.webmanifest');
    unmount();
    expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
  });
});
