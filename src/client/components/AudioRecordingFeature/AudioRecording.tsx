import styles from "./AudioRecording.module.scss";

const AudioRecordingFeature = () => {
  return (
    <div className={styles.recordingComponent}>
      <img
        className={styles.headline}
        src="https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/homePage%2FaudioComponent%2FSpecialHeadline.png?alt=media&token=94f56d08-4f81-492f-bf93-e11a35de402f"
      ></img>
    </div>
  );
};

export default AudioRecordingFeature;
