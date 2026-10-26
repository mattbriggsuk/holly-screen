<img width="1919" height="1079" alt="holly_awake" src="https://github.com/user-attachments/assets/ede08d47-af74-4b5d-8231-fe12c59d715a" />

# Holly Talking Head

A static talking-head POC with browser speech recognition, speech synthesis, Three.js animation and OpenAI chat responses.

## Run locally

From this folder, run:

```powershell
python -m http.server 8030 --bind 127.0.0.1
```

Open http://localhost:8030 in Chrome or Edge. Allow microphone access, set your OpenAI API key, then click **Start Listening**. Say **Holly** to start a conversation. Say **Bye Holly**, **Go to sleep Holly**, **Goodnight Holly** or **Sleep Holly** to return to sleep mode. Click the background to hide or show the controls. `holly.html` redirects to the main page for existing bookmarks.

Serve over localhost or HTTPS for microphone access; opening the HTML directly from disk will not load the JavaScript modules correctly. Three.js scripts are served locally. An internet connection is required for OpenAI requests and potentially the browser's speech recognition service.

Use the **AI model** dropdown to choose GPT-4o mini, GPT-6 Luna (the default) or GPT-6.1 Sol. The browser remembers your choice, and the next message uses the selected model while keeping the current conversation. Your API key needs access to that model. The picker is disabled while a reply is being generated. Available model IDs and their request settings are defined in `js/conversation.js`; the GPT-6 settings follow the [OpenAI GPT-6 guide](https://developers.openai.com/api/docs/guides/latest-model).

## Structure

- `index.html`: page structure and local Three.js script references.
- `libs/three/`: Three.js 0.146.0, OrbitControls, GLTFLoader and their MIT license, downloaded from jsDelivr.
- `css/styles.css`: controls, listening bar and animations.
- `js/app.js`: startup, shared activity state and UI events.
- `js/avatar.js`: model loading, lighting, mouth shapes and head animation.
- `js/speech.js`: voice selection, speech synthesis and recognition lifecycle.
- `js/mouth-sync.js`: native word timing and estimated mouth animation for voices without word-boundary events.
- `js/conversation.js`: API key storage, conversation history and OpenAI requests.
- `models/holly.glb`: the only model referenced by the POC; its geometry and materials are embedded.

## Implementation Notes

Mouth animation uses native word-boundary events when the voice provides them. Voices without these events, including affected Chrome Google voices, use estimated mouth movement from the spoken text. This starts with speech, pauses with playback and stops when speech ends, fails or is replaced. The fallback provides approximate timing rather than exact lip sync; [word-boundary events depend on the speech engine](https://webaudio.github.io/web-speech-api/#eventdef-speechsynthesisutterance-boundary).

The POC's API settings and localStorage keys are retained. The voice picker now selects the voice actually displayed in its sorted list. Speech recognition pauses while waiting for an AI response and while Holly speaks; microphone permission failures stop automatic retries.

The API key is stored in this browser's localStorage and requests go directly to OpenAI, as in the original POC. Use this approach only for local experimentation. A deployed application should put its API key and OpenAI requests behind a server.
