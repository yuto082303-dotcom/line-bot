const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

const client = new line.Client(lineConfig);

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  res.status(200).end();
  Promise.all(req.body.events.map(handleEvent));
});

async function handleEvent(event) {
  if (event.type === 'message' && event.message.text === '部屋探し') {
    return sendQ1(event.replyToken);
  }
  if (event.type === 'postback') {
    const data = event.postback.data;
    const params = parseData(data);
    if (!params.rent) return sendQ2(event.replyToken, data);
    if (!params.station) return sendQ3(event.replyToken, data);
    if (!params.madori) {
      await recordToSheet(event.source.userId, params);
      return sendComplete(event.replyToken);
    }
  }
}

function sendQ1(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.1 お部屋の家賃はどのくらいをお考えですか？',
    quickReply: {
      items: [
        btn('5〜8万円',  'rent=5-8'),
        btn('9〜12万円', 'rent=9-12'),
        btn('15万円以上','rent=15plus'),
        btn('その他',    'rent=other'),
      ]
    }
  });
}

function sendQ2(replyToken, prevData) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.2 駅までの距離はどのくらいがご希望ですか？',
    quickReply: {
      items: [
        btn('徒歩5分以内',  prevData + '&station=5min'),
        btn('徒歩7分以内',  prevData + '&station=7min'),
        btn('徒歩10分以内', prevData + '&station=10min'),
        btn('こだわらない', prevData + '&station=any'),
      ]
    }
  });
}

function sendQ3(replyToken, prevData) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.3 ご希望の間取りを教えてください。',
    quickReply: {
      items: [
        btn('1R・1K',   prevData + '&madori=1K'),
        btn('1LDK',     prevData + '&madori=1LDK'),
        btn('2LDK',     prevData + '&madori=2LDK'),
        btn('3LDK以上', prevData + '&madori=3LDK+'),
      ]
    }
  });
}

function sendComplete(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'ありがとうございます！\nご希望条件を受け付けました。\nスタッフより改めてご連絡いたします😊'
  });
}

async function recordToSheet(userId, params) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: 'A:E',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[now, userId, params.rent, params.station, params.madori]]
    }
  });
}

function btn(label, data) {
  return {
    type: 'action',
    action: { type: 'postback', label, data, displayText: label }
  };
}

function parseData(data) {
  const obj = {};
  data.split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k) obj[k] = v;
  });
  return obj;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
