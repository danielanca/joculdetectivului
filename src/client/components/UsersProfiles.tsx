import React from "react";
import { UserProfilesData } from "../data/UserProfilesData";

function UsersProfiles() {
    return (
        <div className="w-[85%] mx-auto my-10">
            {UserProfilesData.map((data, index) => (
                <div key={index} className="border border-[#D9D9D9] p-2 flex my-4">
                        <div className="bg-[#D9D9D9] w-16 h-20 flex items-center justify-center mr-4">
                            <img src={data.Img} alt={data.Img} className="w-12 h-16" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-lg font-bold text-[#202A56]">{data.name}</span>
                            <span className="text-xs font-semibold text-[#202A56]">Date of birth: {data.dob}</span>
                        </div>
                </div>
            ))}

            {/* (Previous & Next) Button */}
            <div className="flex justify-between my-10">
                <div className="mt-4 h-9 w-24 font-normal text-base text-[#FFFFFF] bg-[#202A56] flex items-center justify-center">{"<- Inapoi"}</div>
                <div className="mt-4 h-9 w-24 font-normal text-base text-[#FFFFFF] bg-[#202A56] flex items-center justify-center">{"Urmator ->"}</div>
            </div>

            {/* Page Number */}
            <div className="text-[#202A56] text-lg flex justify-between">
                <div></div>
                <div className="block">
                    <span className="mr-1">Pagina</span>
                    <span className="px-2 mr-1 border border-[#000000]"><span>{"3"}</span></span>
                    <span className="mr-1">din</span>
                    <span>{"7"}</span>
                </div>
            </div>
        </div>
    )
}

export default UsersProfiles;
