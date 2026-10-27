import * as THREE from 'three';
import { hullTexture, solarTexture, radiatorTexture, glowTexture } from './textures.js';

/* --------------------------------------------------------------- helpers */

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function scaleUV(geo, s) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  }
  uv.needsUpdate = true;
  return geo;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------------ ship */

export function createShip() {
  const group = new THREE.Group();

  const hullMap = hullTexture();
  const solarMap = solarTexture();
  const radMap = radiatorTexture();

  const M = {
    hull: new THREE.MeshStandardMaterial({
      map: hullMap,
      bumpMap: hullMap,
      bumpScale: 0.035,
      color: 0xe2ded4,
      roughness: 0.72,
      metalness: 0.12,
    }),
    metal: new THREE.MeshStandardMaterial({ color: 0x6c737d, roughness: 0.42, metalness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x262a30, roughness: 0.5, metalness: 0.85 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc99b3f, roughness: 0.32, metalness: 1.0 }),
    solar: new THREE.MeshStandardMaterial({
      map: solarMap,
      color: 0xdfe6f5,
      roughness: 0.52,
      metalness: 0.32,
      emissive: 0x0d1730,
      emissiveIntensity: 0.38,
    }),
    radiator: new THREE.MeshStandardMaterial({
      map: radMap,
      color: 0xf4f4f0,
      roughness: 0.6,
      metalness: 0.22,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x120a03,
      emissive: 0xffb15c,
      emissiveIntensity: 2.6,
      roughness: 0.15,
      metalness: 0.0,
    }),
    dish: new THREE.MeshStandardMaterial({
      color: 0xc2c7ce,
      roughness: 0.4,
      metalness: 0.9,
      side: THREE.DoubleSide,
    }),
  };

  /* ---- pressure hull --------------------------------------------------- */
  const hullGeo = new THREE.ExtrudeGeometry(roundedRectShape(3.4, 2.8, 0.5), {
    depth: 8.0,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.07,
    bevelSegments: 2,
    curveSegments: 6,
  });
  scaleUV(hullGeo, 0.42);
  hullGeo.translate(0, 0, -4.0);
  hullGeo.computeVertexNormals();

  const hull = new THREE.Mesh(hullGeo, M.hull);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  /* ---- tapered nose ---------------------------------------------------- */
  const noseGeo = new THREE.CylinderGeometry(1.0, 2.4, 1.6, 4, 1);
  noseGeo.rotateY(Math.PI / 4);
  noseGeo.scale(1, 1, 0.85);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.translate(0, 0, 4.8);
  noseGeo.computeVertexNormals();
  const nose = new THREE.Mesh(noseGeo, M.hull);
  nose.castShadow = true;
  nose.receiveShadow = true;
  group.add(nose);

  // docking interface
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.34, 28, 1, true), M.metal);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0, 5.72);
  collar.castShadow = true;
  group.add(collar);

  const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 8, 28), M.dark);
  collarRing.position.set(0, 0, 5.86);
  group.add(collarRing);

  const hatch = new THREE.Mesh(
    new THREE.CircleGeometry(0.64, 28),
    new THREE.MeshStandardMaterial({ color: 0x7d838c, roughness: 0.55, metalness: 0.85 })
  );
  hatch.position.set(0, 0, 5.87);
  group.add(hatch);

  const hatchRing = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 24), M.dark);
  hatchRing.position.set(0, 0, 5.89);
  group.add(hatchRing);

  /* ---- structural bands, belly blanket, side panels --------------------- */
  for (const z of [1.7, -1.5]) {
    group.add(box(3.56, 2.96, 0.13, M.metal, 0, 0, z));
  }

  group.add(box(3.05, 0.42, 5.4, M.dark, 0, -1.36, 0.7));
  group.add(box(2.4, 0.1, 1.6, M.gold, -0.2, -1.6, 1.6));

  for (const x of [-0.6, 0.1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 4.6, 8), M.metal);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 1.5, 0.7);
    group.add(pipe);
  }

  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      group.add(box(0.035, 0.52, 0.86, M.dark, s * 1.755, -0.55 + (i % 2) * 1.1, -2.7 + i * 1.2));
    }
  }

  /* ---- cockpit visor --------------------------------------------------- */
  const visorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.06, 1.05), M.dark);
  visorFrame.position.set(0, 1.02, 4.72);
  visorFrame.rotation.x = -0.42;
  group.add(visorFrame);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.86), M.glass);
  visor.position.set(0, 1.07, 4.75);
  visor.rotation.x = -0.42;
  group.add(visor);

  /* ---- aft service section --------------------------------------------- */
  const service = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.38, 1.9, 32), M.hull);
  service.rotation.x = Math.PI / 2;
  service.position.set(0, 0, -4.95);
  service.castShadow = true;
  service.receiveShadow = true;
  group.add(service);

  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.09, 32, 1, true), M.dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, -4.38 - i * 0.55);
    group.add(ring);
  }

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(1.18, 0.62, 1.3, 36, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x33383f,
      roughness: 0.34,
      metalness: 0.95,
      side: THREE.DoubleSide,
    })
  );
  nozzle.rotation.x = -Math.PI / 2;
  nozzle.position.set(0, 0, -6.5);
  nozzle.castShadow = true;
  group.add(nozzle);

  const nozzleInner = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 28),
    new THREE.MeshStandardMaterial({
      color: 0x0a0705,
      emissive: 0x8c3a10,
      emissiveIntensity: 0.16,
      roughness: 0.9,
    })
  );
  nozzleInner.position.set(0, 0, -6.22);
  nozzleInner.rotation.y = Math.PI;
  group.add(nozzleInner);

  /* ---- solar wings ----------------------------------------------------- */
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();

    // twin booms
    for (const dz of [-0.55, 0.55]) {
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.6, 10), M.metal);
      boom.rotation.z = Math.PI / 2;
      boom.position.set(s * 3.0, 0, 0.3 + dz);
      boom.castShadow = true;
      wing.add(boom);
    }

    const panel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.045, 2.9), M.solar);
    panel.position.set(s * 7.1, 0, 0.3);
    panel.castShadow = true;
    panel.receiveShadow = true;
    wing.add(panel);

    // panel frame
    wing.add(box(5.7, 0.09, 0.07, M.metal, s * 7.1, 0, 0.3 + 1.45));
    wing.add(box(5.7, 0.09, 0.07, M.metal, s * 7.1, 0, 0.3 - 1.45));
    wing.add(box(0.07, 0.09, 2.9, M.metal, s * 9.9, 0, 0.3));
    wing.add(box(0.07, 0.09, 2.9, M.metal, s * 4.3, 0, 0.3));

    wing.rotation.z = s * THREE.MathUtils.degToRad(-5);
    wing.rotation.y = s * THREE.MathUtils.degToRad(4);
    group.add(wing);
  }

  /* ---- radiator fins --------------------------------------------------- */
  for (const s of [-1, 1]) {
    const fin = new THREE.Group();

    const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.6, 3.6), M.radiator);
    p.castShadow = true;
    p.receiveShadow = true;
    fin.add(p);

    for (const dy of [-0.86, 0, 0.86]) {
      fin.add(box(0.07, 0.07, 3.6, M.metal, 0, dy, 0));
    }
    fin.add(box(0.07, 2.6, 0.06, M.metal, 0, 0, 1.78));

    // hinge arm back to the hull
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.15, 8), M.metal);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-s * 0.55, 0.9, 1.55);
    fin.add(arm);

    fin.position.set(s * 2.05, 0.55, -3.6);
    fin.rotation.y = s * THREE.MathUtils.degToRad(-24);
    fin.rotation.x = THREE.MathUtils.degToRad(6);
    group.add(fin);
  }

  /* ---- propellant tanks ------------------------------------------------ */
  for (const s of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.6, 18), M.metal);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(s * 1.28, -1.15, -2.2);
    tank.castShadow = true;
    group.add(tank);

    for (const dz of [-1.0, 1.0]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.16, 18, 1, true), M.dark);
      band.rotation.x = Math.PI / 2;
      band.position.set(s * 1.28, -1.15, -2.2 + dz);
      group.add(band);
    }
  }

  /* ---- RCS pods -------------------------------------------------------- */
  const vents = [];
  const pods = [
    [1.45, 1.05, 3.25, 1],
    [-1.45, 1.05, 3.25, -1],
    [1.45, -1.05, 3.25, 1],
    [-1.45, -1.05, 3.25, -1],
    [1.5, 0.35, -3.4, 1],
    [-1.5, 0.35, -3.4, -1],
  ];

  pods.forEach(([x, y, z, s], idx) => {
    group.add(box(0.62, 0.62, 0.72, M.dark, x, y, z));
    group.add(box(0.66, 0.1, 0.76, M.metal, x, y + 0.33, z));

    for (let i = 0; i < 3; i++) {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.24, 8, 1, true), M.metal);
      n.position.set(x + s * 0.38, y - 0.16 + i * 0.16, z + 0.24);
      n.rotation.z = s * Math.PI * 0.5;
      group.add(n);
    }

    if (idx < 2) vents.push(new THREE.Vector3(x + s * 0.5, y, z + 0.1));
  });

  /* ---- windows --------------------------------------------------------- */
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const z = 4.55 + i * 0.55;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.14, 14), M.metal);
      ring.rotation.z = Math.PI / 2;
      ring.position.set(s * 1.05, 0.18, z);
      group.add(ring);

      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), M.glass);
      glass.position.set(s * 1.11, 0.18, z);
      glass.rotation.y = s * Math.PI * 0.5;
      group.add(glass);
    }
  }

  // forward observation windows
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), M.glass);
    win.position.set(s * 0.42, 0.3, 5.5);
    win.rotation.x = -0.35;
    group.add(win);
  }

  /* ---- dorsal spine ---------------------------------------------------- */
  group.add(box(0.9, 0.16, 5.2, M.metal, 0, 1.46, 0.6));

  // handrails
  for (let i = 0; i < 3; i++) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2.4, 6), M.metal);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(-1.35 + i * 1.35, 1.62, 0.2);
    group.add(rail);
  }

  // sensor box + dish
  group.add(box(0.55, 0.32, 0.7, M.metal, -1.05, 1.55, 2.9));

  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), M.metal);
  stalk.position.set(0.95, 1.86, -0.4);
  group.add(stalk);

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.4),
    M.dish
  );
  dish.rotation.x = -Math.PI * 0.42;
  dish.position.set(0.95, 2.2, -0.2);
  dish.castShadow = true;
  group.add(dish);

  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), M.metal);
  feed.position.set(0.95, 2.45, -0.4);
  feed.rotation.x = 0.4;
  group.add(feed);

  // gold MLI blankets
  group.add(box(1.35, 0.12, 1.15, M.gold, -0.85, 1.35, -2.6));
  group.add(box(1.7, 0.08, 1.2, M.gold, 0.6, 1.45, -1.3));
  group.add(box(0.9, 0.42, 1.4, M.gold, -1.5, 0.55, -4.2));
  group.add(box(0.1, 0.95, 1.2, M.gold, 1.62, -0.35, -1.0));

  // antenna masts
  for (const [x, z, h] of [[-1.2, -3.2, 0.85], [1.35, 2.2, 0.6]]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, h, 5), M.metal);
    mast.position.set(x, 1.5 + h / 2, z);
    group.add(mast);
  }

  /* ---- manipulator arm ------------------------------------------------- */
  const arm = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.26, 16), M.dark);
  arm.add(base);

  const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.7, 12), M.metal);
  seg1.position.set(0, 0.9, 0);
  arm.add(seg1);

  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), M.dark);
  joint.position.set(0, 1.78, 0);
  arm.add(joint);

  const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 1.5, 12), M.metal);
  seg2.position.set(0.42, 2.42, 0.3);
  seg2.rotation.z = -0.55;
  seg2.rotation.x = 0.3;
  arm.add(seg2);

  const joint2 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), M.dark);
  joint2.position.set(0.8, 3.02, 0.55);
  arm.add(joint2);

  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), M.gold);
  claw.position.set(0.92, 3.16, 0.62);
  claw.rotation.z = -0.35;
  arm.add(claw);

  arm.position.set(1.15, 1.0, 1.5);
  arm.rotation.y = -0.55;
  group.add(arm);

  /* ---- side cargo pallet ----------------------------------------------- */
  const pallet = box(0.42, 0.9, 1.9, M.metal, 1.72, -0.75, 0.8);
  group.add(pallet);
  group.add(box(0.5, 0.12, 2.0, M.hull, 1.72, -0.25, 0.8));
  for (const dz of [-0.7, 0, 0.7]) {
    group.add(box(0.5, 0.16, 0.12, M.dark, 1.72, -0.75, 0.8 + dz));
  }

  /* ---- cabin lights ---------------------------------------------------- */
  const cabin = new THREE.PointLight(0xffa552, 1.9, 7, 2);
  cabin.position.set(0, 0.2, 5.2);
  group.add(cabin);

  const cabin2 = new THREE.PointLight(0xffa552, 0.75, 5, 2);
  cabin2.position.set(1.6, 0.15, 0.4);
  group.add(cabin2);

  /* ---- thruster vapour ------------------------------------------------- */
  const puffs = [];
  const puffTex = glowTexture(3.4, 96);
  for (const p of vents) {
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: puffTex,
          color: 0xd7e6f5,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sp.position.copy(p);
      group.add(sp);
      puffs.push({
        sprite: sp,
        origin: p.clone(),
        dir: new THREE.Vector3(Math.sign(p.x) * 0.9, 0.1, 0.35).normalize(),
        life: Math.random(),
        speed: 0.3 + Math.random() * 0.3,
      });
    }
  }

  /* ---- update ---------------------------------------------------------- */
  let idle = true;
  function update(dt, t) {
    for (const q of puffs) {
      q.life += dt * q.speed * 0.5;
      if (q.life > 1) q.life -= 1;
      const e = q.life;
      q.sprite.position.copy(q.origin).addScaledVector(q.dir, e * 1.8);
      const s = 0.12 + e * 0.55;
      q.sprite.scale.set(s, s, 1);
      q.sprite.material.opacity = Math.sin(Math.PI * Math.min(e * 1.2, 1)) * 0.09;
    }
    if (idle) {
      group.rotation.y = -0.78 + Math.sin(t * 0.12) * 0.04;
      group.rotation.z = Math.sin(t * 0.09 + 1.2) * 0.014;
      group.position.y = Math.sin(t * 0.35) * 0.05;
    }
  }

  return {
    group,
    update,
    setIdle(v) {
      idle = v;
    },
  };
}
