/**
 * Best finds (owner 2026-11-20): only pieces with their own photo, never a category tile; a piece whose photo fails to
 * load is left out, and with none left the section is gone (never an empty band). No fine print.
 */
import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { _setFeed, type HomeFeed } from '../../lib/boot'
import Finds from './Finds'

const find = (pid: number, photo: string | null) => ({
  pid, name: `Piece ${pid}`, cat: pid % 2 ? 'furniture' : 'kitchen', price: 20, retail: 80, tb: 4, units: 1, tag: '0156211',
  photo, photo_kind: photo ? 'stock' : null,
})

function show(finds: ReturnType<typeof find>[]) {
  _setFeed({ day: 'normal', finds } as unknown as HomeFeed)
  return render(
    <MemoryRouter>
      <Finds />
    </MemoryRouter>,
  )
}

afterEach(() => _setFeed(null))

describe('Best finds', () => {
  it('shows only pieces with a photo, and no tile or fine print', () => {
    const { container } = show([find(1, '/api/storefront/photo/1/'), find(2, null), find(3, '/api/storefront/photo/3/')])
    expect(container.querySelectorAll('.pc')).toHaveLength(2)
    expect(container.querySelector('.ph-txt')).toBeNull()
    expect(container.querySelector('.fine')).toBeNull()
  })

  it('leaves out a piece whose photo fails, and the whole section when none is left', () => {
    const { container } = show([find(1, '/api/storefront/photo/1/'), find(3, '/api/storefront/photo/3/')])
    fireEvent.error(container.querySelectorAll('img')[0])
    expect(container.querySelectorAll('.pc')).toHaveLength(1)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('#finds')).toBeNull()
  })

  it('no piece with a photo: no section', () => {
    const { container } = show([find(2, null)])
    expect(container.querySelector('#finds')).toBeNull()
  })
})
