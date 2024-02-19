// Import images using ES6 import syntax
import logo from './assets/most-wanted/DEPARTAMENTUL_Batch.png';
import roFlag from './assets/most-wanted/romania_flag.jpg';
import enFlag from './assets/most-wanted/united-kingdom_flag.webp';
import suspect1 from './assets/suspects/Profile Image 1.png';
import suspect2 from './assets/suspects/Profile Image 2.png';
import suspect3 from './assets/suspects/Profile Image 3.png';
import suspect4 from './assets/suspects/Profile Image 4.png';
import suspect5 from './assets/suspects/Profile Image 5.png';
import ImgAvatar from './assets/facebook-chat/default.jpg';
import facebookLogo from './assets/facebook-chat/facebook-logo.png';
import imgChatNone from './assets/facebook-chat/imgChatNone.jpg';

// Structure the images object
const images = {
  mostwanted: {
    logo: logo,
    lang: {
      ro: roFlag,
      en: enFlag,
    },
    mock_suspects: {
      suspect1: suspect1,
      suspect2: suspect2,
      suspect3: suspect3,
      suspect4: suspect4,
      suspect5: suspect5,
    },
  },
  facebook_chat: {
    ImgAvatar: ImgAvatar,
    facebookLogo: facebookLogo,
    imgChatNone: imgChatNone,
  },
};

export default images;
