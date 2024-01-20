import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ContextWrapper } from "./Context";

import MostWanted from "./components/MostWanted/MostWanted";
import FolderPopFeature from "./components/FolderPopFeature/FolderPopFeature";

export const App = () => {
  return (
    <ContextWrapper>
      <Routes>
        <Route path="/" element={<FolderPopFeature />} />
        <Route path="/most-wanted" element={<MostWanted />} />
      </Routes>
    </ContextWrapper>
  );
};

export default App;
