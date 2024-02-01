import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMusic } from '@fortawesome/free-solid-svg-icons';
import '../AudioPlayer/AudioPlayer.scss';

const Nav = ({ setLibraryStatus, libraryStatus }: any) => {
  return (
    <nav className='nav-container'>
      <h1 className='waves-heading'>Waves</h1>
      <button
        onClick={() => {
          setLibraryStatus(!libraryStatus);
        }}
        className='library-btn'
      >
        Library
        <FontAwesomeIcon icon={faMusic} />
      </button>
    </nav>
  );
};

export default Nav;
