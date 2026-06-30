import LicenseSection from './components/LicenseSection.jsx';
import VendorSection  from './components/VendorSection.jsx';

export { routes, navItems } from './routes.jsx';

export const providers = [];

export const adminCards = [
  {
    title: 'Licensing',
    description: 'Manage license keys, machines, and vendors.',
    links: [
      { label: 'License Keys', to: '/licensing/keys' },
      { label: 'Vendors',      to: '/admin/licensing/vendors' },
    ],
  },
];

export const userSections = [LicenseSection, VendorSection];
