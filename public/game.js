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
const HALF_L = 42;

// Bowl (piscine creusée) : position et dimensions, utilisées à la fois pour
// découper le trou dans le sol et pour construire la géométrie du bowl.
const BOWL_X = 0;
const BOWL_Z = -36;
const BOWL_RADIUS = 6;
const BOWL_DEPTH = 2.6;

// Palette "skate urbain" : béton gris pour les surfaces, accents néon sur les
// rails/copings uniquement.
const COLORS = {
  sky: 0x9fb4c4,
  asphalt: 0x4b5259,
  plaza: 0xd6d1c4,
  plazaBorder: 0x33383d,
  concreteLight: 0xbdb8ac,
  concreteMid: 0xa6a19a,
  concreteDark: 0x8d8983,
  neonRed: 0xff3b3b,
  neonYellow: 0xffe14d,
  neonCyan: 0x2fe6e6,
  metalLight: 0xd7dbe0,
  metalDark: 0x2f333a,
};

// ----------------------------- État global -----------------------------
let scene, camera, renderer, clock;
let player, board, boardFlip;
let torso, leftLeg, rightLeg, leftArm, rightArm; // leftLeg/rightLeg/leftArm/rightArm = { root, joint }
const anim = {
  rollPhase: 0,
  // Valeurs courantes (amorties) de chaque articulation.
  hipL: 0, hipR: 0, kneeL: 0.15, kneeR: 0.15,
  armSwingL: 0, armSwingR: 0, armOutL: 0.2, armOutR: -0.2, elbowL: 0.35, elbowR: 0.35,
};
let rideableMeshes = [];
let grindRails = []; // { a: Vector3, b: Vector3 } (y déjà inclus dans a/b)
let colliders = []; // { x, z, radius, height } — obstacles compacts qui bloquent le joueur horizontalement

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
  activeTricks: {}, // { [id]: { time, duration } } — figures aériennes en cours d'animation
  airTricks: [], // { name, value } enchaînées depuis le dernier décollage, banquées à l'atterrissage
  airSpin: 0, // rotation visuelle du corps pendant un 360°, indépendante du cap (yaw)
};

// Figures aériennes façon THPS : chacune anime un axe différent (planche ou
// corps) donc elles peuvent s'enchaîner/se superposer pendant un même saut.
const TRICKS = {
  kickflip: { key: "KeyX", name: "Kickflip", value: 150, duration: 0.45 },
  shoveit: { key: "KeyC", name: "Shove-it", value: 150, duration: 0.4 },
  spin360: { key: "KeyV", name: "360°", value: 200, duration: 0.55 },
};

const keys = {};

// ----------------------------- Style cartoon (toon shading + contours) -----------------------------
let toonGradient = null;

function getToonGradient() {
  if (toonGradient) return toonGradient;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  // 4 bandes de lumière franches, façon cel-shading
  const shades = [90, 150, 205, 255];
  shades.forEach((v, i) => {
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(i, 0, 1, 1);
  });
  toonGradient = new THREE.CanvasTexture(canvas);
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.generateMipmaps = false;
  return toonGradient;
}

function toonMat(color, extra) {
  return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: getToonGradient() }, extra));
}

// Ajoute un contour noir façon bande-dessinée autour d'un mesh (silhouette figée dans sa géométrie).
function addOutline(mesh, color = 0x1a1a2e) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 28);
  const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }));
  mesh.add(outline);
  return mesh;
}

// Raccourci : crée un mesh avec matériau toon + ombres + contour, prêt à ajouter à la scène.
function toonMesh(geometry, color, extra) {
  const mesh = new THREE.Mesh(geometry, toonMat(color, extra));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh);
  return mesh;
}

// ----------------------------- Init -----------------------------
init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 40, 95);

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
  window.addEventListener("orientationchange", () => setTimeout(onResize, 200));
  window.addEventListener("keydown", (e) => (keys[e.code] = true));
  window.addEventListener("keyup", (e) => (keys[e.code] = false));
  document.getElementById("retry").addEventListener("click", resetGame);

  setupTouchControls();
  resetGame();
}

// Détecte le tactile, affiche les boutons à l'écran et les relie aux mêmes
// codes que le clavier (`keys[...]`) pour ne pas dupliquer la logique de jeu.
function setupTouchControls() {
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (!isTouch) return;
  document.body.classList.add("touch");

  // Empêche le menu contextuel (copier/coller) sur appui long.
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  const bind = (id, code) => {
    const el = document.getElementById(id);
    if (!el) return;
    const start = (e) => {
      e.preventDefault();
      keys[code] = true;
      el.classList.add("active");
    };
    const end = (e) => {
      e.preventDefault();
      keys[code] = false;
      el.classList.remove("active");
    };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchend", end, { passive: false });
    el.addEventListener("touchcancel", end, { passive: false });
  };

  bind("btn-left", "ArrowLeft");
  bind("btn-right", "ArrowRight");
  bind("btn-up", "ArrowUp");
  bind("btn-down", "ArrowDown");
  bind("btn-ollie", "Space");
  bind("btn-kickflip", "KeyX");
  bind("btn-shoveit", "KeyC");
  bind("btn-spin", "KeyV");
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------------------------- Décor : le hangar -----------------------------
function buildLights() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff8e7, 1.15);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);

  const fill = new THREE.PointLight(0xffd166, 0.35, 60);
  fill.position.set(-15, 12, -15);
  scene.add(fill);
}

function buildHangar() {
  // Sol : une plaza béton, avec un vrai trou découpé dans la géométrie à
  // l'emplacement du bowl (sinon le sol plat masquerait le bowl au raycast).
  const floorTexture = createFloorTexture();
  const floorMat = new THREE.MeshToonMaterial({ map: floorTexture, gradientMap: getToonGradient() });

  const floorShape = new THREE.Shape();
  floorShape.moveTo(-HALF_W, -HALF_L);
  floorShape.lineTo(HALF_W, -HALF_L);
  floorShape.lineTo(HALF_W, HALF_L);
  floorShape.lineTo(-HALF_W, HALF_L);
  floorShape.lineTo(-HALF_W, -HALF_L);
  const bowlHole = new THREE.Path();
  // Le Y local du Shape correspond à -Z une fois la géométrie posée à plat
  // (rotation.x = -PI/2) — on compense pour aligner le trou sur BOWL_Z.
  bowlHole.absarc(BOWL_X, -BOWL_Z, BOWL_RADIUS, 0, Math.PI * 2, false);
  floorShape.holes.push(bowlHole);

  const floor = new THREE.Mesh(new THREE.ShapeGeometry(floorShape, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  rideableMeshes.push(floor);

  // Structure de hangar ouverte façon auvent : juste les poteaux/arches, pas de
  // murs pleins, pour laisser le ciel et le décor bien visibles.
  const wallHeight = 14;
  const archCount = 8;
  for (let i = 0; i <= archCount; i++) {
    const z = -HALF_L + (i / archCount) * HALF_L * 2;

    // Poteaux verticaux de chaque côté
    [-HALF_W, HALF_W].forEach((x) => {
      const post = toonMesh(new THREE.CylinderGeometry(0.35, 0.35, wallHeight, 10), COLORS.metalDark);
      post.position.set(x, wallHeight / 2, z);
      scene.add(post);
      addCollider(x, z, 0.45, wallHeight);
    });

    // Arche du toit (ligne fine, purement décorative, accent néon)
    const archShape = new THREE.Shape();
    const segs = 16;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const ang = Math.PI * t;
      const x = -Math.cos(ang) * HALF_W;
      const y = wallHeight + Math.sin(ang) * 9;
      if (s === 0) archShape.moveTo(x, y);
      else archShape.lineTo(x, y);
    }
    const points = archShape.getPoints();
    const archGeom = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(p.x, p.y, 0))
    );
    const arch = new THREE.Line(archGeom, new THREE.LineBasicMaterial({ color: COLORS.neonYellow, linewidth: 2 }));
    arch.position.z = z;
    scene.add(arch);
  }

  // Toit très légèrement teinté, surtout pour l'ombrage — le ciel reste visible
  const roofMat = new THREE.MeshBasicMaterial({
    color: 0xdfe7ec,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(HALF_W, HALF_W, HALF_L * 2, 24, 1, true, 0, Math.PI), roofMat);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.set(0, wallHeight, 0);
  scene.add(roof);

  buildBackgroundScenery();
}

// Peint la plaza béton + la bordure sur un canvas, utilisé comme texture du
// sol — évite les faux-raccords entre plusieurs meshes.
function createFloorTexture() {
  const pxPerUnit = 10;
  const w = HALF_W * 2 * pxPerUnit;
  const h = HALF_L * 2 * pxPerUnit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Asphalte tout autour
  ctx.fillStyle = "#4b5259";
  ctx.fillRect(0, 0, w, h);
  // Petits éclats plus clairs (grain d'asphalte)
  ctx.fillStyle = "#565e66";
  for (let i = 0; i < 300; i++) {
    const rx = Math.random() * w;
    const ry = Math.random() * h;
    ctx.fillRect(rx, ry, 10, 2);
  }

  // Bordure de la plaza (foncée) puis plaza béton clair par-dessus
  const cx = w / 2;
  const cy = h / 2;
  const rx = HALF_W * pxPerUnit - 55;
  const ry = HALF_L * pxPerUnit - 70;

  ctx.fillStyle = "#33383d";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 14, ry + 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d6d1c4";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

// Décor lointain autour du skatepark : plage + mer + soleil d'un côté
// (au-delà de -Z), un parking avec quelques voitures de l'autre (au-delà
// de +X) — visible à travers l'ossature ouverte du hangar.
function buildBackgroundScenery() {
  buildBeachAndSea();
  buildSun();
  buildParkingLot();
}

function buildBeachAndSea() {
  const beachNearZ = -HALF_L;

  // Plage de sable juste après la limite du hangar
  const sand = toonMesh(new THREE.PlaneGeometry(HALF_W * 2 + 60, 20), 0xe8d9a6);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.04, beachNearZ - 10);
  scene.add(sand);

  // Quelques palmiers dispersés sur la plage
  for (let i = 0; i < 7; i++) {
    const x = -HALF_W - 15 + i * 9 + (Math.random() - 0.5) * 5;
    const z = beachNearZ - 4 - Math.random() * 10;
    buildPalmTree(x, z);
  }

  // Mer, avec une texture de vaguelettes peinte sur canvas
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 180),
    new THREE.MeshToonMaterial({ map: createSeaTexture(), gradientMap: getToonGradient() })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.08, beachNearZ - 60);
  scene.add(sea);
}

function createSeaTexture() {
  const w = 256, h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#2f9bd6";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const y = (i / 12) * h + Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 3);
  return texture;
}

function buildPalmTree(x, z) {
  const trunkGeom = new THREE.CylinderGeometry(0.12, 0.2, 3.2, 6);
  trunkGeom.translate(0, 1.6, 0); // pose la base au sol
  const trunk = toonMesh(trunkGeom, 0x8a5a3b);
  trunk.rotation.z = 0.14;
  trunk.position.set(x, 0, z);
  scene.add(trunk);

  const frondMat = toonMat(0x2f9e44);
  for (let i = 0; i < 6; i++) {
    const frondGroup = new THREE.Group();
    frondGroup.position.set(x + Math.sin(0.14) * 3.3, 3.3, z);
    frondGroup.rotation.y = (i / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.5, 4), frondMat);
    frond.position.set(0.75, 0.1, 0);
    frond.rotation.z = Math.PI / 2 - 0.5;
    frondGroup.add(frond);
    scene.add(frondGroup);
  }
}

function buildSun() {
  const sunPos = new THREE.Vector3(-28, 24, -HALF_L - 75);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  sun.position.copy(sunPos);
  scene.add(sun);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(9.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.22 })
  );
  halo.position.copy(sunPos);
  scene.add(halo);
}

function buildParkingLot() {
  const lotX = HALF_W + 16;

  const lot = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 46),
    new THREE.MeshToonMaterial({ map: createParkingTexture(), gradientMap: getToonGradient() })
  );
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(lotX, -0.03, -6);
  scene.add(lot);

  const carColors = [0xff6b6b, 0x4dabf7, 0xffe14d, 0xd7dbe0, 0x63e6be];
  for (let i = 0; i < 5; i++) {
    buildCar(lotX, -18 + i * 9, carColors[i % carColors.length]);
  }
}

function createParkingTexture() {
  const w = 200, h = 460;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#4b5259";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#e8e8e8";
  ctx.lineWidth = 4;
  for (let i = 0; i < 5; i++) {
    const y = 20 + i * 90;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(20, y + 70);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 20, y);
    ctx.lineTo(w - 20, y + 70);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function buildCar(x, z, color) {
  const base = toonMesh(new THREE.BoxGeometry(1.7, 0.5, 3.4), color);
  base.position.set(x, 0.35, z);
  scene.add(base);

  const cabin = toonMesh(new THREE.BoxGeometry(1.4, 0.4, 1.8), color);
  cabin.position.set(x, 0.75, z - 0.2);
  scene.add(cabin);

  [
    [-0.75, 1.1],
    [-0.75, -1.1],
    [0.75, 1.1],
    [0.75, -1.1],
  ].forEach(([dx, dz]) => {
    const wheel = toonMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 10), COLORS.metalDark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x + dx, 0.28, z + dz);
    scene.add(wheel);
  });
}

// ----------------------------- Skatepark (inspiré du park d'Anglet, style cartoon) -----------------------------
function buildSkatepark() {
  // Pyramide centrale (hip à 4 pans) avec rail sur l'arête du sommet — la pièce
  // signature du park d'Anglet, en béton avec un rail néon jaune.
  const pyramidTop = 1.6;
  const pyramidHeight = 2.2;
  const pyramidCenter = new THREE.Vector3(0, 0, -6);
  const pyramid = createPyramidHip(5, pyramidTop, pyramidHeight, COLORS.concreteLight);
  pyramid.position.copy(pyramidCenter);
  scene.add(pyramid);
  rideableMeshes.push(pyramid);

  // Rail le long de l'arête du sommet qui fait face au spawn (+Z), pour une
  // ligne d'approche naturelle en arrivant depuis le départ.
  const apothem = (pyramidTop / 2) * Math.cos(Math.PI / 4);
  const railY = pyramidHeight + 0.1;
  const railZ = pyramidCenter.z + apothem;
  addGrindRail(
    new THREE.Vector3(pyramidCenter.x - apothem, railY, railZ),
    new THREE.Vector3(pyramidCenter.x + apothem, railY, railZ),
    COLORS.neonYellow
  );

  // Quarter-pipe béton côté gauche
  const qpLeft = createQuarterPipe(3.4, 7, COLORS.concreteMid);
  qpLeft.rotation.y = Math.PI / 2;
  qpLeft.position.set(-16, 0, -16);
  scene.add(qpLeft);
  rideableMeshes.push(qpLeft);

  // Rampe banque (wedge) béton côté droit
  const wedgeRight = createWedgeRamp(3.2, 3.2, 7, COLORS.concreteDark);
  wedgeRight.rotation.y = -Math.PI / 2;
  wedgeRight.position.set(15, 0, -15);
  scene.add(wedgeRight);
  rideableMeshes.push(wedgeRight);

  // Quarter-pipe béton près du spawn, pour prendre de l'air en arrivant
  const qpSpawn = createQuarterPipe(3.6, 8, COLORS.concreteLight);
  qpSpawn.rotation.y = Math.PI;
  qpSpawn.position.set(0, 0, 18);
  scene.add(qpSpawn);
  rideableMeshes.push(qpSpawn);

  // Rail isolé sur pieds métalliques (comme le rail "table" vu sur les photos)
  buildStandaloneRail(new THREE.Vector3(-9, 0, 6), new THREE.Vector3(-2, 0, 6), COLORS.neonCyan);

  // Petit ledge bas à droite, pour varier les lignes de grind
  const ledgeHeight = 0.55;
  const ledge = toonMesh(new THREE.BoxGeometry(7, ledgeHeight, 1.4), COLORS.concreteMid);
  ledge.position.set(9, ledgeHeight / 2, 8);
  scene.add(ledge);
  rideableMeshes.push(ledge);
  addGrindRail(
    new THREE.Vector3(5.6, ledgeHeight + 0.1, 8),
    new THREE.Vector3(12.4, ledgeHeight + 0.1, 8),
    COLORS.neonRed
  );

  buildBowl();
}

// Bowl (piscine creusée) : un profil de révolution (fond plat + paroi
// courbe qui rejoint le sol à la verticale) avec un coping néon grindable
// tout autour du rebord.
function buildBowl() {
  const flatRadius = Math.max(BOWL_RADIUS - BOWL_DEPTH, 0.6);
  const wallRun = BOWL_RADIUS - flatRadius;
  const points = [new THREE.Vector2(0, -BOWL_DEPTH), new THREE.Vector2(flatRadius, -BOWL_DEPTH)];

  const wallSegs = 14;
  for (let i = 1; i <= wallSegs; i++) {
    const t = i / wallSegs;
    const x = t * wallRun;
    const y = wallRun - Math.sqrt(Math.max(wallRun * wallRun - x * x, 0));
    points.push(new THREE.Vector2(flatRadius + x, -BOWL_DEPTH + y));
  }

  const bowlGeom = new THREE.LatheGeometry(points, 48);
  // DoubleSide : les normales du Lathe pointent vers l'intérieur du bol, il
  // faut donc rendre (et pouvoir raycaster) les deux faces.
  const bowl = toonMesh(bowlGeom, COLORS.concreteMid, { side: THREE.DoubleSide });
  bowl.position.set(BOWL_X, 0, BOWL_Z);
  scene.add(bowl);
  rideableMeshes.push(bowl);

  // Coping néon autour du rebord, approximé par des segments de grind droits
  const copingSegs = 20;
  for (let i = 0; i < copingSegs; i++) {
    const a1 = (i / copingSegs) * Math.PI * 2;
    const a2 = ((i + 1) / copingSegs) * Math.PI * 2;
    addGrindRail(
      new THREE.Vector3(BOWL_X + Math.cos(a1) * BOWL_RADIUS, 0.12, BOWL_Z + Math.sin(a1) * BOWL_RADIUS),
      new THREE.Vector3(BOWL_X + Math.cos(a2) * BOWL_RADIUS, 0.12, BOWL_Z + Math.sin(a2) * BOWL_RADIUS),
      COLORS.neonRed
    );
  }

  // Anneau visuel du coping (tube fin qui souligne le rebord)
  const copingRing = toonMesh(new THREE.TorusGeometry(BOWL_RADIUS, 0.09, 8, copingSegs), COLORS.neonRed);
  copingRing.rotation.x = Math.PI / 2;
  copingRing.position.set(BOWL_X, 0.12, BOWL_Z);
  scene.add(copingRing);
}

// Rampe "quarter-pipe" par extrusion d'un profil courbe (transition tangente au sol).
function createQuarterPipe(radius, width, color) {
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
  return toonMesh(geom, color);
}

// Rampe "banque" simple (plan incliné droit), pour varier avec les quarter-pipes courbes.
function createWedgeRamp(radius, height, width, color) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(radius, height);
  shape.lineTo(radius, 0);
  shape.lineTo(0, 0);

  const geom = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geom.translate(-radius / 2, 0, -width / 2);
  return toonMesh(geom, color);
}

// Pyramide/hip à 4 pans plats (frustum carré) avec un petit plateau au sommet.
function createPyramidHip(baseSize, topSize, height, color) {
  const geom = new THREE.CylinderGeometry(topSize / 2, baseSize / 2, height, 4, 1, false);
  geom.translate(0, height / 2, 0); // pose la base au sol (y=0) au lieu d'être centrée
  const mesh = toonMesh(geom, color);
  mesh.rotation.y = Math.PI / 4; // aligne les faces plates sur les axes X/Z
  return mesh;
}

function buildStandaloneRail(a, b, color = COLORS.neonCyan) {
  const railHeight = 0.9;

  // Deux pieds façon tréteau, aux extrémités
  [a, b].forEach((p) => {
    const leg = toonMesh(new THREE.BoxGeometry(0.18, railHeight, 0.5), COLORS.metalDark);
    leg.position.set(p.x, railHeight / 2, p.z);
    scene.add(leg);
    addCollider(p.x, p.z, 0.3, railHeight);
  });

  addGrindRail(
    new THREE.Vector3(a.x, railHeight, a.z),
    new THREE.Vector3(b.x, railHeight, b.z),
    color
  );
}

// Ajoute un obstacle compact qui bloque le joueur horizontalement (piste
// circulaire simple) tant qu'il est en dessous de `height` — au-dessus, on
// laisse passer (le joueur saute par-dessus ou est en train d'atterrir dessus).
function addCollider(x, z, radius, height) {
  colliders.push({ x, z, radius, height });
}

function resolveHorizontalCollisions() {
  for (const c of colliders) {
    if (state.pos.y > c.height) continue;
    const dx = state.pos.x - c.x;
    const dz = state.pos.z - c.z;
    const dist = Math.hypot(dx, dz);
    if (dist < c.radius && dist > 1e-4) {
      const push = c.radius - dist;
      state.pos.x += (dx / dist) * push;
      state.pos.z += (dz / dist) * push;
    }
  }
}

function addGrindRail(a, b, color = COLORS.metalLight) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  const rail = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, len, 8), color);
  rail.position.copy(mid);
  rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  scene.add(rail);

  grindRails.push({ a: a.clone(), b: b.clone() });
}

// ----------------------------- Le skateur -----------------------------
// Squelette procédural à deux segments par membre (épaule+coude pour les
// bras, hanche+genou pour les jambes) : chaque articulation est un
// THREE.Group pivot imbriqué dans le précédent, comme un vrai rig simplifié.
// Voir createLimbChain() pour la construction et animatePlayer() pour les
// poses (roule / en l'air / grind).
function buildPlayer() {
  player = new THREE.Group();

  torso = toonMesh(new THREE.CylinderGeometry(0.24, 0.2, 0.7, 10), COLORS.metalDark);
  torso.position.y = 0.95;
  player.add(torso);

  const head = toonMesh(new THREE.SphereGeometry(0.22, 10, 10), 0xffe3c2);
  head.position.y = 1.48;
  player.add(head);

  // Jambes : hanche -> cuisse -> genou -> mollet -> pied.
  leftLeg = createLimbChain({
    upperLen: 0.34, upperRadius: 0.11, lowerLen: 0.32, lowerRadius: 0.09,
    limbColor: COLORS.metalDark, capColor: COLORS.neonRed, capShape: "shoe",
  });
  leftLeg.root.position.set(-0.14, 0.62, 0);
  player.add(leftLeg.root);

  rightLeg = createLimbChain({
    upperLen: 0.34, upperRadius: 0.11, lowerLen: 0.32, lowerRadius: 0.09,
    limbColor: COLORS.metalDark, capColor: COLORS.neonRed, capShape: "shoe",
  });
  rightLeg.root.position.set(0.14, 0.62, 0);
  player.add(rightLeg.root);

  // Bras : épaule -> bras -> coude -> avant-bras -> main.
  leftArm = createLimbChain({
    upperLen: 0.28, upperRadius: 0.075, lowerLen: 0.26, lowerRadius: 0.065,
    limbColor: COLORS.metalDark, capColor: 0xffe3c2, capShape: "hand",
  });
  leftArm.root.position.set(-0.32, 1.2, 0);
  player.add(leftArm.root);

  rightArm = createLimbChain({
    upperLen: 0.28, upperRadius: 0.075, lowerLen: 0.26, lowerRadius: 0.065,
    limbColor: COLORS.metalDark, capColor: 0xffe3c2, capShape: "hand",
  });
  rightArm.root.position.set(0.32, 1.2, 0);
  player.add(rightArm.root);

  board = buildBoard();
  board.position.y = 0.24;
  player.add(board);

  scene.add(player);
}

// Construit une planche détaillée : plateau avec nose/tail relevés (kicks),
// trucks et roues. Renvoie un groupe "outer" (position + inclinaison de la
// planche, rotation.x) qui contient un groupe "boardFlip" (rotation.z, pour
// faire tourner la planche façon kickflip pendant une figure).
function buildBoard() {
  const outer = new THREE.Group();
  boardFlip = new THREE.Group();
  outer.add(boardFlip);

  const L = 1.7, W = 0.46, thickness = 0.05, kickHeight = 0.14, kickLen = 0.34;
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, kickHeight);
  shape.lineTo(-L / 2 + kickLen, 0);
  shape.lineTo(L / 2 - kickLen, 0);
  shape.lineTo(L / 2, kickHeight);
  shape.lineTo(L / 2, kickHeight - thickness);
  shape.lineTo(L / 2 - kickLen, -thickness);
  shape.lineTo(-L / 2 + kickLen, -thickness);
  shape.lineTo(-L / 2, kickHeight - thickness);
  shape.lineTo(-L / 2, kickHeight);

  const deckGeom = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
  deckGeom.translate(0, 0, -W / 2);
  deckGeom.rotateY(Math.PI / 2); // la longueur (nez/queue) suit l'axe Z, comme avant
  const deck = toonMesh(deckGeom, COLORS.neonRed);
  boardFlip.add(deck);

  // Petite bande blanche façon grip/déco sur le dessus
  const stripe = toonMesh(new THREE.BoxGeometry(0.09, 0.012, L - kickLen * 1.5), COLORS.metalLight);
  stripe.position.y = 0.006;
  boardFlip.add(stripe);

  // Trucks + roues, près de chaque partie plate (avant que le kick ne commence)
  const truckZ = L / 2 - kickLen - 0.08;
  [truckZ, -truckZ].forEach((z) => {
    const truck = toonMesh(new THREE.BoxGeometry(0.42, 0.05, 0.09), COLORS.metalLight);
    truck.position.set(0, -thickness - 0.03, z);
    boardFlip.add(truck);

    [-0.19, 0.19].forEach((x) => {
      const wheel = toonMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), COLORS.neonYellow);
      wheel.rotation.z = Math.PI / 2; // roue "sur le côté", axe le long de X
      wheel.position.set(x, -thickness - 0.09, z);
      boardFlip.add(wheel);
    });
  });

  return outer;
}

// Construit une chaîne à 2 segments (bras ou jambe) : un pivot "root" à
// l'articulation supérieure (épaule/hanche) contenant le segment supérieur,
// puis un pivot "joint" à l'articulation inférieure (coude/genou) contenant
// le segment inférieur + une extrémité (main/pied). root et joint tournent
// indépendamment dans animatePlayer() pour un mouvement à deux charnières.
function createLimbChain({ upperLen, upperRadius, lowerLen, lowerRadius, limbColor, capColor, capShape }) {
  const root = new THREE.Group();
  const upperMesh = toonMesh(
    new THREE.CylinderGeometry(upperRadius, upperRadius * 0.85, upperLen, 8),
    limbColor
  );
  upperMesh.position.y = -upperLen / 2;
  root.add(upperMesh);

  const joint = new THREE.Group();
  joint.position.y = -upperLen;
  root.add(joint);

  const lowerMesh = toonMesh(
    new THREE.CylinderGeometry(lowerRadius, lowerRadius * 0.8, lowerLen, 8),
    limbColor
  );
  lowerMesh.position.y = -lowerLen / 2;
  joint.add(lowerMesh);

  const cap =
    capShape === "shoe"
      ? toonMesh(new THREE.BoxGeometry(0.16, 0.09, 0.26), capColor)
      : toonMesh(new THREE.SphereGeometry(lowerRadius * 1.2, 8, 8), capColor);
  cap.position.y = -lowerLen - (capShape === "shoe" ? 0.02 : 0);
  if (capShape === "shoe") cap.position.z = 0.05;
  joint.add(cap);

  return { root, joint };
}

// Anime le squelette selon l'état courant : roule / en l'air / grind.
// Chaque membre a 2 cibles : la rotation à l'épaule/hanche (root) et celle
// au coude/genou (joint), amorties (lerp) pour des transitions fluides.
function animatePlayer(dt) {
  let hipL = 0, hipR = 0, kneeL = 0.15, kneeR = 0.15;
  let armSwingL = 0, armSwingR = 0, elbowL = 0.35, elbowR = 0.35;
  let armOutL = 0.2, armOutR = -0.2; // écartement latéral des bras (épaule)

  if (state.grinding) {
    // Position accroupie, bras tendus à l'horizontale pour l'équilibre.
    hipL = hipR = 0.5;
    kneeL = kneeR = 0.95;
    armOutL = 1.35;
    armOutR = -1.35;
    elbowL = elbowR = 0.1;
  } else if (!state.grounded) {
    // En l'air : jambes repliées (genoux remontés), bras levés/écartés.
    hipL = hipR = 0.85;
    kneeL = kneeR = 1.35;
    armOutL = 1.05;
    armOutR = -1.05;
    elbowL = elbowR = 0.5;
  } else {
    // Au sol, en train de rouler : jambes qui pompent alternativement,
    // genoux qui plient davantage quand la hanche recule.
    anim.rollPhase += Math.abs(state.speed) * dt * 2.2;
    const amp = Math.min(Math.abs(state.speed) / MAX_SPEED, 1);
    const swing = Math.sin(anim.rollPhase) * amp * 0.3;
    hipL = 0.1 + swing;
    hipR = 0.1 - swing;
    kneeL = 0.25 + Math.max(-swing, 0) * 1.4;
    kneeR = 0.25 + Math.max(swing, 0) * 1.4;
    armSwingL = -swing * 0.8;
    armSwingR = swing * 0.8;
  }

  // Amortissement : on interpole doucement vers la cible pour éviter les
  // à-coups quand on change d'état (ollie, atterrissage, grind...).
  const damp = 1 - Math.pow(0.001, dt);
  const lerp = (key, target) => (anim[key] += (target - anim[key]) * damp);

  lerp("hipL", hipL);
  lerp("hipR", hipR);
  lerp("kneeL", kneeL);
  lerp("kneeR", kneeR);
  lerp("armSwingL", armSwingL);
  lerp("armSwingR", armSwingR);
  lerp("armOutL", armOutL);
  lerp("armOutR", armOutR);
  lerp("elbowL", elbowL);
  lerp("elbowR", elbowR);

  leftLeg.root.rotation.x = anim.hipL;
  rightLeg.root.rotation.x = anim.hipR;
  leftLeg.joint.rotation.x = anim.kneeL;
  rightLeg.joint.rotation.x = anim.kneeR;

  leftArm.root.rotation.x = anim.armSwingL;
  rightArm.root.rotation.x = anim.armSwingR;
  leftArm.root.rotation.z = anim.armOutL;
  rightArm.root.rotation.z = anim.armOutR;
  leftArm.joint.rotation.x = anim.elbowL;
  rightArm.joint.rotation.x = anim.elbowR;
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
  animatePlayer(dt);
  updateTrick(dt);
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

  for (const id in TRICKS) {
    const trick = TRICKS[id];
    if (!keys[trick.key]) continue;
    keys[trick.key] = false;
    if (state.grounded || state.grinding || state.activeTricks[id]) continue;
    state.activeTricks[id] = { time: 0, duration: trick.duration };
    state.airTricks.push({ name: trick.name, value: trick.value });
    state.comboCount += 1;
    state.comboTimer = 3;
    showBanner(trick.name);
  }
}

// Anime chaque figure aérienne en cours sur son propre axe (planche ou
// corps), pour qu'on puisse en enchaîner plusieurs pendant un même saut.
// Les axes sans figure active reviennent doucement à zéro.
function updateTrick(dt) {
  if (!state.activeTricks.kickflip) boardFlip.rotation.z *= Math.max(0, 1 - 10 * dt);
  if (!state.activeTricks.shoveit) boardFlip.rotation.y *= Math.max(0, 1 - 10 * dt);
  if (!state.activeTricks.spin360) state.airSpin *= Math.max(0, 1 - 10 * dt);

  for (const id in state.activeTricks) {
    const active = state.activeTricks[id];
    active.time += dt;
    const t = Math.min(active.time / active.duration, 1);
    const angle = t * Math.PI * 2;

    if (id === "kickflip") boardFlip.rotation.z = angle;
    else if (id === "shoveit") boardFlip.rotation.y = angle;
    else if (id === "spin360") state.airSpin = angle;

    if (t >= 1) {
      delete state.activeTricks[id];
      if (id === "kickflip") boardFlip.rotation.z = 0;
      else if (id === "shoveit") boardFlip.rotation.y = 0;
      else if (id === "spin360") state.airSpin = 0;
    }
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

  // Bloque le joueur contre les obstacles compacts (poteaux, pieds de rail...)
  resolveHorizontalCollisions();

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
      if (wasAirborne && state.airTricks.length > 0) {
        // Combo façon THPS : les figures ne rapportent leurs points qu'à un
        // atterrissage propre, multipliés par le nombre de figures enchaînées.
        const base = state.airTricks.reduce((sum, t) => sum + t.value, 0);
        const multiplier = state.airTricks.length;
        const total = base * multiplier;
        const comboString = state.airTricks.map((t) => t.name).join(" + ");
        bankCombo(total, `${comboString} = ${Math.round(total)}`);
        state.airTricks = [];
      } else if (wasAirborne && state.comboCount > 0) {
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

// Encaisse un combo de figures aériennes : ajoute les points d'un coup et
// referme le combo (contrairement à addScore, qui l'alimente).
function bankCombo(amount, banner) {
  state.score += amount;
  state.comboCount = 0;
  state.comboTimer = 0;
  showBanner(banner);
}

function updatePlayerTransform() {
  player.position.copy(state.pos);
  player.rotation.y = state.yaw + state.airSpin;
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
  state.activeTricks = {};
  state.airTricks = [];
  state.airSpin = 0;
  boardFlip.rotation.set(0, 0, 0);
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
