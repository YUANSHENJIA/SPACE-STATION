import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createEarth } from './earth.js';
import { createShip } from './ship.js';
import { createSky } from './sky.js';
import { createStation } from './station.js';
import { createFleet } from './satellites.js';
import { createLifter } from './lifter.js';
import { createTelemetry, KM_PER_UNIT } from './telemetry.js';

/* ------------------------------------------------------------- constants */

const EARTH_RADIUS = 1550;
// 太阳方向：侧前方偏上，太阳翼正对受光，站体有明确的明暗面
const SUN_DIR = new THREE.Vector3(0.42, 0.3, 0.86).normalize();
// 地球反照光的固定偏移（跟着编队走）
const EARTH_SHINE_OFF = new THREE.Vector3(-20, -160, 40);

/* ---------------------------------------------------------------- scene */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});

/**
 * 像素比封顶：4K / Retina 屏上 dpr=2 会让画布涨到 800 万像素，
 * 叠加 bloom 的多级降采样后片元开销是 1080p 的数倍。
 * 画布超过 500 万像素就把 dpr 压到 1.5 —— 仍是超采样，肉眼几乎无差别。
 */
function pickPixelRatio() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = window.innerWidth * window.innerHeight * dpr * dpr;
  return Math.min(dpr, px > 5.0e6 ? 1.5 : 2);
}
renderer.setPixelRatio(pickPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.6, 200000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.85;
controls.panSpeed = 0.5;
controls.minDistance = 9;
controls.maxDistance = 9000; // 拉到最远能看见整个地球
controls.maxPolarAngle = Math.PI * 0.94;
controls.minPolarAngle = Math.PI * 0.06;

/* --------------------------------------------------------------- lights */

const sunLight = new THREE.DirectionalLight(0xfff4e6, 3.0);
sunLight.position.copy(SUN_DIR).multiplyScalar(320);
sunLight.target.position.set(20, 0, 0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 40;
sunLight.shadow.camera.far = 900;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 86;
sunLight.shadow.camera.bottom = -86;
sunLight.shadow.bias = -0.0008;
sunLight.shadow.normalBias = 0.05;
sunLight.shadow.camera.updateProjectionMatrix();
scene.add(sunLight, sunLight.target);

// blue-green bounce coming up off the Earth
const earthShine = new THREE.DirectionalLight(0x4a8fd6, 1.15);
earthShine.position.set(-20, -160, 40);
earthShine.target.position.set(20, 0, 0);
scene.add(earthShine, earthShine.target);

// faint cool rim from the far side
const rim = new THREE.DirectionalLight(0x9dc0ff, 1.45);
rim.position.set(96, 34, 118);
scene.add(rim);

// 环境光：背光面全靠它垫底。原来的 0.85 几乎等于没开，暗面整片糊成一团黑，
// 舱段轮廓和太阳翼的翻边全丢了；提到 2.1 后只是把暗部抬起来，受光面仍由阳光主导。
const ambient = new THREE.AmbientLight(0x23384f, 2.1);
scene.add(ambient);

/**
 * 观察方向补光：用户转到太阳背面时，朝向镜头的那半边站体只剩轮廓，
 * 舱段细节全黑。这盏灯始终架在相机上，强度只有主光的 1/4，
 * 只把最暗的一档抬起来，明暗关系仍然由太阳决定。
 */
const camFill = new THREE.DirectionalLight(0xc2daf5, 1.2);
scene.add(camFill, camFill.target);

/* ------------------------------------------------------------- contents */

const manager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(manager);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

/**
 * 画质分级：手机 / 低配设备退一档
 * - 地表贴图 8K（4.3 MB）→ 4K（0.9 MB），显存与带宽都只占 1/5
 * - 球面分段 288×144 → 160×80，顶点数约 1/3
 * - 泛光强度减半：小屏上过强会把细节糊掉
 * 判断依据宁可保守——体感卡顿比少一层细节更伤。
 */
const LOW_TIER =
  window.matchMedia('(max-width: 860px)').matches ||
  (navigator.hardwareConcurrency ?? 8) <= 4 ||
  (navigator.deviceMemory ?? 8) <= 4;
const EARTH_SEG = LOW_TIER ? { w: 160, h: 80 } : { w: 288, h: 144 };

function loadTex(path) {
  const t = loader.load(path);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(16, MAX_ANISO);
  // 经度 0/1 接缝处按环绕采样，贴图边缘才不会留一条亮线
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const dayMap = loadTex(LOW_TIER ? './public/textures/earth_day_4k.jpg' : './public/textures/earth_day.jpg');
const nightMap = loadTex('./public/textures/earth_night.jpg');
const cloudMap = loadTex('./public/textures/earth_clouds.jpg');
const moonTexture = loadTex('./public/textures/moon.jpg');

const EARTH_POS = new THREE.Vector3(-40, -(EARTH_RADIUS + 152), -60);
const ORBIT_R = EARTH_RADIUS + 152;

const earth = createEarth({
  radius: EARTH_RADIUS,
  sunDir: SUN_DIR,
  dayMap,
  nightMap,
  cloudMap,
  segW: EARTH_SEG.w,
  segH: EARTH_SEG.h,
});
earth.group.position.copy(EARTH_POS);
scene.add(earth.group);

/* ---- orbital rig: big loops that carry the convoys right around Earth --- */
const upHat = EARTH_POS.clone().negate().normalize();
const orbitPivot = new THREE.Group();
orbitPivot.position.copy(EARTH_POS);
orbitPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upHat);
scene.add(orbitPivot);

const AXIS_Y = new THREE.Vector3(0, 1, 0);

/**
 * A horizontal track: a faint ring of `radius` lying in the plane
 * perpendicular to the local vertical, so it reads as parallel to the ground.
 * The convoy rides it and is tipped so that its +Y stays radial (Earth below).
 */
function makeTrack({ radius, tilt = 0, az = 0 }) {
  const H = Math.sqrt(Math.max(ORBIT_R * ORBIT_R - radius * radius, 1));
  const tiltG = new THREE.Group();
  tiltG.rotation.z = tilt;
  orbitPivot.add(tiltG);
  const azG = new THREE.Group();
  azG.rotation.y = az;
  tiltG.add(azG);
  const center = new THREE.Group();
  center.position.y = H;
  azG.add(center);
  const spinner = new THREE.Group();
  center.add(spinner);

  const convoy = new THREE.Group();
  convoy.position.set(0, 0, radius);
  convoy.rotation.x = Math.asin(radius / ORBIT_R); // nose level, deck towards Earth
  spinner.add(convoy);

  const pts = [];
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x86bcff, transparent: true, opacity: 0.44, depthWrite: false })
  );
  spinner.add(line);

  return { convoy, spinner, radius, H, line };
}

const laneMain = makeTrack({ radius: 1500 });
const convoy = laneMain.convoy;
const heroShip = createShip();
heroShip.setIdle(false); // the station owns its transform (dock / undock)
convoy.add(heroShip.group);

const station = createStation({ shipDock: heroShip });
convoy.add(station.group);

const fleet = createFleet({
  count: 20, // 默认拉满：20 颗
  style: 'starlink',
  radius: laneMain.radius,
  orbitR: ORBIT_R,
  gap: 80 / KM_PER_UNIT, // 默认拉满：80 km 间距
});
convoy.add(fleet.group);

const lifter = createLifter({
  convoy,
  earthPos: EARTH_POS,
  earthRadius: EARTH_RADIUS,
  port: station.launchPort,
});
convoy.add(lifter.group);
lifter.resize(window.innerHeight * renderer.getPixelRatio());

/* ---- 多轨道：各自独立的倾角 / 交点 / 高度，真正互相交错 ------------------ */

/**
 * 一条真实轨道：以地心为圆心的圆，法线由 (inc, node) 决定。
 * 这样几条轨道才会真的穿过彼此——而不是像原来那样全都躺在
 * 同一层平行平面上（看起来"集中在上方"）。
 */
function makeOrbit({ alt, inc = 0, node = 0, color = 0x74a9ff, opacity = 0.4 }) {
  const r = EARTH_RADIUS + alt;

  const root = new THREE.Group();
  root.position.copy(EARTH_POS);
  scene.add(root);

  const nodeG = new THREE.Group();
  nodeG.rotation.y = node;
  root.add(nodeG);

  const incG = new THREE.Group();
  incG.rotation.x = inc;
  nodeG.add(incG);

  const spinner = new THREE.Group();
  incG.add(spinner);

  // 环在 XZ 平面；载机坐标系要让 +Y 指向天顶、+X 指向行进方向
  const carrier = new THREE.Group();
  carrier.position.set(0, 0, r);
  carrier.rotation.x = Math.PI / 2;
  spinner.add(carrier);

  const pts = [];
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  spinner.add(line);

  return { root, nodeG, incG, spinner, carrier, line, r };
}

// alt 为离地高度（场景单位），inc 为轨道倾角：含 0° 与 90°，必然互相垂直交叉
const LANE_SPECS = [
  { alt: 300, inc: Math.PI / 2, node: 0.0, count: 4, rate: 0.02, color: 0x8fd0ff },
  { alt: 470, inc: 0.86, node: 1.15, count: 4, rate: -0.017, color: 0x74a9ff },
  { alt: 660, inc: 1.94, node: 2.35, count: 3, rate: 0.014, color: 0x6f9dff },
  { alt: 880, inc: 0.2, node: 0.62, count: 3, rate: -0.012, color: 0x9db8ff },
  { alt: 1140, inc: 2.28, node: 3.7, count: 3, rate: 0.011, color: 0x6392f0 },
  { alt: 1420, inc: 0.45, node: 5.1, count: 3, rate: -0.009, color: 0x86c4ff },
  { alt: 1740, inc: 1.52, node: 4.3, count: 3, rate: 0.008, color: 0x5f8ae8 },
];

const lanes = LANE_SPECS.map((spec) => ({
  ...spec,
  lane: makeOrbit(spec),
  fleet: null,
  on: false,
}));

const MAX_ORBITS = 1 + lanes.length;

/** 间距读数的折算半径：附加轨道高度 300~1740，取中位 1020。
 *  用固定的参考半径，改轨道条数时读数才不会跟着跳。 */
const LANE_REF_R = EARTH_RADIUS + 1020;
const LANE_ARC_KM = 2 * Math.PI * LANE_REF_R * KM_PER_UNIT;

/** 每条附加轨道上常驻一条星链，从队首沿轨道按间距排开。
 *  数量与间距在这里单独调，和主编队完全分开；默认 20 颗 × 3,320 km
 *  恰好绕满一整圈。间距可以压到 0 —— 星链全部叠在队首一点。 */
const laneLinks = { count: 20, gapKm: Math.round(LANE_ARC_KM / 20) };

function ensureFleet(l) {
  if (l.fleet) return l.fleet;
  const f = createFleet({
    count: laneLinks.count,
    gap: laneLinks.gapKm / KM_PER_UNIT, // ring 模式：沿弧按此间距排开
    style: fleet.style(),
    radius: l.lane.r,
    orbitR: l.lane.r, // 大圆轨道：k=1，编队沿真实圆弧排布
    ring: true,
    castShadow: false, // 7 条轨道 × 20 颗，阴影 pass 的开销不值得
  });
  l.lane.carrier.add(f.group);
  l.fleet = f;
  return f;
}

/** 主编队换造型时，轨道上的星链跟着换；数量/间距只作用于主编队 */
function syncLaneFleets() {
  const s = fleet.style();
  for (const l of lanes) {
    if (!l.fleet) continue;
    l.fleet.setStyle(s);
  }
}

/* 背景星系在下面、开场机位摆好之后再建 —— 盘面要正对默认镜头 */

/* ------------------------------------------------------------ post fx */

const composer = new EffectComposer(renderer);
// 跟随渲染器的像素比（已由 pickPixelRatio 封顶），否则 bloom 会在更高的分辨率上多做一遍
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);

composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  // 低配档减半：小屏上强泛光会把舱段细节糊成一片
  LOW_TIER ? 0.4 : 0.58,
  0.72,
  0.86
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ------------------------------------------------------- camera rigging */

// all view points are expressed in the convoy frame (queue axis = +X)
const VIEWS = {
  // 默认取景：编队默认拉满 20 颗 × 80 km，跨度一路拉到 520 单位，
  // 原来的机位只能框住站体，队列整条都在画外。机位后撤并把视线往 +X
  // 推过去，站体留在左三分之一、编队向纵深排开。
  free: { pos: new THREE.Vector3(196, 126, 262), target: new THREE.Vector3(108, -8, 0) },
  station: { pos: new THREE.Vector3(-96, 34, 104), target: new THREE.Vector3(8, 0, 0) },
  // 太阳翼已改为与地表平行，从原来的低角度看过去只剩一条边线，
  // 机位抬高到约 30° 俯角，翼面才重新露出来
  fleet: { pos: new THREE.Vector3(104, 78, 82), target: new THREE.Vector3(110, 0, 0) },
  sat: { pos: new THREE.Vector3(120, 6, 14), target: new THREE.Vector3(110, 0, 0) },
  ship: { pos: new THREE.Vector3(-79, 10, 34), target: new THREE.Vector3(-66, 0, 0) },
  dock: { pos: new THREE.Vector3(32, -26, 42), target: new THREE.Vector3(23, -14, 0) },
};

function toWorld(v) {
  return convoy.localToWorld(v.clone());
}

/**
 * 竖屏取景：水平视野 = 2·atan(tan(vfov/2)·aspect)，机位距离正比于 1/aspect。
 * 以宽高比 1.4 为基准（桌面上手调好的机位），低于基准就等比例拉远，
 * 否则 500×900 这种竖屏只剩约 24° 水平视野，站体会左右出画。
 * 同时把画面整体上移一点，让主体落在手机上下两条面板之间的可视带里。
 */
function frameView(v) {
  const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
  const k = Math.min(2.8, Math.max(1, 1.4 / aspect));
  const pos = v.pos.clone();
  if (k > 1.001) pos.copy(v.target).addScaledVector(v.pos.clone().sub(v.target), k);
  const posW = toWorld(pos);
  const targetW = toWorld(v.target);
  if (k > 1.02) {
    const lift = posW.distanceTo(targetW) * 0.13;
    posW.y += lift;
    targetW.y += lift;
  }
  return { pos: posW, target: targetW };
}

let camGoal = null;
let transitionT = 1;

function flyTo(view) {
  const v = VIEWS[view];
  if (!v) return;
  camGoal = frameView(v);
  transitionT = 0;
}

controls.addEventListener('start', () => {
  camGoal = null;
});

/**
 * 空格 + 左键平移：OrbitControls 只在 pointerdown 那一刻读 mouseButtons，
 * 所以按住空格再按下左键，这一拖就会被当成平移；松开空格恢复旋转。
 */
let spaceDown = false;

function syncSpacePan() {
  controls.mouseButtons.LEFT = spaceDown ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  document.body.classList.toggle('space-pan', spaceDown);
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  const t = e.target;
  // 焦点在按钮 / 滑块上时，空格是「激活」，交给原生行为，别抢成平移
  if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.isContentEditable)) return;
  e.preventDefault(); // 否则空格会让整页滚动
  spaceDown = true;
  syncSpacePan();
});

window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space') return;
  spaceDown = false;
  syncSpacePan();
});

// 切走窗口时可能收不到 keyup，兜底复位，免得回来还以为在平移模式
window.addEventListener('blur', () => {
  if (!spaceDown) return;
  spaceDown = false;
  syncSpacePan();
});

syncSpacePan();

orbitPivot.updateMatrixWorld(true);
const opening = frameView(VIEWS.free);
camera.position.copy(opening.pos);
controls.target.copy(opening.target);
controls.update();

/* ---- 背景星系：按开场机位的视线方向摆放，默认视角就能看到整个盘面 ---- */
const sky = createSky({
  sunDir: SUN_DIR,
  moonTexture,
  galaxyView: {
    origin: camera.position.clone(),
    dir: controls.target.clone().sub(camera.position).normalize(),
  },
});
scene.add(sky.group);

/* ---------------------------------------------------------- interaction */

const state = {
  timeScale: 1,
  paused: false,
  speedBefore: 1,
  view: 'free',
  fixed: false,
  style: 'starlink',
  moveDir: 0, // +1 前进 / 0 悬停 / -1 后退
  moveRate: 0.0075, // rad/s along the orbit
};

const sim = { t: 0, drift: 0, travel: 0 };

/** 贴身机位集合：编队 / 卫星 / 飞船。这三个视角每帧跟随对焦目标（任何状态），
 *  交互始终可用。setMove 在初始化阶段就会用到，所以提前声明。 */
const FOLLOW_VIEWS = new Set(['fleet', 'sat', 'ship']);

// 左侧轨道遥测面板：读数 + 编队数量/间距控制
const telemetry = createTelemetry({ fleet, onLayout: syncLaneFleets });

/* ---- speed ------------------------------------------------------------ */
const speedVal = document.getElementById('speedVal');
const speedRatio = document.getElementById('speedRatio');
const btnPause = document.getElementById('btn-pause');

// 名义轨道速度（400 km 圆轨道）：面板读数以它为单位，时间倍率只是背后的实现
const NOMINAL_V = 7.672;
// 时间档位：编队最快可以跑到 20×，一圈地球只要四十来秒
const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 20];

/** 速度读数：暂停时读数为 0，否则按当前时间倍率折算成等效轨道速度 */
function renderSpeed() {
  const v = state.paused ? 0 : NOMINAL_V * state.timeScale;
  speedVal.textContent = v.toFixed(3);
  speedVal.classList.toggle('hot', !state.paused && state.timeScale !== 1);
  // 暂停时副值直接写「暂停」，避免同时出现 0.000 和 1.0× 两个矛盾读数
  speedRatio.textContent = state.paused ? '暂停' : `${parseFloat(state.timeScale.toFixed(2))}×`;
}

function setSpeed(v) {
  state.timeScale = THREE.MathUtils.clamp(v, SPEEDS[0], SPEEDS[SPEEDS.length - 1]);
  state.paused = false;
  btnPause.classList.remove('on');
  btnPause.textContent = '暂停';
  renderSpeed();
}

document.getElementById('speedDown').addEventListener('click', () => {
  const below = SPEEDS.filter((s) => s < state.timeScale - 1e-6);
  setSpeed(below.length ? below[below.length - 1] : SPEEDS[0]);
});
document.getElementById('speedUp').addEventListener('click', () => {
  const above = SPEEDS.filter((s) => s > state.timeScale + 1e-6);
  setSpeed(above.length ? above[0] : SPEEDS[SPEEDS.length - 1]);
});
btnPause.addEventListener('click', () => {
  if (state.paused) {
    state.paused = false;
    btnPause.textContent = '暂停';
    btnPause.classList.remove('on');
  } else {
    state.paused = true;
    btnPause.textContent = '继续';
    btnPause.classList.add('on');
  }
  renderSpeed();
});

/* ---- solar deploy ----------------------------------------------------- */
const deployBar = document.getElementById('deployBar');
const deployLabel = document.getElementById('deployLabel');

function setDeploy(v) {
  station.setDeploy(v);
}
document.getElementById('btn-deploy').addEventListener('click', () => setDeploy(1));
document.getElementById('btn-retract').addEventListener('click', () => setDeploy(0));

/* ---- 太阳翼自动对日 ---------------------------------------------------- */
const sunBtn = document.getElementById('btn-suntrack');
const sunVal = document.getElementById('sunVal');
let sunTrack = false;
function applySunTrack(on) {
  sunTrack = on;
  station.setSunTrack(on ? 1 : 0);
  sunBtn.classList.toggle('on', on);
  sunVal.textContent = on ? '自动跟踪' : '固定角度';
  sunVal.classList.toggle('ok', on);
}
sunBtn.addEventListener('click', () => {
  applySunTrack(!sunTrack);
  sunBtn.blur();
});
applySunTrack(false);

/* ---- EVA -------------------------------------------------------------- */
const evaBtns = [document.getElementById('btn-eva-out'), document.getElementById('btn-eva-in')];
function setEVA(v) {
  station.setEVA(v);
  evaBtns[0].classList.toggle('on', v === 1);
  evaBtns[1].classList.toggle('on', v === 0);
}
evaBtns[0].addEventListener('click', () => setEVA(1));
evaBtns[1].addEventListener('click', () => setEVA(0));

/* ---- docking ---------------------------------------------------------- */
const dockBtns = [document.getElementById('btn-dock'), document.getElementById('btn-undock')];
function setDock(v) {
  station.setDocked(v);
  dockBtns[0].classList.toggle('on', v === 1);
  dockBtns[1].classList.toggle('on', v === 0);
}
dockBtns[0].addEventListener('click', () => setDock(1));
dockBtns[1].addEventListener('click', () => setDock(0));

/* ---- convoy travel ---------------------------------------------------- */
const moveChips = [...document.querySelectorAll('[data-move]')];
const moveVal = document.getElementById('moveVal');
const MOVE_TEXT = { 1: '前进中', 0: '悬停保持', '-1': '后退中' };

function setMove(dir) {
  state.moveDir = dir;
  moveChips.forEach((c) => c.classList.toggle('on', Number(c.dataset.move) === dir));
  moveVal.textContent = MOVE_TEXT[String(dir)];
  moveVal.classList.toggle('hot', dir !== 0);
}
moveChips.forEach((chip) => {
  chip.addEventListener('click', () => setMove(Number(chip.dataset.move)));
});
setMove(0);

/* ---- attitude --------------------------------------------------------- */
const ATTITUDE = {
  up: { axis: 'z', sign: 1, rcs: [4] },
  down: { axis: 'z', sign: -1, rcs: [5] },
  left: { axis: 'x', sign: -1, rcs: [0, 1] },
  right: { axis: 'x', sign: 1, rcs: [2, 3] },
  fwd: { axis: 'y', sign: -1, rcs: [2] },
  back: { axis: 'y', sign: 1, rcs: [0] },
};

document.querySelectorAll('[data-att]').forEach((btn) => {
  const key = btn.dataset.att;
  const cfg = ATTITUDE[key];
  if (!cfg) return;
  const press = () => {
    station.state.attitudeVel[cfg.axis] += cfg.sign * 6;
    cfg.rcs.forEach((i) => station.fireRCS(i, 1));
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 180);
  };
  btn.addEventListener('click', press);
});

const attResetBtn = document.getElementById('btn-att-reset');
attResetBtn.addEventListener('click', () => {
  station.resetAttitude();
  [0, 2, 4, 5].forEach((i) => station.fireRCS(i, 1));
  attResetBtn.classList.add('flash');
  setTimeout(() => attResetBtn.classList.remove('flash'), 220);
});

/* ---- sun rig ----------------------------------------------------------- */
const SUN_BASE = 3.0;
const SUN_ELEV = Math.asin(THREE.MathUtils.clamp(SUN_DIR.clone().normalize().y, -1, 1));
const sunPow = document.getElementById('sunPow');
const sunAz = document.getElementById('sunAz');
const sunPowVal = document.getElementById('sunPowVal');
const sunAzVal = document.getElementById('sunAzVal');

sunAz.value = String(Math.round((THREE.MathUtils.radToDeg(Math.atan2(SUN_DIR.x, SUN_DIR.z)) + 360) % 360));

function applySun() {
  const p = Number(sunPow.value);
  const az = THREE.MathUtils.degToRad(Number(sunAz.value));
  const c = Math.cos(SUN_ELEV);
  SUN_DIR.set(Math.sin(az) * c, Math.sin(SUN_ELEV), Math.cos(az) * c).normalize();
  sky.setSunDir(SUN_DIR);
  sunLight.intensity = SUN_BASE * (p / 100);
  earthShine.intensity = 1.15 * (0.5 + 0.5 * (p / 100));
  sunPowVal.textContent = `${p}%`;
  sunAzVal.textContent = `${Math.round(Number(sunAz.value))}°`;
  sunPowVal.classList.toggle('hot', p !== 100);
}
sunPow.addEventListener('input', applySun);
sunAz.addEventListener('input', applySun);
applySun();

/* ---- 地影：站体转到地球背面时，太阳光要被地球挡住 --------------------- */
const eclVec = new THREE.Vector3();
let eclipse = 1;

function updateEclipse(pos) {
  eclVec.copy(pos).sub(EARTH_POS);
  const along = eclVec.dot(SUN_DIR); // > 0 在向阳侧
  const side = Math.sqrt(Math.max(eclVec.lengthSq() - along * along, 0));
  const farSide = THREE.MathUtils.smoothstep(-along, 0, 70); // 转过晨昏线
  const outside = THREE.MathUtils.smoothstep(side, EARTH_RADIUS * 0.995, EARTH_RADIUS * 1.05);
  eclipse = 1 - farSide * (1 - outside) * 0.9;
  return eclipse;
}

/* ---- 光照区段：空间站此刻在地球的向光面还是地影里 --------------------- */
const dayState = document.getElementById('dayState');
const dayMargin = document.getElementById('dayMargin');
const dayCraft = document.getElementById('dayCraft');
const dayChain = document.getElementById('dayChain');
const DAY_CX = 128;
const DAY_CY = 75;
const DAY_R = 68; // 与 SVG 里的轨道圈半径一致

const _relToEarth = new THREE.Vector3();
const _sunSide = new THREE.Vector3();
const SUN_UP = new THREE.Vector3(0, 1, 0);

/** 编队小点：按数量增减 DOM，位置每帧按「站点角度往后方推」算 */
const dayDots = [];
const SVG_NS = 'http://www.w3.org/2000/svg';

function ensureDayDots(n) {
  while (dayDots.length < n) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', '2.1');
    dot.setAttribute('fill', '#8ee9ff');
    dayChain.appendChild(dot);
    dayDots.push(dot);
  }
  while (dayDots.length > n) {
    dayChain.removeChild(dayDots.pop());
  }
}

/**
 * 图示用的是「日地连线」所在的平面：e1 指向太阳、e2 与之垂直且水平。
 * 投影结果归一到单位圆，空间站点就始终落在轨道圈上 —— 否则站点高度差
 * 会让它跑到地球内部，看起来像是钻进了地里。
 */
function updateDayNight(pos) {
  _relToEarth.copy(pos).sub(EARTH_POS).normalize();
  const cosA = _relToEarth.dot(SUN_DIR);

  _sunSide.crossVectors(SUN_DIR, SUN_UP).normalize();
  let x = cosA;
  let y = _relToEarth.dot(_sunSide);
  const len = Math.hypot(x, y) || 1e-6;
  x /= len;
  y /= len;

  dayCraft.setAttribute(
    'transform',
    `translate(${(DAY_CX + x * DAY_R).toFixed(2)} ${(DAY_CY - y * DAY_R).toFixed(2)})`
  );

  /* 编队小点拖在站点后方；跨度按真实 km 折算，但夸张到看得见为止 */
  const n = fleet.count();
  const tail = Math.max(0, n - 1);
  ensureDayDots(tail);
  if (tail > 0) {
    const spanKm = tail * fleet.gap() * KM_PER_UNIT;
    const arc = THREE.MathUtils.clamp((spanKm / 400) * 1.15, 0, 2.3);
    const step = arc / tail;
    const head = Math.atan2(y, x);
    for (let i = 0; i < tail; i++) {
      const a = head - step * (i + 1);
      const dot = dayDots[i];
      dot.setAttribute('cx', (DAY_CX + Math.cos(a) * DAY_R).toFixed(2));
      dot.setAttribute('cy', (DAY_CY - Math.sin(a) * DAY_R).toFixed(2));
      // 越靠后越淡，读起来才像一队跟跑的卫星而不是一串珠子
      dot.setAttribute('opacity', (0.66 - 0.34 * (i / tail)).toFixed(2));
    }
  }

  const night = cosA < -0.02;
  dayState.textContent = cosA > 0.02 ? '光面' : night ? '暗面' : '晨昏线';
  dayState.classList.toggle('night', night);

  // 与晨昏线的角距：正对太阳 90°，正好压在分界线上 0°
  const deg = 90 - (Math.acos(Math.min(1, Math.abs(cosA))) * 180) / Math.PI;
  dayMargin.textContent = `${deg.toFixed(0)}°`;
  dayMargin.classList.toggle('ok', !night);
}

/* ---- cargo launch ------------------------------------------------------ */
const launchBtn = document.getElementById('btn-launch');
launchBtn.addEventListener('click', () => {
  if (lifter.info.mode === 'ascent') return;
  lifter.launch();
  launchBtn.classList.add('on');
  launchBtn.blur();
  // 发射不切视角：保持当前机位，飞船自己飞完整个爬升过程
});

/* ---- styles ----------------------------------------------------------- */
const styleChips = [...document.querySelectorAll('[data-style]')];
styleChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const key = chip.dataset.style;
    fleet.setStyle(key);
    syncLaneFleets(); // 轨道上的星链跟着换同款造型
    state.style = key;
    styleChips.forEach((c) => c.classList.toggle('on', c === chip));
  });
});

/* ---- views ------------------------------------------------------------ */

/**
 * 贴身机位跟随：编队 / 卫星 / 飞船这三个视角里，对焦目标在任何状态下
 * （悬停、前进、后退）都保持停在画面里的原位 —— 相机与 target 每帧
 * 平移「目标本帧的位移」，用户此前的旋转 / 滚轮 / 平移全部保留，
 * 交互也始终可用（不再禁用 OrbitControls）。
 */
const followPrev = new THREE.Vector3();
const followCur = new THREE.Vector3();
const followDelta = new THREE.Vector3();
let followOn = false;

/** 贴身机位的对焦目标（世界坐标）：编队取第 5 颗、卫星取第 4 颗、飞船取本体 */
function followAnchor(out) {
  if (state.view === 'ship') {
    heroShip.group.getWorldPosition(out);
  } else {
    const idx = state.view === 'sat' ? 3 : 4;
    fleet.slots[Math.min(idx, fleet.slots.length - 1)].getWorldPosition(out);
  }
  return out;
}

const viewChips = [...document.querySelectorAll('[data-view]')];
viewChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    state.view = chip.dataset.view;
    if (state.view === 'sat') {
      const s = fleet.slots[Math.min(3, fleet.slots.length - 1)].position;
      // 卫星本体约 12 单位长、太阳翼展开接近 30，机位要退到 48 左右才装得下
      VIEWS.sat.pos.set(s.x + 26, s.y + 15, s.z + 38);
      VIEWS.sat.target.set(s.x, s.y, s.z);
    }
    if (state.view === 'fleet') {
      const s = fleet.slots[Math.min(4, fleet.slots.length - 1)].position;
      // 太阳翼改为与地表平行后，原来 20° 的低机会把它们压成一条边线，
      // 抬到 40° 左右俯角，翼面才重新露出来
      VIEWS.fleet.pos.set(s.x + 14, s.y + 62, s.z + 72);
      VIEWS.fleet.target.set(s.x, s.y, s.z);
    }
    if (state.view === 'ship') {
      // 飞船会随对接在停泊点 / 对接口之间移动，机位跟着它走
      const p = heroShip.group.position;
      VIEWS.ship.target.set(p.x, p.y, p.z);
      VIEWS.ship.pos.set(p.x - 22, p.y + 15, p.z + 44);
    }
    flyTo(state.view);
    viewChips.forEach((c) => c.classList.toggle('on', c === chip));
  });
});

const btnAuto = document.getElementById('btn-auto');
function syncAuto() {
  btnAuto.classList.toggle('on', controls.autoRotate);
}
btnAuto.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  syncAuto();
});
syncAuto();

/* ---- 固定视角：机位锁在编队坐标系里，地景/星空照常流转 ---------------- */
const btnFixed = document.getElementById('btn-fixed');
btnFixed.addEventListener('click', () => {
  state.fixed = !state.fixed;
  btnFixed.classList.toggle('on', state.fixed);
  btnFixed.textContent = state.fixed ? '解除固定 ↺' : '固定视角 ⤢';
  camGoal = null;
  btnFixed.blur();
});

/* ---- 轨道数量 / 轨道线 ------------------------------------------------ */
const orbitVal = document.getElementById('orbitVal');
const orbitCount = document.getElementById('orbitCount');
const lineVal = document.getElementById('lineVal');
const lineOnBtn = document.getElementById('btn-line-on');
const lineOffBtn = document.getElementById('btn-line-off');

const queue = { count: 3, lines: true };

function applyQueues() {
  lanes.forEach((l, i) => {
    const on = i < queue.count - 1;
    l.on = on;
    if (on) ensureFleet(l);
    if (l.fleet) l.fleet.group.visible = on;
    l.lane.line.visible = on && queue.lines;
  });
  laneMain.line.visible = queue.lines;

  orbitVal.textContent = `${queue.count} 条`;
  orbitVal.classList.toggle('ok', queue.count > 1);

  lineVal.textContent = queue.lines ? '显示' : '隐藏';
  lineVal.classList.toggle('ok', queue.lines);
  lineVal.classList.toggle('warn', !queue.lines);
  lineOnBtn.classList.toggle('on', queue.lines);
  lineOffBtn.classList.toggle('on', !queue.lines);
}

orbitCount.addEventListener('input', () => {
  queue.count = THREE.MathUtils.clamp(Math.round(Number(orbitCount.value)), 1, MAX_ORBITS);
  applyQueues();
});

lineOnBtn.addEventListener('click', () => {
  queue.lines = true;
  applyQueues();
});
lineOffBtn.addEventListener('click', () => {
  queue.lines = false;
  applyQueues();
});
orbitCount.value = String(queue.count);
applyQueues();

/* ---- 轨道星链：每条附加轨道的卫星数量 / 间距 --------------------------
   两根滑块完全独立：数量决定几颗，间距决定排多开（最小 0 = 叠在队首）。
   默认 20 颗 × 3,320 km 恰好绕满一圈。 */
const laneCountIn = document.getElementById('laneCount');
const laneGapIn = document.getElementById('laneGap');
const laneCountVal = document.getElementById('laneCountVal');
const laneGapVal = document.getElementById('laneGapVal');
const LANE_MIN = 4;
const LANE_MAX = 24;

function paintRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const p = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--p', `${p.toFixed(2)}%`);
}

/** from: 'count' | 'gap' | undefined —— 正在拖的那一根不再回写，免得跟手打架 */
function applyLaneLinks(from) {
  laneLinks.count = THREE.MathUtils.clamp(Math.round(laneLinks.count), LANE_MIN, LANE_MAX);
  laneLinks.gapKm = Math.max(0, Math.round(laneLinks.gapKm));
  const n = laneLinks.count;
  const km = laneLinks.gapKm;

  for (const l of lanes) {
    if (l.fleet) l.fleet.setLayout({ count: n, gap: km / KM_PER_UNIT });
  }

  laneCountVal.innerHTML = `${n}<em>颗</em>`;
  laneGapVal.innerHTML = `${km.toLocaleString('en-US')}<em>km</em>`;
  if (from !== 'count') {
    laneCountIn.value = String(n);
    paintRange(laneCountIn);
  }
  if (from !== 'gap') {
    laneGapIn.value = String(km);
    paintRange(laneGapIn);
  }
}

laneCountIn.addEventListener('input', () => {
  laneLinks.count = Number(laneCountIn.value);
  applyLaneLinks('count');
});
laneGapIn.addEventListener('input', () => {
  laneLinks.gapKm = Math.max(0, Number(laneGapIn.value));
  applyLaneLinks('gap');
});
// 初始：20 颗 × 3,320 km ≈ 整圈均布
applyLaneLinks();

/* ---- panel collapse (small screens) ------------------------------------ */
const panel = document.getElementById('panel');
const panelToggle = document.getElementById('panel-toggle');
panelToggle.addEventListener('click', () => {
  panel.classList.toggle('collapsed');
  panelToggle.textContent = panel.classList.contains('collapsed') ? '控制台 ＋' : '控制台 −';
});

// 窄屏默认收起控制面板，避免遮挡场景
if (window.innerWidth <= 860) {
  panel.classList.add('collapsed');
  panelToggle.textContent = '控制台 ＋';
}

/* --------------------------------------------------------------- resize */

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // 像素比只在跨过 500 万像素阈值时才变，避免每次拖动窗口都重建绘制缓冲
  const dpr = pickPixelRatio();
  if (Math.abs(dpr - renderer.getPixelRatio()) > 1e-3) {
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
  }
  renderer.setSize(w, h);
  composer.setSize(w, h);
  // bloom 固定在 CSS 像素分辨率（不乘 dpr）：泛光是低频效果，半分辨率已经够用，
  // 同时保证 dpr=1 和 dpr=2 的屏幕上辉光半径观感一致
  bloom.setSize(w, h);
  lifter.resize(h * renderer.getPixelRatio());
}
window.addEventListener('resize', onResize);

/* ----------------------------------------------------------------- loop */

const clock = new THREE.Clock();
const prevWorld = new THREE.Vector3();
const nowWorld = new THREE.Vector3();
const travel = new THREE.Vector3();
const convoyWorld = new THREE.Vector3();
const shipWorld = new THREE.Vector3();
const dockWorld = new THREE.Vector3();
const qPrev = new THREE.Quaternion();
const qCur = new THREE.Quaternion();
const qDelta = new THREE.Quaternion();
const qTmp = new THREE.Quaternion();
const camOff = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
let hudTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const sdt = state.paused ? 0 : dt * state.timeScale;

  sim.t += sdt;
  sim.drift += sdt * 0.0035;

  // travel along the orbit: rotate the whole convoy, drag the camera with it
  if (state.moveDir !== 0 && sdt > 0) {
    orbitPivot.updateMatrixWorld(true);
    station.group.getWorldPosition(prevWorld);
    convoy.getWorldQuaternion(qPrev);
    laneMain.spinner.rotateOnAxis(AXIS_Y, state.moveDir * state.moveRate * sdt);
    orbitPivot.updateMatrixWorld(true);
    station.group.getWorldPosition(nowWorld);
    convoy.getWorldQuaternion(qCur);
    travel.copy(nowWorld).sub(prevWorld);

    // 固定视角：除了平移，把机位也随编队一起旋转，队列在画面里的角度不变
    if (state.fixed) {
      qDelta.copy(qCur).multiply(qTmp.copy(qPrev).invert());
      camOff.copy(camera.position).sub(controls.target).applyQuaternion(qDelta);
      camera.position.copy(controls.target).add(camOff);
      camera.up.applyQuaternion(qDelta).normalize();
      if (controls._quat && controls._quatInverse) {
        controls._quat.setFromUnitVectors(camera.up, WORLD_UP);
        controls._quatInverse.copy(controls._quat).invert();
      }
      if (camGoal) {
        camOff.copy(camGoal.pos).sub(camGoal.target).applyQuaternion(qDelta);
        camGoal.pos.copy(camGoal.target).add(camOff);
      }
    }

    camera.position.add(travel);
    controls.target.add(travel);
    if (camGoal) {
      camGoal.pos.add(travel);
      camGoal.target.add(travel);
    }
    followPrev.add(travel); // 目标随编队整体平移的部分已在上面补过，别重复算
    sim.travel += travel.length() * state.moveDir;
  }

  // 其余轨道各自按自己的倾角/方向绕地球转
  for (const l of lanes) {
    if (!l.on) continue;
    l.lane.spinner.rotateOnAxis(AXIS_Y, l.rate * sdt);
    if (l.fleet) l.fleet.update(sdt, sim.t);
  }

  earth.update(sim.t, sim.drift);
  heroShip.update(sdt, sim.t);
  station.update(sdt, sim.t, SUN_DIR);
  fleet.update(sdt, sim.t);
  lifter.update(sdt, sim.t);
  sky.update(sim.t);

  // keep the sun rig locked to the convoy (the light itself stays directional)
  station.group.getWorldPosition(convoyWorld);
  sunLight.position.copy(convoyWorld).addScaledVector(SUN_DIR, 320);
  sunLight.target.position.copy(convoyWorld);
  earthShine.position.copy(convoyWorld).add(EARTH_SHINE_OFF);
  earthShine.target.position.copy(convoyWorld);

  // 补光挂在相机上，跟着视角走：任何角度都不会留下纯黑的一侧
  camFill.position.copy(camera.position);
  camFill.target.position.copy(controls.target);

  // 地影判定：太阳被地球挡住时主光收掉，只留地照与边缘补光
  updateEclipse(convoyWorld);
  const sunPower = Number(sunPow.value) / 100;
  sunLight.intensity = SUN_BASE * sunPower * eclipse;
  earthShine.intensity = 1.15 * (0.5 + 0.5 * sunPower) * (0.42 + 0.58 * eclipse);
  sky.setEclipse(eclipse);

  // 贴身机位跟随：把目标本帧的位移补到相机与 target 上，
  // 用户此前调整的角度 / 距离 / 平移全部保留，目标始终停在画面原处
  if (FOLLOW_VIEWS.has(state.view)) {
    followAnchor(followCur);
    if (!followOn) {
      followOn = true;
      followPrev.copy(followCur);
    }
    followDelta.copy(followCur).sub(followPrev);
    if (followDelta.lengthSq() > 1e-10) {
      camera.position.add(followDelta);
      controls.target.add(followDelta);
      if (camGoal) {
        camGoal.pos.add(followDelta);
        camGoal.target.add(followDelta);
      }
    }
    followPrev.copy(followCur);
  } else {
    followOn = false;
  }

  // camera transitions
  if (camGoal) {
    transitionT = Math.min(1, transitionT + dt * 1.5);
    const k = 1 - Math.pow(1 - transitionT, 3);
    camera.position.lerp(camGoal.pos, k * 0.16);
    controls.target.lerp(camGoal.target, k * 0.16);
    if (transitionT >= 1 && camera.position.distanceTo(camGoal.pos) < 0.6) camGoal = null;
  }

  controls.update();

  // 拉远时放大滚轮步长，几把就能退到看清整个地球
  const dist = camera.position.distanceTo(controls.target);
  controls.zoomSpeed = THREE.MathUtils.clamp(0.85 + dist / 900, 0.85, 3.2);

  composer.render();

  // 左侧轨道遥测面板
  telemetry.update(dt, sim);

  // panel read-outs
  hudTimer += dt;
  if (hudTimer > 0.08) {
    hudTimer = 0;
    const d = station.state.deploy;
    deployBar.style.width = `${Math.round(d * 100)}%`;
    deployLabel.textContent = d > 0.985 ? '已展开' : d < 0.015 ? '已收起' : '展开中';
    deployLabel.classList.toggle('ok', d > 0.985);
    deployLabel.classList.toggle('warn', d < 0.015);

    const evaTxt = document.getElementById('evaLabel');
    evaTxt.textContent =
      station.state.evaT > 0.9 ? '舱外作业中' : station.state.evaT < 0.1 ? '舱内待命' : '气闸过渡中';
    evaTxt.classList.toggle('ok', station.state.evaT > 0.9);

    const dockTxt = document.getElementById('dockLabel');
    // 对接分三段：接近 → 机械臂捕获 → 拖曳靠港，读数跟着实际阶段走
    const dk = station.state.dockT;
    dockTxt.textContent =
      dk > 0.96
        ? '硬连接完成'
        : dk > 0.66
          ? '拖曳对接'
          : dk > 0.46
            ? '机械臂捕获'
            : dk > 0.05
              ? '接近段机动'
              : '安全距离待命';
    dockTxt.classList.toggle('ok', dk > 0.96);

    updateDayNight(convoyWorld);

    const spd = document.getElementById('moveSpeed');
    if (spd) {
      const v = state.paused ? 0 : Math.abs(state.moveDir) * state.moveRate * laneMain.radius * state.timeScale;
      spd.textContent = `${v.toFixed(1)} km/s`;
    }

    const lv = document.getElementById('launchVal');
    const ld = document.getElementById('launchDist');
    if (lv && ld) {
      lv.textContent = lifter.info.phase;
      lv.classList.toggle('ok', lifter.info.mode === 'docked');
      lv.classList.toggle('hot', lifter.info.mode === 'ascent');
      ld.textContent =
        lifter.info.mode === 'ascent'
          ? `${lifter.info.dist.toFixed(0)} m`
          : lifter.info.mode === 'docked'
            ? '已锁定'
            : '—';
      launchBtn.disabled = lifter.info.mode === 'ascent';
      if (lifter.info.mode !== 'ascent') launchBtn.classList.remove('on');
      launchBtn.textContent = lifter.info.mode === 'docked' ? '再次发射运载飞船 ↑' : '发射运载飞船 ↑';
    }
  }
}

document.getElementById('loader').classList.add('hidden');
animate();

/* ---- 调试钩子：只在 ?dev 时挂出，供离线截图探针检查机位 / 材质 ------- */
if (new URLSearchParams(location.search).has('dev')) {
  window.__dev = { THREE, scene, camera, controls, state, earth, fleet, lanes, VIEWS, setMove, FOLLOW_VIEWS, followAnchor, laneLinks, applyLaneLinks, sky, station, heroShip, SUN_DIR, EARTH_POS };
}

manager.onLoad = () => {
  document.getElementById('loader').classList.add('hidden');
};
setTimeout(() => document.getElementById('loader').classList.add('hidden'), 9000);
