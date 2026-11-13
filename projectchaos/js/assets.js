// Loads the Meshy-made GLB models, normalizes them (orientation, real-world size,
// centred pivot) and hands out cheap clones that share geometry and materials.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";

// rot: euler applied to raw model; size: longest dimension in metres (or {axis,len})
export const MODELS = {
  volt_blaster: { size: 0.3, rot: [0, -Math.PI / 2, 0] },
  toy_pistol: { size: 0.26, rot: [0, -Math.PI / 2, 0] },
  grav_gun: { size: 0.42, rot: [0, -Math.PI / 2, 0] },
  mender: { size: 0.32, rot: [0, -Math.PI / 2, 0] },
  wrench: { size: 0.46 },
  frying_pan: { size: 0.48 },
  sledgehammer: { size: 0.9, rot: [0, -Math.PI / 2, 0] },
  crate: { size: 0.62 },
  barrel: { size: 0.72 },
  explosive_barrel: { size: 0.85 },
  cone: { size: 0.7 },
  extinguisher: { size: 0.55 },
  monitor: { size: 0.44 },
  watermelon: { size: 0.32 },
  duck: { size: 0.17 },
  tire: { size: 0.66 },
  toolbox: { size: 0.46 },
  lab_chair: { size: 0.62 },
  bowling_pin: { size: 0.38 },
  server_rack: { size: 1.3 },
  plant: { size: 0.85 },
};

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.tpl = {};
    this.hulls = {};
    this.boxes = {};
    this.gltf = {};
  }

  async load(names, base, onProgress) {
    let done = 0;
    await Promise.all(names.map(async (n) => {
      try {
        const g = await this.loader.loadAsync(`${base}/${n}.glb`);
        this.gltf[n] = g;
        if (MODELS[n]) this.prepare(n, g.scene, MODELS[n]);
      } catch (e) { console.warn("model failed", n, e); }
      onProgress && onProgress(++done / names.length, n);
    }));
  }

  prepare(name, scene, cfg) {
    const holder = new THREE.Group();
    const inner = new THREE.Group();
    inner.add(scene);
    if (cfg.rot) inner.rotation.set(...cfg.rot);
    holder.add(inner);
    holder.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const s = cfg.size / Math.max(size.x, size.y, size.z);
    inner.scale.setScalar(s);
    holder.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.sub(c);
    holder.updateMatrixWorld(true);
    this.boxes[name] = new THREE.Box3().setFromObject(holder);
    // bake into a flat clone-friendly template
    const tpl = new THREE.Group();
    tpl.name = name;
    const pts = [];
    const v = new THREE.Vector3();
    holder.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, o.material);
      m.castShadow = true; m.receiveShadow = true;
      if (o.material) { o.material.side = THREE.FrontSide; o.material.envMapIntensity = 1; }
      tpl.add(m);
      const p = g.attributes.position;
      const step = Math.max(1, Math.floor(p.count / 400));
      for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i); pts.push(v.x, v.y, v.z); }
    });
    this.tpl[name] = tpl;
    this.hulls[name] = new Float32Array(pts);
  }

  has(name) { return !!this.tpl[name]; }
  instance(name) { return this.tpl[name].clone(); }
  size(name) { return this.boxes[name].getSize(new THREE.Vector3()); }
}
