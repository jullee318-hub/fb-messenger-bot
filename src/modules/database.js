const { join } = require("path");
const fs = require("fs");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "..", "data");
const DB_FILE = join(DATA_DIR, "db.json");

const DEFAULT_DATA = {
  subscribers: [],
  scheduledMessages: [],
  broadcastHistory: [],
};

let db = null;

function initDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    } catch {
      db = { ...DEFAULT_DATA };
    }
  } else {
    db = { ...DEFAULT_DATA };
  }

  if (!db.subscribers) db.subscribers = [];
  if (!db.scheduledMessages) db.scheduledMessages = [];
  if (!db.broadcastHistory) db.broadcastHistory = [];

  saveDB();
  console.log(`資料庫已載入，訂閱者: ${db.subscribers.length} 人`);
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

function upsertSubscriber(psid, fields = {}) {
  let sub = db.subscribers.find((s) => s.psid === psid);
  if (sub) {
    Object.assign(sub, fields);
    sub.lastInteraction = new Date().toISOString();
  } else {
    sub = {
      psid,
      name: null,
      phone: null,
      email: null,
      events: [],
      firstSeen: new Date().toISOString(),
      lastInteraction: new Date().toISOString(),
      active: true,
      ...fields,
    };
    db.subscribers.push(sub);
  }
  saveDB();
  return sub;
}

function addEventToSubscriber(psid, eventName) {
  const sub = db.subscribers.find((s) => s.psid === psid);
  if (sub && !sub.events.includes(eventName)) {
    sub.events.push(eventName);
    saveDB();
  }
}

function getAllSubscribers(filter) {
  let list = db.subscribers.filter((s) => s.active !== false);
  if (filter && filter.event) {
    list = list.filter((s) => s.events && s.events.includes(filter.event));
  }
  return list;
}

function getSubscriber(psid) {
  return db.subscribers.find((s) => s.psid === psid) || null;
}

function addScheduledMessage({ text, sendAt, targetGroup, useEventTag }) {
  const msg = {
    id: crypto.randomUUID(),
    text,
    sendAt,
    targetGroup: targetGroup || "all",
    useEventTag: !!useEventTag,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.scheduledMessages.push(msg);
  saveDB();
  return msg;
}

function getDueMessages() {
  const now = new Date().toISOString();
  return db.scheduledMessages.filter(
    (m) => m.status === "pending" && m.sendAt <= now
  );
}

function updateMessageStatus(id, status) {
  const msg = db.scheduledMessages.find((m) => m.id === id);
  if (msg) {
    msg.status = status;
    saveDB();
  }
}

function deleteScheduledMessage(id) {
  db.scheduledMessages = db.scheduledMessages.filter((m) => m.id !== id);
  saveDB();
}

function getScheduledMessages() {
  return db.scheduledMessages.filter((m) => m.status === "pending");
}

function getAllScheduledMessages() {
  return db.scheduledMessages;
}

function addBroadcastRecord(record) {
  db.broadcastHistory.push({
    id: crypto.randomUUID(),
    ...record,
    sentAt: new Date().toISOString(),
  });
  if (db.broadcastHistory.length > 100) {
    db.broadcastHistory = db.broadcastHistory.slice(-100);
  }
  saveDB();
}

function getBroadcastHistory() {
  return db.broadcastHistory.slice().reverse();
}

module.exports = {
  initDB,
  upsertSubscriber,
  addEventToSubscriber,
  getAllSubscribers,
  getSubscriber,
  addScheduledMessage,
  getDueMessages,
  updateMessageStatus,
  deleteScheduledMessage,
  getScheduledMessages,
  getAllScheduledMessages,
  addBroadcastRecord,
  getBroadcastHistory,
};
