import FilesPage from './pages/FilesPage.jsx';
import UploadPage from './pages/UploadPage.jsx';

export const routes = [
  { path: '/files',        element: <FilesPage /> },
  { path: '/files/upload', element: <UploadPage /> },
];

export const navItems = [
  { label: 'Files', path: '/files', requiresAuth: true },
];
