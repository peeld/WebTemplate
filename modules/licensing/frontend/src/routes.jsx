import LicenseKeysPage          from './pages/LicenseKeysPage.jsx';
import VendorPortalPage          from './pages/VendorPortalPage.jsx';
import AdminVendorListPage       from './pages/AdminVendorListPage.jsx';
import AdminVendorDetailPage     from './pages/AdminVendorDetailPage.jsx';
import AdminVendorInvoicePage    from './pages/AdminVendorInvoicePage.jsx';
import TrialClaim                from './pages/TrialClaim.jsx';

export const routes = [
  { path: '/licensing/keys',                                          element: <LicenseKeysPage /> },
  { path: '/vendor/portal',                                           element: <VendorPortalPage /> },
  { path: '/admin/licensing/vendors',                                 element: <AdminVendorListPage /> },
  { path: '/admin/licensing/vendors/:id',                             element: <AdminVendorDetailPage /> },
  { path: '/admin/licensing/vendors/:id/invoices/:inv',               element: <AdminVendorInvoicePage /> },
  { path: '/trial-claim',                                             element: <TrialClaim /> },
];

export const navItems = [];
