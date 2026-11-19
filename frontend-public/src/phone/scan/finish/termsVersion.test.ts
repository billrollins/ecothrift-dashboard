/**
 * PLAN-SCANNER.md risk 6: a join cannot finish when the phone's TERMS_VERSION is out of step. The phone scanner's
 * constant must equal the live scanner's (frontend/src/pages/thriftplus/scanner/FinishJoining.tsx) and the server's
 * (apps/thriftplus/services/register.py), and the terms text the joiner reads must carry the same date.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { THRIFT_PLUS_TERMS_EN } from '../../../data/thriftPlusTerms.en'
import { TERMS_VERSION } from '.'

const REPO = join(__dirname, '..', '..', '..', '..', '..')

function constantIn(file: string, pattern: RegExp): string {
  const m = readFileSync(join(REPO, file), 'utf8').match(pattern)
  if (!m) throw new Error(`TERMS_VERSION not found in ${file}`)
  return m[1]
}

describe('TERMS_VERSION (risk 6)', () => {
  it("equals the live scanner's constant", () => {
    const live = constantIn('frontend/src/pages/thriftplus/scanner/FinishJoining.tsx', /export const TERMS_VERSION = '([^']+)'/)
    expect(TERMS_VERSION).toBe(live)
  })

  it("equals the server's register.TERMS_VERSION", () => {
    const server = constantIn('apps/thriftplus/services/register.py', /^TERMS_VERSION = '([^']+)'/m)
    expect(TERMS_VERSION).toBe(server)
  })

  it('is the date on the terms text the joiner reads', () => {
    const [y, m, d] = TERMS_VERSION.split('-').map(Number)
    const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
    expect(THRIFT_PLUS_TERMS_EN.fullIntro.version).toBe(`Version: ${month} ${d}, ${y}.`)
  })
})
