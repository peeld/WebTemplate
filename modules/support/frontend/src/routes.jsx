import SupportPage from './pages/SupportPage'
import NewTicketPage from './pages/NewTicketPage'
import TicketDetailPage from './pages/TicketDetailPage'
import AdminTicketsPage from './pages/AdminTicketsPage'

export const routes = [
  { path: '/support',              element: <SupportPage /> },
  { path: '/support/new',          element: <NewTicketPage /> },
  { path: '/support/tickets/:id',  element: <TicketDetailPage /> },
  { path: '/support/admin',        element: <AdminTicketsPage /> },
]

export const navItems = [
  { label: 'Support', path: '/support', requiresAuth: true },
]
