const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const armyEl = document.getElementById("army");
const stageEl = document.getElementById("stage");
const rankEl = document.getElementById("rank");
const toastEl = document.getElementById("toast");
const comboEl = document.getElementById("combo");
const actionBtn = document.getElementById("actionBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const resultEl = document.getElementById("result");
const resultKicker = document.getElementById("resultKicker");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const restartBtn = document.getElementById("restartBtn");

const ROAD_MARGIN = 58;
const ranks = ["農民", "足軽", "武士", "家老", "大名", "天下人"];
const events = [
  { text: "信長に気に入られた！", delta: 18 },
  { text: "茶会で支持率UP！", delta: 12 },
  { text: "鉄砲伝来！", delta: 25 },
  { text: "家臣が裏切った！", factor: 0.72 },
  { text: "兵糧を横取りした！", delta: 16 },
  { text: "謎の軍師が加入！", factor: 1.28 },
  { text: "疫病が流行った！", factor: 0.66 },
  { text: "下剋上の噂が広まる！", delta: 30 },
];

let state;
let audioCtx;
let lastTime = 0;
let toastTimer = 0;
let keys = { left: false, right: false };
let touchStartX = 0;
let touchStartTargetX = 0;

function resetGame(nextStage = 1) {
  const requirement = 105 + nextStage * 35;
  state = {
    mode: "ready",
    stage: nextStage,
    army: 3,
    rankIndex: Math.min(nextStage - 1, ranks.length - 1),
    distance: 0,
    x: 0,
    targetX: 0,
    speed: 0,
    trackLength: 5600 + nextStage * 400,
    requirement,
    gates: [],
    eventMarkers: [],
    particles: [],
    shake: 0,
    castleHit: 0,
    winDelay: 0,
  };
  state.x = canvas.width / 2;
  state.targetX = state.x;
  buildStage();
  updateHud();
  hideResult();
  showToast("農民3人、天下を狙う");
}

function buildStage() {
  const plus = [
    { label: "+10 農民", type: "add", value: 10, good: true },
    { label: "x2 兵力", type: "mul", value: 2, good: true },
    { label: "+鉄砲隊", type: "add", value: 24, good: true },
    { label: "+騎馬隊", type: "add", value: 18, good: true },
    { label: "+兵糧", type: "add", value: 14, good: true },
  ];
  const minus = [
    { label: "-一揆", type: "add", value: -14, good: false },
    { label: "-裏切り", type: "mul", value: 0.62, good: false },
    { label: "兵糧不足", type: "add", value: -18, good: false },
    { label: "疫病", type: "mul", value: 0.55, good: false },
    { label: "÷2 兵力", type: "mul", value: 0.5, good: false },
  ];

  for (let z = 520; z < state.trackLength - 650; z += 590) {
    const leftGood = Math.random() > 0.42;
    state.gates.push({
      z,
      passed: false,
      left: sample(leftGood ? plus : minus),
      right: sample(leftGood ? minus : plus),
    });
  }

  for (let z = 890; z < state.trackLength - 850; z += 880) {
    state.eventMarkers.push({ z, used: false, event: sample(events) });
  }
}

function sample(list) {
  return { ...list[Math.floor(Math.random() * list.length)] };
}

function startGame() {
  if (state.mode === "ready") {
    unlockAudio();
    state.mode = "run";
    state.speed = 178;
    actionBtn.textContent = "突撃";
    showToast("下剋上開始！");
    drum(90, 0.04);
  } else if (state.mode === "castle") {
    resolveCastle();
  } else if (state.mode === "result") {
    restart();
  }
}

function update(dt) {
  if (state.mode === "run") {
    state.distance += state.speed * dt;
    const input = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (input) moveBy(input * 340 * dt);
    state.x += (state.targetX - state.x) * Math.min(1, dt * 13);
    checkGates();
    checkEvents();
    if (state.distance >= state.trackLength) enterCastle();
  }

  if (state.mode === "castle") {
    state.castleHit += dt;
    state.winDelay += dt;
    if (state.winDelay > 0.9) resolveCastle();
  }

  state.shake *= 0.88;
  state.particles = state.particles.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    return p.life > 0;
  });

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toastEl.classList.remove("show");
  }
}

function clampX(value) {
  return Math.max(ROAD_MARGIN, Math.min(canvas.width - ROAD_MARGIN, value));
}

function moveBy(amount) {
  const before = state.targetX;
  state.targetX = clampX(state.targetX + amount);
  if (Math.abs(state.targetX - before) > 4) tick(360, 0.018);
}

function checkGates() {
  for (const gate of state.gates) {
    if (gate.passed || state.distance < gate.z) continue;
    gate.passed = true;
    const pick = state.x < canvas.width / 2 ? gate.left : gate.right;
    applyGate(pick);
  }
}

function checkEvents() {
  for (const marker of state.eventMarkers) {
    if (marker.used || state.distance < marker.z) continue;
    marker.used = true;
    const event = marker.event;
    const before = state.army;
    if (event.delta) setArmy(state.army + event.delta);
    if (event.factor) setArmy(Math.max(1, Math.floor(state.army * event.factor)));
    showToast(event.text);
    combo(`${state.army >= before ? "+" : ""}${state.army - before}`);
    burst(state.x, canvas.height * 0.68, state.army >= before ? "#f7b538" : "#d73b2e", 16);
    drum(140, 0.035);
  }
}

function applyGate(gate) {
  const before = state.army;
  if (gate.type === "add") setArmy(state.army + gate.value);
  if (gate.type === "mul") setArmy(Math.floor(state.army * gate.value));
  const diff = state.army - before;
  showToast(gate.label);
  combo(diff >= 0 ? `+${diff}` : `${diff}`);
  burst(state.x, canvas.height * 0.64, gate.good ? "#22a06b" : "#d73b2e", gate.good ? 22 : 14);
  state.shake = gate.good ? 5 : 9;
  gate.good ? fanfare() : slash();
}

function enterCastle() {
  state.mode = "castle";
  state.speed = 0;
  state.winDelay = 0;
  actionBtn.textContent = "攻城";
  showToast(`城兵 ${state.requirement} 人`);
  drum(80, 0.07);
}

function resolveCastle() {
  if (state.mode === "result") return;
  state.mode = "result";
  const win = state.army >= state.requirement;
  if (win) {
    state.rankIndex = Math.min(state.rankIndex + 1, ranks.length - 1);
    resultKicker.textContent = ranks[state.rankIndex] === "天下人" ? "天下統一" : "勝利";
    resultTitle.textContent = ranks[state.rankIndex] === "天下人" ? "天下を取った！" : "城を落とした！";
    resultText.textContent = `${ranks[state.rankIndex]}へ昇格。兵力${state.army}で押し切った。`;
    actionBtn.textContent = "次の戦";
    fanfare(true);
  } else {
    resultKicker.textContent = "敗北";
    resultTitle.textContent = "城門で解散！";
    resultText.textContent = `あと${state.requirement - state.army}人。成り上がり失敗。`;
    actionBtn.textContent = "再出陣";
    slash();
  }
  resultEl.hidden = false;
}

function setArmy(value) {
  state.army = Math.max(1, Math.min(9999, Math.floor(value)));
  updateHud();
}

function updateHud() {
  armyEl.textContent = state.army;
  stageEl.textContent = state.stage;
  rankEl.textContent = ranks[state.rankIndex];
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  toastTimer = 1.45;
}

function combo(text) {
  comboEl.textContent = text;
  comboEl.classList.remove("pop");
  void comboEl.offsetWidth;
  comboEl.classList.add("pop");
}

function hideResult() {
  resultEl.hidden = true;
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 180;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      color,
      life: 0.45 + Math.random() * 0.35,
    });
  }
}

function draw() {
  const shakeX = (Math.random() - 0.5) * state.shake;
  const shakeY = (Math.random() - 0.5) * state.shake;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-20, -20, canvas.width + 40, canvas.height + 40);
  drawWorld();
  drawGates();
  drawEventMarkers();
  drawCastle();
  drawCrowd();
  drawParticles();
  ctx.restore();
}

function drawWorld() {
  const w = canvas.width;
  const h = canvas.height;
  const roadW = 260;
  ctx.fillStyle = "#6baa58";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#c89b55";
  ctx.beginPath();
  ctx.moveTo(w / 2 - roadW * 0.34, 0);
  ctx.lineTo(w / 2 + roadW * 0.34, 0);
  ctx.lineTo(w / 2 + roadW * 0.68, h);
  ctx.lineTo(w / 2 - roadW * 0.68, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(78, 54, 32, 0.25)";
  ctx.lineWidth = 4;
  for (let z = -80; z < h + 80; z += 70) {
    const y = ((z + state.distance * 0.8) % 70) - 20;
    ctx.beginPath();
    ctx.moveTo(w / 2 - roadW * 0.48, y);
    ctx.lineTo(w / 2 + roadW * 0.48, y);
    ctx.stroke();
  }

  for (let i = 0; i < 7; i++) {
    const y = (i * 140 + state.distance * 0.42) % (h + 120) - 80;
    drawBanner(24 + (i % 2) * 322, y, i % 3);
  }
}

function drawBanner(x, y, type) {
  ctx.fillStyle = "#3d2d24";
  ctx.fillRect(x, y, 5, 48);
  ctx.fillStyle = ["#d73b2e", "#2374ab", "#f7b538"][type];
  ctx.fillRect(x + 5, y + 4, 28, 24);
  ctx.fillStyle = "#fff8e6";
  ctx.beginPath();
  ctx.arc(x + 19, y + 16, 5, 0, Math.PI * 2);
  ctx.fill();
}

function projectZ(z) {
  return canvas.height - 120 - (z - state.distance) * 0.72;
}

function drawGates() {
  for (const gate of state.gates) {
    const y = projectZ(gate.z);
    if (y < -120 || y > canvas.height + 80 || gate.passed) continue;
    drawGate(canvas.width / 2 - 72, y, gate.left);
    drawGate(canvas.width / 2 + 72, y, gate.right);
  }
}

function drawGate(x, y, gate) {
  const width = 116;
  const height = 76;
  ctx.fillStyle = gate.good ? "#1f9f72" : "#d73b2e";
  roundRect(x - width / 2, y - height / 2, width, height, 8);
  ctx.fill();
  ctx.strokeStyle = "#191715";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#fff8e6";
  ctx.font = "900 20px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapText(gate.label, x, y, 96, 23);
}

function drawEventMarkers() {
  for (const marker of state.eventMarkers) {
    const y = projectZ(marker.z);
    if (y < -80 || y > canvas.height + 80 || marker.used) continue;
    ctx.fillStyle = "#fff8e6";
    roundRect(canvas.width / 2 - 86, y - 18, 172, 36, 8);
    ctx.fill();
    ctx.strokeStyle = "#191715";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#191715";
    ctx.font = "900 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("戦国イベント", canvas.width / 2, y + 1);
  }
}

function drawCastle() {
  const y = projectZ(state.trackLength + 130);
  if (y < -240 || y > canvas.height + 260) return;
  const x = canvas.width / 2;
  ctx.fillStyle = "#51453d";
  ctx.fillRect(x - 100, y + 62, 200, 90);
  ctx.fillStyle = "#efe4cf";
  ctx.fillRect(x - 76, y + 12, 152, 88);
  ctx.fillStyle = "#2d2a28";
  ctx.beginPath();
  ctx.moveTo(x - 92, y + 20);
  ctx.lineTo(x, y - 34 - Math.sin(state.castleHit * 16) * 5);
  ctx.lineTo(x + 92, y + 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7a4f2a";
  ctx.fillRect(x - 24, y + 92, 48, 60);
  ctx.fillStyle = "#fff8e6";
  ctx.font = "950 18px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`必要 ${state.requirement}`, x, y + 128);
}

function drawCrowd() {
  const shown = Math.min(92, state.army);
  const cols = Math.ceil(Math.sqrt(shown));
  const spacing = Math.max(11, Math.min(20, 165 / cols));
  const startY = canvas.height * 0.7;
  for (let i = 0; i < shown; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = state.x + (col - cols / 2) * spacing + (row % 2) * 4;
    const y = startY + row * spacing * 0.82 + Math.sin(performance.now() / 90 + i) * 1.6;
    drawUnit(x, y, i);
  }

  ctx.fillStyle = "#191715";
  ctx.font = "1000 34px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#fff8e6";
  ctx.strokeText(state.army, state.x, startY - 36);
  ctx.fillText(state.army, state.x, startY - 36);
}

function drawUnit(x, y, i) {
  const palette = ["#fff8e6", "#e8c36a", "#2374ab", "#d73b2e"];
  ctx.fillStyle = "#191715";
  ctx.beginPath();
  ctx.arc(x, y - 9, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette[(i + state.rankIndex) % palette.length];
  ctx.fillRect(x - 5, y - 5, 10, 12);
  ctx.strokeStyle = "#191715";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 4);
  ctx.lineTo(x + 8, y + 4);
  ctx.moveTo(x - 3, y + 7);
  ctx.lineTo(x - 7, y + 14);
  ctx.moveTo(x + 3, y + 7);
  ctx.lineTo(x + 7, y + 14);
  ctx.stroke();
  if (state.rankIndex >= 2) {
    ctx.strokeStyle = "#d8d0be";
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 7);
    ctx.lineTo(x + 15, y - 18);
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const chars = text.split("");
  let lines = [""];
  for (const ch of chars) {
    const next = lines[lines.length - 1] + ch;
    if (ctx.measureText(next).width > maxWidth && lines[lines.length - 1]) {
      lines.push(ch);
    } else {
      lines[lines.length - 1] = next;
    }
  }
  const offset = (lines.length - 1) * lineHeight * 0.5;
  lines.forEach((line, i) => ctx.fillText(line, x, y - offset + i * lineHeight));
}

function loop(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
  lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  if (state) {
    state.x = clampX(state.x || canvas.width / 2);
    state.targetX = clampX(state.targetX || canvas.width / 2);
  }
}

function unlockAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function tone(freq, duration, type = "square", volume = 0.03) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function drum(freq, volume) {
  tone(freq, 0.12, "triangle", volume);
}

function tick(freq, volume) {
  tone(freq, 0.045, "square", volume);
}

function slash() {
  tone(180, 0.08, "sawtooth", 0.04);
  setTimeout(() => tone(90, 0.12, "sawtooth", 0.035), 45);
}

function fanfare(big = false) {
  [420, 530, big ? 760 : 640].forEach((freq, i) => {
    setTimeout(() => tone(freq, 0.09, "square", 0.025), i * 70);
  });
}

function restart() {
  const next = resultKicker.textContent === "敗北" ? 1 : state.stage + 1;
  resetGame(next);
}

actionBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", restart);

leftBtn.addEventListener("pointerdown", () => {
  keys.left = true;
  moveBy(-70);
});
rightBtn.addEventListener("pointerdown", () => {
  keys.right = true;
  moveBy(70);
});
["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
  leftBtn.addEventListener(eventName, () => (keys.left = false));
  rightBtn.addEventListener(eventName, () => (keys.right = false));
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    keys.left = true;
    moveBy(-42);
  }
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    keys.right = true;
    moveBy(42);
  }
  if (event.key === " " || event.key === "Enter") startGame();
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keys.left = false;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keys.right = false;
});

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
  unlockAudio();
  touchStartX = event.clientX;
  touchStartTargetX = state.targetX || canvas.width / 2;
  if (state.mode === "ready") startGame();
});
canvas.addEventListener("pointermove", (event) => {
  event.preventDefault();
  const dx = (event.clientX - touchStartX) * 1.15;
  state.targetX = clampX(touchStartTargetX + dx);
});
canvas.addEventListener("pointerup", (event) => {
  canvas.releasePointerCapture?.(event.pointerId);
});
canvas.addEventListener("pointercancel", (event) => {
  canvas.releasePointerCapture?.(event.pointerId);
});

window.addEventListener("resize", resize);
resize();
resetGame();
requestAnimationFrame(loop);
