function buildLineMessage() {
  const lineUrl = process.env.LINE_URL;
  if (!lineUrl) return null;

  return [
    {
      text: "👇 點下面按鈕加我的 LINE，老師會親自回覆你喔！",
    },
    {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "加入 LINE 官方帳號",
          buttons: [
            {
              type: "web_url",
              url: lineUrl,
              title: "加入 LINE ❤️",
            },
          ],
        },
      },
    },
  ];
}

module.exports = { buildLineMessage };
