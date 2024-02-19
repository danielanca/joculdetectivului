import IChatList from './IChatList';
import IMessage from './IMessage';
import IContact from './IContact';

export default interface IGetChat{
    info_chat: IChatList,
    last_message: IMessage | undefined,
    contact: IContact | undefined,
    last_update: number | undefined
}