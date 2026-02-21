import React, { useState } from "react";
import { FaMicrophone, FaStop, FaPause } from "react-icons/fa";
import { useVoiceAssistant } from "../contexts/VoiceAssistantContext";

export default function MicWidget() {
  const { listening, setListening, wakeWord, hotkey, paused } =
    useVoiceAssistant();

  const [showInfo, setShowInfo] = useState(false);
  const [infoShown, setInfoShown] = useState(false);

  const handleClick = () => {
    if (!infoShown) {
      // First click ever - show info
      setShowInfo(true);
      setInfoShown(true);
    } else if (showInfo) {
      // Info is currently showing, close it and start assistant
      setShowInfo(false);
      setListening(true);
    } else {
      // Normal toggle (start/stop assistant)
      setListening((s) => !s);
    }
  };

  const handleInfoClose = () => {
    setShowInfo(false);
  };

  return (
    <div className="mic-widget">
      <button
        className={`mic-button${
          listening ? (paused ? " paused" : " listening") : " stopped"
        }`}
        onClick={handleClick}
        title={
          !infoShown && !listening
            ? "Click to see info"
            : listening
            ? paused
              ? "Paused - Say wake word or press hotkey"
              : "Click to stop"
            : "Click to start"
        }
      >
        {listening ? (
          paused ? (
            <FaPause size={32} />
          ) : (
            <FaMicrophone size={32} />
          )
        ) : (
          <FaMicrophone size={32} />
        )}
      </button>

      {listening && paused && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 80,
            background: "#ff9800",
            color: "#fff",
            padding: "0.5rem 1rem",
            borderRadius: 8,
            fontSize: "0.85rem",
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            zIndex: 1000,
            whiteSpace: "nowrap",
          }}
        >
          ⏸️ Transcription Stopped
        </div>
      )}

      {showInfo && !listening && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            right: 24,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            padding: "1.5rem",
            zIndex: 1001,
            minWidth: 300,
            maxWidth: 400,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <h3 style={{ margin: 0, color: "#1976d2", fontSize: "1.2rem" }}>
              🎤 Voice Assistant
            </h3>
            <button
              onClick={handleInfoClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.5rem",
                cursor: "pointer",
                color: "#999",
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <div
              style={{
                background: "#f0f7ff",
                padding: "0.75rem",
                borderRadius: 8,
                marginBottom: "0.75rem",
                border: "2px solid #b3d9ff",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: "#1976d2" }}>
                Ready to Start
              </p>
            </div>

            <div style={{ fontSize: "0.9rem", color: "#555", lineHeight: 1.6 }}>
              <p style={{ margin: "0.5rem 0" }}>
                <strong>Wake Word:</strong> "{wakeWord}"
              </p>
              <p style={{ margin: "0.5rem 0" }}>
                <strong>Pause Hotkey:</strong> {hotkey}
              </p>
            </div>
          </div>

          <div
            style={{
              background: "#f0f7ff",
              padding: "0.75rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              color: "#555",
              marginBottom: "1rem",
            }}
          >
            <p
              style={{ margin: "0.25rem 0", fontWeight: 600, color: "#1976d2" }}
            >
              📋 How to use:
            </p>
            <p style={{ margin: "0.25rem 0" }}>
              1️⃣ Click mic button again to start
            </p>
            <p style={{ margin: "0.25rem 0" }}>2️⃣ Say "{wakeWord}" to begin</p>
            <p style={{ margin: "0.25rem 0" }}>3️⃣ Speak your message (10s)</p>
            <p style={{ margin: "0.25rem 0" }}>4️⃣ Press {hotkey} to pause</p>
            <p style={{ margin: "0.25rem 0" }}>5️⃣ Click mic button to stop</p>
          </div>

          <div
            style={{
              background: "#fff3e0",
              border: "1px solid #ffb74d",
              borderRadius: 8,
              padding: "0.75rem",
              fontSize: "0.85rem",
              color: "#e65100",
            }}
          >
            <p style={{ margin: 0 }}>
              💡 <strong>Tip:</strong> Customize wake word and hotkey in navbar
              settings
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
