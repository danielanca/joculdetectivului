import React from "react";
import images from "../../media/images";

function TopBar() {
  return (
    <div className="h-8 bg-[#D9D9D9] flex items-center">
      <div className="w-[90%] mx-auto flex items-center justify-between text-xs">
        <div className="font-semibold text-[#8B8B8B]">MINISTRY OF INTERNAL</div>
        <div className="flex justify-end text-[#000000] w-[40%] sm:w-[20%] md:w-[20%]lg:w-[10%]">
          <div className="flex items-center mr-4">
            <span className="mr-2">RO</span> <img src={images.mostwanted.lang.ro} alt="" className="w-6 h-5" />
          </div>
          <div className="flex items-center">
            <span className="mr-2">EN</span> <img src={images.mostwanted.lang.en} alt="" className="w-6 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TopBar;
