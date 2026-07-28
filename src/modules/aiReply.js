const Anthropic = require("@anthropic-ai/sdk");
const { SYSTEM_PROMPT } = require("../config/botPersona");

const client = new Anthropic();

const conversationHistory = new Map();

const MAX_HISTORY = 10;
const HISTORY_TTL_MS = 30 * 60 * 1000;

function getHistory(senderId) {
  const entry = conversationHistory.get(senderId);
  if (!entry) return [];
  if (Date.now() - entry.updatedAt > HISTORY_TTL_MS) {
    conversationHistory.delete(senderId);
    return [];
  }
  return entry.messages;
}

function addToHistory(senderId, role, content) {
  const entry = conversationHistory.get(senderId) || {
    messages: [],
    updatedAt: Date.now(),
  };
  entry.messages.push({ role, content });
  if (entry.messages.length > MAX_HISTORY) {
    entry.messages = entry.messages.slice(-MAX_HISTORY);
  }
  entry.updatedAt = Date.now();
  conversationHistory.set(senderId, entry);
}

async function getAIReply(senderId, messageText) {
  addToHistory(senderId, "user", messageText);

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: getHistory(senderId),
    });

    const reply = response.content[0].text;
    addToHistory(senderId, "assistant", reply);
    return reply;
  } catch (err) {
    console.error("Claude API 錯誤詳情:", err.status, err.message);
    console.error("錯誤類型:", err.constructor.name);
    throw err;
  }
}

module.exports = { getAIReply };
