import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { orgsApi } from '../api'

const OrgContext = createContext(null)

export function OrgProvider({ children }) {
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrgState] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadOrgs = useCallback(async () => {
    if (!localStorage.getItem('access')) {
      setOrgs([])
      setActiveOrgState(null)
      setIsLoading(false)
      return
    }
    try {
      const res = await orgsApi.list()
      if (!res.ok) {
        setOrgs([])
        setActiveOrgState(null)
        return
      }
      const data = await res.json()
      setOrgs(data)
      const savedId = localStorage.getItem('active_org_id')
      const saved = savedId ? data.find(o => String(o.id) === savedId) : null
      setActiveOrgState(saved || data[0] || null)
    } catch {
      setOrgs([])
      setActiveOrgState(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadOrgs() }, [loadOrgs])

  // Detect login/logout from other tabs or from within this tab via storage events
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'access') return
      if (!e.newValue) {
        setOrgs([])
        setActiveOrgState(null)
        localStorage.removeItem('active_org_id')
      } else {
        loadOrgs()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [loadOrgs])

  const switchOrg = useCallback((org) => {
    setActiveOrgState(org)
    if (org) {
      localStorage.setItem('active_org_id', String(org.id))
    } else {
      localStorage.removeItem('active_org_id')
    }
  }, [])

  const refreshOrgs = useCallback(() => loadOrgs(), [loadOrgs])

  return (
    <OrgContext.Provider value={{ orgs, activeOrg, switchOrg, refreshOrgs, isLoading }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
