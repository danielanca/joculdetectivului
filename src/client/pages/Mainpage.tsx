import { useAppContext } from "../Context";
import { Footer } from "../components/Footer/Footer";
import FolderPopFeature from "../components/FolderPopFeature/FolderPopFeature";

const Mainpage = () => {
  // const { name, setName } = useAppContext();
  return (
    <div className="flex bg-white-100 font-sans items-center flex-col justify-between h-screen">
      <FolderPopFeature />
      <Footer />
    </div>
  );
};

export default Mainpage;
