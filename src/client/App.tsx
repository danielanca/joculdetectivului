import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ContextWrapper } from "./Context";

import MostWanted from "./components/MostWanted/MostWanted";
import Mainpage from "./pages/Mainpage";
import VideoPlayer from "./components/videoPlay/VideoList";

export const App = () => {
  return (
    <ContextWrapper>
      <Routes>
        <Route path="/" element={<Mainpage />} />
        <Route path="/most-wanted" element={<MostWanted />} />
        <Route path="/video" element={<VideoPlayer />} />
      </Routes>
    </ContextWrapper>
  );
};

export default App;
