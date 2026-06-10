import PricingPage from './pages/PricingPage.jsx';
import SubscriptionPage from './pages/SubscriptionPage.jsx';

export const routes = [
  { path: '/billing/pricing',      element: <PricingPage /> },
  { path: '/billing/subscription', element: <SubscriptionPage /> },
];

export const navItems = [
  { label: 'Pricing', path: '/billing/pricing' },
];
