
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const $ = id => document.getElementById(id);

const ui = {
  score: $("score"),
  wave: $("wave"),
  lives: $("lives"),
  highScore: $("highScore"),
  kills: $("kills"),
  weaponStatus: $("weaponStatus"),
  powerStatus: $("powerStatus"),
  specialCount: $("specialCount"),
  bossBar: $("bossBar"),
  bossHealth: $("bossHealth"),
  startOverlay: $("startOverlay"),
  pauseOverlay: $("pauseOverlay"),
  gameOverOverlay: $("gameOverOverlay"),
  finalScore: $("finalScore"),
  pauseBtn: $("pauseBtn"),
  fireModeBtn: $("fireModeBtn"),
  fireBtn: $("fireBtn"),
  specialBtn: $("specialBtn"),
  aimBtn: $("aimBtn"),
  directionBtn: $("directionBtn"),
  soundBtn: $("soundBtn")
};

let W = 800;
let H = 500;
let dpr = 1;

let gameState = "menu";
let lastTime = 0;
let elapsed = 0;
let score = 0;
let kills = 0;
let wave = 1;
let lives = 3;
let specials = 3;
let highScore = 0;

try {
  highScore = Number(localStorage.getItem("spaceDefenderBest")) || 0;
} catch (e) {}

let stars = [];
let enemies = [];
let bullets = [];
let enemyBullets = [];
let particles = [];
let powerups = [];
let effects = [];
let boss = null;

let soundEnabled = true;
let audioCtx = null;

let fireHeld = false;
let fireCooldown = 0;
let enemySpawnTimer = 0;
let damageFlash = 0;
let shake = 0;

const keys = {};
const movement = { up: false, down: false, left: false, right: false };

const firingStyles = [
  { name: "FORWARD", label: "FIRE: FORWARD" },
  { name: "SPREAD", label: "FIRE: SPREAD" },
  { name: "DIRECTIONAL", label: "FIRE: DIRECTIONAL" },
  { name: "AIMED", label: "FIRE: AIMED" }
];

let firingStyle = 0;
let aimMode = "auto";
let aimAngle = -Math.PI / 2;

const player = {
  x: 0,
  y: 0,
  radius: 15,
  speed: 245,
  shield: 0,
  rapid: 0,
  flame: 0,
  lightning: 0,
  invulnerable: 0
};

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, rect.width);
  H = Math.max(1, rect.height);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!player.x) {
    player.x = W / 2;
    player.y = H * 0.78;
  } else {
    player.x = Math.max(20, Math.min(W - 20, player.x));
    player.y = Math.max(30, Math.min(H - 20, player.y));
  }

  createStars();
}

window.addEventListener("resize", resizeCanvas);

function createStars() {
  stars = [];
  const count = Math.max(45, Math.floor(W * H / 3500));
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() * 1.8 + 0.3,
      speed: 12 + Math.random() * 45,
      alpha: 0.25 + Math.random() * 0.7
    });
  }
}

function initAudio() {
  if (!soundEnabled) return;

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {}
}

function tone(startFreq, duration, type = "sawtooth", volume = 0.04, endFreq = 100) {
  if (!soundEnabled || !audioCtx) return;

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, startFreq), audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFreq),
      audioCtx.currentTime + duration
    );
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function noiseSound(duration = 0.18, volume = 0.035, cutoff = 1400) {
  if (!soundEnabled || !audioCtx) return;

  try {
    const length = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    const source = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.value = volume;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    source.start();
  } catch (e) {}
}

function playShot() {
  if (player.lightning > 0) {
    tone(1000, 0.09, "sawtooth", 0.035, 150);
    tone(400, 0.08, "square", 0.015, 900);
  } else if (player.flame > 0) {
    noiseSound(0.1, 0.025, 1000);
    tone(260, 0.07, "sawtooth", 0.018, 100);
  } else {
    tone(720, 0.065, "square", 0.025, 250);
  }
}

function playExplosion() {
  noiseSound(0.22, 0.05, 900);
  tone(130, 0.22, "triangle", 0.035, 38);
}

function playThunder() {
  noiseSound(0.55, 0.07, 500);
  tone(85, 0.7, "sawtooth", 0.045, 28);
  tone(48, 0.9, "triangle", 0.03, 22);
}

function playZap() {
  tone(1250, 0.15, "sawtooth", 0.045, 180);
  tone(400, 0.11, "square", 0.02, 1100);
}

function resetGame() {
  score = 0;
  kills = 0;
  wave = 1;
  lives = 3;
  specials = 3;
  elapsed = 0;
  enemySpawnTimer = 0;
  fireCooldown = 0;
  damageFlash = 0;
  shake = 0;

  enemies = [];
  bullets = [];
  enemyBullets = [];
  particles = [];
  powerups = [];
  effects = [];
  boss = null;

  player.x = W / 2;
  player.y = H * 0.78;
  player.shield = 0;
  player.rapid = 0;
  player.flame = 0;
  player.lightning = 0;
  player.invulnerable = 1.5;

  firingStyle = 0;
  aimMode = "auto";
  aimAngle = -Math.PI / 2;
  fireHeld = false;

  Object.keys(movement).forEach(k => movement[k] = false);
  Object.keys(keys).forEach(k => keys[k] = false);

  ui.startOverlay.classList.add("hidden");
  ui.pauseOverlay.classList.add("hidden");
  ui.gameOverOverlay.classList.add("hidden");
  ui.bossBar.classList.add("hidden");
  ui.pauseBtn.textContent = "Ⅱ PAUSE";

  gameState = "playing";
  lastTime = performance.now();

  initAudio();
  updateUI();
}

function startGame() {
  resetGame();
}

function pauseGame() {
  if (gameState === "playing") {
    gameState = "paused";
    fireHeld = false;
    Object.keys(movement).forEach(k => movement[k] = false);
    Object.keys(keys).forEach(k => keys[k] = false);
    ui.pauseOverlay.classList.remove("hidden");
    ui.pauseBtn.textContent = "▶ RESUME";
  } else if (gameState === "paused") {
    resumeGame();
  }
}

function resumeGame() {
  if (gameState !== "paused") return;
  initAudio();
  gameState = "playing";
  ui.pauseOverlay.classList.add("hidden");
  ui.pauseBtn.textContent = "Ⅱ PAUSE";
  lastTime = performance.now();
}

function endGame() {
  gameState = "over";
  fireHeld = false;
  ui.finalScore.textContent = score;
  ui.gameOverOverlay.classList.remove("hidden");
  ui.pauseOverlay.classList.add("hidden");
  ui.pauseBtn.textContent = "Ⅱ PAUSE";

  if (score > highScore) {
    highScore = score;
    try {
      localStorage.setItem("spaceDefenderBest", String(highScore));
    } catch (e) {}
  }

  updateUI();
  playExplosion();
}

function updateUI() {
  ui.score.textContent = score;
  ui.wave.textContent = wave;
  ui.lives.textContent = "♥".repeat(Math.max(0, lives)) + "♡".repeat(Math.max(0, 5 - lives));
  ui.highScore.textContent = highScore;
  ui.kills.textContent = kills;
  ui.specialCount.textContent = specials;

  if (player.lightning > 0) {
    ui.weaponStatus.textContent = "LIGHTNING";
  } else if (player.flame > 0) {
    ui.weaponStatus.textContent = "FIRE";
  } else if (player.rapid > 0) {
    ui.weaponStatus.textContent = "RAPID PLASMA";
  } else {
    ui.weaponStatus.textContent = "PLASMA";
  }

  const active = [];
  if (player.shield > 0) active.push("SHIELD");
  if (player.rapid > 0) active.push("RAPID");
  if (player.flame > 0) active.push("FLAME");
  if (player.lightning > 0) active.push("LIGHTNING");

  ui.powerStatus.textContent = active.join(" + ") || "NONE";
  ui.bossBar.classList.toggle("hidden", !boss);

  if (boss) {
    ui.bossHealth.style.width =
      Math.max(0, boss.hp / boss.maxHp * 100) + "%";
  }

  ui.fireModeBtn.textContent = "FIRE: " + firingStyles[firingStyle].name;
  ui.aimBtn.textContent = "🎯 AIM: " + aimMode.toUpperCase();
}

function spawnParticles(x, y, color, amount = 10, force = 130) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * force;

    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.25 + Math.random() * 0.55,
      maxLife: 0.8,
      size: 1.5 + Math.random() * 3.5,
      color
    });
  }
}

function spawnEnemy() {
  if (boss || gameState !== "playing") return;

  const roll = Math.random();
  const type = roll < 0.65 ? "scout" : roll < 0.9 ? "fighter" : "tank";

  const data = {
    scout: { hp: 1, speed: 80, radius: 12, score: 10, color: "#ff577f" },
    fighter: { hp: 2, speed: 58, radius: 16, score: 25, color: "#ff9a48" },
    tank: { hp: 4, speed: 38, radius: 20, score: 50, color: "#bc6aff" }
  }[type];

  enemies.push({
    x: 25 + Math.random() * (W - 50),
    y: -30,
    vx: (Math.random() - 0.5) * 35,
    hp: data.hp + Math.floor(wave / 4),
    maxHp: data.hp + Math.floor(wave / 4),
    speed: data.speed + wave * 3,
    radius: data.radius,
    score: data.score,
    color: data.color,
    type,
    fireTimer: 0.8 + Math.random() * 2,
    phase: Math.random() * 6
  });
}

function spawnBoss() {
  boss = {
    x: W / 2,
    y: -70,
    targetY: 75,
    hp: 28 + wave * 8,
    maxHp: 28 + wave * 8,
    radius: 34,
    vx: 100,
    fireTimer: 1,
    phase: 0
  };

  tone(160, 0.65, "sawtooth", 0.05, 60);
  ui.bossBar.classList.remove("hidden");
}

function nearestEnemy() {
  let target = null;
  let best = Infinity;

  for (const e of enemies) {
    const dist = Math.hypot(e.x - player.x, e.y - player.y);
    if (dist < best) {
      best = dist;
      target = e;
    }
  }

  if (boss) {
    const dist = Math.hypot(boss.x - player.x, boss.y - player.y);
    if (dist < best) target = boss;
  }

  return target;
}

function getTargetAngle() {
  if (aimMode === "manual") return aimAngle;

  const target = nearestEnemy();
  if (!target) return -Math.PI / 2;

  return Math.atan2(target.y - player.y, target.x - player.x);
}

function fireBullet(angle, type = "normal", damage = 1) {
  const speed = type === "lightning" ? 590 : type === "flame" ? 420 : 520;

  bullets.push({
    x: player.x + Math.cos(angle) * 18,
    y: player.y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    life: 1.6,
    damage,
    type,
    radius: type === "flame" ? 6 : type === "lightning" ? 4 : 3
  });
}

function shoot() {
  if (gameState !== "playing" || fireCooldown > 0) return;

  const type = player.lightning > 0
    ? "lightning"
    : player.flame > 0
      ? "flame"
      : "normal";

  const angle = getTargetAngle();

  if (firingStyle === 0) {
    fireBullet(-Math.PI / 2, type, type === "lightning" ? 2 : 1);
  } else if (firingStyle === 1) {
    [-0.36, -0.18, 0, 0.18, 0.36].forEach(offset => {
      fireBullet(-Math.PI / 2 + offset, type, type === "lightning" ? 2 : 1);
    });
  } else if (firingStyle === 2) {
    let directionalAngle = -Math.PI / 2;

    if (movement.left || keys.ArrowLeft || keys.a) directionalAngle = Math.PI;
    else if (movement.right || keys.ArrowRight || keys.d) directionalAngle = 0;
    else if (movement.up || keys.ArrowUp || keys.w) directionalAngle = -Math.PI / 2;
    else if (movement.down || keys.ArrowDown || keys.s) directionalAngle = Math.PI / 2;
    else directionalAngle = aimAngle;

    fireBullet(directionalAngle, type, type === "lightning" ? 2 : 1);
  } else {
    fireBullet(angle, type, type === "lightning" ? 2 : 1);
  }

  playShot();
  fireCooldown = player.rapid > 0 ? 0.075 : 0.2;
}

function specialAttack() {
  if (gameState !== "playing" || specials <= 0) return;

  specials--;
  shake = 12;
  playThunder();

  effects.push({
    x: player.x,
    y: player.y,
    radius: 10,
    maxRadius: Math.max(W, H) * 0.75,
    life: 0.6,
    maxLife: 0.6,
    type: "shockwave"
  });

  // Clear hostile projectiles.
  enemyBullets.forEach(b => spawnParticles(b.x, b.y, "#7dfcff", 3, 70));
  enemyBullets = [];

  // Damage every enemy on screen.
  [...enemies].forEach(e => destroyEnemy(e, true));

  if (boss) {
    boss.hp -= 10;
    spawnParticles(boss.x, boss.y, "#7dfcff", 35, 220);
    if (boss.hp <= 0) destroyBoss();
  }

  updateUI();
}

function destroyEnemy(enemy, fromSpecial = false) {
  const index = enemies.indexOf(enemy);
  if (index === -1) return;

  enemies.splice(index, 1);
  kills++;
  score += enemy.score;
  spawnParticles(enemy.x, enemy.y, enemy.color, 13, 160);

  if (!fromSpecial) playExplosion();

  if (Math.random() < 0.16) {
    const types = ["shield", "rapid", "flame", "lightning", "life"];
    const type = types[Math.floor(Math.random() * types.length)];

    powerups.push({
      x: enemy.x,
      y: enemy.y,
      vy: 55,
      type,
      life: 9,
      phase: 0
    });
  }
}

function destroyBoss() {
  if (!boss) return;

  score += 500 + wave * 25;
  kills += 1;
  spawnParticles(boss.x, boss.y, "#ffb34d", 65, 260);
  playExplosion();
  boss = null;
  specials = Math.min(5, specials + 1);
  wave++;
  enemySpawnTimer = 0.5;
  updateUI();
}

function damagePlayer() {
  if (player.invulnerable > 0) return;

  if (player.shield > 0) {
    spawnParticles(player.x, player.y, "#50edff", 12, 130);
    player.shield = Math.max(0, player.shield - 1.2);
    tone(360, 0.12, "sine", 0.035, 720);
    return;
  }

  lives--;
  player.invulnerable = 1.6;
  damageFlash = 0.3;
  shake = 8;
  spawnParticles(player.x, player.y, "#ff456e", 20, 180);
  playExplosion();

  if (lives <= 0) endGame();
  updateUI();
}

function collectPowerup(p) {
  switch (p.type) {
    case "shield":
      player.shield = 8;
      tone(450, 0.2, "sine", 0.04, 900);
      break;
    case "rapid":
      player.rapid = 8;
      tone(500, 0.2, "sine", 0.04, 1100);
      break;
    case "flame":
      player.flame = 10;
      player.lightning = 0;
      tone(260, 0.3, "sawtooth", 0.04, 750);
      break;
    case "lightning":
      player.lightning = 10;
      player.flame = 0;
      playZap();
      break;
    case "life":
      lives = Math.min(5, lives + 1);
      tone(550, 0.25, "sine", 0.05, 1000);
      break;
  }

  spawnParticles(p.x, p.y, powerColor(p.type), 16, 110);
  updateUI();
}

function powerColor(type) {
  return {
    shield: "#45edff",
    rapid: "#ffec65",
    flame: "#ff7138",
    lightning: "#d5a0ff",
    life: "#62ff9c"
  }[type] || "#ffffff";
}

function update(dt) {
  elapsed += dt;
  fireCooldown -= dt;
  damageFlash = Math.max(0, damageFlash - dt);
  shake = Math.max(0, shake - dt * 30);

  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.shield = Math.max(0, player.shield - dt);
  player.rapid = Math.max(0, player.rapid - dt);
  player.flame = Math.max(0, player.flame - dt);
  player.lightning = Math.max(0, player.lightning - dt);

  updatePlayer(dt);

  if (fireHeld) shoot();

  for (const star of stars) {
    star.y += star.speed * dt;
    if (star.y > H) {
      star.y = 0;
      star.x = Math.random() * W;
    }
  }

  if (!boss) {
    enemySpawnTimer -= dt;
    if (enemySpawnTimer <= 0) {
      if (wave % 5 === 0 && enemies.length === 0) {
        spawnBoss();
      } else {
        spawnEnemy();
      }
      enemySpawnTimer = Math.max(0.28, 1.05 - wave * 0.035);
    }
  }

  updateEnemies(dt);
  updateBoss(dt);
  updateBullets(dt);
  updateEnemyBullets(dt);
  updatePowerups(dt);
  updateParticles(dt);
  updateEffects(dt);
  checkCollisions();

  if (score > highScore) {
    highScore = score;
  }

  updateUI();
}

function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;

  if (movement.left || keys.ArrowLeft || keys.a) dx--;
  if (movement.right || keys.ArrowRight || keys.d) dx++;
  if (movement.up || keys.ArrowUp || keys.w) dy--;
  if (movement.down || keys.ArrowDown || keys.s) dy++;

  const length = Math.hypot(dx, dy) || 1;
  player.x += dx / length * player.speed * dt;
  player.y += dy / length * player.speed * dt;

  player.x = Math.max(18, Math.min(W - 18, player.x));
  player.y = Math.max(25, Math.min(H - 18, player.y));

  // Manual directional aiming follows the movement direction.
  if (dx || dy) {
    aimAngle = Math.atan2(dy, dx);
  }
}

function updateEnemies(dt) {
  for (const e of [...enemies]) {
    e.phase += dt * 2;
    e.y += e.speed * dt;
    e.x += (e.vx + Math.sin(e.phase) * 35) * dt;
    e.x = Math.max(e.radius, Math.min(W - e.radius, e.x));

    e.fireTimer -= dt;

    if (e.fireTimer <= 0 && e.y > 0 && e.y < H * 0.75) {
      const angle = Math.atan2(player.y - e.y, player.x - e.x);
      const speed = 135 + wave * 5;

      enemyBullets.push({
        x: e.x,
        y: e.y + e.radius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 4,
        color: "#ff597c"
      });

      e.fireTimer = 1.4 + Math.random() * 1.5;
    }

    if (e.y > H + 40) {
      enemies.splice(enemies.indexOf(e), 1);
    }
  }
}

function updateBoss(dt) {
  if (!boss) return;

  boss.phase += dt;
  if (boss.y < boss.targetY) {
    boss.y += 70 * dt;
  } else {
    boss.x += boss.vx * dt;
    if (boss.x < boss.radius || boss.x > W - boss.radius) {
      boss.vx *= -1;
    }
  }

  boss.fireTimer -= dt;

  if (boss.fireTimer <= 0) {
    const base = Math.atan2(player.y - boss.y, player.x - boss.x);

    for (let i = -2; i <= 2; i++) {
      const a = base + i * 0.22;
      enemyBullets.push({
        x: boss.x,
        y: boss.y + 18,
        vx: Math.cos(a) * 155,
        vy: Math.sin(a) * 155,
        radius: 5,
        color: "#d27aff"
      });
    }

    boss.fireTimer = 0.95;
  }
}

function updateBullets(dt) {
  for (const b of [...bullets]) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.type === "flame" && Math.random() < 0.9) {
      particles.push({
        x: b.x - b.vx * 0.015,
        y: b.y - b.vy * 0.015,
        vx: (Math.random() - 0.5) * 45,
        vy: 20 + Math.random() * 45,
        life: 0.18 + Math.random() * 0.15,
        maxLife: 0.3,
        size: 2 + Math.random() * 4,
        color: Math.random() < 0.5 ? "#ff4a22" : "#ffd05b"
      });
    }

    if (b.type === "lightning" && Math.random() < 0.6) {
      particles.push({
        x: b.x,
        y: b.y,
        vx: (Math.random() - 0.5) * 70,
        vy: (Math.random() - 0.5) * 70,
        life: 0.08,
        maxLife: 0.08,
        size: 2,
        color: "#b8faff"
      });
    }

    if (b.life <= 0 || b.y < -50 || b.y > H + 50 ||
        b.x < -50 || b.x > W + 50) {
      bullets.splice(bullets.indexOf(b), 1);
    }
  }
}

function updateEnemyBullets(dt) {
  for (const b of [...enemyBullets]) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.y > H + 30 || b.y < -30 || b.x < -30 || b.x > W + 30) {
      enemyBullets.splice(enemyBullets.indexOf(b), 1);
    }
  }
}

function updatePowerups(dt) {
  for (const p of [...powerups]) {
    p.y += p.vy * dt;
    p.phase += dt * 4;
    p.life -= dt;

    if (p.life <= 0 || p.y > H + 25) {
      powerups.splice(powerups.indexOf(p), 1);
    }
  }
}

function updateParticles(dt) {
  for (const p of [...particles]) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.04, dt);
    p.vy *= Math.pow(0.2, dt);
    p.life -= dt;

    if (p.life <= 0) particles.splice(particles.indexOf(p), 1);
  }
}

function updateEffects(dt) {
  for (const e of [...effects]) {
    e.life -= dt;
    e.radius += (e.maxRadius / e.maxLife) * dt;

    if (e.life <= 0) effects.splice(effects.indexOf(e), 1);
  }
}

function checkCollisions() {
  // Player projectiles versus enemies.
  for (const b of [...bullets]) {
    let hit = false;

    for (const e of [...enemies]) {
      if (Math.hypot(b.x - e.x, b.y - e.y) < e.radius + b.radius) {
        e.hp -= b.damage;
        hit = true;

        spawnParticles(
          b.x, b.y,
          b.type === "lightning" ? "#a8ffff" :
          b.type === "flame" ? "#ff8b35" : "#55edff",
          4, 65
        );

        if (b.type === "lightning") playZap();

        if (e.hp <= 0) destroyEnemy(e);
        break;
      }
    }

    if (!hit && boss &&
        Math.hypot(b.x - boss.x, b.y - boss.y) < boss.radius + b.radius) {
      boss.hp -= b.damage;
      hit = true;

      spawnParticles(
        b.x, b.y,
        b.type === "flame" ? "#ff6c30" : "#7dfcff",
        5, 80
      );

      if (b.type === "lightning") playZap();
      if (boss && boss.hp <= 0) destroyBoss();
    }

    if (hit) {
      const index = bullets.indexOf(b);
      if (index !== -1) bullets.splice(index, 1);
    }
  }

  // Hostile projectiles versus player.
  for (const b of [...enemyBullets]) {
    if (Math.hypot(b.x - player.x, b.y - player.y) < player.radius + b.radius) {
      enemyBullets.splice(enemyBullets.indexOf(b), 1);
      damagePlayer();
    }
  }

  // Enemy collisions with the player.
  for (const e of [...enemies]) {
    if (Math.hypot(e.x - player.x, e.y - player.y) < e.radius + player.radius) {
      destroyEnemy(e);
      damagePlayer();
    }
  }

  if (boss &&
      Math.hypot(boss.x - player.x, boss.y - player.y) < boss.radius + player.radius) {
    damagePlayer();
  }

  // Collect power-ups.
  for (const p of [...powerups]) {
    if (Math.hypot(p.x - player.x, p.y - player.y) < 25) {
      collectPowerup(p);
      powerups.splice(powerups.indexOf(p), 1);
    }
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, "#070d25");
  gradient.addColorStop(0.5, "#08091a");
  gradient.addColorStop(1, "#150a27");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Nebula glows.
  const glow = ctx.createRadialGradient(W * 0.7, H * 0.25, 0, W * 0.7, H * 0.25, W * 0.55);
  glow.addColorStop(0, "#233c7928");
  glow.addColorStop(1, "#08091a00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  for (const s of stars) {
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = "#d9f5ff";
    ctx.fillRect(s.x, s.y, s.size, s.size * 1.8);
  }
  ctx.globalAlpha = 1;
}

function drawShip() {
  const x = player.x;
  const y = player.y;

  if (player.invulnerable > 0 && Math.floor(elapsed * 12) % 2 === 0) return;

  ctx.save();
  ctx.translate(x, y);

  // Shield ring.
  if (player.shield > 0) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 32, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#4af3ffb0";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#4af3ff";
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Twin afterburners.
  for (const ex of [-8, 8]) {
    const flameLength = 12 + Math.random() * 10;
    const fire = ctx.createLinearGradient(0, 6, 0, flameLength + 8);
    fire.addColorStop(0, "#b8ffff");
    fire.addColorStop(0.35, "#28aaff");
    fire.addColorStop(1, "#3858ff00");

    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.moveTo(ex - 3, 5);
    ctx.lineTo(ex, flameLength + 10);
    ctx.lineTo(ex + 3, 5);
    ctx.closePath();
    ctx.fill();
  }

  // Swept wings.
  const wingGradient = ctx.createLinearGradient(-20, -10, 20, 10);
  wingGradient.addColorStop(0, "#263e6e");
  wingGradient.addColorStop(0.5, "#a4d5ff");
  wingGradient.addColorStop(1, "#20345e");

  ctx.fillStyle = wingGradient;
  ctx.strokeStyle = "#7ccfff";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -23);
  ctx.lineTo(9, -9);
  ctx.lineTo(25, 9);
  ctx.lineTo(10, 6);
  ctx.lineTo(7, 16);
  ctx.lineTo(-7, 16);
  ctx.lineTo(-10, 6);
  ctx.lineTo(-25, 9);
  ctx.lineTo(-9, -9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Central fuselage.
  ctx.fillStyle = "#d5e8ff";
  ctx.beginPath();
  ctx.moveTo(0, -27);
  ctx.lineTo(5, -8);
  ctx.lineTo(4, 13);
  ctx.lineTo(0, 19);
  ctx.lineTo(-4, 13);
  ctx.lineTo(-5, -8);
  ctx.closePath();
  ctx.fill();

  // Cockpit.
  ctx.fillStyle = "#0b6a9e";
  ctx.beginPath();
  ctx.ellipse(0, -9, 3.2, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#75f6ff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(0, 12);
  ctx.stroke();

  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.shadowColor = e.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = e.color;
  ctx.strokeStyle = "#ffe3f0";
  ctx.lineWidth = 0.7;

  ctx.beginPath();
  ctx.moveTo(0, e.radius);
  ctx.lineTo(e.radius, -e.radius * 0.45);
  ctx.lineTo(e.radius * 0.3, -e.radius * 0.15);
  ctx.lineTo(0, -e.radius);
  ctx.lineTo(-e.radius * 0.3, -e.radius * 0.15);
  ctx.lineTo(-e.radius, -e.radius * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;

  if (e.hp > 1) {
    ctx.fillStyle = "#ffffffaa";
    ctx.fillRect(-e.radius, -e.radius - 6,
      e.radius * 2 * Math.max(0, e.hp / e.maxHp), 2);
  }

  ctx.restore();
}

function drawBoss() {
  if (!boss) return;

  ctx.save();
  ctx.translate(boss.x, boss.y);

  ctx.shadowColor = "#ff416d";
  ctx.shadowBlur = 22;

  const grad = ctx.createLinearGradient(-40, -25, 40, 25);
  grad.addColorStop(0, "#72224d");
  grad.addColorStop(0.5, "#f36a9b");
  grad.addColorStop(1, "#6524a8");

  ctx.fillStyle = grad;
  ctx.strokeStyle = "#ffd2e8";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(0, 29);
  ctx.lineTo(15, 12);
  ctx.lineTo(43, 19);
  ctx.lineTo(29, -6);
  ctx.lineTo(17, -14);
  ctx.lineTo(0, -30);
  ctx.lineTo(-17, -14);
  ctx.lineTo(-29, -6);
  ctx.lineTo(-43, 19);
  ctx.lineTo(-15, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff0fa";
  ctx.fillRect(-3, -16, 6, 18);

  ctx.restore();
}

function drawBullet(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);

  if (b.type === "flame") {
    // Layered animated flame projectile.
    const flame = ctx.createLinearGradient(-20, 0, 9, 0);
    flame.addColorStop(0, "#ff341b00");
    flame.addColorStop(0.3, "#ff4b19");
    flame.addColorStop(0.7, "#ffb329");
    flame.addColorStop(1, "#ffffb4");

    ctx.fillStyle = flame;
    ctx.shadowColor = "#ff5b23";
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(-9, -9, 3, -4);
    ctx.quadraticCurveTo(10, 0, 3, 4);
    ctx.quadraticCurveTo(-9, 9, -22, 0);
    ctx.fill();

    ctx.fillStyle = "#fff5b0";
    ctx.beginPath();
    ctx.ellipse(2, 0, 6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.type === "lightning") {
    ctx.strokeStyle = "#b9ffff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#46efff";
    ctx.shadowBlur = 17;

    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-9, -4);
    ctx.lineTo(-4, 4);
    ctx.lineTo(2, -4);
    ctx.lineTo(10, 0);
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-4, -2);
    ctx.lineTo(2, 2);
    ctx.lineTo(10, 0);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#62f7ff";
    ctx.shadowColor = "#62f7ff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(3, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawEnemyBullet(b) {
  ctx.save();
  ctx.shadowColor = b.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = b.color;

  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(b.x - 1, b.y - 1, Math.max(1, b.radius * 0.35), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPowerups() {
  for (const p of powerups) {
    const color = powerColor(p.type);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(p.phase) * 0.2);
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#0c1730";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.roundRect(-11, -11, 22, 22, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const symbols = {
      shield: "S",
      rapid: "R",
      flame: "F",
      lightning: "⚡",
      life: "+"
    };

    ctx.fillText(symbols[p.type], 0, 1);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawEffects() {
  for (const e of effects) {
    const alpha = Math.max(0, e.life / e.maxLife);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#83faff";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#50f7ff";
    ctx.shadowBlur = 22;

    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#d8ffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

function draw() {
  ctx.save();

  if (shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * shake,
      (Math.random() - 0.5) * shake
    );
  }

  drawBackground();

  enemies.forEach(drawEnemy);
  drawBoss();

  bullets.forEach(drawBullet);
  enemyBullets.forEach(drawEnemyBullet);
  drawPowerups();
  drawEffects();
  drawParticles();
  drawShip();

  if (damageFlash > 0) {
    ctx.fillStyle = `rgba(255, 30, 75, ${damageFlash * 0.3})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  // While paused, the world is drawn but all gameplay and timers stay frozen.
  if (gameState === "playing") {
    const dt = Math.min(Math.max(0, (timestamp - lastTime) / 1000), 0.033);
    lastTime = timestamp;
    update(dt);
  } else {
    lastTime = timestamp;
  }

  draw();
}

// Main controls.
$("startBtn").addEventListener("click", startGame);
$("restartBtn").addEventListener("click", startGame);
$("pauseBtn").addEventListener("click", pauseGame);
$("resumeBtn").addEventListener("click", resumeGame);
$("specialBtn").addEventListener("click", specialAttack);

ui.fireModeBtn.addEventListener("click", () => {
  firingStyle = (firingStyle + 1) % firingStyles.length;
  updateUI();
});

ui.aimBtn.addEventListener("click", () => {
  aimMode = aimMode === "auto" ? "manual" : "auto";
  updateUI();
});

ui.directionBtn.addEventListener("click", () => {
  aimAngle += Math.PI / 4;
  if (aimAngle > Math.PI) aimAngle -= Math.PI * 2;
  aimMode = "manual";
  updateUI();
});

ui.soundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  ui.soundBtn.textContent = soundEnabled ? "🔊 SOUND" : "🔇 MUTED";
  if (soundEnabled) initAudio();
});

// Fire button supports holding on mobile and mouse.
ui.fireBtn.addEventListener("pointerdown", event => {
  event.preventDefault();
  if (gameState !== "playing") return;
  initAudio();
  fireHeld = true;
  shoot();
});

function stopFiring() {
  fireHeld = false;
}

ui.fireBtn.addEventListener("pointerup", stopFiring);
ui.fireBtn.addEventListener("pointercancel", stopFiring);
ui.fireBtn.addEventListener("lostpointercapture", stopFiring);
window.addEventListener("pointerup", stopFiring);
window.addEventListener("blur", stopFiring);

// Mobile movement controls.
document.querySelectorAll("[data-move]").forEach(button => {
  const direction = button.dataset.move;

  const startMove = event => {
    event.preventDefault();
    if (gameState !== "playing") return;

    initAudio();

    if (direction === "stop") {
      Object.keys(movement).forEach(k => movement[k] = false);
      return;
    }

    movement[direction] = true;
  };

  const stopMove = event => {
    if (event) event.preventDefault();
    if (direction !== "stop") movement[direction] = false;
  };

  button.addEventListener("pointerdown", startMove);
  button.addEventListener("pointerup", stopMove);
  button.addEventListener("pointercancel", stopMove);
  button.addEventListener("lostpointercapture", stopMove);
});

// Keyboard support for computers and external keyboards.
window.addEventListener("keydown", event => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }

  keys[event.key] = true;

  if (event.repeat) return;

  if (event.key === " " && gameState === "playing") {
    initAudio();
    fireHeld = true;
    shoot();
  }

  if (event.key.toLowerCase() === "p") pauseGame();
  if (event.key.toLowerCase() === "e") specialAttack();

  if (event.key.toLowerCase() === "f") {
    firingStyle = (firingStyle + 1) % firingStyles.length;
    updateUI();
  }
});

window.addEventListener("keyup", event => {
  keys[event.key] = false;
  if (event.key === " ") stopFiring();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameState === "playing") pauseGame();
});

// Start the renderer once. Restarting does not create duplicate animation loops.
resizeCanvas();
updateUI();
requestAnimationFrame(gameLoop);
