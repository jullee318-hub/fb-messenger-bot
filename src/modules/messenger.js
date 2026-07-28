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
    return { success: false, error };
  }
  return { success: true };
}

async function sendTextMessage(recipientId, text, options = {}) {
  const body = {
    recipient: { id: recipientId },
    message: { text },
  };

  if (options.useEventTag) {
    body.messaging_type = "MESSAGE_TAG";
    body.tag = "CONFIRMED_EVENT_UPDATE";
  }

  return callSendAPI(body);
}

module.exports = { callSendAPI, sendTextMessage };
