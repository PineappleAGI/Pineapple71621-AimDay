/**
 * One-tap voice-to-text for a dump field.
 *
 * Recognition is pinned to the browser's on-device engine. The Web Speech API
 * otherwise streams captured audio to a remote service, which would break the
 * promise that a dump never leaves the machine, so capture is refused outright
 * when on-device recognition cannot be confirmed.
 */

const LANG = "en-US";

export function createVoiceCapture({ button, input, onText, onError, onStatus }) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const say = (message) => (onStatus || onError)?.(message);
  let rec = null;
  let listening = false;
  let preparing = false;

  function setListening(on) {
    listening = on;
    button.classList.toggle("is-listening", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }

  /**
   * Resolves to "available" only when the language pack is installed locally.
   */
  async function ensureOnDevice() {
    if (typeof Rec.available !== "function" || typeof Rec.install !== "function") {
      return "unsupported";
    }

    let status;
    try {
      status = await Rec.available({ langs: [LANG], processLocally: true, quality: "dictation" });
    } catch {
      try {
        status = await Rec.available({ langs: [LANG], processLocally: true });
      } catch {
        return "unsupported";
      }
    }

    if (status === "available") return "available";
    if (status === "unavailable") return "unavailable";

    say("Downloading the on-device voice pack — this happens once.");
    try {
      const installed = await Rec.install({ langs: [LANG], processLocally: true });
      return installed ? "available" : "unavailable";
    } catch {
      return "unavailable";
    }
  }

  function start() {
    rec = new Rec();
    rec.lang = LANG;
    rec.processLocally = true;
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
      } else if (event?.error === "language-not-supported" || event?.error === "service-not-allowed") {
        onError?.("On-device voice isn’t ready, so nothing was recorded. Type it instead.");
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
  }

  button.addEventListener("click", async () => {
    if (!Rec) {
      onError?.("Voice capture isn’t available in this browser.");
      return;
    }
    if (preparing) return;
    if (listening && rec) {
      try {
        rec.stop();
      } catch {
        setListening(false);
      }
      return;
    }

    preparing = true;
    try {
      const status = await ensureOnDevice();
      if (status === "unsupported") {
        onError?.("This browser can’t confirm on-device voice, so AimDay won’t record. Type it instead.");
        return;
      }
      if (status === "unavailable") {
        onError?.("No on-device voice pack for English. Type it instead — audio never leaves your machine.");
        return;
      }
      say("");
      start();
    } finally {
      preparing = false;
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
