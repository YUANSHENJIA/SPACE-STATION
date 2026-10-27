import * as THREE from 'three';

const SURFACE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * Earth: high-res day / night / cloud maps, a crisp day-night terminator with
 * a warm sunset band, ocean sun-glint and a thin blue limb.
 * Every custom shader outputs *linear* colour — OutputPass does the tone map.
 */
export function createEarth({ radius = 1550, sunDir, dayMap, nightMap, cloudMap, segW = 288, segH = 144 }) {
  const group = new THREE.Group();

  const surfaceMat = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: dayMap },
      nightMap: { value: nightMap },
      cloudMap: { value: cloudMap },
      sunDir: { value: sunDir },
    },
    vertexShader: SURFACE_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform sampler2D cloudMap;
      uniform vec3 sunDir;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndl = dot(N, sunDir);

        vec3 day = texture2D(dayMap, vUv).rgb;
        vec3 night = texture2D(nightMap, vUv).rgb;

        // deepen the oceans, keep the land warm, so continents read clearly
        float luma = dot(day, vec3(0.299, 0.587, 0.114));
        float ocean = smoothstep(0.02, 0.14, day.b - day.r * 0.95);

        /**
         * 高反照率地表滚降：撒哈拉 / 阿拉伯半岛 / 冰盖的原始 albedo 就有 0.8 以上，
         * 乘上下面 1.55 的日照系数直接顶到 1.0，烧成一块没有细节的白斑（远看像车灯）。
         * 把 0.62 以上的部分压掉四成，海洋 luma 只有 0.1 左右，几乎不受影响。
         */
        day *= 1.0 - 0.40 * smoothstep(0.62, 0.95, luma);
        // 用滚降后的亮度重算，否则下面的饱和度外推会把刚压暗的部分又拉回去
        luma = dot(day, vec3(0.299, 0.587, 0.114));
        day = mix(vec3(luma), day, 1.12);
        day *= mix(vec3(1.0, 0.99, 0.97), vec3(0.74, 0.92, 1.14), ocean * 0.72);

        // crisp terminator + a softer mask for the haze
        float lit = smoothstep(-0.045, 0.045, ndl);
        float soft = smoothstep(-0.22, 0.10, ndl);

        vec3 col = day * (0.015 + 1.55 * max(ndl, 0.0));

        // cloud shadowing on the surface (the shell adds the highlights)
        float cl = texture2D(cloudMap, vUv).r;
        col *= 1.0 - cl * 0.22 * lit;

        // cheap embossed relief so continents keep their texture at close range
        float tx = 1.0 / 4096.0;
        float lL = dot(texture2D(dayMap, vUv - vec2(tx, 0.0)).rgb, vec3(0.3333));
        float lR = dot(texture2D(dayMap, vUv + vec2(tx, 0.0)).rgb, vec3(0.3333));
        float lD = dot(texture2D(dayMap, vUv - vec2(0.0, tx)).rgb, vec3(0.3333));
        float lU = dot(texture2D(dayMap, vUv + vec2(0.0, tx)).rgb, vec3(0.3333));
        float relief = 1.0 + ((lL - lR) * 0.75 + (lD - lU) * 0.55) * 6.5 * lit;
        // 上限从 1.5 收到 1.32：起伏归一化在沙漠边缘会撑到顶格，叠上日照系数又是一片白
        col *= clamp(relief, 0.55, 1.32);

        // city lights: warm and dense, only on the true night side
        float nightMask = smoothstep(0.02, -0.16, ndl);
        vec3 city = pow(night * vec3(1.0, 0.72, 0.38), vec3(1.25)) * 3.6;
        col += city * nightMask;

        // faint earthshine so the night hemisphere is not a black hole
        col += day * 0.010 * (1.0 - lit);

        // ocean sun-glint：真实卫星视角下的海面反光是一大片几百公里宽的柔和亮区，
        // 不是一个点。所以指数刻意压低（张角约 8°），强度也只给 0.18 ——
        // 它是洋面的亮度起伏，既不该盖过陆地，也不该越过 bloom 阈值变成一颗发光的球。
        vec3 H = normalize(V + sunDir);
        float spec = pow(max(dot(N, H), 0.0), 90.0) * ocean * smoothstep(0.0, 0.35, ndl);
        col += vec3(1.0, 0.96, 0.88) * spec * (1.0 - cl * 0.6) * 0.18;

        // limb: blue on the day side, an ember band right on the terminator
        float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 rimCol = mix(vec3(0.05, 0.16, 0.52), vec3(0.30, 0.58, 1.0), soft);
        col += rimCol * fres * (0.05 + 0.42 * soft);

        float ember = exp(-abs(ndl) * 26.0);
        col += vec3(1.0, 0.42, 0.12) * fres * ember * 1.7;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // 球面分段给足，8K 贴图贴上去之后经纬线才不会在边缘露出来；
  // 低配设备由调用方传更小的分段（160×80），顶点数只剩 1/3
  const SEG_W = segW;
  const SEG_H = segH;

  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, SEG_W, SEG_H), surfaceMat);
  group.add(surface);

  /* ---- clouds ----------------------------------------------------------- */
  const cloudUniforms = {
    cloudMap: { value: cloudMap },
    sunDir: { value: sunDir },
    uTime: { value: 0 },
  };

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.0015, SEG_W, SEG_H),
    new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: SURFACE_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D cloudMap;
        uniform vec3 sunDir;
        uniform float uTime;

        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;

        void main() {
          vec3 N = normalize(vNormalW);
          float ndl = dot(N, sunDir);

          vec4 tex = texture2D(cloudMap, vec2(vUv.x + uTime * 0.0012, vUv.y));
          float lum = dot(tex.rgb, vec3(0.3333));
          // white-on-black source maps and alpha maps both work
          float mask = smoothstep(0.10, 0.70, tex.a * lum);

          float lit = smoothstep(-0.10, 0.16, ndl);
          vec3 col = vec3(0.96, 0.97, 1.0) * (0.04 + 0.95 * max(ndl, 0.0));
          float alpha = mask * (0.05 + 0.86 * lit);

          gl_FragColor = vec4(col, alpha);
        }
      `,
    })
  );
  clouds.renderOrder = 1;
  group.add(clouds);

  /* ---- thin atmosphere --------------------------------------------------- */
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: sunDir },
      uColorLow: { value: new THREE.Color(0x3f8ff0) },
      uColorHigh: { value: new THREE.Color(0xa8d6ff) },
    },
    vertexShader: SURFACE_VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform vec3 uColorLow;
      uniform vec3 uColorHigh;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = max(dot(N, V), 0.0);
        float band = pow(1.0 - ndv, 16.0);
        float ndl = dot(N, sunDir);
        float lit = smoothstep(-0.34, 0.34, ndl);
        vec3 col = mix(uColorLow, uColorHigh, lit);
        col = mix(col, vec3(1.0, 0.45, 0.16), exp(-abs(ndl) * 20.0) * 0.65);
        float a = band * (0.16 + 1.15 * lit);
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.004, SEG_W, SEG_H), atmoMat);
  atmo.renderOrder = 3;
  group.add(atmo);

  const hazeMat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: sunDir },
      uColorLow: { value: new THREE.Color(0x1d4ea8) },
      uColorHigh: { value: new THREE.Color(0x5b9bf0) },
    },
    vertexShader: SURFACE_VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform vec3 uColorLow;
      uniform vec3 uColorHigh;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = max(dot(N, V), 0.0);
        float band = pow(1.0 - ndv, 30.0);
        float lit = smoothstep(-0.45, 0.5, dot(N, sunDir));
        vec3 col = mix(uColorLow, uColorHigh, lit);
        float a = band * (0.05 + 0.45 * lit);
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const haze = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.014, SEG_W, SEG_H), hazeMat);
  haze.renderOrder = 4;
  group.add(haze);

  /* ---- 极光：南北极各一圈竖立的帘幕 ---------------------------------- */
  const auroraUniforms = {
    sunDir: { value: sunDir },
    uTime: { value: 0 },
  };

  /**
   * 一圈竖立的光墙：底边踩在极光椭圆上，沿径向（当地铅垂线）向上立起。
   *
   * 先试过「一根根独立柱片」，但平面片总有边界 —— 远看必然是珠串或砖块，
   * 参数怎么调都救不回来。这里用一整圈连续的圆柱面，帘幕高度差、竖条纹、
   * 明暗分段全部由着色器按经度算出来，几何上没有接缝，才连得成一片。
   * 参差的顶边用 discard 裁，所以顶点高度给足、交给片元去裁。
   */
  function buildAuroraWall(r, latAbs) {
    const P = [];
    const RAD = [];
    const AU = [];
    const LON = [];
    const IDX = [];

    // 极区边界：|y|/r 超过 latAbs 的区域才有极光
    // 0.904（约 64.7°）只在极圈附近一条窄带；放宽到 0.87（约 60.5°）后
    // 三层帘幕叠起来能铺开到 60°~76°，夜侧看起来才是一整片光幕
    const thetaEdge = Math.acos(THREE.MathUtils.clamp(latAbs, 0.5, 1));
    const RINGS = [
      // 高度给足：俯视时墙被压扁，墙太矮就只剩一条亮线，看不出是帘幕
      { scale: 1.0, seg: 192, h: 0.36 }, // 外圈：立在极光椭圆上的主帘幕
      { scale: 0.74, seg: 168, h: 0.26 }, // 中层：填掉内外圈之间的空档
      { scale: 0.48, seg: 132, h: 0.16 }, // 内圈：更靠极点，矮一截做层次
    ];

    for (const sign of [1, -1]) {
      for (const ring of RINGS) {
        const th = thetaEdge * ring.scale;
        const sinT = Math.sin(th);
        const cosT = Math.cos(th);
        const start = P.length / 3;
        const h = r * ring.h;

        for (let i = 0; i <= ring.seg; i++) {
          const a = (i / ring.seg) * Math.PI * 2;
          const dx = sinT * Math.cos(a);
          const dy = cosT * sign;
          const dz = sinT * Math.sin(a);
          const lon = i / ring.seg;

          // 底点在地表，顶点沿径向抬起 h
          for (const u of [0, 1]) {
            const rr = u ? r + h : r;
            P.push(dx * rr, dy * rr, dz * rr);
            RAD.push(dx, dy, dz);
            AU.push(u);
            LON.push(lon);
          }
        }

        // 相邻两条经线之间补一个四边形
        for (let i = 0; i < ring.seg; i++) {
          const a0 = start + i * 2;
          const a1 = a0 + 1;
          const b0 = a0 + 2;
          const b1 = a0 + 3;
          IDX.push(a0, b0, b1, a0, b1, a1);
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aRadial', new THREE.Float32BufferAttribute(RAD, 3));
    g.setAttribute('aU', new THREE.Float32BufferAttribute(AU, 1));
    g.setAttribute('aLon', new THREE.Float32BufferAttribute(LON, 1));
    g.setIndex(IDX);
    return g;
  }

  const auroraMat = new THREE.ShaderMaterial({
    uniforms: auroraUniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aRadial;
      attribute float aU;
      attribute float aLon;

      varying float vU;
      varying float vLon;
      varying vec3 vRadial;

      void main() {
        vU = aU;
        vLon = aLon;
        vRadial = aRadial;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform float uTime;

      varying float vU;
      varying float vLon;
      varying vec3 vRadial;

      // 便宜的 1D 值噪声：帘幕的疏密和高度差全靠它
      float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
      float noise1(float x) {
        float i = floor(x);
        float f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(hash1(i), hash1(i + 1.0), f);
      }

      void main() {
        float lon = vLon;

        // 帘幕顶边：低频决定大段的高低起伏，高频打出细碎参差
        float n1 = noise1(lon * 4.0 + uTime * 0.035);
        float n2 = noise1(lon * 11.0 - uTime * 0.08 + 3.1);
        float n3 = noise1(lon * 29.0 + uTime * 0.15 + 7.7);
        float top = 0.28 + 0.58 * pow(n1 * (0.32 + 0.68 * n2), 1.05) + 0.10 * n3;

        // 整条帘幕顺着铅垂线缓慢起伏 —— 这就是「垂直浮动」
        top += 0.05 * sin(uTime * 0.65 + lon * 21.0) + 0.024 * sin(uTime * 1.7 - lon * 47.0);

        if (vU > top) discard;

        float rise = clamp(vU / max(top, 1e-4), 0.0, 1.0);

        // 竖向剖面：底边最亮往上渐隐；紧贴地表那一线略透，免得连成一道硬边
        // 幂次压到 0.75：顶部要留住相当亮度，否则墙的上半截空掉，
        // 俯视时又退回成一条细亮线
        float body = pow(1.0 - rise, 0.62) * (0.34 + 0.66 * smoothstep(0.0, 0.05, vU));

        // 沿环的明暗分段：这一段爆亮、那一段几乎熄灭，是极光最显著的特征
        // 底值抬到 0.30：原来 0.20 时整圈有近三成是断开的，看起来像两三条孤立的帘子
        float patchy = 0.30 + 0.70 * noise1(lon * 7.0 + uTime * 0.04);

        // 竖直细丝：正弦必然等间距，排出来就是栅栏。改成「一根细丝一个格子」：
        // 粗细、亮度、倾角各自不同，格与格之间才是真实帘幕那种疏密不均的走向。
        float rays = lon * 26.0;              // 绕一圈约 26 根
        float cell = floor(rays);
        float h1 = hash1(cell + 91.0);
        float tilt = (h1 - 0.5) * 0.9;        // 每根按自己的角度倾斜
        float fr = fract(rays + tilt * rise);
        float w = 0.20 + 0.26 * h1;           // 每根粗细差一倍
        float edge = smoothstep(0.0, w, fr) * smoothstep(1.0, 1.0 - w, fr);
        float rayLit = 0.32 + 1.55 * h1 * edge;
        // 有些弧段几乎没有细丝，只剩一整片连续光幕
        float amp = 0.30 + 0.70 * noise1(lon * 3.0 + 11.0);
        // 条纹密到像素装不下时会糊成摩尔纹，按屏幕导数淡回平均亮度
        float lod = smoothstep(1.2, 3.6, 1.0 / max(fwidth(lon) * 26.0, 1e-6));
        float stri = mix(0.80, 0.80 * mix(1.0, rayLit, amp), lod);
        // 细丝沿柱身缓慢流动
        stri *= 0.86 + 0.14 * sin(rise * 12.0 - uTime * 1.6 + lon * 30.0);

        float glow = body * patchy * stri;

        // 绿 → 青 → 紫：按高度爬升
        vec3 cGreen = vec3(0.16, 1.0, 0.52);
        vec3 cCyan = vec3(0.34, 0.94, 1.0);
        vec3 cViolet = vec3(0.72, 0.40, 1.0);
        vec3 col = mix(cGreen, cCyan, smoothstep(0.0, 0.5, rise));
        col = mix(col, cViolet, smoothstep(0.5, 0.92, rise));

        // 昼夜：径向法线对着太阳就是白天，极光被散射压掉。
        // 判定收紧到晨昏线本身（ndl ±0.1 的窄过渡）：夜半球整片全亮，
        // 向阳侧彻底熄灭 —— 白天的大气散射比极光亮几个数量级，
        // 原来宽过渡让晨昏线外侧还留着三成亮度，整圈看起来像没分昼夜。
        float ndl = dot(normalize(vRadial), sunDir);
        float night = 1.0 - smoothstep(-0.08, 0.12, ndl);

        // 夜侧强度 1.45×，白天只留 5% 底噪 —— 极光必须在暗面才站得住
        float a = glow * (0.05 + 1.45 * night);
        if (a < 0.002) discard;
        gl_FragColor = vec4(col * a * 1.7, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // 一圈光墙，从外面看到正面、从上方看到边缘，两面都得留着
    side: THREE.DoubleSide,
  });

  const aurora = new THREE.Mesh(buildAuroraWall(radius, 0.87), auroraMat);
  aurora.renderOrder = 2;
  // 略微抬高，避免底边和地表 z-fighting
  aurora.scale.setScalar(1.002);
  group.add(aurora);

  group.rotation.z = THREE.MathUtils.degToRad(48);

  let baseY = -0.6;

  return {
    group,
    surface,
    clouds,
    aurora,
    setBaseY(v) {
      baseY = v;
    },
    update(t, drift = 0) {
      cloudUniforms.uTime.value = t;
      auroraUniforms.uTime.value = t;
      surface.rotation.y = baseY + drift;
      clouds.rotation.y = baseY + drift * 1.08;
      aurora.rotation.y = baseY + drift * 1.02;
    },
  };
}
