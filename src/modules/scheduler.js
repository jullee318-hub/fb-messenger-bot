const cron = require("node-cron");
const {
  getDueMessages,
  updateMessageStatus,
  getAllSubscribers,
  addBroadcastRecord,
} = require("./database");
const { broadcastMessage } = require("./broadcast");

function startScheduler() {
  cron.schedule("* * * * *", async () => {
    const dueMessages = getDueMessages();
    if (dueMessages.length === 0) return;

    console.log(`排程檢查: 發現 ${dueMessages.length} 則到期訊息`);

    for (const msg of dueMessages) {
      try {
        let subscribers;
        if (msg.targetGroup && msg.targetGroup.startsWith("event:")) {
          const eventName = msg.targetGroup.replace("event:", "");
          subscribers = getAllSubscribers({ event: eventName });
        } else {
          subscribers = getAllSubscribers();
        }

        if (subscribers.length === 0) {
          console.log(`排程 [${msg.id}]: 沒有符合條件的訂閱者，跳過`);
          updateMessageStatus(msg.id, "skipped");
          continue;
        }

        const result = await broadcastMessage(
          msg.text,
          subscribers,
          msg.useEventTag
        );
        updateMessageStatus(msg.id, "sent");
        addBroadcastRecord(result);
        console.log(`排程 [${msg.id}]: 發送完成`);
      } catch (err) {
        console.error(`排程 [${msg.id}] 發送失敗:`, err.message);
        updateMessageStatus(msg.id, "failed");
      }
    }
  });

  console.log("📅 排程系統已啟動（每分鐘檢查一次）");
}

module.exports = { startScheduler };
