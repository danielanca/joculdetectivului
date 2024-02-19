import { useEffect, useState } from 'react';
import './MainStyle.css';

import IGetChat from '../../strings/IGetChat';

// import Database from '../data';
import Database from '../../data';
import ChatComponent from './ChatComponent';

function FacebookChat() {
  const [contactId, setContactId] = useState(0);
  const [chatList, setChatList] = useState<IGetChat[]>();

  useEffect(() => {
    const database = new Database();
    const chatListAll = database.getChatListAll();
    setChatList(chatListAll);
  }, []);

  return (
    <ChatComponent
      setContactId={setContactId}
      chatList={chatList}
      setChatList={setChatList}
      contactId={contactId}
    />
  );
}

export default FacebookChat;
