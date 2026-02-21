import React, { useEffect, useRef } from "react";

/**
 * AudioWorklet wrapper component.
 * Props:
 * - mediaStream: MediaStream from getUserMedia
 * - audioContextRef: React ref to AudioContext (optional). If not provided, a local AudioContext will be created.
 * - onSpeechStart: () => void
 * - onSpeechEnd: () => void
 * - onLevel: (rms) => void
 */
export default function AudioWorklet({
  mediaStream,
  audioContextRef,
  onSpeechStart,
  onSpeechEnd,
  onLevel,
}) {
  const nodeRef = useRef(null);
  const sourceRef = useRef(null);
  const localContextRef = useRef(null);

  useEffect(() => {
    if (!mediaStream) return;

    let mounted = true;

    (async () => {
      try {
        const context =
          audioContextRef && audioContextRef.current
            ? audioContextRef.current
            : new (window.AudioContext || window.webkitAudioContext)();
        if (!audioContextRef || !audioContextRef.current) {
          localContextRef.current = context;
        }

        // Load worklet module. Use Vite-friendly URL import
        try {
          await context.audioWorklet.addModule(
            new URL("../worklets/vad-processor.js", import.meta.url).href
          );
        } catch (e) {
          console.warn("⚠️ Could not load AudioWorklet module:", e);
          return;
        }

        const source = context.createMediaStreamSource(mediaStream);
        sourceRef.current = source;

        const node = new AudioWorkletNode(context, "vad-processor", {
          processorOptions: {
            threshold: 0.008, // slightly more sensitive
            hangoverMs: 1500, // 1.5s hangover to avoid mid-sentence cutoffs
            levelIntervalMs: 100,
          },
        });
        nodeRef.current = node;

        node.port.onmessage = (ev) => {
          const data = ev.data || {};
          if (data.type === "speechstart") {
            onSpeechStart && onSpeechStart();
          } else if (data.type === "speechend") {
            onSpeechEnd && onSpeechEnd();
          } else if (data.type === "level") {
            onLevel && onLevel(data.rms);
          }
        };

        // Prevent audio output: route through a silent gain
        const sink = context.createGain();
        sink.gain.value = 0;

        source.connect(node);
        node.connect(sink);
        sink.connect(context.destination);

        if (mounted) {
          console.log("🔊 AudioWorklet VAD started");
        }
      } catch (err) {
        console.error("❌ Failed to initialize AudioWorklet:", err);
      }
    })();

    return () => {
      mounted = false;
      try {
        if (nodeRef.current) {
          nodeRef.current.port.postMessage({ type: "shutdown" });
          nodeRef.current.disconnect();
          nodeRef.current = null;
        }
        if (sourceRef.current) {
          sourceRef.current.disconnect();
          sourceRef.current = null;
        }
        if (localContextRef.current) {
          try {
            localContextRef.current.close();
          } catch (e) {}
          localContextRef.current = null;
        }
      } catch (e) {
        console.warn("Error cleaning up AudioWorklet:", e);
      }
    };
  }, [mediaStream]);

  return null; // invisible component; it communicates via callbacks
}
