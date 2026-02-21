import React, { useEffect, useRef, useState } from "react";
import "./VoiceTextAreas.css";

/**
 * VoiceTextAreas
 * - Renders three textareas (Notes, Summary, Message)
 * - Allows dictation into any textarea via existing WebSocket transcript events
 * - Shows live UI indicators when a textarea is being transcribed
 * - Supports spoken control: "continue in NOTES" to resume dictation in the given area
 * - Appends text on resume rather than replacing
 *
 * Integration notes:
 * - This component listens for `transcript` events on window.dispatchEvent new CustomEvent('voice-transcript', {detail: {text, final}})
 * - Your `VoiceAssistant.jsx` already processes transcripts; it should emit to window when transcripts arrive
 *
 */

const AREAS = [
  { key: "notes", label: "Notes" },
  { key: "summary", label: "Summary" },
  { key: "message", label: "Message" },
];

export default function VoiceTextAreas() {
  const [activeArea, setActiveArea] = useState("notes");
  const [transcribingArea, setTranscribingArea] = useState(null);
  const [contents, setContents] = useState({
    notes: "",
    summary: "",
    message: "",
  });
  const [isTranscribing, setIsTranscribing] = useState(false);
  const textRefs = useRef({ notes: null, summary: null, message: null });

  // Utility to append text to an area
  const appendToArea = (key, text) => {
    setContents((prev) => ({
      ...prev,
      [key]:
        prev[key] + (prev[key] && !prev[key].endsWith(" ") ? " " : "") + text,
    }));
  };

  // Handle incoming transcripts from VoiceAssistant
  useEffect(() => {
    const handler = (e) => {
      const { text, final } = e.detail || {};
      if (!text) return;

      // If we are currently transcribing an area, append live partials to a visual only state
      const target = transcribingArea || activeArea;
      if (!target) return;

      // For partials, show a temporary overlay; for final, commit to textarea
      if (!final) {
        setIsTranscribing(true);
        setTranscribingArea(target);
        // show live overlay using dataset or state (we'll just set contents temporarily)
        // We'll not mutate the real contents on partials to avoid rewriting
        // Optionally you could keep a separate partial state
      } else {
        // Final - append to the target area and clear transcribing state
        appendToArea(target, text.trim());
        setIsTranscribing(false);
        setTranscribingArea(null);

        // After final commit, we remain on same active area to allow continuation
      }
    };

    window.addEventListener("voice-transcript", handler);
    return () => window.removeEventListener("voice-transcript", handler);
  }, [transcribingArea, activeArea]);

  // Listen for spoken control commands dispatched by voice assistant
  useEffect(() => {
    const ctrl = (e) => {
      const txt = (e.detail && e.detail.text) || "";
      if (!txt) return;
      const m = txt.match(/continue in (notes|summary|message)/i);
      if (m) {
        const key = m[1].toLowerCase();
        setActiveArea(key);
        // Indicate UI feedback
        setTranscribingArea(key);
        setIsTranscribing(true);
        // Focus the textarea
        setTimeout(() => {
          textRefs.current[key] && textRefs.current[key].focus();
        }, 50);
      }
    };
    window.addEventListener("voice-control", ctrl);
    return () => window.removeEventListener("voice-control", ctrl);
  }, []);

  // UI helpers
  const handleManualChange = (k, v) => {
    setContents((prev) => ({ ...prev, [k]: v }));
  };

  return (
    <div className="vta-container">
      <div className="vta-header">
        <h3>Dictation Areas</h3>
        <div className="vta-actions">
          <label className="vta-active">
            Active: {AREAS.find((a) => a.key === activeArea).label}
          </label>
          <div className="vta-indicators">
            {isTranscribing ? (
              <span className="vta-badge transcribing">
                Transcribing:{" "}
                {transcribingArea &&
                  AREAS.find((a) => a.key === transcribingArea).label}
              </span>
            ) : (
              <span className="vta-badge idle">Idle</span>
            )}
          </div>
        </div>
      </div>

      <div className="vta-grid">
        {AREAS.map((area) => (
          <div
            key={area.key}
            className={`vta-box ${activeArea === area.key ? "active" : ""}`}
          >
            <div className="vta-box-header">
              <strong>{area.label}</strong>
              <div>
                <button
                  onClick={() => {
                    setActiveArea(area.key);
                    textRefs.current[area.key] &&
                      textRefs.current[area.key].focus();
                  }}
                  className="vta-btn"
                >
                  Make active
                </button>
                <button
                  onClick={() => {
                    setContents((prev) => ({ ...prev, [area.key]: "" }));
                  }}
                  className="vta-btn danger"
                >
                  Clear
                </button>
              </div>
            </div>

            <textarea
              ref={(el) => (textRefs.current[area.key] = el)}
              name={area.key}
              id={area.key}
              value={contents[area.key]}
              placeholder={`Dictate to ${area.label}...`}
              onChange={(e) => handleManualChange(area.key, e.target.value)}
              rows={8}
            />

            {transcribingArea === area.key && isTranscribing ? (
              <div className="vta-live-overlay">
                Listening... (say 'stop' to finish, 'continue in {area}' to
                resume)
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <small>
          Say "continue in notes" or "continue in summary" or "continue in
          message" to resume dictation in that area. Dictation appends text
          rather than replacing.
        </small>
      </div>
    </div>
  );
}
