import { OrgProvider } from './context/OrgContext'

export { routes, navItems } from './routes.jsx'

export { OrgProvider, useOrg } from './context/OrgContext'
export { orgsApi } from './api'

export const providers = [OrgProvider]

import OrgSection from './pages/OrgSection'
export const userSections = [{ component: OrgSection }]
