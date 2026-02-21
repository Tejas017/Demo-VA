import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomeScreen from "./components/HomeScreen";
import ContactUs from "./components/ContactUs";
import Appointments from "./components/Appointments";
import Profile from "./components/Profile";
import VoiceAssistant from "./components/VoiceAssistant";
import VoiceTextAreas from "./components/VoiceTextAreas";
import MarqueeCommands from "./components/MarqueeCommands";
import "./App.css";
import Navbar from "./components/Navbar";
import MicWidget from "./components/MicWidget";

function App() {
  return (
    <Router>
      <VoiceAssistant />
      <MicWidget />
      <div style={styles.container}>
        <Navbar style={styles.navbar} />
        {/* <MarqueeCommands /> */}
        <div style={styles.content}>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/Home" element={<HomeScreen />} />
            <Route path="/Contact" element={<ContactUs />} />
            <Route path="/Appointments" element={<Appointments />} />
            <Route path="/Summary" element={<VoiceTextAreas />} />
            <Route path="/Profile" element={<Profile />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
  },
  content: {
    flex: 1,
    padding: 20,
  },
};
