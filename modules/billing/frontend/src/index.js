import { CartProvider } from './context/CartContext.jsx';

export { routes, navItems } from './routes.jsx';

export const providers = [CartProvider];

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
