import * as THREE from 'three';
import { solarTexture, radiatorTexture } from './textures.js';

/* ------------------------------------------------------------- helpers */

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cylZ(r1, r2, len, seg = 20, open = false) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return g;
}

function cylX(r1, r2, len, seg = 12, open = false) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open);
  g.rotateZ(Math.PI / 2);
  return g;
}

/** run fn(+1) and fn(-1) so every model is mirror-symmetric */
function sym(fn) {
  fn(1);
  fn(-1);
}

/** array blade, folded into `segs` panels stacked along Z (thin in X) */
function bladeZ(len, height, segs, M, y = 0, z = 0, x = 0) {
  const g = new THREE.Group();
  const gap = 0.1;
  const segL = (len - gap * (segs - 1)) / segs;
  for (let i = 0; i < segs; i++) {
    const zc = z - len / 2 + segL / 2 + i * (segL + gap);
    g.add(box(0.05, height + 0.14, segL + 0.09, M.metal, x, y, zc));
    for (const sx of [1, -1]) g.add(box(0.03, height, segL, M.solar, x + sx * 0.036, y, zc));
    if (i < segs - 1) g.add(box(0.09, 0.09, gap, M.metal, x, y + height / 2, zc + segL / 2 + gap / 2));
  }
  return g;
}

/** array blade, panels stacked along Y (thin in X) */
function bladeY(len, width, segs, M, y = 0, z = 0, x = 0) {
  const g = new THREE.Group();
  const gap = 0.1;
  const segL = (len - gap * (segs - 1)) / segs;
  for (let i = 0; i < segs; i++) {
    const yc = y - len / 2 + segL / 2 + i * (segL + gap);
    g.add(box(0.05, segL + 0.09, width + 0.14, M.metal, x, yc, z));
    for (const sx of [1, -1]) g.add(box(0.03, segL, width, M.solar, x + sx * 0.036, yc, z));
    if (i < segs - 1) g.add(box(0.09, gap, 0.09, M.metal, x, yc + segL / 2 + gap / 2, z + width / 2));
  }
  return g;
}

/* ----------------------------------------------------------- materials */

function makeMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.6, metalness: 0.2 }),
    body2: new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.4, metalness: 0.88 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.5, metalness: 0.72 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc99b42, roughness: 0.28, metalness: 1.0 }),
    solar: new THREE.MeshStandardMaterial({
      map: solarTexture(),
      color: 0xe9eefb,
      roughness: 0.42,
      metalness: 0.5,
      emissive: 0x15294d,
      emissiveIntensity: 0.36,
      side: THREE.DoubleSide,
    }),
    rad: new THREE.MeshStandardMaterial({ map: radiatorTexture(), color: 0xf1f1ec, roughness: 0.62, metalness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0d1016,
      emissive: 0xffab52,
      emissiveIntensity: 1.1,
      roughness: 0.18,
      metalness: 0.6,
    }),
    engine: new THREE.MeshStandardMaterial({
      color: 0x120a04,
      emissive: 0xff7a2a,
      emissiveIntensity: 1.6,
      roughness: 0.9,
    }),
    beacon: new THREE.MeshBasicMaterial({ color: 0x8ef2ff }),
  };
}

/* ------------------------------------------------------------- styles */

/* A: "Starlink"-style broadband platform (one long blade array aft) */
function styleStarlink(M) {
  const g = new THREE.Group();

  g.add(box(1.35, 0.8, 2.0, M.body, 0, 0, 0.15)); // bus core
  // phased-array faces, one on each flank (thin in X -> faces the sun once yawed)
  sym((s) => g.add(box(0.05, 0.66, 1.72, M.dark, s * 0.69, 0, 0.12)));
  g.add(box(1.24, 0.26, 0.86, M.gold, 0, 0.44, -0.42)); // MLI blanket
  sym((s) => g.add(box(1.42, 0.1, 0.12, M.body2, 0, s * 0.42, -0.8)));

  // laser cross-link terminals
  sym((s) => {
    g.add(box(0.2, 0.22, 0.2, M.body2, s * 0.5, 0.5, 0.42));
    g.add(box(0.1, 0.1, 0.1, M.glass, s * 0.5, 0.62, 0.42));
  });

  // one long deployable array aft: straight, flat, vertical blade
  const L = 4.8;
  const wing = new THREE.Group();
  wing.add(bladeZ(L, 2.3, 3, M, 0, -0.42 - L / 2));
  wing.add(box(0.16, 0.16, 0.34, M.metal, 0, 0, -0.24)); // hinge drum
  sym((s) => wing.add(box(0.1, 0.1, 0.55, M.body2, 0, s * 0.16, -0.5)));
  g.add(wing);

  return g;
}

/* B: cylindrical comms satellite with two long paddles + dish */
function styleProbe(M) {
  const g = new THREE.Group();

  g.add(new THREE.Mesh(cylZ(0.52, 0.52, 1.9, 22), M.body));
  g.add(box(0.95, 0.95, 0.55, M.dark, 0, 0, -0.35)); // equipment bay
  sym((s) => g.add(box(0.1, 0.62, 0.62, M.gold, s * 0.5, 0, 0.25)));

  // collars
  sym((s) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.05, 8, 22), M.body2);
    band.position.z = s * 0.7;
    g.add(band);
  });

  // two long paddles, mirror symmetric, standing in the sun plane
  sym((s) => {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.0, 8), M.body2);
    boom.position.set(0, s * 1.05, 0);
    g.add(boom);
    const H = 2.6;
    const yc = s * (1.55 + H / 2);
    g.add(bladeY(H, 1.2, 2, M, yc, 0, 0));
  });

  // dish forward
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.72, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.44), M.rad);
  dish.rotation.x = -Math.PI / 2;
  dish.position.z = 1.15;
  g.add(dish);
  g.add(box(0.06, 0.06, 0.4, M.body2, 0, 0, 1.35));

  return g;
}

/* C: nose-docking shuttle —— 前部对接口、加压舱、横向模块、双太阳翼 */
function styleShuttle(M) {
  const g = new THREE.Group();

  const tube = (r1, r2, len, mat, z, seg = 20, open = false) => {
    const m = new THREE.Mesh(cylZ(r1, r2, len, seg, open), mat);
    m.position.z = z;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  /* ---- 尾段服务舱 + 双主发动机 ---- */
  g.add(tube(0.52, 0.6, 0.6, M.body2, -1.5));
  g.add(tube(0.34, 0.52, 0.34, M.dark, -1.94));
  sym((s) => {
    const noz = new THREE.Mesh(cylZ(0.15, 0.23, 0.34, 12, true), M.dark);
    noz.position.set(s * 0.2, 0, -2.12);
    g.add(noz);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), M.engine);
    glow.position.set(s * 0.2, 0, -2.27);
    glow.rotation.y = Math.PI;
    g.add(glow);
  });

  /* ---- 主加压舱 ---- */
  g.add(tube(0.52, 0.52, 1.9, M.body, -0.45));
  g.add(tube(0.545, 0.545, 0.18, M.gold, -1.12));
  g.add(tube(0.545, 0.545, 0.1, M.dark, 0.14));
  for (const z of [-1.34, -0.72, -0.1]) g.add(tube(0.55, 0.55, 0.07, M.body2, z));

  /* ---- 横向模块：上下各伸出一段，末端带舷窗 ---- */
  sym((s) => {
    const arm = new THREE.Mesh(cylZ(0.22, 0.22, 0.9, 14), M.body);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, s * 0.72, -0.22);
    arm.castShadow = true;
    g.add(arm);
    const cap = new THREE.Mesh(cylZ(0.235, 0.235, 0.09, 14), M.body2);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, s * 1.2, -0.22);
    g.add(cap);
    g.add(box(0.14, 0.06, 0.14, M.glass, 0, s * 1.24, -0.22));
    // 模块根部的金毯
    g.add(box(0.4, 0.1, 0.34, M.gold, 0, s * 0.5, -0.22));
  });

  /* ---- 前对接节点 ---- */
  g.add(tube(0.44, 0.5, 0.5, M.body2, 0.68));
  g.add(tube(0.4, 0.4, 0.12, M.gold, 0.95));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    g.add(box(0.1, 0.1, 0.06, M.glass, Math.cos(a) * 0.43, Math.sin(a) * 0.43, 0.72));
  }

  /* ---- 前对接口：环 + 四片锁瓣 + 探头 + 导引光环 ---- */
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.055, 8, 24), M.body2);
  collar.position.z = 1.05;
  g.add(collar);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const petal = box(0.2, 0.065, 0.16, M.body2, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 1.06);
    petal.rotation.z = a;
    g.add(petal);
  }
  const guide = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.014, 6, 28), M.beacon);
  guide.position.z = 1.12;
  g.add(guide);
  g.add(tube(0.075, 0.13, 0.28, M.body2, 1.2));
  g.add(box(0.11, 0.11, 0.05, M.beacon, 0, 0, 1.35));

  /* ---- 双太阳翼（沿 ±X 展开）---- */
  sym((s) => {
    g.add(box(0.72, 0.07, 0.07, M.body2, s * 0.82, 0, -0.5));
    g.add(box(0.16, 0.22, 0.22, M.dark, s * 0.52, 0, -0.5));
    g.add(box(1.92, 0.99, 0.035, M.body2, s * 2.12, 0, -0.52));
    g.add(box(1.86, 0.92, 0.045, M.solar, s * 2.12, 0, -0.5));
    for (const k of [-1, 1]) g.add(box(1.86, 0.03, 0.05, M.body2, s * 2.12, k * 0.31, -0.5));
  });

  /* ---- 天线 + 航行灯 ---- */
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), M.body2);
  dish.position.set(0, 0.34, 0.8);
  dish.rotation.x = -Math.PI / 2.5;
  g.add(dish);
  g.add(box(0.05, 0.14, 0.05, M.beacon, -0.5, 0.5, 0.2));
  g.add(box(0.05, 0.14, 0.05, M.beacon, 0.5, -0.5, 0.2));

  return g;
}

/* D: orbital work ship (boxy bus, twin long arrays, robot arm) */
function styleOrbiter(M) {
  const g = new THREE.Group();

  g.add(box(1.45, 1.05, 2.9, M.body, 0, 0, 0));
  g.add(box(1.5, 0.12, 0.55, M.gold, 0, 0.5, 0.85));
  g.add(box(1.5, 0.1, 2.95, M.body2, 0, -0.55, 0));
  g.add(box(0.62, 0.18, 0.55, M.glass, 0, 0.44, 1.12));

  const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.9, 4), M.body);
  noseCone.rotation.x = Math.PI / 2;
  noseCone.rotation.y = Math.PI / 4;
  noseCone.scale.set(1, 1, 0.8);
  noseCone.position.z = 1.9;
  g.add(noseCone);

  // twin long arrays, standing above and below the hull
  sym((s) => {
    g.add(box(0.12, 0.95, 0.12, M.body2, 0, s * 0.9, 0));
    const H = 2.2;
    const L = 3.0;
    const arr = new THREE.Group();
    arr.add(bladeZ(L, H, 2, M, 0, 0));
    arr.position.set(0, s * (1.35 + H / 2), 0);
    g.add(arr);
  });

  // radiator fin
  g.add(box(0.05, 0.85, 1.25, M.rad, 0, 0.85, -0.55));
  g.add(box(0.9, 0.05, 1.0, M.rad, 0, -0.72, -0.4));

  // small robot arm on the side
  const arm = new THREE.Group();
  arm.position.set(0.75, 0.2, 0.9);
  arm.rotation.z = -0.5;
  arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 8), M.body2));
  g.add(arm);

  // nozzle
  const noz = new THREE.Mesh(cylZ(0.36, 0.52, 0.6, 16, true), M.dark);
  noz.position.z = -1.72;
  g.add(noz);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), M.engine);
  glow.position.z = -1.95;
  glow.rotation.y = Math.PI;
  g.add(glow);

  return g;
}

const STYLES = {
  starlink: { label: '星链平台', build: styleStarlink, scale: 1.15 },
  probe: { label: '通信卫星', build: styleProbe, scale: 1.0 },
  shuttle: { label: '小型穿梭机', build: styleShuttle, scale: 1.05 },
  orbiter: { label: '轨道作业船', build: styleOrbiter, scale: 1.05 },
};

/* ------------------------------------------------------------- factory */

export function createSatellite(style, M) {
  const def = STYLES[style] || STYLES.starlink;
  const g = new THREE.Group();

  const body = def.build(M);
  body.scale.setScalar(def.scale);
  g.add(body);

  const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), M.beacon);
  b.position.set(0.0, 0.52, 0.55);
  g.add(b);
  g.userData.beacon = b;
  g.scale.setScalar(FLEET_SCALE);
  return g;
}

/* --------------------------------------------------------------- fleet */

const SLOT_START = 152; // 队首离空间站尾部的弧长距离，留出明显的空档
const SLOT_GAP = 12;
const FLEET_SCALE = 1.6; // 单机整体尺寸
const MAX_SLOTS = 24;

export function createFleet({
  count = 11,
  style = 'starlink',
  radius = 0,
  orbitR = 0,
  gap = SLOT_GAP,
  /** true = 沿轨道按间距排布一圈（轨道星链）：间距 = 周长/数量 时恰好均布整圈，
   *  间距调小则聚成一团（最小 0 = 全部叠在队首一点）。 */
  ring = false,
  /** 远处轨道不投影，省掉一整个 shadow pass */
  castShadow = true,
} = {}) {
  const group = new THREE.Group();
  const M = makeMaterials();

  // The queue follows the orbit line itself: each craft is placed at its arc
  // angle and yawed onto the local tangent, so the column traces the track
  // instead of running along the station's straight axis.
  const k = orbitR > 0 && radius > 0 ? radius / orbitR : 0; // sin(alpha)
  const c = Math.sqrt(Math.max(1 - k * k, 0)); // cos(alpha)
  const arcAxis = new THREE.Vector3(0, c, -k).normalize();
  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

  /**
   * 绕行进轴滚转 90°。模型里太阳翼的法线是 +X、长边沿 +Z（行进方向），
   * 所以不滚的时候翼面是「立」着的（法线水平）。滚 90° 后法线转到模型 +Y，
   * 而 +Y 本来就贴着当地垂线，于是翼面正好躺平、与地表平行 —— 长边依旧是
   * 水平方向，不受影响。
   */
  const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

  // one single file — every craft on the same line, same altitude
  const slots = [];
  const escorts = [];
  let slotGap = gap;
  let currentStyle = style;

  /**
   * 轨道星链的光点层：远处几百上千单位外的卫星只有 1~2 像素，
   * 再亮的金属外壳也会混进星空。这里叠一层固定像素大小的加色光点
   * （sizeAttenuation=false，不随距离缩小），轨道上就始终是一串可辨的点。
   * 近处光点会被卫星本体遮住，不影响细节。
   */
  const POINTS_MAX = MAX_SLOTS;
  let marker = null;
  if (ring) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POINTS_MAX * 3), 3));
    geo.setDrawRange(0, 0);
    marker = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xa8ecff,
        size: 2.8,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    // 点的坐标每帧都可能变（增删卫星），包围球交给 Three 只会算错
    marker.frustumCulled = false;
    marker.renderOrder = 3;
    group.add(marker);
  }

  function syncMarkers() {
    if (!marker) return;
    const arr = marker.geometry.attributes.position.array;
    const n = Math.min(slots.length, POINTS_MAX);
    for (let i = 0; i < n; i++) {
      const p = slots[i].position;
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    marker.geometry.attributes.position.needsUpdate = true;
    marker.geometry.setDrawRange(0, n);
  }

  function place(slot, i, total) {
    // ring：从队首沿轨道按间距排（gap 单位与 radius 相同）；非 ring：沿轴往后排一段
    const s = ring ? i * slotGap : SLOT_START + i * slotGap;
    if (radius > 0) {
      const a = s / radius;
      const u = radius * (Math.cos(a) - 1);
      slot.position.set(radius * Math.sin(a), u * k, u * c);
      slot.quaternion.setFromAxisAngle(arcAxis, a).multiply(qYaw).multiply(qRoll);
    } else {
      slot.position.set(s, 0, 0);
      // 模型前方 +Z → 行进 +X，再绕行进轴滚转 90°
      slot.quaternion.copy(qYaw).multiply(qRoll);
    }
    slot.userData.phase = i * 1.1;
  }

  function placeAll() {
    const total = slots.length;
    slots.forEach((slot, i) => place(slot, i, total));
    syncMarkers();
  }

  function disposeGeom(node) {
    node.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  function fill(node) {
    while (node.children.length) {
      const old = node.children.pop();
      node.remove(old);
      disposeGeom(old);
    }
    const sat = createSatellite(currentStyle, M);
    if (!castShadow) {
      sat.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
    }
    node.add(sat);
  }

  function rebuild() {
    slots.forEach(fill);
  }

  /** 动态编队：增减小卫星数量、改变间距（gap 为场景单位） */
  function setLayout({ count: n, gap: g } = {}) {
    if (typeof g === 'number' && isFinite(g) && g !== slotGap) slotGap = Math.max(0, g);

    if (typeof n === 'number' && isFinite(n)) {
      const want = THREE.MathUtils.clamp(Math.round(n), 1, MAX_SLOTS);
      while (slots.length < want) {
        const slot = new THREE.Group();
        place(slot, slots.length, want);
        group.add(slot);
        slots.push(slot);
        fill(slot);
      }
      while (slots.length > want) {
        const slot = slots.pop();
        group.remove(slot);
        disposeGeom(slot);
      }
    }

    placeAll();
  }

  // 初始铺一排
  for (let i = 0; i < Math.min(count, MAX_SLOTS); i++) {
    const slot = new THREE.Group();
    place(slot, i, Math.min(count, MAX_SLOTS));
    group.add(slot);
    slots.push(slot);
    fill(slot);
  }
  placeAll();

  function setStyle(s) {
    if (!STYLES[s] || s === currentStyle) return;
    currentStyle = s;
    rebuild();
  }

  function update(dt, t) {
    slots.forEach((slot, i) => {
      const sat = slot.children[0];
      if (!sat) return;
      // no drift off the line — only a slow attitude wobble
      sat.rotation.y = Math.sin(t * 0.22 + slot.userData.phase) * 0.05;
      sat.rotation.z = Math.sin(t * 0.17 + slot.userData.phase * 1.3) * 0.03;

      const b = sat.userData.beacon;
      if (b) b.scale.setScalar(Math.sin(t * 2.6 + i * 1.9) > 0.4 ? 1.5 : 0.5);
    });
  }

  return {
    group,
    slots,
    escorts,
    update,
    setStyle,
    setLayout,
    style: () => currentStyle,
    count: () => slots.length,
    gap: () => slotGap,
    isRing: () => ring,
    maxSlots: MAX_SLOTS,
  };
}
