import AcceptInvite from './pages/AcceptInvite'
import CreateOrg from './pages/CreateOrg'
import OrgSettings from './pages/OrgSettings'

export const routes = [
  { path: '/orgs/new', element: <CreateOrg /> },
  { path: '/orgs/invite/:token', element: <AcceptInvite /> },
  { path: '/orgs/:orgId/settings', element: <OrgSettings /> },
]

export const navItems = []
