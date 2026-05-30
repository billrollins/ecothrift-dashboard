import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export interface CartLine {
  slug: string
  title: string
  price: number
  image: string | null
  qty: number
  stock: number
}

export interface AddToCartItem {
  slug: string
  title: string
  price: number
  image: string | null
  stock: number
}

interface CartContextValue {
  lines: CartLine[]
  count: number
  subtotal: number
  open: boolean
  setOpen: (open: boolean) => void
  add: (item: AddToCartItem, qty?: number) => void
  remove: (slug: string) => void
  setQty: (slug: string, qty: number) => void
  clear: () => void
}

const STORAGE_KEY = 'ecothrift.cart.v1'
const CartContext = createContext<CartContextValue | null>(null)

function loadLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((l) => l && typeof l.slug === 'string')
  } catch {
    return []
  }
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadLines)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [lines])

  const add = useCallback((item: AddToCartItem, qty = 1) => {
    const stock = Math.max(1, item.stock || 1)
    setLines((prev) => {
      const existing = prev.find((l) => l.slug === item.slug)
      if (existing) {
        return prev.map((l) =>
          l.slug === item.slug ? { ...l, qty: clamp(l.qty + qty, 1, stock), stock } : l,
        )
      }
      return [
        ...prev,
        {
          slug: item.slug,
          title: item.title,
          price: item.price,
          image: item.image,
          qty: clamp(qty, 1, stock),
          stock,
        },
      ]
    })
    setOpen(true)
  }, [])

  const remove = useCallback((slug: string) => {
    setLines((prev) => prev.filter((l) => l.slug !== slug))
  }, [])

  const setQty = useCallback((slug: string, qty: number) => {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.slug !== slug) return [l]
        if (qty <= 0) return []
        return [{ ...l, qty: clamp(qty, 1, l.stock) }]
      }),
    )
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const count = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines])
  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.price * l.qty, 0), [lines])

  const value = useMemo<CartContextValue>(
    () => ({ lines, count, subtotal, open, setOpen, add, remove, setQty, clear }),
    [lines, count, subtotal, open, add, remove, setQty, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
