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
const evolutionEl = document.getElementById("evolution");
const restartBtn = document.getElementById("restartBtn");

const ROAD_MARGIN = 58;
const GATE_WIDTH = 94;
const GATE_HEIGHT = 74;
const ranks = ["農民", "足軽", "武士", "家老", "大名", "天下人"];
const rankLooks = [
  { body: "#d9b56d", head: "#191715", weapon: "", crest: "" },
  { body: "#2278a8", head: "#191715", weapon: "spear", crest: "" },
  { body: "#b23a34", head: "#191715", weapon: "sword", crest: "helmet" },
  { body: "#6e4bb3", head: "#191715", weapon: "sword", crest: "helmet" },
  { body: "#d8a52d", head: "#191715", weapon: "banner", crest: "helmet" },
  { body: "#f5efe0", head: "#191715", weapon: "banner", crest: "crown" },
];
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
const enemyTypes = [
  { key: "zako", name: "雑兵", icon: "兵", color: "#6b2629", reward: 7, lossRate: 0.75, sway: 14 },
  { key: "cavalry", name: "騎馬隊", icon: "馬", color: "#7c3f22", reward: 16, lossRate: 1.2, sway: 86 },
  { key: "general", name: "敵将", icon: "将", color: "#402a55", reward: 38, lossRate: 1.6, sway: 18 },
  { key: "shogun", name: "将軍", icon: "将軍", color: "#17120f", reward: 90, lossRate: 2.1, sway: 0 },
];

let state;
let audioCtx;
let bgmTimer;
let bgmStep = 0;
let lastTime = 0;
let toastTimer = 0;
let keys = { left: false, right: false };
let touchStartX = 0;
let touchStartTargetX = 0;
let meta = loadMeta();

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem("gekokujouRunMeta")) || { koku: 0, bestArmy: 3, wins: 0 };
  } catch {
    return { koku: 0, bestArmy: 3, wins: 0 };
  }
}

function saveMeta() {
  try {
    localStorage.setItem("gekokujouRunMeta", JSON.stringify(meta));
  } catch {
    // Storage can be unavailable in private browsing; the run still works.
  }
}

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
    enemies: [],
    eventMarkers: [],
    particles: [],
    shake: 0,
    castleHit: 0,
    winDelay: 0,
    justEvolved: 0,
    comboChain: 0,
    feverTimer: 0,
    maxArmy: 3,
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
    { label: "徴兵令", sub: "+10", type: "add", value: 10, good: true, icon: "兵" },
    { label: "天下の風", sub: "x2", type: "mul", value: 2, good: true, icon: "風" },
    { label: "鉄砲隊", sub: "+24", type: "add", value: 24, good: true, icon: "砲" },
    { label: "騎馬隊", sub: "+18", type: "add", value: 18, good: true, icon: "馬" },
    { label: "米俵山盛", sub: "+14", type: "add", value: 14, good: true, icon: "米" },
  ];
  const minus = [
    { label: "一揆勃発", sub: "-14", type: "add", value: -14, good: false, icon: "乱" },
    { label: "謀反の密書", sub: "裏切り", type: "mul", value: 0.62, good: false, icon: "裏" },
    { label: "兵糧焼失", sub: "-18", type: "add", value: -18, good: false, icon: "火" },
    { label: "疫病の噂", sub: "危険", type: "mul", value: 0.55, good: false, icon: "病" },
    { label: "落武者狩り", sub: "半減", type: "mul", value: 0.5, good: false, icon: "斬" },
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

  for (let z = 980; z < state.trackLength - 900; z += 710) {
    const roll = Math.random();
    const type = roll > 0.86 ? enemyTypes[2] : roll > 0.56 ? enemyTypes[1] : enemyTypes[0];
    state.enemies.push({
      z,
      baseX: canvas.width / 2 + (Math.random() > 0.5 ? -58 : 58),
      count: enemyCount(type),
      type,
      hit: false,
    });
  }
  state.enemies.push({
    z: state.trackLength - 520,
    baseX: canvas.width / 2,
    count: 72 + state.stage * 28,
    type: enemyTypes[3],
    hit: false,
  });
}

function sample(list) {
  return { ...list[Math.floor(Math.random() * list.length)] };
}

function enemyCount(type) {
  const base = 8 + state.stage * 4 + Math.floor(Math.random() * 12);
  if (type.key === "cavalry") return base + 18;
  if (type.key === "general") return base + 42;
  return base;
}

function startGame() {
  if (state.mode === "ready") {
    unlockAudio();
    state.mode = "run";
    state.speed = 178;
    actionBtn.textContent = "突撃";
    showToast("下剋上開始！");
    startBgm();
    warCry();
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
    if (state.feverTimer > 0) state.feverTimer -= dt;
    checkGates();
    checkEnemies();
    checkEvents();
    if (state.distance >= state.trackLength) enterCastle();
  }

  if (state.mode === "castle") {
    state.castleHit += dt;
    state.winDelay += dt;
    if (state.winDelay > 0.9) resolveCastle();
  }

  if (state.justEvolved > 0) state.justEvolved -= dt;
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
    const leftHit = Math.abs(state.x - gateLeftX()) < GATE_WIDTH * 0.48;
    const rightHit = Math.abs(state.x - gateRightX()) < GATE_WIDTH * 0.48;
    if (leftHit && !rightHit) applyGate(gate.left);
    if (rightHit && !leftHit) applyGate(gate.right);
    if (!leftHit && !rightHit) {
      showToast("門を素通りした");
      tick(150, 0.018);
    }
  }
}

function checkEnemies() {
  for (const enemy of state.enemies) {
    const y = projectZ(enemy.z);
    if (enemy.hit || y < canvas.height * 0.59 || y > canvas.height * 0.82) continue;
    const ex = enemyX(enemy);
    if (Math.abs(state.x - ex) > enemyHitRadius(enemy)) continue;
    enemy.hit = true;
    if (state.army >= enemy.count) {
      const gain = Math.floor(enemy.type.reward * (state.feverTimer > 0 ? 1.55 : 1));
      setArmy(state.army + gain);
      state.comboChain += enemy.type.key === "shogun" ? 2 : 1;
      showToast(`${enemy.type.name}を寝返らせた！ +${gain}`);
      combo(`撃破 +${gain}`);
      burst(ex, y, enemy.type.key === "shogun" ? "#f7b538" : "#22a06b", enemy.type.key === "shogun" ? 48 : 24);
      rewardSound(state.comboChain + 1);
      if (enemy.type.key === "shogun") enterFever();
    } else {
      const loss = Math.min(state.army - 1, Math.ceil(enemy.count * enemy.type.lossRate));
      setArmy(state.army - loss);
      state.comboChain = 0;
      showToast(`${enemy.type.name}襲来！ -${loss}`);
      combo(`-${loss}`);
      burst(ex, y, "#d73b2e", enemy.type.key === "cavalry" ? 30 : 18);
      battleSound(enemy.type.key);
    }
    state.shake = enemy.type.key === "shogun" ? 18 : 12;
  }
}

function enemyX(enemy) {
  const phase = (state.distance - enemy.z) * 0.018;
  if (enemy.type.key === "cavalry") return enemy.baseX + Math.sin(phase * 2.3) * enemy.type.sway;
  if (enemy.type.key === "shogun") return canvas.width / 2 + Math.sin(phase) * 18;
  return enemy.baseX + Math.sin(phase) * enemy.type.sway;
}

function enemyHitRadius(enemy) {
  if (enemy.type.key === "shogun") return 74;
  if (enemy.type.key === "cavalry") return 46;
  return 52;
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
  const feverBonus = state.feverTimer > 0 && gate.good ? 1.7 : 1;
  if (gate.type === "add") setArmy(state.army + Math.floor(gate.value * feverBonus));
  if (gate.type === "mul") setArmy(Math.floor(state.army * (gate.good ? 1 + (gate.value - 1) * feverBonus : gate.value)));
  const diff = state.army - before;
  if (gate.good) {
    state.comboChain += 1;
    if (state.comboChain >= 3) enterFever();
  } else {
    state.comboChain = 0;
    state.feverTimer = Math.max(0, state.feverTimer - 1.4);
  }
  showToast(gate.good ? `${gate.label}！ 連鎖${state.comboChain}` : `${gate.label}！`);
  combo(diff >= 0 ? `+${diff} 兵` : `${diff} 兵`);
  burst(state.x, canvas.height * 0.64, gate.good ? "#22a06b" : "#d73b2e", gate.good ? 22 : 14);
  state.shake = gate.good ? 5 : 9;
  gate.good ? rewardSound(state.comboChain) : slash();
}

function enterFever() {
  state.feverTimer = Math.max(state.feverTimer, 4.8);
  showToast("下剋上フィーバー！");
  combo("FEVER");
  burst(state.x, canvas.height * 0.45, "#f7b538", 40);
  state.shake = 13;
  feverSound();
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
    const beforeRank = ranks[state.rankIndex];
    state.rankIndex = Math.min(state.rankIndex + 1, ranks.length - 1);
    state.justEvolved = 2.2;
    const earnedKoku = Math.floor(state.maxArmy * 1.5 + state.stage * 60 + state.comboChain * 25);
    meta.koku += earnedKoku;
    meta.wins += 1;
    meta.bestArmy = Math.max(meta.bestArmy, state.maxArmy);
    saveMeta();
    resultKicker.textContent = ranks[state.rankIndex] === "天下人" ? "天下統一" : "勝利";
    resultTitle.textContent = ranks[state.rankIndex] === "天下人" ? "天下を取った！" : "城を落とした！";
    evolutionEl.textContent = `${beforeRank} から ${ranks[state.rankIndex]} へ進化`;
    evolutionEl.classList.remove("flash");
    void evolutionEl.offsetWidth;
    evolutionEl.classList.add("flash");
    resultText.textContent = `石高+${earnedKoku}。累計${meta.koku}石。最大兵力${meta.bestArmy}。`;
    actionBtn.textContent = "次の戦";
    evolveSound();
  } else {
    meta.bestArmy = Math.max(meta.bestArmy, state.maxArmy);
    saveMeta();
    resultKicker.textContent = "敗北";
    resultTitle.textContent = "城門で解散！";
    evolutionEl.textContent = "";
    evolutionEl.classList.remove("flash");
    resultText.textContent = `あと${state.requirement - state.army}人。累計${meta.koku}石、最大兵力${meta.bestArmy}。`;
    actionBtn.textContent = "再出陣";
    slash();
  }
  showResult();
}

function setArmy(value) {
  state.army = Math.max(1, Math.min(9999, Math.floor(value)));
  state.maxArmy = Math.max(state.maxArmy, state.army);
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
  resultEl.style.display = "none";
}

function showResult() {
  resultEl.hidden = false;
  resultEl.style.display = "grid";
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
  drawProgress();
  drawGates();
  drawEventMarkers();
  drawEnemies();
  drawCastle();
  drawCrowd();
  drawFever();
  drawParticles();
  ctx.restore();
}

function drawWorld() {
  const w = canvas.width;
  const h = canvas.height;
  const roadW = 260;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#263f34");
  sky.addColorStop(0.45, "#6e8c4f");
  sky.addColorStop(1, "#2f4b31");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(42, 28, 22, 0.16)";
  for (let i = 0; i < 12; i++) {
    const y = (i * 86 + state.distance * 0.32) % (h + 90) - 70;
    ctx.fillRect(i % 2 ? w - 76 : 28, y, 48, 18);
  }

  const road = ctx.createLinearGradient(0, 0, 0, h);
  road.addColorStop(0, "#765c37");
  road.addColorStop(0.55, "#a5783d");
  road.addColorStop(1, "#5f4729");
  ctx.fillStyle = road;
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

function drawProgress() {
  if (state.mode === "ready") return;
  const x = 14;
  const y = canvas.height - 92;
  const w = canvas.width - 28;
  const progress = Math.max(0, Math.min(1, state.distance / state.trackLength));
  ctx.fillStyle = "rgba(25, 23, 21, 0.34)";
  roundRect(x, y, w, 8, 4);
  ctx.fill();
  ctx.fillStyle = state.feverTimer > 0 ? "#f7b538" : "#fff8e6";
  roundRect(x, y, w * progress, 8, 4);
  ctx.fill();
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

function gateLeftX() {
  return canvas.width / 2 - 72;
}

function gateRightX() {
  return canvas.width / 2 + 72;
}

function drawGates() {
  for (const gate of state.gates) {
    const y = projectZ(gate.z);
    if (y < -120 || y > canvas.height + 80 || gate.passed) continue;
    drawGate(gateLeftX(), y, gate.left);
    drawGate(gateRightX(), y, gate.right);
  }
}

function drawGate(x, y, gate) {
  const width = GATE_WIDTH;
  const height = GATE_HEIGHT;
  ctx.save();
  ctx.translate(0, Math.sin(performance.now() / 150 + x) * 2);
  ctx.fillStyle = "#f5ead2";
  roundRect(x - width / 2, y - height / 2, width, height, 8);
  ctx.fill();
  ctx.strokeStyle = gate.good ? "#785b2d" : "#5e382f";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = gate.good ? "#23694f" : "#82322f";
  ctx.font = "950 23px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(gate.icon, x, y - 18);
  ctx.font = "900 15px system-ui";
  wrapText(gate.label, x, y + 7, 78, 18);
  ctx.fillStyle = "#191715";
  ctx.font = "950 16px system-ui";
  ctx.fillText(gate.sub, x, y + 27);
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    const y = projectZ(enemy.z);
    if (enemy.hit || y < -80 || y > canvas.height + 110) continue;
    const ex = enemyX(enemy);
    const width = enemy.type.key === "shogun" ? 104 : 80;
    const height = enemy.type.key === "shogun" ? 58 : 46;
    ctx.fillStyle = enemy.type.color;
    roundRect(ex - width / 2, y - height / 2, width, height, 8);
    ctx.fill();
    ctx.strokeStyle = "#191715";
    ctx.lineWidth = 3;
    ctx.stroke();
    if (enemy.type.key === "cavalry") {
      ctx.strokeStyle = "#f7b538";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(ex - 52, y);
      ctx.lineTo(ex - 88, y + 12);
      ctx.stroke();
    }
    if (enemy.type.key === "shogun") {
      ctx.strokeStyle = "#f7b538";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ex, y, 44 + Math.sin(performance.now() / 100) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#fff8e6";
    ctx.font = enemy.type.key === "shogun" ? "950 18px system-ui" : "950 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${enemy.type.icon} ${enemy.count}`, ex, y + 1);
    const units = enemy.type.key === "shogun" ? 7 : 5;
    for (let i = 0; i < units; i++) drawUnit(ex - 30 + i * 10, y + 36 + (i % 2) * 4, i, true, enemy.type);
  }
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

  if (state.comboChain > 1 && state.mode === "run") {
    ctx.font = "950 18px system-ui";
    ctx.strokeStyle = "#191715";
    ctx.lineWidth = 4;
    ctx.fillStyle = "#f7b538";
    ctx.strokeText(`${state.comboChain}連鎖`, state.x, startY - 66);
    ctx.fillText(`${state.comboChain}連鎖`, state.x, startY - 66);
  }
}

function drawFever() {
  if (state.feverTimer <= 0) return;
  const alpha = Math.min(0.32, state.feverTimer * 0.06);
  ctx.fillStyle = `rgba(247, 181, 56, ${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff8e6";
  ctx.font = "1000 28px system-ui";
  ctx.textAlign = "center";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#191715";
  const text = `下剋上FEVER ${Math.ceil(state.feverTimer)}`;
  ctx.strokeText(text, canvas.width / 2, 190);
  ctx.fillText(text, canvas.width / 2, 190);
}

function drawUnit(x, y, i, enemy = false, enemyType = enemyTypes[0]) {
  const enemyLook = {
    body: enemyType.color,
    head: "#191715",
    weapon: enemyType.key === "cavalry" || enemyType.key === "shogun" ? "spear" : "sword",
    crest: enemyType.key === "general" || enemyType.key === "shogun" ? "helmet" : "",
  };
  const look = enemy ? enemyLook : rankLooks[state.rankIndex];
  const scale = state.justEvolved > 0 && !enemy ? 1 + Math.sin(performance.now() / 55 + i) * 0.16 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = look.head;
  ctx.beginPath();
  ctx.arc(0, -9, 4.5, 0, Math.PI * 2);
  ctx.fill();
  if (look.crest === "helmet") {
    ctx.fillStyle = "#2d2a28";
    ctx.fillRect(-7, -15, 14, 4);
  }
  if (look.crest === "crown") {
    ctx.fillStyle = "#d8a52d";
    ctx.beginPath();
    ctx.moveTo(-7, -13);
    ctx.lineTo(-3, -19);
    ctx.lineTo(0, -13);
    ctx.lineTo(4, -19);
    ctx.lineTo(8, -13);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = look.body;
  ctx.fillRect(-5, -5, 10, 12);
  ctx.strokeStyle = "#191715";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.lineTo(8, 4);
  ctx.moveTo(-3, 7);
  ctx.lineTo(-7, 14);
  ctx.moveTo(3, 7);
  ctx.lineTo(7, 14);
  ctx.stroke();
  if (look.weapon === "spear") {
    ctx.strokeStyle = "#5a3a1f";
    ctx.beginPath();
    ctx.moveTo(9, -13);
    ctx.lineTo(16, 12);
    ctx.stroke();
  }
  if (enemy && enemyType.key === "cavalry") {
    ctx.fillStyle = "#2b2019";
    ctx.fillRect(-9, 9, 18, 6);
    ctx.fillStyle = "#17120f";
    ctx.beginPath();
    ctx.arc(-7, 16, 3, 0, Math.PI * 2);
    ctx.arc(7, 16, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (look.weapon === "sword") {
    ctx.strokeStyle = "#d8d0be";
    ctx.beginPath();
    ctx.moveTo(8, -7);
    ctx.lineTo(15, -18);
    ctx.stroke();
  }
  if (look.weapon === "banner") {
    ctx.strokeStyle = "#5a3a1f";
    ctx.beginPath();
    ctx.moveTo(10, -16);
    ctx.lineTo(10, 14);
    ctx.stroke();
    ctx.fillStyle = state.rankIndex >= 5 ? "#d8a52d" : "#b23a34";
    ctx.fillRect(10, -16, 13, 10);
  }
  ctx.restore();
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

function tone(freq, duration, type = "square", volume = 0.03, delay = 0) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const start = audioCtx.currentTime + delay;
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(duration, volume = 0.03, delay = 0) {
  if (!audioCtx) return;
  const length = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  const start = audioCtx.currentTime + delay;
  source.buffer = buffer;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(gain).connect(audioCtx.destination);
  source.start(start);
  source.stop(start + duration);
}

function drum(freq, volume) {
  tone(freq, 0.16, "triangle", volume);
  noise(0.06, volume * 0.7);
}

function tick(freq, volume) {
  tone(freq, 0.045, "square", volume);
}

function slash() {
  tone(260, 0.05, "sawtooth", 0.04);
  tone(100, 0.12, "sawtooth", 0.035, 0.05);
  noise(0.09, 0.045, 0.02);
}

function battleSound(type = "zako") {
  const heavy = type === "shogun" || type === "cavalry";
  [88, 110, 92, heavy ? 72 : 145].forEach((freq, i) => tone(freq, 0.1, i % 2 ? "sawtooth" : "triangle", heavy ? 0.06 : 0.05, i * 0.05));
  noise(0.18, 0.04, 0.08);
  if (type === "cavalry") horagai(0.1);
  if (type === "shogun") {
    horagai(0.02);
    horagai(0.32);
  }
}

function rewardSound(chain = 1) {
  const base = chain >= 3 ? 330 : 262;
  [base, base * 1.25, base * 1.5].forEach((freq, i) => tone(freq, 0.08, "triangle", 0.026 + chain * 0.002, i * 0.055));
  if (chain >= 3) tone(784, 0.18, "square", 0.03, 0.18);
}

function evolveSound() {
  drum(66, 0.09);
  [196, 247, 294, 392, 523, 784, 1046].forEach((freq, i) => {
    tone(freq, 0.15, i < 3 ? "triangle" : "square", 0.038, 0.1 + i * 0.075);
  });
  noise(0.25, 0.03, 0.42);
}

function feverSound() {
  drum(72, 0.08);
  [330, 392, 494, 659, 988].forEach((freq, i) => tone(freq, 0.11, "square", 0.035, i * 0.055));
}

function warCry() {
  drum(72, 0.08);
  horagai(0.05);
  tone(146, 0.22, "sawtooth", 0.035, 0.08);
  tone(220, 0.18, "triangle", 0.03, 0.18);
  noise(0.12, 0.02, 0.2);
}

function shamisen(freq, delay = 0, volume = 0.018) {
  tone(freq, 0.045, "sawtooth", volume, delay);
  tone(freq * 2.01, 0.032, "square", volume * 0.35, delay + 0.005);
  noise(0.018, volume * 0.55, delay);
}

function shinobue(freq, delay = 0, volume = 0.018) {
  tone(freq, 0.28, "sine", volume, delay);
  tone(freq * 2, 0.22, "triangle", volume * 0.22, delay + 0.02);
}

function horagai(delay = 0) {
  tone(116, 0.42, "sawtooth", 0.024, delay);
  tone(174, 0.34, "triangle", 0.017, delay + 0.06);
}

function startBgm() {
  if (bgmTimer || !audioCtx) return;
  bgmStep = 0;
  bgmTimer = setInterval(playBgmStep, 150);
}

function playBgmStep() {
  if (!audioCtx || state.mode === "ready" || state.mode === "result") return;
  const scale = [146.83, 164.81, 196, 220, 246.94, 293.66, 329.63, 392];
  const pattern = [0, 2, 4, 5, 4, 2, 0, 1, 0, 3, 5, 7, 5, 4, 2, 1];
  const step = bgmStep % pattern.length;
  const fever = state.feverTimer > 0;
  if (step % 2 === 0) drum(step % 4 === 0 ? 54 : 74, fever ? 0.052 : 0.034);
  if (step % 4 === 2) noise(0.035, 0.016);
  shamisen(scale[pattern[step]] * (fever ? 1.5 : 1), 0, fever ? 0.026 : 0.018);
  if (step === 0 || step === 8) shinobue(587.33 * (fever ? 1.25 : 1), 0.01, fever ? 0.024 : 0.014);
  if (step === 6 || step === 14) shamisen(scale[pattern[step]] * 0.5, 0.07, fever ? 0.028 : 0.018);
  if (step === 12 && (fever || state.stage > 1)) horagai(0.02);
  bgmStep += 1;
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
  if (state.mode === "ready") showToast("出陣を押して開始");
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
