import { createAvatar } from "./avatar.js";
import { createSpeech } from "./speech.js";
import { setApiKey, setupModelSelect } from "./conversation.js";

const state = {
  ready: false,
  isListening: false,
  talkingMode: false,
  talking: false,
  userIsSpeaking: false,
  processing: false,
};
const status = document.getElementById("status");
const speakButton = document.getElementById("speakBtn");
const listenButton = document.getElementById("toggleListenBtn");
const modelSelect = document.getElementById("modelSelect");
setupModelSelect(modelSelect);
const bar = document.getElementById("listenBar");
const panels = ["controls", "status", "info"].map((id) =>
  document.getElementById(id)
);
const onStatus = (message) => {
  status.textContent = message;
};
let sleepAmount = 0;
let lastBarMode;
let speech;

function updateControls() {
  modelSelect.disabled = state.processing;
  speakButton.disabled =
    !state.ready ||
    !speech?.synthesisSupported ||
    state.processing ||
    state.talking;
  listenButton.disabled = !state.ready || !speech?.recognitionSupported;
  listenButton.textContent = state.isListening
    ? "Stop Listening"
    : "Start Listening";
  listenButton.classList.toggle("listening", state.isListening);
  listenButton.setAttribute("aria-pressed", String(state.isListening));
  updateBar();
}

function updateBar() {
  let mode = "";
  if (state.isListening && !state.talking && sleepAmount <= 0.8) {
    mode = state.userIsSpeaking
      ? "active user-speaking"
      : state.talkingMode
      ? "active talking"
      : "active";
  }
  if (mode === lastBarMode) return;
  lastBarMode = mode;
  bar.className = mode;
  bar.style.opacity = mode ? "1" : "0";
}

async function init() {
  updateControls();
  onStatus("Loading Holly...");
  try {
    const avatar = createAvatar(state, (amount) => {
      sleepAmount = amount;
      updateBar();
    });
    speech = createSpeech({
      avatar,
      state,
      voiceSelect: document.getElementById("voiceSelect"),
      onStatus,
      onChange: updateControls,
    });
    speakButton.addEventListener("click", () =>
      speech.speak("Say Holly to start chatting. Say Bye Holly to stop.")
    );
    listenButton.addEventListener("click", speech.toggleListening);
    document.getElementById("keyBtn").addEventListener("click", setApiKey);
    document.body.addEventListener("click", (event) => {
      if (event.target === document.body || event.target === avatar.canvas) {
        const hidden = !panels[0].classList.contains("controls-hidden");
        panels.forEach((panel) =>
          panel.classList.toggle("controls-hidden", hidden)
        );
      }
    });
    await avatar.ready;
    state.ready = true;
    updateControls();
    onStatus(
      speech.recognitionSupported
        ? 'Ready - click Start Listening, then say "Holly" to start a conversation'
        : "Speech recognition is unavailable in this browser. Try Chrome or Edge."
    );
  } catch (error) {
    console.error(error);
    onStatus(
      "Could not load Holly. Check the model path, network connection and WebGL support."
    );
  }
}

init();
