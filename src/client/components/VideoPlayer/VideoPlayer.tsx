import { useState } from "react";
import styles from "./video.module.scss"

const videoList = [
  {
    url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    preview: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
  },
  {
    url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    preview: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg",
  },
  {
    url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    preview: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg",
  },
  {
    url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    preview: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
  },
  // Add more video URLs and preview URLs as needed
];
const VideoPlayer = () => {
  const [currentVideo, setCurrentVideo] = useState<any>(videoList[0].url);

  const playVideo = (videoUrl: any) => {
    setCurrentVideo(videoUrl);
  };

  return (
    <div className={styles.videoContainer}>
      <div className={styles.videoPlayer}>
        <video src={currentVideo} className={styles.videoStyle} autoPlay controls muted />
      </div>
      <div className={styles.mainVideoInfoContainer}>
        <h3 className={styles.mainVideoTitleStyle}>Inregistrare suspect</h3>
        <p className={styles.mainVideoSubtitleStyle}>19.12.2012 23:30</p>
      </div>
      <div className={styles.videoListContainer}>
        <ul className={`${styles.videoList} ${styles.customScrollbar}`}>
          {videoList.map((video, index) => (
            <li key={index} onClick={() => playVideo(video.url)} className={styles.videoItemContainer}>
              <div className={styles.videoPreviewContainer}>
                <img src={video.preview} alt={`Video ${index + 1}`} className={styles.videoPreviewStyle} />
              </div>
              <div className={styles.videoInfoContainer}>
                <div className={styles.videoTitleContainer}>
                  <h4 className={styles.videoTitleStyle}>Video {index + 1}</h4>
                  <span className={styles.mainVideoSubtitleStyle}>19.12.2012 23:30</span>
                </div>
                <p className={styles.videoDescriptionStyle}>
                  Lorem ipsum dolor sit amet consectetur adipisicing elit. Aliquam distinctio vel at qui sapiente natus
                  provident !
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default VideoPlayer;
