import React from 'react';
import { Link } from 'react-router-dom';
import IContact from 'src/client/strings/IContact';

import images from '../../../media/images';

import './styles.css';

import { FaSearch, FaEllipsisV } from 'react-icons/fa';

interface Props {
  contactInfo: IContact | undefined;
  backButton: any;
}

const Header: React.FC<Props> = ({ contactInfo, backButton }) => {
  const Arrow = backButton;
  return (
    <div className='chatHeader'>
      <div className='headerLeft' title={contactInfo?.name}>
        <Link to='/facebook/chat'>{Arrow}</Link>
        <img
          className='imgProfile'
          src={images.facebook_chat.ImgAvatar}
          alt={`Imagem de perfil do ${contactInfo?.name}`}
        />
        <div>
          <h3>{contactInfo?.name}</h3>
        </div>
      </div>

      <div className='headerRight'>
        <FaSearch title='Pesquisar...' className='iconHeader' />
        <FaEllipsisV title='Mais opções' className='iconHeader' />
      </div>
    </div>
  );
};

export default Header;
