const fs = require("fs");
const path = require("path");

const KEYWORDS_PATH = path.join(__dirname, "../config/keywords.json");

function loadKeywords() {
  const raw = fs.readFileSync(KEYWORDS_PATH, "utf-8");
  return JSON.parse(raw).keywords;
}

function findKeywordMatch(messageText) {
  const text = messageText.toLowerCase();
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
