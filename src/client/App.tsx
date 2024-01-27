import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import routes from "./routes/routes";
import {ContextWrapper} from './Context'; // Assuming you have this component

export const App = () => {
  return (
    <ContextWrapper>
      <Suspense fallback={<div>LOADING URS...</div>}> 
        <Routes>
          {routes.map((route, index) => (
            <Route 
              key={index}
              path={route.path}
              element={<route.component />} 
            />
          ))}
        </Routes>
      </Suspense>
    </ContextWrapper>
  );
};


export default App;
