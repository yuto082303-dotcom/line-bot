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

const userState = {};

async function handleEvent(event) {
  const userId = event.source.userId;

  // 部屋探しスタート
if (event.type === 'message' && event.message.text === 'お部屋を探す') {
    userState[userId] = { step: 'area' };
    return sendWelcome(event.replyToken);
  }

  // テキスト入力の処理
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text;
    const s = userState[userId];
    if (!s) return;

    if (s.step === 'area')    { s.area = text;    s.step = 'rent';    return sendQ2(event.replyToken); }
    if (s.step === 'rent_free')    { s.rent = text;    s.step = 'madori'; return sendQ3(event.replyToken); }
    if (s.step === 'madori_free')  { s.madori = text;  s.step = 'station'; return sendQ4(event.replyToken); }
    if (s.step === 'station_free') { s.station = text;  s.step = 'initial'; return sendQ5(event.replyToken); }
    if (s.step === 'initial_free') { s.initial = text;  s.step = 'move_in'; return sendQ6(event.replyToken); }
    if (s.step === 'move_in_free') {
      s.move_in = text;
      await recordToSheet(userId, s);
      delete userState[userId];
      return sendComplete(event.replyToken);
    }
  }

  // ボタン選択の処理
  if (event.type === 'postback') {
    const data = event.postback.data;
    const s = userState[userId];
    if (!s) return;

    // 「その他を入力」ボタン
    if (data === 'free_rent')    { s.step = 'rent_free';    return askFreeInput(event.replyToken, '家賃', '例）17万円、20万円など'); }
    if (data === 'free_madori')  { s.step = 'madori_free';  return askFreeInput(event.replyToken, '間取り', '例）1SLDK、メゾネットなど'); }
    if (data === 'free_station') { s.step = 'station_free'; return askFreeInput(event.replyToken, '駅徒歩', '例）20分以内、バス利用OKなど'); }
    if (data === 'free_initial') { s.step = 'initial_free'; return askFreeInput(event.replyToken, '初期費用', '例）80万円以下など'); }
    if (data === 'free_move_in') { s.step = 'move_in_free'; return askFreeInput(event.replyToken, '入居時期', '例）2ヶ月以内、来年4月など'); }

    // 通常のボタン選択
    const [key, value] = data.split('=');
    s[key] = value;

    if (!s.madori)  { s.step = 'madori';  return sendQ3(event.replyToken); }
    if (!s.station) { s.step = 'station'; return sendQ4(event.replyToken); }
    if (!s.initial) { s.step = 'initial'; return sendQ5(event.replyToken); }
    if (!s.move_in) { s.step = 'move_in'; return sendQ6(event.replyToken); }

    await recordToSheet(userId, s);
    delete userState[userId];
    return sendComplete(event.replyToken);
  }
}

// ウェルカム＋Q1
function sendWelcome(replyToken) {
  return client.replyMessage(replyToken, [
    {
      type: 'text',
      text: '7つの質問に答えるだけで\nあなたにぴったりの物件をご提案します！\n\nまずはエリアから教えてください😊'
    },
    {
      type: 'text',
      text: 'Q.1 希望エリアを入力してください。\n\n例）福岡市中央区、博多駅周辺など'
    }
  ]);
}

// Q2：家賃
function sendQ2(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.2 家賃はどのくらいをお考えですか？',
    quickReply: {
      items: [
        btn('5〜8万円',   'rent=5-8'),
        btn('9〜12万円',  'rent=9-12'),
        btn('13〜15万円', 'rent=13-15'),
        btn('15万円以上', 'rent=15plus'),
        btn('その他を入力','free_rent'),
      ]
    }
  });
}

// Q3：間取り
function sendQ3(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.3 ご希望の間取りを教えてください。',
    quickReply: {
      items: [
        btn('1R・1K',    'madori=1K'),
        btn('1LDK',      'madori=1LDK'),
        btn('2LDK',      'madori=2LDK'),
        btn('3LDK以上',  'madori=3LDK+'),
        btn('その他を入力','free_madori'),
      ]
    }
  });
}

// Q4：駅徒歩
function sendQ4(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.4 駅までの徒歩距離はどのくらいをご希望ですか？',
    quickReply: {
      items: [
        btn('5分以内',      'station=5min'),
        btn('10分以内',     'station=10min'),
        btn('15分以内',     'station=15min'),
        btn('こだわらない', 'station=any'),
        btn('その他を入力', 'free_station'),
      ]
    }
  });
}

// Q5：初期費用
function sendQ5(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.5 初期費用のご予算はどのくらいですか？',
    quickReply: {
      items: [
        btn('30万円以下',   'initial=30'),
        btn('50万円以下',   'initial=50'),
        btn('70万円以下',   'initial=70'),
        btn('こだわらない', 'initial=any'),
        btn('その他を入力', 'free_initial'),
      ]
    }
  });
}

// Q6：入居時期
function sendQ6(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: 'Q.6 入居希望時期を教えてください。',
    quickReply: {
      items: [
        btn('即入居希望',   'move_in=now'),
        btn('1週間以内',    'move_in=1week'),
        btn('2週間以内',    'move_in=2week'),
        btn('1ヶ月以内',    'move_in=1month'),
        btn('未定',         'move_in=undecided'),
        btn('その他を入力', 'free_move_
