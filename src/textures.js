import * as THREE from 'three';

/* ---------------------------------------------------------------- utils */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const rnd = (() => {
  let s = 20240517;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
})();

/* ------------------------------------------------------- hull / skinning */

// White ceramic thermal tiles + dark metal seams + faded stencils + scorch
export function hullTexture() {
  const W = 1024;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');

  g.fillStyle = '#dedbd3';
  g.fillRect(0, 0, W, H);

  // very soft tonal drift only — no blotches
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 60 + rnd() * 180;
    const a = 0.008 + rnd() * 0.014;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(120,116,108,${a})`);
    grd.addColorStop(1, 'rgba(120,116,108,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // ceramic tile grid
  const cell = 128;
  g.lineWidth = 1.7;
  for (let x = 0; x <= W; x += cell) {
    g.strokeStyle = 'rgba(74,70,64,0.85)';
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, H);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    g.moveTo(x + 2.2, 0);
    g.lineTo(x + 2.2, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += cell) {
    g.strokeStyle = 'rgba(74,70,64,0.8)';
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(W, y + 0.5);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.beginPath();
    g.moveTo(0, y + 2.2);
    g.lineTo(W, y + 2.2);
    g.stroke();
  }

  // primary structural seams every 2 tiles
  g.lineWidth = 2.6;
  g.strokeStyle = 'rgba(58,55,50,0.7)';
  for (let x = 0; x <= W; x += cell * 4) {
    g.beginPath();
    g.moveTo(x + 1, 0);
    g.lineTo(x + 1, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += cell * 2) {
    g.beginPath();
    g.moveTo(0, y + 1);
    g.lineTo(W, y + 1);
    g.stroke();
  }

  // tile-to-tile micro variation
  for (let y = 0; y < H; y += cell) {
    for (let x = 0; x < W; x += cell) {
      const v = rnd();
      g.fillStyle = v > 0.5
        ? `rgba(255,255,255,${0.015 + rnd() * 0.03})`
        : `rgba(96,92,86,${0.012 + rnd() * 0.022})`;
      g.fillRect(x + 2, y + 2, cell - 4, cell - 4);
    }
  }

  // rivets along the seams
  for (let x = 0; x <= W; x += cell) {
    for (let y = 8; y < H; y += 22) {
      g.fillStyle = 'rgba(120,116,110,0.3)';
      g.beginPath();
      g.arc(x + 6, y, 0.9, 0, Math.PI * 2);
      g.fill();
    }
  }

  // a few small service hatches
  const hatches = [
    [214, 96, 74, 52],
    [742, 286, 60, 44],
    [402, 372, 88, 38],
  ];
  for (const [x, y, w, h] of hatches) {
    g.fillStyle = 'rgba(176,176,172,0.5)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(96,94,90,0.6)';
    g.lineWidth = 1.4;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.fillStyle = 'rgba(70,68,64,0.2)';
    for (let i = 6; i < h - 6; i += 7) g.fillRect(x + 5, y + i, w - 10, 1.5);
  }

  // yellow warning bands
  const stripeBands = [
    [70, 430, 150, 12],
    [712, 92, 170, 12],
  ];
  for (const [sx, sy, sw, sh] of stripeBands) {
    g.save();
    g.beginPath();
    g.rect(sx, sy, sw, sh);
    g.clip();
    g.fillStyle = 'rgba(214,172,54,0.85)';
    g.fillRect(sx, sy, sw, sh);
    g.fillStyle = 'rgba(46,44,40,0.7)';
    for (let i = -sh; i < sw; i += 12) {
      g.beginPath();
      g.moveTo(sx + i, sy + sh);
      g.lineTo(sx + i + 5, sy);
      g.lineTo(sx + i + 10, sy);
      g.lineTo(sx + i + 5, sy + sh);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.fillStyle = 'rgba(222,219,211,0.32)';
    g.fillRect(sx, sy, sw, sh * 0.45);
  }

  // stencil dashes
  g.fillStyle = 'rgba(84,82,78,0.42)';
  for (let i = 0; i < 30; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    g.fillRect(x, y, 5 + rnd() * 16, 1.6);
  }

  // faint soot running down from the top edge
  for (let i = 0; i < 10; i++) {
    const x = rnd() * W;
    const w = 2 + rnd() * 8;
    const h = 30 + rnd() * 110;
    const grd = g.createLinearGradient(x, 0, x, h);
    grd.addColorStop(0, `rgba(64,62,58,${0.05 + rnd() * 0.07})`);
    grd.addColorStop(1, 'rgba(64,62,58,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, w, h);
  }

  // fine grain
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 7;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* --------------------------------------------------------- solar arrays */

export function solarTexture() {
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');

  g.fillStyle = '#0a1024';
  g.fillRect(0, 0, W, H);

  const cols = 8;
  const rows = 12;
  const cw = W / cols;
  const ch = H / rows;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = 0.72 + rnd() * 0.5;
      g.fillStyle = `rgba(${(38 * v) | 0},${(64 * v) | 0},${(126 * v) | 0},1)`;
      g.fillRect(x * cw + 2, y * ch + 2, cw - 4, ch - 4);
      const grd = g.createLinearGradient(x * cw, y * ch, x * cw + cw, y * ch + ch);
      grd.addColorStop(0, 'rgba(150,195,255,0.22)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,30,0.2)');
      g.fillStyle = grd;
      g.fillRect(x * cw + 2, y * ch + 2, cw - 4, ch - 4);
    }
  }

  // bus bars
  g.strokeStyle = 'rgba(196,208,226,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i <= cols; i++) {
    g.beginPath();
    g.moveTo(i * cw, 0);
    g.lineTo(i * cw, H);
    g.stroke();
  }
  for (let i = 0; i <= rows; i++) {
    g.beginPath();
    g.moveTo(0, i * ch);
    g.lineTo(W, i * ch);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* ------------------------------------------------------------ radiators */

export function radiatorTexture() {
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');

  g.fillStyle = '#e9e9e6';
  g.fillRect(0, 0, W, H);

  g.strokeStyle = 'rgba(120,122,126,0.55)';
  g.lineWidth = 2;
  for (let y = 8; y < H; y += 14) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,122,126,0.35)';
  for (let x = 0; x <= W; x += 128) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  g.fillStyle = 'rgba(90,92,96,0.5)';
  g.fillRect(0, 0, W, 6);
  g.fillRect(0, H - 6, W, 6);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ---------------------------------------------------------- glow sprites */

export function glowTexture(power = 2.6, size = 256) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = Math.pow(1 - t, power);
    grd.addColorStop(t, `rgba(255,255,255,${a})`);
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------ planets */

export function bandedPlanetTexture(palette, seed = 1) {
  const W = 1024;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');

  g.fillStyle = palette[0];
  g.fillRect(0, 0, W, H);

  // horizontal bands
  let y = 0;
  while (y < H) {
    const h = 6 + rnd() * 34;
    const col = palette[Math.floor(rnd() * palette.length)];
    g.fillStyle = col;
    g.globalAlpha = 0.35 + rnd() * 0.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= W; x += 32) {
      g.lineTo(x, y + Math.sin(x * 0.012 + seed) * 3 + Math.sin(x * 0.031 + y) * 2);
    }
    for (let x = W; x >= 0; x -= 32) {
      g.lineTo(x, y + h + Math.sin(x * 0.02 + seed * 2) * 3);
    }
    g.closePath();
    g.fill();
    y += h;
  }
  g.globalAlpha = 1;

  // storm ovals
  for (let i = 0; i < 5; i++) {
    const x = rnd() * W;
    const yy = H * (0.2 + rnd() * 0.6);
    const rx = 22 + rnd() * 55;
    const ry = 10 + rnd() * 18;
    g.save();
    g.translate(x, yy);
    g.scale(1, ry / rx);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grd.addColorStop(0, 'rgba(255,240,220,0.55)');
    grd.addColorStop(0.6, 'rgba(220,170,130,0.35)');
    grd.addColorStop(1, 'rgba(120,90,70,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // poles
  const pole = g.createLinearGradient(0, 0, 0, H);
  pole.addColorStop(0, 'rgba(20,20,30,0.55)');
  pole.addColorStop(0.18, 'rgba(20,20,30,0)');
  pole.addColorStop(0.82, 'rgba(20,20,30,0)');
  pole.addColorStop(1, 'rgba(20,20,30,0.55)');
  g.fillStyle = pole;
  g.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/* ------------------------------------------------------------- galaxy */

/**
 * 银河带贴图（等距圆柱投影，贴在内表面巨大的天球上）。
 * 只画“亮”的部分，暗尘埃用 destination-out 蚀出空洞 —— 加法混合下
 * 挖掉光就是暗带，这样尘埃带才真的像吸光的云。
 */
export function galaxyTexture() {
  const W = 2048;
  const H = 1024;
  let c = makeCanvas(W, H);
  let g = c.getContext('2d');
  g.clearRect(0, 0, W, H);

  // 带中心线：只用整数倍频率，保证 u=0 / u=1 接缝连续
  const bandY = (u) =>
    H * 0.5 +
    Math.sin(u * Math.PI * 2) * H * 0.048 +
    Math.sin(u * Math.PI * 4 + 1.2) * H * 0.022 +
    Math.sin(u * Math.PI * 6 + 2.1) * H * 0.008;

  const CORE_U = 0.36;
  const BW = H * 0.03;      // 银盘核心半宽 ≈ 5.4°
  const GLOW = BW * 2.2;    // 外围弥散 ≈ 12°

  // 横向环绕绘制三次，消掉左右接缝
  const ringDraw = (x, y, paint) => {
    for (const dx of [-W, 0, W]) paint(x + dx, y);
  };
  const blob = (px, py, pr, col, a, flat = 1, mid = 0.45) => {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, pr);
    grd.addColorStop(0, `rgba(${col},${a.toFixed(4)})`);
    grd.addColorStop(mid, `rgba(${col},${(a * 0.45).toFixed(4)})`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.save();
    g.translate(px, py);
    g.scale(1, flat);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, pr, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  // 带内随机一点：u 均匀，纵向三次均匀采样近似高斯
  const bandPoint = (spread = 1) => {
    const u = Math.random();
    const v = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    return [u * W, bandY(u) + v * BW * spread, u];
  };
  const coreWeight = (u) => Math.exp(-Math.pow((u - CORE_U) / 0.115, 2));

  /* 1) 底带：逐列竖向渐变，铺出连续、边缘自然衰减的银盘。
     这一步是“看得见”的关键，单靠低 alpha 团块叠不出来。 */
  for (let x = 0; x < W; x++) {
    const u = x / W;
    const cy = bandY(u);
    const cw = coreWeight(u);
    const thick = 0.85 + 0.4 * Math.sin(u * Math.PI * 2 + 0.6) + 0.35 * cw;
    const h = GLOW * thick;
    const amt = 0.13 + 0.24 * cw + 0.025 * Math.sin(u * Math.PI * 8 + 0.4);
    const warm = cw > 0.72;
    const base = warm ? '250,246,236' : '224,234,252';
    const edge = warm ? '198,200,216' : '148,172,226';
    const grd = g.createLinearGradient(0, cy - h, 0, cy + h);
    grd.addColorStop(0.0, `rgba(${edge},0)`);
    grd.addColorStop(0.28, `rgba(${edge},${(amt * 0.1).toFixed(4)})`);
    grd.addColorStop(0.44, `rgba(${base},${(amt * 0.62).toFixed(4)})`);
    grd.addColorStop(0.5, `rgba(${base},${amt.toFixed(4)})`);
    grd.addColorStop(0.56, `rgba(${base},${(amt * 0.62).toFixed(4)})`);
    grd.addColorStop(0.72, `rgba(${edge},${(amt * 0.1).toFixed(4)})`);
    grd.addColorStop(1.0, `rgba(${edge},0)`);
    g.fillStyle = grd;
    g.fillRect(x, cy - h, 1.4, h * 2);
  }

  /* 2) 亮星云团：屏幕上 4~11° 的亮斑，是“银河感”的主要来源 */
  for (let i = 0; i < 210; i++) {
    const [x, y, u] = bandPoint(1.0);
    const cw = coreWeight(u);
    const r = 24 + Math.random() * 42;
    const a = (0.07 + Math.random() * 0.08) * (0.8 + cw * 0.9);
    const warm = Math.random() < 0.08 + cw * 0.35;
    ringDraw(x, y, (px, py) =>
      blob(px, py, r, warm ? '186,204,240' : '150,176,228', a * 0.5, 0.75 + Math.random() * 0.5, 0.3)
    );
  }

  /* 3) 细颗粒：把平滑的底子打散 */
  for (let i = 0; i < 1700; i++) {
    const [x, y] = bandPoint(1.2);
    const r = 8 + Math.random() * 30;
    const a = 0.006 + Math.random() * 0.016;
    ringDraw(x, y, (px, py) =>
      blob(px, py, r, '176,196,236', a, 1, 0.4)
    );
  }

  /* 4) 银心核球：一团明显更亮的暖色鼓包 */
  {
    const cx = CORE_U * W;
    const cy = bandY(CORE_U);
    blob(cx, cy, H * 0.15, '200,214,244', 0.085, 0.55, 0.3);
    blob(cx, cy, H * 0.07, '212,226,248', 0.11, 0.5, 0.22);
    blob(cx, cy, H * 0.026, '226,236,252', 0.14, 0.55, 0.2);
  }

  /* 5) 尘埃带：蚀出暗裂缝（destination-out = 吸光）。
     暗带必须够宽（5~12°）才看得见，太细的丝在屏幕上会消失。 */
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 300; i++) {
    const u = Math.random();
    const x = u * W;
    const r = 60 + Math.random() * 130;
    const y = bandY(u) + (Math.random() - 0.5) * BW * 0.7 + BW * 0.55;
    ringDraw(x, y, (px, py) =>
      blob(px, py, r, '0,0,0', 0.26 + Math.random() * 0.3, 0.045 + Math.random() * 0.05, 0.5)
    );
  }
  // 几条贯穿的长暗带
  for (let i = 0; i < 22; i++) {
    const u = Math.random();
    const x = u * W;
    const r = 220 + Math.random() * 200;
    ringDraw(x, bandY(u) + BW * 0.35, (px, py) =>
      blob(px, py, r, '0,0,0', 0.2 + Math.random() * 0.2, 0.03 + Math.random() * 0.035, 0.5)
    );
  }
  g.globalCompositeOperation = 'source-over';

  /* 5.5) 结构层轻模糊：逐列填充的接缝和 8bit 渐变台阶会在拉宽后变成
     一层棋盘格，模糊一次就干净了。星点留到模糊之后再画，保住锐度。 */
  {
    const c2 = makeCanvas(W, H);
    const g2 = c2.getContext('2d');
    g2.filter = 'blur(2.5px)';
    g2.drawImage(c, 0, 0);
    g2.filter = 'none';
    c = c2;
    g = g2;
  }

  /* 6) 星点：七成聚在带内，撑出颗粒感 */
  for (let i = 0; i < 3000; i++) {
    const inBand = Math.random() < 0.7;
    const [bx, by] = bandPoint(1.25);
    const x = inBand ? bx : Math.random() * W;
    const y = inBand ? by : Math.random() * H;
    const big = Math.pow(Math.random(), 3.2);
    const r = 0.3 + big * 1.5;
    const t = Math.random();
    const col = t < 0.3 ? '172,206,255' : t < 0.55 ? '206,220,244' : '236,243,255';
    const a = 0.12 + Math.pow(Math.random(), 1.6) * 0.55;
    g.fillStyle = `rgba(${col},${a.toFixed(3)})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    if (big > 0.9) blob(x, y, r * 7, col, 0.1, 1, 0.3);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function ringTexture() {
  const W = 512;
  const H = 8;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);

  for (let x = 0; x < W; x++) {
    const t = x / W;
    let a = 0.85 * Math.pow(Math.sin(Math.PI * t), 0.6);
    if (t > 0.42 && t < 0.47) a *= 0.12;
    if (t > 0.68 && t < 0.72) a *= 0.2;
    if (t > 0.86 && t < 0.9) a *= 0.35;
    a *= 0.55 + 0.45 * Math.sin(t * 90) * 0.5 + 0.3;
    const v = 205 + 40 * Math.sin(t * 22);
    g.fillStyle = `rgba(${v | 0},${(v - 18) | 0},${(v - 45) | 0},${Math.min(1, a)})`;
    g.fillRect(x, 0, 1, H);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}