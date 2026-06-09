import UserAuthPage from './components/UserAuthPage.jsx';

export const routes = [
  { path: '/userauth', element: <UserAuthPage /> },
];

export const navItems = [
  { label: 'Account', path: '/userauth' },
];
