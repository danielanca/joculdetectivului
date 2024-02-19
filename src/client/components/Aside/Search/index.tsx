import React, { useRef, useState } from 'react';
import { FaArrowDown } from "react-icons/fa6";
import { IoIosSearch } from "react-icons/io";

import './styles.css';

interface Props{
    setValueSearch : Function
}

const Search : React.FC<Props> = ({ setValueSearch }) => {

    const [ focusInput, setFocusInput ] = useState(false);
    const inputSearch = useRef<any>(null);

    const clickSearch = () => {
        inputSearch.current?.focus();
    }

    const focusSearch = () => {
        setFocusInput(true);
    }

    const blurSearch = () => {
        setFocusInput(false);
    }

    const changeValue = ( value: string ) => {
        setValueSearch(value);
    }

    return (
        <section className="areaSearch" style={focusInput ? {} : {
            padding: "8px 15px",
        }}>
            <div className="search" style={focusInput ? {} : {
                borderRadius: 20,
            }}>

                 <div className="buttonSearch" style={ focusInput ? {
                    transform: "rotate(90deg)"
                } : {} }>
                    {
                        focusInput ? 
                            <FaArrowDown size="20" color="#9de0fd"/>
                        :
                            <div onClick={clickSearch}>
                                <IoIosSearch size="20" color="#919191" />
                            </div>
                    }
                </div>

                <input onChange={(e => changeValue(e.target.value))} ref={inputSearch} onFocus={focusSearch} onBlur={blurSearch} className="inputSearch" type="text" name="search" placeholder="Pesquisar ou começar uma nova conversa" />
            </div>
        </section>
    );
}

export default Search;