import AudioPlayer from '../components/AudioPlayer/AudioPlayer';
import MostWanted from '../components/MostWanted/MostWanted';
import VideoPlayer from '../components/VideoPlayer/VideoPlayer';
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
