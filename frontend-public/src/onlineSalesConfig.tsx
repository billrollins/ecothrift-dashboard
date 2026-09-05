import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { fetchWebstoreConfig, type WebstoreConfig } from './api'
import { STORE } from './data/content'
import { DEFAULT_HOURS_LABEL } from './lib/hoursLabel'

const DEFAULT_CONFIG: WebstoreConfig = {
  online_sales_enabled: false,
  inquiries_enabled: false,
  accounts_enabled: false,
  hours: {
    timezone: STORE.retail.hoursConfig.timezone,
    open: '09:00',
    close: '18:00',
    closed_weekdays: [0, 6],
    label: DEFAULT_HOURS_LABEL,
  },
}

const OnlineSalesConfigContext = createContext<{
  config: WebstoreConfig
  loading: boolean
}>({ config: DEFAULT_CONFIG, loading: true })

export function OnlineSalesConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<WebstoreConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = () =>
      fetchWebstoreConfig()
        .then((data) => {
          if (active) setConfig(data)
        })
        .catch(() => {
          if (active) setConfig(DEFAULT_CONFIG)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    load()
    const onVis = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return (
    <OnlineSalesConfigContext.Provider value={{ config, loading }}>
      {children}
    </OnlineSalesConfigContext.Provider>
  )
}

export function useOnlineSalesConfig() {
  return useContext(OnlineSalesConfigContext)
}
