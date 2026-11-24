/**
 * Black Friday on the desktop site (owner 2026-11-24, Dash Update #220): the home's first screen is the sale and ONE
 * button, Get directions, on a desktop-built panel. His rule the same day: "NEVER NEVER NEVER have the desktop app have
 * Mobile elements or be Mobile view", so nothing here is a phone part (no Scan button, no tab bar).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import BlackFridayPanel from './BlackFridayPanel'
import { stampedBlackFriday } from '../lib/blackFriday'

afterEach(() => document.documentElement.removeAttribute('data-day'))

describe('the desktop Black Friday panel', () => {
  it('says the sale in the owner’s words with one button, Get directions', () => {
    render(<BlackFridayPanel />)
    const panel = screen.getByTestId('bf-desktop')
    expect(panel).toHaveTextContent('Fri & Sat · Nov 27 to 28')
    expect(panel).toHaveTextContent('Black Friday')
    expect(panel).toHaveTextContent('All prices reduced.')
    expect(panel).toHaveTextContent('No need to sign up for Thrift+. Just good deals.')
    expect(panel).toHaveTextContent('Fri 6 AM to 6 PM · Sat 9 AM to 6 PM')
    expect(screen.getByTestId('bf-directions').getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//)
    expect(panel).not.toHaveTextContent(/Scan|ThriftBucks|Join|75%|78%/)
    expect(panel.querySelector('.bb, .btn, [class*="bfh"]')).toBeNull()
  })

  it('knows the day from the page the server sent, before anything loads', () => {
    expect(stampedBlackFriday()).toBe(false)
    document.documentElement.setAttribute('data-day', 'bf')
    expect(stampedBlackFriday()).toBe(true)
  })
})
