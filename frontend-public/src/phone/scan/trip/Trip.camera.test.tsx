/**
 * Every code the CAMERA reads gets an answer (ported from the live ScanHelp.test.tsx :226 and :259, owner 2026-10-15,
 * APP D14 and D15), with the trip owning the real camera hook (core `useQrCamera`, unchanged). jsdom has no camera, so
 * a fake one stands in: a track, and a BarcodeDetector that reads whatever `cam.codes` holds. The camera piece (S3) is a
 * double that only mounts the hook's <video>, as the contract asks.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CameraProps } from '../contracts'
import { renderScan, resetScanner } from '../test/harness'
import type { FakeApi } from '../test/fakeApi'

vi.mock('../camera', () => ({
  default: ({ camera }: CameraProps) => <video ref={camera.videoRef} playsInline muted data-testid="camera-video" />,
  CameraHelp: () => null,
  TurnUpright: () => null,
  SidewaysScanPill: () => null,
  SidewaysGotIt: () => null,
}))
vi.mock('../signin', () => ({ default: () => <h1>Sign in</h1>, AddPhone: () => null }))
vi.mock('../member', () => ({ HomeScreenCard: () => null }))

/** What the fake decoder reads in every frame. */
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

function installCamera() {
  const getUserMedia = vi.fn(async () => {
    const track = { applyConstraints: vi.fn(async () => undefined), stop: vi.fn(), getCapabilities: () => ({}), getSettings: () => ({ zoom: 1 }),
      addEventListener: () => undefined, removeEventListener: () => undefined, readyState: 'live', muted: false }
    return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
  })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices: vi.fn(async () => []) } })
  return { getUserMedia }
}

const vibrate = vi.fn()
let fake: FakeApi

beforeAll(() => {
  (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = FakeDetector
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
  // The video "plays" with a 1280 x 720 frame ready to read.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: async () => undefined })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 720 })
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null })
})

beforeEach(() => {
  fake = resetScanner()
  fake.guestOnThisPhone()
  cam.codes = []
  cam.reads = 0
  vibrate.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Every code the camera reads gets an answer (owner 2026-10-15, APP D14 and D15)', () => {
  it('a product barcode buzzes and says "That\'s not our price tag"; Scan again ignores it for 3 s', async () => {
    // Only Date is faked: the camera's frames and the page's timers stay real; the 3 s window is read off a clock the
    // test moves, so it is checked exactly instead of waited out.
    vi.useFakeTimers({ toFake: ['Date'] })
    installCamera()
    cam.codes = [{ rawValue: '0123456789012', format: 'ean_13' }]
    const user = userEvent.setup()
    renderScan('/scan')
    expect(await screen.findByTestId('answer-not-ours')).toBeInTheDocument()
    expect(vibrate).toHaveBeenCalledWith(15)

    const at = Date.now()
    await user.click(screen.getByTestId('scan-again'))
    await waitFor(() => expect(screen.queryByTestId('scan-card')).toBeNull())
    // Still in view at 2.9 s: frame after frame reads the code, and it stays ignored.
    vi.setSystemTime(at + 2900)
    const seen = cam.reads
    await waitFor(() => {
      expect(screen.queryByTestId('answer-not-ours')).toBeNull()
      expect(cam.reads).toBeGreaterThan(seen + 5)
    })
    expect(screen.queryByTestId('answer-not-ours')).toBeNull()
    // It comes back once the 3 s are up.
    vi.setSystemTime(at + 3100)
    expect(await screen.findByTestId('answer-not-ours')).toBeInTheDocument()

    // Another code is answered at once: one of our links, with the clock standing still.
    await user.click(screen.getByTestId('scan-again'))
    cam.codes = [{ rawValue: 'https://ecothrift.us/terms', format: 'qr_code' }]
    expect(await screen.findByTestId('answer-link')).toHaveTextContent('It opens ecothrift.us/terms.')
  })

  it("a tag's QR beats a product barcode in the same picture", async () => {
    installCamera()
    cam.codes = [{ rawValue: '0123456789012', format: 'ean_13' }, { rawValue: 'TP0000001', format: 'qr_code' }]
    renderScan('/scan')
    expect(await screen.findByText('Cordless Drill Kit')).toBeInTheDocument()
    expect(screen.queryByTestId('answer-not-ours')).toBeNull()
  })

  it('a code read while a tag is up waits: the tag stays until Pass or Add', async () => {
    installCamera()
    cam.codes = [{ rawValue: 'TP0000001', format: 'qr_code' }]
    const user = userEvent.setup()
    renderScan('/scan')
    expect(await screen.findByText('Cordless Drill Kit')).toBeInTheDocument()
    cam.codes = [{ rawValue: 'TP0000002', format: 'qr_code' }]
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.getByText('Cordless Drill Kit')).toBeInTheDocument()
    await user.click(screen.getByTestId('pass'))
    expect(await screen.findByText('KitchenAid stand mixer')).toBeInTheDocument()
  })
})
