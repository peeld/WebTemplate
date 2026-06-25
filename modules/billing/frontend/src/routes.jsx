import PricingPage from './pages/PricingPage.jsx';
import StorePage from './pages/StorePage.jsx';
import SubscriptionPage from './pages/SubscriptionPage.jsx';
import ManageBillingPage from './pages/ManageBillingPage.jsx';
import AdminBillingPage from './pages/AdminBillingPage.jsx';
import CartPage from './pages/CartPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import CheckoutProcessingPage from './pages/CheckoutProcessingPage.jsx';
import CheckoutSuccessPage from './pages/CheckoutSuccessPage.jsx';

export const routes = [
  { path: '/billing/pricing',             element: <PricingPage /> },
  { path: '/billing/store',               element: <StorePage /> },
  { path: '/billing/subscription',        element: <SubscriptionPage /> },
  { path: '/billing/manage',              element: <ManageBillingPage /> },
  { path: '/billing/admin',               element: <AdminBillingPage /> },
  { path: '/billing/cart',                element: <CartPage /> },
  { path: '/billing/checkout',            element: <CheckoutPage /> },
  { path: '/billing/checkout/processing', element: <CheckoutProcessingPage /> },
  { path: '/billing/checkout/success',    element: <CheckoutSuccessPage /> },
];

export const navItems = [
  { label: 'Store',   path: '/billing/store' },
  { label: 'Pricing', path: '/billing/pricing' },
];
