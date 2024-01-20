import React from "react";
import images from "../../../media/images";

export const Footer = () => {
  return (
    <div className="mt-20">
      <div className="flex justify-center">
        <img src={images.mostwanted.logo} alt="" className="w-20 h-20 absolute mt-[-50px] " />
      </div>
      <div className="bg-[#202A56] text-[#FFFFFF] flex flex-col items-center text-center py-20">
        <span className="text-2xl font-bold">SERVICIILE SECRETE</span>
        <span className="pt-6 text-base font-medium">
          Acest portal este privat și se poate utiliza doar de către persoanele autorizate.
        </span>
        <span className="pt-10 text-xs">
          Vă informăm că acest site este destinat exclusiv pentru scopuri de divertisment și conținutul său este pur
          ficțional. Toate scenariile, personajele și evenimentele prezentate aici sunt produse ale imaginației și nu
          reflectă realitatea.
        </span>
      </div>

      {/* Copyright Text */}
      <footer className={"flex justify-center items-center text-center border-t h-10"}>
        &copy; {new Date().getFullYear()} - <a href={"https://jonlu.ca"}>JonLuca DeCaro</a> -{" "}
        <a className={"p-1"} href={"https://github.com/jonluca/vite-typescript-ssr-react"}>
          Repo
        </a>
      </footer>
    </div>
  );
};
