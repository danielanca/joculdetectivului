import React from "react";
import Main from "./pages/Main";
import { ContextWrapper } from "./Context";
import { Footer } from "./components/Footer";
import TopBar from "./components/TopBar";
import Header from "./components/Header";
import UserInfo from "./components/UserInfo";
import UsersProfiles from "./components/UsersProfiles";

export const App = () => {
  return (
    <ContextWrapper>
      <TopBar />
      <Header />
      <UserInfo />
      <UsersProfiles />
      
      {/* <Main /> */}
      <Footer />
    </ContextWrapper>
  );
};

export default App;
