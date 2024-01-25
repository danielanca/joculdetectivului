import Mainpage from "../pages/Mainpage"

import { publicRoutesType } from './types';


const shopRoutes :  publicRoutesType[] = [

    {
        path:"",
        layout: null,
        component: Mainpage,
    },



]

export default shopRoutes;