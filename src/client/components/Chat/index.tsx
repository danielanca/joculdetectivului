import React, { useEffect, useState } from 'react';

import IContact from 'src/client/strings/IContact';
import IMessage from 'src/client/strings/IMessage';

import './styles.css';

import images from '../../media/images';
import Database from '../../data';

import Header from './Header';
import ListMessage from './ListMessages';
import AreaSend from './AreaSend';

interface Props {
  contact_id: number;
  setChatList: Function;
  backButton: any;
}

const Chat: React.FC<Props> = ({ contact_id, setChatList, backButton }) => {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [contactInfo, setContactInfo] = useState<IContact>();
  const [actionMessage, setActionMessage] = useState(0);

  useEffect(() => {
    const database = new Database();

    const res = database.getAllMessagesChat(contact_id);
    setMessages(res.messages_all);
    setContactInfo(res.contact_info);

    database.readMessages(contact_id);

    setChatList(database.getChatListAll());
    setActionMessage(Date.now());
  }, [contact_id, setChatList]);

  return (
    <section className='chatContainer'>
      {contact_id > 0 ? (
        <div className='areaChat'>
          <Header contactInfo={contactInfo} backButton={backButton} />

          <ListMessage messages={messages} actionNewMessage={actionMessage} />

          <AreaSend
            contact_id={contact_id}
            setChatList={setChatList}
            setMessages={setMessages}
            setActionMessage={setActionMessage}
          />
        </div>
      ) : (
        <div className='areaDefault'>
          <div className='default'>
            <div
              className='backImg'
              style={{
                backgroundImage: `url(${images.facebook_chat.imgChatNone})`,
              }}
            ></div>
            <h1>Mantenha seu celular conectado</h1>
            <p>
              O Chat conecta ao seu telefone para sincronizar suas mensagens.
              Para reduzir o uso de dados, conecte seu telefone a uma rede
              Wi-Fi.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default Chat;
