import publicRoutes from './publicRoutes';
import shopRoutes from './shopRoutes';
import gameRoutes from './gameRoutes';
import chatRoutes from './chatRoutes';

const routes = [
  ...publicRoutes,
  // ...adminRoutes,
  // ...shopRoutes,
  ...gameRoutes,
  ...chatRoutes,
];

export default routes;
