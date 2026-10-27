import * as THREE from 'three';
import { glowTexture, bandedPlanetTexture, ringTexture } from './textures.js';

/* ------------------------------------------------------------------ rng */

function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* --------------------------------------------------------------- stars */

function createStars() {
  const count = 9000;
  const R = 30000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);

  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const x = r * Math.cos(theta);
    const y = u;
    const z = r * Math.sin(theta);
    pos[i * 3] = x * R;
    pos[i * 3 + 1] = y * R;
    pos[i * 3 + 2] = z * R;

    const t = Math.random();
    if (t < 0.12) c.setRGB(0.65, 0.78, 1.0);
    else if (t < 0.28) c.setRGB(1.0, 0.9, 0.75);
    else c.setRGB(0.92, 0.95, 1.0);

    const bright = 0.35 + Math.pow(Math.random(), 3.2) * 1.9;
    col[i * 3] = c.r * bright;
    col[i * 3 + 1] = c.g * bright;
    col[i * 3 + 2] = c.b * bright;

    size[i] = 0.7 + Math.pow(Math.random(), 4) * 3.4;
    phase[i] = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.78 + 0.22 * sin(uTime * 1.7 + aPhase * 3.1);
        gl_PointSize = aSize * uPixelRatio * tw;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        float a = smoothstep(0.5, 0.02, r);
        a = pow(a, 1.7);
        gl_FragColor = vec4(vColor * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}

/* -------------------------------------------------------------- galaxy */

/**
 * 背景星系：一个扁平盘 + 两条对数螺线旋臂，全部用粒子搭出来。
 *
 * 为什么不再是贴图天球：贴图是等距圆柱投影，越靠两极拉伸越厉害，凑近看
 * 是一团糊掉的紫雾，而且完全没有「盘」的形状。粒子方案里每个点都是屏幕
 * 上一个一像素出头的小亮点，近看远看都锐利。
 *
 * 形状：
 *  · 半径方向按 r^1.35 采样，中心密、外缘疏，读起来才有核球
 *  · 不含旋臂：粒子沿盘面均匀铺开，靠径向亮度衰减收边，
 *    看上去是一团扁平的白色星云，而不是拧成螺旋的结构
 *  · 盘厚只有半径的 2%~4%，斜看才是一条细带，这就是「扁平」
 */
const GALAXY = {
  count: 68000,
  dist: 30000, // 盘心到默认机位的距离
  radius: 5400, // 盘半径
  // 盘面法线与视线夹角：给到 68° 才是“斜看一个盘子”，椭圆轮廓一眼可辨；
  // 再小就接近正视，扁平感消失
  tilt: 1.18,
  yaw: 0.9, // 绕盘轴转，决定盘面朝向落在画面哪一侧
  shiftRight: -0.52, // 盘心在画面里的偏移，单位是盘半径
  shiftUp: 1.42, // 抬到空间站上方那条空白天区，避开两侧面板与站体
  bulge: 0.022, // 核球占比
};

function createGalaxy({ origin, dir }) {
  const { count, radius: R, bulge } = GALAXY;

  const up0 = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up0).normalize();
  const camUp = new THREE.Vector3().crossVectors(right, dir).normalize();

  // 盘轴：从视线方向朝画面的「上」歪一点，于是我们看到一个椭圆盘而不是一条线
  const axis = dir
    .clone()
    .multiplyScalar(Math.cos(GALAXY.tilt))
    .addScaledVector(camUp, Math.sin(GALAXY.tilt))
    .normalize();

  const group = new THREE.Group();
  group.position
    .copy(origin)
    .addScaledVector(dir, GALAXY.dist)
    .addScaledVector(right, GALAXY.shiftRight * R)
    .addScaledVector(camUp, GALAXY.shiftUp * R);
  group.quaternion
    .setFromUnitVectors(up0, axis)
    .premultiply(new THREE.Quaternion().setFromAxisAngle(axis, GALAXY.yaw));
  group.renderOrder = -10;

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);

  const r0 = R * 0.05; // 螺线起始半径
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    let r;
    let theta;
    let thick;

    if (i < count * bulge) {
      /* 核球：密集、偏圆、微微压扁 */
      r = r0 * Math.abs(gauss()) * 1.6;
      theta = Math.random() * Math.PI * 2;
      thick = (0.34 + Math.random() * 0.3) * r;
    } else {
      const u = Math.random();
      // 没有旋臂之后，形状全靠密度分布来立：指数 1.35 让粒子从中心向外
      // 逐渐稀疏，看起来是一颗中心亮、边缘化开的椭圆星系，而不是一块均匀的灰噪点
      r = R * (0.05 + 0.95 * Math.pow(u, 1.35));
      thick = R * (0.012 + 0.026 * (1 - r / R)) * gauss();
      // 没有旋臂：方位角均匀撒开
      theta = Math.random() * Math.PI * 2;
    }

    const rr = r * (1 + gauss() * 0.022);
    pos[i * 3] = Math.cos(theta) * rr;
    pos[i * 3 + 1] = thick;
    pos[i * 3 + 2] = Math.sin(theta) * rr;

    /* 颜色基本是白的：核球偏暖一点、外缘偏冷一点，只差分毫，
       一旦给足饱和就变成“彩色星云”，那就不是银河了 */
    const t = rr / R;
    const warm = Math.max(0, 1 - t * 2.6);
    // 亮度压在泛光阈值（0.86）以下：超过它的点会被 UnrealBloom 二次放大，
    // 成千上万个点叠在一起就糊成一片白雾，旋臂和颗粒感同时消失。
    // 亮度靠“点的疏密”堆出来，不靠单点过曝。
    // 去掉旋臂后，整盘是均匀铺开的，单点亮度必须再压一档：
    // 6.8 万个点 additive 叠起来，只要每点亮一点，整盘就糊成一块白饼
    const armLight = 0.07 + Math.pow(Math.random(), 2.0) * 0.09;
    // 边缘一定要收到接近 0：没有旋臂之后，盘的轮廓全靠这层衰减来化开，
    // 否则会看到一圈硬边的白色圆饼
    const falloff = 0.05 + 0.95 * Math.pow(1 - Math.min(1, t), 2.0);
    const b = armLight * falloff * (i < count * bulge ? 0.95 : 1);

    c.setRGB(1.0 - warm * 0.02, 0.97 + warm * 0.012, 0.94 + (1 - warm) * 0.06);
    col[i * 3] = c.r * b;
    col[i * 3 + 1] = c.g * b;
    col[i * 3 + 2] = c.b * b;

    // 点要大、要软、要暗：这个尺寸下才叠得出一片连续的星云，
    // 用小亮点堆，看过去只会是一地灰色噪点
    size[i] = 3.4 + Math.pow(Math.random(), 3.0) * 4.4;
    phase[i] = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // 只闪一点点：星系的旋臂结构靠亮度层次，不靠闪烁
        float tw = 0.92 + 0.08 * sin(uTime * 0.7 + aPhase);
        gl_PointSize = aSize * uPixelRatio * tw;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        // 星系这一层要的是“雾”，所以用软边高斯衰减；硬边小圆点是留给星空的
        float a = smoothstep(0.5, 0.0, r);
        a *= a;
        gl_FragColor = vec4(vColor * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  /* 核球不再罩光晕：粒子本身够密，再加一层 sprite 会被泛光二次放大，
     核心就变成一坨没有层次的白色光斑 —— 这里要的是清晰，不是亮。 */

  return { group, points, mat };
}

/* ----------------------------------------------------------------- sun */

function createSun(sunDir) {
  const group = new THREE.Group();
  const dist = 42000;
  group.position.copy(sunDir).multiplyScalar(dist);

  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9.5, 8.8, 7.6) });
  const core = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), coreMat);
  group.add(core);

  const glowTex = glowTexture(2.2, 512);
  const s1 = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(2.6, 2.35, 1.9),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );
  s1.scale.setScalar(900 * 12);
  group.add(s1);

  const s2 = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(0.55, 0.62, 0.9),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: 0.35,
    })
  );
  s2.scale.setScalar(900 * 38);
  group.add(s2);

  return { group, core, glow: s1 };
}

/* -------------------------------------------------------------- planets */

export function createSky({ sunDir, moonTexture, galaxyView }) {
  const group = new THREE.Group();

  const { group: galaxy, mat: galaxyMat } = createGalaxy(galaxyView);
  group.add(galaxy);

  const { points: stars, mat: starMat } = createStars();
  group.add(stars);

  const { group: sun, glow: sunGlow, core: sunCore } = createSun(sunDir);
  group.add(sun);

  /* ---- the Moon -------------------------------------------------------- */
  const moonMat = new THREE.MeshStandardMaterial({
    map: moonTexture,
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(760, 64, 40), moonMat);
  moon.position.set(-11461, -1648, -11042);
  group.add(moon);

  /* ---- gas giant ------------------------------------------------------- */
  const jupiterTex = bandedPlanetTexture(
    ['#c9a887', '#e6d3bb', '#a8825f', '#7d5c44', '#f0e3d0', '#b58a63'],
    3
  );
  const jupiter = new THREE.Mesh(
    new THREE.SphereGeometry(560, 64, 48),
    new THREE.MeshStandardMaterial({ map: jupiterTex, roughness: 0.95, metalness: 0.0 })
  );
  jupiter.position.set(-3247, -994, -25777);
  jupiter.rotation.z = 0.18;
  group.add(jupiter);

  /* ---- ringed planet --------------------------------------------------- */
  const saturnTex = bandedPlanetTexture(
    ['#d8c39a', '#efdfc0', '#b99c73', '#e8d6b4', '#9c8158'],
    9
  );
  const saturnGroup = new THREE.Group();
  saturnGroup.position.set(-1618, -6983, -33236);
  saturnGroup.rotation.set(0.5, 0.4, 0.22);

  const saturn = new THREE.Mesh(
    new THREE.SphereGeometry(420, 64, 48),
    new THREE.MeshStandardMaterial({ map: saturnTex, roughness: 0.95, metalness: 0.0 })
  );
  saturnGroup.add(saturn);

  const inner = 560;
  const outer = 1050;
  const ringGeo = new THREE.RingGeometry(inner, outer, 160, 1);
  const rp = ringGeo.attributes.position;
  const ruv = ringGeo.attributes.uv;
  const v3 = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) {
    v3.fromBufferAttribute(rp, i);
    const r = v3.length();
    ruv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  ruv.needsUpdate = true;

  const ringMesh = new THREE.Mesh(
    ringGeo,
    new THREE.MeshStandardMaterial({
      map: ringTexture(),
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0.0,
      depthWrite: false,
    })
  );
  ringMesh.rotation.x = Math.PI / 2;
  saturnGroup.add(ringMesh);
  group.add(saturnGroup);

  /* ---- small red planet ------------------------------------------------ */
  const marsTex = bandedPlanetTexture(['#9e4a2f', '#c1683f', '#7c3620', '#d18a5e'], 17);
  const mars = new THREE.Mesh(
    new THREE.SphereGeometry(150, 48, 32),
    new THREE.MeshStandardMaterial({ map: marsTex, roughness: 1.0, metalness: 0.0 })
  );
  mars.position.set(-9029, -114, -28609);
  group.add(mars);

  return {
    group,
    moon,
    setSunDir(d) {
      sun.position.copy(d).multiplyScalar(42000);
    },
    /** 地影：太阳被地球挡住时，太阳本体与辉光一起隐去 */
    setEclipse(k) {
      const e = THREE.MathUtils.clamp(k, 0, 1);
      sunCore.material.opacity = e;
      sunCore.material.transparent = true;
      sunGlow.material.opacity = e * e;
      sun.children[2].material.opacity = e * e * 0.35;
    },
    update(t) {
      starMat.uniforms.uTime.value = t;
      galaxyMat.uniforms.uTime.value = t;
      moon.rotation.y = t * 0.01;
      jupiter.rotation.y = t * 0.02;
      saturn.rotation.y = t * 0.02;
    },
  };
}
