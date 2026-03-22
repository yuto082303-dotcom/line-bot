const express = require('express');
const line = require('@line/bot-sdk');

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

// ユーザーの進捗を一時保存
const userState = {};

async function handleEvent(event) {
  const userId = event.source.userId;

  // 部屋探しスタート
  if (event.type === 'message' && event.message.text === '部屋探し') {
    userState[userId] = {};
    return sendWelcome(event.replyToken);
  }

  // Q.1 エリアのテキスト入力を受け取る
  if (event.type === 'message' && userState[userId] && !userState[userId].area) {
    userState[userId].area = event.message.text;
    return sendQ2(event.replyToken, userId);
  }

  // Q.2〜Q.6 ボタン選択
  if (event.type === 'postback') {
    const data = event.postback.data;
    const [key, value] = data.split('=');

    if (!userState[userId]) userState[userId] = {};
    userState[userId][key] = value;

    const s = userState[userId];

    if (!s.rent)    return sendQ3(event.replyToken, userId);
    if (!s.madori)  return sendQ4(event.replyToken, userId);
    if (!s.station) return sendQ5(event.replyToken, userId);
    if (!s.initial) return sendQ6(event.replyToken, userId);
    if (!s.move_in) {
      await recordToSheet(userId, s);
      delete userState[userId];
      return sendComplete(event.replyToken);
    }
  }
}

  // Q.1 エリアのテキスト入力を受け取る
  if (event.type === 'message' && userState[userId] && !userState[userId].area) {
    userState[userId].area = event.message.text;
    return sendQ2(event.replyToken, userId);
  }

  // Q.2〜Q.6 ボタン選択
  if (event.type === 'postback') {
    const data = event.postback.data;
    const [key, value] = data.split('=');
    if (userState[userId]) {
      userState[userId][key] = value;
    }

    const s = userState[userId] || {};
    if (!s.rent)    return sendQ3(event.replyToken, userId);
    if (!s.madori)  return sendQ4(event.replyToken, userId);
    if (!s.station) return sendQ5(event.replyToken, userId);
    if (!s.initial) return sendQ6(event.replyToken, userId);
    if (!s.move_in) {
      await recordToSheet(userId, s);
      delete userState[userId];
      return sendComplete(event.replyToken);
    }
  }
}

// ウェルカム＋Q1（エリアテキスト入力）
function sendWelcome(replyToken) {
  return client.replyMessage(replyToken, [
    {
      type: 'text',
      text: '🏠 物件探し、AIにお任せください！\n\n条件を教えていただくだけで\nぴったりの物件をご提案します✨'
    },
    {
      type: 'text',
      text: 'Q.1 希望エリアを入力してください。\n\n例）福岡市中央区、博多駅周辺など'
    }
  ]);
}

// Q2：家賃
function sendQ2(replyToken, userId) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.2 家賃はどのくらいをお考えですか？',
    quickReply: {
      items: [
        btn('5〜8万円',  'rent=5-8'),
        btn('9〜12万円', 'rent=9-12'),
        btn('13〜15万円','rent=13-15'),
        btn('15万円以上','rent=15plus'),
      ]
    }
  });
}

// Q3：間取り
function sendQ3(replyToken, userId) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.3 ご希望の間取りを教えてください。',
    quickReply: {
      items: [
        btn('1R・1K',   'madori=1K'),
        btn('1LDK',     'madori=1LDK'),
        btn('2LDK',     'madori=2LDK'),
        btn('3LDK以上', 'madori=3LDK+'),
      ]
    }
  });
}

// Q4：駅徒歩
function sendQ4(replyToken, userId) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.4 駅までの徒歩距離はどのくらいをご希望ですか？',
    quickReply: {
      items: [
        btn('5分以内',     'station=5min'),
        btn('10分以内',    'station=10min'),
        btn('15分以内',    'station=15min'),
        btn('こだわらない','station=any'),
      ]
    }
  });
}

// Q5：初期費用
function sendQ5(replyToken, userId) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.5 初期費用のご予算はどのくらいですか？',
    quickReply: {
      items: [
        btn('30万円以下',  'initial=30'),
        btn('50万円以下',  'initial=50'),
        btn('70万円以下',  'initial=70'),
        btn('こだわらない','initial=any'),
      ]
    }
  });
}

// Q6：入居時期
function sendQ6(replyToken, userId) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.6 入居希望時期を教えてください。',
    quickReply: {
      items: [
        btn('即入居希望',  'move_in=now'),
        btn('1週間以内',   'move_in=1week'),
        btn('2週間以内',   'move_in=2week'),
        btn('1ヶ月以内',   'move_in=1month'),
        btn('未定',        'move_in=undecided'),
      ]
    }
  });
}

// 完了メッセージ
function sendComplete(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'ありがとうございます！🎉\n\nご希望条件を受け付けました。\nAIが条件に合う物件を探しています🔍\n\n担当より物件情報をお送りしますので\nしばらくお待ちください😊'
  });
}

// スプレッドシートに記録
async function recordToSheet(userId, params) {
  const gasUrl = process.env.GAS_URL +
    '?userId='   + encodeURIComponent(userId) +
    '&area='     + encodeURIComponent(params.area     || '') +
    '&rent='     + encodeURIComponent(params.rent     || '') +
    '&madori='   + encodeURIComponent(params.madori   || '') +
    '&station='  + encodeURIComponent(params.station  || '') +
    '&initial='  + encodeURIComponent(params.initial  || '') +
    '&move_in='  + encodeURIComponent(params.move_in  || '');
  await fetch(gasUrl);
}

function btn(label, data) {
  return {
    type: 'action',
    action: { type: 'postback', label, data, displayText: label }
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
