import React, { useRef, useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay,
  faAngleLeft,
  faAngleRight,
  faPause,
} from '@fortawesome/free-solid-svg-icons';
import './app.scss';
import data, { SongTypes } from './data';
import Nav from '../Nav/Nav';
import './AudioPlayer.scss';
import Library from '../Library/Library';
const AudioPlayer = () => {
  const [songs, setSongs] = useState<SongTypes[]>(data());
  const [currentSong, setCurrentSong] = useState(songs[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const [songInfo, setSongInfo] = useState({
    currentTime: 0,
    duration: 0,
    animationPercentage: 0,
  });
  const audioRef: any = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef: any = useRef<Uint8Array | null>(null);

  const visualizerRef = useRef<HTMLDivElement>(null);
  let context: AudioContext;
  // let analyser: AnalyserNode;
  let dataArray: Uint8Array;

  const timeUpdateHandler = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const target = e.target as HTMLAudioElement;
    const current = target.currentTime;
    const duration = target.duration;
    const animationPercentage = Math.round((current / duration) * 100);
    setSongInfo({ currentTime: current, duration, animationPercentage });
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

  const dragHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const currentTime = Number(e.target.value);
    audioRef.current.currentTime = currentTime;
    setSongInfo({ ...songInfo, currentTime });
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

  useEffect(() => {
    if (audioRef.current && currentSong.audio) {
      audioRef.current.src = currentSong.audio;
    }
  }, [currentSong, audioRef]);

  const loop = useCallback(() => {
    if (!isPlaying) return;

    window.requestAnimationFrame(loop);

    if (dataArrayRef.current && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      changeTracks();
    }
  }, [isPlaying]);

  const preparation = () => {
    const audioContext = new (window.AudioContext || window.AudioContext)();
    const analyser = audioContext.createAnalyser();
    const src = audioContext.createMediaElementSource(audioRef.current!);
    src.connect(analyser);
    analyser.connect(audioContext.destination);
    contextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
  };

  const changeTracks = () => {
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
      // preparation();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className='main-parent-container'>
      <div className='parent-container'>
        <Nav
          libraryStatus={libraryStatus}
          setLibraryStatus={setLibraryStatus}
        />

        <div className='song-container'>
          <img
            className='song-img'
            src={currentSong.cover}
            alt={currentSong.name}
          />
          <h2 className='song-name'>{currentSong.name}</h2>
          <h3 className='song-artist-name'>{currentSong.artist}</h3>
        </div>

        <div ref={visualizerRef} id='visualizer'>
          {Array.from({ length: 50 }).map((_, index) => (
            <div key={index} className='track'></div>
          ))}
        </div>

        <div className='player'>
          <div className='time-control'>
            <p className='song-time'>{getTime(songInfo.currentTime)}</p>
            <div
              style={{
                background: `linear-gradient(to right, ${currentSong.color[0]}, ${currentSong.color[1]})`,
                minWidth: '200px',
              }}
              className='track'
            >
              <input
                min={0}
                max={songInfo.duration || 0}
                value={songInfo.currentTime}
                onChange={dragHandler}
                type='range'
              />
              <div style={trackAnim} className='animate-track'></div>
            </div>
            <p className='song-time'>
              {songInfo.duration ? getTime(songInfo.duration) : '00:00'}
            </p>
          </div>
          <div className='play-control'>
            <FontAwesomeIcon
              onClick={() => skipTrackHandler('skip-back')}
              size='2x'
              className='skip-back'
              icon={faAngleLeft}
            />
            {!isPlaying ? (
              <FontAwesomeIcon
                onClick={playSongHandler}
                size='2x'
                className='play'
                icon={faPlay}
              />
            ) : (
              <FontAwesomeIcon
                onClick={playSongHandler}
                size='2x'
                className='pause'
                icon={faPause}
              />
            )}

            <FontAwesomeIcon
              onClick={() => skipTrackHandler('skip-forward')}
              size='2x'
              className='skip-forward'
              icon={faAngleRight}
            />
          </div>
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
          ref={audioRef}
          onEnded={songEndHandler}
        ></audio>
      </div>
    </div>
  );
};

export default AudioPlayer;
