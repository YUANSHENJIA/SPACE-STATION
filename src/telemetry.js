/* ------------------------------------------------------------------
 * 轨道遥测面板 —— 左侧 HUD
 * · 由真实轨道力学推导：v = sqrt(mu / r)，T = 2πr / v
 * · 手动调节小卫星数量 / 编队间距，实时驱动 3D 编队重排
 * ------------------------------------------------------------------ */

const EARTH_KM = 6371; // 地球平均半径
const MU = 398600.4418; // 地球引力常数 km³/s²
const BASE_ALT = 400; // 空间站标称轨道高度
const SCENE_EARTH_UNITS = 1550; // 场景里地球半径 = 1550 单位

/** 场景单位 → 真实公里 */
export const KM_PER_UNIT = EARTH_KM / SCENE_EARTH_UNITS;

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function createTelemetry({ fleet, onLayout }) {
  const vel = $('tlmVel');
  if (!vel || !fleet) return { update() {} };

  const el = {
    vel,
    velSub: $('tlmVelSub'),
    alt: $('tlmAlt'),
    period: $('tlmPeriod'),
    periodSub: $('tlmPeriodSub'),
    revs: $('tlmRevs'),
    rad: $('tlmRad'),
    circ: $('tlmCirc'),
    odo: $('tlmOdo'),
    spin: $('tlmSpin'),
    countIn: $('tlmCount'),
    countVal: $('tlmCountVal'),
    gapIn: $('tlmGap'),
    gapVal: $('tlmGapVal'),
    span: $('tlmSpan'),
    lag: $('tlmLag'),
    styleCount: $('styleCount'),
  };

  const state = {
    count: fleet.count(),
    gapKm: Math.round(fleet.gap() * KM_PER_UNIT),
  };

  /* ---- 滑块填充色 ---- */
  function paint(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const p = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--p', `${p.toFixed(2)}%`);
  }

  /* ---- 编队规模读数 ---- */
  function readSpan(v) {
    const spanKm = Math.max(0, (state.count - 1) * state.gapKm);
    el.span.textContent = spanKm >= 1000 ? `${fmt(spanKm)} km` : `${spanKm} km`;
    el.lag.textContent = `${(spanKm / v).toFixed(1)} s`;
    if (el.styleCount) el.styleCount.textContent = `${state.count} 机同步`;
  }

  /* ---- 数量 ---- */
  el.countIn.value = String(state.count);
  paint(el.countIn);
  function onCount() {
    state.count = Math.round(Number(el.countIn.value));
    el.countVal.innerHTML = `${state.count}<em>颗</em>`;
    paint(el.countIn);
    fleet.setLayout({ count: state.count });
    onLayout?.();
    readSpan(Math.sqrt(MU / (EARTH_KM + BASE_ALT)));
  }
  el.countIn.addEventListener('input', onCount);

  /* ---- 间距 ---- */
  el.gapIn.value = String(state.gapKm);
  paint(el.gapIn);
  function onGap() {
    state.gapKm = Math.round(Number(el.gapIn.value));
    el.gapVal.innerHTML = `${state.gapKm}<em>km</em>`;
    paint(el.gapIn);
    fleet.setLayout({ gap: state.gapKm / KM_PER_UNIT });
    onLayout?.();
    readSpan(Math.sqrt(MU / (EARTH_KM + BASE_ALT)));
  }
  el.gapIn.addEventListener('input', onGap);

  el.countVal.innerHTML = `${state.count}<em>颗</em>`;
  el.gapVal.innerHTML = `${state.gapKm}<em>km</em>`;
  readSpan(Math.sqrt(MU / (EARTH_KM + BASE_ALT)));

  /* ---- 每帧刷新读数 ---- */
  let acc = 0;
  let lastOdo = -1;

  function update(dt, sim) {
    // 高度做极缓慢的“呼吸”，读数才活起来（±2.4 km，和真实大气阻力抬升同量级）
    const alt = BASE_ALT + Math.sin(sim.t * 0.09) * 1.6 + Math.sin(sim.t * 0.031 + 1.7) * 0.8;
    const r = EARTH_KM + alt;
    const v = Math.sqrt(MU / r);
    const T = (2 * Math.PI * r) / v; // 绕地一圈的秒数
    const laps = sim.t / T; // 累计绕行圈数

    // 轨道指示器：光弧跟着空间站一起转
    if (el.spin) el.spin.setAttribute('transform', `rotate(${((laps % 1) * 360).toFixed(2)} 66 66)`);

    acc += dt;
    if (acc < 0.1) return;
    acc = 0;

    el.vel.textContent = v.toFixed(3);
    el.velSub.textContent = `${fmt(v * 3600)} km/h`;
    el.alt.textContent = alt.toFixed(1);
    el.period.textContent = (T / 3600).toFixed(2);
    el.periodSub.textContent = `${Math.floor(T / 60)} 分 ${Math.round(T % 60)} 秒`;
    el.revs.textContent = (86400 / T).toFixed(2);
    el.rad.textContent = fmt(r);
    el.circ.textContent = fmt(2 * Math.PI * r);

    const odo = Math.round(v * sim.t);
    if (odo !== lastOdo) {
      el.odo.textContent = fmt(odo);
      lastOdo = odo;
    }
  }

  return { update };
}
