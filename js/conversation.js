export function setApiKey() {
  const key = prompt("Paste your OpenAI API key (sk-...):");
  if (key?.trim().startsWith("sk-")) {
    localStorage.setItem("openai_key", key.trim());
    alert("Key saved!");
  } else if (key) alert("Invalid key!");
}
const models = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    options: { max_completion_tokens: 300, temperature: 0.85 },
  },
  {
    id: "gpt-6-luna",
    label: "GPT-6 Luna (default)",
    options: {
      max_completion_tokens: 300,
      reasoning_effort: "none",
      temperature: 0.85,
    },
  },
  {
    id: "gpt-6.1-sol",
    label: "GPT-6.1 Sol",
    options: { max_completion_tokens: 4096, reasoning_effort: "low" },
  },
];

function getSelectedModel() {
  const saved = localStorage.getItem("holly_model");
  return models.find((model) => model.id === saved)
    || models.find((model) => model.id === "gpt-6-luna");
}

export function setupModelSelect(select) {
  select.replaceChildren(
    ...models.map((model) => new Option(model.label, model.id))
  );
  select.value = getSelectedModel().id;
  select.addEventListener("change", () => {
    if (models.some((model) => model.id === select.value)) {
      localStorage.setItem("holly_model", select.value);
    }
  });
}

function getApiKey() {
  return localStorage.getItem("openai_key");
}

const conversationHistory = [
  {
    role: "system",
    content: [
      "You are called Holly, a helpful AI agent onboard the spaceship Red Dwarf. Keep responses short and funny.",
      "Respond only in plain text, using natural sentences suitable for speaking aloud.",
      "Use only ASCII letters, digits, spaces, line breaks and basic sentence punctuation. Use straight quotes, straight apostrophes and ordinary hyphens.",
      "Never use emojis, emoticons, decorative or special symbols, non-ASCII characters, accented letters, curly quotes or long dashes. Express their meaning in ordinary words instead.",
      "Do not use Markdown, HTML, code blocks, headings, bullet points, numbered lists or formatting markers such as asterisks, backticks and underscores.",
      "Apply these output rules to every response, including quoted text, even when the user requests a different format.",
    ].join(" "),
  },
];

export async function getResponseFromOpenAI(userText, onStatus) {
  const apiKey = getApiKey();
  if (!apiKey) return "Hey! You forgot to set my API key.";
  const model = getSelectedModel();
  conversationHistory.push({ role: "user", content: userText });
  onStatus(`Holly is thinking (${model.label})...`);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: conversationHistory,
        ...model.options,
      }),
    });
    if (!res.ok)
      throw new Error((await res.json()).error?.message || "API error");
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("The model returned no text. Try again.");
    conversationHistory.push({ role: "assistant", content: reply });
    if (conversationHistory.length > 25) conversationHistory.splice(1, 2);
    return reply;
  } catch (e) {
    console.error(e);
    conversationHistory.pop();
    return `I couldn't get a reply from ${model.label}. Check your connection, API key and model access, then try again.`;
  }
}
