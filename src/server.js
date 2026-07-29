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
    const lineTopics = ["LINE", "line", "加line", "元辰宮", "療癒", "預約", "報名"];
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
      await sendTextMessage(
        senderId,
        "嗨～你的訊息我收到了 ❤️\n\n這個問題讓老師親自跟你聊會更好～\n\n點下面加 LINE，老師會親自回覆你喔 ✨"
      );
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

// 健康檢查
const BOT_VERSION = "v5.1-robust";
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
