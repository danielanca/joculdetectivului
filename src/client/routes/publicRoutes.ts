import Mainpage from "../pages/Mainpage"

import { publicRoutesType } from './types';


const publicRoutes :  publicRoutesType[] = [

    {
        path:"",
        layout: null,
        component: Mainpage,
    },



]

export default publicRoutes;