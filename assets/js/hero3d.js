/* Camada 3D (WebGL) — gergelim, faíscas, gotas de molho e ingredientes em profundidade.
   Na abertura fica à frente do hambúrguer; no catálogo flutua nas margens, reagindo à rolagem. */
import * as THREE from '../vendor/three.module.min.js';

export function init(canvas, opts) {
  const mobile = !!(opts && opts.mobile);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0f0b08, 10, 26);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  camera.position.set(0, 0, 14);

  // Luz de estúdio quente, como no vídeo
  scene.add(new THREE.HemisphereLight(0xffe2b8, 0x1a0d06, 0.9));
  const key = new THREE.DirectionalLight(0xffd29a, 2.4); key.position.set(5, 8, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a2a, 2.2); rim.position.set(-6, -2, -5); scene.add(rim);
  const fill = new THREE.PointLight(0xffb45c, 30, 30, 2); fill.position.set(0, -2, 6); scene.add(fill);

  let W = 1, H = 1, viewH = 1, viewW = 1;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    viewW = viewH * camera.aspect;
  }
  resize();
  window.addEventListener('resize', resize);

  const rand = (a, b) => a + Math.random() * (b - a);
  const dummy = new THREE.Object3D();

  /* ---------- Gergelim ---------- */
  const SEEDS = mobile ? 34 : 64;
  const seedGeo = new THREE.SphereGeometry(1, 10, 8);
  const seedMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
  const seeds = new THREE.InstancedMesh(seedGeo, seedMat, SEEDS);
  const seedData = [];
  const cream = new THREE.Color(0xf3e1bd), black = new THREE.Color(0x1d1712);
  for (let i = 0; i < SEEDS; i++) {
    seedData.push({ x: rand(-1, 1), y: rand(-1, 1), z: rand(-6, 4), vy: rand(0.12, 0.45), rx: rand(0, 6), ry: rand(0, 6), sr: rand(0.4, 1.4), s: rand(0.8, 1.25) });
    seeds.setColorAt(i, Math.random() < 0.18 ? black : cream);
  }
  scene.add(seeds);

  /* ---------- Gotas de molho ---------- */
  const DROPS = 0;
  const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xd2401a, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3 });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 16), dropMat, DROPS);
  const dropData = [];
  for (let i = 0; i < DROPS; i++) dropData.push({ x: rand(-1, 1), y: rand(-1, 1), z: rand(-5, 2), vy: rand(0.4, 1.2), s: rand(0.035, 0.085), ph: rand(0, 6) });
  scene.add(drops);

  /* ---------- Faíscas ---------- */
  const SPARKS = mobile ? 110 : 220;
  const sparkPos = new Float32Array(SPARKS * 3), sparkData = [];
  for (let i = 0; i < SPARKS; i++) { sparkData.push({ x: rand(-1, 1), y: rand(-1, 1), z: rand(-5, 6), vy: rand(0.3, 1.1), ph: rand(0, 6) }); }
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(.25, 'rgba(255,170,60,.85)'); gr.addColorStop(1, 'rgba(255,100,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sparkMat = new THREE.PointsMaterial({ size: mobile ? 0.12 : 0.1, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  scene.add(sparks);

  /* ---------- Ingredientes 3D (catálogo) ---------- */
  const ingGroup = new THREE.Group(); scene.add(ingGroup);
  const mats = {
    onion: new THREE.MeshStandardMaterial({ color: 0xb8558c, roughness: 0.35, emissive: 0x2a0818 }),
    onionIn: new THREE.MeshStandardMaterial({ color: 0xf4e3ee, roughness: 0.4 }),
    tomato: new THREE.MeshStandardMaterial({ color: 0xd8261c, roughness: 0.3 }),
    tomatoIn: new THREE.MeshStandardMaterial({ color: 0xff6a4d, roughness: 0.25, emissive: 0x3a0500 }),
    cheese: new THREE.MeshStandardMaterial({ color: 0xf6b21f, roughness: 0.45, emissive: 0x3a2000 }),
    lettuce: new THREE.MeshStandardMaterial({ color: 0x6fbf3a, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x0d2203 }),
    pepperoni: new THREE.MeshStandardMaterial({ color: 0xa5231a, roughness: 0.4 }),
    bacon: new THREE.MeshStandardMaterial({ color: 0x9a3a1e, roughness: 0.5, side: THREE.DoubleSide })
  };
  function onion() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 12, 48), mats.onion)); g.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 48), mats.onionIn)); return g; }
  function tomato() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 40), mats.tomato));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.104, 40), mats.tomatoIn); g.add(inner);
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mats.onionIn); const a = k / 5 * Math.PI * 2; s.position.set(Math.cos(a) * 0.26, 0.05, Math.sin(a) * 0.26); s.scale.set(1, 0.3, 1.6); s.rotation.y = -a; g.add(s); }
    return g;
  }
  function cheese() {
    const geo = new THREE.PlaneGeometry(1.1, 1.1, 10, 10); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.max(0, -y) * Math.max(0, -y) * 0.6 + Math.sin(x * 3) * 0.02); }
    geo.computeVertexNormals(); return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf6b21f, roughness: 0.45, emissive: 0x3a2000, side: THREE.DoubleSide }));
  }
  function lettuce() {
    const geo = new THREE.CircleGeometry(0.7, 48, 0, Math.PI * 1.4); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y); p.setZ(i, Math.sin(Math.atan2(y, x) * 9) * 0.12 * r + r * r * 0.3); }
    geo.computeVertexNormals(); return new THREE.Mesh(geo, mats.lettuce);
  }
  function bacon() {
    const geo = new THREE.PlaneGeometry(1.5, 0.28, 30, 2); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 6) * 0.12); }
    geo.computeVertexNormals(); return new THREE.Mesh(geo, mats.bacon);
  }
  function pepperoni() { return new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 32), mats.pepperoni); }
  const makers = [onion, tomato, cheese, lettuce, bacon, pepperoni, onion, tomato];
  const ING = 0; // ingredientes agora são recortes reais (camada #floaters)
  const ingData = [];
  for (let i = 0; i < ING; i++) {
    const m = makers[i % makers.length]();
    const side = i % 2 ? 1 : -1;
    const d = { m, side, xr: rand(0.62, 0.95), y0: rand(-1, 1), z: rand(-6, 1.5), par: rand(0.6, 1.5), r: new THREE.Vector3(rand(0, 6), rand(0, 6), rand(0, 6)), rs: new THREE.Vector3(rand(-0.4, 0.4), rand(-0.5, 0.5), rand(-0.3, 0.3)), s: rand(0.5, 0.85) };
    m.scale.setScalar(0.001);
    ingGroup.add(m); ingData.push(d);
  }

  /* ---------- estado ---------- */
  let progress = 0, scrollY = 0, vel = 0, intro = true, burstT = 0, visible = true;
  let introMix = 1;
  const clock = new THREE.Clock();
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) loop(); });

  function wrap(v, min, max) { const r = max - min; return ((((v - min) % r) + r) % r) + min; }

  function loop() {
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    introMix += ((intro ? 1 : 0) - introMix) * 0.05;
    const hw = viewW / 2 + 1, hh = viewH / 2 + 1;
    const boost = 1 + Math.min(Math.abs(vel) * 0.06, 4) + burstT * 6;
    burstT = Math.max(0, burstT - dt * 1.2);

    // gergelim: sobe devagar na abertura; no catálogo, poucos e nas laterais
    const seedVis = introMix * 0.9 + 0.25;
    for (let i = 0; i < SEEDS; i++) {
      const s = seedData[i];
      s.y += s.vy * dt * 0.12 * boost * (progress > 0.88 && intro ? 2.2 : 1);
      s.rx += dt * s.sr; s.ry += dt * s.sr * 0.7;
      const yy = wrap(s.y * hh - scrollY * 0.0025 * (1 - introMix) * (s.z + 6) * 0.3, -hh, hh);
      let xx = s.x * hw;
      if (!intro && Math.abs(xx) < viewW * 0.3) xx = Math.sign(xx || 1) * (viewW * 0.3 + Math.abs(xx));
      dummy.position.set(xx, yy, s.z);
      dummy.rotation.set(s.rx, s.ry, 0);
      const sc = (i < SEEDS * seedVis ? 1 : 0) * s.s;
      dummy.scale.set(0.065 * sc, 0.03 * sc, 0.042 * sc);
      dummy.updateMatrix(); seeds.setMatrixAt(i, dummy.matrix);
    }
    seeds.instanceMatrix.needsUpdate = true;

    // gotas de molho: caem; aceleram com a rolagem
    for (let i = 0; i < DROPS; i++) {
      const d = dropData[i];
      d.y -= d.vy * dt * 0.08 * boost;
      const yy = wrap(d.y * hh, -hh, hh);
      let xx = d.x * hw;
      if (!intro && Math.abs(xx) < viewW * 0.33) xx = Math.sign(xx || 1) * (viewW * 0.33 + Math.abs(xx) * 0.6);
      const stretch = 1 + Math.min(Math.abs(vel) * 0.02, 0.6);
      dummy.position.set(xx, yy, d.z); dummy.rotation.set(0, 0, 0);
      const s = d.s * (0.5 + 0.5 * (1 - introMix * 0.3));
      dummy.scale.set(s, s * stretch, s);
      dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;

    // faíscas
    for (let i = 0; i < SPARKS; i++) {
      const s = sparkData[i];
      s.y += s.vy * dt * 0.1 * boost; s.ph += dt * 3;
      sparkPos[i * 3] = s.x * hw + Math.sin(s.ph) * 0.08;
      sparkPos[i * 3 + 1] = wrap(s.y * hh, -hh, hh);
      sparkPos[i * 3 + 2] = s.z;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkMat.opacity = 0.35 + introMix * 0.55;

    // ingredientes: aparecem depois da abertura, nas margens, com parallax
    const ingOn = 1 - introMix;
    for (let i = 0; i < ING; i++) {
      const d = ingData[i];
      d.r.x += (d.rs.x + vel * 0.004) * dt; d.r.y += (d.rs.y + vel * 0.003) * dt; d.r.z += d.rs.z * dt;
      d.m.rotation.set(d.r.x, d.r.y, d.r.z);
      const yy = wrap(d.y0 * hh + scrollY * 0.004 * d.par, -hh - 1, hh + 1);
      d.m.position.set(d.side * (viewW / 2) * d.xr, yy, d.z);
      const sc = d.s * ingOn * (mobile ? 0.75 : 1);
      d.m.scale.setScalar(Math.max(0.001, sc));
    }

    camera.position.x += ((intro ? 0 : Math.sin(t * 0.2) * 0.3) - camera.position.x) * 0.02;
    camera.position.y += (Math.cos(t * 0.17) * 0.2 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();

  return {
    setProgress(p) { progress = p; },
    setScroll(y, v, isIntro) { scrollY = y; vel = v; intro = isIntro; },
    burst() { burstT = 1; }
  };
}
