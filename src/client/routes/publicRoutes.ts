import { lazy } from "react";
const Mainpage = lazy(() => import('../pages/Mainpage'));

import { publicRoutesType } from './types';


const publicRoutes :  publicRoutesType[] = [

    {
        path:"",
        layout: null,
        component: Mainpage,
    },



]

export default publicRoutes;