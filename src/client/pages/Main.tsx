import React from "react";
import { Footer } from "../components/Footer/Footer";
import FolderPopFeature from "../components/FolderPopFeature/FolderPopFeature";
import { useAppContext } from "../Context";

const Main = () => {
  const { name, setName } = useAppContext();
  return (
    <div className="flex bg-white-100 font-sans items-center flex-col justify-between h-screen">
      <FolderPopFeature />
      <Footer />
    </div>
  );
};

export default Main;
