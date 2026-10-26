import { getResponseFromOpenAI } from "./conversation.js";
import { createMouthSync } from "./mouth-sync.js";

const sleepPhrases = [
  "bye holly",
  "go to sleep holly",
  "goodnight holly",
  "sleep holly",
];

export function createSpeech({
  avatar,
  state,
  voiceSelect,
  onStatus,
  onChange,
}) {
  const synthesis = window.speechSynthesis;
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = Recognition ? new Recognition() : null;
  let voices = [];
  let selectedVoice = null;
  let restartTimer;
  let finishSpeech;
  let session = 0;

  function populateVoices() {
    if (!synthesis) {
      voiceSelect.replaceChildren(
        new Option("Speech synthesis unavailable", "")
      );
      voiceSelect.disabled = true;
      return;
    }
    const available = synthesis.getVoices();
    if (!available.length) return;
    const score = (voice) =>
      (/natural|online/i.test(voice.name) ? 100 : 0) +
      (voice.lang.startsWith("en") ? 50 : 0) +
      (/female|aria|jenny|samantha|ava|emma|olivia/i.test(voice.name) ? 30 : 0);
    voices = available.sort((a, b) => score(b) - score(a));
    voiceSelect.replaceChildren(new Option("Default voice", ""));
    voices.forEach((voice, index) => {
      voiceSelect.add(
        new Option(
          `${voice.name} (${voice.lang}) ${voice.default ? "[Default]" : ""}`,
          String(index)
        )
      );
    });
    const saved = localStorage.getItem("holly_voice_index");
    selectedVoice = saved !== null ? voices[Number(saved)] || null : null;
    voiceSelect.value = selectedVoice ? saved : "";
  }

  voiceSelect.addEventListener("change", () => {
    selectedVoice =
      voiceSelect.value === "" ? null : voices[Number(voiceSelect.value)];
    if (selectedVoice)
      localStorage.setItem("holly_voice_index", voiceSelect.value);
    else localStorage.removeItem("holly_voice_index");
  });
  synthesis?.addEventListener("voiceschanged", populateVoices);
  populateVoices();

  function scheduleRecognition(delay = 500) {
    clearTimeout(restartTimer);
    if (
      !recognition ||
      !state.ready ||
      !state.isListening ||
      state.talking ||
      state.processing
    )
      return;
    restartTimer = setTimeout(() => {
      if (!state.isListening || state.talking || state.processing) return;
      try {
        recognition.start();
      } catch (error) {
        // An already running recognizer will schedule its own restart on end.
        if (error.name !== "InvalidStateError")
          onStatus(`Microphone error: ${error.message}`);
      }
    }, delay);
  }

  async function speak(text) {
    if (!state.ready) return;
    if (!synthesis) {
      onStatus(text);
      return;
    }
    finishSpeech?.();
    clearTimeout(restartTimer);
    recognition?.abort();
    synthesis.cancel();
    state.talking = true;
    state.userIsSpeaking = false;
    avatar.startTalking();
    onChange();
    await new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.pitch = 1.15;
      if (selectedVoice) utterance.voice = selectedVoice;
      const mouthSync = createMouthSync({ avatar, synthesis, utterance });
      utterance.onstart = mouthSync.start;
      utterance.onboundary = mouthSync.boundary;
      utterance.onpause = mouthSync.pause;
      utterance.onresume = mouthSync.resume;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        mouthSync.stop();
        finishSpeech = null;
        state.talking = false;
        onChange();
        scheduleRecognition();
        resolve();
      };
      finishSpeech = finish;
      utterance.onend = finish;
      utterance.onerror = finish;
      try {
        synthesis.speak(utterance);
      } catch (error) {
        console.error(error);
        finish();
      }
    });
  }

  function toggleListening() {
    if (!recognition || !state.ready) return;
    session += 1;
    state.isListening = !state.isListening;
    state.talkingMode = false;
    state.userIsSpeaking = false;
    clearTimeout(restartTimer);
    onStatus(
      state.isListening
        ? 'Listening mode active - say "Holly" to start'
        : "Listening stopped"
    );
    onChange();
    if (state.isListening) scheduleRecognition(0);
    else recognition.abort();
  }

  if (recognition) {
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = async (event) => {
      if (!state.isListening || state.talking || state.processing) return;
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interimText += result[0].transcript;
      }
      const currentText = (finalText + interimText).trim();
      state.userIsSpeaking = Boolean(currentText);
      if (currentText) onStatus(`Heard: ${currentText}`);
      onChange();
      if (!finalText.trim()) return;

      state.userIsSpeaking = false;
      const text = finalText.trim();
      const lower = text.toLowerCase();
      if (sleepPhrases.some((phrase) => lower.includes(phrase))) {
        state.talkingMode = false;
        onStatus('Sleep mode - say "Holly" to wake up');
        onChange();
        scheduleRecognition();
        return;
      }
      if (!state.talkingMode && !lower.includes("holly")) {
        scheduleRecognition();
        return;
      }

      state.talkingMode = true;
      state.processing = true;
      const requestSession = session;
      clearTimeout(restartTimer);
      recognition.abort();
      onChange();
      try {
        const reply = await getResponseFromOpenAI(text, onStatus);
        if (state.isListening && session === requestSession) {
          onStatus(reply);
          await speak(reply);
        }
      } finally {
        state.processing = false;
        onChange();
        scheduleRecognition();
      }
    };
    recognition.onspeechend = recognition.onend = () => {
      state.userIsSpeaking = false;
      onChange();
      scheduleRecognition();
    };
    recognition.onerror = (event) => {
      state.userIsSpeaking = false;
      if (
        ["not-allowed", "service-not-allowed", "audio-capture"].includes(
          event.error
        )
      ) {
        state.isListening = false;
        state.talkingMode = false;
        session += 1;
        onStatus(
          `Microphone unavailable: ${event.error}. Check browser microphone permissions.`
        );
      }
      onChange();
      scheduleRecognition(1000);
    };
  }

  return {
    speak,
    toggleListening,
    recognitionSupported: Boolean(recognition),
    synthesisSupported: Boolean(synthesis),
  };
}
