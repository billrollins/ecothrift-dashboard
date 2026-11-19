/**
 * Finish joining (piece S2; PLAN-SCANNER.md row 14, surfaces row C7), the live scanner's
 * `frontend/src/pages/thriftplus/scanner/FinishJoining.tsx` in the new look, behaviour and words unchanged:
 * right after a join's sign-in, and whenever a pending member has steps left, a selfie, then a tap on "I agree" under the
 * terms (owner 2026-11-03; it was a finger signature). One screen per step, "Step 1 of 2". Then "You're a Thrift+
 * member": with a name and a verified phone the last step finishes the membership, with no staff step (J8).
 * Required (owner 2026-10-20): no skip and no ×; ScanApp lands a pending member with steps left here. Only Sign out
 * leaves it. The server's member payload says what is left (`finish_steps`); each answer replaces the session (store),
 * which moves this screen to the next step.
 *
 * Calm (owner 2026-11-19 night): nothing opens in place or pushes the page; the error line and the second button have
 * their places kept; the terms read inside a box of fixed height on their own step.
 */
import { useEffect, useRef, useState } from 'react'
import { selfieJpeg, type FinishStep } from '../core'
import type { FinishProps } from '../contracts'
import { actions, useAction } from '../store'
import { Button, IconCheck } from '../ui'
import SelfieCamera, { OVAL, selfieCameraAvailable } from './SelfieCamera'
import TermsText from './TermsText'
import './finish.css'

/**
 * The terms' version, as the server records it (apps/thriftplus/services/register.py TERMS_VERSION). Must equal the live
 * scanner's constant (frontend/src/pages/thriftplus/scanner/FinishJoining.tsx): termsVersion.test.ts checks both.
 */
export const TERMS_VERSION = '2026-11-18'

/** The words on the agree button (J5): the deliberate act that covers the terms and the photo release. */
export const AGREE_WORDS = 'I agree to the Thrift+ terms and photo release'

function words(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

/** The photo on screen; null where the browser can't show a blob (it still sends). */
function usePreview(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== 'function') {
      setUrl(null)
      return undefined
    }
    let made: string | null = null
    try {
      made = URL.createObjectURL(blob)
    } catch {
      made = null
    }
    setUrl(made)
    return () => {
      if (made) URL.revokeObjectURL(made)
    }
  }, [blob])
  return url
}

type Progress = { n: number; count: number; intro: boolean; onSignOut: () => void }

export default function FinishJoining({ member, onDone, onSignOut }: FinishProps) {
  const left: FinishStep[] = member.ready === false ? member.finish_steps ?? [] : []
  // How many there were when the screen opened, so "Step 2 of 2" stays right as each one is done.
  const [total] = useState(() => left.length)
  const count = Math.max(total, left.length)
  const step = left[0] ?? null
  const n = count - left.length + 1
  const progress: Progress = { n, count, intro: n === 1 && count === 2, onSignOut }

  return (
    <section className="fj" data-testid="finish-joining">
      {step === 'selfie' ? (
        <SelfieStep key="selfie" progress={progress} />
      ) : step === 'sign' ? (
        <SignStep key="sign" progress={progress} />
      ) : (
        <AllSet onDone={onDone} />
      )}
    </section>
  )
}

/** The green band on top of a step: "Step 1 of 2" with its bars, Sign out, the step's headline and line. */
function Band({ progress, title, line }: { progress: Progress; title: string; line: string }) {
  const { n, count, intro, onSignOut } = progress
  return (
    <>
      <header className="fj-hd">
        <div className="fj-row">
          <div className="fj-prog">
            <div className="lbl" data-testid="finish-progress">
              Step {n} of {count}
            </div>
            <div className="fj-bars" aria-hidden="true">
              {Array.from({ length: count }, (_, i) => (
                <i key={i} className={i < n ? 'on' : undefined} />
              ))}
            </div>
          </div>
          <button type="button" className="fj-out" onClick={onSignOut} data-testid="finish-sign-out">
            Sign out
          </button>
        </div>
        <h1 className="disp">{title}</h1>
        <p className="fj-line">{line}</p>
      </header>
      {intro ? (
        <div className="fj-intro" data-testid="finish-intro">
          Two quick steps: 1. Selfie 2. Agree to the terms. Then you're a Thrift+ member.
        </div>
      ) : null}
    </>
  )
}

/** The error's place: kept, so a message never pushes the buttons down. */
function ErrorSlot({ text }: { text: string }) {
  return <div className="fj-err">{text ? <p role="alert">{text}</p> : null}</div>
}

/** An empty frame's stand-in: the oval the camera will show, and a face in it. */
function FaceOval() {
  const cy = 400 * (OVAL.top + OVAL.height / 2)
  return (
    <svg className="fj-face" viewBox="0 0 300 400" aria-hidden="true">
      <ellipse cx="150" cy={cy} rx={150 * OVAL.width} ry={200 * OVAL.height} fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="10 7" />
      <circle cx="150" cy={cy - 22} r="34" fill="none" stroke="currentColor" strokeWidth="6" />
      <path d={`M92 ${cy + 78}c10-34 34-50 58-50s48 16 58 50`} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Step: the selfie. The front camera opens in the app with an oval to fit the face in (owner 2026-10-19: close enough
 * for staff to match it to the ID); where it can't open here, the phone's own camera (a file input with
 * `capture="user"`). The photo is always redrawn as a JPEG (core `selfieJpeg`), never HEIC.
 */
function SelfieStep({ progress }: { progress: Progress }) {
  const selfie = useAction(actions.uploadSelfie)
  const input = useRef<HTMLInputElement | null>(null)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [err, setErr] = useState('')
  const [camera, setCamera] = useState(false)
  // The in-app camera failed once (blocked or unsupported): use the phone's own camera from then on.
  const [native, setNative] = useState(false)
  const preview = usePreview(photo)

  const openNative = () => {
    if (input.current) {
      input.current.value = '' // the same photo again still counts as a new one
      input.current.click()
    }
  }

  const open = () => {
    setErr('')
    if (!native && selfieCameraAvailable()) setCamera(true)
    else openNative()
  }

  const use = async () => {
    if (!photo) return
    setErr('')
    try {
      await selfie.run(photo)
    } catch (e) {
      setErr(words(e, 'Could not save your photo. Try again.'))
    }
  }

  return (
    <div className="fj-step" data-testid="finish-selfie">
      <Band progress={progress} title="Your selfie" line="So the cashier knows it's you." />
      <input
        ref={input}
        hidden
        type="file"
        accept="image/*"
        capture="user"
        data-testid="selfie-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          void selfieJpeg(file).then((jpeg) => {
            if (jpeg) setPhoto(jpeg)
            else setErr("That photo didn't work. Take your selfie again.")
          })
        }}
      />
      <div className="fj-body">
        {camera ? (
          <SelfieCamera
            onPhoto={(blob) => {
              setCamera(false)
              setPhoto(blob)
            }}
            onFail={() => {
              setCamera(false)
              setNative(true)
              setErr("The camera didn't open here. Tap Take my selfie to use your phone's camera.")
            }}
          />
        ) : (
          <>
            <div className={`fj-frame${photo ? ' fj-has' : ''}`}>
              {preview ? (
                <img src={preview} alt="Your selfie" draggable={false} width={960} height={1280} />
              ) : photo ? (
                <div className="fj-taken">Photo taken.</div>
              ) : (
                <FaceOval />
              )}
            </div>
            <div className="fj-tip" data-testid="selfie-tip">
              Fit your face in the oval. No hat or sunglasses.
            </div>
            <ErrorSlot text={err} />
            <div className="fj-acts">
              {photo ? (
                <>
                  <Button kind="ink" wide onClick={() => void use()} pending={selfie.pending} testId="selfie-use">
                    Use this photo
                  </Button>
                  <Button kind="line" wide onClick={open} disabled={selfie.pending} testId="selfie-retake">
                    Retake
                  </Button>
                </>
              ) : (
                <Button kind="ink" wide onClick={open} testId="selfie-take">
                  Take my selfie
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Step: read the terms (word for word, in a box of fixed height that scrolls), tap "I agree" (owner 2026-11-03). */
function SignStep({ progress }: { progress: Progress }) {
  const sign = useAction(actions.signTerms)
  const [err, setErr] = useState('')

  const agree = async () => {
    setErr('')
    try {
      await sign.run({ termsVersion: TERMS_VERSION })
    } catch (e) {
      setErr(words(e, 'That did not save. Tap I agree again.'))
    }
  }

  return (
    <div className="fj-step" data-testid="finish-sign">
      <Band progress={progress} title="Agree to the terms" line="Read the Thrift+ terms, then tap I agree." />
      <div className="fj-body">
        <div className="fj-terms" data-testid="finish-terms" tabIndex={0} role="region" aria-label="Thrift+ terms">
          <TermsText />
        </div>
        <ErrorSlot text={err} />
        <div className="fj-acts fj-acts-one">
          <Button kind="ink" wide className="fj-wrap" onClick={() => void agree()} pending={sign.pending} testId="sign-submit">
            {AGREE_WORDS}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Done: nothing left; they are a member (owner 2026-11-03, J8: no staff step). "Done" opens the Member QR. */
function AllSet({ onDone }: { onDone: () => void }) {
  return (
    <div className="fj-step" data-testid="finish-done">
      <header className="fj-hd fj-hd-done">
        <span className="fj-check" aria-hidden="true">
          <IconCheck />
        </span>
        <h1 className="disp">You're a Thrift+ member</h1>
      </header>
      <div className="fj-body fj-done">
        <p className="fj-show">Show your member QR at the register.</p>
        <Button kind="lime" wide onClick={onDone} testId="finish-done-button">
          Done
        </Button>
      </div>
    </div>
  )
}
