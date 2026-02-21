import React, { createContext, useContext, useState } from "react";

const VoiceAssistantContext = createContext(null);

function VoiceAssistantProvider({ children }) {
  const [listening, setListening] = useState(false);
  const [wakeWord, setWakeWord] = useState("Java");
  const [hotkey, setHotkey] = useState("F9");
  const [paused, setPaused] = useState(false);
  // New settings to support gated STT usage
  // sttProvider: 'webspeech' uses browser Web Speech API; 'paid' is a placeholder you can wire to a cloud STT
  const [sttProvider, setSttProvider] = useState("whisper");
  // Selected language/locale for speech recognition (e.g., 'en-US', 'en-GB', 'es-ES')
  const [language, setLanguage] = useState("en-US");
  // If true, when paused we can still resume by wake word without using the hotkey
  const [resumeViaWakeWord, setResumeViaWakeWord] = useState(true);
  // Where to detect the wake word: 'webspeech' (free, uses browser recognition) or 'local' (for on-device engines)
  const [wakeWordMode, setWakeWordMode] = useState("webspeech");

  const value = {
    listening,
    setListening,
    wakeWord,
    setWakeWord,
    hotkey,
    setHotkey,
    paused,
    setPaused,
    sttProvider,
    setSttProvider,
    language,
    setLanguage,
    resumeViaWakeWord,
    setResumeViaWakeWord,
    wakeWordMode,
    setWakeWordMode,
  };

  return (
    <VoiceAssistantContext.Provider value={value}>
      {children}
    </VoiceAssistantContext.Provider>
  );
}

function useVoiceAssistant() {
  const context = useContext(VoiceAssistantContext);
  if (!context) {
    throw new Error(
      "useVoiceAssistant must be used within a VoiceAssistantProvider"
    );
  }
  return context;
}

export { VoiceAssistantProvider, useVoiceAssistant };
