import Downloads from './pages/Downloads.jsx';
import ReleaseDetail from './pages/ReleaseDetail.jsx';
import ManageReleases from './pages/ManageReleases.jsx';
import EditRelease from './pages/EditRelease.jsx';

export const routes = [
  { path: '/downloads/',                element: <Downloads /> },
  { path: '/downloads/releases/:id/',   element: <ReleaseDetail /> },
  { path: '/downloads/manage/',         element: <ManageReleases /> },
  { path: '/downloads/manage/new/',     element: <EditRelease /> },
  { path: '/downloads/manage/:id/',     element: <EditRelease /> },
];

export const navItems = [
  { label: 'Downloads', path: '/downloads/' },
];
