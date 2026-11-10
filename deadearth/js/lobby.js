// The lobby: NOVA HUB, a future sky-lounge high above a living green city.
// Sittable benches, the armory, the wardrobe and the blue arena portal that
// leads to the only place the Earth is dead: the fighting arena.
import * as THREE from "three";
import { Builder, mat4, mulberry32 } from "./utils.js";
import { withRepeat, canvasTex, softDot } from "./textures.js";
import { makeSky, Wind } from "./sky.js";
import { Human } from "./human.js";
import { buildGun, WEAPONS } from "./weapons.js";

export const HALL = { x0: -12, x1: 12, z0: -9, z1: 9, h: 5.5 };

function holoTex(text, sub, color = "#4fe3ff", w = 1024, h = 256) {
  return canvasTex(w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(10,30,50,0.85)"); g.addColorStop(1, "rgba(5,15,30,0.85)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = color; ctx.font = `700 ${Math.round(h * 0.36)}px Segoe UI, Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    ctx.shadowBlur = 0;
    if (sub) { ctx.font = `500 ${Math.round(h * 0.13)}px Segoe UI, Arial`; ctx.fillStyle = "#cfefff"; ctx.fillText(sub, w / 2, h * 0.78); }
    ctx.fillStyle = "rgba(255,255,255,0.04)"; for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  });
}
function towerTex() {
  const t = canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = "#3d5a74"; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
      const lit = Math.random() < 0.35;
      ctx.fillStyle = lit ? `rgba(255,${220 + Math.random() * 30},${170 + Math.random() * 60},0.9)` : `rgba(${120 + Math.random() * 40},${160 + Math.random() * 40},${200 + Math.random() * 40},0.9)`;
      ctx.fillRect(x * 32 + 3, y * 16 + 3, 26, 11);
    }
    ctx.fillStyle = "rgba(230,240,250,0.9)"; for (let y = 0; y < h; y += 64) ctx.fillRect(0, y, w, 3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// futuristic bench, same seat geometry as before: sitter faces +Z, seat top y=0.45, seats x=-0.6,0,0.6
function addBench(b, x, z, rotY) {
  const M = mat4([x, 0, z], [0, rotY, 0]);
  const put = (key, geo, pos, rot = [0, 0, 0], scl = [1, 1, 1]) => b.add(key, geo, M.clone().multiply(mat4(pos, rot, scl)));
  put("shell", new THREE.BoxGeometry(2.0, 0.07, 0.5), [0, 0.415, 0]);
  put("shell", new THREE.CapsuleGeometry(0.035, 2.0 - 0.07, 4, 10), [0, 0.415, 0.25], [0, 0, Math.PI / 2]);
  put("cushion", new THREE.BoxGeometry(1.92, 0.04, 0.44), [0, 0.465, 0.0]);
  put("shell", new THREE.BoxGeometry(2.0, 0.5, 0.05), [0, 0.7, -0.245], [-0.14, 0, 0]);
  put("cushion", new THREE.BoxGeometry(1.92, 0.4, 0.03), [0, 0.71, -0.21], [-0.14, 0, 0]);
  for (const sx of [-0.8, 0.8]) {
    put("chrome", new THREE.BoxGeometry(0.06, 0.4, 0.36), [sx, 0.2, -0.02]);
    put("chrome", new THREE.BoxGeometry(0.2, 0.02, 0.44), [sx, 0.01, -0.02]);
  }
  put("glow", new THREE.BoxGeometry(1.7, 0.012, 0.02), [0, 0.37, 0.2]);
}

export function buildLobby(renderer, T, sfx, WM) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xcfe0ee, 0.0022);
  const rnd = mulberry32(7);

  /* ---------- materials ---------- */
  const panelT = withRepeat(T.panel, 1, 1);
  const tileT = withRepeat(T.tiles, 1, 1);
  const M = {
    wall: new THREE.MeshStandardMaterial({ ...panelT, color: 0xeef1f4, roughness: 1 }),
    floor: new THREE.MeshStandardMaterial({ ...tileT, color: 0xb8bec6, roughness: 1, envMapIntensity: 1.4 }),
    ceil: new THREE.MeshStandardMaterial({ ...panelT, color: 0xdfe4ea, roughness: 1 }),
    shell: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.25, metalness: 0.05 }),
    cushion: new THREE.MeshStandardMaterial({ map: T.leather.map, normalMap: T.leather.normalMap, color: 0x3d5566, roughness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ map: T.gunmetal.map, roughnessMap: T.gunmetal.roughnessMap, color: 0xd8dde2, metalness: 1, roughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.3, metalness: 0.4 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3fdcff, emissiveIntensity: 2.5 }),
    glowSoft: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9fe8ff, emissiveIntensity: 1.2 }),
    lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfd8e8, metalness: 0.1, roughness: 0.02, transparent: true, opacity: 0.08, depthWrite: false, envMapIntensity: 2 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xe8ebee, roughness: 0.35 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x2c2218, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ ...withRepeat(T.grass, 220, 220), roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x3a6f95, roughness: 0.06, metalness: 0.3 }),
    tower: new THREE.MeshStandardMaterial({ map: towerTex(), metalness: 0.5, roughness: 0.2, emissive: 0x222a30, envMapIntensity: 1.5 }),
    towerWhite: new THREE.MeshStandardMaterial({ color: 0xf0f2f4, roughness: 0.4 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1, map: T.wood.map }),
    tree: new THREE.MeshStandardMaterial({ color: 0x4f8a42, roughness: 0.9, flatShading: true }),
  };

  const B = new Builder();
  const UV = { worldUV: 0.3 };
  /* ---------- shell ---------- */
  const { x0, x1, z0, z1, h } = HALL;
  B.box("floor", x1 - x0 + 1, 0.3, z1 - z0 + 1, [0, -0.15, 0], [0, 0, 0], { worldUV: 0.5 });
  B.box("ceil", x1 - x0 + 1, 0.4, z1 - z0 + 1, [0, h + 0.2, 0], [0, 0, 0], UV);
  B.box("wall", 0.5, h, z1 - z0 + 1, [x0 - 0.25, h / 2, 0], [0, 0, 0], UV);
  B.box("wall", 0.5, h, z1 - z0 + 1, [x1 + 0.25, h / 2, 0], [0, 0, 0], UV);
  B.box("wall", x1 - x0 + 1, h, 0.5, [0, h / 2, z1 + 0.25], [0, 0, 0], UV);
  // north wall: one long panoramic window x -6.5..6.5, y 0.4..4.8
  const nz = z0 - 0.25;
  const seg = (xa, xb, ya, yb) => B.box("wall", xb - xa, yb - ya, 0.5, [(xa + xb) / 2, (ya + yb) / 2, nz], [0, 0, 0], UV);
  seg(x0 - 0.5, -6.5, 0, h); seg(6.5, x1 + 0.5, 0, h); seg(-6.5, 6.5, 0, 0.4); seg(-6.5, 6.5, 4.8, h);
  for (const wx of [-6.5, -3.25, 0, 3.25, 6.5]) B.box("chrome", 0.08, 4.4, 0.12, [wx, 2.6, z0 - 0.1]);
  B.box("chrome", 13.1, 0.08, 0.14, [0, 0.42, z0 - 0.1]);
  B.box("chrome", 13.1, 0.08, 0.14, [0, 4.78, z0 - 0.1]);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.4), M.glass);
  glass.position.set(0, 2.6, z0 - 0.12); glass.renderOrder = 2;
  scene.add(glass);
  // glowing trims: floor skirting + a high band all around
  for (const [y, k] of [[0.06, "glow"], [3.4, "glowSoft"]]) {
    B.box(k, 0.03, 0.03, z1 - z0, [x0 + 0.02, y, 0]); B.box(k, 0.03, 0.03, z1 - z0, [x1 - 0.02, y, 0]);
    B.box(k, x1 - x0, 0.03, 0.03, [0, y, z1 - 0.02]);
    B.box(k, 5.5, 0.03, 0.03, [-9.25, y, z0 + 0.02]); B.box(k, 5.5, 0.03, 0.03, [9.25, y, z0 + 0.02]);
  }
  // ceiling light panels
  for (const lx of [-8, -4, 0, 4, 8]) for (const lz of [-5, -1, 3, 6.5]) {
    B.box("lightPanel", 2.2, 0.04, 0.7, [lx, h - 0.02, lz]);
    B.box("chrome", 2.3, 0.05, 0.05, [lx, h - 0.03, lz - 0.37]); B.box("chrome", 2.3, 0.05, 0.05, [lx, h - 0.03, lz + 0.37]);
  }
  // columns with light rings
  const pillars = [[-6, -4.5], [6, -4.5], [-6, 4.5], [6, 4.5]];
  for (const [px, pz] of pillars) {
    B.cyl("shell", 0.34, 0.34, h, 32, [px, h / 2, pz]);
    B.cyl("glow", 0.36, 0.36, 0.04, 32, [px, 0.12, pz]);
    B.cyl("glowSoft", 0.36, 0.36, 0.04, 32, [px, 3.4, pz]);
  }
  // planters with shrubs
  const planters = [[-10.6, 7.6], [10.6, 7.6], [-3.6, -7.6], [3.6, -7.6], [-6, 0], [6, 0]];
  for (const [px, pz] of planters) {
    B.cyl("pot", 0.45, 0.38, 0.6, 28, [px, 0.3, pz]);
    B.cyl("soil", 0.42, 0.42, 0.02, 28, [px, 0.59, pz]);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, r = k ? 0.22 : 0;
      B.add("leaf", new THREE.IcosahedronGeometry(0.22 + rnd() * 0.1, 1), mat4([px + Math.cos(a) * r, 0.78 + rnd() * 0.25 + (k ? 0 : 0.3), pz + Math.sin(a) * r], [rnd() * 3, rnd() * 3, 0]));
    }
  }

  /* ---------- benches (same seat layout as before) ---------- */
  const BB = new Builder();
  const benchDefs = [];
  for (const bx of [-2.8, 2.8]) for (const bz of [-3.2, -0.6, 2.0]) benchDefs.push([bx, bz, Math.PI]);
  benchDefs.push([-3.5, 7.9, Math.PI], [3.5, 7.9, Math.PI]);
  benchDefs.push([10.6, 5.2, -Math.PI / 2]);
  for (const [bx, bz, r] of benchDefs) addBench(BB, bx, bz, r);
  const benches = BB.build(M);
  benches.children.forEach((m) => (m.userData.bench = true));
  scene.add(benches);
  const seats = [];
  for (const [bx, bz, r] of benchDefs) for (const sx of [-0.6, 0, 0.6]) {
    const p = new THREE.Vector3(sx, 0.45, 0.02).applyAxisAngle(new THREE.Vector3(0, 1, 0), r).add(new THREE.Vector3(bx, 0, bz));
    seats.push({ pos: p, yaw: r, taken: false });
  }

  /* ---------- the blue arena portal ---------- */
  const PORTAL = new THREE.Vector3(-9.2, 1.55, -6.6);
  const portal = new THREE.Group();
  portal.position.copy(PORTAL);
  {
    const pb = new Builder();
    pb.add("chrome", new THREE.TorusGeometry(1.32, 0.12, 16, 64), null);
    pb.add("dark", new THREE.TorusGeometry(1.32, 0.06, 8, 64), mat4([0, 0, 0.1]));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pb.box("chrome", 0.16, 0.3, 0.3, [Math.cos(a) * 1.36, Math.sin(a) * 1.36, 0], [0, 0, a]); }
    pb.box("chrome", 0.5, 0.3, 0.9, [-1.2, -1.42, 0]); pb.box("chrome", 0.5, 0.3, 0.9, [1.2, -1.42, 0]);
    portal.add(pb.build(M));
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: 0x55c8ff, toneMapped: false }));
    portal.add(ringGlow);
  }
  const portalMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uArmed: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform float uTime, uArmed; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
        float sw = sin(a * 5.0 + r * 14.0 - uTime * 3.2) * 0.5 + 0.5;
        float sw2 = sin(a * 3.0 - r * 22.0 + uTime * 2.1) * 0.5 + 0.5;
        vec3 deep = vec3(0.01, 0.08, 0.35), bright = vec3(0.25, 0.75, 1.0);
        vec3 col = mix(deep, bright, sw * 0.65 + sw2 * 0.35);
        col += vec3(0.5, 0.85, 1.0) * smoothstep(0.65, 1.0, r) * (0.9 + uArmed);
        col += vec3(0.85, 0.95, 1.0) * pow(max(0.0, 1.0 - r), 5.0) * (0.5 + uArmed);
        float alpha = smoothstep(1.0, 0.94, r) * (0.72 + 0.25 * sw);
        gl_FragColor = vec4(col * (1.5 + uArmed * 0.8), alpha);
      }`,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.22, 64), portalMat);
  disc.renderOrder = 3;
  portal.add(disc);
  // orbiting sparks
  const sparkMat = new THREE.SpriteMaterial({ map: softDot("120,210,255"), color: 0x8fe0ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const motes = [];
  for (let k = 0; k < 26; k++) { const m = new THREE.Sprite(sparkMat); m.scale.setScalar(0.06 + Math.random() * 0.08); m.userData = { a: Math.random() * 6.28, r: 1.0 + Math.random() * 0.45, s: 0.6 + Math.random() * 1.2, z: (Math.random() - 0.5) * 0.4 }; portal.add(m); motes.push(m); }
  scene.add(portal);
  const portalLight = new THREE.PointLight(0x3aa8ff, 8, 7, 1.6);
  portalLight.position.set(PORTAL.x, PORTAL.y, PORTAL.z + 0.8); scene.add(portalLight);
  const portalSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: holoTex("ARENA PORTAL", "DEAD EARTH  ·  STAKE COINS TO ENTER  ·  WINNER TAKES ALL"), transparent: true, toneMapped: false }));
  portalSign.position.set(PORTAL.x, 3.7, PORTAL.z); scene.add(portalSign);
  B.box("glow", 2.8, 0.006, 0.08, [PORTAL.x, 0.004, PORTAL.z + 1.0]);
  B.box("glow", 0.08, 0.006, 2.0, [PORTAL.x - 1.4, 0.004, PORTAL.z + 0.1]); B.box("glow", 0.08, 0.006, 2.0, [PORTAL.x + 1.4, 0.004, PORTAL.z + 0.1]);

  /* ---------- armory (east) ---------- */
  B.box("shell", 0.75, 1.0, 7.0, [9.4, 0.5, -1.2]);
  B.box("dark", 0.85, 0.05, 7.1, [9.4, 1.025, -1.2]);
  B.box("glow", 0.02, 0.03, 7.0, [9.02, 0.95, -1.2]);
  B.box("dark", 0.1, 3.4, 7.5, [11.85, 2.1, -1.2]); // display wall
  for (let i = 0; i < 4; i++) B.box("glowSoft", 0.03, 0.02, 7.2, [11.78, 1.05 + i * 0.75, -1.2]);
  const armorySign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: holoTex("ARMORY", "TRADE ARENA WINNINGS FOR FIREPOWER", "#ffb24a"), transparent: true, toneMapped: false }));
  armorySign.position.set(11.78, 4.4, -1.2); armorySign.rotation.y = -Math.PI / 2; scene.add(armorySign);
  const rackGuns = [];
  WEAPONS.forEach((w, i) => {
    const g = buildGun(w.id, WM);
    const row = i % 3, col = Math.floor(i / 3);
    g.position.set(11.7, 1.4 + row * 0.75, -3.6 + col * 3.0 + (row % 2) * 0.5);
    g.scale.setScalar(1.6);
    g.userData.weaponId = w.id;
    rackGuns.push(g);
    scene.add(g);
  });
  const rackLight = new THREE.SpotLight(0xe8f4ff, 30, 9, 0.6, 0.6, 2);
  rackLight.position.set(9.6, 5.0, -1.2); rackLight.target.position.set(11.8, 1.8, -1.2);
  scene.add(rackLight, rackLight.target);
  B.cyl("chrome", 0.12, 0.16, 0.06, 20, [9.4, 1.08, 1.4]);
  B.cyl("glow", 0.13, 0.13, 0.01, 20, [9.4, 1.115, 1.4]);
  const display = new THREE.Group(); display.position.set(9.4, 1.32, 1.4); scene.add(display);

  /* ---------- wardrobe (west) ---------- */
  const PED = new THREE.Vector3(-9.4, 0, 1.4);
  B.cyl("shell", 0.65, 0.7, 0.14, 48, [PED.x, 0.07, PED.z]);
  B.add("glow", new THREE.TorusGeometry(0.672, 0.012, 6, 64), mat4([PED.x, 0.142, PED.z], [Math.PI / 2, 0, 0]));
  for (const rz of [4.4, 6.6]) {
    B.cyl("chrome", 0.015, 0.015, 1.9, 8, [-11.3, 1.75, rz], [Math.PI / 2, 0, 0]);
    B.cyl("chrome", 0.015, 0.015, 1.75, 8, [-11.3, 0.87, rz - 0.95]);
    B.cyl("chrome", 0.015, 0.015, 1.75, 8, [-11.3, 0.87, rz + 0.95]);
    for (let i = 0; i < 7; i++) {
      const c = [0x55585b, 0xe4e8ec, 0x3e2618, 0xb5a283, 0xd2a91c, 0x1c1e22, 0xcfcac0][(i + rz * 3) % 7 | 0];
      const key = "coat" + c;
      if (!M[key]) M[key] = new THREE.MeshStandardMaterial({ map: T.fabric.map, normalMap: T.fabric.normalMap, color: c, roughness: 1 });
      B.add(key, new THREE.BoxGeometry(0.42, 0.95, 0.06), mat4([-11.3, 1.22, rz - 0.75 + i * 0.25], [0, Math.PI / 2 + (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.05]));
    }
  }
  const wardrobeSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: holoTex("WARDROBE", "BODY · HAIR · CLOTHES · LIVE WIND TEST", "#41f0d0"), transparent: true, toneMapped: false }));
  wardrobeSign.position.set(-11.73, 4.2, 2.0); wardrobeSign.rotation.y = Math.PI / 2; scene.add(wardrobeSign);
  // wind turbine vent blowing on the pedestal
  const fan = new THREE.Group();
  const fanB = new Builder();
  fanB.cyl("shell", 0.05, 0.05, 1.1, 12, [0, 0.55, 0]);
  fanB.cyl("shell", 0.3, 0.32, 0.05, 28, [0, 0.025, 0]);
  fanB.add("shell", new THREE.CylinderGeometry(0.47, 0.47, 0.22, 40, 1, true), mat4([0, 1.2, 0.03], [Math.PI / 2, 0, 0]));
  fanB.add("glow", new THREE.TorusGeometry(0.47, 0.012, 6, 48), mat4([0, 1.2, 0.14]));
  fanB.cyl("dark", 0.13, 0.13, 0.22, 20, [0, 1.2, -0.06], [Math.PI / 2, 0, 0]);
  fan.add(fanB.build(M));
  const blades = new THREE.Group(); blades.position.set(0, 1.2, 0.06);
  for (let i = 0; i < 5; i++) { const bl2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.008), M.chrome); bl2.position.set(0, 0.21, 0); const p = new THREE.Group(); p.rotation.z = (i / 5) * Math.PI * 2; bl2.rotation.y = 0.45; p.add(bl2); blades.add(p); }
  fan.add(blades);
  fan.position.set(-7.4, 0, 3.0);
  fan.lookAt(PED.x, 0, PED.z);
  scene.add(fan);
  const fanDir = new THREE.Vector3(PED.x - fan.position.x, 0, PED.z - fan.position.z).normalize();

  /* ---------- props ---------- */
  for (let i = 0; i < 6; i++) { // personal lockers, sleek
    const lx = 5 + i * 0.62;
    B.box("shell", 0.6, 2.1, 0.5, [lx, 1.05, z1 - 0.3]);
    B.box("glow", 0.02, 0.4, 0.01, [lx + 0.22, 1.2, z1 - 0.555]);
  }
  B.box("dark", 1.6, 1.0, 0.7, [-9.5, 0.5, z1 - 0.5]); // drinks bar
  B.box("glowSoft", 1.6, 0.02, 0.02, [-9.5, 1.0, z1 - 0.86]);
  const shell = B.build(M);
  scene.add(shell);

  // holo info board with the controls
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.35), new THREE.MeshBasicMaterial({
    transparent: true, toneMapped: false,
    map: canvasTex(1024, 640, (ctx, w, hh) => {
      const g = ctx.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, "rgba(8,30,48,0.92)"); g.addColorStop(1, "rgba(4,16,28,0.92)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
      ctx.strokeStyle = "#4fe3ff"; ctx.lineWidth = 4; ctx.strokeRect(6, 6, w - 12, hh - 12);
      ctx.fillStyle = "#4fe3ff"; ctx.font = "700 50px Segoe UI, Arial"; ctx.fillText("NOVA HUB  ·  YEAR 2291", 40, 76);
      ctx.font = "500 30px Segoe UI, Arial"; ctx.fillStyle = "#d8f3ff";
      const L = [
        "LEFT STICK move  ·  RIGHT STICK snap turn",
        "Point + TRIGGER at a bench → sit  (trigger again to stand)",
        "ARMORY: buy weapons  ·  WARDROBE: body, hair & clothes",
        "ARENA: choose a coin stake at the portal terminal,",
        "   then walk through the BLUE PORTAL to the dead Earth",
        "Kill a rival → take their stake. Die → your killer takes yours",
        "Extract alive (hold Y / stand on the beacon) to bank it all",
        "In the arena: A eject mag → left hand reload · B switch gun",
      ];
      L.forEach((s, i) => ctx.fillText(s, 50, 150 + i * 56));
    }),
  }));
  board.position.set(0, 2.1, z1 - 0.03); board.rotation.y = Math.PI; scene.add(board);

  /* ---------- outside: a living future city ---------- */
  const sunDir = new THREE.Vector3(-0.35, 0.42, -0.84).normalize();
  const sky = makeSky({ sunDir, radius: 1400, top: new THREE.Color(0x3c6fb6), horizon: new THREE.Color(0xcfe0ee), ground: new THREE.Color(0x7a9a7a), sunColor: new THREE.Color(0xfff2d8) });
  scene.add(sky);
  // the hub is high up: the city sits 60 m below the window
  const CITY_Y = -60;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), M.grass);
  ground.rotation.x = -Math.PI / 2; ground.position.y = CITY_Y; scene.add(ground);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(3000, 90), M.water);
  river.rotation.x = -Math.PI / 2; river.rotation.z = 0.3; river.position.set(0, CITY_Y + 0.3, -420); scene.add(river);
  const CB = new Builder();
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * 1100, z = -90 - rnd() * 800;
    if (Math.abs(z + 420 + x * 0.3) < 60) continue; // keep the river clear
    const hgt = 60 + rnd() * 260, w = 18 + rnd() * 26;
    if (rnd() < 0.4) CB.add("tower", new THREE.CylinderGeometry(w * 0.5, w * 0.6, hgt, 24), mat4([x, CITY_Y + hgt / 2, z]), { worldUV: 0.012 });
    else CB.add("tower", new THREE.BoxGeometry(w, hgt, w * (0.7 + rnd() * 0.6)), mat4([x, CITY_Y + hgt / 2, z], [0, rnd() * 1.2, 0]), { worldUV: 0.012 });
    CB.add("towerWhite", new THREE.CylinderGeometry(w * 0.3, w * 0.55, 8, 16), mat4([x, CITY_Y + hgt + 4, z]));
    if (rnd() < 0.35) CB.add("towerWhite", new THREE.TorusGeometry(w * 0.75, 1.2, 6, 32), mat4([x, CITY_Y + hgt * (0.4 + rnd() * 0.4), z], [Math.PI / 2, 0, 0]));
  }
  // park trees just below the window
  for (let i = 0; i < 160; i++) {
    const x = (rnd() - 0.5) * 300, z = -30 - rnd() * 200, s = 4 + rnd() * 6;
    CB.cyl("trunk", 0.4, 0.6, s, 6, [x, CITY_Y + s / 2, z]);
    CB.add("tree", new THREE.IcosahedronGeometry(s * 0.6, 1), mat4([x, CITY_Y + s * 1.1, z], [rnd(), rnd(), 0], [1, 0.8, 1]));
  }
  // orbital ring in the sky
  CB.add("towerWhite", new THREE.TorusGeometry(900, 6, 6, 160, Math.PI * 0.9), mat4([200, 300, -1100], [1.25, 0.2, 0.4]));
  scene.add(CB.build(M, { castShadow: false }));
  // flying traffic
  const cars = [];
  const carGeo = new THREE.CapsuleGeometry(0.9, 2.2, 4, 10); carGeo.rotateZ(Math.PI / 2);
  const carMats = [0xf2f4f6, 0x2a3440, 0xd04a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.25 }));
  const tail = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false });
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Mesh(carGeo, carMats[i % 3]);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), tail); l.position.x = -1.9; c.add(l);
    c.userData = { lane: -80 - (i % 6) * 70, y: CITY_Y + 30 + (i % 4) * 25, speed: (18 + rnd() * 20) * (i % 2 ? 1 : -1), x: (rnd() - 0.5) * 900 };
    c.rotation.y = c.userData.speed > 0 ? 0 : Math.PI;
    scene.add(c); cars.push(c);
  }

  /* ---------- lighting ---------- */
  scene.add(new THREE.HemisphereLight(0xeef4ff, 0x9aa2aa, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2de, 2.8);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 90 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  [[-6, -1.5], [2, -1.5], [8, 3], [-6, 5.5], [2, 5.5]].forEach(([lx, lz]) => {
    const l = new THREE.PointLight(0xf2f6ff, 11, 14, 1.6);
    l.position.set(lx, h - 0.6, lz); scene.add(l);
  });
  const pedSpot = new THREE.SpotLight(0xffffff, 60, 9, 0.42, 0.5, 1.5);
  pedSpot.position.set(-8.2, 5.0, 0.4); pedSpot.target.position.set(-9.4, 1.0, 1.4);
  pedSpot.castShadow = true; pedSpot.shadow.mapSize.set(512, 512); pedSpot.shadow.bias = -0.002;
  scene.add(pedSpot, pedSpot.target);

  /* ---------- reflections: bright proxy room ---------- */
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0xbcc8d4);
  const er = new THREE.Mesh(new THREE.BoxGeometry(24, 5.5, 18), new THREE.MeshBasicMaterial({ color: 0xd8dde2, side: THREE.BackSide }));
  er.position.y = 2.75; envScene.add(er);
  for (const lx of [-8, -4, 0, 4, 8]) for (const lz of [-5, -1, 3, 6.5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff })); p.position.set(lx, 5.4, lz); envScene.add(p); }
  const wp = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.4), new THREE.MeshBasicMaterial({ color: 0x9cc4e8 })); wp.position.set(0, 2.6, -8.9); envScene.add(wp);
  const bp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0x3aa8ff })); bp.position.set(PORTAL.x, PORTAL.y, PORTAL.z); envScene.add(bp);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();

  /* ---------- people of the hub ---------- */
  const citizen = (i) => [
    { body: "male", outfit: "m_suit" }, { body: "female", outfit: "f_medic" },
    { body: "male", outfit: "m_bluetee", cloth: "scarf" }, { body: "female", outfit: "f_greentee" },
  ][i % 4];
  const npcs = [];
  [1, 5, 13, 15].forEach((seatIdx, i) => {
    const s = seats[seatIdx];
    s.taken = true;
    const a = new Human(T, citizen(i), { quality: 0.45 });
    a.setPose("sit");
    a.root.position.set(s.pos.x, 0, s.pos.z);
    a.root.rotation.y = s.yaw;
    scene.add(a.root);
    npcs.push(a);
  });
  const qm = new Human(T, { body: "male", outfit: "m_oxford" }, { quality: 0.45 });
  qm.root.position.set(10.5, 0, -2.6); qm.root.rotation.y = -Math.PI / 2;
  scene.add(qm.root); npcs.push(qm);
  const preview = new Human(T, {}, { quality: 1 });
  preview.root.position.set(PED.x, 0.15, PED.z);
  preview.groundY = 0.15;
  scene.add(preview.root);

  const draft = new Wind(0.5, 1.2);
  const fanWind = new THREE.Vector3();
  const tmpW = new THREE.Vector3();

  /* ---------- colliders ---------- */
  const colliders = [];
  const box = (cx, cz, w, d) => colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
  for (const [px, pz] of pillars) box(px, pz, 0.75, 0.75);
  for (const [px, pz] of planters) box(px, pz, 0.95, 0.95);
  for (const [bx, bz, r] of benchDefs) Math.abs(Math.sin(r)) > 0.5 ? box(bx, bz, 0.6, 2.1) : box(bx, bz, 2.1, 0.6);
  box(9.4, -1.2, 0.85, 7.1); box(PED.x, PED.z, 1.4, 1.4); box(6.55, z1 - 0.3, 3.8, 0.6);
  box(fan.position.x, fan.position.z, 0.6, 0.6); box(-11.3, 5.5, 0.6, 4.6); box(-9.5, z1 - 0.5, 1.7, 0.8);
  box(PORTAL.x - 1.25, PORTAL.z, 0.45, 0.9); box(PORTAL.x + 1.25, PORTAL.z, 0.45, 0.9);

  let displayed = null, armed = 0;
  return {
    scene, seats, benches, rackGuns, glass,
    spawn: { pos: new THREE.Vector3(0, 0, 5.2), yaw: 0 },
    bounds: { x0: x0 + 0.35, x1: x1 - 0.35, z0: z0 + 0.35, z1: z1 - 0.35 },
    colliders, preview, npcs,
    portal: { pos: PORTAL, radius: 1.2 },
    heightAt: () => 0,
    setDisplay(id, weaponMats) {
      if (displayed === id) return; displayed = id;
      display.clear();
      const g = buildGun(id, weaponMats); g.scale.setScalar(1.4); display.add(g);
    },
    setArmed(v) { armed = v ? 1 : 0; },
    openDoor() {}, closeDoor() {},
    update(dt, t) {
      sky.userData.update(t);
      draft.update(dt);
      blades.rotation.z += dt * 18;
      const gust = 0.75 + 0.35 * Math.sin(t * 2.1) + 0.2 * Math.sin(t * 5.3);
      fanWind.copy(fanDir).multiplyScalar(5.5 * gust).add(draft.vec);
      preview.root.rotation.y += dt * 0.35;
      preview.update(dt, fanWind);
      for (const n of npcs) n.update(dt, tmpW.copy(draft.vec));
      display.rotation.y += dt * 0.6;
      portalMat.uniforms.uTime.value = t;
      portalMat.uniforms.uArmed.value += (armed - portalMat.uniforms.uArmed.value) * Math.min(1, dt * 3);
      portalLight.intensity = 8 + portalMat.uniforms.uArmed.value * 10 + Math.sin(t * 3) * 1.5;
      for (const m of motes) { const u = m.userData; u.a += dt * u.s; m.position.set(Math.cos(u.a) * u.r, Math.sin(u.a) * u.r, u.z); }
      for (const c of cars) { const u = c.userData; u.x += u.speed * dt; if (u.x > 500) u.x = -500; if (u.x < -500) u.x = 500; c.position.set(u.x, u.y, u.lane); }
    },
  };
}
