const { sendTextMessage } = require("./messenger");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function broadcastMessage(text, subscribers, useEventTag = false) {
  const result = {
    text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
    recipientCount: subscribers.length,
    successCount: 0,
    failCount: 0,
  };

  console.log(
    `開始群發訊息給 ${subscribers.length} 位訂閱者 (活動標籤: ${useEventTag})`
  );

  for (const sub of subscribers) {
    try {
      const res = await sendTextMessage(sub.psid, text, { useEventTag });
      if (res.success) {
        result.successCount++;
      } else {
        result.failCount++;
        console.error(`群發失敗 [${sub.psid}]:`, JSON.stringify(res.error));
      }
    } catch (err) {
      result.failCount++;
      console.error(`群發異常 [${sub.psid}]:`, err.message);
    }
    await sleep(300);
  }

  console.log(
    `群發完成: 成功 ${result.successCount}, 失敗 ${result.failCount}`
  );
  return result;
}

module.exports = { broadcastMessage };
