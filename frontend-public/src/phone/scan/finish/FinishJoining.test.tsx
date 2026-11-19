/**
 * Finish joining (piece S2), on the real ScanApp, store and API over the fake server. Ported from the live page test
 * (frontend/src/pages/thriftplus/scanner/ThriftPlusScannerPage.test.tsx): the second half of :614 (the steps after the
 * code), :687, :703, :728, :741, same assertions on words and behaviour. Then the cases this piece had to decide: the
 * camera is released when the step ends, the fall-back to the phone's own camera, the error words, one send per tap,
 * and the terms word for word.
 *
 * The other pieces ScanApp renders (sign-in, trip, camera) are stood in by small doubles: the join's sign-in is done
 * through the store's actions, as the code screen does it, so these tests stay true while S1 is built.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THRIFT_PLUS_TERMS_EN } from '../../../data/thriftPlusTerms.en'
import * as core from '../core'
import { actions } from '../store'
import { renderScan, resetScanner } from '../test/harness'
import type { FakeApi } from '../test/fakeApi'

// jsdom has no camera, WebAssembly decoder or image decoder: the decoder never loads; the photo goes as taken.
vi.mock('../core', async (orig) => ({
  ...(await orig<typeof import('../core')>()),
  loadDetector: () => new Promise(() => undefined),
  selfieJpeg: vi.fn(async (f: Blob) => f),
}))
vi.mock('../signin', () => ({
  default: () => <div data-testid="signin" />,
  AddPhone: () => <div data-testid="add-phone" />,
}))
vi.mock('../trip', () => ({ default: () => <div data-testid="trip" /> }))
vi.mock('../camera', () => ({ TurnUpright: () => <div data-testid="turn-upright" /> }))

let fake: FakeApi

beforeEach(() => {
  fake = resetScanner()
  vi.clearAllMocks()
  // jsdom has no 2D canvas: a stand-in that takes the drawing calls, and a JPEG out.
  const ctx = new Proxy({}, { get: () => vi.fn(), set: () => true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(['jpg'], { type: 'image/jpeg' }))
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const where = () => screen.getByTestId('where').textContent
const path = () => screen.getByTestId('path').textContent

/** Joined with a name and a phone, the code checked (what S1's code screen does): a pending member, nothing done yet. */
async function joinedByPhone() {
  await actions.sendCode({ contact: '(402) 555-0188', first: 'Robin', last: 'Lee' })
  await actions.checkCode({ contact: '(402) 555-0188', code: fake.lastCode() })
}

/** Joined with a name and an email (the live cases :687, :728, :741). */
async function joinedByEmail() {
  await actions.sendCode({ contact: 'robin@example.com', first: 'Robin', last: 'Lee' })
  await actions.checkCode({ contact: 'robin@example.com', code: fake.lastCode() })
}

/** A front camera that opens: its one track's `stop`, and getUserMedia, watched. */
function fakeCamera(fails?: { name: string }) {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
  const getUserMedia = fails ? vi.fn().mockRejectedValue(fails) : vi.fn().mockResolvedValue(stream)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  return { stop, getUserMedia }
}

function noCamera() {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
}

describe('Finish joining (C7)', () => {
  it('Join: the code opens Finish joining (selfie, then sign, then done), then the Member QR (:614, second half)', async () => {
    await joinedByPhone()
    const user = userEvent.setup()
    renderScan('/scan')

    // Finish joining: step 1, the selfie with the front camera.
    const finish = await screen.findByTestId('finish-joining')
    expect(where()).toBe('?view=finish')
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 2')
    expect(within(finish).getByTestId('finish-intro')).toHaveTextContent("Two quick steps: 1. Selfie 2. Agree to the terms. Then you're a Thrift+ member.")
    expect(within(finish).getByTestId('selfie-tip')).toHaveTextContent('Fit your face in the oval. No hat or sunglasses.')
    expect(within(finish).queryByRole('button', { name: /skip|later/i })).toBeNull()
    const input = within(finish).getByTestId('selfie-input')
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('capture', 'user')
    expect(within(finish).getByRole('button', { name: 'Take my selfie' })).toBeInTheDocument()
    fireEvent.change(input, { target: { files: [new File(['jpg'], 'me.jpg', { type: 'image/jpeg' })] } })
    expect(await within(finish).findByRole('button', { name: 'Use this photo' })).toBeInTheDocument()
    expect(within(finish).getByRole('button', { name: 'Retake' })).toBeInTheDocument()
    await user.click(within(finish).getByRole('button', { name: 'Use this photo' }))

    // Step 2: the terms, then a tap on "I agree" (owner 2026-11-03: no finger signature).
    expect(await within(finish).findByTestId('finish-sign')).toBeInTheDocument()
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 2 of 2')
    expect(within(finish).getByTestId('finish-terms')).toHaveTextContent('All you need to know')
    expect(within(finish).queryByTestId('thrift-signature-pad')).toBeNull()
    await user.click(within(finish).getByRole('button', { name: 'I agree to the Thrift+ terms and photo release' }))

    // Done: a member now, with no staff step and no photo ID at the register (owner 2026-11-03, J8).
    const done = await within(finish).findByTestId('finish-done')
    expect(done).toHaveTextContent("You're a Thrift+ member")
    expect(done).toHaveTextContent('Show your member QR at the register.')
    expect(fake.finished()).toMatchObject([{ step: 'selfie' }, { step: 'sign', terms_version: '2026-11-18' }])
    await user.click(within(done).getByRole('button', { name: 'Done' }))
    // The Member QR (coordinator's call 1: on /thriftplus, piece S5), the address replaced.
    expect(await screen.findByTestId('thriftplus-page')).toBeInTheDocument()
    expect(path()).toBe('/thriftplus')
    expect(where()).toBe('?show=qr')
  })

  it('is required: a pending member with steps left always lands on it, no ×, only Sign out (:687, owner 2026-10-20)', async () => {
    await joinedByEmail()
    const user = userEvent.setup()
    renderScan('/scan?view=qr')
    const finish = await screen.findByTestId('finish-joining')
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 2')
    expect(where()).toBe('?view=finish')
    expect(within(finish).queryByRole('button', { name: 'Close' })).toBeNull()
    expect(within(finish).queryByRole('button', { name: /skip|later/i })).toBeNull()
    expect(screen.queryByTestId('thriftplus-page')).toBeNull()
    expect(screen.queryByTestId('trip')).toBeNull()
    await user.click(within(finish).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(screen.queryByTestId('finish-joining')).toBeNull())
    expect(fake.isSignedIn()).toBe(false)
  })

  it('the selfie camera opens in the app with an oval to fit the face in (:703, owner 2026-10-19)', async () => {
    const { getUserMedia } = fakeCamera()
    try {
      const user = userEvent.setup()
      fake.joinThriftPlus('Robin', 'Lee', 'robin@example.com')
      const { token } = fake.outbox()[0]
      renderScan(`/scan?signin=${token}`)
      const finish = await screen.findByTestId('finish-joining')
      await user.click(within(finish).getByRole('button', { name: 'Take my selfie' }))
      expect(await within(finish).findByTestId('selfie-camera')).toBeInTheDocument()
      expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: 'user' } }) }))
      expect(await within(finish).findByText('Fit your face in the oval')).toBeInTheDocument()
      expect(within(finish).getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
      // iPhone Safari: the video plays inline, muted, and is not inside a button.
      const video = within(finish).getByTestId('selfie-camera').querySelector('video')
      expect(video).not.toBeNull()
      expect(video!.muted).toBe(true)
      expect(video!.hasAttribute('playsinline')).toBe(true)
      expect(video!.closest('button')).toBeNull()
    } finally {
      noCamera()
    }
  })

  it('a photo this phone cannot read is not sent: it asks for the selfie again (:728)', async () => {
    vi.mocked(core.selfieJpeg).mockResolvedValueOnce(null)
    await joinedByEmail()
    renderScan('/scan?view=finish')
    const finish = await screen.findByTestId('finish-joining')
    fireEvent.change(within(finish).getByTestId('selfie-input'), { target: { files: [new File(['heic'], 'me.heic', { type: 'image/heic' })] } })
    expect(await within(finish).findByRole('alert')).toHaveTextContent("That photo didn't work. Take your selfie again.")
    expect(within(finish).getByRole('button', { name: 'Take my selfie' })).toBeInTheDocument()
    expect(fake.finished()).toEqual([])
  })

  it('only the steps left are asked: a selfie on file goes straight to "Step 1 of 1", the terms (:741)', async () => {
    await joinedByEmail()
    await actions.uploadSelfie(new Blob(['jpg'], { type: 'image/jpeg' }))
    renderScan('/scan?view=finish')
    const finish = await screen.findByTestId('finish-joining')
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 1')
    expect(within(finish).getByTestId('finish-sign')).toBeInTheDocument()
    expect(within(finish).queryByTestId('finish-intro')).toBeNull()
  })
})

describe('Finish joining: what this piece decided', () => {
  it('releases the camera when the photo is taken, and sends that photo', async () => {
    const { stop } = fakeCamera()
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280)
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(960)
    try {
      await joinedByPhone()
      const user = userEvent.setup()
      renderScan('/scan')
      const finish = await screen.findByTestId('finish-joining')
      await user.click(within(finish).getByRole('button', { name: 'Take my selfie' }))
      await within(finish).findByText('Fit your face in the oval')
      await user.click(within(finish).getByRole('button', { name: 'Take photo' }))
      expect(stop).toHaveBeenCalled()
      expect(within(finish).queryByTestId('selfie-camera')).toBeNull()
      await user.click(await within(finish).findByRole('button', { name: 'Use this photo' }))
      expect(await within(finish).findByTestId('finish-sign')).toBeInTheDocument()
      const sent = fake.calls().find((c) => c.path === 'me/selfie/')?.body as FormData
      expect((sent.get('photo') as File).type).toBe('image/jpeg')
    } finally {
      noCamera()
    }
  })

  it('releases the camera on Sign out while it is open (the step ends)', async () => {
    const { stop } = fakeCamera()
    try {
      await joinedByEmail()
      const user = userEvent.setup()
      renderScan('/scan?view=finish')
      const finish = await screen.findByTestId('finish-joining')
      await user.click(within(finish).getByRole('button', { name: 'Take my selfie' }))
      await within(finish).findByText('Fit your face in the oval')
      expect(stop).not.toHaveBeenCalled()
      await user.click(within(finish).getByRole('button', { name: 'Sign out' }))
      await waitFor(() => expect(screen.queryByTestId('finish-joining')).toBeNull())
      expect(stop).toHaveBeenCalledTimes(1)
      expect(fake.isSignedIn()).toBe(false)
    } finally {
      noCamera()
    }
  })

  it('releases the camera at once when the phone leaves the page (lock screen, another app; owner 2026-10-22)', async () => {
    const { stop } = fakeCamera()
    try {
      await joinedByEmail()
      const user = userEvent.setup()
      renderScan('/scan?view=finish')
      const finish = await screen.findByTestId('finish-joining')
      await user.click(within(finish).getByRole('button', { name: 'Take my selfie' }))
      await within(finish).findByText('Fit your face in the oval')
      const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(stop).toHaveBeenCalledTimes(1)
      hidden.mockRestore()
      act(() => {
        window.dispatchEvent(new Event('pagehide'))
      })
      expect(stop).toHaveBeenCalledTimes(1) // already off: nothing left to stop
    } finally {
      noCamera()
    }
  })

  it('a camera that will not open here falls back to the phone\'s own camera, from then on', async () => {
    const { getUserMedia } = fakeCamera({ name: 'NotAllowedError' })
    try {
      await joinedByEmail()
      const user = userEvent.setup()
      renderScan('/scan?view=finish')
      const finish = await screen.findByTestId('finish-joining')
      await user.click(within(finish).getByRole('button', { name: 'Take my selfie' }))
      expect(await within(finish).findByRole('alert')).toHaveTextContent("The camera didn't open here. Tap Take my selfie to use your phone's camera.")
      expect(getUserMedia).toHaveBeenCalledTimes(1) // a refusal is not asked twice
      const input = within(finish).getByTestId('selfie-input') as HTMLInputElement
      const pick = vi.spyOn(input, 'click')
      await user.click(within(finish).getByRole('button', { name: 'Take my selfie' }))
      expect(pick).toHaveBeenCalledTimes(1)
      expect(within(finish).queryByTestId('selfie-camera')).toBeNull()
      expect(getUserMedia).toHaveBeenCalledTimes(1)
    } finally {
      noCamera()
    }
  })

  it("a photo the server refuses shows the error table's words and keeps the photo to retake", async () => {
    await joinedByEmail()
    fake.failNext('POST', 'me/selfie/', 400, { detail: 'Not a photo.', code: 'PHOTO_BAD' })
    const user = userEvent.setup()
    renderScan('/scan?view=finish')
    const finish = await screen.findByTestId('finish-joining')
    fireEvent.change(within(finish).getByTestId('selfie-input'), { target: { files: [new File(['jpg'], 'me.jpg', { type: 'image/jpeg' })] } })
    await user.click(await within(finish).findByRole('button', { name: 'Use this photo' }))
    expect(await within(finish).findByRole('alert')).toHaveTextContent("That photo didn't work. Take your selfie again.")
    expect(within(finish).getByRole('button', { name: 'Retake' })).toBeInTheDocument()
    expect(within(finish).getByTestId('finish-selfie')).toBeInTheDocument()
    expect(fake.finished()).toEqual([])
  })

  it('"I agree" that does not save says so; a second tap while it is out sends nothing', async () => {
    await joinedByEmail()
    await actions.uploadSelfie(new Blob(['jpg'], { type: 'image/jpeg' }))
    fake.failNext('POST', 'me/signature/', 500, {})
    const user = userEvent.setup()
    renderScan('/scan?view=finish')
    const finish = await screen.findByTestId('finish-joining')
    await user.click(within(finish).getByRole('button', { name: 'I agree to the Thrift+ terms and photo release' }))
    expect(await within(finish).findByRole('alert')).toHaveTextContent('That did not save. Tap I agree again.')
    expect(fake.finished()).toEqual([{ step: 'selfie', contact: 'robin@example.com' }])

    fake.setLatency(30)
    const agree = within(finish).getByTestId('sign-submit')
    fireEvent.click(agree)
    fireEvent.click(agree)
    expect(await within(finish).findByTestId('finish-done')).toBeInTheDocument()
    expect(fake.count('POST', 'me/signature/')).toBe(2) // the failed one and one more, not three
    expect(fake.finished().filter((f) => f.step === 'sign')).toEqual([{ step: 'sign', contact: 'robin@example.com', terms_version: '2026-11-18' }])
  })

  it('shows the terms word for word from the one source: every heading, every section, the version', async () => {
    await joinedByEmail()
    await actions.uploadSelfie(new Blob(['jpg'], { type: 'image/jpeg' }))
    renderScan('/scan?view=finish')
    const terms = await screen.findByTestId('finish-terms')
    expect(terms).toHaveAttribute('role', 'region')
    expect(terms).toHaveAttribute('aria-label', 'Thrift+ terms')
    const T = THRIFT_PLUS_TERMS_EN
    expect(terms).toHaveTextContent(T.needToKnowTitle)
    for (const l of T.needToKnow) expect(terms).toHaveTextContent(`${l.label} ${l.text}`)
    expect(terms).toHaveTextContent(`${T.fullIntro.label} ${T.fullIntro.text} · ${T.fullIntro.version}`)
    for (const s of T.sections) {
      expect(within(terms).getByRole('heading', { name: `${s.num}. ${s.title}` })).toBeInTheDocument()
      for (const c of s.clauses) if (c.text) expect(terms.textContent).toContain(c.text)
    }
  })
})
