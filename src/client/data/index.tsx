import messages from './messages.json';
import contacts from './contacts.json';
import chat_list from './chat_list.json';

import IContact from '../strings/IContact';
import IChatList from '../strings/IChatList';
import IMessage from '../strings/IMessage';

class Database {
  messages: IMessage[];
  contacts: IContact[];
  chat_list: IChatList[];

  constructor() {
    const exitsMessages = localStorage.getItem('messages');
    const exitsContacts = localStorage.getItem('contacts');
    const exitsChatList = localStorage.getItem('chat_list');

    if (!exitsMessages && !exitsContacts && !exitsChatList) {
      this.messages = messages;
      this.contacts = contacts;
      this.chat_list = chat_list;

      this.insertDataLocalStorage();
    } else {
      this.messages = JSON.parse(exitsMessages || '');
      this.contacts = JSON.parse(exitsContacts || '');
      this.chat_list = JSON.parse(exitsChatList || '');
    }
  }

  insertDataLocalStorage() {
    localStorage.setItem('messages', JSON.stringify(this.messages));
    localStorage.setItem('contacts', JSON.stringify(this.contacts));
    localStorage.setItem('chat_list', JSON.stringify(this.chat_list));
  }

  findMessage(id: number) {
    for (const message of this.messages) {
      if (message.id === id) {
        return message;
      }
    }
  }

  findContact(id: number) {
    for (const contact of this.contacts) {
      if (contact.id === id) {
        return contact;
      }
    }
  }

  getChatListAll() {
    const chatAll = [];

    for (const chat of this.chat_list) {
      if (!chat.deleted) {
        const lastMsg = this.findMessage(chat.last_message_id);
        const contact = this.findContact(chat.contact_id);
        const info_chat = chat;

        chatAll.push({
          info_chat: info_chat,
          last_message: lastMsg,
          contact: contact,
          last_update: lastMsg?.date,
        });
      }
    }

    return chatAll;
  }

  getAllMessagesChat(id: number) {
    const messagesAll = [];

    for (const message of this.messages) {
      if (message.contact_id === id) {
        messagesAll.push(message);
      }
    }

    return {
      messages_all: messagesAll,
      contact_info: this.findContact(id),
    };
  }

  readMessages(contactId: number) {
    const chatNew = [];
    for (const chat of this.chat_list) {
      if (chat.contact_id === contactId) {
        chat.not_read = 0;
      }

      chatNew.push(chat);
    }

    this.chat_list = chatNew;
    localStorage.setItem('chat_list', JSON.stringify(chatNew));
  }

  insertMessage(text: string, contact_id: number) {
    const messagesAll = this.messages;

    const timestamps = Date.now();

    const idNow = messagesAll[messagesAll.length - 1].id + 1;
    const messageNow = {
      id: idNow,
      contact_id: contact_id,
      send: 1,
      type_media: 1,
      text: text,
      date: Math.floor(timestamps / 1000),
    };

    messagesAll.push(messageNow);
    localStorage.setItem('messages', JSON.stringify(messagesAll));
    this.updateLastMessage(idNow, contact_id);
  }

  updateLastMessage(id: number, contactId: number) {
    const chatAll = [];

    for (const chat of this.chat_list) {
      if (chat.contact_id === contactId) {
        chat.last_message_id = id;
      }

      chatAll.push(chat);
    }

    this.chat_list = chatAll;
    localStorage.setItem('chat_list', JSON.stringify(chatAll));
  }
}

export default Database;
