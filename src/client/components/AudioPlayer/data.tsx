import { v4 as uuidv4 } from 'uuid';

export interface SongTypes {
  name: string;
  cover: string;
  artist: string;
  audio: string;
  color: string[];
  id: string;
  active: boolean;
}

function chillHop() {
  return [
    {
      name: 'Beaver Creek',
      cover:
        'https://chillhop.com/wp-content/uploads/2020/09/0255e8b8c74c90d4a27c594b3452b2daafae608d-1024x1024.jpg',
      artist: 'Aso, Middle School, Aviino',
      audio: 'https://cdn.pixabay.com/download/audio/2023/03/01/audio_74accea696.mp3?filename=trap-beat-dark-autumn-night-141114.mp3',
      color: ['#205950', '#2ab3bf'],
      id: uuidv4(),
      active: true,
    },
    // {
    //   name: 'Daylight',
    //   cover:
    //     'https://chillhop.com/wp-content/uploads/2020/07/ef95e219a44869318b7806e9f0f794a1f9c451e4-1024x1024.jpg',
    //   artist: 'Aiguille',
    //   audio: 'https://cdn.pixabay.com/download/audio/2023/03/01/audio_74accea696.mp3?filename=trap-beat-dark-autumn-night-141114.mp3',
    //   color: ['#EF8EA9', '#ab417f'],
    //   id: uuidv4(),
    //   active: false,
    // },
    // {
    //   name: 'Keep Going',
    //   cover:
    //     'https://chillhop.com/wp-content/uploads/2020/07/ff35dede32321a8aa0953809812941bcf8a6bd35-1024x1024.jpg',
    //   artist: 'Swørn',
    //   audio: 'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/media%2Faudio%2Ftrap-beat-dark-autumn-night-141114.mp3?alt=media&token=25756e3c-751c-48d8-9c56-83dc59192368',
    //   color: ['#CD607D', '#c94043'],
    //   id: uuidv4(),
    //   active: false,
    // },
    // {
    //   name: 'Nightfall',
    //   cover:
    //     'https://chillhop.com/wp-content/uploads/2020/07/ef95e219a44869318b7806e9f0f794a1f9c451e4-1024x1024.jpg',
    //   artist: 'Aiguille',
    //   audio: 'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/media%2Faudio%2Ftrap-beat-dark-autumn-night-141114.mp3?alt=media&token=25756e3c-751c-48d8-9c56-83dc59192368',
    //   color: ['#EF8EA9', '#ab417f'],
    //   id: uuidv4(),
    //   active: false,
    // },
    // {
    //   name: 'Reflection',
    //   cover:
    //     'https://chillhop.com/wp-content/uploads/2020/07/ff35dede32321a8aa0953809812941bcf8a6bd35-1024x1024.jpg',
    //   artist: 'Swørn',
    //   audio: 'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/media%2Faudio%2Ftrap-beat-dark-autumn-night-141114.mp3?alt=media&token=25756e3c-751c-48d8-9c56-83dc59192368',
    //   color: ['#CD607D', '#c94043'],
    //   id: uuidv4(),
    //   active: false,
    // },
    // {
    //   name: 'Under the City Stars',
    //   cover:
    //     'https://chillhop.com/wp-content/uploads/2020/09/0255e8b8c74c90d4a27c594b3452b2daafae608d-1024x1024.jpg',
    //   artist: 'Aso, Middle School, Aviino',
    //   audio: 'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/media%2Faudio%2Ftrap-beat-dark-autumn-night-141114.mp3?alt=media&token=25756e3c-751c-48d8-9c56-83dc59192368',
    //   color: ['#205950', '#2ab3bf'],
    //   id: uuidv4(),
    //   active: false,
    // },
    //ADD MORE HERE
  ];
}

export default chillHop;
