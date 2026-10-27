import * as THREE from 'three';
import { hullTexture, glowTexture } from './textures.js';

/* ---------------------------------------------------------------------------
   运载飞船：从地面发射场点火升空，拖着烟雾尾迹爬升，末段修正后
   与空间站腹部对接口完成对接。所有坐标都建在编队（convoy）坐标系里，
   这样飞船会跟着队列一起沿轨道移动。
   --------------------------------------------------------------------------- */

const UP = new THREE.Vector3(0, 1, 0);
const DOCK_Y = 6.35; // 模型对接口环所在的局部高度
const SHIP_SCALE = 1.4; // 视觉放大，和庞大的站体比例更协调

/* --------------------------------------------------------------- helpers */

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function smokeTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.34, 'rgba(240,246,255,0.52)');
  grd.addColorStop(0.7, 'rgba(206,220,238,0.15)');
  grd.addColorStop(1, 'rgba(188,204,226,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------- the craft */

function buildLauncher() {
  const group = new THREE.Group();
  const hullMap = hullTexture();

  const M = {
    hull: new THREE.MeshStandardMaterial({
      map: hullMap,
      bumpMap: hullMap,
      bumpScale: 0.025,
      color: 0xe7ebf2,
      roughness: 0.58,
      metalness: 0.2,
    }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.5, metalness: 0.15 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.46, metalness: 0.86 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8d97a4, roughness: 0.34, metalness: 0.95 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc99b3f, roughness: 0.32, metalness: 1.0 }),
    band: new THREE.MeshStandardMaterial({ color: 0x2f6fa8, roughness: 0.46, metalness: 0.42 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xcf7a33, roughness: 0.5, metalness: 0.4 }),
    win: new THREE.MeshStandardMaterial({
      color: 0x0a1420,
      emissive: 0x6fd0ff,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.1,
    }),
    navR: new THREE.MeshStandardMaterial({ color: 0x330404, emissive: 0xff3b30, emissiveIntensity: 3 }),
    navG: new THREE.MeshStandardMaterial({ color: 0x033313, emissive: 0x35ff8b, emissiveIntensity: 3 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xffb059, transparent: true, opacity: 0.8, depthWrite: false }),
  };

  /* ---- 主级箭体 0.55 → 4.15 --------------------------------------------- */
  group.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 3.0, 26), M.hull, 0, 2.65, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.26, 26), M.gold, 0, 1.55, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.2, 26), M.dark, 0, 3.62, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.12, 26), M.band, 0, 2.16, 0));
  for (const a of [0.6, 2.2, 3.9, 5.5]) {
    group.add(
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), M.metal, Math.cos(a) * 0.625, 2.65, Math.sin(a) * 0.625)
    );
  }

  /* ---- 尾裙 + 发动机 ---------------------------------------------------- */
  group.add(mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.62, 26), M.dark, 0, 0.86, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.44, 0.68, 0.52, 26, 1, true), M.metal, 0, 0.34, 0));
  const inner = mesh(new THREE.CircleGeometry(0.42, 24), M.fire, 0, 0.1, 0);
  inner.rotation.x = -Math.PI / 2;
  group.add(inner);

  /* ---- 货舱段 4.15 → 5.45 ---------------------------------------------- */
  group.add(mesh(new THREE.CylinderGeometry(0.84, 0.84, 1.3, 28), M.white, 0, 4.8, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 28), M.gold, 0, 4.28, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.1, 28), M.band, 0, 5.22, 0));
  for (const s of [1, -1]) {
    group.add(mesh(new THREE.BoxGeometry(0.06, 1.05, 0.62), M.dark, s * 0.84, 4.8, 0));
    group.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), M.win, s * 0.86, 5.0, 0.16));
    group.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), M.win, s * 0.86, 5.0, -0.16));
  }
  for (const s of [1, -1]) {
    group.add(mesh(new THREE.BoxGeometry(0.09, 1.15, 0.09), M.metal, 0, 4.8, s * 0.88));
    group.add(mesh(new THREE.BoxGeometry(0.42, 0.34, 0.2), M.accent, 0.52, 4.15, s * 0.6));
  }

  /* ---- 头部 / 对接口 5.45 → 6.5 ----------------------------------------- */
  group.add(mesh(new THREE.CylinderGeometry(0.52, 0.84, 0.62, 28), M.hull, 0, 5.76, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.28, 26), M.white, 0, 6.21, 0));
  const collar = mesh(new THREE.TorusGeometry(0.44, 0.09, 10, 30), M.metal, 0, DOCK_Y, 0);
  collar.rotation.x = Math.PI / 2;
  group.add(collar);
  group.add(mesh(new THREE.CylinderGeometry(0.09, 0.2, 0.3, 14), M.metal, 0, DOCK_Y + 0.14, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    group.add(
      mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), M.dark, Math.cos(a) * 0.36, DOCK_Y + 0.02, Math.sin(a) * 0.36)
    );
  }

  /* ---- 栅格舵 ----------------------------------------------------------- */
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = mesh(new THREE.BoxGeometry(0.66, 0.52, 0.07), M.metal, Math.cos(a) * 0.95, 5.86, Math.sin(a) * 0.95);
    fin.rotation.y = -a;
    fin.rotation.z = 0.06;
    group.add(fin);
    for (let k = 0; k < 3; k++) {
      const rib = mesh(
        new THREE.BoxGeometry(0.66, 0.03, 0.1),
        M.dark,
        Math.cos(a) * 0.95,
        5.86 + (k - 1) * 0.16,
        Math.sin(a) * 0.95
      );
      rib.rotation.y = -a;
      group.add(rib);
    }
  }

  /* ---- 尾翼 + 航行灯 ---------------------------------------------------- */
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = mesh(new THREE.BoxGeometry(0.62, 1.0, 0.07), M.dark, Math.cos(a) * 0.8, 1.05, Math.sin(a) * 0.8);
    fin.rotation.y = -a;
    fin.rotation.z = Math.cos(a) > 0 ? -0.1 : 0.1;
    group.add(fin);
  }
  group.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), M.navR, -0.82, 1.62, 0));
  group.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), M.navG, 0.82, 1.62, 0));

  /* ---- 捆绑助推 --------------------------------------------------------- */
  for (const s of [1, -1]) {
    const x = s * 0.94;
    group.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 2.3, 20), M.white, x, 2.0, 0));
    group.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.16, 20), M.band, x, 2.9, 0));
    group.add(mesh(new THREE.ConeGeometry(0.27, 0.62, 20), M.white, x, 3.46, 0));
    group.add(mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.34, 18), M.dark, x, 0.72, 0));
    const nozzle = mesh(new THREE.CircleGeometry(0.18, 18), M.fire, x, 0.54, 0);
    nozzle.rotation.x = -Math.PI / 2;
    group.add(nozzle);
    group.add(mesh(new THREE.BoxGeometry(0.3, 0.09, 0.09), M.metal, x * 0.72, 2.9, 0));
    group.add(mesh(new THREE.BoxGeometry(0.3, 0.09, 0.09), M.metal, x * 0.72, 1.2, 0));
  }

  /* ---- 天线 + 侧向推力器 ------------------------------------------------ */
  group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), M.metal, 0.2, 6.55, 0));
  group.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), M.metal, 0.2, 6.9, 0));
  for (const s of [1, -1]) {
    group.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), M.metal, s * 0.66, 3.95, 0));
  }

  return { group, M };
}

/* ------------------------------------------------------------------ main */

export function createLifter({ convoy, earthPos, earthRadius, port }) {
  const root = new THREE.Group();
  root.visible = false;

  const ship = buildLauncher();
  ship.group.scale.setScalar(SHIP_SCALE);
  root.add(ship.group);

  /* ---- 尾焰 ------------------------------------------------------------- */
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffb267,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1, 18, 1, true), flameMat);
  flame.rotation.x = Math.PI; // 锥尖朝下
  flame.position.y = -0.6;
  ship.group.add(flame);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(2.0),
      color: 0xffb26b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glow.position.y = -0.7;
  glow.scale.setScalar(3.2);
  ship.group.add(glow);

  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(1.6),
      color: 0xffd9a8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  flash.scale.setScalar(26);
  root.add(flash);

  /* ---- 烟雾粒子 --------------------------------------------------------- */
  const MAX = 340;
  const pos = new Float32Array(MAX * 3);
  const sizes = new Float32Array(MAX);
  const alphas = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const lifeMax = new Float32Array(MAX);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8000);

  const smokeMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: smokeTexture() },
      uColor: { value: new THREE.Color(0xdfe8f5) },
      uScale: { value: window.innerHeight || 900 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(-mv.z, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float a = tex.a * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, smokeMat);
  points.frustumCulled = false;
  root.add(points);

  /* ---- state ------------------------------------------------------------ */
  const info = {
    mode: 'idle', // idle | ascent | docked
    u: 0,
    dist: 0,
    phase: '待命',
    dock: new THREE.Vector3(),
  };

  let curve = null;
  let dockPos = new THREE.Vector3();
  let dockQuat = new THREE.Quaternion();
  let portUp = new THREE.Vector3(0, 1, 0);
  const duration = 12.5;
  let emitAcc = 0;
  let throttle = 0;
  let puffScale = 1;
  let flashT = 0;

  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpAxis = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpM = new THREE.Matrix4();
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();

  function buildPath() {
    convoy.updateWorldMatrix(true, false);

    const invQ = convoy.getWorldQuaternion(new THREE.Quaternion()).invert();
    const portWorld = port.getWorldPosition(new THREE.Vector3());
    const portWorldQ = port.getWorldQuaternion(new THREE.Quaternion());
    const portLocal = convoy.worldToLocal(portWorld.clone());
    const portLocalQ = invQ.multiply(portWorldQ); // 编队坐标系下的对接口姿态

    portUp = UP.clone().applyQuaternion(portLocalQ).normalize();
    const portDown = portUp.clone().negate();

    // 对接口环的接合面
    const mouth = portLocal.clone().addScaledVector(portDown, 2.1);
    dockPos.copy(mouth).addScaledVector(portUp, -DOCK_Y * SHIP_SCALE);

    xAxis.set(1, 0, 0).applyQuaternion(portLocalQ).normalize();
    yAxis.copy(portUp);
    zAxis.crossVectors(xAxis, yAxis).normalize();
    xAxis.crossVectors(yAxis, zAxis).normalize();
    dockQuat.setFromRotationMatrix(tmpM.makeBasis(xAxis, yAxis, zAxis));
    info.dock.copy(dockPos);

    // 地面发射点：地球中心指向站点的方向偏一个角度，得到一条斜升弹道
    const E = convoy.worldToLocal(earthPos.clone());
    const up = E.clone().negate().normalize();
    const lat = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x);
    if (lat.lengthSq() < 1e-4) lat.set(0, 0, 1).addScaledVector(up, -up.z);
    lat.normalize();

    const phi = 0.058;
    const dirS = up
      .clone()
      .multiplyScalar(Math.cos(phi))
      .addScaledVector(lat, Math.sin(phi))
      .normalize();
    const S = E.clone().addScaledVector(dirS, earthRadius + 0.5);

    const p1 = S.clone().addScaledVector(dirS, 15).addScaledVector(lat, 4);
    const p2 = S.clone().lerp(dockPos, 0.62).addScaledVector(lat, 13).addScaledVector(up, 5);
    const p3 = dockPos.clone().addScaledVector(portUp, -11).addScaledVector(lat, 2.6);

    curve = new THREE.CatmullRomCurve3([S, p1, p2, p3, dockPos.clone()], false, 'catmullrom', 0.35);
    curve.updateArcLengths();

    flash.position.copy(S).addScaledVector(dirS, 2.5);
  }

  function clearParticles() {
    for (let i = 0; i < MAX; i++) {
      life[i] = 0;
      alphas[i] = 0;
      sizes[i] = 0;
    }
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    emitAcc = 0;
  }

  function launch() {
    buildPath();
    info.mode = 'ascent';
    info.u = 0;
    info.phase = '点火升空';
    root.visible = true;
    ship.group.position.copy(curve.getPointAt(0));
    ship.group.quaternion.setFromUnitVectors(UP, curve.getTangentAt(0.001).normalize());
    throttle = 1;
    flashT = 1;
    flash.material.opacity = 0.85;
    clearParticles();
  }

  function spawn(p, dir, speed) {
    const i = cursor++ % MAX;
    const j = i * 3;
    pos[j] = p.x + (Math.random() - 0.5) * 1.1;
    pos[j + 1] = p.y + (Math.random() - 0.5) * 1.1;
    pos[j + 2] = p.z + (Math.random() - 0.5) * 1.1;
    const spread = 1.5;
    vel[j] = dir.x * speed + (Math.random() - 0.5) * spread;
    vel[j + 1] = dir.y * speed + (Math.random() - 0.5) * spread;
    vel[j + 2] = dir.z * speed + (Math.random() - 0.5) * spread;
    lifeMax[i] = 2.0 + Math.random() * 1.3;
    life[i] = lifeMax[i];
    sizes[i] = (2.2 + Math.random() * 1.6) * puffScale;
    alphas[i] = 0.5;
  }

  function updateParticles(dt) {
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const j = i * 3;
      if (life[i] <= 0) {
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }
      const drag = Math.pow(0.25, dt);
      vel[j] *= drag;
      vel[j + 1] *= drag;
      vel[j + 2] *= drag;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      const k = life[i] / lifeMax[i];
      sizes[i] += 3.6 * puffScale * dt;
      alphas[i] = Math.pow(k, 1.1) * 0.44;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  }

  function update(dt, t) {
    updateParticles(dt);

    // 发射闪光
    if (flashT > 0) {
      flashT = Math.max(0, flashT - dt * 0.9);
      flash.material.opacity = flashT * 0.8;
      flash.scale.setScalar(18 + (1 - flashT) * 26);
    }

    if (info.mode !== 'ascent') {
      flame.scale.set(0.001, 0.001, 0.001);
      glow.material.opacity = 0;
      return;
    }

    info.u = Math.min(1, info.u + dt / duration);
    const u = info.u;
    const k = smooth(u);

    const p = curve.getPointAt(k);
    const tan = curve.getTangentAt(Math.min(k, 0.9995)).normalize();
    ship.group.position.copy(p);

    // 朝向：沿弹道切向，末段混合到对接口姿态
    tmpQ.setFromUnitVectors(UP, tan);
    if (u > 0.7) {
      const b = smooth((u - 0.7) / 0.3);
      tmpQ.slerp(dockQuat, b);
    }
    ship.group.quaternion.copy(tmpQ);

    // 油门：入轨后收油，最后 4% 悬停贴靠
    if (u < 0.86) throttle = 1;
    else if (u < 0.96) throttle = 1 - ((u - 0.86) / 0.1) * 0.78;
    else throttle = 0.22 * (1 - (u - 0.96) / 0.04);

    const flameLen = 1.6 + throttle * 3.4 + Math.sin(t * 34) * 0.22 * throttle;
    flame.scale.set(0.7 + throttle * 0.5, Math.max(0.05, flameLen), 0.7 + throttle * 0.5);
    flame.position.y = -0.2 - flameLen * 0.5;
    flameMat.opacity = 0.25 + throttle * 0.55;
    glow.material.opacity = throttle * 0.9;
    glow.scale.setScalar(2.4 + throttle * 4.2 + Math.sin(t * 26) * 0.3);

    const shipUp = tmpAxis.copy(UP).applyQuaternion(ship.group.quaternion).normalize();

    // 烟雾：从喷管位置喷出，沿 -箭体轴向散开（收油门时烟团随之变小）
    puffScale = 0.42 + 0.58 * throttle;
    if (throttle > 0.15 && dt > 0 && u < 0.95) {
      emitAcc += 46 * throttle * dt;
      const nozzle = tmpV.copy(ship.group.position).addScaledVector(shipUp, -0.85);
      let guard = 0;
      while (emitAcc >= 1 && guard++ < 12) {
        emitAcc -= 1;
        spawn(nozzle, tmpDir.copy(shipUp).negate(), 3.2 + Math.random() * 2.4);
      }
      if (emitAcc > 4) emitAcc = 0;

      // 接地瞬间的滚滚浓烟
      if (u < 0.1) {
        const p0 = tmpV2.copy(ship.group.position).addScaledVector(shipUp, -2.5);
        spawn(
          p0,
          tmpDir.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2).normalize(),
          4 + Math.random() * 7
        );
      }
    }

    info.dist = ship.group.position.distanceTo(dockPos);

    if (u > 0.92) info.phase = '末段修正';
    else if (u > 0.35) info.phase = '上升段';
    else info.phase = '点火升空';

    if (u >= 1) {
      info.mode = 'docked';
      info.phase = '对接完成';
      info.dist = 0;
      ship.group.position.copy(dockPos);
      ship.group.quaternion.copy(dockQuat);
      flame.scale.set(0.001, 0.001, 0.001);
      glow.material.opacity = 0;
    }
  }

  function reset() {
    info.mode = 'idle';
    info.u = 0;
    info.dist = 0;
    info.phase = '待命';
    root.visible = false;
    clearParticles();
  }

  function resize(bufferHeight) {
    smokeMat.uniforms.uScale.value = bufferHeight;
  }

  return { group: root, ship: ship.group, info, launch, reset, resize, update };
}
