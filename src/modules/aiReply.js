const Anthropic = require("@anthropic-ai/sdk");
const { SYSTEM_PROMPT } = require("../config/botPersona");

const client = new Anthropic();

const conversationHistory = new Map();

const MAX_HISTORY = 10;
const HISTORY_TTL_MS = 30 * 60 * 1000;

const PRIMARY_MODEL = "claude-sonnet-5";
const BACKUP_MODEL = "claude-haiku-4-5";

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

async function callClaude(model, messages, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages,
      });
      return response.content[0].text;
    } catch (err) {
      console.error(
        `[callClaude] ${model} 第${attempt + 1}次嘗試失敗:`,
        `status=${err.status}`,
        `type=${err.error?.error?.type || "unknown"}`,
        `msg=${err.message}`
      );
      if (attempt < retries && (!err.status || err.status >= 500 || err.status === 429)) {
        console.log(`等待 2 秒後重試...`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

async function getAIReply(senderId, messageText) {
  addToHistory(senderId, "user", messageText);

  try {
    const reply = await callClaude(PRIMARY_MODEL, getHistory(senderId));
    addToHistory(senderId, "assistant", reply);
    console.log(`AI 回覆成功 [${PRIMARY_MODEL}]`);
    return reply;
  } catch (err) {
    console.error(`${PRIMARY_MODEL} 失敗:`, err.status, err.message);

    try {
      const reply = await callClaude(BACKUP_MODEL, getHistory(senderId));
      addToHistory(senderId, "assistant", reply);
      console.log(`AI 備用模型回覆成功 [${BACKUP_MODEL}]`);
      return reply;
    } catch (err2) {
      console.error(`${BACKUP_MODEL} 也失敗:`, err2.status, err2.message);
      throw err2;
    }
  }
}

module.exports = { getAIReply };
