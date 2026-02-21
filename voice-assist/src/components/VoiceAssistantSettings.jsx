import React, { useState } from "react";
import { useVoiceAssistant } from "../contexts/VoiceAssistantContext";

export default function VoiceAssistantSettings() {
  const {
    wakeWord,
    setWakeWord,
    hotkey,
    setHotkey,
    sttProvider,
    setSttProvider,
  } = useVoiceAssistant();
  const { language, setLanguage } = useVoiceAssistant();

  const [isOpen, setIsOpen] = useState(false);
  const [tempWakeWord, setTempWakeWord] = useState(wakeWord);
  const [tempHotkey, setTempHotkey] = useState(hotkey);
  const [tempSttProvider, setTempSttProvider] = useState(
    sttProvider || "whisper"
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setWakeWord(tempWakeWord);
    setHotkey(tempHotkey);
    setSttProvider(tempSttProvider);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    console.log(
      "✅ Settings saved - Wake Word:",
      tempWakeWord,
      "Hotkey:",
      tempHotkey
    );
  };

  const handleReset = () => {
    const defaultWakeWord = "Java";
    const defaultHotkey = "F9";
    setTempWakeWord(defaultWakeWord);
    setTempHotkey(defaultHotkey);
    setWakeWord(defaultWakeWord);
    setHotkey(defaultHotkey);
    console.log("🔄 Settings reset to defaults");
  };

  const handleKeyCapture = (e) => {
    e.preventDefault();
    const key = e.key.toUpperCase();
    if (key.length === 1 || key.startsWith("F")) {
      setTempHotkey(key);
    }
  };

  return (
    <>
      {/* Settings Button in Navbar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "2px solid #fff",
          borderRadius: 8,
          color: "#fff",
          padding: "clamp(0.4rem, 2vw, 0.6rem) clamp(0.8rem, 3vw, 1.2rem)",
          cursor: "pointer",
          fontSize: "clamp(0.8rem, 2vw, 1rem)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "clamp(4px, 1vw, 8px)",
          transition: "all 0.2s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(255,255,255,0.3)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "rgba(255,255,255,0.2)";
        }}
      >
        <span style={{ fontSize: "clamp(1rem, 2.5vw, 1.2rem)" }}>🎤</span>
        <span style={{ display: window.innerWidth < 500 ? "none" : "inline" }}>
          Voice Settings
        </span>
      </button>

      {/* Settings Modal */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(1rem, 3vw, 2rem)",
            overflowY: "auto",
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "clamp(12px, 2vw, 20px)",
              padding: "clamp(1.5rem, 4vw, 2.5rem)",
              maxWidth: "min(600px, 95vw)",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              margin: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "clamp(1rem, 3vw, 1.5rem)",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <h2
                style={{
                  color: "#1976d2",
                  margin: 0,
                  fontSize: "clamp(1.2rem, 4vw, 1.8rem)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span>🎤</span> Voice Assistant Settings
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "clamp(1.2rem, 4vw, 1.8rem)",
                  cursor: "pointer",
                  color: "#999",
                  padding: "0.25rem",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Wake Word Setting */}
            <div style={{ marginBottom: "clamp(1rem, 3vw, 1.5rem)" }}>
              <label
                style={{
                  display: "block",
                  color: "#333",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                  fontSize: "clamp(0.9rem, 2.5vw, 1rem)",
                }}
              >
                Wake Word
              </label>
              <input
                type="text"
                value={tempWakeWord}
                onChange={(e) => setTempWakeWord(e.target.value)}
                placeholder="e.g., Hey Assistant, Java, Computer"
                style={{
                  width: "100%",
                  padding: "clamp(0.6rem, 2vw, 0.85rem)",
                  border: "2px solid #e0e0e0",
                  borderRadius: "clamp(6px, 1.5vw, 10px)",
                  fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)",
                  outline: "none",
                  transition: "border 0.2s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#1976d2";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#e0e0e0";
                }}
              />
              <p
                style={{
                  fontSize: "clamp(0.75rem, 2vw, 0.9rem)",
                  color: "#666",
                  marginTop: "0.25rem",
                }}
              >
                Say this word to activate voice transcription
              </p>
            </div>

            {/* Language / Accent Setting */}
            <div style={{ marginBottom: "clamp(1rem, 3vw, 1.5rem)" }}>
              <label
                style={{
                  display: "block",
                  color: "#333",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                  fontSize: "clamp(0.9rem, 2.5vw, 1rem)",
                }}
              >
                Recognition Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{
                  width: "100%",
                  padding: "clamp(0.6rem, 2vw, 0.85rem)",
                  border: "2px solid #e0e0e0",
                  borderRadius: "clamp(6px, 1.5vw, 10px)",
                  fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)",
                  outline: "none",
                  transition: "border 0.2s",
                  boxSizing: "border-box",
                }}
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="es-ES">Español (ES)</option>
                <option value="fr-FR">Français (FR)</option>
                <option value="de-DE">Deutsch (DE)</option>
                <option value="hi-IN">Hindi (IN)</option>
                <option value="zh-CN">中文 (简体)</option>
                <option value="ja-JP">日本語 (JP)</option>
              </select>
              <p
                style={{
                  fontSize: "clamp(0.75rem, 2vw, 0.9rem)",
                  color: "#666",
                  marginTop: "0.25rem",
                }}
              >
                Select the language/accent used for wake-word and transcription.
              </p>
            </div>

            {/* STT Provider Selection */}
            <div style={{ marginBottom: "clamp(1rem, 3vw, 1.5rem)" }}>
              <label
                style={{
                  display: "block",
                  color: "#333",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                  fontSize: "clamp(0.9rem, 2.5vw, 1rem)",
                }}
              >
                Speech-To-Text Provider
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "clamp(6px, 1.5vw, 12px)",
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() => setTempSttProvider("whisper")}
                  style={{
                    flex: "1 1 120px",
                    minWidth: 0,
                    padding: "clamp(0.5rem, 2vw, 0.7rem)",
                    borderRadius: "clamp(6px, 1.5vw, 10px)",
                    border:
                      tempSttProvider === "whisper"
                        ? "2px solid #1976d2"
                        : "2px solid #e0e0e0",
                    background:
                      tempSttProvider === "whisper" ? "#e8f0fe" : "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "clamp(0.8rem, 2vw, 0.95rem)",
                    transition: "all 0.2s",
                  }}
                >
                  Whisper (Local)
                </button>
                <button
                  onClick={() => setTempSttProvider("webspeech")}
                  style={{
                    flex: "1 1 120px",
                    minWidth: 0,
                    padding: "clamp(0.5rem, 2vw, 0.7rem)",
                    borderRadius: "clamp(6px, 1.5vw, 10px)",
                    border:
                      tempSttProvider === "webspeech"
                        ? "2px solid #1976d2"
                        : "2px solid #e0e0e0",
                    background:
                      tempSttProvider === "webspeech" ? "#e8f0fe" : "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "clamp(0.8rem, 2vw, 0.95rem)",
                    transition: "all 0.2s",
                  }}
                >
                  Web Speech API (Browser)
                </button>
              </div>
              <p
                style={{
                  fontSize: "clamp(0.75rem, 2vw, 0.9rem)",
                  color: "#666",
                  marginTop: "0.25rem",
                }}
              >
                Choose the STT provider: browser API (low-latency) or local
                Whisper (higher quality).
              </p>
            </div>

            {/* Hotkey Setting */}
            <div style={{ marginBottom: "clamp(1rem, 3vw, 1.5rem)" }}>
              <label
                style={{
                  display: "block",
                  color: "#333",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                  fontSize: "clamp(0.9rem, 2.5vw, 1rem)",
                }}
              >
                Pause Hotkey
              </label>
              <input
                type="text"
                value={tempHotkey}
                onKeyDown={handleKeyCapture}
                placeholder="Press a key (e.g., F9, P, Space)"
                readOnly
                style={{
                  width: "100%",
                  padding: "clamp(0.6rem, 2vw, 0.85rem)",
                  border: "2px solid #e0e0e0",
                  borderRadius: "clamp(6px, 1.5vw, 10px)",
                  fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)",
                  outline: "none",
                  cursor: "pointer",
                  background: "#f9f9f9",
                  transition: "border 0.2s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#1976d2";
                  e.target.style.background = "#fff";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#e0e0e0";
                  e.target.style.background = "#f9f9f9";
                }}
              />
              <p
                style={{
                  fontSize: "clamp(0.75rem, 2vw, 0.9rem)",
                  color: "#666",
                  marginTop: "0.25rem",
                }}
              >
                Press this key to pause transcription and return to wake word
                listening
              </p>
            </div>

            {/* Current Settings Info */}
            <div
              style={{
                background: "#f0f7ff",
                border: "1px solid #b3d9ff",
                borderRadius: "clamp(6px, 1.5vw, 10px)",
                padding: "clamp(0.8rem, 2.5vw, 1.2rem)",
                marginBottom: "clamp(1rem, 3vw, 1.5rem)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "clamp(0.8rem, 2.2vw, 0.95rem)",
                  color: "#333",
                  wordBreak: "break-word",
                }}
              >
                <strong>Current:</strong> Wake: "{wakeWord}" | Hotkey: {hotkey}{" "}
                | STT: {sttProvider}
              </p>
            </div>

            {/* Success Message */}
            {saved && (
              <div
                style={{
                  background: "#4caf50",
                  color: "#fff",
                  padding: "clamp(0.6rem, 2vw, 0.85rem)",
                  borderRadius: "clamp(6px, 1.5vw, 10px)",
                  marginBottom: "clamp(0.8rem, 2vw, 1.2rem)",
                  textAlign: "center",
                  fontWeight: 600,
                  fontSize: "clamp(0.85rem, 2.2vw, 1rem)",
                }}
              >
                ✅ Settings saved successfully!
              </div>
            )}

            {/* Action Buttons */}
            <div
              style={{
                display: "flex",
                gap: "clamp(0.6rem, 2vw, 1rem)",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={handleSave}
                style={{
                  flex: "1 1 120px",
                  minWidth: 0,
                  background:
                    "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "clamp(6px, 1.5vw, 10px)",
                  padding: "clamp(0.6rem, 2vw, 0.85rem)",
                  fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(25,118,210,0.3)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 4px 12px rgba(25,118,210,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "0 2px 8px rgba(25,118,210,0.3)";
                }}
              >
                💾 Save
              </button>
              <button
                onClick={handleReset}
                style={{
                  flex: "1 1 120px",
                  minWidth: 0,
                  background: "#fff",
                  color: "#666",
                  border: "2px solid #e0e0e0",
                  borderRadius: "clamp(6px, 1.5vw, 10px)",
                  padding: "clamp(0.6rem, 2vw, 0.85rem)",
                  fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.target.style.borderColor = "#ff9800";
                  e.target.style.color = "#ff9800";
                }}
                onMouseLeave={(e) => {
                  e.target.style.borderColor = "#e0e0e0";
                  e.target.style.color = "#666";
                }}
              >
                🔄 Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
