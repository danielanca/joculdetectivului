import React from "react";
import TopBar from "./TopBar";
import { Footer } from "./common/Footer";
import Header from "./common/Header";
import UsersProfiles from "./UsersProfiles";
import UserInfo from "./UserInfo";
const MostWanted = () => {
  return (
    <>
      <TopBar />
      <Header />
      {/* <UserInfo /> */}
      <UsersProfiles />
      <Footer />
    </>
  );
};

export default MostWanted;
