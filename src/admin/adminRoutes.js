const express = require("express");
const crypto = require("crypto");
const path = require("path");
const {
  getAllSubscribers,
  getScheduledMessages,
  getBroadcastHistory,
  addScheduledMessage,
  deleteScheduledMessage,
  addBroadcastRecord,
} = require("../modules/database");
const { broadcastMessage } = require("../modules/broadcast");

const router = express.Router();

const COOKIE_NAME = "admin_token";

function generateToken(password) {
  return crypto
    .createHmac("sha256", process.env.FB_APP_SECRET || "default-secret")
    .update(password)
    .digest("hex");
}

function authMiddleware(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const expected = generateToken(process.env.ADMIN_PASSWORD || "admin");
  if (token === expected) {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "請先登入" });
  }
  return res.redirect("/admin/login");
}

router.get("/login", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理後台登入</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, "Microsoft JhengHei", sans-serif; background: #f5f0ff; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .login-card { background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 360px; text-align: center; }
    h1 { font-size: 22px; color: #6b46c1; margin-bottom: 8px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
    input { width: 100%; padding: 12px 16px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 16px; outline: none; transition: border 0.2s; }
    input:focus { border-color: #6b46c1; }
    button { width: 100%; padding: 12px; background: #6b46c1; color: white; border: none; border-radius: 10px; font-size: 16px; cursor: pointer; margin-top: 16px; transition: background 0.2s; }
    button:hover { background: #553c9a; }
    .error { color: #e53e3e; font-size: 14px; margin-top: 12px; display: none; }
  </style>
</head>
<body>
  <div class="login-card">
    <h1>意轉靈升工作坊</h1>
    <p class="subtitle">Messenger 機器人管理後台</p>
    <form id="loginForm">
      <input type="password" id="password" placeholder="請輸入管理密碼" required>
      <button type="submit">登入</button>
      <p class="error" id="error">密碼錯誤，請重試</p>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('password').value;
      const res = await fetch('/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        window.location.href = '/admin';
      } else {
        document.getElementById('error').style.display = 'block';
      }
    });
  </script>
</body>
</html>`);
});

router.post("/auth", express.json(), (req, res) => {
  const { password } = req.body;
  if (password === (process.env.ADMIN_PASSWORD || "admin")) {
    const token = generateToken(password);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax",
    });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "密碼錯誤" });
});

router.get("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect("/admin/login");
});

router.get("/", authMiddleware, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

router.get("/api/subscribers", authMiddleware, (_req, res) => {
  res.json(getAllSubscribers());
});

router.get("/api/scheduled", authMiddleware, (_req, res) => {
  res.json(getScheduledMessages());
});

router.get("/api/history", authMiddleware, (_req, res) => {
  res.json(getBroadcastHistory());
});

router.post("/api/broadcast", authMiddleware, express.json(), async (req, res) => {
  const { text, targetGroup, useEventTag } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "訊息內容不能為空" });
  }

  let subscribers;
  if (targetGroup && targetGroup.startsWith("event:")) {
    const eventName = targetGroup.replace("event:", "");
    subscribers = getAllSubscribers({ event: eventName });
  } else {
    subscribers = getAllSubscribers();
  }

  if (subscribers.length === 0) {
    return res.status(400).json({ error: "沒有符合條件的訂閱者" });
  }

  const result = await broadcastMessage(text.trim(), subscribers, useEventTag);
  addBroadcastRecord(result);
  res.json(result);
});

router.post("/api/schedule", authMiddleware, express.json(), (req, res) => {
  const { text, sendAt, targetGroup, useEventTag } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "訊息內容不能為空" });
  }
  if (!sendAt) {
    return res.status(400).json({ error: "請選擇發送時間" });
  }
  if (new Date(sendAt) <= new Date()) {
    return res.status(400).json({ error: "發送時間必須在未來" });
  }

  const msg = addScheduledMessage({
    text: text.trim(),
    sendAt: new Date(sendAt).toISOString(),
    targetGroup: targetGroup || "all",
    useEventTag: !!useEventTag,
  });
  res.json(msg);
});

router.delete("/api/schedule/:id", authMiddleware, (req, res) => {
  deleteScheduledMessage(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
