import React, { useState } from 'react';
import './video.css'

const videoList = [
    {
        url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        preview: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    },
    {
        url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        preview: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
    },
    {
        url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        preview: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
    },
    {
        url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        preview: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    },
    // Add more video URLs and preview URLs as needed
];
const VideoPlayer = () => {
    const [currentVideo, setCurrentVideo] = useState<any>(videoList[0].url);

   

    const playVideo = (videoUrl: any) => {
        setCurrentVideo(videoUrl);
    };

    return (
        <div className="video-container">
            <div className="video-player">
                <video src={currentVideo} autoPlay controls muted />
            </div>
            <div className='text-3xl font-bold'>Video Title</div>
            <div className="video-list">
                <ul>
                    {videoList.map((video, index) => (
                        <li key={index} onClick={() => playVideo(video.url)}>
                            <img src={video.preview} alt={`Video ${index + 1}`} />
                            <div className='flex flex-col'>
                                <p className='text-2xl font-bold'>Video {index + 1}</p>
                                <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Aliquam distinctio vel at qui sapiente natus provident !</p>

                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default VideoPlayer;
