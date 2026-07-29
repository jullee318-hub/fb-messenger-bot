require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const { findKeywordMatch } = require("./modules/keywordReply");
const { getAIReply } = require("./modules/aiReply");
const { buildLineMessage } = require("./modules/lineRedirect");
const { callSendAPI } = require("./modules/messenger");
const { initDB, upsertSubscriber } = require("./modules/database");
const { startScheduler } = require("./modules/scheduler");
const adminRoutes = require("./admin/adminRoutes");

const app = express();

app.use(cookieParser());
app.use(express.json({ verify: verifySignature }));

function verifySignature(req, _res, buf) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature || !process.env.FB_APP_SECRET) return;
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.FB_APP_SECRET)
      .update(buf)
      .digest("hex");
  if (signature !== expected) {
    throw new Error("Invalid signature");
  }
}

// Facebook Webhook 驗證端點
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.FB_VERIFY_TOKEN) {
    console.log("Webhook 驗證成功！");
    return res.status(200).send(challenge);
  }
  console.log("Webhook 驗證失敗");
  res.sendStatus(403);
});

// 接收訊息端點
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  if (req.body.object !== "page") return;

  for (const entry of req.body.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.message || !event.message.text) continue;
      await handleMessage(event.sender.id, event.message.text);
    }
  }
});

function getWarmFallback(text) {
  if (text.includes("元辰宮")) {
    return "你想了解元辰宮呀 ✨\n\n每個人的元辰宮都是獨一無二的，老師會根據你的狀況給你最合適的建議 ❤️\n\n加 LINE 跟老師聊聊你的情況吧～";
  }
  if (text.includes("潛意識電影院") || text.includes("IVC")) {
    return "你對潛意識電影院有興趣呀～很棒！✨\n\n這個體驗每個人的感受都不一樣，老師會親自幫你了解最適合你的方式 ❤️\n\n加 LINE 跟老師聊聊，她會跟你分享更多喔～";
  }
  if (text.includes("退費") || text.includes("不滿") || text.includes("退款")) {
    return "你的感受很重要 ❤️\n\n這個部分老師會親自跟你好好聊聊，幫你處理。\n\n加 LINE 直接跟老師說，老師一定會好好了解你的狀況 ✨";
  }
  if (text.includes("課程") || text.includes("報名") || text.includes("多少錢") || text.includes("價格")) {
    return "想了解更多對嗎？你的眼光很好 ✨\n\n加 LINE 跟老師聊聊，老師會幫你找到最適合你現在階段的方向 ❤️";
  }
  const fallbacks = [
    "你問的這個很好 ✨\n\n老師本人回答你會更到位～\n\n加 LINE 跟老師聊聊，她會親自回覆你 ❤️",
    "嗯嗯，這個問題很值得好好聊 ✨\n\n加 LINE 讓老師親自跟你分享，會比文字更有溫度 ❤️",
    "謝謝你願意問 ✨\n\n這個老師跟你直接聊會更清楚～\n\n加 LINE 吧，老師會好好回覆你 ❤️",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

async function handleMessage(senderId, text) {
  console.log(`收到訊息 [${senderId}]: ${text}`);

  // 自動收集訂閱者
  const updateFields = {};
  const phoneMatch = text.match(/09\d{8}/);
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (phoneMatch) updateFields.phone = phoneMatch[0];
  if (emailMatch) updateFields.email = emailMatch[0];
  upsertSubscriber(senderId, updateFields);

  try {
    // AI 優先：讓 Sonnet 5 接住每一個問題
    const aiReply = await getAIReply(senderId, text);
    await sendTextMessage(senderId, aiReply);

    // AI 回覆成功後，如果內容跟需要加 LINE 的主題相關，補上 LINE 按鈕
    const lineTopics = ["LINE", "line", "加line", "元辰宮", "療癒", "預約", "報名", "潛意識電影院", "體驗", "IVC"];
    const needLine = lineTopics.some(t => text.includes(t) || aiReply.includes("LINE"));
    if (needLine) {
      await sendLineButton(senderId);
    }
  } catch (err) {
    console.error("AI 回覆失敗，改用關鍵字回覆:", err.message);

    // AI 失敗時，用關鍵字罐頭回覆當備用
    const keywordMatch = findKeywordMatch(text);
    if (keywordMatch) {
      await sendTextMessage(senderId, keywordMatch.reply);
      if (keywordMatch.addLineLink) {
        await sendLineButton(senderId);
      }
    } else {
      const warmFallback = getWarmFallback(text);
      await sendTextMessage(senderId, warmFallback);
      await sendLineButton(senderId);
    }
  }
}

async function sendTextMessage(recipientId, text) {
  await callSendAPI({
    recipient: { id: recipientId },
    message: { text },
  });
}

async function sendLineButton(recipientId) {
  const lineMessages = buildLineMessage();
  if (!lineMessages) return;

  for (const msg of lineMessages) {
    await callSendAPI({
      recipient: { id: recipientId },
      message: msg,
    });
  }
}

// 管理後台
app.use("/admin", adminRoutes);

// AI 診斷端點
app.get("/test-ai", async (_req, res) => {
  const Anthropic = require("@anthropic-ai/sdk");
  const results = { apiKey: "未設定", sonnet5: "未測試", haiku45: "未測試" };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    results.apiKey = "❌ ANTHROPIC_API_KEY 環境變數未設定！";
    return res.json(results);
  }
  results.apiKey = `✅ 已設定 (開頭: ${key.substring(0, 10)}...)`;

  const client = new Anthropic();
  const testMsg = [{ role: "user", content: "說「AI正常運作」這五個字" }];

  try {
    const r = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 50,
      messages: testMsg,
    });
    results.sonnet5 = `✅ ${r.content[0].text}`;
  } catch (err) {
    results.sonnet5 = `❌ status=${err.status} type=${err.error?.error?.type || "unknown"} msg=${err.message}`;
  }

  try {
    const r = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 50,
      messages: testMsg,
    });
    results.haiku45 = `✅ ${r.content[0].text}`;
  } catch (err) {
    results.haiku45 = `❌ status=${err.status} type=${err.error?.error?.type || "unknown"} msg=${err.message}`;
  }

  res.json(results);
});

// 健康檢查
const BOT_VERSION = "v5.2-diagnostic";
app.get("/", (_req, res) => {
  res.send(`品慧老師 Messenger 機器人運作中 ✅ 版本: ${BOT_VERSION}`);
});

// 啟動伺服器
initDB();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 機器人伺服器已啟動，端口: ${PORT}`);
  startScheduler();
});
