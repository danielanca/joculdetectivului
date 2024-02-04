import React, { useRef, useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay,
  faAngleLeft,
  faAngleRight,
  faPause,
} from '@fortawesome/free-solid-svg-icons';
import data, { SongTypes } from './data';
import { faMusic } from '@fortawesome/free-solid-svg-icons';
import styles from './AudioPlayer.module.scss';
import Library from './Library/Library';


const AudioPlayer = () => {
  const [songs, setSongs] = useState<SongTypes[]>(data());
  const [currentSong, setCurrentSong] = useState(songs[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  // const [isDragging, setIsDragging] = useState(false);
  const [songInfo, setSongInfo] = useState({
    currentTime: 0,
    duration: 0,
    animationPercentage: 0,
  });

  const audioRef: any = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef: any = useRef<Uint8Array | null>(null);

  const visualizerRef = useRef<HTMLDivElement>(null);

  const isPlayingRef = useRef(isPlaying);
  const timeUpdateHandler = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    // if(isDragging) return;
    
    // const current = audioRef.current.currentTime;
    // const duration = audioRef.current.duration;
    // console.log('Finallt:', audioRef.current.currentTime);
    // const animationPercentage = Math.round((current / duration) * 100);
    // console.log('Current time:', current, 'Duration:', duration);
    // setSongInfo({ currentTime: current, duration, animationPercentage });

    const target = e.target as HTMLAudioElement;
    // // console.log('eTarget duration:', target.duration);
    const current = target.currentTime;
     const duration = target.duration;
    // // console.log('Current time:', audioRef.current.currentTime);
     const animationPercentage = Math.round((current / duration) * 100);
    setSongInfo({ currentTime: current, duration, animationPercentage });

    // setSongInfo({ currentTime: 14, duration:18, animationPercentage:33 });
  };

  const songEndHandler = async () => {
    let currentIndex = songs.findIndex(song => song.id === currentSong.id);
    await setCurrentSong(songs[(currentIndex + 1) % songs.length]);
    if (isPlaying) audioRef.current?.play();
  };

  const activeLibraryHandler = (nextPrev: SongTypes) => {
    const newSongs = songs.map(song => ({
      ...song,
      active: song.id === nextPrev.id,
    }));
    setSongs(newSongs);
  };

  const dragTouchEndHandler = () =>{
      // setIsDragging(false);
  }

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.src = currentSong.audio;
        if (isPlaying) {
            audioRef.current.play().catch( (error:any) => console.error('Error playing the audio:', error));
        }
    }
}, [currentSong.audio, isPlaying]);
  const dragHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    // setIsDragging(true);
    // const currentTime = Number(e.target.value);
    // console.log('dragHandler called: audioRef current vs. currentTime' , audioRef.current.currentTime, currentTime);
    // audioRef.current.currentTime = currentTime;
    // console.log('Setting currentTime to:', currentTime);
    // setSongInfo({ ...songInfo, currentTime });


    audioRef.current.currentTime= 30;

    // const currentTime = parseFloat(e.target.value);
    // console.log('dragHandler called: Current vs. New Time', audioRef.current?.currentTime, currentTime);
    // if (audioRef.current) {
    //     audioRef.current.currentTime = currentTime;
    //     console.log('Setting currentTime to:', currentTime);
    //     // Only update the state necessary for UI, don't trigger unnecessary re-renders
    //     setSongInfo(prev => ({
    //         ...prev,
    //         currentTime
    //     }));
    // }
  };

  const skipTrackHandler = async (direction: string) => {
    let currentIndex = songs.findIndex(song => song.id === currentSong.id);
    if (direction === 'skip-forward') {
      await setCurrentSong(songs[(currentIndex + 1) % songs.length]);
      activeLibraryHandler(songs[(currentIndex + 1) % songs.length]);
    } else if (direction === 'skip-back') {
      if ((currentIndex - 1) % songs.length === -1) {
        await setCurrentSong(songs[songs.length - 1]);
        activeLibraryHandler(songs[songs.length - 1]);
        return;
      }
      await setCurrentSong(songs[(currentIndex - 1) % songs.length]);
      activeLibraryHandler(songs[(currentIndex - 1) % songs.length]);
    }
    if (isPlaying) audioRef.current?.play();
  };

  const getTime = (time: number) =>
    Math.floor(time / 60) + ':' + ('0' + Math.floor(time % 60)).slice(-2);

  const trackAnim = {
    transform: `translateX(${songInfo.animationPercentage}%)`,
  };

  const loop = useCallback(() => {
    if (!isPlayingRef.current) {
      console.log('We returning');
      return;
    }
    window.requestAnimationFrame(loop);
    if (dataArrayRef.current && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      updateVisualizer(); // Adjusted function name for clarity
    }
  }, []);


  useEffect(() => {
    console.log('useEffect:', audioRef.current, currentSong.audio);
    if (audioRef.current && currentSong.audio) {
      audioRef.current.src = currentSong.audio;
    }
  }, [currentSong.audio, audioRef]);

  // useEffect(() => {
  //   if (audioRef.current.src !== currentSong.audio) {
  //     audioRef.current.src = currentSong.audio;
  //   }
  // }, [currentSong.audio]);
  

  useEffect(() => {
    console.log('Called isPlaying Loop', isPlaying);
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
        loop();
    }
}, [isPlaying]); 

  
  const preparation = () => {
    if (contextRef.current) return; 

    const audioContext = new (window.AudioContext || window.AudioContext)();
    const analyser = audioContext.createAnalyser();
    const src = audioContext.createMediaElementSource(audioRef.current!);
    src.connect(analyser);
    analyser.connect(audioContext.destination);
    contextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    
  };

  const updateVisualizer = () => {
    const visualizer = visualizerRef.current;
    if (visualizer && dataArrayRef.current) {
      for (let i = 0; i < visualizer.children.length; i++) {
        const child = visualizer.children[i] as HTMLElement;
        if (child) {
          child.style.height = `${dataArrayRef.current[i * 5] * 0.39215686274}%`;
        }
      }
    }
  };

  const playSongHandler = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
      preparation();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className={styles.mainParentContainer}>
      <div className={styles.parentContainer}>
        <Nav
          libraryStatus={libraryStatus}
          setLibraryStatus={setLibraryStatus}
        />

        <div className={styles.songContainer}>
          <div className={styles.featureCompo}>
            <img
              className={styles.songImg}
              src={currentSong.cover}
              alt={currentSong.name}
            />
          </div>
         
           <div ref={visualizerRef} className={styles.visualizer} id='visualizer'>
          {Array.from({ length: 50 }).map((_, index) => (
            <div key={index} className={styles.track}></div>
          ))}
        </div>
        
        </div>

       
        <div className={styles.audioInfo}>
          <h2 className={styles.songName}>{currentSong.name}</h2>
          <h3 className={styles.songArtistName}>{currentSong.artist}</h3>
        </div>
        <div className={styles.player}>
          <div className={styles.timeControl}>
            <p className={styles.songTime}>{getTime(songInfo.currentTime)}</p>
            <div
              style={{
                background: `linear-gradient(to right, ${currentSong.color[0]}, ${currentSong.color[1]})`,
                minWidth: '200px',
              }}
              className={styles.trackPlayer}
            >
              <input
                min={0}
                max={songInfo.duration || 0}
                value={songInfo.currentTime}
                onChange={dragHandler}
                onTouchEnd={dragTouchEndHandler}
                type='range'
              />
              <div style={trackAnim} className={styles.animateTrack}></div>
            </div>
            <p className={styles.songTime}>
              {songInfo.duration ? getTime(songInfo.duration) : '00:00'}
            </p>
          </div>
          <PlayerControls isPlaying={isPlaying} skipTrackHandler={skipTrackHandler} playSongHandler={playSongHandler} />
        </div>

        <Library
          libraryStatus={libraryStatus}
          setLibraryStatus={setLibraryStatus}
          setSongs={setSongs}
          isPlaying={isPlaying}
          audioRef={audioRef}
          songs={songs}
          setCurrentSong={setCurrentSong}
        />

        <audio
          id='audio'
          onLoadedMetadata={timeUpdateHandler}
          onTimeUpdate={timeUpdateHandler}
          src={currentSong.audio}
          crossOrigin='anonymous'
          ref={audioRef}
          onEnded={songEndHandler}
        ></audio>
      </div>
    </div>
  );
};


const Nav = ({ setLibraryStatus, libraryStatus }: any) => {
  return (
    <nav className={styles.navContainer}>
      <h1 className={styles.wavesHeading}>Waves</h1>
      <button
        onClick={() => {
          setLibraryStatus(!libraryStatus);
        }}
        className={styles.libraryBtn}
      >
        Librarie
        <FontAwesomeIcon icon={faMusic} />
      </button>
    </nav>
  );
};


const PlayerControls = ({isPlaying, skipTrackHandler,playSongHandler} : { isPlaying: boolean, skipTrackHandler: (direction:string)=> void, playSongHandler: ()=> void}) =>{
  return (<div className={styles.playControl}>
            <FontAwesomeIcon
              onClick={() => skipTrackHandler('skip-back')}
              size='2x'
              className={styles.skipBack}
              icon={faAngleLeft}
            />
            {!isPlaying ? (
              <FontAwesomeIcon
                onClick={playSongHandler}
                size='2x'
                className={styles.play}
                icon={faPlay}
              />
            ) : (
              <FontAwesomeIcon
                onClick={playSongHandler}
                size='2x'
                className={styles.pause}
                icon={faPause}
              />
            )}

            <FontAwesomeIcon
              onClick={() => skipTrackHandler('skip-forward')}
              size='2x'
              className={styles.skipForward}
              icon={faAngleRight}
            />
      </div>)

}

export default AudioPlayer;
