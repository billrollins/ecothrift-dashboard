/**
 * "Camera not working?" (PLAN-SCANNER.md row 26; live Explainers.tsx): how to allow the camera on an iPhone or an
 * Android phone. A fade-in sheet over the page (the live popup zoomed out of the tap; call 3 and the owner's 11-19 night
 * rule: no zoom, no slide, nothing under it moves). Every step shows open. The iPhone / Android switch swaps the steps in
 * a space sized for the longer set, so the sheet never changes height.
 */
import { useState } from 'react'
import type { CameraHelpProps } from '../contracts'
import { Button, Sheet } from '../ui'
import { IconNoCamera } from './icons'

type Platform = 'iphone' | 'android'

function guessPlatform(): Platform {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return /android/i.test(ua) ? 'android' : 'iphone'
}

/** The live steps, word for word. */
export const STEPS: Record<Platform, { main: string[]; more: string[] }> = {
  iphone: {
    main: [
      'In Safari, tap the aA button at the left of the address bar.',
      'Tap Website Settings, then set Camera to Allow.',
      'Come back here and tap Try the camera again.',
    ],
    more: [
      'Still blocked? Open the Settings app > Safari > Camera, and choose Allow or Ask.',
      'Using Chrome on iPhone? Open the Settings app > Chrome, and turn on Camera.',
    ],
  },
  android: {
    main: [
      'In Chrome, tap the icon just left of the web address (two sliders or a lock).',
      'Tap Permissions, then turn Camera on (or Allow).',
      'Come back here and tap Try the camera again.',
    ],
    more: [
      'Samsung Internet: tap the menu > Settings > Sites and downloads > Site permissions > Camera.',
      'Still blocked? Open the Settings app > Apps > Chrome > Permissions > Camera > Allow.',
    ],
  },
}

const PLATFORMS: Platform[] = ['iphone', 'android']

export function CameraHelp({ onClose, onRetry }: CameraHelpProps) {
  const [platform, setPlatform] = useState<Platform>(guessPlatform)
  return (
    <Sheet label="Camera not working?" onClose={onClose} testId="camera-help" className="cm-help">
      <IconNoCamera className="cm-help-art" />
      <h2 className="cm-help-h">Camera not working?</h2>
      <p className="cm-help-lead">The scanner needs your permission to use the camera. Here&apos;s how to turn it on.</p>
      <div className="cm-help-tabs" role="tablist" aria-label="Your phone">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            id={`cm-tab-${p}`}
            aria-selected={platform === p}
            aria-controls={`cm-steps-${p}`}
            className={`cm-help-tab${platform === p ? ' cm-on' : ''}`}
            onClick={() => setPlatform(p)}
          >
            {p === 'iphone' ? 'iPhone' : 'Android'}
          </button>
        ))}
      </div>
      {/* Both sets in one grid cell: the cell is as tall as the longer one, the other is kept invisible. */}
      <div className="cm-help-steps">
        {PLATFORMS.map((p) => {
          const shown = platform === p
          return (
            <div
              key={p}
              id={`cm-steps-${p}`}
              role="tabpanel"
              aria-labelledby={`cm-tab-${p}`}
              aria-hidden={!shown}
              className={`cm-help-set${shown ? '' : ' cm-off'}`}
              data-testid={`camera-help-${p}`}
            >
              <ol>
                {STEPS[p].main.map((s, k) => (
                  <li key={s}>
                    <span className="cm-help-n">{k + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              {STEPS[p].more.map((s) => (
                <p key={s} className="cm-help-more">
                  {s}
                </p>
              ))}
            </div>
          )
        })}
      </div>
      <p className="cm-help-also">Also close other apps that use the camera. You can always type the tag number instead.</p>
      <Button
        kind="ink"
        wide
        onClick={() => {
          onClose()
          onRetry()
        }}
      >
        Try the camera again
      </Button>
    </Sheet>
  )
}
