import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaRegCirclePause } from 'react-icons/fa6';
import { AiOutlineCaretLeft, AiOutlineCaretRight } from 'react-icons/ai';
import { VscDebugContinue } from 'react-icons/vsc';
import './AudioPlayer.scss';

const AudioPlayer: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const visualizerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.crossOrigin = 'anonymous';
    }
  }, []);

  const playAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play();
    }
  }, []);

  const pauseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const loop = useCallback(() => {
    if (!isPlaying) return;

    window.requestAnimationFrame(loop);

    if (dataArrayRef.current && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      changeTracks();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      playAudio();
      loop();
    } else {
      pauseAudio();
    }
  }, [isPlaying, playAudio, pauseAudio, loop]);

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

  const togglePlayer = () => {
    if (!contextRef.current) {
      preparation();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className='container'>
      <input
        type='checkbox'
        defaultValue='None'
        id='magicButton'
        name='check'
      />
      <label className='main' htmlFor='magicButton' />
      <div className='coverImage' />
      <div className='search' />
      <div className='bodyPlayer' />
      <div ref={visualizerRef} id='visualizer'>
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
        <div className='track' />
      </div>
      <audio
        src='https://cdn.pixabay.com/download/audio/2023/03/01/audio_74accea696.mp3?filename=trap-beat-dark-autumn-night-141114.mp3'
        crossOrigin='anonymous'
        id='audio'
        ref={audioRef}
      />
      <table className='list'>
        <tbody>
          <tr className='song'>
            <td className='nr'>
              <h5>1</h5>
            </td>
            <td className='title'>
              <h6>Heavydirtysoul</h6>
            </td>
            <td className='length'>
              <h5>3:54</h5>
            </td>
            <td>
              <input type='checkbox' id='heart' />
              <label className='zmr' htmlFor='heart' />
            </td>
          </tr>
          <tr className='song'>
            <td className='nr'>
              <h5>2</h5>
            </td>
            <td className='title'>
              <h6 style={{ color: '#ff564c' }}>StressedOut</h6>
            </td>
            <td className='length'>
              <h5>3:22</h5>
            </td>
            <td>
              <input type='checkbox' id='heart1' />
              <label className='zmr' htmlFor='heart1' />
            </td>
          </tr>
          <tr className='song'>
            <td className='nr'>
              <h5>3</h5>
            </td>
            <td className='title'>
              <h6>Ride</h6>
            </td>
            <td className='length'>
              <h5>3:34</h5>
            </td>
            <td>
              <input type='checkbox' id='heart2' />
              <label className='zmr' htmlFor='heart2' />
            </td>
          </tr>
          <tr className='song'>
            <td className='nr'>
              <h5>4</h5>
            </td>
            <td className='title'>
              <h6>Fairy Local</h6>
            </td>
            <td className='length'>
              <h5>3:27</h5>
            </td>
            <td>
              <input type='checkbox' id='heart3' />
              <label className='zmr' htmlFor='heart3' />
            </td>
          </tr>
          <tr className='song'>
            <td className='nr'>
              <h5>5</h5>
            </td>
            <td className='title'>
              <h6>Tear in My Heart</h6>
            </td>
            <td className='length'>
              <h5>3:08</h5>
            </td>
            <td>
              <input type='checkbox' id='heart4' />
              <label className='zmr' htmlFor='heart4' />
            </td>
          </tr>
          <tr className='song'>
            <td className='nr'>
              <h5>6</h5>
            </td>
            <td className='title'>
              <h6>Lane Boy</h6>
            </td>
            <td className='length'>
              <h5>4:13</h5>
            </td>
            <td>
              <input type='checkbox' id='heart5' />
              <label className='zmr' htmlFor='heart5' />
            </td>
          </tr>
          <tr className='song'>
            <td className='nr'>
              <h5>7</h5>
            </td>
            <td className='title'>
              <h6>The Judge</h6>
            </td>
            <td className='length'>
              <h5>4:57</h5>
            </td>
            <td>
              <input type='checkbox' id='heart6' />
              <label className='zmr' htmlFor='heart6' />
            </td>
          </tr>
          <tr className='song'>
            <td className='nr'>
              <h5>8</h5>
            </td>
            <td className='title'>
              <h6>Doubt</h6>
            </td>
            <td className='length'>
              <h5>3:11</h5>
            </td>
            <td>
              <input type='checkbox' id='heart7' />
              <label className='zmr' htmlFor='heart7' />
            </td>
          </tr>
          <tr className='song'>
            <td className='nr'>
              <h5>9</h5>
            </td>
            <td className='title'>
              <h6>Polarize</h6>
            </td>
            <td className='length'>
              <h5>3:46</h5>
            </td>
            <td>
              <input type='checkbox' id='heart8' />
              <label className='zmr' htmlFor='heart8' />
            </td>
          </tr>
        </tbody>
      </table>
      <div className='shadow' />
      <div className='bar' />
      <div className='info'>
        <h4>STRESSED OUT</h4>
        <h3>twenty one pilots - Blurryface</h3>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* left toggle play button */}
        <button id='left-toggle-play'>
          <AiOutlineCaretLeft size={40} color='white' title='right' />
        </button>
        {/* pause toggle play button */}
        <button id='toggle-play' onClick={togglePlayer}>
          {isPlaying ? (
            <FaRegCirclePause size={40} color='white' />
          ) : (
            <VscDebugContinue size={40} color='white' title='play' />
          )}
        </button>
        {/* right toggle play button */}
        <button id='right-toggle-play'>
          <AiOutlineCaretRight size={40} color='white' title='left' />
        </button>
      </div>
      <table className='footer'>
        <tbody>
          <tr>
            <td>
              <input type='checkbox' id='love' />
              {/* defaultChecked=""  */}
              <label className='love' htmlFor='love' />
            </td>
            <td>
              <input type='checkbox' id='shuffle' />
              <label className='shuffle' htmlFor='shuffle' />
            </td>
            <td>
              <input type='checkbox' id='repeat' />
              {/* defaultChecked=""  */}
              <label className='repeat' htmlFor='repeat' />
            </td>
            <td>
              <input type='checkbox' id='options' />
              <label className='options' htmlFor='options' />
            </td>
          </tr>
        </tbody>
      </table>
      <div className='current'>
        <h2>STRESSED OUT</h2>
      </div>
    </div>
  );
};
export default AudioPlayer;
