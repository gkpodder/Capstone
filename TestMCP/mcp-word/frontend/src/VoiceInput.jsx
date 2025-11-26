import React, { useState, useEffect, useRef } from "react";

export default function VoiceRecorder({ onTranscript }) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported.");
      return;
    }

    const recog = new SpeechRecognition();
    recog.lang = "en-US";
    recog.continuous = false;
    recog.interimResults = false;

    recog.onresult = (event) => {
      const text = event.results[0][0].transcript;
      if (onTranscript) onTranscript(text);
    };

    recog.onend = () => setIsRecording(false);
    recognitionRef.current = recog;
  }, [onTranscript]);

  const toggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleRecording}
      style={{
        borderRadius: "50%",
        width: "38px",
        height: "38px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        marginRight: "8px",
        border: isRecording ? "2px solid var(--accent)" : "1px solid #1f2937",
        background: isRecording ? "var(--accent-soft)" : "#111827",
        cursor: "pointer",
      }}
    >
      🎤
    </button>
  );
}
