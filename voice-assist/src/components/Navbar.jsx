import React from "react";
import { Link } from "react-router-dom";
import LogoImg from "../assets/prognocis-logo 1.jpg";
import VoiceAssistantSettings from "./VoiceAssistantSettings";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning 😊";
  if (hour < 18) return "Good Afternoon 😉";
  return "Good Evening 🙂";
};

const Navbar = () => {
  return (
    <nav style={styles.nav}>
      <div style={styles.greeting}>
        <Link to="/">
          <img
            src={LogoImg}
            alt="Logo"
            style={{ width: "100px", height: "25px", marginRight: "15px" }}
          />
        </Link>
        {getGreeting()}
      </div>
      <div style={styles.links}>
        <Link to="/Home" style={styles.link}>
          Home
        </Link>
        <Link to="/Appointments" style={styles.link}>
          Appointment
        </Link>
        <Link to="/Contact" style={styles.link}>
          Contact Us
        </Link>
        <Link to="/Summary" style={styles.link}>
          Summary
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <VoiceAssistantSettings />

        <div style={styles.profile}>
          <Link to="/Profile" style={styles.link}>
            <img
              src="https://ui-avatars.com/api/?name=TY"
              alt="Profile"
              style={styles.profileImg}
            />
          </Link>
        </div>
      </div>
    </nav>
  );
};

const styles = {
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 2rem",
    background: "#1976d2",
    color: "#fff",
  },
  greeting: {
    fontSize: "1.2rem",
    fontWeight: "bold",
  },
  links: {
    display: "flex",
    gap: "1.5rem",
  },
  link: {
    color: "#fff",
    textDecoration: "none",
    fontSize: "1rem",
    fontWeight: "500",
  },
  profile: {
    display: "flex",
    alignItems: "center",
  },
  profileImg: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "2px solid #fff",
  },
};

export default Navbar;
