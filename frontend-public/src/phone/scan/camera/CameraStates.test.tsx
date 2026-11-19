/**
 * The camera window's other states (piece S3): no camera and the help (ported from ThriftPlusScannerPage.test.tsx :374,
 * its help half; the "not our price tag" half is the trip's), type-only test mode with the test tags, resting, stalled,
 * starting, and the read-square geometry (fit.ts, plan risk 11). A fake camera object stands in where the state is what
 * is tested; the no-camera case runs the real hook in jsdom, which has no camera at all.
 */
import { createRef, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetApi } from '../api'
import type { QrCamera } from '../contracts'
import { useQrCamera, type CameraStatus } from '../core'
import { _resetScanStore } from '../store'
import { installFakeApi, type FakeApi } from '../test/fakeApi'
import { FIT_MARGIN, READ_FRACTION, fitCamera } from './fit'
import Camera, { CameraHelp } from './index'
import { STEPS } from './CameraHelp'

let fake: FakeApi

function fakeCamera(status: CameraStatus, more: Partial<QrCamera> = {}): QrCamera {
  return {
    videoRef: createRef<HTMLVideoElement>(),
    status,
    error: '',
    decoder: null,
    wake: vi.fn(),
    restart: vi.fn(),
    poke: vi.fn(),
    zoom: null,
    switching: false,
    ...more,
  }
}

function show(camera: QrCamera, { typeOnly = false, onCode = vi.fn(), onHelp = vi.fn() } = {}) {
  render(<Camera camera={camera} flash={false} onCode={onCode} onHelp={onHelp} typeOnly={typeOnly} lock={null} fullBleed={false} underneath={false} />)
  return { onCode, onHelp }
}

/** The real hook on a browser with no camera, and the help sheet, as the trip wires them. */
function NoCameraScanner() {
  const [help, setHelp] = useState(false)
  const camera = useQrCamera({ enabled: true, paused: false, onDecode: () => undefined })
  return (
    <>
      <Camera camera={camera} flash={false} onCode={() => undefined} onHelp={() => setHelp(true)} typeOnly={false} lock={null} fullBleed={false}
        underneath={false} />
      {help ? <CameraHelp onClose={() => setHelp(false)} onRetry={camera.wake} /> : null}
    </>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  fake = installFakeApi()
  _resetApi()
  _resetScanStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('No camera, and the camera help (page test :374, its help half)', () => {
  it('helps when the camera does not work: the help opens from the camera window, with the Android steps a tap away', async () => {
    const user = userEvent.setup()
    render(<NoCameraScanner />)
    expect(await screen.findByText("This browser can't open the camera here.")).toBeInTheDocument()
    expect(screen.getByLabelText('Tag number')).toBeInTheDocument() // the box is open: type the tag instead
    await user.click(await screen.findByRole('button', { name: 'Camera not working?' }))
    const help = await screen.findByRole('dialog', { name: 'Camera not working?' })
    await user.click(within(help).getByRole('tab', { name: 'Android' }))
    expect(within(help).getByText(/Tap Permissions, then turn Camera on/)).toBeInTheDocument()
  })

  it('swaps the steps in place without the sheet changing height: both sets stay laid out, the other one invisible', async () => {
    const user = userEvent.setup()
    render(<CameraHelp onClose={() => undefined} onRetry={() => undefined} />)
    const help = screen.getByRole('dialog', { name: 'Camera not working?' })
    const iphone = within(help).getByTestId('camera-help-iphone')
    const android = within(help).getByTestId('camera-help-android')
    expect(within(help).getByRole('tab', { name: 'iPhone' })).toHaveAttribute('aria-selected', 'true') // jsdom is not Android
    expect(android).toHaveAttribute('aria-hidden', 'true')
    expect(android.className).toContain('cm-off')
    await user.click(within(help).getByRole('tab', { name: 'Android' }))
    expect(iphone).toHaveAttribute('aria-hidden', 'true')
    expect(android).toHaveAttribute('aria-hidden', 'false')
    // Every live line is there, word for word, all shown open (no tap-to-open rows).
    for (const s of [...STEPS.android.main, ...STEPS.android.more]) expect(within(android).getByText(s)).toBeInTheDocument()
    expect(within(help).getByText('Also close other apps that use the camera. You can always type the tag number instead.')).toBeInTheDocument()
    expect(within(help).queryByRole('button', { expanded: false })).toBeNull()
  })

  it('"Try the camera again" closes the help and starts the camera again; the × and Escape close it', async () => {
    const onClose = vi.fn()
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<CameraHelp onClose={onClose} onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: 'Try the camera again' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onRetry).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})

describe('Type-only test mode (?type=1, owner 2026-10-10)', () => {
  it('lists the test tags (name, tag price, ThriftBucks) and picking one looks it up; no camera, no zoom', async () => {
    fake.setTestTags([
      { sku: 'TP0000001', title: 'Cordless Drill Kit', price: '24.99', reward: '3.75' },
      { sku: 'TP0000002', title: 'Lamp', price: '9.00', reward: '0.00' },
    ])
    const user = userEvent.setup()
    const { onCode } = show(fakeCamera('off'), { typeOnly: true })
    expect(screen.getByText('Test mode: pick a tag')).toBeInTheDocument()
    const pick = await screen.findByRole('combobox', { name: 'Pick a test item' })
    expect(within(pick).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Pick a test item…',
      'Cordless Drill Kit · $24.99 · 3.75 ThriftBucks',
      'Lamp · $9.00 · no ThriftBucks yet',
    ])
    await user.selectOptions(pick, 'TP0000002')
    expect(onCode).toHaveBeenCalledWith('TP0000002')
    expect(fake.count('GET', 'test-tags/')).toBe(1)
    expect(screen.queryByTestId('zoom-pill')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart the camera' })).toBeNull()
  })

  it('with no test tags, the "Tag number" box instead, with the keyboard up', async () => {
    const user = userEvent.setup()
    const { onCode } = show(fakeCamera('off'), { typeOnly: true })
    const box = await screen.findByLabelText('Tag number')
    expect(box).toHaveFocus()
    await user.type(box, 'tp0000001{Enter}')
    expect(onCode).toHaveBeenCalledWith('tp0000001') // the trip upper-cases it, as live (api lookupTag)
    expect(screen.queryByRole('button', { name: 'Back to the camera' })).toBeNull()
  })
})

describe('Starting, resting and stalled', () => {
  it('starting: a spinner and "Starting camera"; the picture is see-through, not hidden', () => {
    show(fakeCamera('starting'))
    expect(screen.getByRole('status')).toHaveTextContent('Starting camera')
    const video = screen.getByTestId('camera-video')
    expect(video.className).not.toContain('cm-live')
    expect(video.style.display).toBe('')
    expect(screen.getByRole('button', { name: /Type tag #/ })).toBeInTheDocument()
  })

  it('resting after 5 quiet minutes: the window is "Tap to scan", and a tap wakes the camera', async () => {
    const camera = fakeCamera('resting')
    const user = userEvent.setup()
    show(camera)
    expect(screen.getByText('The camera rests after 5 quiet minutes.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Tap to scan/ }))
    expect(camera.wake).toHaveBeenCalledOnce()
    expect(screen.getByTestId('camera-video').closest('button')).toBeNull()
  })

  it('stalled: "Tap to restart the camera"; a second tap within 10 s reloads the page', async () => {
    const camera = fakeCamera('stalled')
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const user = userEvent.setup()
    show(camera)
    expect(screen.getByText('The picture stopped.')).toBeInTheDocument()
    await user.click(screen.getByTestId('camera-stalled'))
    expect(camera.restart).toHaveBeenCalledOnce()
    await user.click(screen.getByTestId('camera-stalled'))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('no highlight flash on a read (owner 11-19 night): the corners keep their look', () => {
    const camera = fakeCamera('live')
    const { rerender } = render(<Camera camera={camera} flash={false} onCode={vi.fn()} onHelp={vi.fn()} typeOnly={false} lock={null} fullBleed={false} underneath={false} />)
    const corners = () => screen.getByTestId('camera-card').querySelector('.cm-find')!.outerHTML
    const before = corners()
    rerender(<Camera camera={camera} flash onCode={vi.fn()} onHelp={vi.fn()} typeOnly={false} lock={null} fullBleed={false} underneath={false} />)
    expect(corners()).toBe(before)
  })
})

describe('What the customer sees is what the decoder reads (fit.ts, plan risk 11)', () => {
  const portrait = { w: 720, h: 1280 } // a phone held upright gives the frame this way round

  it('a tall enough window: the picture fills it and the read square is 70 % of its width', () => {
    const fit = fitCamera({ w: 358, h: 300 }, portrait)!
    expect(fit.shrunk).toBe(false)
    expect(fit.video.width).toBeCloseTo(358)
    expect(fit.video.height).toBeGreaterThan(300) // the frame's top and bottom are outside the window
    expect(fit.square).toBeCloseTo(358 * READ_FRACTION)
    expect(fit.square).toBeLessThanOrEqual(300 * FIT_MARGIN)
  })

  it('a short window: the picture is drawn smaller so the whole read square is inside the window', () => {
    const fit = fitCamera({ w: 358, h: 132 }, portrait)!
    expect(fit.shrunk).toBe(true)
    expect(fit.square).toBeCloseTo(132 * FIT_MARGIN)
    // The read square on screen: the frame's middle 70 % of its short side, at the drawn scale.
    const scale = fit.video.width / portrait.w
    expect(fit.square).toBeCloseTo(READ_FRACTION * portrait.w * scale)
    expect(fit.video.width).toBeLessThan(358)
    expect(fit.video.left).toBeCloseTo((358 - fit.video.width) / 2)
    expect(fit.video.top).toBeCloseTo((132 - fit.video.height) / 2)
  })

  it('sideways (the window is the whole screen): the picture fills it', () => {
    const fit = fitCamera({ w: 844, h: 390 }, { w: 1280, h: 720 })!
    expect(fit.shrunk).toBe(false)
    expect(fit.video.width).toBeCloseTo(844)
    expect(fit.square).toBeLessThanOrEqual(390 * FIT_MARGIN)
  })

  it('nothing until both sizes are known', () => {
    expect(fitCamera({ w: 0, h: 0 }, portrait)).toBeNull()
    expect(fitCamera({ w: 358, h: 132 }, { w: 0, h: 0 })).toBeNull()
  })

  it('the window places the picture and the corners from the real sizes', async () => {
    const camera = fakeCamera('live')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(358)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(132)
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(720)
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(1280)
    show(camera)
    await waitFor(() => expect(screen.getByTestId('camera-card')).toHaveAttribute('data-shrunk', 'true'))
    const find = screen.getByTestId('camera-card').querySelector<HTMLElement>('.cm-find')!
    expect(parseFloat(find.style.width)).toBeCloseTo(132 * FIT_MARGIN)
    const video = screen.getByTestId('camera-video')
    expect(parseFloat(video.style.width)).toBeLessThan(358)
    // A short window: the picture at the left edge, the corners on its middle, the controls in a column on the right.
    expect(video.style.left).toBe('0px')
    expect(parseFloat(find.style.left)).toBeCloseTo(parseFloat(video.style.width) / 2)
    expect(screen.getByTestId('camera-card').className).toContain('cm-compact')
    expect(screen.getByRole('button', { name: /Type tag #/ }).closest('.cm-tr')).not.toBeNull()
    vi.restoreAllMocks()
  })
})
