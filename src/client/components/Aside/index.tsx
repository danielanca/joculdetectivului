import React, { useState } from 'react';

import Header from './Header';
import Search from './Search';
import ListContacts from './ListContacts';

import './styles.css';
import IGetChat from 'src/client/strings/IGetChat';

interface Props {
  setContact: Function;
  setChatList: Function;
  chatList: IGetChat[] | undefined;
}

const Aside: React.FC<Props> = ({ setContact, chatList, setChatList }) => {
  const [valueSearch, setValueSearch] = useState('');

  return (
    <aside className='aside-container'>
      <Header />

      <Search setValueSearch={setValueSearch} />

      <ListContacts
        setContact={setContact}
        valueSearch={valueSearch}
        chatList={chatList}
        setChatList={setChatList}
      />
    </aside>
  );
};

export default Aside;
