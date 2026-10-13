const ws = new WebSocket('ws://localhost:8080');
let myId, peerId, pc, dc;

const $ = (id) => document.getElementById(id);

ws.onmessage = async (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === 'welcome') {
    myId = msg.id;
    $('myId').textContent = myId;
  }

  if (msg.type === 'users') {
    // Можно вывести список онлайн-пользователей
    console.log('Online:', msg.users);
  }

  if (msg.type === 'offer') {
    await handleOffer(msg);
  }

  if (msg.type === 'answer') {
    await pc.setRemoteDescription(msg.answer);
  }

  if (msg.type === 'ice') {
    if (pc) await pc.addIceCandidate(msg.candidate);
  }

  // Fallback: сообщение пришло через сервер
  if (msg.type === 'chat') {
    addMessage('peer', msg.text);
  }
};

$('connectBtn').onclick = async () => {
  peerId = $('peerId').value.trim();
  if (!peerId) return alert('Введи ID собеседника');

  pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  dc = pc.createDataChannel('chat');
  setupDataChannel(dc);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: 'ice', to: peerId, candidate: e.candidate }));
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', to: peerId, offer }));
};

async function handleOffer(msg) {
  peerId = msg.from;
  pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  pc.ondatachannel = (e) => {
    dc = e.channel;
    setupDataChannel(dc);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: 'ice', to: peerId, candidate: e.candidate }));
    }
  };

  await pc.setRemoteDescription(msg.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: 'answer', to: peerId, answer }));
}

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
    // Fallback через сервер
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
