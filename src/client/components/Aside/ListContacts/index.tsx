import React, { useEffect, useState } from 'react';

import IGetChat from 'src/client/strings/IGetChat';

import images from '../../../media/images';

import { MdCheck } from 'react-icons/md';

import './styles.css';
// import Database from 'src/client/data';
import Database from '../../../data';

interface Props {
  setContact: Function;
  valueSearch: string;
  chatList: IGetChat[] | undefined;
  setChatList: Function;
}
const ListContacts: React.FC<Props> = ({
  setContact,
  valueSearch,
  chatList,
  setChatList,
}) => {
  const formatDate = (date: number) => {
    const timestamps = new Date().getTime();
    const dateNow = new Date();
    const dateFormat = new Date(date * 1000);

    const dateFormatDefault =
      (dateFormat.getDate() < 10
        ? '0' + dateFormat.getDate()
        : dateFormat.getDate()) +
      '/' +
      (dateFormat.getMonth() < 10
        ? '0' + (dateFormat.getMonth() + 1)
        : dateFormat.getMonth() + 1) +
      '/' +
      dateFormat.getFullYear();

    if (
      dateFormat.getFullYear() === dateNow.getFullYear() &&
      dateFormat.getMonth() === dateNow.getMonth() &&
      dateFormat.getDate() === dateNow.getDate()
    ) {
      return (
        (dateFormat.getHours() < 10
          ? '0' + dateFormat.getHours()
          : dateFormat.getHours()) +
        ':' +
        (dateFormat.getMinutes() < 10
          ? '0' + dateFormat.getMinutes()
          : dateFormat.getMinutes())
      );
    } else {
      const dateOntem = new Date(timestamps - 86400000);

      if (
        dateOntem.getFullYear() === dateFormat.getFullYear() &&
        dateOntem.getMonth() === dateFormat.getMonth() &&
        dateOntem.getDate() === dateFormat.getDate()
      ) {
        return 'Ontem';
      } else {
        const date5anyless = new Date(timestamps - 432000000);
        if (dateFormat.getTime() > date5anyless.getTime()) {
          const daysWeek = [
            'Domingo',
            'Segunda-feira',
            'Terça-feira',
            'Quarta-feira',
            'Quinta-feira',
            'Sexta-feira',
            'Sábado',
          ];
          return daysWeek[dateFormat.getDay()];
        }
      }
    }

    return dateFormatDefault;
  };

  const onClickChat = (item: IGetChat) => {
    setContact(item.contact?.id);
  };

  const formatText = (text: string) => {
    let newTexto = text.replace(/(\r\n|\n|\r)/gm, ' ');

    if (newTexto.length > 43) {
      newTexto = newTexto.substr(0, 43) + '...';
    }

    return newTexto;
  };

  const [data, setData] = useState<IGetChat[] | undefined>([]);

  useEffect(() => {
    sortAsc(chatList);
  }, [chatList]);

  const sortAsc = (valueJson: IGetChat[] | undefined) => {
    const newData = valueJson?.sort((a, b) => {
      return (a.last_update || 1) - (b.last_update || 1);
    });

    setData(newData?.reverse());
  };

  const searchContacts = (valueSearch: string) => {
    if (valueSearch.length > 1) {
      const chat = [];
      const value = valueSearch.toLowerCase();
      for (const item of chatList || []) {
        if (item.contact?.name.toLowerCase().indexOf(value) !== -1) {
          chat.push(item);
        } else {
          if (item.contact.phone.indexOf(value) !== -1) {
            chat.push(item);
          }
        }
      }

      sortAsc(chat);
    } else {
      setChatList(new Database().getChatListAll());
    }
  };

  useEffect(() => {
    searchContacts(valueSearch);
  }, [valueSearch]);

  return (
    <section className='chatList'>
      <ul className='list'>
        {data?.map(item => (
          <li
            onClick={() => onClickChat(item)}
            className='item'
            key={item.info_chat.id}
          >
            <div className='areaImgProfile'>
              <img
                className='imgProfileChatList'
                src={images.facebook_chat.ImgAvatar}
                alt={'Imagem de perfil do ' + item.contact?.name}
              />
            </div>

            <div className='areaInfoChatList'>
              <div className='topItem'>
                <div className='descriptionContact'>
                  <h4>{item.contact?.name}</h4>
                  <div className='hora'>
                    {formatDate(item.last_message?.date || 0)}
                  </div>
                </div>
              </div>

              <div className='bottonItem'>
                <div className='lastMessage'>
                  <span>
                    {item.last_message?.send === 1 ? (
                      <MdCheck className='iconCheck' />
                    ) : (
                      <></>
                    )}
                  </span>
                  <span title={item.last_message?.text}>
                    {formatText(item.last_message?.text || '')}
                  </span>
                </div>

                {item.info_chat.not_read > 0 ? (
                  <div className='msgNotRead'>{item.info_chat.not_read}</div>
                ) : (
                  <div></div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ListContacts;
