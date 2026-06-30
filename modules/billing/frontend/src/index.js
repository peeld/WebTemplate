import { CartProvider } from './context/CartContext.jsx';
import BillingUserSection from './pages/BillingUserSection.jsx';
import FeaturedProducts from './pages/FeaturedProducts.jsx';
import CartIcon from './components/CartIcon.jsx';

export { routes, navItems } from './routes.jsx';

export const providers = [CartProvider];

export const navbarEnd = [CartIcon];

export const adminCards = [
  {
    title: 'Billing',
    description: 'Manage subscription plans, products, and pricing.',
    links: [
      { label: 'Admin', to: '/billing/admin' },
      { label: 'Pricing', to: '/billing/pricing' },
      { label: 'Subscription', to: '/billing/subscription' },
    ],
  },
];

export const userSections = [BillingUserSection];

export const homeSections = [FeaturedProducts];
