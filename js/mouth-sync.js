// Some speech engines provide audio without word-boundary events.
// Estimate mouth movement until native timing becomes available.
export function createMouthSync({ avatar, synthesis, utterance }) {
  const words = utterance.text.match(/\S+/g) || [];
  const interval = 60;
  const gentleMotion = { smooth: true, strength: 0.6 };
  let timer;
  let started = false;
  let stopped = false;
  let paused = false;
  let nativeTiming = false;
  let wordIndex = 0;
  let wordElapsed = 0;
  let mouthOpen = false;

  function schedule(delay) {
    clearTimeout(timer);
    if (!stopped && !paused && !nativeTiming && words.length) {
      timer = setTimeout(tick, delay);
    }
  }

  function tick() {
    if (stopped || paused || nativeTiming) return;
    if (!synthesis.paused) {
      const word = words[wordIndex];
      const letters = word.replace(/[^a-z0-9]/gi, "").length;
      const rate = Math.max(0.1, utterance.rate || 1);
      const duration = Math.min(850, Math.max(320, 180 + letters * 60)) / rate;
      const pause = /[.!?]["')]*$/.test(word)
        ? 280 / rate
        : /[,;:]["')]*$/.test(word)
        ? 140 / rate
        : 0;
      if (wordElapsed === 0) {
        avatar.animateWord(word.toLowerCase(), gentleMotion);
        mouthOpen = true;
      }
      // One gentle opening and closing per word, rather than repeated snaps.
      if (mouthOpen && wordElapsed >= duration * 0.55) {
        avatar.animateWord("", gentleMotion);
        mouthOpen = false;
      }
      wordElapsed += interval;
      if (wordElapsed >= duration + pause) {
        // Keep moving if the voice takes longer than the estimated text timing.
        wordIndex = (wordIndex + 1) % words.length;
        wordElapsed = 0;
      }
    }
    schedule(interval);
  }

  return {
    start() {
      if (started || stopped) return;
      started = true;
      // Give voices with native word timing a chance to send their first event.
      schedule(180);
    },
    boundary(event) {
      if (stopped || paused || synthesis.paused || event.name !== "word") return;
      const word = utterance.text.slice(event.charIndex).match(/^\S+/)?.[0];
      if (!word) return;
      nativeTiming = true;
      clearTimeout(timer);
      avatar.animateWord(word.toLowerCase());
    },
    pause() {
      if (stopped) return;
      paused = true;
      clearTimeout(timer);
      avatar.resetMouth();
    },
    resume() {
      if (stopped) return;
      paused = false;
      if (started) schedule(0);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      avatar.resetMouth();
    },
  };
}
