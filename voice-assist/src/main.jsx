import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { VoiceAssistantProvider } from "./contexts/VoiceAssistantContext.jsx";

createRoot(document.getElementById("root")).render(
  <VoiceAssistantProvider>
    <App />
  </VoiceAssistantProvider>
);
