import { useState } from "react";
import { IoPersonSharp } from "react-icons/io5";
import { FaMapMarkerAlt } from "react-icons/fa";
import { UserProfilesData } from "../../data/UserProfilesData";

const USERS_PER_PAGE = 8;

function UsersProfiles() {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchName, setSearchName] = useState("");
  const [searchDob, setSearchDob] = useState("");
  const [filteredUsers, setFilteredUsers] = useState(UserProfilesData);

  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  const startIndex = (currentPage - 1) * USERS_PER_PAGE;
  const selectedUsers = filteredUsers.slice(startIndex, startIndex + USERS_PER_PAGE);

  const goToNextPage = () => setCurrentPage(current => (current < totalPages ? current + 1 : current));
  const goToPreviousPage = () => setCurrentPage(current => (current > 1 ? current - 1 : current));

  const handleSearch = () => {
    const filtered = UserProfilesData.filter(
      user =>
        (searchName ? user.name.toLowerCase().includes(searchName.toLowerCase()) : true) &&
        (searchDob ? user.dob === searchDob : true),
    );
    setFilteredUsers(filtered);
    setCurrentPage(1); // Reset to the first page after search
  };

  return (
    <div>
      {/* User Info */}
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
              <div className="flex flex-wrap">
                <div className="flex mt-4 mr-4">
                  <div className="border-t-2 border-b-2 border-l-2 h-10 w-10 border-[#707070] flex items-center justify-center text-[#707070]">
                    <IoPersonSharp />
                  </div>
                  <input
                    type="text"
                    className="border-2 h-10 w-40 border-[#707070] text-[#707070] p-4"
                    placeholder="Nome"
                    value={searchName}
                    onChange={e => setSearchName(e.target.value)}
                  />
                </div>
                <div className="flex mt-4">
                  <div className="border-t-2 border-b-2 border-l-2 h-10 w-10 border-[#707070] flex items-center justify-center text-[#707070]">
                    <FaMapMarkerAlt />
                  </div>
                  <input
                    type="text"
                    className="border-2 h-10 w-40 border-[#707070] text-[#707070] p-4"
                    placeholder="Oras"
                    value={searchDob}
                    onChange={e => setSearchDob(e.target.value)}
                  />
                </div>
              </div>

              {/* Button */}
              <div
                className="mt-4 h-9 w-24 font-normal text-base text-[#FFFFFF] bg-[#202A56] flex items-center justify-center cursor-pointer"
                onClick={handleSearch}
              >
                Afișează
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profiles */}
      <div className="w-[85%] mx-auto my-10">
        {selectedUsers.map((data, index) => (
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

        {/* (Previous & Next) Buttons */}
        <div className="flex justify-between my-10">
          <div
            onClick={goToPreviousPage}
            className="mt-4 h-9 w-24 font-normal text-base text-[#FFFFFF] bg-[#202A56] flex items-center justify-center cursor-pointer"
          >
            {"<- Inapoi"}
          </div>
          <div
            onClick={goToNextPage}
            className="mt-4 h-9 w-24 font-normal text-base text-[#FFFFFF] bg-[#202A56] flex items-center justify-center cursor-pointer"
          >
            {"Urmator ->"}
          </div>
        </div>

        {/* Page Number */}
        <div className="text-[#202A56] text-lg flex justify-between">
          <div></div>
          <div className="block">
            <span className="mr-1">Pagina</span>
            <span className="px-2 mr-1 border border-[#000000]">
              <span>{currentPage}</span>
            </span>
            <span className="mr-1">din</span>
            <span>{totalPages}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UsersProfiles;
