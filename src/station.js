import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullTexture, solarTexture, radiatorTexture, glowTexture } from './textures.js';

/* ------------------------------------------------------------- helpers */

function cylX(r1, r2, len, seg = 24, open = false) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open);
  g.rotateZ(Math.PI / 2);
  return g;
}

function cylZ(r1, r2, len, seg = 20) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, false);
  g.rotateX(Math.PI / 2);
  return g;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}

const _sa = new THREE.Vector3();
const _sb = new THREE.Vector3();
const _sd = new THREE.Vector3();
const _sy = new THREE.Vector3(0, 1, 0);
/** cylinder spanning two points (truss / brace) */
function strut(ax, ay, az, bx, by, bz, rad, mat) {
  _sa.set(ax, ay, az);
  _sb.set(bx, by, bz);
  _sd.subVectors(_sb, _sa);
  const len = _sd.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 6), mat);
  m.position.addVectors(_sa, _sb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_sy, _sd.normalize());
  m.castShadow = true;
  return m;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/**
 * 径向舱室：粗壮的浅色加压圆柱，直接坐在节点上，末端收成半球 + 对接口。
 * 不做光溜溜一个圆柱 —— 裙座、套接段、宽环箍、双道舷窗、检修板、RCS 组都有，
 * 这样放大了才经得起看。dir = 轴向（±Y），start = 贴节点的起点，len = 总长。
 */
function radialCabin(parent, dir, start, len, rad, M) {
  const g = new THREE.Group();
  g.position.copy(dir).multiplyScalar(start);
  g.quaternion.setFromUnitVectors(_sy, dir);
  parent.add(g);

  const R = (k) => rad * k;
  const _n = new THREE.Vector3();

  /* 1) 裙座：从节点球面铺开，彻底消掉“细杆”观感 */
  g.add(mesh(new THREE.CylinderGeometry(R(0.84), R(1.0), 1.7, 36), M.hull2, 0, 0.85, 0));
  for (const [y, k, t] of [[0.34, 0.9, 0.14], [1.7, 1.012, 0.18]]) {
    const r = mesh(new THREE.TorusGeometry(R(k), t, 8, 36), M.metal, 0, y, 0);
    r.rotation.x = Math.PI / 2;
    g.add(r);
  }

  /* 2) 主筒：三段微收锥的套接段，段缝压在宽环箍下 */
  const SEG = 3;
  const y0 = 1.7;
  const bodyH = len - y0 - 1.5;
  const segLen = bodyH / SEG;
  for (let i = 0; i < SEG; i++) {
    const ri = R(1 - i * 0.035);
    const yc = y0 + segLen * i;
    g.add(
      mesh(
        new THREE.CylinderGeometry(ri, ri * 1.008, segLen - 0.06, 36),
        i === 1 ? M.white : M.hull,
        0,
        yc + segLen / 2,
        0
      )
    );
    const band = mesh(new THREE.TorusGeometry(ri * 1.048, 0.19, 8, 36), M.metal, 0, yc, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);

    // 每段外壁散几块检修板 / 保温毯，打掉大面积平筒
    for (let k = 0; k < 3; k++) {
      const a = i * 1.07 + k * 2.09;
      const p = box(
        R(0.46),
        segLen * 0.34,
        0.14,
        k === 0 ? M.gold : M.hull2,
        Math.cos(a) * ri * 0.995,
        yc + segLen * 0.5,
        Math.sin(a) * ri * 0.995
      );
      p.rotation.y = Math.PI / 2 - a;
      g.add(p);
    }
  }

  /* 3) 双道舷窗环：圆窗 + 金属窗框 */
  for (const [yy, n, rr] of [
    [y0 + segLen * 0.92, 10, 0.082],
    [y0 + segLen * 2.06, 10, 0.066],
  ]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      _n.set(Math.cos(a), 0, Math.sin(a));
      const w = mesh(new THREE.CylinderGeometry(R(rr), R(rr), 0.22, 14), M.win, _n.x * R(0.99), yy, _n.z * R(0.99));
      w.quaternion.setFromUnitVectors(_sy, _n);
      g.add(w);
      const bez = mesh(new THREE.TorusGeometry(R(rr * 1.34), 0.05, 6, 16), M.metal, _n.x * R(1.0), yy, _n.z * R(1.0));
      bez.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _n);
      g.add(bez);
    }
  }

  /* 4) 腰部金毯 + 两片外贴散热板 */
  g.add(mesh(new THREE.CylinderGeometry(R(1.014), R(1.014), R(0.44), 36, 1, true), M.gold, 0, y0 + segLen * 1.5, 0));
  for (const th of [-0.62, Math.PI - 0.62]) {
    const rad2 = mesh(
      new THREE.CylinderGeometry(R(1.02), R(1.02), segLen * 0.72, 24, 1, true, th, 1.0),
      M.radiator,
      0,
      y0 + segLen * 2.42,
      0
    );
    g.add(rad2);
  }

  /* 5) 侧面 RCS 组 */
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    _n.set(Math.cos(a), 0, Math.sin(a));
    const pod = box(R(0.3), R(0.44), R(0.3), M.dark, _n.x * R(0.96), y0 + 0.62, _n.z * R(0.96));
    pod.rotation.y = Math.PI / 2 - a;
    g.add(pod);
    const noz = mesh(new THREE.CylinderGeometry(R(0.06), R(0.11), 0.28, 10), M.metal, _n.x * R(1.06), y0 + 0.62, _n.z * R(1.06));
    noz.quaternion.setFromUnitVectors(_sy, _n);
    g.add(noz);
  }

  /* 6) 末端：八角棱台冠 + 二级塔 + 对接探头（不再是圆乎乎的半球） */
  const topY = y0 + bodyH;
  const _qy = new THREE.Quaternion();
  const _qt = new THREE.Quaternion();
  const _ax = new THREE.Vector3(1, 0, 0);

  // 与筒体的承接环
  const shoulder = mesh(new THREE.TorusGeometry(R(0.985), R(0.072), 8, 40), M.metal, 0, topY, 0);
  shoulder.rotation.x = Math.PI / 2;
  g.add(shoulder);

  // 冠底发光环：整圈亮边，棱台压在上面
  const crownGlow = mesh(new THREE.TorusGeometry(R(0.9), R(0.032), 6, 44), M.accent, 0, topY + R(0.05), 0);
  crownGlow.rotation.x = Math.PI / 2;
  g.add(crownGlow);

  // 主冠：八棱台（下端接筒体，上端收窄），八个平面比球面更有机械味
  g.add(mesh(new THREE.CylinderGeometry(R(0.62), R(0.97), R(0.42), 8), M.white, 0, topY + R(0.21), 0));
  // 冠肩金带 + 环箍
  g.add(mesh(new THREE.CylinderGeometry(R(0.605), R(0.63), R(0.08), 8, 1, true), M.gold, 0, topY + R(0.41), 0));
  const crownRing = mesh(new THREE.TorusGeometry(R(0.62), R(0.042), 6, 32), M.metal, 0, topY + R(0.42), 0);
  crownRing.rotation.x = Math.PI / 2;
  g.add(crownRing);

  // 二级棱台塔：再收一级，形成台阶
  g.add(mesh(new THREE.CylinderGeometry(R(0.36), R(0.58), R(0.26), 8), M.hull2, 0, topY + R(0.55), 0));
  g.add(mesh(new THREE.CylinderGeometry(R(0.34), R(0.34), R(0.045), 8), M.dark, 0, topY + R(0.69), 0));

  // 对接探头 + 锁环 + 顶尖信标
  g.add(mesh(new THREE.CylinderGeometry(R(0.13), R(0.21), R(0.28), 18), M.metal, 0, topY + R(0.82), 0));
  const lockRing = mesh(new THREE.TorusGeometry(R(0.19), R(0.038), 8, 26), M.accent, 0, topY + R(0.93), 0);
  lockRing.rotation.x = Math.PI / 2;
  g.add(lockRing);
  g.add(mesh(new THREE.SphereGeometry(R(0.05), 10, 8), M.accent, 0, topY + R(0.98), 0));

  // 四片外张的传感器 / 散热片，插在冠肩上
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = box(R(0.28), R(0.3), R(0.05), i % 2 ? M.hull2 : M.radiator, Math.cos(a) * R(0.84), topY + R(0.28), Math.sin(a) * R(0.84));
    _qy.setFromAxisAngle(_sy, Math.PI / 2 - a);
    _qt.setFromAxisAngle(_ax, 0.34);
    fin.quaternion.copy(_qy).multiply(_qt);
    g.add(fin);
  }

  // 冠侧天线：短杆 + 小碟
  const antY = topY + R(0.52);
  g.add(mesh(new THREE.CylinderGeometry(0.048, 0.048, R(0.52), 6), M.truss, 0, antY, R(0.46)));
  const dish = mesh(new THREE.SphereGeometry(R(0.18), 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), M.white, 0, antY + R(0.3), R(0.46));
  dish.rotation.x = Math.PI * 0.72;
  g.add(dish);

  // 根部定位灯环
  const baseRing = mesh(new THREE.TorusGeometry(R(0.99), 0.06, 6, 32), M.accent, 0, 1.92, 0);
  baseRing.rotation.x = Math.PI / 2;
  g.add(baseRing);

  return g;
}

/* --------------------------------------------------------- the station */

export function createStation({ shipDock } = {}) {
  const group = new THREE.Group();

  /* ---- materials ------------------------------------------------------- */
  const hullTex = hullTexture();
  const repeatHull = (rx, ry) => {
    const t = hullTex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  };

  const M = {
    hull: new THREE.MeshStandardMaterial({
      map: repeatHull(3.2, 3.2),
      bumpMap: repeatHull(3.2, 3.2),
      bumpScale: 0.02,
      color: 0xdfdbcf,
      roughness: 0.68,
      metalness: 0.18,
    }),
    hull2: new THREE.MeshStandardMaterial({
      map: repeatHull(2.0, 2.0),
      color: 0xc6c3b9,
      roughness: 0.5,
      metalness: 0.34,
    }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.72, metalness: 0.06 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x7d8490, roughness: 0.34, metalness: 0.95 }),
    truss: new THREE.MeshStandardMaterial({ color: 0x9ea5b0, roughness: 0.4, metalness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.55, metalness: 0.7 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc99b42, roughness: 0.26, metalness: 1.0 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xcf7a33, roughness: 0.52, metalness: 0.45 }),
    solar: new THREE.MeshStandardMaterial({
      map: solarTexture(),
      color: 0xe8eefb,
      roughness: 0.44,
      metalness: 0.55,
      emissive: 0x16294f,
      emissiveIntensity: 0.34,
      side: THREE.DoubleSide,
    }),
    radiator: new THREE.MeshStandardMaterial({
      map: radiatorTexture(),
      color: 0xf2f2ee,
      roughness: 0.62,
      metalness: 0.18,
      side: THREE.DoubleSide,
    }),
    win: new THREE.MeshStandardMaterial({
      color: 0x14181f,
      emissive: 0xffcb8c,
      emissiveIntensity: 0.46,
      roughness: 0.22,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0x08202f,
      emissive: 0x36c6ff,
      emissiveIntensity: 1.3,
      roughness: 0.4,
    }),
    beaconR: new THREE.MeshBasicMaterial({ color: 0xff3a2f }),
    beaconG: new THREE.MeshBasicMaterial({ color: 0x38ff90 }),
  };

  const beacons = [];
  function addBeacon(x, y, z, mat, scale = 1) {
    const b = mesh(new THREE.SphereGeometry(0.16 * scale, 8, 6), mat, x, y, z);
    b.castShadow = false;
    group.add(b);
    beacons.push(b);
    return b;
  }

  /* =====================================================================
     spine: modules strung along X (travel direction)
     ===================================================================== */
  const SPINE = new THREE.Group();
  group.add(SPINE);

  // ---- central core -----------------------------------------------------
  SPINE.add(mesh(cylX(3.3, 3.3, 13.6, 40), M.hull, 0, 0, 0));
  for (const x of [-6.6, -3.2, 0.2, 3.6, 6.5]) {
    const r = mesh(new THREE.TorusGeometry(3.36, 0.16, 8, 44), M.metal, x, 0, 0);
    r.rotation.y = Math.PI / 2;
    SPINE.add(r);
  }

  // MLI blanket bands + service collars break up the tube
  for (const [x, w, mat] of [
    [-2.3, 1.5, M.gold],
    [1.9, 1.6, M.gold],
    [5.4, 1.1, M.gold],
    [-4.8, 0.9, M.dark],
    [7.2, 0.8, M.dark],
  ]) {
    SPINE.add(mesh(cylX(3.38, 3.38, w, 40, true), mat, x, 0, 0));
  }
  // gold wrap on the forward habitat
  SPINE.add(mesh(cylX(2.95, 2.95, 1.2, 36, true), M.gold, -15.7, 0, 0));
  SPINE.add(mesh(cylX(2.72, 2.72, 1.0, 36, true), M.dark, 16.4, 0, 0));

  // core windows / hatch details
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const w = box(1.15, 0.42, 0.1, M.win, -5.1, Math.sin(a) * 3.34, Math.cos(a) * 3.34);
    w.rotation.x = -a;
    SPINE.add(w);
  }

  // ---- forward habitat module ------------------------------------------
  SPINE.add(mesh(cylX(2.9, 2.9, 7.4, 36), M.hull, -12.8, 0, 0));
  SPINE.add(mesh(cylX(2.94, 2.94, 0.62, 36, true), M.win, -11.8, 0, 0));
  SPINE.add(mesh(cylX(2.94, 2.94, 0.42, 36, true), M.win, -14.6, 0, 0));
  for (const x of [-16.5, -12.8, -9.1]) {
    const r = mesh(new THREE.TorusGeometry(2.96, 0.14, 8, 36), M.metal, x, 0, 0);
    r.rotation.y = Math.PI / 2;
    SPINE.add(r);
  }
  // handrails along the module
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const y = Math.sin(a) * 3.02;
    const z = Math.cos(a) * 3.02;
    SPINE.add(mesh(cylX(0.05, 0.05, 4.6, 6), M.truss, -12.8, y, z));
  }

  // cupola (observatory dome) on top of the forward module
  const cupola = mesh(
    new THREE.SphereGeometry(1.15, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
    M.hull2,
    -14.2,
    2.7,
    0
  );
  SPINE.add(cupola);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const w = mesh(new THREE.SphereGeometry(0.34, 10, 8), M.win, -14.2 + Math.cos(a) * 0.62, 2.86, Math.sin(a) * 0.62);
    w.scale.set(1, 0.66, 1);
    SPINE.add(w);
  }
  SPINE.add(mesh(cylX(1.0, 1.0, 0.5, 20), M.metal, -14.2, 2.62, 0));

  // ---- aft service module ----------------------------------------------
  SPINE.add(mesh(cylX(2.7, 2.7, 6.6, 36), M.hull2, 13.2, 0, 0));
  for (const x of [10.2, 13.2, 16.2]) {
    const r = mesh(new THREE.TorusGeometry(2.76, 0.13, 8, 36), M.metal, x, 0, 0);
    r.rotation.y = Math.PI / 2;
    SPINE.add(r);
  }
  // propellant tanks ring
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const t = mesh(new THREE.SphereGeometry(0.95, 20, 14), M.white, 15.0, Math.sin(a) * 2.5, Math.cos(a) * 2.5);
    SPINE.add(t);
  }
  // radiator fins on the aft module — flat, so they sit clear of the arrays
  for (const s of [1, -1]) {
    const rad = box(4.6, 0.12, 3.0, M.radiator, 12.2, s * 4.35, 0);
    rad.rotation.x = s * 0.12;
    SPINE.add(rad);
    SPINE.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.75, 8), M.truss, 12.2, s * 3.45, 0));
  }

  // ---- cargo pods, auxiliary tanks, antenna farm -----------------------
  const cargo = new THREE.Group();
  group.add(cargo);
  const CRATES = [M.orange, M.white, M.hull2, M.orange];
  for (let i = 0; i < 4; i++) {
    const x = 3.0 + i * 1.15;
    const c = box(1.05, 1.0, 1.5, CRATES[i], x, 3.55, 0);
    c.rotation.x = i % 2 ? 0.04 : -0.04;
    cargo.add(c);
    cargo.add(box(1.12, 0.1, 0.16, M.metal, x, 3.55, 0.72));
    cargo.add(box(1.12, 0.1, 0.16, M.metal, x, 3.55, -0.72));
  }
  cargo.add(box(4.9, 0.14, 2.4, M.truss, 4.75, 3.02, 0)); // pallet deck
  // auxiliary tanks slung under the core
  for (const s2 of [1, -1]) {
    const t = mesh(cylX(0.82, 0.82, 2.7, 18), M.white, 4.4, -3.15, s2 * 1.5);
    cargo.add(t);
    cargo.add(mesh(cylX(0.86, 0.86, 0.16, 18), M.metal, 3.2, -3.15, s2 * 1.5));
    cargo.add(mesh(cylX(0.86, 0.86, 0.16, 18), M.metal, 5.6, -3.15, s2 * 1.5));
  }
  // antenna farm on the aft module
  for (let i = 0; i < 3; i++) {
    const x = 11.4 + i * 1.5;
    cargo.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2 + i * 0.4, 6), M.truss, x, 3.2 + i * 0.2, 1.1));
    cargo.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), M.metal, x, 4.3 + i * 0.3, 1.1));
  }
  for (const s2 of [1, -1]) {
    const d2 = mesh(new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), M.white, 15.6, s2 * 2.0, 1.6);
    d2.rotation.x = s2 * 0.9;
    cargo.add(d2);
  }

  // ---- nodes ------------------------------------------------------------
  const foreNode = mesh(new THREE.SphereGeometry(2.35, 28, 20), M.hull2, -17.9, 0, 0);
  SPINE.add(foreNode);
  const aftNode = mesh(new THREE.SphereGeometry(2.25, 28, 20), M.hull2, 18.6, 0, 0);
  SPINE.add(aftNode);

  // radial ports on the fore node
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const p = mesh(cylZ(0.95, 0.95, 1.0, 16), M.metal, -17.9, Math.sin(a) * 2.3, Math.cos(a) * 2.3);
    p.lookAt(-17.9, Math.sin(a) * 5, Math.cos(a) * 5);
    SPINE.add(p);
  }

  /* ---- fore cross-arm：上下两根粗加压舱，末端挂翼 --------------------- */
  const cabinWings = []; // 舱室末端挂的太阳翼（在编队坐标里）
  const crossFore = new THREE.Group();
  crossFore.position.x = -17.9;
  group.add(crossFore);
  for (const s of [1, -1]) {
    radialCabin(crossFore, new THREE.Vector3(0, s, 0), 1.9, 12.0, 3.05, M);
    const wy = s * (1.9 + 12.0 + 1.15);
    crossFore.add(mesh(cylZ(0.15, 0.15, 3.0, 10), M.metal, 0, wy, 0));
    for (const dz of [1, -1]) {
      cabinWings.push({
        pos: new THREE.Vector3(-17.9, wy, dz * 1.35),
        dir: new THREE.Vector3(0, 0, dz),
      });
    }
  }

  /* ---- aft cross-arm：中段一对舱，只做居住/实验段，不挂翼 --------------- */
  const crossAft = new THREE.Group();
  crossAft.position.x = 18.6;
  group.add(crossAft);
  for (const s of [1, -1]) {
    radialCabin(crossAft, new THREE.Vector3(0, s, 0), 1.85, 13.5, 3.2, M);
  }

  /* ---- engines (aft tip) ----------------------------------------------- */
  const engines = new THREE.Group();
  engines.position.x = 53.8;
  group.add(engines);
  engines.add(mesh(cylX(1.6, 2.1, 1.6, 24), M.dark, 0.8, 0, 0));
  for (const s of [1, -1]) {
    const nz = mesh(cylX(0.86, 1.15, 1.5, 22, true), M.dark, 2.3, s * 0.95, 0);
    engines.add(nz);
  }

  /* ---- 尾部推进器：蓝色等离子体射流 ------------------------------------- */
  const plumes = [];
  const NOZZLE_X = 56.95;
  const plumeGlow = glowTexture(2.4, 256);

  /** 射流母线：喷口略收 → 中段鼓胀 → 尾端细长收尖 */
  function jetProfile(rad, len, k) {
    const pts = [];
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const bulge = 0.82 + 0.3 * Math.sin(Math.PI * Math.min(1, u / 0.3));
      // 尾段不完全收成一根发丝：留一段最小半径 + 末端微微外扩（真空扩散）
      const flare = 0.26 * Math.pow(Math.max(0, u - 0.52) / 0.48, 1.7);
      const r = rad * k * (bulge * Math.pow(1 - u, 0.78) + 0.085 + flare);
      pts.push(new THREE.Vector2(Math.max(r, 0.012), u * len * k));
    }
    return pts;
  }

  function addPlume(x, y, rad, len, ringCount = 3) {
    // 四层：外层鞘 → 中层辉光 → 内芯 → 白热核
    const layers = [
      [0x2450ff, 0.075, 1.44],
      [0x1b3ff2, 0.17, 1.16],
      [0x2f86ff, 0.24, 0.88],
      [0x86d4ff, 0.34, 0.58],
      [0xd8f2ff, 0.46, 0.3],
    ];
    for (const [hex, op, k] of layers) {
      const geo = new THREE.LatheGeometry(jetProfile(rad, len, k), 26);
      geo.rotateZ(-Math.PI / 2); // 沿 +X 喷出，原点在喷口
      const mat = new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, 0);
      m.castShadow = false;
      m.receiveShadow = false;
      group.add(m);
      plumes.push({ mesh: m, mat, op, seed: Math.random() * 10 });
    }

    // 顺着射流往后飘的等离子团：软边 sprite，比硬边圆环更像高温气体
    for (let i = 0; i < ringCount; i++) {
      const mat = new THREE.SpriteMaterial({
        map: plumeGlow,
        color: 0x5fb4ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const puff = new THREE.Sprite(mat);
      puff.position.set(x, y, 0);
      group.add(puff);
      plumes.push({
        puff,
        mat,
        op: 0.22,
        x,
        y,
        rad,
        len: len * 0.9,
        speed: 0.85 + i * 0.2,
        phase: i / ringCount,
        seed: Math.random() * 10,
      });
    }

    // 喷口辉光
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: plumeGlow,
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    s.position.set(x - 0.1, y, 0);
    s.scale.setScalar(rad * 2.6);
    group.add(s);
    plumes.push({ sprite: s, op: 0.9, seed: Math.random() * 10 });
  }

  for (const s of [1, -1]) addPlume(NOZZLE_X, s * 0.95, 1.25, 8.2, 2);
  // 中央主推力：和两侧叠在一起，看上去是一股合并的排气
  addPlume(57.0, 0, 2.0, 12.8, 4);

  /* 尾喷管：给射流一个实体出处，不然会像凭空飘在站后 */
  const nozzle = new THREE.Group();
  group.add(nozzle);
  nozzle.add(mesh(cylX(2.12, 2.42, 1.3, 36), M.hull2, 53.5, 0, 0));
  nozzle.add(mesh(cylX(2.2, 2.2, 0.4, 36), M.dark, 54.35, 0, 0));
  nozzle.add(mesh(cylX(1.9, 1.9, 0.12, 36, true), M.gold, 54.12, 0, 0));
  for (const s of [1, -1]) {
    nozzle.add(mesh(cylX(0.46, 0.78, 2.5, 26, true), M.dark, 55.7, s * 0.95, 0));
    const rim = mesh(new THREE.TorusGeometry(0.78, 0.07, 8, 26), M.metal, 56.92, s * 0.95, 0);
    rim.rotation.y = Math.PI / 2;
    nozzle.add(rim);
  }
  nozzle.add(mesh(cylX(0.92, 1.34, 2.5, 32, true), M.dark, 55.7, 0, 0));
  const cRim = mesh(new THREE.TorusGeometry(1.34, 0.09, 8, 32), M.metal, 56.92, 0, 0);
  cRim.rotation.y = Math.PI / 2;
  nozzle.add(cRim);

  /* =====================================================================
     extended tail: the station roughly doubles in length aft of the old node
     ===================================================================== */
  const TAIL = new THREE.Group();
  group.add(TAIL);

  // second core section
  TAIL.add(mesh(cylX(3.05, 3.05, 22.5, 40), M.hull, 28.2, 0, 0));
  for (const x of [19.4, 24.4, 29.4, 34.4, 38.8]) {
    const r = mesh(new THREE.TorusGeometry(3.1, 0.15, 8, 44), M.metal, x, 0, 0);
    r.rotation.y = Math.PI / 2;
    TAIL.add(r);
  }
  TAIL.add(mesh(cylX(3.1, 3.1, 1.3, 40, true), M.gold, 21.3, 0, 0));
  TAIL.add(mesh(cylX(3.1, 3.1, 1.0, 40, true), M.dark, 32.2, 0, 0));
  // service greebles along the new core
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    TAIL.add(box(2.6, 0.5, 0.7, i % 2 ? M.hull2 : M.gold, 26 + i * 2.4, Math.sin(a) * 3.25, Math.cos(a) * 3.25));
  }

  // second node + four-way cross
  TAIL.add(mesh(new THREE.SphereGeometry(2.3, 28, 20), M.hull2, 40.6, 0, 0));
  const tailCross = new THREE.Group();
  tailCross.position.x = 40.6;
  TAIL.add(tailCross);
  for (const s2 of [1, -1]) {
    radialCabin(tailCross, new THREE.Vector3(0, s2, 0), 1.9, 13.0, 3.15, M);
    const wy2 = s2 * (1.9 + 13.0 + 1.2);
    tailCross.add(mesh(cylZ(0.16, 0.16, 3.1, 10), M.metal, 0, wy2, 0));
    for (const dz of [1, -1]) {
      cabinWings.push({
        pos: new THREE.Vector3(40.6, wy2, dz * 1.4),
        dir: new THREE.Vector3(0, 0, dz),
      });
    }
  }

  // terminal service module
  TAIL.add(mesh(cylX(2.35, 2.35, 10.5, 32), M.hull, 47.6, 0, 0));
  for (const x of [43.2, 47.6, 51.9]) {
    const r = mesh(new THREE.TorusGeometry(2.4, 0.13, 8, 34), M.metal, x, 0, 0);
    r.rotation.y = Math.PI / 2;
    TAIL.add(r);
  }
  TAIL.add(mesh(cylX(2.4, 2.4, 0.9, 32, true), M.gold, 45.0, 0, 0));
  // small dishes + whips on the tail
  for (const s2 of [1, -1]) {
    const d3 = mesh(new THREE.SphereGeometry(0.9, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), M.white, 49.4, s2 * 2.3, 0.6);
    d3.rotation.x = s2 * 1.1;
    TAIL.add(d3);
  }

  // ventral launch port for the cargo lifter
  const launchPort = new THREE.Group();
  launchPort.position.set(22.6, -3.0, 0);
  TAIL.add(launchPort);
  launchPort.add(mesh(new THREE.CylinderGeometry(1.5, 1.1, 1.5, 22), M.hull2, 0, -0.85, 0));
  launchPort.add(mesh(new THREE.TorusGeometry(1.15, 0.14, 10, 26), M.metal, 0, -1.6, 0));
  launchPort.add(mesh(new THREE.TorusGeometry(1.15, 0.14, 10, 26), M.metal, 0, -0.1, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    launchPort.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 8), M.truss, Math.cos(a) * 1.25, -0.85, Math.sin(a) * 1.25));
  }

  /* ---- docking port (fore tip) ----------------------------------------- */
  const dock = new THREE.Group();
  dock.position.x = -20.3;
  group.add(dock);

  const dockCone = mesh(cylX(1.05, 1.8, 2.0, 24), M.hull2, -1.0, 0, 0);
  dock.add(dockCone);
  const dockRing = mesh(new THREE.TorusGeometry(1.06, 0.14, 10, 30), M.metal, -2.05, 0, 0);
  dockRing.rotation.y = Math.PI / 2;
  dock.add(dockRing);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const petal = box(0.44, 0.1, 0.62, M.metal, -2.1, Math.cos(a) * 1.32, Math.sin(a) * 1.32);
    petal.rotation.x = -a + Math.PI / 2;
    dock.add(petal);
  }
  const dockLights = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const l = mesh(new THREE.SphereGeometry(0.13, 8, 6), i % 2 ? M.beaconG : M.beaconR, -2.15, Math.cos(a) * 1.62, Math.sin(a) * 1.62);
    dock.add(l);
    dockLights.push(l);
  }
  // truss ring around the dock
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    dock.add(mesh(cylX(0.06, 0.06, 2.4, 6), M.truss, -1.0, Math.sin(a) * 1.85, Math.cos(a) * 1.85));
  }

  /* =====================================================================
     旋转圆环 —— 环体按舱室那套语言重做：
     孔板环壳 + 分段焊接环箍 + 双面圆舷窗 + 金毯条 + 环外缘垂直长出的
     环形舱段（圆柱，不是贴上去的方块）。细节按材质合并，draw call 可控。
     ===================================================================== */
  const Z_AX = new THREE.Vector3(0, 0, 1);
  const ONE3 = new THREE.Vector3(1, 1, 1);

  /** 把 {geo, mat, matrix} 列表按材质合并成少数几个 mesh */
  function mergeInto(parent, parts) {
    const byMat = new Map();
    for (const p of parts) {
      const geo = p.geo.clone();
      if (p.matrix) geo.applyMatrix4(p.matrix);
      let list = byMat.get(p.mat);
      if (!list) byMat.set(p.mat, (list = []));
      list.push(geo);
    }
    for (const [mat, list] of byMat) {
      const merged = list.length > 1 ? mergeGeometries(list, false) : null;
      if (!merged) {
        for (const geo of list) {
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = true;
          m.receiveShadow = true;
          parent.add(m);
        }
        continue;
      }
      for (const geo of list) geo.dispose();
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
    }
  }

  function buildRing(x, radius, tube, pods, speedSign, k = 1) {
    const g = new THREE.Group();
    g.position.x = x;
    g.userData.spin = speedSign;
    group.add(g);

    // 环体先在 XY 平面里造（轴 = Z），再整体转成 YZ 平面（轴 = X）。
    // 这样环上所有细节都能直接用极坐标摆，不用来回换坐标系。
    const rim = new THREE.Group();
    rim.rotation.y = Math.PI / 2;
    g.add(rim);

    const parts = [];
    const push = (geo, mat, pos, quat) => {
      const matrix =
        pos || quat ? new THREE.Matrix4().compose(pos || new THREE.Vector3(), quat || new THREE.Quaternion(), ONE3) : null;
      parts.push({ geo, mat, matrix });
    };
    const radialAt = (a) => new THREE.Vector3(Math.cos(a), Math.sin(a), 0);

    const segRing = Math.round(110 * Math.min(k, 2.1));
    const qxAxis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

    /* ---- 1) 环壳：环向纹理按半径重铺，避免大面积拉花 ---- */
    const rimHull = M.hull.clone();
    rimHull.map = M.hull.map.clone();
    rimHull.map.needsUpdate = true;
    rimHull.map.repeat.set(Math.max(6, Math.round(radius * 1.1)), Math.max(2, Math.round(tube * 1.5)));
    push(new THREE.TorusGeometry(radius, tube, 20, segRing), rimHull);
    push(new THREE.TorusGeometry(radius + tube * 0.55, tube * 0.2, 8, segRing), M.metal);
    push(new THREE.TorusGeometry(radius - tube * 0.55, tube * 0.16, 8, segRing), M.metal);

    /* ---- 2) 分段环箍：像舱段之间的焊接环 ---- */
    const nSeg = Math.max(10, Math.round(radius * 0.95));
    for (let i = 0; i < nSeg; i++) {
      const a = (i / nSeg) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromUnitVectors(Z_AX, new THREE.Vector3(-Math.sin(a), Math.cos(a), 0));
      push(new THREE.TorusGeometry(tube * 1.02, tube * 0.12, 8, 22), M.metal, radialAt(a).multiplyScalar(radius), q);
    }

    /* ---- 3) 双面圆舷窗：两圈，带金属窗框 ---- */
    const nWin = Math.min(30, Math.max(12, Math.round(radius * 1.3)));
    const wr = tube * 0.33;
    for (let i = 0; i < nWin; i++) {
      const a = (i / nWin) * Math.PI * 2 + 0.08;
      const d = radialAt(a);
      const qCyl = new THREE.Quaternion().setFromUnitVectors(_sy, d);
      const qRim = new THREE.Quaternion().setFromUnitVectors(Z_AX, d);
      for (const zz of [tube * 0.46, -tube * 0.46]) {
        const c = d.clone().multiplyScalar(radius + tube * 0.97);
        c.z = zz;
        // 齐平嵌在环壳表面的窗片，不要凸出来变成一颗颗的“扣子”
        push(new THREE.CylinderGeometry(wr, wr, tube * 0.05, 12), M.win, c.clone(), qCyl);
        push(new THREE.TorusGeometry(wr * 1.42, tube * 0.035, 6, 14), M.metal, c.clone(), qRim);
      }
    }

    /* ---- 4) 金毯条：环外缘隔一段贴一条 ---- */
    const nGold = radius > 8 ? 8 : 4;
    for (let i = 0; i < nGold; i++) {
      const a0 = (i / nGold) * Math.PI * 2 + 0.22;
      const q = new THREE.Quaternion().setFromAxisAngle(Z_AX, a0);
      push(new THREE.TorusGeometry(radius + tube * 0.95, tube * 0.14, 6, 10, 0.26), M.gold, null, q);
    }

    /* ---- 5) 辐条（改成圆柱 + 卡箍，比方钢干净） ---- */
    const nSpokes = radius > 8 ? 8 : 5;
    const sw = (radius > 8 ? 0.5 : 0.28) * k;
    const hubR = 2.9 * k;
    for (let i = 0; i < nSpokes; i++) {
      const a = (i / nSpokes) * Math.PI * 2;
      const d = radialAt(a);
      const len = radius - hubR - tube * 0.6;
      const q = new THREE.Quaternion().setFromUnitVectors(_sy, d);
      push(new THREE.CylinderGeometry(sw, sw, len, 10), M.truss, d.clone().multiplyScalar(hubR + len / 2), q);
      for (const t of [0.28, 0.72]) {
        push(
          new THREE.TorusGeometry(sw * 1.35, sw * 0.4, 6, 14),
          M.metal,
          d.clone().multiplyScalar(hubR + len * t),
          new THREE.Quaternion().setFromUnitVectors(Z_AX, d)
        );
      }
    }

    /* ---- 6) 大环加内圈环廊与斜撑 ---- */
    if (radius > 8) {
      const rIn = radius * 0.62;
      push(new THREE.TorusGeometry(rIn, tube * 0.4, 10, 68), M.hull);
      const brace = 0.085 * Math.max(1, k * 0.42);
      for (let i = 0; i < nSpokes; i++) {
        const a0 = (i / nSpokes) * Math.PI * 2;
        const a1 = ((i + 1) / nSpokes) * Math.PI * 2;
        const p0 = radialAt(a0).multiplyScalar(rIn);
        const p1 = radialAt(a1).multiplyScalar(radius - tube * 0.9);
        rim.add(strut(p0.x, p0.y, 0, p1.x, p1.y, 0, brace, M.truss));
      }
    }

    /* ---- 7) 环外缘的环形舱段：垂直插在环上，带裙座 / 环箍 / 舷窗 / 棱台顶 ---- */
    const podR = 0.6 * k;
    for (let i = 0; i < pods; i++) {
      const a = (i / pods) * Math.PI * 2 + Math.PI / pods;
      const d = radialAt(a);
      const base = d.clone().multiplyScalar(radius + tube * 0.86);
      const M4 = new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromUnitVectors(_sy, d), ONE3);
      const up = (y) => new THREE.Vector3(0, y, 0);
      const P = (geo, mat, pos, quat) => {
        const local = new THREE.Matrix4().compose(pos || new THREE.Vector3(), quat || new THREE.Quaternion(), ONE3);
        parts.push({ geo, mat, matrix: M4.clone().multiply(local) });
      };

      // 裙座（贴着环壳长出来）+ 底座环箍
      P(new THREE.CylinderGeometry(podR * 0.9, podR * 1.08, podR * 0.62, 22), M.hull2, up(podR * 0.31));
      P(new THREE.TorusGeometry(podR * 0.94, podR * 0.06, 8, 24), M.metal, up(podR * 0.64), qxAxis);
      // 主舱段
      P(new THREE.CylinderGeometry(podR * 0.84, podR * 0.9, podR * 1.6, 24), M.white, up(podR * 1.42));
      P(new THREE.TorusGeometry(podR * 0.87, podR * 0.055, 8, 24), M.metal, up(podR * 2.22), qxAxis);
      // 腰部金毯
      P(new THREE.CylinderGeometry(podR * 0.875, podR * 0.875, podR * 0.26, 24, 1, true), M.gold, up(podR * 1.05));
      // 舷窗环：六个朝外的圆窗
      for (let w = 0; w < 6; w++) {
        const aw = (w / 6) * Math.PI * 2 + 0.28;
        const off = new THREE.Vector3(Math.cos(aw) * podR * 0.87, podR * 1.7, Math.sin(aw) * podR * 0.87);
        const q = new THREE.Quaternion().setFromUnitVectors(_sy, new THREE.Vector3(Math.cos(aw), 0, Math.sin(aw)));
        P(new THREE.CylinderGeometry(podR * 0.11, podR * 0.11, podR * 0.12, 10), M.win, off, q);
      }
      // 末端八棱台冠 + 发光环 + 对接探头 + 信标
      P(new THREE.CylinderGeometry(podR * 0.42, podR * 0.86, podR * 0.46, 8), M.white, up(podR * 2.45));
      P(new THREE.TorusGeometry(podR * 0.78, podR * 0.035, 6, 26), M.accent, up(podR * 2.6), qxAxis);
      P(new THREE.CylinderGeometry(podR * 0.1, podR * 0.16, podR * 0.22, 12), M.metal, up(podR * 2.78));
      P(new THREE.SphereGeometry(podR * 0.055, 8, 6), M.accent, up(podR * 2.92));
      // 侧贴散热板
      P(new THREE.BoxGeometry(podR * 0.05, podR * 0.82, podR * 0.86), M.radiator, new THREE.Vector3(podR * 0.9, podR * 1.5, 0));
    }

    mergeInto(rim, parts);

    // 轮毂：让环看起来确实是套在脊柱上的
    const hub = mesh(cylX(0.9 * k, 0.9 * k, 1.4 * k, 20), M.metal, 0, 0, 0);
    g.add(hub);
    const hubRing = mesh(new THREE.TorusGeometry(0.98 * k, 0.07 * k, 6, 28), M.accent, 0.72 * k, 0, 0);
    hubRing.rotation.y = Math.PI / 2;
    g.add(hubRing);
    return g;
  }

  const ringFore = buildRing(-8.8, 4.5, 0.42, 3, -1);
  const ringAft = buildRing(8.8, 4.5, 0.42, 3, 1);
  const ringMid = buildRing(0, 12.4, 1.15, 6, 1);

  // the big aft wheel — the small ring's shape, scaled up ~5x
  const ringTail = buildRing(48.4, 22.6, 1.9, 8, 1, 3.4);

  // bearing collars on the spine where the rings mount
  for (const x of [-8.8, 8.8, 0]) {
    const c = mesh(cylX(3.62, 3.62, 1.5, 40), M.dark, x, 0, 0);
    group.add(c);
    for (let i = 0; i < 2; i++) {
      const r = mesh(new THREE.TorusGeometry(3.66, 0.1, 6, 40), M.metal, x + (i ? 0.62 : -0.62), 0, 0);
      r.rotation.y = Math.PI / 2;
      group.add(r);
    }
  }

  /* =====================================================================
     solar arrays — 全部可折叠：每段绕铰链回折，收起时在根部叠成一摞
     ===================================================================== */
  const arrays = [];
  const FOLD_ANGLE = Math.PI * 0.94; // 略小于 180°，折叠层之间留一点缝

  /**
   * 一组可折叠太阳翼。局部 +Y = 展开方向，绕局部 X 轴像手风琴一样回折。
   * pos / dir 用的是编队坐标（group 空间）。
   */
  function buildArray({ pos, dir, count, segLen, width }) {
    const root = new THREE.Group();
    root.position.copy(pos);
    root.quaternion.setFromUnitVectors(_sy, dir);
    group.add(root);

    // 根部铰链
    const hinge = mesh(new THREE.CylinderGeometry(0.2, 0.2, width * 0.98, 12), M.metal, 0, 0, 0);
    hinge.rotation.z = Math.PI / 2;
    root.add(hinge);
    root.add(box(0.44, 0.5, 0.42, M.dark, 0, 0.12, 0));

    let node = root;
    const segs = [];
    for (let i = 0; i < count; i++) {
      const seg = new THREE.Group();
      if (i > 0) seg.position.set(0, segLen, 0);
      node.add(seg);

      // 面板本体（薄片，法线沿局部 Z）
      seg.add(box(width, segLen - 0.16, 0.08, M.solar, 0, segLen / 2, 0));
      // 纵梁
      for (const sx of [-1, 1]) seg.add(box(0.12, segLen, 0.16, M.truss, (sx * width) / 2, segLen / 2, 0));
      // 横肋
      for (let k = 1; k < 3; k++) seg.add(box(width, 0.06, 0.14, M.truss, 0, (segLen * k) / 3, 0));
      // 折页
      const h = mesh(new THREE.CylinderGeometry(0.13, 0.13, width * 0.94, 10), M.metal, 0, segLen, 0);
      h.rotation.z = Math.PI / 2;
      seg.add(h);

      segs.push(seg);
      node = seg;
    }

    arrays.push({
      segs,
      // 展开轴（= 根部局部 +Y，绕它转就能让板面扫过整个对日圆）
      axis: dir.clone().normalize(),
      // 初始板面法线（根部局部 +Z 的编队坐标方向）
      normal0: new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion),
      rotY: 0,
    });
    return root;
  }

  // 主太阳翼（沿 ±Y，竖立；尾段加倍长）—— 内收到 x=±8.8，给舱室让出空间
  for (const x of [-8.8, 8.8]) {
    const count = x > 0 ? 5 : 4;
    const total = x > 0 ? 34.0 : 18.6;
    for (const d of [1, -1]) {
      buildArray({
        pos: new THREE.Vector3(x, d * 3.5, 0),
        dir: new THREE.Vector3(0, d, 0),
        count,
        segLen: total / count,
        width: 7.4,
      });
    }
  }

  // 侧向太阳翼（沿 ±Z，水平铺开）—— 补上之前缺的那一个方向
  for (const x of [-5.6, 5.6]) {
    for (const d of [1, -1]) {
      buildArray({
        pos: new THREE.Vector3(x, 0, d * 3.32),
        dir: new THREE.Vector3(0, 0, d),
        count: 3,
        segLen: 3.9,
        width: 4.4,
      });
    }
  }

  // 舱室末端的小翼列（每个舱顶向两侧各一片，像参考图那样挑出来）
  for (const spot of cabinWings) {
    buildArray({
      pos: spot.pos,
      dir: spot.dir,
      count: 3,
      segLen: 3.0,
      width: 4.8,
    });
  }

  /* =====================================================================
     lattice booms along Z (the long arms in the reference)
     ===================================================================== */
  function latticeBoom(x, y, zFrom, zTo, sign) {
    const len = Math.abs(zTo - zFrom);
    const g = new THREE.Group();
    group.add(g);
    const rails = [-1, 1];
    for (const a of rails) {
      for (const b of rails) {
        g.add(box(0.1, 0.1, len, M.truss, x + a * 0.62, y + b * 0.62, (zFrom + zTo) / 2));
      }
    }
    const bays = Math.round(len / 1.6);
    for (let i = 0; i <= bays; i++) {
      const z = zFrom + sign * (len * i) / bays;
      g.add(box(1.34, 0.08, 0.08, M.truss, x, y + 0.62, z));
      g.add(box(1.34, 0.08, 0.08, M.truss, x, y - 0.62, z));
      g.add(box(0.08, 1.34, 0.08, M.truss, x, y, z));
      if (i < bays) {
        const d = box(0.06, 0.06, 2.2, M.truss, x, y + 0.3, z + (sign * len) / bays / 2);
        d.rotation.x = 0.42 * sign;
        g.add(d);
      }
    }
    return g;
  }

  latticeBoom(-3.4, 4.4, 4.0, 21.0, 1);
  latticeBoom(-3.4, -4.4, -4.0, -21.0, 1);
  latticeBoom(3.4, 5.4, 4.0, 15.0, 1);
  latticeBoom(3.4, -5.4, -4.0, -15.0, 1);

  /* ---- dish antenna + robot arm --------------------------------------- */
  const dishPivot = new THREE.Group();
  dishPivot.position.set(4.6, 3.4, 0);
  dishPivot.rotation.z = -0.5;
  group.add(dishPivot);
  const dish = mesh(new THREE.SphereGeometry(2.9, 30, 18, 0, Math.PI * 2, 0, Math.PI * 0.42), M.white);
  dish.material = M.white;
  dishPivot.add(dish);
  dishPivot.add(mesh(new THREE.TorusGeometry(2.88, 0.08, 6, 34), M.metal, 0, 0.02, 0));
  dishPivot.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), M.metal, 0, 0.6, 0));

  // robot arm (Canadarm style)
  const armBase = new THREE.Group();
  armBase.position.set(-10.4, 2.7, 1.1);
  group.add(armBase);
  armBase.add(mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.7, 14), M.metal, 0, 0.3, 0));
  const armSeg1 = new THREE.Group();
  armSeg1.position.y = 0.65;
  armSeg1.rotation.z = 0.55;
  armBase.add(armSeg1);
  armSeg1.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 4.4, 12), M.white, 0, 2.2, 0));
  const armSeg2 = new THREE.Group();
  armSeg2.position.y = 4.4;
  armSeg2.rotation.z = -1.5;
  armSeg1.add(armSeg2);
  armSeg2.add(mesh(new THREE.CylinderGeometry(0.16, 0.19, 3.6, 12), M.white, 0, 1.8, 0));
  armSeg2.add(box(0.5, 0.5, 0.5, M.dark, 0, 3.7, 0));

  /* ---- 捕获机械臂 ------------------------------------------------------ */
  // 装在码头侧面、正对对接口的那一侧。对接时它先伸出去咬住飞船，
  // 再把飞船整个拖回对接口 —— 所以基座必须离码头足够近，臂才够得着。
  const ARM_L1 = 6.8;
  const ARM_L2 = 6.4;
  const ARM_BASE = new THREE.Vector3(-22.4, 2.6, 1.6);
  const AXIS_Y = new THREE.Vector3(0, 1, 0);

  const armRoot = new THREE.Group();
  armRoot.position.copy(ARM_BASE);
  group.add(armRoot);

  // 基座转台
  armRoot.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 18), M.dark, 0, 0.08, 0));
  armRoot.add(mesh(new THREE.TorusGeometry(0.46, 0.065, 8, 22), M.metal, 0, 0.3, 0));

  // yaw 关节：只绕 Y 转，负责把臂指向目标的水平方位
  const armYaw = new THREE.Group();
  armYaw.position.y = 0.32;
  armRoot.add(armYaw);
  armYaw.add(mesh(new THREE.SphereGeometry(0.33, 16, 12), M.metal, 0, 0.06, 0));

  // shoulder：绕 X 俯仰，臂段沿 +Z 生长（IK 就在这个平面上解）
  const armShoulder = new THREE.Group();
  armShoulder.position.y = 0.06;
  armYaw.add(armShoulder);

  armShoulder.add(mesh(cylZ(0.19, 0.23, ARM_L1, 14), M.white, 0, 0, ARM_L1 / 2));
  // 沿臂身三条细筋，让这根 6.8 米的杆子远看不是一根光溜溜的管子
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    armShoulder.add(
      mesh(
        cylZ(0.032, 0.032, ARM_L1 * 0.86, 6),
        M.truss,
        Math.cos(a) * 0.215,
        Math.sin(a) * 0.215,
        ARM_L1 / 2
      )
    );
  }

  const armElbow = new THREE.Group();
  armElbow.position.z = ARM_L1;
  armShoulder.add(armElbow);
  armElbow.add(mesh(new THREE.SphereGeometry(0.25, 16, 12), M.dark));
  armElbow.add(mesh(cylZ(0.14, 0.175, ARM_L2, 12), M.white, 0, 0, ARM_L2 / 2));

  // 腕部 + 夹爪：两片金色钳口，抓住之后往中间合
  const armWrist = new THREE.Group();
  armWrist.position.z = ARM_L2;
  armElbow.add(armWrist);
  armWrist.add(mesh(cylZ(0.2, 0.18, 0.28, 14), M.dark));
  armWrist.add(mesh(new THREE.SphereGeometry(0.16, 14, 10), M.metal, 0, 0, 0.18));

  const grippers = [];
  for (const s of [-1, 1]) {
    const jawGroup = new THREE.Group();
    jawGroup.position.set(0, s * 0.1, 0.28);
    const jaw = box(0.15, 0.09, 0.5, M.gold, 0, s * 0.06, 0.22);
    jaw.rotation.x = s * 0.3;
    jawGroup.add(jaw);
    armWrist.add(jawGroup);
    grippers.push({ group: jawGroup, s });
  }

  /* ---- 二连杆解析 IK --------------------------------------------------- */
  const _armD = new THREE.Vector3();
  const _armTip = new THREE.Vector3();
  const ARM_MIN = Math.abs(ARM_L1 - ARM_L2) + 0.05;
  const ARM_MAX = ARM_L1 + ARM_L2 - 0.05;

  /**
   * 基座先绕 Y 转向目标，再在臂平面内解两段俯仰，末端正好落在 target 上。
   * 返回的 out 是末端在站体坐标系里的位置 —— 飞船捕获之后就跟着它走，
   * 这样臂和船绝不会脱节。
   */
  function solveArm(target, out) {
    _armD.copy(target).sub(ARM_BASE);
    const horizontal = Math.hypot(_armD.x, _armD.z);
    const yaw = Math.atan2(_armD.x, _armD.z);

    // 臂平面内：前向 = 水平距离，向上 = y
    const dist = THREE.MathUtils.clamp(Math.hypot(horizontal, _armD.y), ARM_MIN, ARM_MAX);
    const gamma = Math.atan2(_armD.y, horizontal);

    const cosA = (dist * dist + ARM_L1 * ARM_L1 - ARM_L2 * ARM_L2) / (2 * dist * ARM_L1);
    const cosB = (ARM_L1 * ARM_L1 + ARM_L2 * ARM_L2 - dist * dist) / (2 * ARM_L1 * ARM_L2);

    // 取「肘部上翘」的那组解（加号），弯曲方向才像真实的机械臂
    const t1 = gamma + Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
    const t2 = -(Math.PI - Math.acos(THREE.MathUtils.clamp(cosB, -1, 1)));

    armYaw.rotation.y = yaw;
    armShoulder.rotation.x = -t1;
    armElbow.rotation.x = -t2;

    _armTip.set(
      0,
      ARM_L1 * Math.sin(t1) + ARM_L2 * Math.sin(t1 + t2),
      ARM_L1 * Math.cos(t1) + ARM_L2 * Math.cos(t1 + t2)
    );
    _armTip.applyAxisAngle(AXIS_Y, yaw).add(ARM_BASE);
    if (out) out.copy(_armTip);
    return _armTip;
  }

  /* ---- airlock + EVA --------------------------------------------------- */
  const airlock = new THREE.Group();
  airlock.position.set(-11.0, 2.95, 0);
  group.add(airlock);
  airlock.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.9, 18), M.hull2, 0, 0.35, 0));
  airlock.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 18), M.dark, 0, 0.86, 0));

  const astronaut = new THREE.Group();
  astronaut.visible = false;
  group.add(astronaut);
  {
    const suit = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.62, metalness: 0.12 });
    const visor = new THREE.MeshStandardMaterial({
      color: 0x0a0d12,
      roughness: 0.16,
      metalness: 0.9,
      emissive: 0xffc27a,
      emissiveIntensity: 0.55,
    });
    const torso = mesh(new THREE.CapsuleGeometry(0.3, 0.55, 6, 12), suit, 0, 0, 0);
    astronaut.add(torso);
    astronaut.add(mesh(new THREE.SphereGeometry(0.28, 16, 12), suit, 0, 0.62, 0));
    const face = mesh(new THREE.SphereGeometry(0.2, 14, 10), visor, 0, 0.63, 0.14);
    face.scale.set(1, 0.82, 0.7);
    astronaut.add(face);
    astronaut.add(box(0.5, 0.62, 0.24, M.white, 0, 0.02, -0.32));
    for (const s of [1, -1]) {
      const arm = mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), suit, s * 0.36, 0.02, 0.03);
      arm.rotation.z = s * 0.5;
      astronaut.add(arm);
      const leg = mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), suit, s * 0.16, -0.62, 0);
      leg.rotation.z = s * 0.12;
      astronaut.add(leg);
    }
    astronaut.scale.setScalar(1.15);
  }

  const EVA_START = new THREE.Vector3(-11.0, 4.1, 0);
  const evaCurve = new THREE.CatmullRomCurve3([
    EVA_START.clone(),
    new THREE.Vector3(-11.0, 5.6, 0.6),
    new THREE.Vector3(-8.6, 7.2, 2.4),
    new THREE.Vector3(-5.6, 8.0, 3.6),
    new THREE.Vector3(-2.4, 8.2, 4.4),
  ]);

  const tetherGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tether = new THREE.Line(
    tetherGeo,
    new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.75 })
  );
  tether.visible = false;
  group.add(tether);

  /* ---- RCS thrusters --------------------------------------------------- */
  const rcsGroup = new THREE.Group();
  group.add(rcsGroup);
  const rcsPorts = [];
  const rcsPuffs = [];
  const puffMat = new THREE.SpriteMaterial({
    color: 0xbfd8ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  for (const x of [-19.0, 6.4, 9.2]) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const p = new THREE.Vector3(x, Math.sin(a) * 3.1, Math.cos(a) * 3.1);
      rcsPorts.push(p);
      rcsGroup.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.3, 8), M.dark, p.x, p.y, p.z));
      for (let k = 0; k < 2; k++) {
        const s = new THREE.Sprite(puffMat.clone());
        s.visible = false;
        s.scale.setScalar(1.4);
        group.add(s);
        rcsPuffs.push({ sprite: s, life: 0, dir: p.clone().normalize() });
      }
    }
  }

  function fireRCS(index, strength = 1) {
    const port = rcsPorts[index % rcsPorts.length];
    for (const p of rcsPuffs) {
      if (p.life > 0) continue;
      p.life = 0.42 * strength;
      p.sprite.position.copy(port);
      p.sprite.visible = true;
      break;
    }
  }

  /* ---- state ------------------------------------------------------------ */
  // 对接位置：船头（模型 +X 方向 5.89）正好顶到 dock 环的接合面（x ≈ -22.4）
  const PORT = new THREE.Vector3(-28.2, 0, 0);
  const PARK = new THREE.Vector3(-66, 0, 0);
  // 捕获位：飞船先自主飞到这儿减速停稳，剩下的交给机械臂
  const CAPTURE = new THREE.Vector3(-34.2, 0, 0);
  // 抓取点相对飞船原点（站体坐标）：船头顶面靠前一点，相当于抓取杆的位置
  const GRAB_OFF = new THREE.Vector3(0, 0.9, 2.4);
  // 机械臂收纳姿态（末端目标）
  const ARM_STOW = new THREE.Vector3(-20.4, 5.6, 2.6);
  // nose along +X, arrays rolled into the sun plane (panel normal +Z)
  const SHIP_YAW = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0)
    )
  );

  const state = {
    deploy: 1,
    evaT: 0,
    dockT: 0,
    ringSpeed: 1,
    track: 0, // 0 = 固定角，1 = 自动对日
    attitude: { x: 0, y: 0, z: 0 },
    attitudeVel: { x: 0, y: 0, z: 0 },
  };

  let deployGoal = 1;
  let evaGoal = 0;
  let dockGoal = 0;
  let trackGoal = 0;
  let attReset = false;

  // 太阳方向（世界坐标），由 main 每帧喂进来；默认值和主光的初始方向一致
  const sunWorld = new THREE.Vector3(0.42, 0.3, 0.86).normalize();

  function setDeploy(v) {
    deployGoal = clamp01(v);
  }
  function setSunTrack(v) {
    trackGoal = clamp01(v);
  }
  function setEVA(v) {
    evaGoal = clamp01(v);
  }
  function setDocked(v) {
    dockGoal = clamp01(v);
  }
  function setRingSpeed(v) {
    state.ringSpeed = v;
  }
  // 一键回正：清掉角速度，姿态平滑归零
  function resetAttitude() {
    attReset = true;
    state.attitudeVel.x = 0;
    state.attitudeVel.y = 0;
    state.attitudeVel.z = 0;
  }

  const _armGoal = new THREE.Vector3();
  const _armTipPos = new THREE.Vector3();
  const _grabAtCapture = new THREE.Vector3();
  const _grabAtDock = new THREE.Vector3();
  let grip = 0;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const tmpQ = new THREE.Quaternion();
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const _sunLocal = new THREE.Vector3();
  const _proj = new THREE.Vector3();
  const _cross = new THREE.Vector3();
  const _invQ = new THREE.Quaternion();

  function update(dt, t, sunDir) {
    /* rings */
    ringMid.rotation.x += dt * 0.3 * state.ringSpeed * (0.35 + 0.65 * state.deploy);
    ringFore.rotation.x -= dt * 0.55 * state.ringSpeed * (0.35 + 0.65 * state.deploy);
    ringAft.rotation.x += dt * 0.47 * state.ringSpeed * (0.35 + 0.65 * state.deploy);
    ringTail.rotation.x += dt * 0.19 * state.ringSpeed;

    /* deploy —— 展开 / 折叠：每段绕铰链回折，e = 0 时整列叠在根部铰链上 */
    state.deploy += THREE.MathUtils.clamp(deployGoal - state.deploy, -dt * 0.55, dt * 0.55);
    const e = smooth(state.deploy);
    const fold = 1 - e;
    for (const a of arrays) {
      for (let i = 1; i < a.segs.length; i++) {
        const s = a.segs[i];
        s.rotation.x = (i % 2 ? 1 : -1) * fold * FOLD_ANGLE;
        s.position.z = fold * i * 0.18;
      }
    }

    /* 自动对日：每片翼绕自己的展开轴转，让板面法线尽量指向太阳。
       因为展开轴是固定的，能达到的法线是一个圆，所以取太阳方向在该圆
       所在平面上的投影 —— 这就是单轴太阳翼真实的跟踪方式。 */
    if (sunDir) sunWorld.copy(sunDir).normalize();
    state.track += THREE.MathUtils.clamp(trackGoal - state.track, -dt * 0.9, dt * 0.9);
    if (state.track > 0.0005 || trackGoal > 0.0005) {
      _invQ.copy(group.quaternion).invert();
      _sunLocal.copy(sunWorld).applyQuaternion(_invQ).normalize();
      for (const a of arrays) {
        let target = 0;
        if (trackGoal > 0.0005) {
          _proj.copy(_sunLocal).addScaledVector(a.axis, -_sunLocal.dot(a.axis));
          if (_proj.lengthSq() > 1e-5) {
            _proj.normalize();
            _cross.crossVectors(a.normal0, _proj);
            target = Math.atan2(_cross.dot(a.axis), a.normal0.dot(_proj));
          }
        }
        a.rotY += (target - a.rotY) * Math.min(1, dt * 2.2);
        a.segs[0].rotation.y = a.rotY;
      }
    }

    /* attitude */
    if (attReset) {
      let settled = true;
      const k2 = Math.min(1, dt * 2.4);
      for (const k of ['x', 'y', 'z']) {
        state.attitude[k] += (0 - state.attitude[k]) * k2;
        if (Math.abs(state.attitude[k]) < 0.0025) state.attitude[k] = 0;
        else settled = false;
      }
      if (settled) attReset = false;
    } else {
      for (const k of ['x', 'y', 'z']) {
        state.attitude[k] += state.attitudeVel[k] * dt;
        state.attitudeVel[k] *= Math.pow(0.05, dt);
        state.attitude[k] = THREE.MathUtils.clamp(state.attitude[k], -0.34, 0.34);
      }
    }
    group.rotation.set(state.attitude.x, state.attitude.y, state.attitude.z);

    /* EVA */
    state.evaT += THREE.MathUtils.clamp(evaGoal - state.evaT, -dt * 0.32, dt * 0.32);
    astronaut.visible = state.evaT > 0.001;
    if (astronaut.visible) {
      const p = evaCurve.getPointAt(clamp01(state.evaT));
      astronaut.position.copy(p);
      // face the module while heading out
      astronaut.rotation.y = Math.PI * 0.5 * state.evaT + Math.sin(t * 0.4) * 0.1;
      astronaut.rotation.z = Math.sin(t * 0.6) * 0.05;
      const anchor = tmpA.copy(EVA_START).add(tmpB.set(0, -0.5, 0));
      const curveP = p;
      const mid = new THREE.Vector3().addVectors(anchor, curveP).multiplyScalar(0.5);
      mid.y -= 1.1;
      tetherGeo.setFromPoints([anchor, mid, curveP]);
      tether.visible = true;
      tether.material.opacity = 0.55 + 0.15 * Math.sin(t * 2);
    } else {
      tether.visible = false;
    }

    /* docking —— 自主接近 → 机械臂捕获 → 拖曳靠港 */
    state.dockT += THREE.MathUtils.clamp(dockGoal - state.dockT, -dt * 0.26, dt * 0.26);
    const d = clamp01(state.dockT);

    // 三段进度：接近 0~0.5、伸臂 0.5~0.64、拖曳 0.64~1
    const tShip = clamp01(d / 0.5);
    const tReach = clamp01((d - 0.5) / 0.14);
    const tPull = clamp01((d - 0.64) / 0.36);

    _grabAtCapture.copy(CAPTURE).add(GRAB_OFF);
    _grabAtDock.copy(PORT).add(GRAB_OFF);

    // 末端目标：先伸到捕获点，再随船一起被拖回对接口
    if (tPull > 0) _armGoal.lerpVectors(_grabAtCapture, _grabAtDock, smooth(tPull));
    else _armGoal.lerpVectors(ARM_STOW, _grabAtCapture, smooth(tReach));
    solveArm(_armGoal, _armTipPos);

    // 夹爪：臂伸到位之后才合拢，分离时倒序松开
    const gripGoal = d > 0.62 && d < 0.995 ? 1 : 0;
    grip += (gripGoal - grip) * Math.min(1, dt * 7);
    for (const gr of grippers) gr.group.position.y = gr.s * (0.1 + (1 - grip) * 0.22);

    if (shipDock) {
      if (tPull > 0) {
        // 捕获之后飞船完全跟着臂末端走，两者绝不会脱节
        tmpA.copy(_armTipPos).sub(GRAB_OFF);
      } else if (d <= 0.5) {
        // 自主接近：easeOutCubic 让末端速度归零 —— 是「减速停下」而不是撞上去
        const ease = 1 - Math.pow(1 - tShip, 3);
        tmpA.lerpVectors(PARK, CAPTURE, ease);
        tmpA.y += Math.sin(tShip * Math.PI) * 0.9;
        tmpA.z += Math.sin(tShip * Math.PI) * 1.4;
      } else {
        // 臂正在伸过来，船已经在捕获位停稳等着
        tmpA.copy(CAPTURE);
      }

      // the approach corridor rides with the station's attitude
      tmpA.applyQuaternion(group.quaternion).add(group.position);
      shipDock.group.position.copy(tmpA);
      q.copy(SHIP_YAW).multiply(tmpQ.setFromAxisAngle(AXIS_X, (1 - smooth(d)) * 0.05));
      shipDock.group.quaternion.copy(group.quaternion).multiply(q);
    }

    /* RCS + beacons */
    for (const p of rcsPuffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = Math.max(p.life / 0.42, 0);
      p.sprite.material.opacity = k * 0.7;
      p.sprite.scale.setScalar(0.9 + (1 - k) * 2.2);
      p.sprite.position.addScaledVector(p.dir, dt * 3.4);
      if (p.life <= 0) p.sprite.visible = false;
    }
    const blink = (Math.sin(t * 2.4) > 0.82 ? 1 : 0.22) * 1.0;
    for (let i = 0; i < beacons.length; i++) {
      beacons[i].scale.setScalar(0.7 + blink * 0.5 + (i % 2) * 0.05);
    }
    const dl = Math.sin(t * 3.2) > 0.4 ? 1 : 0.25;
    dockLights.forEach((l, i) => l.scale.setScalar(0.7 + dl * (i % 2 ? 0.5 : 0.3)));

    /* 等离子射流：外鞘轻微脉动，等离子团顺着射流漂移 */
    for (const p of plumes) {
      if (p.puff) {
        const u = (t * p.speed + p.phase) % 1;
        p.puff.position.x = p.x + u * p.len;
        p.puff.scale.setScalar(p.rad * (1.15 + u * 0.75));
        p.mat.opacity = p.op * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(t * 17 + p.seed));
      } else if (p.sprite) {
        p.sprite.material.opacity =
          p.op * (0.74 + 0.15 * Math.sin(t * 21 + p.seed) + 0.07 * Math.sin(t * 47 + p.seed * 2.3));
      } else {
        const f = 0.9 + 0.055 * Math.sin(t * 13 + p.seed) + 0.03 * Math.sin(t * 31 + p.seed * 1.7);
        const rr = 1 + 0.05 * Math.sin(t * 17 + p.seed * 0.7);
        p.mesh.scale.set(f, rr, rr);
        p.mat.opacity = p.op * (0.85 + 0.15 * Math.sin(t * 23 + p.seed * 1.3));
      }
    }
  }

  return {
    group,
    state,
    update,
    fireRCS,
    dockPort: dock,
    setDeploy,
    setSunTrack,
    setEVA,
    setDocked,
    setRingSpeed,
    resetAttitude,
    launchPort,
  };
}
