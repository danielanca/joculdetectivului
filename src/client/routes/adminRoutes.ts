import Mainpage from "../pages/Mainpage"

import { publicRoutesType } from './types';


const adminRoutes :  publicRoutesType[] = [

    {
        path:"",
        layout: null,
        component: Mainpage,
    },



]

export default adminRoutes;