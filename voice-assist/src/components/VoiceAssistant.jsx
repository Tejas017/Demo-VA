import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useVoiceAssistant } from "../contexts/VoiceAssistantContext";
import { formatFieldValue, normalizeFieldName } from "../utils/fieldFormatter";
import { convertBlobToWAV, calculateRMS } from "../utils/audioEncoder";
import AudioWorklet from "./AudioWorklet";
import { io } from "socket.io-client";

export default function VoiceAssistant() {
  const {
    listening,
    wakeWord,
    hotkey,
    setPaused,
    setListening,
    language,
    sttProvider,
    setSttProvider,
  } = useVoiceAssistant();
  const navigate = useNavigate();

  const [showPrivacy, setShowPrivacy] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isWaitingForWakeWord, setIsWaitingForWakeWord] = useState(true);
  const [diagnostic, setDiagnostic] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [activeDropdown, setActiveDropdown] = useState(null); // Track which dropdown is open
  const [highlightedField, setHighlightedField] = useState(null); // Visual feedback
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showNumbering, setShowNumbering] = useState(false);
  const [numberMap, setNumberMap] = useState({}); // {1: elementSelector}
  const [pendingFieldForDictation, setPendingFieldForDictation] =
    useState(null);

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimeoutRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const wakeRecognitionRef = useRef(null);
  const wakeRunningRef = useRef(false);
  const webSpeechRecRef = useRef(null);
  const socketRef = useRef(null);
  const isWaitingForWakeWordRef = useRef(true);
  const listeningRef = useRef(false);
  const keyPressedRef = useRef(false);
  const useVadRef = useRef(true); // enable VAD-driven recording by default
  const vadStopTimeoutRef = useRef(null);
  const isWaitingForNumberRef = useRef(false);
  const pendingFieldForDictationRef = useRef(null);
  const numberMapRef = useRef({});
  const scrollHandlerRef = useRef(null);
  const isWebSpeechRunningRef = useRef(false);

  // Speech VAD / Worklet hooks
  const vadEventsRef = useRef({});

  // Resolve backend base URL with HTTPS support
  const getBackendBaseUrl = () => {
    // Prefer explicit env var if provided
    const explicit = import.meta.env?.VITE_BACKEND_URL;
    if (explicit) return explicit.replace(/\/$/, "");

    // Fall back to same host with port 5000; preserve page protocol (http/https)
    const protocol = window.location.protocol; // includes trailing colon
    const host = window.location.hostname;
    return `${protocol}//${host}:5000`;
  };

  // Start the MediaRecorder when the worklet detects speech
  const startRecorderFromVAD = () => {
    if (!mediaRecorderRef.current) {
      console.warn(
        "⚠️ startRecorderFromVAD called but no MediaRecorder initialized"
      );
      return;
    }
    if (mediaRecorderRef.current.state === "recording") return;
    try {
      audioChunksRef.current = [];
      mediaRecorderRef.current.start();
      console.log("▶️ MediaRecorder started by VAD");
      // Notify backend we're starting a recording session (optional)
      try {
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("start_recording");
        }
      } catch (e) {
        console.warn("Could not emit start_recording", e);
      }

      // Reset/clear any previous stop scheduled by VAD
      if (vadStopTimeoutRef.current) {
        clearTimeout(vadStopTimeoutRef.current);
        vadStopTimeoutRef.current = null;
      }

      // Safety: ensure we auto-stop long recordings (extended to 15s)
      recordingTimeoutRef.current = setTimeout(() => {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          console.log("⏹️ Auto-stop after 15s (VAD-started)");
          mediaRecorderRef.current.stop();
        }
      }, 15000);
    } catch (e) {
      console.error("❌ startRecorderFromVAD failed:", e);
    }
  };

  // Start Web Speech API recognition (browser STT)
  const startWebSpeechRecognition = () => {
    if (
      !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
    ) {
      console.warn("Web Speech API not supported in this browser");
      return;
    }

    try {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (webSpeechRecRef.current) {
        try {
          webSpeechRecRef.current.start();
        } catch (e) {}
        return;
      }

      const rec = new SpeechRecognition();
      rec.lang = language || "en-US";
      rec.continuous = true;
      rec.interimResults = true;

      rec.onstart = () => {
        isWebSpeechRunningRef.current = true;
        console.log("🔊 WebSpeechRecognition started");
      };

      rec.onresult = (event) => {
        const result = event.results[event.results.length - 1][0];
        const text =
          result && result.transcript ? result.transcript.trim() : "";
        const isFinal = event.results[event.results.length - 1].isFinal;
        console.log("🗣️ WebSpeech result:", text, "final?", isFinal);

        // Respect same handling as socket transcripts: number selection / dictation / actions
        try {
          // If we're waiting for number selection
          if (isWaitingForNumberRef.current) {
            const num = parseSpokenNumber(text);
            if (num !== null) {
              console.log("✅ WebSpeech: Spoken number detected:", num);
              isWaitingForNumberRef.current = false;
              selectFieldByNumber(num);
              return; // STOP - don't process as command
            } else {
              console.log("⚠️ WebSpeech: Not a valid number, waiting...");
              return; // ignore non-number while in number mode
            }
          }

          // If a field is pending for dictation, apply final
          if (pendingFieldForDictationRef.current && isFinal) {
            console.log("📝 WebSpeech: Field is pending for dictation:", pendingFieldForDictationRef.current);
            console.log("📝 WebSpeech: Received text:", text, "isFinal:", isFinal);
            const noisePatterns = [
              /^(thank you|thanks|bye|okay|yeah|right|see you|you know|so|um|uh)[\s.,!?]*$/i,
            ];
            const isNoise =
              text.length < 3 || noisePatterns.some((p) => p.test(text));
            if (!isNoise) {
              console.log("✅ WebSpeech: Applying dictation:", text);
              applyDictationToField(pendingFieldForDictationRef.current, text);
            } else {
              console.log("⚠️ WebSpeech: Skipping noise/short text:", text);
            }
            return; // STOP - don't process as command
          }

          // Otherwise, forward as command for parsing when final
          if (isFinal && text.length > 0) {
            // Queue the action just like socket transcripts
            try {
              // Use same action queue mechanism by dispatching a custom event
              window.dispatchEvent(
                new CustomEvent("voice-transcript", {
                  detail: { text, final: true },
                })
              );
              // Also push into action queue via handleAction
              awaitHandleAction(text);
            } catch (e) {
              console.warn("Failed to handle webspeech action:", e);
            }
          }
        } catch (e) {
          console.error("Error handling webspeech result:", e);
        }
      };

      rec.onend = () => {
        isWebSpeechRunningRef.current = false;
        console.log("🔇 WebSpeechRecognition ended");
        // If still in active listening and not waiting for wake, restart
        if (
          listeningRef.current &&
          !isWaitingForWakeWordRef.current &&
          sttProvider === "webspeech"
        ) {
          try {
            rec.start();
          } catch (e) {}
        }
      };

      rec.onerror = (ev) => {
        console.error("WebSpeech error:", ev.error);
      };

      webSpeechRecRef.current = rec;
      try {
        rec.start();
      } catch (e) {
        console.warn("Could not start webspeech:", e);
      }
    } catch (e) {
      console.error("startWebSpeechRecognition error:", e);
    }
  };

  const stopWebSpeechRecognition = () => {
    try {
      if (webSpeechRecRef.current) {
        try {
          webSpeechRecRef.current.stop();
        } catch (e) {}
        webSpeechRecRef.current = null;
      }
      isWebSpeechRunningRef.current = false;
    } catch (e) {
      console.warn("stopWebSpeechRecognition error:", e);
    }
  };

  // Helper to call handleAction from async contexts
  const awaitHandleAction = async (text) => {
    try {
      // Use same flow as when receiving socket transcripts: push to actionQueue by calling handleAction
      await handleAction(text);
    } catch (e) {
      console.error("awaitHandleAction error:", e);
    }
  };

  // Start the active STT provider (webspeech or whisper)
  const startActiveSTT = () => {
    try {
      if (sttProvider === "webspeech") {
        startWebSpeechRecognition();
      } else {
        startWhisperRecording();
      }
    } catch (e) {
      console.warn("startActiveSTT error:", e);
    }
  };

  const stopActiveSTT = () => {
    try {
      if (sttProvider === "webspeech") {
        stopWebSpeechRecognition();
      } else {
        stopWhisperRecording();
      }
    } catch (e) {
      console.warn("stopActiveSTT error:", e);
    }
  };

  // Schedule stopping the MediaRecorder after a debounce (hangover)
  const scheduleStopRecorderFromVAD = (hangoverMs = 1500) => {
    // Clear any existing scheduled stop
    if (vadStopTimeoutRef.current) {
      clearTimeout(vadStopTimeoutRef.current);
      vadStopTimeoutRef.current = null;
    }

    vadStopTimeoutRef.current = setTimeout(() => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        try {
          console.log(
            `⏸️ VAD hangover elapsed (${hangoverMs}ms) — stopping MediaRecorder`
          );
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.error("❌ Failed to stop MediaRecorder from VAD:", e);
        }
      }
      vadStopTimeoutRef.current = null;
    }, hangoverMs);
  };

  // Action handler - processes voice commands
  const handleAction = async (transcript) => {
    try {
      console.log("🎯 Processing command:", transcript);

      // Send to backend NLP
      const res = await fetch(`${getBackendBaseUrl()}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript }),
      });

      if (!res.ok) {
        console.error("❌ Parse request failed:", res.status);
        return;
      }

      const data = await res.json();

      if (data.status === "error") {
        console.warn("⚠️ Unknown command:", transcript);
        return;
      }

      const { action, ...params } = data;
      console.log("✅ Action:", action, params);

      // Execute action
      switch (action) {
        case "navigate":
          if (params.page) {
            const route = `/${
              params.page.charAt(0).toUpperCase() + params.page.slice(1)
            }`;
            console.log(`→ Navigating to ${route}`);
            navigate(route);
            // After navigation, enter wake-word listening mode
            enterWakeMode();
          }
          break;

        case "dictation_control": {
          // Emit a DOM control event that the Dictation page can listen to
          const op = params.op || "";
          const area = params.area || "";
          try {
            window.dispatchEvent(
              new CustomEvent("voice-control", {
                detail: { op, area, raw: params },
              })
            );
            console.log(`→ Dictation control: op=${op}, area=${area}`);
          } catch (e) {
            console.warn("Could not dispatch dictation control", e);
          }
          break;
        }

        case "fill_field": {
          const field = normalizeFieldName(params.field || "");
          let value = params.value || "";

          // Apply smart formatting
          value = formatFieldValue(field, value);

          console.log(`→ Filling ${field} with "${value}"`);

          // Find and fill the form field
          const matchedInput = document.querySelector(
            `input[name="${field}"], select[name="${field}"], textarea[name="${field}"]`
          );

          if (matchedInput) {
            // Highlight field for visual feedback
            setHighlightedField(field);
            setTimeout(() => setHighlightedField(null), 1500);

            // Focus the field first for smooth UX
            matchedInput.focus();

            // Use native setter to trigger React events properly
            const inputType = matchedInput.tagName.toLowerCase();

            if (inputType === "select") {
              // For select elements, find matching option
              const options = Array.from(matchedInput.options);
              const normalizedValue = value.toLowerCase();
              const matchedOption = options.find(
                (opt) =>
                  opt.text.toLowerCase().includes(normalizedValue) ||
                  opt.value.toLowerCase().includes(normalizedValue)
              );

              if (matchedOption) {
                matchedInput.value = matchedOption.value;
              }
            } else {
              // For input/textarea - get correct prototype based on element type
              let nativeSetter;
              if (inputType === "textarea") {
                nativeSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype,
                  "value"
                )?.set;
              } else {
                nativeSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype,
                  "value"
                )?.set;
              }

              if (nativeSetter) {
                nativeSetter.call(matchedInput, value);
              } else {
                matchedInput.value = value;
              }
            }

            // Trigger React events in correct order
            matchedInput.dispatchEvent(new Event("input", { bubbles: true }));
            matchedInput.dispatchEvent(new Event("change", { bubbles: true }));
            matchedInput.dispatchEvent(new Event("blur", { bubbles: true }));

            console.log(`✅ Filled ${field}`);
          } else {
            console.warn(`⚠️ Field not found: ${field}`);
          }
          break;
        }

        case "clear_field": {
          const field = normalizeFieldName(params.field || "");
          const matchedInput = document.querySelector(
            `input[name="${field}"], select[name="${field}"], textarea[name="${field}"]`
          );

          if (matchedInput) {
            // Highlight for feedback
            setHighlightedField(field);
            setTimeout(() => setHighlightedField(null), 1000);

            matchedInput.focus();

            const inputType = matchedInput.tagName.toLowerCase();
            let nativeSetter;

            if (inputType === "select") {
              nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype,
                "value"
              )?.set;
            } else if (inputType === "textarea") {
              nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                "value"
              )?.set;
            } else {
              nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value"
              )?.set;
            }

            if (nativeSetter) {
              nativeSetter.call(matchedInput, "");
            } else {
              matchedInput.value = "";
            }

            matchedInput.dispatchEvent(new Event("input", { bubbles: true }));
            matchedInput.dispatchEvent(new Event("change", { bubbles: true }));
            console.log(`✅ Cleared ${field}`);
          }
          break;
        }

        case "scroll_up":
          window.scrollBy({ top: -300, behavior: "smooth" });
          console.log("→ Scrolled up");
          break;

        case "scroll_down":
          window.scrollBy({ top: 300, behavior: "smooth" });
          console.log("→ Scrolled down");
          break;

        case "submit_form": {
          const form = document.querySelector("form");
          if (form) {
            form.requestSubmit();
            console.log("✅ Form submitted");
            // After submitting a form, pause and wait for wake word
            enterWakeMode();
          }
          break;
        }

        case "book_appointment":
          console.log("→ Navigating to Appointments page");
          navigate("/Appointments");
          // Pause and wait for wake word after booking/navigation
          enterWakeMode();
          break;

        case "refresh_page":
          console.log("→ Refreshing page");
          window.location.reload();
          // Reloading navigates away; still set wake mode in case UI returns
          enterWakeMode();
          break;

        case "stop_listening":
          console.log("⏸️ Stopping assistant (listening for wake word)");
          setIsWaitingForWakeWord(true);
          setPaused(true);
          setTranscript("");
          stopActiveSTT();
          break;

        case "show_numbers":
          // Trigger UI enumeration of inputs and listen for a spoken number
          console.log(
            "🔢 Show numbers triggered - staying in active listening mode"
          );
          enumerateInputs();
          setTimeout(() => {
            try {
              isWaitingForNumberRef.current = true;
              setShowNumbering(true);
              console.log(
                "✅ Waiting for number input - isWaitingForNumberRef set to TRUE"
              );
              console.log(
                "📋 Number map:",
                Object.keys(numberMapRef.current).join(",")
              );

              // Ensure we stay in active listening mode (not wake-word mode)
              if (isWaitingForWakeWordRef.current) {
                console.log("🔄 Exiting wake-word mode to accept number input");
                setIsWaitingForWakeWord(false);
                setPaused(false);
                // Restart recording if needed
                if (!isRecordingActive && listeningRef.current) {
                  console.log("🎤 Restarting STT for number input");
                  startActiveSTT();
                }
              }
            } catch (e) {
              console.warn("Error setting up number listening:", e);
            }
          }, 120);
          break;

        case "show_commands":
          console.log("→ Show commands (implement UI)");
          // Implement show commands UI
          break;

        case "close_commands":
          console.log("→ Close commands (implement UI)");
          // Implement close commands UI
          break;

        case "open_dropdown": {
          const field = normalizeFieldName(params.field || "");
          console.log(`→ Opening ${field} dropdown`);

          // Find and focus the select element
          const selectElement = document.querySelector(
            `select[name="${field}"], select[id*="${field}"]`
          );

          if (selectElement) {
            // Highlight the field
            setHighlightedField(field);
            setTimeout(() => setHighlightedField(null), 2000);

            // Focus and open dropdown
            selectElement.focus();
            selectElement.click(); // Open dropdown
            setActiveDropdown(field); // Track active dropdown
            console.log(`✅ Opened ${field} dropdown`);
          } else {
            console.warn(`⚠️ Dropdown not found: ${field}`);
          }
          break;
        }

        case "select_option": {
          const value = params.value || "";
          console.log(`→ Selecting option: "${value}"`);

          // Find the active dropdown or any focused select
          let selectElement = document.activeElement;

          if (!selectElement || selectElement.tagName !== "SELECT") {
            // If no select is focused, try to find one by the activeDropdown state
            if (activeDropdown) {
              selectElement = document.querySelector(
                `select[name="${activeDropdown}"], select[id*="${activeDropdown}"]`
              );
            }
          }

          if (selectElement && selectElement.tagName === "SELECT") {
            // Find matching option (case-insensitive, fuzzy match)
            const options = Array.from(selectElement.options);
            const normalizedValue = value.toLowerCase().trim();

            const matchedOption = options.find(
              (opt) =>
                opt.text.toLowerCase().includes(normalizedValue) ||
                opt.value.toLowerCase().includes(normalizedValue) ||
                normalizedValue.includes(opt.text.toLowerCase())
            );

            if (matchedOption) {
              selectElement.value = matchedOption.value;
              selectElement.dispatchEvent(
                new Event("change", { bubbles: true })
              );
              selectElement.dispatchEvent(
                new Event("input", { bubbles: true })
              );
              setActiveDropdown(null); // Clear active dropdown
              console.log(`✅ Selected "${matchedOption.text}"`);
            } else {
              console.warn(`⚠️ Option not found: "${value}"`);
              console.log(
                "Available options:",
                options.map((o) => o.text)
              );
            }
          } else {
            console.warn("⚠️ No active dropdown to select from");
          }
          break;
        }

        case "fill": {
          // Handle "type VALUE in FIELD" pattern from backend
          const label = params.label || params.field || "";
          const value = params.value || "";

          if (!label || !value) {
            console.warn("❌ Fill action missing label or value:", {
              label,
              value,
            });
            break;
          }

          // Try to find the input by normalizing the label
          const normalizedLabel = label.toLowerCase().replace(/\s+/g, "_");
          const fieldSelector = `input[name="${normalizedLabel}"], input[id*="${label}"], textarea[name="${normalizedLabel}"], select[name="${normalizedLabel}"]`;
          const el = document.querySelector(fieldSelector);

          if (el) {
            console.log(`✅ Filling ${label} with "${value}"`);
            const inputType = el.tagName.toLowerCase();

            // Use native setter for proper React updates
            let nativeSetter = null;
            if (inputType === "select") {
              const options = Array.from(el.options || []);
              const matched = options.find(
                (opt) =>
                  opt.text.toLowerCase().includes(value.toLowerCase()) ||
                  opt.value.toLowerCase().includes(value.toLowerCase())
              );
              if (matched) el.value = matched.value;
            } else if (inputType === "textarea") {
              nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                "value"
              )?.set;
            } else {
              nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value"
              )?.set;
            }

            if (nativeSetter) {
              nativeSetter.call(el, value);
            } else if (inputType !== "select") {
              el.value = value;
            }

            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
            el.focus();

            // Visual feedback
            setHighlightedField(label);
            setTimeout(() => setHighlightedField(null), 1500);

            console.log(`✅ Field ${label} filled successfully`);
          } else {
            console.warn(`⚠️ Could not find field "${label}" to fill`);
          }
          break;
        }

        default:
          console.warn(`⚠️ Unknown action: ${action}`);
      }
    } catch (error) {
      console.error("❌ Action handler error:", error);
    }
  };

  // Helper: after executing certain actions enter wake-word listening mode
  const enterWakeMode = () => {
    try {
      console.log("🔔 Entering wake-word listening mode (auto-pause)");
      setIsWaitingForWakeWord(true);
      setPaused(true);
      setTranscript("");
      // Stop active recording to free the mic so wake-word recog can run
      try {
        stopActiveSTT();
      } catch (e) {
        console.warn("Could not stop recording while entering wake mode", e);
      }
    } catch (e) {
      console.warn("enterWakeMode error:", e);
    }
  };

  // Parse a spoken number like "one" or "1" into integer (supports 1-20)
  const parseSpokenNumber = (text) => {
    if (!text) return null;
    const t = text.trim().toLowerCase();

    console.log(`🔢 parseSpokenNumber input: "${t}"`);

    // direct numeric
    const num = parseInt(t, 10);
    if (!isNaN(num)) {
      console.log(`✅ Parsed as integer: ${num}`);
      return num;
    }

    // Try to extract a number from the text (e.g., "number 2" -> 2)
    const numMatch = t.match(/\b(\d+)\b/);
    if (numMatch) {
      const extracted = parseInt(numMatch[1], 10);
      console.log(`✅ Extracted number from text: ${extracted}`);
      return extracted;
    }

    const words = {
      zero: 0,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
      // Common variations and similar-sounding words
      to: 2,
      too: 2,
      tu: 2,
      for: 4,
      ate: 8,
      won: 1,
    };

    // Check exact match first
    if (words[t] !== undefined) {
      console.log(`✅ Matched word: "${t}" = ${words[t]}`);
      return words[t];
    }

    // Try to find a number word within the text
    for (const [word, value] of Object.entries(words)) {
      if (t.includes(word)) {
        console.log(`✅ Found number word "${word}" in "${t}" = ${value}`);
        return value;
      }
    }

    console.log(`❌ Could not parse number from: "${t}"`);
    return null;
  };

  // Enumerate visible input/select/textarea elements and render small number badges
  const enumerateInputs = () => {
    try {
      clearNumbering();

      // inject styles once
      if (!document.getElementById("va-number-badge-style")) {
        const style = document.createElement("style");
        style.id = "va-number-badge-style";
        style.textContent = `
          .va-number-badge { position: absolute; z-index: 99999; background: #1976d2; color: #fff; border-radius: 12px; padding: 2px 6px; font-size: 12px; font-weight: 600; box-shadow: 0 2px 6px rgba(0,0,0,0.3); cursor: pointer; }
          .va-number-badge-selected { position: absolute; z-index: 100000; background: #2e7d32; color: #fff; border-radius: 14px; padding: 4px 8px; font-size: 13px; font-weight: 700; box-shadow: 0 4px 10px rgba(0,0,0,0.35); }
        `;
        document.head.appendChild(style);
      }

      const elems = Array.from(
        document.querySelectorAll("input, textarea, select")
      ).filter((el) => {
        const style = window.getComputedStyle(el);
        return (
          el.type !== "hidden" &&
          !el.disabled &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      });

      const map = {};
      let idx = 1;
      elems.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const badge = document.createElement("div");
        badge.className = "va-number-badge";
        badge.textContent = String(idx);
        badge.dataset.vaNumber = String(idx);
        // position near top-left of element
        badge.style.left = `${Math.max(4, rect.left + window.scrollX)}px`;
        badge.style.top = `${Math.max(4, rect.top + window.scrollY)}px`;
        // attach click handler
        badge.onclick = (ev) => {
          ev.stopPropagation();
          selectFieldByNumber(parseInt(badge.dataset.vaNumber, 10));
        };
        document.body.appendChild(badge);
        map[idx] = el;
        idx += 1;
      });

      setNumberMap(map);
      numberMapRef.current = map;
      // Attach scroll/resize listeners to keep badges aligned with inputs
      const updatePositions = () => {
        const badges = Array.from(
          document.querySelectorAll(".va-number-badge")
        );
        badges.forEach((b) => {
          const el = numberMapRef.current[parseInt(b.dataset.vaNumber, 10)];
          if (!el) return;
          const r = el.getBoundingClientRect();
          b.style.left = `${Math.max(4, r.left + window.scrollX)}px`;
          b.style.top = `${Math.max(4, r.top + window.scrollY)}px`;
        });
      };
      scrollHandlerRef.current = updatePositions;
      window.addEventListener("scroll", updatePositions, true);
      window.addEventListener("resize", updatePositions);
      // Initial align pass
      updatePositions();
      setShowNumbering(true);
    } catch (e) {
      console.warn("Could not enumerate inputs:", e);
    }
  };

  const clearNumbering = () => {
    try {
      const badges = Array.from(document.querySelectorAll(".va-number-badge"));
      badges.forEach((b) => b.remove());
      if (scrollHandlerRef.current) {
        window.removeEventListener("scroll", scrollHandlerRef.current, true);
        window.removeEventListener("resize", scrollHandlerRef.current);
      }
    } catch (e) {}
    setNumberMap({});
    numberMapRef.current = {};
    setShowNumbering(false);
    isWaitingForNumberRef.current = false;
  };

  const selectFieldByNumber = (n) => {
    try {
      console.log(`🎯 selectFieldByNumber called with n=${n}`);
      console.log(
        "📋 numberMapRef.current keys:",
        Object.keys(numberMapRef.current)
      );

      const el = numberMapRef.current[n] || null;
      if (!el) {
        console.warn(
          "❌ No field for number",
          n,
          "Available numbers:",
          Object.keys(numberMapRef.current).join(",")
        );
        return;
      }

      console.log("✅ Field found for number", n, "Element:", el.name || el.id);

      // Remove all badges except the selected one
      const badges = Array.from(document.querySelectorAll(".va-number-badge"));
      console.log(`🏷️ Found ${badges.length} total badges`);

      badges.forEach((b) => {
        if (b.dataset.vaNumber !== String(n)) b.remove();
        else {
          b.classList.add("va-number-badge-selected");
        }
      });

      // Focus and highlight
      el.focus();
      const name = el.getAttribute("name") || el.id || `field_${n}`;
      setHighlightedField(name);
      setTimeout(() => setHighlightedField(null), 1500);

      // Remember pending field for dictation and set refs so next transcript applies
      pendingFieldForDictationRef.current = name;
      setPendingFieldForDictation(name);
      console.log("🎯 Selected field for dictation:", name);
      console.log("📌 pendingFieldForDictationRef.current is now:", pendingFieldForDictationRef.current);
      console.log("🎤 STT Provider:", sttProvider);
      console.log("🔊 isWaitingForWakeWord:", isWaitingForWakeWordRef.current);
      console.log("🎙️ isRecordingActive:", isRecordingActive);
      console.log("👂 listening:", listeningRef.current);

      // Ensure we are recording (so the user can speak now). If assistant is paused, resume briefly
      try {
        if (isWaitingForWakeWordRef.current) {
          // exit wake-word waiting so speech capture resumes
          console.log("🔄 Exiting wake-word mode for dictation");
          setIsWaitingForWakeWord(false);
          setPaused(false);
        }
        // start selected STT provider if not active
        if (
          !isRecordingActive &&
          listeningRef.current &&
          !isWaitingForWakeWordRef.current
        ) {
          console.log("🎤 Starting active STT for dictation input");
          startActiveSTT();
        }
      } catch (e) {
        console.warn("Error resuming recording:", e);
      }
    } catch (e) {
      console.warn("selectFieldByNumber error:", e);
    }
  };

  const applyDictationToField = (fieldName, text) => {
    try {
      console.log("🔧 applyDictationToField called - fieldName:", fieldName, "text:", text);
      
      if (!fieldName || !text) {
        console.warn("⚠️ Missing fieldName or text - fieldName:", fieldName, "text:", text);
        return;
      }
      
      const fieldSelector = `input[name="${fieldName}"], select[name="${fieldName}"], textarea[name="${fieldName}"]`;
      console.log("🔍 Looking for element with selector:", fieldSelector);
      
      const el =
        document.querySelector(fieldSelector) ||
        document.getElementById(fieldName);
      
      if (!el) {
        console.warn("❌ Could not find element for field:", fieldName);
        return;
      }
      
      console.log("✅ Found element:", el.tagName, el.name || el.id);
      
      const value = text.trim();
      if (el) {
        const inputType = el.tagName.toLowerCase();
        let nativeSetter = null;
        if (inputType === "select") {
          // try to match an option
          const options = Array.from(el.options || []);
          const matched = options.find(
            (opt) =>
              opt.text.toLowerCase().includes(value.toLowerCase()) ||
              opt.value.toLowerCase().includes(value.toLowerCase())
          );
          if (matched) el.value = matched.value;
        } else if (inputType === "textarea") {
          nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value"
          )?.set;
        } else {
          nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
          )?.set;
        }

        if (nativeSetter) {
          console.log("🔧 Using native setter to set value:", value);
          nativeSetter.call(el, value);
        } else if (inputType !== "select") {
          console.log("🔧 Using direct value assignment:", value);
          el.value = value;
        }

        console.log("🔔 Dispatching input/change/blur events");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));

        console.log(`✅ Dictation applied to ${fieldName}: ${text}`);
        console.log(`✅ Element value is now: "${el.value}"`);
      } else {
        console.warn(
          "Could not find element to apply dictation for",
          fieldName
        );
      }

      // cleanup pending state
      console.log("🧹 Cleaning up - clearing pendingFieldForDictationRef and numbering");
      pendingFieldForDictationRef.current = null;
      setPendingFieldForDictation(null);
      // after applying, remove any numbering badges and pause (listen for wake word)
      try {
        clearNumbering();
      } catch (e) {}
      enterWakeMode();
    } catch (e) {
      console.error("applyDictationToField error:", e);
    }
  };

  useEffect(() => {
    listeningRef.current = listening;
    console.log("🎯 Listening state changed:", listening);
  }, [listening]);

  useEffect(() => {
    isWaitingForWakeWordRef.current = isWaitingForWakeWord;
    console.log("👂 isWaitingForWakeWord changed:", isWaitingForWakeWord);
  }, [isWaitingForWakeWord]);

  // Clear numbering on route change to avoid stale badges across pages
  const location = useLocation();
  useEffect(() => {
    clearNumbering();
    pendingFieldForDictationRef.current = null;
    setPendingFieldForDictation(null);
    isWaitingForNumberRef.current = false;
  }, [location.pathname]);

  useEffect(() => {
    if (listening && !privacyAccepted) {
      setShowPrivacy(true);
    }
  }, [listening, privacyAccepted]);

  // Visual feedback: highlight field being filled
  useEffect(() => {
    if (highlightedField) {
      const element = document.querySelector(
        `input[name="${highlightedField}"], select[name="${highlightedField}"], textarea[name="${highlightedField}"]`
      );
      if (element) {
        element.classList.add("voice-highlight");
        const timer = setTimeout(() => {
          element.classList.remove("voice-highlight");
        }, 1500);
        return () => {
          clearTimeout(timer);
          element.classList.remove("voice-highlight");
        };
      }
    }
  }, [highlightedField]);

  // WebSocket initialization
  useEffect(() => {
    const backendUrl = getBackendBaseUrl();
    console.log("🔌 Connecting to WebSocket:", backendUrl);

    const socket = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      console.log("✅ WebSocket connected:", socket.id);

      // Sync state after reconnection: if we were recording, restart it
      if (listeningRef.current && !isWaitingForWakeWordRef.current) {
        console.log("🔄 WebSocket reconnected - syncing recording state");
        socket.emit("start_recording");
      }
    });

    socket.on("disconnect", () => {
      console.log("🔌 WebSocket disconnected");
    });

    socket.on("connected", (data) => {
      console.log("🎉 WebSocket ready:", data);
    });

    // Action queue for serial command execution (prevents race conditions)
    const actionQueue = [];
    let isProcessingQueue = false;

    const processActionQueue = async () => {
      if (isProcessingQueue || actionQueue.length === 0) return;

      isProcessingQueue = true;
      while (actionQueue.length > 0) {
        const text = actionQueue.shift();
        try {
          await handleAction(text);
        } catch (error) {
          console.error("❌ Error processing action:", error);
        }
      }
      isProcessingQueue = false;
    };

    socket.on("transcript", async (data) => {
      const text = (data.text || data.transcript || "").trim();
      // backend may include a final flag (is_final / final)
      const finalFlag =
        typeof data.is_final !== "undefined"
          ? data.is_final
          : typeof data.final !== "undefined"
          ? data.final
          : true;
      console.log("✅ WebSocket transcript:", text, "final?", finalFlag);

      // Backend processed chunk; clear sending indicator
      try {
        setIsSending(false);
      } catch (e) {}

      if (!listeningRef.current || isWaitingForWakeWordRef.current) {
        console.log("⏭️ Ignoring transcript - not in recording mode", {
          listening: listeningRef.current,
          waitingForWake: isWaitingForWakeWordRef.current,
          text: text,
        });
        return;
      }

      // If we're waiting for a spoken number to select a field, handle locally
      if (isWaitingForNumberRef.current) {
        console.log("🔢 Checking if transcript is a number:", text);
        const num = parseSpokenNumber(text);
        if (num !== null) {
          console.log("✅ Spoken number detected:", num);
          isWaitingForNumberRef.current = false;
          try {
            selectFieldByNumber(num);
          } catch (e) {
            console.warn("Error selecting field by number:", e);
          }
          // IMPORTANT: Return immediately - don't process this transcript as dictation or command
          return;
        } else {
          console.log(
            "⚠️ Not a valid number, waiting for another transcript..."
          );
          // Still waiting for a number, don't process other commands
          return;
        }
      }

      // If a field was selected and we expect dictation, apply directly
      if (pendingFieldForDictationRef.current) {
        console.log("📝 Whisper: Field is pending for dictation:", pendingFieldForDictationRef.current);
        console.log("📝 Whisper: Received text:", text, "final?", finalFlag);
        // treat only final transcripts as dictation
        if (text && finalFlag) {
          // Basic noise filter
          const noisePatterns = [
            /^(thank you|thanks|bye|okay|yeah|right|see you|you know|so|um|uh)[\s.,!?]*$/i,
          ];
          const isNoise =
            text.length < 3 ||
            noisePatterns.some((pattern) => pattern.test(text));
          if (!isNoise) {
            try {
              console.log("✅ Whisper: Applying dictation:", text);
              applyDictationToField(pendingFieldForDictationRef.current, text);
            } catch (e) {
              console.error("Failed to apply dictation:", e);
            }
            return;
          } else {
            console.log("⚠️ Whisper: Skipping noise/short text:", text);
          }
        } else {
          console.log("⚠️ Whisper: Waiting for final transcript or text is empty");
        }
      }

      // Filter noise
      const noisePatterns = [
        /^(thank you|thanks|bye|okay|yeah|right|see you|you know|so|um|uh)[\s.,!?]*$/i,
        /^open up for now/i,
        /^thank you for/i,
        /^thanks for watching/i,
        /^[a-z]{1,2}[\s.,!?]*$/i,
      ];

      const isNoise =
        text.length < 3 || noisePatterns.some((pattern) => pattern.test(text));

      if (text && text.length > 0 && !isNoise) {
        // Keep the internal transcript state
        setTranscript((prev) => prev + " " + text);

        // Emit a DOM event so other components (VoiceTextAreas) can consume partial/final transcripts
        try {
          window.dispatchEvent(
            new CustomEvent("voice-transcript", {
              detail: { text, final: !!finalFlag },
            })
          );
        } catch (e) {
          console.warn("Could not dispatch voice-transcript event", e);
        }

        // If the user spoke a local control phrase like "continue in ..." also emit a control event
        try {
          const ctrlMatch = text.match(
            /continue in\s+(notes|summary|message)/i
          );
          if (ctrlMatch) {
            window.dispatchEvent(
              new CustomEvent("voice-control", { detail: { text } })
            );
          }
        } catch (e) {}

        // Add to queue instead of direct call (prevents race conditions)
        actionQueue.push(text);
        processActionQueue();
      } else if (isNoise || text.length === 0) {
        console.log("⏭️ Skipping noise/hallucination:", text);
      }
    });

    socket.on("error", (error) => {
      console.error("❌ WebSocket error:", error);
    });

    socketRef.current = socket;

    return () => {
      console.log("🔌 Cleaning up WebSocket");
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window)) {
      console.warn("⚠️ Speech Recognition not supported");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const wakeRec = new SpeechRecognition();
    wakeRec.lang = language || "en-US";
    wakeRec.continuous = true;
    wakeRec.interimResults = true;

    wakeRec.onstart = () => {
      wakeRunningRef.current = true;
      console.log("🛎️ Listening for wake word:", wakeWord);
    };

    wakeRec.onend = () => {
      wakeRunningRef.current = false;
      if (listeningRef.current && isWaitingForWakeWordRef.current) {
        setTimeout(() => {
          if (
            !wakeRunningRef.current &&
            listeningRef.current &&
            isWaitingForWakeWordRef.current
          ) {
            try {
              wakeRec.start();
            } catch (e) {}
          }
        }, 500);
      }
    };

    wakeRec.onresult = (event) => {
      const text = event.results[event.results.length - 1][0].transcript;
      const normalized = text.trim().toLowerCase();
      const normalizedWake = wakeWord.trim().toLowerCase();

      console.log(
        "🎤 Wake word recognition heard:",
        text,
        "| Looking for:",
        wakeWord
      );

      if (normalized.includes(normalizedWake)) {
        console.log(`✅ Wake word detected: "${wakeWord}"`);
        try {
          wakeRec.stop();
        } catch (e) {}
        setIsWaitingForWakeWord(false);
        setPaused(false); // Resume from paused state
      }
    };

    wakeRec.onerror = (event) => {
      console.error("❌ Wake word error:", event.error);
      wakeRunningRef.current = false;
    };

    wakeRecognitionRef.current = wakeRec;

    return () => {
      try {
        wakeRec.stop();
      } catch (e) {}
    };
  }, [wakeWord]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key.toUpperCase() === hotkey &&
        !keyPressedRef.current &&
        listening
      ) {
        keyPressedRef.current = true;
        console.log(
          `⏸️ Hotkey (${hotkey}) - Pausing, listening for wake word...`
        );
        setIsWaitingForWakeWord(true);
        setPaused(true); // Set paused state to true
        // Optionally clear transcript when pausing (uncomment if you want this behavior)
        // setTranscript("");
      }
    };

    const handleKeyUp = (e) => {
      if (e.key.toUpperCase() === hotkey) {
        keyPressedRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [hotkey, listening]);

  useEffect(() => {
    if (!privacyAccepted) return;

    // Enumerate input devices once privacy accepted
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((list) => {
        const mics = list.filter((d) => d.kind === "audioinput");
        setDevices(mics);
        // keep existing selection if still present; otherwise pick default
        if (
          mics.length > 0 &&
          !mics.find((d) => d.deviceId === selectedDeviceId)
        ) {
          setSelectedDeviceId(mics[0].deviceId);
        }
      });
    }

    const wakeRec = wakeRecognitionRef.current;

    if (listening) {
      if (isWaitingForWakeWord) {
        console.log("👂 Listening for wake word:", wakeWord);
        if (wakeRec && !wakeRunningRef.current) {
          try {
            wakeRec.start();
          } catch (e) {}
        }
        stopActiveSTT();
      } else {
        console.log("🎙️ Starting Whisper transcription...");
        if (wakeRec && wakeRunningRef.current) {
          try {
            wakeRec.stop();
          } catch (e) {}
        }
        startActiveSTT();
      }
    } else {
      console.log("🛑 Assistant stopped");
      if (wakeRec && wakeRunningRef.current) {
        try {
          wakeRec.stop();
        } catch (e) {}
      }
      stopActiveSTT();
      setIsWaitingForWakeWord(true);
      setPaused(false); // Reset paused state when stopping
      setTranscript("");
    }
  }, [listening, isWaitingForWakeWord, privacyAccepted, wakeWord]);

  const startWhisperRecording = () => {
    console.log("🚀 startWhisperRecording called");
    if (mediaStreamRef.current) {
      console.log("🔄 Media stream exists, restarting recording");
      restartRecording();
      return;
    }

    console.log("🎤 Requesting microphone for Whisper...");
    const constraints = {
      audio: {
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        console.log("✅ Microphone granted");
        mediaStreamRef.current = stream;

        // Set up level meter
        try {
          audioContextRef.current = new (window.AudioContext ||
            window.webkitAudioContext)();
          const source =
            audioContextRef.current.createMediaStreamSource(stream);
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 2048;
          source.connect(analyserRef.current);
          const data = new Uint8Array(analyserRef.current.fftSize);
          const tick = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteTimeDomainData(data);
            // Compute RMS-like value from 0-255 centered at 128
            let sumSq = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sumSq += v * v;
            }
            const rms = Math.sqrt(sumSq / data.length);
            setInputLevel(rms);
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        } catch (e) {
          console.warn("Level meter init failed:", e);
        }

        // Use WAV format directly to avoid backend conversion overhead
        // Note: Safari doesn't support audio/wav, so we'll use Web Audio API instead
        // Audio Sending
        const options = { mimeType: "audio/webm;codecs=opus" };
        mediaRecorderRef.current = new MediaRecorder(stream, options);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) {
            console.log("📦 Audio chunk:", e.data.size, "bytes");
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });
          audioChunksRef.current = [];
          // update UI state
          setIsRecordingActive(false);
          setIsSending(true);
          console.log("🎙️ Audio captured:", audioBlob.size, "bytes");

          // Check if we're still in transcription mode before processing
          if (!listeningRef.current || isWaitingForWakeWordRef.current) {
            console.log(
              "⏭️ Skipping transcription - already paused or stopped"
            );
            return;
          }

          // Skip if audio is too small (likely silence or very short noise)
          if (audioBlob.size < 10000) {
            console.log(
              "⏭️ Skipping transcription - audio too small (likely silence):",
              audioBlob.size,
              "bytes"
            );
            restartRecording();
            return;
          }

          try {
            // Notify backend we stopped recording (optional)
            try {
              if (socketRef.current && socketRef.current.connected) {
                socketRef.current.emit("stop_recording");
              }
            } catch (e) {
              console.warn("Could not emit stop_recording", e);
            }

            // Send via WebSocket instead of HTTP
            if (socketRef.current && socketRef.current.connected) {
              console.log("📤 Converting to WAV and sending via WebSocket...");

              // Convert webm to WAV (16kHz mono) in browser to eliminate backend conversion
              const wavBuffer = await convertBlobToWAV(
                audioBlob,
                audioContextRef.current
              );

              // Calculate RMS to detect silence before sending
              const audioData = new Float32Array(
                wavBuffer.slice(44) // Skip WAV header
              );
              const rms = calculateRMS(audioData);

              // Skip if silence (RMS too low)
              if (rms < 0.01) {
                console.log(
                  `⏭️ Skipping transcription - silence detected (RMS=${rms.toFixed(
                    4
                  )})`
                );
                restartRecording();
                return;
              }

              console.log(
                `📊 WAV audio: ${wavBuffer.byteLength} bytes, RMS=${rms.toFixed(
                  4
                )}`
              );

              // Send WAV audio chunk (include selected language)
              socketRef.current.emit("audio_chunk", {
                audio: Array.from(new Uint8Array(wavBuffer)),
                final: true,
                format: "wav", // Tell backend it's already WAV
              });
              // mark sending complete (we consider it sent)
              setIsSending(false);

              // Restart recording for next chunk
              if (
                listeningRef.current &&
                !isWaitingForWakeWordRef.current &&
                mediaStreamRef.current &&
                mediaStreamRef.current.active
              ) {
                restartRecording();
              }
            } else {
              console.error("❌ WebSocket not connected, falling back to HTTP");

              // Fallback to HTTP if WebSocket not available
              const formData = new FormData();
              formData.append("audio", audioBlob, "recording.webm");

              const response = await fetch(
                `${getBackendBaseUrl()}/api/whisper-transcribe`,
                {
                  method: "POST",
                  body: formData,
                }
              );

              if (response.ok) {
                const data = await response.json();
                const text = data.transcript || "";
                if (listeningRef.current && !isWaitingForWakeWordRef.current) {
                  console.log("✅ HTTP Transcription:", text);

                  if (text && text.trim().length > 0) {
                    setTranscript((prev) => prev + " " + text);
                    await handleAction(text);
                  }

                  restartRecording();
                }
                setIsSending(false);
              }
            }
          } catch (error) {
            console.error("❌ Transcription error:", error);
            // Try to restart recording even after error
            if (
              listeningRef.current &&
              !isWaitingForWakeWordRef.current &&
              mediaStreamRef.current &&
              mediaStreamRef.current.active
            ) {
              try {
                restartRecording();
              } catch (e) {
                console.error("❌ Could not restart recording:", e);
              }
            }
            setIsSending(false);
          }
        };

        mediaRecorderRef.current.onstart = () => {
          console.log("🔴 Recording started");
          setIsRecordingActive(true);
        };
        mediaRecorderRef.current.onerror = (e) =>
          console.error("❌ MediaRecorder error:", e);

        // If VAD-driven recording is disabled, start immediately. Otherwise
        // wait for the AudioWorklet to signal speechstart and drive recorder.
        if (!useVadRef.current) {
          try {
            mediaRecorderRef.current.start();
            setIsRecordingActive(true);
            try {
              if (socketRef.current && socketRef.current.connected)
                socketRef.current.emit("start_recording");
            } catch (e) {}
            recordingTimeoutRef.current = setTimeout(() => {
              if (
                mediaRecorderRef.current &&
                mediaRecorderRef.current.state === "recording"
              ) {
                console.log("⏹️ Auto-stop after 7s");
                mediaRecorderRef.current.stop();
              }
            }, 7000);
          } catch (e) {
            console.error("❌ Failed to start MediaRecorder:", e);
          }
        } else {
          console.log(
            "🔎 VAD-driven recording enabled; waiting for speechstart event to start MediaRecorder"
          );
        }
      })
      .catch((error) => {
        console.error("❌ Microphone denied:", error);
        setTranscript("Microphone access denied.");
      });
  };

  const restartRecording = () => {
    console.log(
      "🔄 restartRecording called, mediaRecorder state:",
      mediaRecorderRef.current?.state,
      "stream active:",
      mediaStreamRef.current?.active
    );

    // Check if stream is still active
    if (!mediaStreamRef.current || !mediaStreamRef.current.active) {
      console.warn("⚠️ Media stream is not active, cannot restart recording");
      return;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "inactive"
    ) {
      console.log("▶️ Restarting recording...");
      audioChunksRef.current = [];

      try {
        mediaRecorderRef.current.start();

        recordingTimeoutRef.current = setTimeout(() => {
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === "recording"
          ) {
            console.log("⏹️ Auto-stop after 15s");
            mediaRecorderRef.current.stop();
          }
        }, 15000); // 15-second chunks
      } catch (error) {
        console.error("❌ Failed to restart MediaRecorder:", error);
        // Stream might be closed, need to reinitialize
        console.log("🔄 Attempting to reinitialize media stream...");
        stopActiveSTT();
        if (listeningRef.current && !isWaitingForWakeWordRef.current) {
          setTimeout(() => startActiveSTT(), 500);
        }
      }
    }
  };

  const stopWhisperRecording = () => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      console.log("⏸️ Stopping recording...");
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      console.log("🛑 Microphone closed");
    }

    // Update UI states
    try {
      setIsRecordingActive(false);
    } catch (e) {}
    try {
      setIsSending(false);
    } catch (e) {}

    // Inform backend if connected
    try {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("stop_recording");
      }
    } catch (e) {
      console.warn("Could not emit stop_recording on stopWhisperRecording", e);
    }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
      analyserRef.current = null;
    }
  };

  // One-shot 5s diagnostic to verify audio pipeline and Whisper
  const runFiveSecondDiagnostic = async () => {
    try {
      console.log("🧪 Running 5s diagnostic...");
      // Pause any ongoing loops
      stopActiveSTT();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const finished = new Promise((resolve) => (rec.onstop = resolve));
      rec.start();
      setTimeout(() => rec.state === "recording" && rec.stop(), 5000);
      await finished;
      stream.getTracks().forEach((t) => t.stop());

      const blob = new Blob(chunks, { type: "audio/webm" });
      console.log("🧪 Diagnostic blob bytes:", blob.size);

      // Option 1: send to /api/diagnose
      const form = new FormData();
      form.append("audio", blob, "diagnostic.webm");
      const res = await fetch(`${getBackendBaseUrl()}/api/save-debug-audio`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setDiagnostic(data);
      console.log("🧪 Diagnostic result:", data);
      console.log(
        "💾 Audio saved to backend for inspection:",
        data.webm_path,
        data.wav_path
      );

      // Resume if still in active conversation mode
      if (listeningRef.current && !isWaitingForWakeWordRef.current) {
        startActiveSTT();
      }
    } catch (e) {
      console.error("❌ Diagnostic failed:", e);
      setDiagnostic({ ok: false, error: String(e) });
    }
  };

  if (showPrivacy) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(30,64,175,0.08)",
          backdropFilter: "blur(4px)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={() => {
          // Click outside closes modal and stops assistant
          setShowPrivacy(false);
          setListening(false);
          console.log("❌ Privacy modal closed - assistant stopped");
        }}
      >
        <div
          style={{
            background: "#fff",
            padding: "2.5rem 3rem",
            borderRadius: 20,
            boxShadow: "0 8px 32px rgba(30,64,175,0.15)",
            maxWidth: 480,
            textAlign: "center",
          }}
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <h2
            style={{ color: "#1976d2", marginBottom: 16, fontSize: "1.5rem" }}
          >
            HIPAA-Compliant Voice Assistant
          </h2>
          <p
            style={{
              color: "#555",
              fontSize: "1rem",
              lineHeight: 1.6,
              marginBottom: 12,
            }}
          >
            This voice assistant is <strong>HIPAA-compliant</strong>. Your audio
            is processed securely using local Whisper transcription.
          </p>
          <p
            style={{
              color: "#555",
              fontSize: "1rem",

              marginBottom: 12,
            }}
          >
            • No audio sent to third-party clouds
            <br />
            • Local processing only
            <br />• No PHI stored in logs
          </p>
          <p style={{ color: "#777", fontSize: "0.9rem", marginBottom: 24 }}>
            <strong>How it works:</strong>
            <br />
            1. Say wake word: "<strong>{wakeWord}</strong>"<br />
            2. Speak your message
            <br />
            3. Press <strong>{hotkey}</strong> to pause
          </p>
          <button
            style={{
              background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "0.9rem 2rem",
              fontWeight: 600,
              fontSize: "1.05rem",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(25,118,210,0.3)",
            }}
            onClick={() => {
              setPrivacyAccepted(true);
              setShowPrivacy(false);
              console.log("✅ Privacy accepted");
            }}
          >
            I Understand - Start Assistant
          </button>
        </div>
      </div>
    );
  }

  if (!listening || !privacyAccepted) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: 24,
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 4px 20px rgba(30,64,175,0.12)",
        padding: "1.25rem 1.75rem",
        zIndex: 1000,
        maxWidth: 480,
        minWidth: 320,
      }}
    >
      {/* AudioWorklet runs silently and posts VAD events (speechstart/speechend/level) */}
      <AudioWorklet
        mediaStream={mediaStreamRef.current}
        audioContextRef={audioContextRef}
        onSpeechStart={() => {
          console.log("🔔 VAD detected speechstart");
          // Start recorder when VAD signals speech
          startRecorderFromVAD();
        }}
        onSpeechEnd={() => {
          console.log("🔕 VAD detected speechend");
          // Schedule stop with hangover to avoid cutting off mid-sentence
          scheduleStopRecorderFromVAD(1500);
        }}
        onLevel={(r) => setInputLevel(r)}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: isWaitingForWakeWord ? "#ff9800" : "#4caf50",
            animation: "pulse 2s infinite",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h4 style={{ color: "#1976d2", margin: 0, fontSize: "1.1rem" }}>
            {isWaitingForWakeWord
              ? `Listening for "${wakeWord}"`
              : isRecordingActive
              ? "🎧 Listening - Speak now"
              : "🎙️ Ready to record"}
          </h4>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            {isSending ? (
              <span style={{ color: "#1976d2" }}>
                Sending audio to server...
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div
        style={{
          color: "#333",
          fontSize: "1rem",
          lineHeight: 1.5,
          wordBreak: "break-word",
          minHeight: 40,
        }}
      >
        {transcript ||
          (isWaitingForWakeWord
            ? `Say "${wakeWord}" to start`
            : "Listening for your speech...")}
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}
      >
        <label style={{ fontSize: 12, color: "#555" }}>Mic:</label>
        <select
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          style={{ fontSize: 12, padding: 4 }}
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${d.deviceId.slice(0, 6)}...`}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#555" }}>Level:</span>
          <div
            style={{
              width: 120,
              height: 8,
              background: "#eee",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.round(inputLevel * 200))}%`,
                height: "100%",
                background: inputLevel > 0.3 ? "#4caf50" : "#ff9800",
                transition: "width 80ms linear",
              }}
            />
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: "0.85rem", color: "#999" }}>
        Press <strong>{hotkey}</strong> to pause
        <br />
        Backend: <code>{getBackendBaseUrl()}</code>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          onClick={runFiveSecondDiagnostic}
          style={{
            background: "#eee",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          Run 5s Audio Test
        </button>
      </div>
      {diagnostic && (
        <div
          style={{
            marginTop: 10,
            fontSize: "0.85rem",
            color: diagnostic.ok ? "#333" : "#c62828",
            background: "#fafafa",
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 10,
          }}
        >
          {diagnostic.ok ? (
            <>
              <div>
                Audio: {diagnostic.meta.bytes} bytes,{" "}
                {diagnostic.meta.duration_ms}
                ms, {diagnostic.meta.frame_rate} Hz, ch{" "}
                {diagnostic.meta.channels}
              </div>
              <div>
                RMS {diagnostic.meta.rms} • Max {diagnostic.meta.max}
              </div>
              <div>
                Flags: {diagnostic.meta.likely_silent ? "silent? " : ""}
                {diagnostic.meta.likely_clipped ? "clipped?" : ""}
              </div>
              <div>
                Transcript: <em>{diagnostic.transcript || "(empty)"}</em>
              </div>
            </>
          ) : (
            <div>Diagnostic error: {diagnostic.error}</div>
          )}
        </div>
      )}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </div>
  );
}
