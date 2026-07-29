const fs = require("fs");
const path = require("path");

const KEYWORDS_PATH = path.join(__dirname, "../config/keywords.json");

function loadKeywords() {
  const raw = fs.readFileSync(KEYWORDS_PATH, "utf-8");
  return JSON.parse(raw).keywords;
}

const SKIP_TO_AI_PATTERNS = [
  "退費", "退款", "退錢", "不準", "不滿意", "投訴", "客訴",
  "騙錢", "沒有用", "沒效果", "不值得", "太貴", "後悔",
  "取消", "不想上", "不想要",
  "怎麼辦", "學不會", "不會", "不懂", "不了解",
  "擔心", "害怕", "可以嗎", "好嗎", "適合嗎",
  "請問", "為什麼", "為何", "如果", "萬一",
  "已經報名", "報名了", "報過名", "我報了"
];

function findKeywordMatch(messageText) {
  const text = messageText.toLowerCase();

  if (text.length > 10) {
    const isQuestion = SKIP_TO_AI_PATTERNS.some(p => text.includes(p));
    if (isQuestion) {
      return null;
    }
  }

  const keywords = loadKeywords();

  for (const entry of keywords) {
    for (const trigger of entry.triggers) {
      if (text.includes(trigger.toLowerCase())) {
        return entry;
      }
    }
  }
  return null;
}

module.exports = { findKeywordMatch };
