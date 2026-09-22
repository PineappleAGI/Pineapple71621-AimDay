/**
 * One-tap voice-to-text for a dump field.
 * Chrome exposes this as webkitSpeechRecognition on extension pages.
 */
export function createVoiceCapture({ button, input, onText, onError }) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;

  function setListening(on) {
    listening = on;
    button.classList.toggle("is-listening", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }

  button.addEventListener("click", () => {
    if (!Rec) {
      onError?.("Voice capture isn’t available in this browser.");
      return;
    }
    if (listening && rec) {
      try {
        rec.stop();
      } catch {
        setListening(false);
      }
      return;
    }

    rec = new Rec();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      const said = event.results?.[0]?.[0]?.transcript?.trim();
      if (!said) return;
      const current = input.value.trim();
      input.value = current ? `${current}\n${said}` : said;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      onText?.(said);
    };
    rec.onerror = (event) => {
      setListening(false);
      if (event?.error === "not-allowed") {
        onError?.("Allow the microphone to dump by voice.");
      } else if (event?.error === "no-speech") {
        onError?.("No speech heard. Try again.");
      } else {
        onError?.("Voice capture stopped.");
      }
    };
    rec.onend = () => setListening(false);

    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      onError?.("Voice capture is already running.");
    }
  });

  return {
    stop() {
      try {
        rec?.stop();
      } catch {
        /* already ended */
      }
    },
  };
}
