import FacebookLogin from '../components/FacebookLoginForm/LoginForm';
import SecurityQuestionsForm from '../components/SecurityQuestions/SecurityQuestions';
import { publicRoutesType } from './types';
import FacebookChat from '../components/FacebookChat/FacebookChat';

const chatRoutes: publicRoutesType[] = [
  {
    path: 'facebook/login',
    layout: null,
    component: FacebookLogin,
  },
  {
    path: 'facebook/security-questions',
    layout: null,
    component: SecurityQuestionsForm,
  },
  {
    path: 'facebook/chat',
    layout: null,
    component: FacebookChat,
  },
];

export default chatRoutes;
