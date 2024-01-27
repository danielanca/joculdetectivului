import {lazy} from 'react';

const AudioPlayer = lazy( ()=> import('../components/AudioPlayer/AudioPlayer'));
const VideoPlayer = lazy( ()=> import('../components/VideoPlayer/VideoPlayer'));
const MostWanted = lazy(() => import('../components/MostWanted/MostWanted'));
import { publicRoutesType } from './types';

const gameRoutes: publicRoutesType[] = [
  {
    path: 'game/most-wanted',
    layout: null,
    component: MostWanted,
  },
  {
    path: 'game/video', //game/video will work only on MOBILE VERSION (for a while)
    layout: null,
    component: VideoPlayer,
  },
  {
    path: 'game/audio', //game/video will work only on MOBILE VERSION (for a while)
    layout: null,
    component: AudioPlayer,
  },
];

export default gameRoutes;
