import React from "react";
import DEPARTAMENTUL_Batch from "../media/assets/DEPARTAMENTUL_Batch.png"


function Header() {
    return (
        <div className="mt-10">
            <div className="w-[85%] mx-auto flex">
                <div className="mr-5">
                    <img src={DEPARTAMENTUL_Batch} alt="" className="w-20 h-20" />
                </div>
                <div className="flex flex-col">
                    <span className="text-xl font-bold text-[#1B2D5E] cursor-default">DEPARTAMENTUL</span>
                    <span className="text-lg font-bold text-[#1B2D5E] cursor-default">DE INVESTIGATII</span>
                    <span className="text-2xl font-bold text-[#1B2D5E] cursor-default">MOST WANTED</span>
                </div>
            </div>
            {/* VIAȚA ARE PRIORITATE Banner */}
            <div className="mt-8 bg-[#202A56] font-semibold text-xl text-[#FFFFFF] text-center flex items-center justify-center h-12">
                VIAȚA ARE PRIORITATE
            </div>
        </div>
    )
}

export default Header;
