import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ThriftPendingPerson } from '../../../api/thriftplusRegister.api';
import { isThriftCardCode } from '../../../utils/thriftPlusCard';
import FinalizeThriftPlusPage, { SIGNATURE_WORDS, codeMemberMessage } from './FinalizeThriftPlusPage';

// These forms type a lot through userEvent; on a busy machine (full suite beside the Django run) 20s is not enough.
vi.setConfig({ testTimeout: 60_000 });

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

// Who is signed in: a cashier, or the owner (Delete and start over is the owner's alone).
const auth = vi.hoisted(() => ({ user: { is_superuser: false } }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
const admin = vi.hoisted(() => ({ deleteMember: vi.fn(), sendMemberEmailLink: vi.fn(), addSecondAdult: vi.fn() }));
vi.mock('../../../api/thriftplus.api', () => admin);

vi.mock('../../../services/receiving/receivingClient', () => ({
  compressImageToJpeg: vi.fn(async (f: Blob) => f),
}));

const CARA: ThriftPendingPerson = {
  person_id: 7, account_id: 3, first_name: 'Cara', last_name: 'Joyner', email: 'cara@example.com',
  joined_at: '2026-10-16T14:05:00Z', code_last4: '1907',
};
const CODE = '402155831900';
/** Join v2 (owner 2026-10-19): a selfie and a signature from the app. */
const READY: ThriftPendingPerson = {
  ...CARA, status: 'pending', selfie: true, signed: true, photo_url: '/media/cara-selfie.jpg', contact: 'c***@example.com',
};

beforeEach(() => {
  api.findPendingOrMember.mockReset();
  api.finishThriftJoin.mockReset();
  api.findPendingOrMember.mockResolvedValue({ people: [CARA] });
  api.finishThriftJoin.mockResolvedValue({ person_id: 7, account_id: 3, first_name: 'Cara', last_name: 'Joyner', status: 'active', signed: true, cart: null });
  camera.onDecode = null;
  auth.user = { is_superuser: false };
  admin.deleteMember.mockReset().mockResolvedValue({ items_back: 0 });
  admin.sendMemberEmailLink.mockReset().mockResolvedValue({ sent: 'join', sent_to: 'c***@example.com' });
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

/** Owner 2026-10-19: one screen for everyone. Tick Name matches and Face matches the photo. */
async function checkId(user: User, over18 = true) {
  await user.click(await screen.findByRole('checkbox', { name: 'Name matches' }));
  await user.click(screen.getByRole('checkbox', { name: 'Face matches the photo' }));
  if (over18) await user.click(screen.getByRole('checkbox', { name: '18 or older' }));
}

describe('Finalize Thrift+', () => {
  it('scans the member QR and opens the one screen: no photo yet, so Take their photo; the signature here', async () => {
    const user = userEvent.setup();
    expect(isThriftCardCode(CODE)).toBe(true);
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Scan their member QR' }));
    expect(camera.enabled).toBe(true);
    await act(async () => camera.onDecode?.(`TP${CODE}`));
    expect(api.findPendingOrMember).toHaveBeenLastCalledWith(`TP${CODE}`);
    const box = await screen.findByTestId('finalize-verify');
    expect(screen.getByTestId('selfie-check-name')).toHaveTextContent('Cara Joyner');
    expect(box).toHaveTextContent('No photo yet. Take their photo below.');
    expect(screen.getByRole('button', { name: 'Take their photo' })).toBeInTheDocument();
    expect(screen.getByTestId('thrift-signature-pad')).toBeInTheDocument(); // not signed in the app
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
    expect(screen.queryByTestId('finalize-verify')).not.toBeInTheDocument();
    expect(codeMemberMessage({ status: 'unknown', first_name: '' })).toMatch(/isn't a Thrift\+ member code/);
  });

  it('searches by name; one screen: a photo taken here, the ID check and the signature, then Done', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Cara Joyner')).toBeInTheDocument(); // the newest joins first
    await user.type(screen.getByLabelText('Name, phone, email or member #'), 'joyner{Enter}');
    expect(api.findPendingOrMember).toHaveBeenNthCalledWith(1, '', { recent: true }); // the newest 50 online joins
    expect(api.findPendingOrMember).toHaveBeenLastCalledWith('joyner', { recent: true });
    await user.click(await screen.findByText('Cara Joyner'));
    await user.click(await screen.findByRole('button', { name: 'Check their ID now' }));
    await screen.findByTestId('finalize-verify');
    expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();

    // No photo on file: Take their photo; then it reads Retake photo.
    const photo = new File(['jpg'], 'cara.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('selfie-check-retake-input'), photo);
    expect(await screen.findByRole('button', { name: 'Retake photo' })).toBeInTheDocument();
    await checkId(user);
    expect(done).toBeDisabled(); // they sign first

    // The signature under the J5 words; the terms open in a popup (J13): no link anywhere that leaves the page.
    expect(screen.getByTestId('finalize-sign-words')).toHaveTextContent(SIGNATURE_WORDS);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Read the terms' }));
    expect(await screen.findByTestId('finalize-terms')).toHaveTextContent('3-day returns');
    expect(screen.getByTestId('finalize-terms').querySelectorAll('a')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Back to signing' }));
    await waitFor(() => expect(screen.queryByTestId('finalize-terms')).not.toBeInTheDocument());
    sign();
    expect(done).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(done).toBeDisabled();
    sign();
    await user.click(done);

    await screen.findByTestId('finalize-done');
    const body = api.finishThriftJoin.mock.calls[0][0];
    expect(body).toMatchObject({ person: 7, id_checked: true, face_matches: true, verified_18: true, finalize: true });
    expect(body.phone).toBeUndefined();
    expect(body.signature).toBeInstanceOf(Blob);
    expect(body.photo).toBe(photo);
    expect(body.cart).toBeUndefined();
    expect(screen.getByTestId('finalize-done')).toHaveTextContent('Cara is a Thrift+ member.');
    await user.click(screen.getByRole('button', { name: 'Finalize another' }));
    expect(screen.getByRole('button', { name: 'Scan their member QR' })).toBeInTheDocument();
  });

  it('a photo already on file (not signed yet): their photo shows with Retake, they sign here, then Done', async () => {
    const user = userEvent.setup();
    const HALF: ThriftPendingPerson = { ...CARA, status: 'pending', selfie: true, signed: false, photo_url: '/media/cara.jpg' };
    api.findPendingOrMember.mockResolvedValue({ people: [HALF] });
    renderPage();
    await user.click(await screen.findByText('Cara Joyner'));
    await user.click(await screen.findByRole('button', { name: 'Check their ID now' }));
    await screen.findByTestId('finalize-verify');
    expect(screen.getByRole('img', { name: "Cara Joyner's selfie" })).toHaveAttribute('src', '/media/cara.jpg');
    expect(screen.queryByRole('button', { name: 'Take their photo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retake photo' })).toBeInTheDocument();
    await checkId(user, false);
    sign();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByTestId('finalize-done');
    const body = api.finishThriftJoin.mock.calls[0][0];
    expect(body.photo).toBeUndefined(); // their photo stays
    expect(body.signature).toBeInstanceOf(Blob);
    expect(body).toMatchObject({ face_matches: true, verified_18: false });
  });

  it('a refusal stays on the one screen with the message', async () => {
    const user = userEvent.setup();
    api.finishThriftJoin.mockRejectedValueOnce({
      response: { data: { code: 'NOT_PENDING', detail: 'Cara is already a Thrift+ member.' } },
    });
    renderPage();
    await user.click(await screen.findByText('Cara Joyner'));
    await user.click(await screen.findByRole('button', { name: 'Check their ID now' }));
    await user.upload(await screen.findByTestId('selfie-check-retake-input'), new File(['jpg'], 'c.jpg', { type: 'image/jpeg' }));
    await checkId(user);
    sign();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByTestId('finalize-error')).toHaveTextContent('Cara is already a Thrift+ member.');
    expect(api.finishThriftJoin.mock.calls[0][0].phone).toBeUndefined();
  });

  it('after Done: Add a person (both here, the ID, a photo, the approval), then Finalize another', async () => {
    const user = userEvent.setup();
    admin.addSecondAdult.mockReset().mockResolvedValue({});
    api.findPendingOrMember.mockResolvedValue({ people: [READY] });
    renderPage();
    await user.click(await screen.findByText('Cara Joyner'));
    await user.click(await screen.findByRole('button', { name: 'Check their ID now' }));
    await checkId(user);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByTestId('finalize-done');
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    const panel = await screen.findByTestId('add-person');
    const add = screen.getByRole('button', { name: 'Add them' });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText(/First name/), 'Sam');
    await user.type(screen.getByLabelText(/Last name/), 'Joyner');
    await user.click(screen.getByRole('checkbox', { name: 'Checked a photo ID (the name matches)' }));
    await user.upload(panel.querySelector('input[type=file]') as HTMLInputElement, new File(['jpg'], 's.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('checkbox', { name: 'Both are here, and Cara approves' }));
    await user.click(add);
    expect(admin.addSecondAdult).toHaveBeenCalledWith(3, expect.objectContaining({ first_name: 'Sam', last_name: 'Joyner', both_present: true, primary_approves: true }));
    expect(await screen.findByTestId('finalize-added')).toHaveTextContent('Sam Joyner is on the membership.');
    expect(screen.queryByRole('button', { name: 'Add a person' })).not.toBeInTheDocument();
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

  it('leaves the page head to the Thrift+ Staff app, and says when someone is part way through (owner 2026-10-16)', async () => {
    const user = userEvent.setup();
    const onMidway = vi.fn();
    const { unmount } = render(<MemoryRouter><FinalizeThriftPlusPage onMidway={onMidway} /></MemoryRouter>);
    await user.click(await screen.findByText('Cara Joyner'));
    expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
    expect(onMidway).toHaveBeenLastCalledWith(false);
    await user.click(await screen.findByRole('button', { name: 'Check their ID now' }));
    await screen.findByTestId('finalize-verify');
    expect(onMidway).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onMidway).toHaveBeenLastCalledWith(false);
  });

  it('lists the newest online joins in a scrolling box; a finished one says Finished and is not picked', async () => {
    const user = userEvent.setup();
    const DONE: ThriftPendingPerson = { ...CARA, person_id: 8, first_name: 'Dee', last_name: 'Done', status: 'active' };
    api.findPendingOrMember.mockResolvedValue({ people: [{ ...CARA, status: 'pending', code_display: '4021 5583 1907' }, DONE] });
    renderPage();
    const list = await screen.findByTestId('finalize-people');
    expect(list).toHaveStyle({ overflowY: 'auto' });
    expect(screen.getByText('Joined online, newest first · 1 to finish')).toBeInTheDocument();
    const done = screen.getByTestId('finalize-person-done');
    expect(done).toHaveTextContent(/Dee Done.*Member/);
    // The finished one opens its panel, with nothing to finish.
    await user.click(done);
    expect(await screen.findByTestId('finalize-person-sheet')).toHaveTextContent('Member');
    // Quick fixes for a member (owner 2026-10-20).
    expect(screen.getByTestId('person-sign-in-qr')).toBeInTheDocument();
    expect(screen.getByTestId('person-edit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check their ID now' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('finalize-delete')).not.toBeInTheDocument(); // the owner only
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('finalize-person-sheet')).not.toBeInTheDocument());
    // The line: #number · phone · when; a pending one has no phone yet.
    expect(screen.getAllByTestId('finalize-person-line')[0]).toHaveTextContent('4021 5583 1907· no phone yet');
    await user.click(screen.getByTestId('finalize-person-pending'));
    await user.click(await screen.findByRole('button', { name: 'Check their ID now' }));
    expect(await screen.findByTestId('finalize-verify')).toBeInTheDocument();
  });

  it('marks who took a selfie and signed in the app: their selfie small and "Ready: selfie + signed" (Join v2)', async () => {
    const PLAIN: ThriftPendingPerson = { ...CARA, person_id: 9, first_name: 'Pat', last_name: 'Plain', status: 'pending' };
    const HALF: ThriftPendingPerson = { ...CARA, person_id: 10, first_name: 'Hal', last_name: 'Half', status: 'pending', selfie: true, signed: false, photo_url: '/media/hal.jpg' };
    api.findPendingOrMember.mockResolvedValue({ people: [READY, PLAIN, HALF] });
    renderPage();
    const cards = await screen.findAllByTestId('finalize-person-pending');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('Ready: selfie + signed');
    expect(cards[0].querySelector('img')).toHaveAttribute('src', '/media/cara-selfie.jpg');
    expect(cards[0]).toHaveTextContent('c***@example.com'); // no phone: how they joined
    expect(cards[1]).not.toHaveTextContent('Ready');
    expect(cards[1].querySelector('img')).toBeNull();
    expect(cards[2]).not.toHaveTextContent('Ready'); // a selfie, not signed yet
    expect(cards[2].querySelector('img')).toHaveAttribute('src', '/media/hal.jpg');
    expect(screen.getAllByTestId('finalize-person-ready')).toHaveLength(1);
  });

  it('the panel resends the join email, and the owner alone may delete and start over (typing the name)', async () => {
    const user = userEvent.setup();
    auth.user = { is_superuser: true };
    renderPage();
    await user.click(await screen.findByText('Cara Joyner'));
    await user.click(await screen.findByRole('button', { name: 'Resend join email' }));
    expect(await screen.findByTestId('finalize-sheet-note')).toHaveTextContent('Sent the join email to c***@example.com.');
    expect(admin.sendMemberEmailLink).toHaveBeenCalledWith(7);
    await user.click(screen.getByTestId('finalize-delete'));
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del).toBeDisabled();
    await user.type(screen.getByLabelText('Their name'), 'Cara Joyner');
    await user.click(del);
    expect(admin.deleteMember).toHaveBeenCalledWith(3, 'Cara Joyner');
    await waitFor(() => expect(screen.queryByTestId('finalize-person-sheet')).not.toBeInTheDocument());
    expect(api.findPendingOrMember).toHaveBeenLastCalledWith('', { recent: true }); // the list again
  });

  describe('the selfie path (Join v2, owner 2026-10-19)', () => {
    it('one screen: the selfie, the name, "Check their photo ID"; Done waits for the name and the face', async () => {
      const user = userEvent.setup();
      api.findPendingOrMember.mockResolvedValue({ people: [READY] });
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Scan their member QR' }));
      await act(async () => camera.onDecode?.(`TP${CODE}`));
      const screenBox = await screen.findByTestId('finalize-verify');
      expect(screen.getByRole('img', { name: "Cara Joyner's selfie" })).toHaveAttribute('src', '/media/cara-selfie.jpg');
      expect(screen.getByTestId('selfie-check-name')).toHaveTextContent('Cara Joyner');
      expect(screenBox).toHaveTextContent('c***@example.com');
      expect(screenBox).toHaveTextContent('Check their photo ID');
      // One screen: no phone, no photo step, no signature, no step count.
      expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('thrift-signature-pad')).not.toBeInTheDocument();
      expect(screen.queryByText(/of 4/)).not.toBeInTheDocument();

      expect(screenBox).toHaveTextContent('Signed the terms in the app.');
      const verified = screen.getByRole('button', { name: 'Done' });
      const over18 = screen.getByRole('checkbox', { name: '18 or older' });
      expect(verified).toBeDisabled();
      expect(over18).toBeDisabled();
      await user.click(screen.getByRole('checkbox', { name: 'Name matches' }));
      expect(verified).toBeDisabled();
      expect(over18).toBeDisabled();
      await user.click(screen.getByRole('checkbox', { name: 'Face matches the photo' }));
      expect(verified).toBeEnabled();
      expect(over18).toBeEnabled();
      await user.click(over18);
      // Unchecking the face clears 18+ (it goes with a checked ID).
      await user.click(screen.getByRole('checkbox', { name: 'Face matches the photo' }));
      expect(verified).toBeDisabled();
      expect(over18).not.toBeChecked();
      await user.click(screen.getByRole('checkbox', { name: 'Face matches the photo' }));
      await user.click(over18);
      await user.click(verified);

      expect(await screen.findByTestId('finalize-done')).toHaveTextContent('Cara is a Thrift+ member.');
      const body = api.finishThriftJoin.mock.calls[0][0];
      expect(body).toEqual({ person: 7, id_checked: true, face_matches: true, verified_18: true, finalize: true });
      expect(document.body.textContent ?? '').not.toMatch(/\bcards?\b/i);
      await user.click(screen.getByRole('button', { name: 'Finalize another' }));
      expect(screen.getByRole('button', { name: 'Scan their member QR' })).toBeInTheDocument();
    });

    it('Done without 18+ sends verified_18 false', async () => {
      const user = userEvent.setup();
      api.findPendingOrMember.mockResolvedValue({ people: [READY] });
      renderPage();
      await user.click(await screen.findByText('Cara Joyner'));
      await user.click(await screen.findByRole('button', { name: 'Check their ID now' }));
      await user.click(await screen.findByRole('checkbox', { name: 'Name matches' }));
      await user.click(screen.getByRole('checkbox', { name: 'Face matches the photo' }));
      await user.click(screen.getByRole('button', { name: 'Done' }));
      await screen.findByTestId('finalize-done');
      expect(api.finishThriftJoin.mock.calls[0][0]).toMatchObject({ verified_18: false, face_matches: true, id_checked: true });
    });

    it('Retake photo: the new photo goes in the same Done call, in place of the selfie', async () => {
      const user = userEvent.setup();
      api.findPendingOrMember.mockResolvedValue({ people: [READY] });
      renderPage();
      await user.click(await screen.findByText('Cara Joyner'));
      await user.click(await screen.findByRole('button', { name: 'Check their ID now' }));
      await screen.findByTestId('finalize-verify');
      expect(screen.getByRole('button', { name: 'Retake photo' })).toBeInTheDocument();
      const photo = new File(['jpg'], 'new.jpg', { type: 'image/jpeg' });
      await user.upload(screen.getByTestId('selfie-check-retake-input'), photo);
      // The old selfie gives way to the new photo.
      expect(await screen.findByRole('img', { name: 'The new photo' })).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: "Cara Joyner's selfie" })).not.toBeInTheDocument();
      await user.click(screen.getByRole('checkbox', { name: 'Name matches' }));
      await user.click(screen.getByRole('checkbox', { name: 'Face matches the photo' }));
      await user.click(screen.getByRole('button', { name: 'Done' }));
      await screen.findByTestId('finalize-done');
      const body = api.finishThriftJoin.mock.calls[0][0];
      expect(body.photo).toBe(photo);
      expect(body.signature).toBeUndefined();
      expect(body.phone).toBeUndefined();
    });

    it('a refusal stays on the screen with the message; Back goes to the list', async () => {
      const user = userEvent.setup();
      api.findPendingOrMember.mockResolvedValue({ people: [READY] });
      api.finishThriftJoin.mockRejectedValueOnce({ response: { data: { code: 'NOT_PENDING', detail: 'Cara is already a Thrift+ member.' } } });
      renderPage();
      await user.click(await screen.findByText('Cara Joyner'));
      await user.click(await screen.findByRole('button', { name: 'Check their ID now' }));
      await user.click(await screen.findByRole('checkbox', { name: 'Name matches' }));
      await user.click(screen.getByRole('checkbox', { name: 'Face matches the photo' }));
      await user.click(screen.getByRole('button', { name: 'Done' }));
      expect(await screen.findByTestId('finalize-error')).toHaveTextContent('Cara is already a Thrift+ member.');
      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByRole('button', { name: 'Scan their member QR' })).toBeInTheDocument();
    });
  });
});