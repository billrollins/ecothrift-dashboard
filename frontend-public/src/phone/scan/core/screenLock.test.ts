// Ported from frontend/src/pages/thriftplus/scanner/screenLock.test.tsx (its first case: the logic). The screens of the
// other three cases are piece S3's (camera/Sideways.tsx).
import { describe, expect, it } from 'vitest'
import { isSidewaysAngle } from './index'

describe('a phone held sideways (owner 2026-10-15, APP D16 v2)', () => {
  it('is sideways at 90 and 270 degrees, on phones only', () => {
    expect(isSidewaysAngle(0, true)).toBe(false)
    expect(isSidewaysAngle(180, true)).toBe(false)
    expect(isSidewaysAngle(90, true)).toBe(true)
    expect(isSidewaysAngle(270, true)).toBe(true)
    expect(isSidewaysAngle(-90, true)).toBe(true) // older iPhones say -90
    expect(isSidewaysAngle(90, false)).toBe(false) // tablets and computers are left alone
  })
})
