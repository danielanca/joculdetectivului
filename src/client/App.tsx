import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ContextWrapper } from "./Context";


import routes from "./routes/routes";

export const App = () => {
  return (
    <ContextWrapper>
      <Routes>
        {routes.map((route, index) => (
            <Route 
                key={index}
                path={route.path}
                element={ <route.component /> }
            />
        ))}
      </Routes>
    </ContextWrapper>
  );
};

export default App;
