/**
 * Every code the camera reads gets an answer in the slot (the live ScanAnswers.tsx, owner 2026-10-15, APP D14 and
 * D15), never a toast that's easy to miss. The action row under each is [Scan again]; a link adds [Open link].
 * - D14a, not our code: a product barcode, other text, or a link to another site.
 * - D14b, our code, not found: it sells as marked, with no ThriftBucks, AS IS (rulebook P11).
 * - D15, one of our links (ecothrift.us), like the terms QR on a poster.
 * Also the two in-between answers: "Looking up" while the tag is asked for, and "No connection" (APP D14: as built).
 * Each one fits the slot's fixed size (PLAN-SCANNER.md risk 12).
 */
// The picture of our green tag, read from the live scanner's own file (cross-import, unchanged; PLAN-SCANNER.md section 3).
import greenTagUrl from '../../../../../frontend/src/assets/thriftplus/our-green-tag.webp'
import { IconLink, Spinner } from '../ui'
import { ReturnsBadge } from './parts'

/** D14a: the picture of our green tag (its QR ringed in member green), then where to scan. */
export function NotOurTag() {
  return (
    <div className="tr-a tr-a-row" data-testid="answer-not-ours">
      <img className="tr-a-tag" src={greenTagUrl} alt="Our green price tag, with its QR code" width={900} height={649} decoding="async" />
      <div>
        <h2 className="tr-a-h">That&apos;s not our price tag</h2>
        <p className="tr-a-p">Look for our green tag and scan the QR code on it.</p>
      </div>
    </div>
  )
}

/** D14b: our code, but no item. "AS IS" and "3-day" never break across lines. */
export function CantFindItem({ code, onAsIs }: { code: string; onAsIs: () => void }) {
  return (
    <div className="tr-a" data-testid="answer-not-found">
      <h2 className="tr-a-h">We can&apos;t find that item</h2>
      <p className="tr-a-p">{"It's priced as marked, with no ThriftBucks. Sold AS IS, so no 3‑day returns."}</p>
      <div className="tr-a-foot">
        <ReturnsBadge ok={false} onClick={onAsIs} />
        <span className="tr-a-none" data-testid="no-thriftbucks">No ThriftBucks on this item</span>
      </div>
      <span className="tr-a-code tn" data-testid="answer-code">{code}</span>
    </div>
  )
}

/** D15: one of our links. The address shows as host and path, in bold ink. */
export function OurLink({ shown }: { shown: string }) {
  return (
    <div className="tr-a tr-a-row" data-testid="answer-link">
      <span className="tr-a-icon" aria-hidden="true"><IconLink /></span>
      <div>
        <h2 className="tr-a-h">That QR code is a link</h2>
        <p className="tr-a-p">
          It opens <b>{shown}</b>.
          <br />
          To see a price, scan the QR code on our green tag.
        </p>
      </div>
    </div>
  )
}

/** The tag is being asked for (a moment on a good signal). */
export function LookingUp({ sku }: { sku: string }) {
  return (
    <div className="tr-a tr-a-mid" data-testid="answer-looking">
      <Spinner size={30} label="Looking up" />
      <p className="tr-a-p">Looking up</p>
      <span className="tr-a-code tn">{sku}</span>
    </div>
  )
}

/** No answer from the store (APP D14: as built). */
export function NoConnection({ message, sku }: { message: string; sku: string }) {
  return (
    <div className="tr-a" data-testid="answer-offline">
      <h2 className="tr-a-h">No connection</h2>
      <p className="tr-a-p">{message}</p>
      <span className="tr-a-code tn">{sku}</span>
    </div>
  )
}
