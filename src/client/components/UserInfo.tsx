import React from "react";
import { IoPersonSharp } from "react-icons/io5";
import { FaMapMarkerAlt } from "react-icons/fa";

function UserInfo() {
    return (
        <div className="border-b-4 border-[#616161]">
        <div className="my-5 w-[85%] mx-auto">
            <div>
                {/* User Name */}
                <div className="flex flex-col font-normal">
                    <span className="text-base text-[#000000]">Welcome back,</span>
                    <span className="text-base text-[#A3A3A3]">{"detectiv Daniel Anca"}</span>
                </div>
                {/* Filtrează după */}
                <div className="mt-4">
                    <span className="text-base text-[#000000]">Filtrează după</span>
                </div>

                {/* Form */}
                <div className="mt-2">
                    <div className="flex justify-between flex-wrap">
                        <div className="flex mt-4">
                            <div className="border-t-2 border-b-2 border-l-2 h-10 w-10 border-[#707070] flex items-center justify-center text-[#707070]">
                                <IoPersonSharp />
                            </div>
                            <input type="text" className="border-2 h-10 w-40 border-[#707070] text-[#707070] p-4" placeholder="Nome" />
                        </div>
                        <div className="flex mt-4">
                            <div className="border-t-2 border-b-2 border-l-2 h-10 w-10 border-[#707070] flex items-center justify-center text-[#707070]">
                                <FaMapMarkerAlt />
                            </div>
                            <input type="text" className="border-2 h-10 w-40 border-[#707070] text-[#707070] p-4" placeholder="Oras" />
                        </div>
                    </div>

                    {/* Button */}
                    <div className="mt-4 h-9 w-24 font-normal text-base text-[#FFFFFF] bg-[#202A56] flex items-center justify-center cursor-pointer">Afișează</div>
                </div>
            </div>
            </div>
            </div>
    )
}

export default UserInfo;
