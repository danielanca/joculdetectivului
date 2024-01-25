import publicRoutes from "./publicRoutes";
import adminRoutes from "./adminRoutes";
import shopRoutes from "./shopRoutes";
import gameRoutes from "./gameRoutes";

const routes = [
    ...publicRoutes,
    // ...adminRoutes,
    // ...shopRoutes,
    ...gameRoutes
]

export default routes;