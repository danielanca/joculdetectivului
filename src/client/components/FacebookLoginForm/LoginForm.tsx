import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './LoginForm.css';
import images from '../../media/images';

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    console.log('Login with:', email, password);
  };

  return (
    <div className='sign-in_container'>
      <div className='logo-div'>
        <Link to={'/facebook/login'}>
          <img
            src={images.facebook_chat.facebookLogo}
            alt='Logo'
            className='logo'
          />
        </Link>
      </div>
      <h2 className={'login_heading'}>Log In to Game</h2>
      <form onSubmit={handleSubmit}>
        <div className='input-container'>
          <input
            type='text'
            className='input-field'
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder='Email address or phone number'
          />
        </div>
        <div className='input-container'>
          <input
            type='password'
            className='input-field'
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder='Password'
            autoComplete='current-password'
          />
        </div>
        <div className='chat-login-btn_container'>
          <button className='chat-login-btn' type='submit'>
            Log in
          </button>
        </div>

        <div className='forgotten-account_link_container'>
          <Link
            to='/facebook/security-questions'
            className='forgotten-account_link'
            target=''
          >
            Forgotten account?
          </Link>
        </div>
      </form>
    </div>
  );
};

export default LoginForm;
