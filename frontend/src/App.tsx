import { useState } from 'react';
import WelcomePage from './WelcomePage';
import SimView from './SimView';
import './App.css';

export default function App() {
  const [entered, setEntered] = useState(false);

  return (
    <div className="app">
      {entered ? (
        <div className="fade-in" key="sim">
          <SimView onExit={() => setEntered(false)} />
        </div>
      ) : (
        <WelcomePage onLaunch={() => setEntered(true)} />
      )}
    </div>
  );
}
