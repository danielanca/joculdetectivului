

import MostWanted from '../components/MostWanted/MostWanted';
import VideoPlayer from '../components/VideoPlayer/VideoPlayer';
import { publicRoutesType } from './types';


const gameRoutes :  publicRoutesType[] = [

    {
        path:"game/most-wanted",
        layout: null,
        component: MostWanted,
    },
    {
        path:"game/video",  //game/video will work only on MOBILE VERSION (for a while)
        layout: null,
        component: VideoPlayer,
    },

]

export default gameRoutes;