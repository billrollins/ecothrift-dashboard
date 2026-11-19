/**
 * The offer letter and the finger signature pad (W4), from the live offer page (src/pages/careers/OfferPage.tsx):
 * the same paragraphs and "- " lists, and the same PNG the server stores (a tap or a dot does not count as a signature).
 */
import { useEffect, useRef } from 'react'

/** The letter: paragraphs, with "- " lines as a list. */
export function Letter({ text }: { text: string }) {
  return (
    <div className="cr-letter">
      {text.split('\n\n').map((para, i) => {
        const lines = para.split('\n').filter((l) => l.trim())
        if (lines.length && lines.every((l) => l.trimStart().startsWith('- '))) {
          return (
            <ul key={i}>
              {lines.map((l) => (
                <li key={l}>{l.trimStart().slice(2)}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{lines.join('\n')}</p>
      })}
    </div>
  )
}

// The ink of the signed copy (the same as the live pad, so every signed PDF looks alike).
const INK = '#1b2a4a'

/** Sign with a finger (or mouse). Calls onChange with a PNG data URL, or '' when cleared. */
export function SignaturePad({ onChange }: { onChange: (png: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const ink = useRef(0)

  function setup() {
    const el = canvas.current
    if (!el) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.round(el.clientWidth * ratio)
    el.height = Math.round(el.clientHeight * ratio)
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.4
    ctx.strokeStyle = INK
  }

  useEffect(() => {
    setup()
    const resize = () => {
      // Resizing wipes the canvas; only redo it while nothing is drawn.
      if (ink.current === 0) setup()
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drawing.current = true
    last.current = point(e)
    const ctx = e.currentTarget.getContext('2d')
    if (ctx && last.current) {
      ctx.beginPath()
      ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2)
      ctx.fillStyle = INK
      ctx.fill()
    }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    e.preventDefault()
    const ctx = e.currentTarget.getContext('2d')
    const next = point(e)
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(last.current.x, last.current.y)
      ctx.lineTo(next.x, next.y)
      ctx.stroke()
    }
    ink.current += Math.hypot(next.x - last.current.x, next.y - last.current.y)
    last.current = next
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    // A real signature has some length to it; a tap or a dot does not count.
    onChange(ink.current > 40 && canvas.current ? canvas.current.toDataURL('image/png') : '')
  }

  function clear() {
    const el = canvas.current
    if (!el) return
    el.getContext('2d')?.clearRect(0, 0, el.width, el.height)
    ink.current = 0
    onChange('')
  }

  return (
    <div className="cr-sigpad">
      <canvas
        ref={canvas}
        aria-label="Sign here with your finger"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      <span className="cr-sigline" />
      <span className="cr-sighint">Sign above the line with your finger</span>
      <button type="button" className="cr-sigclear" onClick={clear}>
        Clear
      </button>
    </div>
  )
}
