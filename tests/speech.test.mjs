import assert from "node:assert/strict";
import { test } from "node:test";
import { createSpeech } from "../js/speech.js";

function setup(t) {
  let time = 0;
  let nextId = 0;
  const timers = new Map();
  t.mock.method(globalThis, "setTimeout", (callback, delay = 0) => {
    const id = ++nextId;
    timers.set(id, { callback, time: time + delay });
    return id;
  });
  t.mock.method(globalThis, "clearTimeout", (id) => timers.delete(id));
  function advance(milliseconds) {
    const end = time + milliseconds;
    while (timers.size) {
      const [id, timer] = [...timers].sort((a, b) => a[1].time - b[1].time)[0];
      if (timer.time > end) break;
      timers.delete(id);
      time = timer.time;
      timer.callback();
    }
    time = end;
  }

  const spoken = [];
  const animated = [];
  const movements = [];
  let resets = 0;
  const synthesis = {
    paused: false,
    getVoices: () => [
      { name: "Google UK English Male", lang: "en-GB" },
      { name: "Microsoft George", lang: "en-GB" },
    ],
    addEventListener() {},
    cancel() {},
    speak: (utterance) => spoken.push(utterance),
  };
  const globals = {
    window: { speechSynthesis: synthesis },
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
      }
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Option: class {
      constructor(text, value) {
        this.text = text;
        this.value = value;
      }
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const voiceSelect = {
    value: "",
    replaceChildren(...options) { this.options = options; },
    add(option) { this.options.push(option); },
    addEventListener(event, callback) { this[event] = callback; },
  };
  const state = { ready: true, isListening: false, processing: false };
  const speech = createSpeech({
    avatar: {
      animateWord: (word, options) => {
        animated.push(word);
        movements.push({ word, options, time });
      },
      startTalking() {},
      resetMouth() { resets += 1; },
    },
    state,
    voiceSelect,
    onStatus() {},
    onChange() {},
  });
  return {
    speech, state, synthesis, spoken, animated, movements, timers, advance, voiceSelect,
    get resets() { return resets; },
  };
}

test("Google voice without boundaries animates only after start and stops on end", async (t) => {
  const h = setup(t);
  h.voiceSelect.value = "0";
  h.voiceSelect.change();
  const done = h.speech.speak("Hello from Holly.");
  const utterance = h.spoken[0];
  assert.equal(utterance.voice.name, "Google UK English Male");
  h.advance(2000);
  assert.equal(h.animated.length, 0, "network startup must not move the mouth");
  utterance.onstart();
  h.advance(2000);
  assert.ok(h.animated.includes("hello"));
  assert.ok(h.animated.includes("holly."));
  utterance.onend();
  await done;
  const count = h.animated.length;
  h.advance(5000);
  assert.equal(h.animated.length, count);
  assert.equal(h.state.talking, false);
  assert.equal(h.resets, 1);
  assert.equal(h.timers.size, 0);
});

test("Microsoft voice keeps native word timing without duplicate fallback movement", async (t) => {
  const h = setup(t);
  h.voiceSelect.value = "1";
  h.voiceSelect.change();
  const done = h.speech.speak("Hello Holly");
  const utterance = h.spoken[0];
  assert.equal(utterance.voice.name, "Microsoft George");
  utterance.onstart();
  utterance.onboundary({ name: "word", charIndex: 0 });
  h.advance(2000);
  assert.deepEqual(h.animated, ["hello"]);
  utterance.onboundary({ name: "word", charIndex: 6 });
  h.advance(2000);
  assert.deepEqual(h.animated, ["hello", "holly"]);
  assert.ok(h.movements.every((movement) => movement.options === undefined));
  utterance.onend();
  await done;
  assert.equal(h.timers.size, 0);
});

test("estimated mouth movements use slower, gentle gestures with a closing phase", async (t) => {
  const h = setup(t);
  const done = h.speech.speak("I am a helpful computer.");
  h.spoken[0].onstart();
  h.advance(3000);
  const openings = h.movements.filter((movement) => movement.word);
  assert.ok(openings.length >= 3, "speech should continue to animate");
  for (let index = 1; index < openings.length; index += 1) {
    assert.ok(openings[index].time - openings[index - 1].time >= 300,
      "short words must not produce rapid mouth snaps");
  }
  assert.ok(h.movements.every(({ options }) => options.smooth && options.strength < 0.8));
  for (let index = 1; index < h.movements.length; index += 1) {
    assert.notEqual(Boolean(h.movements[index].word), Boolean(h.movements[index - 1].word),
      "each opening should be followed by a closing phase");
  }
  h.spoken[0].onend();
  await done;
  assert.equal(h.timers.size, 0);
});

test("late native boundaries take over; sentence boundaries do not disable the fallback", async (t) => {
  const h = setup(t);
  const done = h.speech.speak("Hello Holly");
  const utterance = h.spoken[0];
  utterance.onstart();
  utterance.onboundary({ name: "sentence", charIndex: 0 });
  h.advance(700);
  assert.ok(h.animated.length > 0);
  utterance.onboundary({ name: "word", charIndex: 6 });
  const count = h.animated.length;
  h.advance(2000);
  assert.equal(h.animated.length, count);
  assert.equal(h.animated.at(-1), "holly");
  utterance.onend();
  await done;
});

test("fallback pauses and resumes with playback", async (t) => {
  const h = setup(t);
  const done = h.speech.speak("Hello from Holly");
  const utterance = h.spoken[0];
  utterance.onstart();
  h.advance(500);
  const count = h.animated.length;
  h.synthesis.paused = true;
  utterance.onpause();
  h.advance(3000);
  assert.equal(h.animated.length, count);
  assert.equal(h.resets, 1);
  h.synthesis.paused = false;
  utterance.onresume();
  h.advance(500);
  assert.ok(h.animated.length > count);
  utterance.onend();
  await done;
  assert.equal(h.timers.size, 0);
});

test("replacing speech cleans up even if cancellation sends no event; stale events are ignored", async (t) => {
  const h = setup(t);
  const first = h.speech.speak("First response");
  const old = h.spoken[0];
  old.onstart();
  h.advance(500);
  const second = h.speech.speak("Second response");
  await first;
  h.spoken[1].onstart();
  const count = h.animated.length;
  old.onboundary({ name: "word", charIndex: 0 });
  old.onend();
  old.onerror();
  assert.equal(h.animated.length, count);
  assert.equal(h.state.talking, true);
  h.advance(500);
  assert.ok(h.animated.slice(count).includes("second"));
  h.spoken[1].onend();
  await second;
  assert.equal(h.timers.size, 0);
  assert.equal(h.resets, 2);
});

test("speech errors and synchronous failures reset the mouth and release talking state", async (t) => {
  const h = setup(t);
  const done = h.speech.speak("Hello Holly");
  h.spoken[0].onstart();
  h.advance(500);
  h.spoken[0].onerror();
  await done;
  assert.equal(h.state.talking, false);
  assert.equal(h.timers.size, 0);
  t.mock.method(console, "error", () => {});
  h.synthesis.speak = () => { throw new Error("Voice unavailable"); };
  await h.speech.speak("Try again");
  assert.equal(h.state.talking, false);
  assert.equal(h.resets, 2);
  assert.equal(h.timers.size, 0);
});
