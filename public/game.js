/* SkateHangar — jeu de skate 3D façon Tony Hawk's Pro Skater
   Carte : un hangar abritant un skatepark inspiré du park de la Barre (Anglet).
   Three.js r128 (global THREE, chargé via <script> dans index.html). */

// ----------------------------- Constantes -----------------------------
const GRAVITY = -28;
const OLLIE_FORCE = 10.5;
const MAX_SPEED = 13;
const ACCEL = 9;
const BRAKE = 14;
const FRICTION = 3.5;
const TURN_RATE = 2.4; // rad/s à pleine vitesse
const GRIND_RADIUS = 0.9;
const GRIND_SNAP_Y = 0.55;
const MATCH_TIME = 120; // secondes
const HALF_W = 22; // limites jouables du hangar (doit correspondre à buildHangar)
const HALF_L = 32;

// ----------------------------- État global -----------------------------
let scene, camera, renderer, clock;
let player, board;
let rideableMeshes = [];
let grindRails = []; // { a: Vector3, b: Vector3 } (y déjà inclus dans a/b)

const state = {
  pos: new THREE.Vector3(0, 0.4, 10),
  vy: 0,
  speed: 0,
  yaw: 0,
  grounded: false,
  grinding: null, // { a, b, t, dir }
  comboCount: 0,
  comboTimer: 0,
  score: 0,
  timeLeft: MATCH_TIME,
  over: false,
};

const keys = {};

// ----------------------------- Init -----------------------------
init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);
  scene.fog = new THREE.Fog(0x0b0e14, 25, 70);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  buildLights();
  buildHangar();
  buildSkatepark();
  buildPlayer();

  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", (e) => (keys[e.code] = true));
  window.addEventListener("keyup", (e) => (keys[e.code] = false));
  document.getElementById("retry").addEventListener("click", resetGame);

  resetGame();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------------------------- Décor : le hangar -----------------------------
function buildLights() {
  const ambient = new THREE.AmbientLight(0x8899aa, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4dd, 1.1);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);

  const fill = new THREE.PointLight(0x38bdf8, 0.4, 60);
  fill.position.set(-15, 12, -15);
  scene.add(fill);
}

function buildHangar() {
  // Sol du hangar (plaza en béton)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  rideableMeshes.push(floor);

  // Marquages au sol (juste esthétique)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x6b7280 });
  for (let i = -HALF_L + 4; i < HALF_L; i += 8) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 - 2, 0.15), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.01, i);
    scene.add(line);
  }

  // Murs latéraux (tôle de hangar)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b3542, roughness: 0.8, metalness: 0.3 });
  const wallHeight = 14;
  [-HALF_W, HALF_W].forEach((x) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, wallHeight, HALF_L * 2), wallMat);
    wall.position.set(x, wallHeight / 2, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  });

  // Mur du fond (le hangar est ouvert côté +Z pour laisser entrer la lumière)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, wallHeight, 0.6), wallMat);
  backWall.position.set(0, wallHeight / 2, -HALF_L);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  scene.add(backWall);

  // Arches du toit (structure façon hangar industriel)
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.6, metalness: 0.6 });
  const archCount = 9;
  for (let i = 0; i <= archCount; i++) {
    const z = -HALF_L + (i / archCount) * HALF_L * 2;
    const archShape = new THREE.Shape();
    const segs = 16;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const ang = Math.PI * t; // 0..PI
      const x = -Math.cos(ang) * HALF_W;
      const y = wallHeight + Math.sin(ang) * 9;
      if (s === 0) archShape.moveTo(x, y);
      else archShape.lineTo(x, y);
    }
    const points = archShape.getPoints();
    const archGeom = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(p.x, p.y, 0))
    );
    const arch = new THREE.Line(archGeom, new THREE.LineBasicMaterial({ color: 0x9ca3af }));
    arch.position.z = z;
    scene.add(arch);
  }

  // Panneau de toit semi-transparent (laisse deviner la lumière du jour)
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(HALF_W, HALF_W, HALF_L * 2, 24, 1, true, 0, Math.PI), roofMat);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.set(0, wallHeight, 0);
  scene.add(roof);
}

// ----------------------------- Skatepark (inspiré du park d'Anglet) -----------------------------
function buildSkatepark() {
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.85 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.3, metalness: 0.8 });

  // Deux quarter-pipes qui se font face aux extrémités de la plaza
  const qp1 = createQuarterPipe(4.2, 14, rampMat);
  qp1.position.set(0, 0, -24);
  scene.add(qp1);
  rideableMeshes.push(qp1);

  const qp2 = createQuarterPipe(4.2, 14, rampMat);
  qp2.rotation.y = Math.PI;
  qp2.position.set(0, 0, 20);
  scene.add(qp2);
  rideableMeshes.push(qp2);

  // Funbox central avec rail à grinder et escalier d'accès
  const funboxHeight = 1.3;
  const funbox = new THREE.Mesh(new THREE.BoxGeometry(5, funboxHeight, 8), woodMat);
  funbox.position.set(-9, funboxHeight / 2, -2);
  funbox.castShadow = true;
  funbox.receiveShadow = true;
  scene.add(funbox);
  rideableMeshes.push(funbox);

  addGrindRail(
    new THREE.Vector3(-9 - 2.5, funboxHeight + 0.12, -6),
    new THREE.Vector3(-9 - 2.5, funboxHeight + 0.12, 2),
    railMat
  );

  buildStairs(new THREE.Vector3(-9, 0, 3.2), funboxHeight, woodMat);

  // Curbs / rails grindables le long des deux bords de la plaza
  const curbHeight = 0.45;
  [-20, 20].forEach((x) => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(1, curbHeight, 30), rampMat);
    curb.position.set(x, curbHeight / 2, -2);
    curb.castShadow = true;
    curb.receiveShadow = true;
    scene.add(curb);
    rideableMeshes.push(curb);

    addGrindRail(
      new THREE.Vector3(x, curbHeight + 0.1, -16.5),
      new THREE.Vector3(x, curbHeight + 0.1, 12.5),
      railMat
    );
  });

  // Petit ledge + rail supplémentaire côté droit, pour varier les lignes
  const ledgeHeight = 0.55;
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(7, ledgeHeight, 1.4), rampMat);
  ledge.position.set(9, ledgeHeight / 2, 8);
  ledge.castShadow = true;
  ledge.receiveShadow = true;
  scene.add(ledge);
  rideableMeshes.push(ledge);

  addGrindRail(
    new THREE.Vector3(5.6, ledgeHeight + 0.1, 8),
    new THREE.Vector3(12.4, ledgeHeight + 0.1, 8),
    railMat
  );
}

// Génère une rampe "quarter-pipe" par extrusion d'un profil courbe (transition tangente au sol).
function createQuarterPipe(radius, width, material) {
  const backDepth = 0.6;
  const segs = 14;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let i = 0; i <= segs; i++) {
    const x = (i / segs) * radius;
    const y = radius - Math.sqrt(Math.max(radius * radius - x * x, 0));
    shape.lineTo(x, y);
  }
  shape.lineTo(radius, -backDepth);
  shape.lineTo(0, -backDepth);
  shape.lineTo(0, 0);

  const geom = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geom.translate(-radius / 2, 0, -width / 2); // centre la géométrie
  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildStairs(base, totalHeight, material) {
  const steps = 5;
  const stepH = totalHeight / steps;
  const stepD = 0.55;
  for (let i = 0; i < steps; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(3, stepH * (i + 1), stepD), material);
    step.position.set(base.x, (stepH * (i + 1)) / 2, base.z + i * stepD);
    step.castShadow = true;
    step.receiveShadow = true;
    scene.add(step);
    rideableMeshes.push(step);
  }
}

function addGrindRail(a, b, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), material);
  rail.position.copy(mid);
  rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  rail.castShadow = true;
  scene.add(rail);

  grindRails.push({ a: a.clone(), b: b.clone() });
}

// ----------------------------- Le skateur -----------------------------
function buildPlayer() {
  player = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.0, 10), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true;
  player.add(body);

  const headMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), headMat);
  head.position.y = 1.4;
  head.castShadow = true;
  player.add(head);

  const boardMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9 });
  board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.7), boardMat);
  board.position.y = 0.24;
  board.castShadow = true;
  player.add(board);

  scene.add(player);
}

// ----------------------------- Boucle de jeu -----------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!state.over) {
    update(dt);
  }
  renderer.render(scene, camera);
}

function update(dt) {
  handleInput(dt);
  if (state.grinding) {
    updateGrind(dt);
  } else {
    updatePhysics(dt);
    tryStartGrind();
  }
  updateCombo(dt);
  updatePlayerTransform();
  updateCamera(dt);
  updateTimer(dt);
  updateUI();
}

function handleInput(dt) {
  const forward = keys["ArrowUp"] || keys["KeyW"] || keys["KeyZ"];
  const backward = keys["ArrowDown"] || keys["KeyS"];
  const left = keys["ArrowLeft"] || keys["KeyA"] || keys["KeyQ"];
  const right = keys["ArrowRight"] || keys["KeyD"];

  if (!state.grinding) {
    if (forward) state.speed = Math.min(state.speed + ACCEL * dt, MAX_SPEED);
    else if (backward) state.speed = Math.max(state.speed - BRAKE * dt, -MAX_SPEED * 0.5);
    else {
      const sign = Math.sign(state.speed);
      state.speed -= sign * FRICTION * dt;
      if (Math.sign(state.speed) !== sign) state.speed = 0;
    }

    const turnFactor = Math.min(Math.abs(state.speed) / MAX_SPEED + 0.25, 1);
    if (left) state.yaw += TURN_RATE * turnFactor * dt;
    if (right) state.yaw -= TURN_RATE * turnFactor * dt;
  }

  if (keys["Space"]) {
    keys["Space"] = false; // évite le saut multiple en maintenant la touche
    if (state.grinding) {
      endGrind(true);
    } else if (state.grounded) {
      state.vy = OLLIE_FORCE;
      state.grounded = false;
      addScore(100, "OLLIE !");
    }
  }

  if (keys["KeyR"]) {
    keys["KeyR"] = false;
    respawn();
  }
}

function updatePhysics(dt) {
  // Déplacement horizontal selon le cap (yaw)
  const dx = Math.sin(state.yaw) * state.speed * dt;
  const dz = Math.cos(state.yaw) * state.speed * dt;
  state.pos.x += dx;
  state.pos.z += dz;

  // Empêche de sortir de la zone jouable du hangar (pas de mur physique pour l'instant)
  const margin = 1;
  state.pos.x = THREE.MathUtils.clamp(state.pos.x, -HALF_W + margin, HALF_W - margin);
  state.pos.z = THREE.MathUtils.clamp(state.pos.z, -HALF_L + margin, HALF_L - margin);

  // Gravité
  state.vy += GRAVITY * dt;
  state.pos.y += state.vy * dt;

  // Détection du sol par raycast vers le bas
  const groundY = raycastGround(state.pos.x, state.pos.z, state.pos.y + 6);
  if (groundY !== null && state.pos.y <= groundY + 0.05) {
    if (state.vy <= 0) {
      const wasAirborne = !state.grounded;
      state.pos.y = groundY;
      state.vy = 0;
      state.grounded = true;
      if (wasAirborne && state.comboCount > 0) {
        addScore(50 * state.comboCount, "LANDÉ !");
      }
    }
  } else {
    state.grounded = false;
  }

  if (state.pos.y < -20) respawn();
}

function raycastGround(x, z, fromY) {
  const origin = new THREE.Vector3(x, fromY, z);
  const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 20);
  const hits = raycaster.intersectObjects(rideableMeshes, false);
  return hits.length ? hits[0].point.y : null;
}

function tryStartGrind() {
  if (state.grounded) return; // on grinde en l'air / en frôlant le rail, pas en roulant au sol
  for (const rail of grindRails) {
    const closest = closestPointOnSegment(state.pos, rail.a, rail.b);
    const horizDist = Math.hypot(closest.x - state.pos.x, closest.z - state.pos.z);
    const vertDist = state.pos.y - closest.y;
    if (horizDist < GRIND_RADIUS && vertDist > -0.2 && vertDist < GRIND_SNAP_Y && state.vy <= 1) {
      startGrind(rail);
      return;
    }
  }
}

function startGrind(rail) {
  const dir = new THREE.Vector3().subVectors(rail.b, rail.a).normalize();
  const toPlayer = new THREE.Vector3().subVectors(state.pos, rail.a);
  const len = rail.a.distanceTo(rail.b);
  let t = toPlayer.dot(dir) / len;
  t = THREE.MathUtils.clamp(t, 0, 1);

  // On grinde dans le sens où le skateur se dirige déjà
  const forwardDir = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  const sign = forwardDir.dot(dir) >= 0 ? 1 : -1;

  state.grinding = { a: rail.a, b: rail.b, t, sign, len };
  state.vy = 0;
  state.speed = Math.max(Math.abs(state.speed), 6);
  addScore(75, "GRIND !");
}

function updateGrind(dt) {
  const g = state.grinding;
  g.t += (g.sign * Math.abs(state.speed) * dt) / g.len;

  if (g.t <= 0 || g.t >= 1) {
    endGrind(false);
    return;
  }

  const p = new THREE.Vector3().lerpVectors(g.a, g.b, g.t);
  state.pos.x = p.x;
  state.pos.z = p.z;
  state.pos.y = p.y;

  const dir = new THREE.Vector3().subVectors(g.b, g.a).normalize().multiplyScalar(g.sign);
  state.yaw = Math.atan2(dir.x, dir.z);

  addScore(120 * dt, null); // score continu pendant le grind (silencieux, pas de bannière à chaque frame)
}

function endGrind(popOff) {
  state.grinding = null;
  state.grounded = false;
  state.vy = popOff ? OLLIE_FORCE * 0.8 : 2;
  if (popOff) addScore(50, "POP OUT !");
}

function closestPointOnSegment(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = THREE.MathUtils.clamp(
    new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq(),
    0,
    1
  );
  return new THREE.Vector3().copy(a).add(ab.multiplyScalar(t));
}

function updateCombo(dt) {
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.comboCount = 0;
  }
}

function addScore(amount, banner) {
  state.score += amount;
  if (banner) {
    state.comboCount += 1;
    state.comboTimer = 2.5;
    showBanner(banner);
  }
}

function updatePlayerTransform() {
  player.position.copy(state.pos);
  player.rotation.y = state.yaw;
  const lean = state.grinding ? 0 : THREE.MathUtils.clamp(-state.vy * 0.03, -0.4, 0.4);
  board.rotation.x = lean;
}

function updateCamera(dt) {
  const behind = new THREE.Vector3(
    -Math.sin(state.yaw) * 7,
    3.2,
    -Math.cos(state.yaw) * 7
  );
  const desired = new THREE.Vector3().copy(state.pos).add(behind);
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  const lookTarget = new THREE.Vector3().copy(state.pos).add(new THREE.Vector3(0, 1.2, 0));
  camera.lookAt(lookTarget);
}

function updateTimer(dt) {
  if (state.timeLeft <= 0) return;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endGame();
  }
}

function updateUI() {
  document.getElementById("score").textContent = Math.floor(state.score);
  document.getElementById("timer").textContent = Math.ceil(state.timeLeft);
  const comboEl = document.getElementById("combo");
  comboEl.textContent = state.comboCount > 0 ? `Combo x${state.comboCount}` : "";
}

let bannerTimeout = null;
function showBanner(text) {
  const el = document.getElementById("banner");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => el.classList.remove("show"), 700);
}

function respawn() {
  state.pos.set(0, 3, 10);
  state.vy = 0;
  state.speed = 0;
  state.grinding = null;
  state.comboCount = 0;
  state.comboTimer = 0;
}

function endGame() {
  state.over = true;
  document.getElementById("finalscore").textContent = Math.floor(state.score);
  document.getElementById("gameover").style.display = "flex";
}

function resetGame() {
  state.score = 0;
  state.timeLeft = MATCH_TIME;
  state.over = false;
  state.yaw = Math.PI;
  respawn();
  document.getElementById("gameover").style.display = "none";
}
