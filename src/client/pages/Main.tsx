import React from "react";
import { Footer } from "../components/Footer/Footer";
import FolderPopFeature from "../components/FolderPopFeature/FolderPopFeature";
import AudioRecordingFeature from "../components/AudioRecordingFeature/AudioRecording";
import { useAppContext } from "../Context";
import styles from "./Main.module.scss";

const Main = () => {
  const { name, setName } = useAppContext();
  return (
    <div className={styles.mainComponent}>
      <FolderPopFeature />
      <AudioRecordingFeature />
      <Footer />
    </div>
  );
};

export default Main;
