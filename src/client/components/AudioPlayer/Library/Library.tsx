import './_library.scss';
import LibrarySong from './LibrarySong';

const Library = ({
  songs,
  setCurrentSong,
  audioRef,
  isPlaying,
  setSongs,
  setLibraryStatus,
  libraryStatus,
}: any) => {
  return (
    <div className={`library ${libraryStatus ? 'active' : ''}`}>
      <h2 className='libraryHeading'>Librarie</h2>
      <div className='librarySongs'>
        {songs.map((song: any) => (
          <LibrarySong
            setSongs={setSongs}
            isPlaying={isPlaying}
            audioRef={audioRef}
            songs={songs}
            song={song}
            setCurrentSong={setCurrentSong}
            id={song.id}
            key={song.id}
          />
        ))}
      </div>
    </div>
  );
};

export default Library;
