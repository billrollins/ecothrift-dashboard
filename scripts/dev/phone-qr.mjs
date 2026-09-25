/**
 * Phone QR codes for the local dev stack.
 *
 * Prints a scannable QR code in the console (dev.ps1 calls this in the READY
 * report), and can also write a small local HTML page with big QR codes for
 * every phone URL, for when the console is too small or already closed.
 *
 *   node scripts/dev/phone-qr.mjs <url>
 *   node scripts/dev/phone-qr.mjs --qr <url> [--html <file>] [--link "Label|url" ...] [--no-color]
 *
 * Uses the `qrcode` package already in frontend/node_modules, so there is
 * nothing extra to install. Never fails the launcher: any problem prints one
 * line and exits 0.
 *
 * Console QR: half-block characters, two QR rows per text line, forced white
 * on black when writing to a real console so the colors are right in any
 * theme. Light modules are drawn as blocks, dark modules are the black
 * background, so even without colors it scans on a dark console.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendPkg = path.resolve(here, '..', '..', 'frontend', 'package.json')

const FULL = '\u2588'
const UPPER = '\u2580'
const LOWER = '\u2584'
const QUIET = 2 // quiet-zone modules around the code (the spec says 4; 2 scans fine on screen)

function parseArgs(argv) {
  const out = { qr: [], links: [], html: '', color: !!process.stdout.isTTY }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--qr') out.qr.push(argv[++i] || '')
    else if (a === '--html') out.html = argv[++i] || ''
    else if (a === '--link') {
      const v = argv[++i] || ''
      const bar = v.indexOf('|')
      out.links.push(bar >= 0 ? { label: v.slice(0, bar), url: v.slice(bar + 1) } : { label: v, url: v })
    }
    else if (a === '--no-color') out.color = false
    else if (!a.startsWith('--')) out.qr.push(a)
  }
  if (process.env.NO_COLOR) out.color = false
  out.qr = out.qr.filter(Boolean)
  out.links = out.links.filter((l) => l.url)
  return out
}

function loadQrcode() {
  try {
    return createRequire(frontendPkg)('qrcode')
  }
  catch {
    return null
  }
}

/** Console QR as text lines (no trailing newline). */
function renderConsole(QRCode, text, color) {
  // Level M: a ~45 character URL is 33x33 modules (19 console lines), with
  // enough error correction to shrug off glare and moire on a monitor.
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const light = (x, y) => {
    if (y >= size + QUIET) return false // below the quiet zone: plain console background
    if (x < 0 || y < 0 || x >= size || y >= size) return true // quiet zone
    return !qr.modules.get(y, x)
  }
  const on = color ? '\x1b[97;40m' : ''
  const off = color ? '\x1b[0m' : ''
  const lines = []
  for (let y = -QUIET; y < size + QUIET; y += 2) {
    let row = ''
    for (let x = -QUIET; x < size + QUIET; x++) {
      const top = light(x, y)
      const bottom = light(x, y + 1)
      row += top && bottom ? FULL : top ? UPPER : bottom ? LOWER : ' '
    }
    lines.push('  ' + on + row + off)
  }
  return lines.join('\n')
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function writeHtml(QRCode, file, links) {
  const cards = []
  for (const { label, url } of links) {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' })
    cards.push(
      `<section><h2>${esc(label)}</h2>${svg}<p><a href="${esc(url)}">${esc(url)}</a></p></section>`,
    )
  }
  const stamp = new Date().toLocaleString()
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Phone QR codes</title>
<style>
  body { margin: 0; padding: 24px 16px; background: #f4f4f2; color: #1d1d1b; font: 16px/1.4 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .note { margin: 0 0 20px; color: #55554f; }
  main { display: flex; flex-wrap: wrap; gap: 20px; }
  section { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.12); max-width: 340px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  svg { display: block; width: 300px; max-width: 100%; height: auto; }
  p { margin: 8px 0 0; word-break: break-all; font-size: 14px; }
  a { color: #1d4ed8; }
</style>
</head>
<body>
<h1>Scan with the phone camera</h1>
<p class="note">Local dev stack on this PC. The first visit on each phone shows a certificate warning: accept it once. Written ${esc(stamp)} by scripts/dev/phone-qr.mjs.</p>
<main>
${cards.join('\n')}
</main>
</body>
</html>
`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, html, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.qr.length === 0 && !(args.html && args.links.length)) {
    console.log('usage: node scripts/dev/phone-qr.mjs <url> [--html <file> --link "Label|url" ...]')
    return
  }
  const QRCode = loadQrcode()
  if (!QRCode) {
    console.log('  (no QR code: frontend\\node_modules\\qrcode is missing - run npm install in frontend)')
    return
  }
  for (const url of args.qr) {
    console.log(renderConsole(QRCode, url, args.color))
  }
  if (args.html && args.links.length) {
    await writeHtml(QRCode, args.html, args.links)
  }
}

main().catch((err) => {
  console.log(`  (QR code skipped: ${err && err.message ? err.message : err})`)
})
