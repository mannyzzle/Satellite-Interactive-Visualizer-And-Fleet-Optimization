import React from 'react';
import './App.css';
import Header from './components/Header';
import SatelliteList from './components/SatelliteList';

function App() {
  return (
    <div className="App">
      <Header />
      <main>
        <SatelliteList />
      </main>
    </div>
  );
}

export default App;
