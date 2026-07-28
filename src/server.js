require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const { findKeywordMatch } = require("./modules/keywordReply");
const { getAIReply } = require("./modules/aiReply");
const { buildLineMessage } = require("./modules/lineRedirect");

const app = express();

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

  try {
    const keywordMatch = findKeywordMatch(text);

    if (keywordMatch) {
      await sendTextMessage(senderId, keywordMatch.reply);
      if (keywordMatch.addLineLink) {
        await sendLineButton(senderId);
      }
      return;
    }

    const aiReply = await getAIReply(senderId, text);
    await sendTextMessage(senderId, aiReply);
  } catch (err) {
    console.error("處理訊息時發生錯誤:", err.message);
    await sendTextMessage(
      senderId,
      "不好意思，小助手這邊剛好忙了一下 😊\n你的訊息我收到了！\n\n你可以再傳一次，或者直接加 LINE 跟品慧老師聊聊，\n老師會親自回覆你 ❤️"
    );
    await sendLineButton(senderId);
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

async function callSendAPI(requestBody) {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("Facebook API 錯誤:", JSON.stringify(error));
  }
}

// 健康檢查（含版本標記，用來確認部署是否更新）
const BOT_VERSION = "v2.1-20260728";
app.get("/", (_req, res) => {
  res.send(`品慧老師 Messenger 機器人運作中 ✅ 版本: ${BOT_VERSION}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 機器人伺服器已啟動，端口: ${PORT}`);
});
