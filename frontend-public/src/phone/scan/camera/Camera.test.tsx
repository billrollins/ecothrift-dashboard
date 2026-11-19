/**
 * Ported from frontend/src/pages/thriftplus/scanner/ScanHelp.test.tsx, "Zoom in the camera window" (4 cases, same
 * assertions), plus this piece's own cases for the live camera path. jsdom has no camera, so the live test's fakes
 * stand in: a track with (or without) zoom capabilities, a BarcodeDetector, and a video that "plays" a 1280 x 720 frame.
 * The live test drove the whole page ("Scan without signing in" first); the camera piece is the same hook (core
 * `useQrCamera`, unchanged) drawn by `Camera`, so the harness below renders exactly that pair, as the trip (S4) does.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQrCamera } from '../core'
import type { UprightLock } from '../contracts'
import { _resetApi } from '../api'
import { _resetScanStore } from '../store'
import { installFakeApi } from '../test/fakeApi'
import Camera, { CameraHelp, HARD_RESTART_MS } from './index'

const cam = vi.hoisted(() => ({ codes: [] as Array<{ rawValue: string; format: string }>, reads: 0 }))

class FakeDetector {
  static async getSupportedFormats() {
    return ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
  }
  async detect() {
    cam.reads += 1
    return cam.codes
  }
}

interface FakeTrack {
  applyConstraints: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  getCapabilities: () => object
  getSettings: () => object
}

/** A phone camera: `zoom` is its zoom range (none: an iPhone browser), `devices` what enumerateDevices names. */
function installCamera({ zoom, devices = [] }: { zoom?: { min: number; max: number }; devices?: Array<Partial<MediaDeviceInfo>> } = {}) {
  const tracks: FakeTrack[] = []
  const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => {
    const track: FakeTrack = {
      applyConstraints: vi.fn(async () => undefined),
      stop: vi.fn(),
      getCapabilities: () => (zoom ? { zoom: { ...zoom, step: 0.1 } } : {}),
      getSettings: () => ({ zoom: 1 }),
    }
    tracks.push(track)
    return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
  })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices: vi.fn(async () => devices) },
  })
  return { getUserMedia, last: () => tracks[tracks.length - 1] }
}

const zoomCalls = (track: FakeTrack) =>
  track.applyConstraints.mock.calls.map(([c]) => (c as { advanced: Array<{ zoom?: number }> }).advanced[0].zoom).filter((z) => z != null)

/** Two (or fewer) fingers on the camera. */
function touch(el: Element, type: string, points: Array<[number, number]>) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'touches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) })
  act(() => {
    el.dispatchEvent(e)
  })
  return e
}

/** The trip's use of the camera piece (S4 owns the real one): the hook, the window, and the help sheet. */
function Scanner({ typeOnly = false, underneath = false, lock = null, onCode = () => undefined, onDecode = () => undefined }: {
  typeOnly?: boolean; underneath?: boolean; lock?: UprightLock | null; onCode?: (c: string) => void; onDecode?: (raw: string) => void
}) {
  const [help, setHelp] = useState(false)
  const camera = useQrCamera({ enabled: !typeOnly, paused: underneath, onDecode })
  return (
    <>
      <Camera camera={camera} flash={false} onCode={onCode} onHelp={() => setHelp(true)} typeOnly={typeOnly} lock={lock} fullBleed={false}
        underneath={underneath} />
      {help ? <CameraHelp onClose={() => setHelp(false)} onRetry={camera.wake} /> : null}
    </>
  )
}

beforeAll(() => {
  ;(window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = FakeDetector
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  // The video "plays" with a 1280 x 720 frame ready to read.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: async () => undefined })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 720 })
  // No canvas in jsdom: the decoder reads the video itself.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null })
})

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  installFakeApi()
  _resetApi()
  _resetScanStore()
  cam.codes = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

describe('Zoom in the camera window (owner 2026-10-15, APP D13)', () => {
  it("shows the phone's own levels, applies a chip, pinches with the chips following, and remembers the level", async () => {
    const camera = installCamera({ zoom: { min: 0.5, max: 10 } })
    const user = userEvent.setup()
    const first = render(<Scanner />)
    const pill = await screen.findByTestId('zoom-pill')
    expect(within(pill).getAllByRole('button').map((b) => b.textContent)).toEqual(['.5×', '1×', '2×', '3×'])
    expect(within(pill).getByTestId('zoom-1')).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(pill).getByTestId('zoom-2'))
    await waitFor(() => expect(camera.last().applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] }))
    expect(within(pill).getByTestId('zoom-2')).toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem('tp-scan-zoom')).toBe('2')
    expect(screen.getByTestId('camera-video')).toHaveAttribute('data-zoom', '1') // the camera zooms, not the picture

    // Pinch: fingers 100 px apart, then 150: 2× becomes 3×; back to 130: 2.6×, shown on the lit 2× chip.
    const surface = screen.getByTestId('camera-card')
    expect(touch(surface, 'touchstart', [[100, 300], [200, 300]]).defaultPrevented).toBe(true) // not the page's zoom
    touch(surface, 'touchmove', [[75, 300], [225, 300]])
    expect(within(pill).getByTestId('zoom-3')).toHaveAttribute('aria-pressed', 'true')
    touch(surface, 'touchmove', [[85, 300], [215, 300]])
    expect(within(pill).getByTestId('zoom-2')).toHaveAttribute('aria-pressed', 'true')
    expect(within(pill).getByTestId('zoom-2')).toHaveTextContent('2.6×')
    touch(surface, 'touchend', [[85, 300]])
    await waitFor(() => expect(zoomCalls(camera.last()).at(-1)).toBe(2.6))
    expect(window.localStorage.getItem('tp-scan-zoom')).toBe('2.6')

    // Typing a tag number hides the pill.
    await user.click(screen.getByRole('button', { name: /Type tag #/ }))
    expect(screen.queryByTestId('zoom-pill')).toBeNull()
    first.unmount()

    // Next time the scanner opens, the level goes straight back on.
    render(<Scanner />)
    const again = await screen.findByTestId('zoom-pill')
    await waitFor(() => expect(zoomCalls(camera.last())).toEqual([2.6]))
    expect(within(again).getByTestId('zoom-2')).toHaveTextContent('2.6×')
  })

  it('a phone with no zoom setting zooms digitally: 1× 2× 3×, the picture magnified, nothing asked of the camera', async () => {
    const camera = installCamera()
    const user = userEvent.setup()
    render(<Scanner />)
    const pill = await screen.findByTestId('zoom-pill')
    expect(within(pill).getAllByRole('button').map((b) => b.textContent)).toEqual(['1×', '2×', '3×'])
    await user.click(within(pill).getByTestId('zoom-2'))
    expect(screen.getByTestId('camera-video')).toHaveAttribute('data-zoom', '2')
    // A pinch magnifies the picture smoothly, up to 3×.
    const surface = screen.getByTestId('camera-card')
    touch(surface, 'touchstart', [[100, 300], [200, 300]])
    touch(surface, 'touchmove', [[0, 300], [300, 300]])
    expect(screen.getByTestId('camera-video')).toHaveAttribute('data-zoom', '3')
    expect(screen.getByTestId('camera-video').style.transform).toBe('scale(3)')
    touch(surface, 'touchend', [])
    expect(window.localStorage.getItem('tp-scan-zoom')).toBe('3')
    expect(zoomCalls(camera.last())).toEqual([])
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1) // no telephoto here: 3× stays digital
  })

  it('3× opens the telephoto when the phone has one and no zoom setting (iPhone Pro), and 1× goes back', async () => {
    const camera = installCamera({
      devices: [
        { kind: 'videoinput', label: 'Back Camera', deviceId: 'main' },
        { kind: 'videoinput', label: 'Back Telephoto Camera', deviceId: 'tele-1' },
      ],
    })
    const user = userEvent.setup()
    render(<Scanner />)
    const pill = await screen.findByTestId('zoom-pill')
    await waitFor(() => expect(window.localStorage.getItem('tp-scan-tele')).toBe('tele-1'))

    await user.click(within(pill).getByTestId('zoom-3'))
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(2))
    expect(camera.getUserMedia.mock.calls[1][0]).toMatchObject({ video: { deviceId: { exact: 'tele-1' } } })
    await waitFor(() => expect(within(screen.getByTestId('zoom-pill')).getByTestId('zoom-3')).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByTestId('camera-video')).toHaveAttribute('data-zoom', '1') // the lens zooms, not the picture

    await user.click(within(screen.getByTestId('zoom-pill')).getByTestId('zoom-1'))
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(3))
    expect(camera.getUserMedia.mock.calls[2][0]).toMatchObject({ video: { facingMode: { ideal: 'environment' } } })
    await waitFor(() => expect(within(screen.getByTestId('zoom-pill')).getByTestId('zoom-1')).toHaveAttribute('aria-pressed', 'true'))
  })

  it('hides the pill in type-only mode, where the camera never starts', async () => {
    const camera = installCamera({ zoom: { min: 1, max: 8 } })
    render(<Scanner typeOnly />)
    expect(await screen.findByLabelText('Tag number')).toBeInTheDocument()
    expect(screen.queryByTestId('zoom-pill')).toBeNull()
    expect(camera.getUserMedia).not.toHaveBeenCalled()
  })
})

describe('The live camera window (piece S3)', () => {
  it('keeps the video mounted, inline and muted, never inside a button and never display: none (plan risk 3)', async () => {
    installCamera()
    render(<Scanner />)
    const video = screen.getByTestId('camera-video') as HTMLVideoElement
    // Mounted before the camera is live, and see-through rather than hidden.
    expect(video.muted).toBe(true)
    expect(video.playsInline).toBe(true)
    expect(video.closest('button')).toBeNull()
    expect(video.style.display).not.toBe('none')
    await screen.findByTestId('zoom-pill')
    expect(screen.getByTestId('camera-card')).toHaveAttribute('data-status', 'live')
    expect(screen.getByTestId('camera-video')).toBe(video) // the same element once live
    expect(video.srcObject).not.toBeNull()
  })

  it('reads codes while live and stops reading while an answer sits on top, under a veil that takes no taps', async () => {
    installCamera()
    cam.codes = [{ rawValue: 'TP0000001', format: 'qr_code' }]
    const onDecode = vi.fn()
    const { rerender } = render(<Scanner onDecode={onDecode} />)
    await waitFor(() => expect(onDecode).toHaveBeenCalledWith('TP0000001', 'qr_code'))
    rerender(<Scanner onDecode={onDecode} underneath />)
    const card = screen.getByTestId('camera-card')
    expect(card).toHaveAttribute('aria-hidden', 'true')
    expect(card.className).toContain('cm-under')
    onDecode.mockClear()
    const seen = cam.reads
    await new Promise((r) => setTimeout(r, 80))
    expect(onDecode).not.toHaveBeenCalled()
    expect(cam.reads).toBe(seen) // paused: no frame is read
    // The pinch is off underneath (a two-finger touch is the page's again).
    expect(touch(card, 'touchstart', [[100, 300], [200, 300]]).defaultPrevented).toBe(false)
  })

  it('"Type tag #" opens the box in the camera window; Look up sends the tag and closes it; Back to the camera closes it', async () => {
    installCamera()
    const onCode = vi.fn()
    const user = userEvent.setup()
    render(<Scanner onCode={onCode} />)
    await screen.findByTestId('zoom-pill')
    await user.click(screen.getByRole('button', { name: /Type tag #/ }))
    const box = screen.getByLabelText('Tag number')
    expect(box).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    expect(onCode).not.toHaveBeenCalled() // nothing typed: nothing sent
    await user.type(box, '  0183652 {Enter}')
    expect(onCode).toHaveBeenCalledWith('0183652')
    expect(screen.queryByLabelText('Tag number')).toBeNull()
    expect(screen.getByTestId('zoom-pill')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Type tag #/ }))
    await user.click(screen.getByRole('button', { name: 'Back to the camera' }))
    expect(screen.queryByLabelText('Tag number')).toBeNull()
    expect(onCode).toHaveBeenCalledTimes(1)
  })

  it('Restart starts the camera again; a second tap within 10 s reloads the page (owner 2026-10-16)', async () => {
    const camera = installCamera()
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const user = userEvent.setup()
    render(<Scanner />)
    await screen.findByTestId('zoom-pill')
    await user.click(screen.getByRole('button', { name: 'Restart the camera' }))
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(2))
    expect(reload).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Restart the camera' }))
    expect(reload).toHaveBeenCalledOnce()
    expect(HARD_RESTART_MS).toBe(10_000)
  })

  it('shows "Lock upright" on the camera only where the browser can lock, and never in type-only mode', async () => {
    installCamera()
    const toggle = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<Scanner lock={null} />)
    await screen.findByTestId('zoom-pill')
    expect(screen.queryByTestId('lock-upright')).toBeNull()
    rerender(<Scanner lock={{ locked: false, toggle }} />)
    await user.click(screen.getByRole('button', { name: 'Lock the screen upright' }))
    expect(toggle).toHaveBeenCalledOnce()
    rerender(<Scanner lock={{ locked: false, toggle }} typeOnly />)
    expect(screen.queryByTestId('lock-upright')).toBeNull()
  })

  it('a blocked camera says why, opens the tag box, and "Camera not working?" opens the help; its button tries again', async () => {
    const camera = installCamera()
    camera.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
    const user = userEvent.setup()
    render(<Scanner />)
    expect(await screen.findByText('The camera is blocked.')).toBeInTheDocument()
    expect(screen.getByLabelText('Tag number')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Type tag #/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Camera not working?' }))
    const help = await screen.findByRole('dialog', { name: 'Camera not working?' })
    await user.click(within(help).getByRole('button', { name: 'Try the camera again' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(2))
    await screen.findByTestId('zoom-pill')
  })
})
