import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ThriftPlusPage from './ThriftPlusPage'

// Rulebook V12 (owner 2026-11-20, Dash Update #197): every surface that explains ThriftBucks uses one example, the same
// numbers and words as the phone site (phone/shell/ThriftBucksExample.tsx). On /thriftplus it takes the place of the old
// lamp poster.
vi.mock('../useSeo', () => ({ useSeo: () => undefined }))

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThriftPlusPage />
    </MemoryRouter>,
  )

describe('ThriftPlusPage', () => {
  it('shows the standard ThriftBucks example in place of the lamp poster', () => {
    renderAt('/thriftplus?lang=en')
    const example = screen.getByTestId('thriftbucks-example')
    expect(example).toHaveTextContent('ExampleA normal item')
    expect(example).toHaveTextContent('Retail$200.00Our tag$100.00')
    expect(example).toHaveTextContent('After 7 days on our floor, most items start to carry ThriftBucks. They grow every day.')
    expect(example).toHaveTextContent('This one carries today20.00 ThriftBucks')
    expect(example).toHaveTextContent('Keep themPay $100.0020.00 ThriftBucks come off your next visit')
    expect(example).toHaveTextContent('Use them nowPay $90.00today')
    expect(example).toHaveTextContent('Non-member: pays $100.00. All sales final.')
    // The old example is gone from the page; the other two posters stay.
    expect(document.body).not.toHaveTextContent('49.36')
    expect(document.body).not.toHaveTextContent('13.69')
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('shows the same numbers in Spanish', () => {
    renderAt('/thriftplus?lang=es')
    const example = screen.getByTestId('thriftbucks-example')
    expect(example).toHaveTextContent('EjemploUn artículo normal')
    expect(example).toHaveTextContent('GuárdelosPague $100.0020.00 ThriftBucks se restan en su próxima visita')
    expect(example).toHaveTextContent('Úselos ahoraPague $90.00hoy')
    expect(example).toHaveTextContent('Quien no es miembro: paga $100.00. Ventas finales.')
  })
})
