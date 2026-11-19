/**
 * The member QR, crisp: an SVG with a 4-module quiet zone, error correction M (APP D1), black on white, as the live
 * scanner draws it (tripSheets.tsx `CardQr`). The box keeps its size while the SVG is made, so nothing moves.
 */
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export function CardQr({ text, className, testId = 'my-card-qr' }: { text: string; className?: string; testId?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let live = true
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#ffffff' } })
      .then((out) => live && setSvg(out))
      .catch(() => live && setSvg(''))
    return () => {
      live = false
    }
  }, [text])
  return (
    <span
      className={`mb-qrsvg${className ? ` ${className}` : ''}`}
      data-testid={testId}
      role="img"
      aria-label="Your member QR"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
