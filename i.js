const ws = new WebSocket('ws://localhost:8080');
let myId, peerId, pc, dc;

// === ICE-очередь ===
let pendingCandidates = [];
let remoteDescriptionSet = false;

const $ = (id) => document.getElementById(id);

ws.onmessage = async (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === 'welcome') {
    myId = msg.id;
    $('myId').textContent = myId;
  }

  if (msg.type === 'users') {
    console.log('Online:', msg.users);
  }

  if (msg.type === 'offer') {
    await handleOffer(msg);
  }

  if (msg.type === 'answer') {
    await pc.setRemoteDescription(msg.answer);
    remoteDescriptionSet = true;
    await drainPendingCandidates();
  }

  if (msg.type === 'ice') {
    await handleRemoteIce(msg.candidate);
  }

  if (msg.type === 'chat') {
    addMessage('peer', msg.text);
  }
};

// === Работа с ICE ===

async function handleRemoteIce(candidate) {
  // Если pc ещё нет — кладём в буфер (пригодится, если ice пришёл до offer)
  if (!pc || !remoteDescriptionSet) {
    pendingCandidates.push(candidate);
    return;
  }
  try {
    await pc.addIceCandidate(candidate);
  } catch (err) {
    console.warn('Ошибка addIceCandidate:', err);
  }
}

async function drainPendingCandidates() {
  const queue = pendingCandidates;
  pendingCandidates = [];
  for (const c of queue) {
    try {
      await pc.addIceCandidate(c);
    } catch (err) {
      console.warn('Ошибка addIceCandidate (из очереди):', err);
    }
  }
}

function createPeerConnection() {
  const conn = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  conn.onicecandidate = (e) => {
    if (e.candidate && peerId) {
      ws.send(JSON.stringify({ type: 'ice', to: peerId, candidate: e.candidate }));
    }
  };

  conn.onconnectionstatechange = () => {
    console.log('Connection state:', conn.connectionState);
  };

  return conn;
}

// === Подключение (клиент A) ===

$('connectBtn').onclick = async () => {
  peerId = $('peerId').value.trim();
  if (!peerId) return alert('Введи ID собеседника');
  if (peerId === myId) return alert('Нельзя подключиться к себе');

  // Сброс очереди при новом соединении
  pendingCandidates = [];
  remoteDescriptionSet = false;

  pc = createPeerConnection();

  dc = pc.createDataChannel('chat');
  setupDataChannel(dc);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', to: peerId, offer }));
};

// === Приём offer (клиент B) ===

async function handleOffer(msg) {
  peerId = msg.from;

  pendingCandidates = [];
  remoteDescriptionSet = false;

  pc = createPeerConnection();

  pc.ondatachannel = (e) => {
    dc = e.channel;
    setupDataChannel(dc);
  };

  await pc.setRemoteDescription(msg.offer);
  remoteDescriptionSet = true;
  await drainPendingCandidates();

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: 'answer', to: peerId, answer }));
}

// === DataChannel и UI ===

function setupDataChannel(channel) {
  channel.onopen = () => {
    $('status').textContent = 'P2P соединение установлено';
  };
  channel.onclose = () => {
    $('status').textContent = 'P2P соединение закрыто';
  };
  channel.onmessage = (e) => addMessage('peer', e.data);
}

$('sendBtn').onclick = () => {
  const text = $('msgInput').value.trim();
  if (!text) return;

  if (dc && dc.readyState === 'open') {
    dc.send(text);
    addMessage('me', text);
  } else if (peerId) {
    ws.send(JSON.stringify({ type: 'chat', to: peerId, text }));
    addMessage('me', text + ' (через сервер)');
  } else {
    alert('Сначала подключись к собеседнику');
  }

  $('msgInput').value = '';
};

function addMessage(who, text) {
  const li = document.createElement('li');
  li.textContent = `${who === 'me' ? 'Я' : 'Собеседник'}: ${text}`;
  $('messages').appendChild(li);
}

