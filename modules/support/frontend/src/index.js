export { routes, navItems } from './routes.jsx'
import SupportUserSection from './pages/SupportUserSection'

export const userSections = [SupportUserSection]

export const adminCards = [
  {
    title: 'Support',
    description: 'View and manage user support tickets.',
    links: [
      { label: 'All Tickets', to: '/support/admin' },
    ],
  },
]
