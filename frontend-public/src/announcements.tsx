import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { fetchAnnouncements, type PublicAnnouncement } from './api'

const AnnouncementsContext = createContext<PublicAnnouncement[]>([])

function load() {
  return fetchAnnouncements().catch(() => [] as PublicAnnouncement[])
}

export function AnnouncementsProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<PublicAnnouncement[]>([])

  useEffect(() => {
    let active = true
    const refresh = () => {
      load().then((data) => {
        if (active) setRows(data)
      })
    }
    refresh()
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return (
    <AnnouncementsContext.Provider value={rows}>{children}</AnnouncementsContext.Provider>
  )
}

export function useAnnouncements(placement?: string): PublicAnnouncement[] {
  const rows = useContext(AnnouncementsContext)
  const filtered = placement
    ? rows.filter((row) => (row.placements || []).includes(placement))
    : rows
  return [...filtered].sort((a, b) => (b.priority || 0) - (a.priority || 0))
}
