import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SecurityQuestionsData } from '../../data/SecurityQuestionsData';
import './SecurityQuestions.css';
import LoadingEffect from '../Chat/LoadingEffect';
import images from '../../media/images';

const SecurityQuestions: React.FC = () => {
  const [firstDogName, setFirstDogName] = useState('');
  const [grandpaName, setGrandpaName] = useState('');
  const [teacherFamilyName, setTeacherFamilyName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  const clearErrorMessage = () => {
    setErrorMessage('');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (
      firstDogName === SecurityQuestionsData.firstDogName &&
      grandpaName === SecurityQuestionsData.grandpaName &&
      teacherFamilyName === SecurityQuestionsData.teacherFamilyName
    ) {
      setIsSubmitting(true);
      setTimeout(() => {
        navigate('/facebook/chat');
      }, 3000);
    } else {
      clearErrorMessage();
      setFirstDogName('');
      setGrandpaName('');
      setTeacherFamilyName('');
      setErrorMessage(
        'Your security answers are incorrect. Please try again or contact our customer support.'
      );
    }
  };

  return (
    <div className='security-questions-container'>
      <div className='logo-div'>
        <Link to={'/facebook/login'}>
          <img
            src={images.facebook_chat.facebookLogo}
            alt='Logo'
            className='logo'
          />
        </Link>
      </div>
      <h2 className='security-questions-heading'>Fill Security Questions</h2>
      <form onSubmit={handleSubmit}>
        <div className='security-question'>
          <label className='security-question-label'>
            1. What is your first childhood dog's name?
          </label>
          <input
            type='text'
            className='security-question-input'
            value={firstDogName}
            onChange={e => setFirstDogName(e.target.value)}
            placeholder='Answer'
          />
        </div>
        <div className='security-question'>
          <label className='security-question-label'>
            2. What's your grandpa from your father's name?
          </label>
          <input
            type='text'
            className='security-question-input'
            value={grandpaName}
            onChange={e => setGrandpaName(e.target.value)}
            placeholder='Answer'
          />
        </div>
        <div className='security-question'>
          <label className='security-question-label'>
            3. What's the family name of your first grade teacher?
          </label>
          <input
            type='text'
            className='security-question-input'
            value={teacherFamilyName}
            onChange={e => setTeacherFamilyName(e.target.value)}
            placeholder='Answer'
          />
        </div>
        <div>
          {isSubmitting ? (
            <div className='submitting-message'>
              <LoadingEffect />
            </div>
          ) : (
            <div className='submitting-message_container'>
              <button className='security-questions-submit-btn' type='submit'>
                Submit
              </button>
            </div>
          )}
          {errorMessage && <div className='error-message'>{errorMessage}</div>}
        </div>
      </form>
    </div>
  );
};

export default SecurityQuestions;
