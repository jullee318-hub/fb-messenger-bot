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
  if (!content) return;
  const entry = conversationHistory.get(senderId) || {
    messages: [],
    updatedAt: Date.now(),
  };

  const msgs = entry.messages;
  if (msgs.length > 0 && msgs[msgs.length - 1].role === role) {
    if (role === "user") {
      msgs[msgs.length - 1].content = content;
    } else {
      return;
    }
  } else {
    msgs.push({ role, content });
  }

  if (msgs.length > MAX_HISTORY) {
    entry.messages = msgs.slice(-MAX_HISTORY);
  }
  entry.updatedAt = Date.now();
  conversationHistory.set(senderId, entry);
}

function removeLastUserMessage(senderId) {
  const entry = conversationHistory.get(senderId);
  if (!entry || entry.messages.length === 0) return;
  if (entry.messages[entry.messages.length - 1].role === "user") {
    entry.messages.pop();
  }
}

function sanitizeMessages(messages) {
  const clean = messages.filter(
    (m) => m && m.role && typeof m.content === "string" && m.content.length > 0
  );
  const result = [];
  for (const msg of clean) {
    if (result.length > 0 && result[result.length - 1].role === msg.role) {
      if (msg.role === "user") {
        result[result.length - 1].content = msg.content;
      }
      continue;
    }
    result.push({ role: msg.role, content: msg.content });
  }
  if (result.length > 0 && result[0].role !== "user") {
    result.shift();
  }
  return result;
}

async function callClaude(model, messages, retries = 1) {
  const safeMessages = sanitizeMessages(messages);
  if (safeMessages.length === 0) {
    throw new Error("沒有有效的訊息可以傳送");
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 500,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: safeMessages,
      });
      return response.content[0].text;
    } catch (err) {
      console.error(
        `[callClaude] ${model} 第${attempt + 1}次嘗試失敗:`,
        `status=${err.status}`,
        `type=${err.error?.error?.type || "unknown"}`,
        `msg=${err.message}`
      );
      if (
        attempt < retries &&
        (!err.status || err.status >= 500 || err.status === 429)
      ) {
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
      removeLastUserMessage(senderId);
      throw err2;
    }
  }
}

module.exports = { getAIReply };
