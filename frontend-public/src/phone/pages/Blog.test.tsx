import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Blog from './Blog'
import BlogPost from './BlogPost'

// No dev fixture for the blog: the two calls are mocked.
const api = vi.hoisted(() => ({ fetchBlogPosts: vi.fn(), fetchBlogPost: vi.fn() }))
vi.mock('../../api', () => api)

const SUMMARY = {
  slug: 'why-we-sort',
  title: 'Why we sort every truck',
  series: 'Founder Notes',
  series_slug: 'founder-notes',
  excerpt: 'What happens to a pallet between the dock and the shelf.',
  date: 'November 2, 2026',
  date_iso: '2026-11-02',
  hero: null,
  tags: [],
  author_name: 'Bill',
  reading_minutes: 4,
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Blog list', () => {
  it('shows quiet blocks first, then one card per post linking to its page, no picture without a hero', async () => {
    api.fetchBlogPosts.mockResolvedValue([SUMMARY, { ...SUMMARY, slug: 'two', title: 'Second', hero: { id: 1, url: '/media/x.jpg', alt: 'x' } }])
    const { container } = renderAt('/blog')
    expect(container.querySelectorAll('.bl-sk')).toHaveLength(3)
    expect(await screen.findByText('Why we sort every truck')).toBeInTheDocument()
    expect(container.querySelector('a[href="/blog/why-we-sort"]')).not.toBeNull()
    expect(container.querySelector('a[href="/blog/why-we-sort"] img')).toBeNull()
    expect(container.querySelector('a[href="/blog/two"] img')).toHaveAttribute('src', '/media/x.jpg')
    expect(container.querySelector('.bl-sk')).toBeNull()
  })

  it('reads a failed fetch as no posts', async () => {
    api.fetchBlogPosts.mockRejectedValue(new Error('down'))
    renderAt('/blog')
    expect(await screen.findByText('No posts yet - check back soon.')).toBeInTheDocument()
  })
})

describe('Blog post', () => {
  it('fetches by slug and renders the server HTML body', async () => {
    api.fetchBlogPost.mockResolvedValue({
      ...SUMMARY,
      body_html: '<p>First line.</p><h2>A heading</h2>',
      author_role: 'Owner',
      meta_title: '',
      meta_description: '',
    })
    const { container } = renderAt('/blog/why-we-sort')
    expect(await screen.findByRole('heading', { level: 1, name: 'Why we sort every truck' })).toBeInTheDocument()
    expect(api.fetchBlogPost).toHaveBeenCalledWith('why-we-sort')
    expect(container.querySelector('.bp-body h2')?.textContent).toBe('A heading')
    expect(container.querySelector('a[href="/blog"]')).not.toBeNull()
  })

  it('takes away a hero image that does not load, with no stand-in (Dash Update #185)', async () => {
    api.fetchBlogPost.mockResolvedValue({
      ...SUMMARY,
      hero: { id: 1, url: '/media/gone.jpg', alt: 'A truck' },
      body_html: '<p>First line.</p>',
      author_role: 'Owner',
      meta_title: '',
      meta_description: '',
    })
    const { container } = renderAt('/blog/why-we-sort')
    const hero = await screen.findByAltText('A truck')
    expect(hero).toHaveClass('bp-hero')
    fireEvent.error(hero)
    expect(container.querySelector('.bp-hero')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.bp-body')?.textContent).toBe('First line.')
  })

  it('shows not found for a missing post', async () => {
    api.fetchBlogPost.mockRejectedValue(new Error('404'))
    renderAt('/blog/gone')
    expect(await screen.findByText(/couldn.t find that page/)).toBeInTheDocument()
  })
})
