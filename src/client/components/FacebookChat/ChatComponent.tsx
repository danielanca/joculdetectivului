import React from 'react';
import Aside from '../Aside';
import Chat from '../Chat';
import './MainStyle.css';

import { TiArrowLeft } from 'react-icons/ti';

function ChatComponent({
  setContactId,
  chatList,
  setChatList,
  contactId,
}: any) {
  const handleBackClick = () => {
    setContactId(0);
  };

  const backButton = (
    <TiArrowLeft className='back-icon' onClick={handleBackClick} />
  );

  return (
    <div className='container'>
      {contactId < 1 && (
        <Aside
          setContact={setContactId}
          chatList={chatList}
          setChatList={setChatList}
        />
      )}

      {contactId > 0 && (
        <>
          <Chat
            contact_id={contactId}
            setChatList={setChatList}
            backButton={backButton}
          />
        </>
      )}
    </div>
  );
}

export default ChatComponent;
