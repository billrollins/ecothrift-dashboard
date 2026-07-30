import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { fetchWebstoreConfig, type WebstoreConfig } from './api'

const DEFAULT_CONFIG: WebstoreConfig = {
  online_sales_enabled: false,
  inquiries_enabled: false,
  accounts_enabled: false,
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
    return () => {
      active = false
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
