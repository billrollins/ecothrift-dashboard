/**
 * Ported from frontend/src/pages/thriftplus/scanner/copyRules.test.ts: the same banned words, over every file of the
 * phone scanner (scan/ and its pieces' folders, tests and the fake server left out) and its API client.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/** Thrift+ words to avoid (owner's design, 09-25). */
const AVOID = [/\bfees?\b/i, /\bdues\b/i, /\bunlock/i, /\bcash ?back\b/i, /\bpoints\b/i, /\bbonus/i, /\bclawback/i]
/** The signed words (rule D, 2026-10-10). */
const SIGNED = [/\bRewards\b/, /\b(you'd|members|to|would have) earn/i, /\bearns\b/i, /\bpays for\b/i, /\buse now\b/i, /\bmember price\b/i,
  /\b20% less\b/i, /\bBanked\b/]
/** The 10-12 policy (V2, V8, B6, W1). */
const POLICY_1012 = [
  /InstantBucks/, /\bfull reward/i, /\binstant reward/i, /\bcover\b/i, /(?<!not a )warranty/i, /primary function/i,
  /\bbank(ed)?\b/i, /\bearn(s|ed|ing)?\b/i, /Return \$/, /store credit/i, /gift card/i, /Thrift\+ Cash/i, /Thrift Bucks/i,
  /\bTBucks\b/i, /\bautomatic(ally)?\b/i, /Nothing owed, ever/i,
]
/** No card (owner 2026-10-14, APP D6). */
const NO_CARD = [/\bcards?\b(?![.\w(])/i]
/** "Non-member", never "guest", where a customer reads (owner 2026-10-15, APP D10). */
const NO_GUEST = [/\bguests?\b/i]

/** What a customer reads: string literals with a space in them, and JSX text. Comments go first. */
function customerText(source: string): string {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
  const parts: string[] = []
  for (const m of text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? ''
    if (/\s/.test(s)) parts.push(s)
  }
  for (const m of text.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) parts.push(m[1])
  return parts.join('\n')
}

/** Every .ts/.tsx of the phone scanner but tests and the fake server (test/). */
function scannerFiles(dir: string = __dirname): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'test') out.push(...scannerFiles(full))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

/** Whole files less what is not copy: CSS's own "cover", the data names 'bank' and `.banked`, `.unlock()`. */
function asCopy(text: string): string {
  return text
    .replace(/\.unlock\(\)/g, '')
    .replace(/\b(objectFit|backgroundSize|object-fit|background-size)\s*:\s*['"]?cover['"]?/g, '')
    .replace(/(['"])bank\1/g, '')
    .replace(/\.banked\b/g, '')
}

function hitsIn(files: string[], rules: RegExp[]): string[] {
  const hits: string[] = []
  for (const file of files) {
    const text = asCopy(readFileSync(file, 'utf8'))
    for (const re of rules) {
      const m = text.match(re)
      if (m) hits.push(`${file.split(/[\\/]/).slice(-2).join('/')}: ${m[0]}`)
    }
  }
  return hits
}

function customerHits(rule: RegExp): string[] {
  const hits: string[] = []
  for (const file of scannerFiles()) {
    const m = customerText(readFileSync(file, 'utf8')).match(rule)
    if (m) hits.push(`${file.split(/[\\/]/).slice(-2).join('/')}: ${m[0]}`)
  }
  return hits
}

describe('Thrift+ phone scanner copy', () => {
  it('reads the files of every piece', () => {
    const names = scannerFiles().map((f) => f.split(/[\\/]/).slice(-2).join('/'))
    expect(names).toEqual(expect.arrayContaining(['scan/api.ts', 'scan/ScanApp.tsx', 'signin/index.tsx', 'trip/index.tsx', 'member/index.tsx']))
  })

  it('never uses the words the program avoids', () => {
    // As the live test: the API client's data names (`banked`) are checked only where a customer reads (below).
    const files = scannerFiles().filter((f) => !/[\\/]scan[\\/]api\.ts$/.test(f))
    expect(hitsIn(files, [...AVOID, ...SIGNED, ...POLICY_1012])).toEqual([])
  })

  it('never says card where a customer reads, and leaves code names alone', () => {
    expect(customerHits(NO_CARD[0])).toEqual([])
    expect(customerText(`<b>Scan your card</b>`)).toMatch(NO_CARD[0])
    expect(customerText(`import { CameraCard } from './CameraCard'; testId="my-card"; get('/me/card/')`)).not.toMatch(NO_CARD[0])
  })

  it('never says guest where a customer reads, and leaves code names alone', () => {
    expect(customerHits(NO_GUEST[0])).toEqual([])
    expect(customerText(`<button>Scan as a guest</button>`)).toMatch(NO_GUEST[0])
    expect(customerText(`const isGuest = s.status === 'guest'; readJson('thriftPlus.real.guest', false)`)).not.toMatch(NO_GUEST[0])
  })

  it('has no exclamation mark in new words (the pinned live lines are ported as they are, call 4)', () => {
    const PINNED = ['Got it!', 'Thanks for looking out!', '3-day returns and more!']
    const hits = scannerFiles().flatMap((f) =>
      customerText(readFileSync(f, 'utf8')).split('\n').filter((line) => /!/.test(line) && !PINNED.some((p) => line.includes(p)) && /[A-Za-z]!/.test(line)),
    )
    expect(hits).toEqual([])
  })
})
