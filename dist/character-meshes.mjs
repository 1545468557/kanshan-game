/*
 * Procedural Three.js character proxies for the Zhihu investigation game.
 * These are code-native approximations (not official 3D models).  The factory
 * accepts a THREE namespace so it can be used from either a CDN build or an
 * existing application bundle.
 */

export function createCharacter(THREE, kind = 'kanshan') {
  if (!THREE) throw new Error('createCharacter requires a THREE namespace');
  const root = new THREE.Group();
  root.name = `character-${kind}`;
  const mats = {};
  const limbs = { legs: [], arms: [], wings: [] };
  const eyes = [];
  const baseScales = new Map();

  const material = (name, color, roughness = 0.78) =>
    mats[name] || (mats[name] = new THREE.MeshStandardMaterial({ color, roughness }));
  const add = (parent, geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1, name = '') => {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = m.receiveShadow = true;
    if (name) m.name = name;
    parent.add(m);
    return m;
  };
  const sphere = (parent, r, mat, x, y, z, sx = 1, sy = 1, sz = 1, name = '') =>
    add(parent, new THREE.SphereGeometry(r, 20, 14), mat, x, y, z, sx, sy, sz, name);
  const box = (parent, w, h, d, mat, x, y, z, sx = 1, sy = 1, sz = 1, name = '') =>
    add(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z, sx, sy, sz, name);
  const cyl = (parent, r, h, mat, x, y, z, sx = 1, sy = 1, sz = 1, name = '') =>
    add(parent, new THREE.CylinderGeometry(r, r * 0.96, h, 14), mat, x, y, z, sx, sy, sz, name);
  const cone = (parent, r, h, mat, x, y, z, rx = 0, rz = 0, name = '') => {
    const m = add(parent, new THREE.ConeGeometry(r, h, 16), mat, x, y, z, 1, 1, 1, name);
    m.rotation.x = rx;
    m.rotation.z = rz;
    return m;
  };
  const eye = (parent, x, y, z, r = 0.055) => {
    const e = sphere(parent, r, material('black', 0x121417, 0.3), x, y, z, 1, 1, 1, 'eye');
    eyes.push(e);
    // Geometry already carries the radius; animation only changes its Y scale.
    baseScales.set(e, 1);
    return e;
  };
  const limbGroup = (parent, x, y, z, side, color, length = 0.45, radius = 0.075) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    const upper = cyl(g, radius, length, color, 0, -length / 2, 0, 1, 1, 1, 'limb');
    sphere(g, radius * 1.35, color, 0, -length - radius * 0.2, 0, 1, 0.9, 1, 'paw');
    g.rotation.z = side * 0.18;
    return g;
  };

  let height = 1.7;
  let torso;
  const white = material('white', 0xf4f3ef);
  const black = material('black', 0x17191d, 0.36);

  if (kind === 'kanshan') {
    torso = sphere(root, 1, white, 0, 1.00, 0, 0.60, 0.88, 0.48, 'torso');
    // Pointed ears echo the official three-view silhouette.
    cone(root, 0.20, 0.40, white, -0.33, 1.90, 0, 0, 0, 'ear-left');
    cone(root, 0.20, 0.40, white, 0.33, 1.90, 0, 0, 0, 'ear-right');
    sphere(root, 0.31, black, 0, 1.44, 0.48, 1.18, 0.85, 0.82, 'muzzle');
    eye(root, -0.22, 1.62, 0.43); eye(root, 0.22, 1.62, 0.43);
    const legMat = black;
    const lLeg = new THREE.Group(), rLeg = new THREE.Group();
    lLeg.position.set(-0.19, 0.53, 0); rLeg.position.set(0.19, 0.53, 0);
    root.add(lLeg, rLeg);
    cyl(lLeg, 0.085, 0.42, legMat, 0, -0.21, 0);
    cyl(rLeg, 0.085, 0.42, legMat, 0, -0.21, 0);
    sphere(lLeg, 0.13, legMat, 0, -0.43, 0.06, 1.15, 0.72, 1.3, 'foot');
    sphere(rLeg, 0.13, legMat, 0, -0.43, 0.06, 1.15, 0.72, 1.3, 'foot');
    limbs.legs.push(lLeg, rLeg);
    limbs.arms.push(limbGroup(root, -0.56, 1.28, 0, -1, black), limbGroup(root, 0.56, 1.28, 0, 1, black));
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.055, 8, 20), material('blue', 0x2b72bc));
    scarf.rotation.x = Math.PI / 2; scarf.position.set(0, 1.50, 0); scarf.castShadow = scarf.receiveShadow = true; root.add(scarf);
    box(root, 0.25, 0.30, 0.14, material('bag', 0x8b5a35), -0.48, 0.83, 0.12, 1, 1, 1, 'messenger-bag');
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.025, 6, 18, Math.PI), material('bag', 0x8b5a35));
    strap.rotation.set(Math.PI / 2, 0, -0.55); strap.position.set(-0.18, 1.11, 0.10); root.add(strap);
    height = 1.72;
  } else if (kind === 'bear') {
    const brown = material('bear', 0x8d674d), cream = material('cream', 0xd7b58d), navy = material('navy', 0x1f3a59);
    torso = sphere(root, 1, brown, 0, 1.02, 0, 0.68, 0.90, 0.53, 'torso');
    sphere(root, 0.50, brown, 0, 1.68, 0, 1, 1.02, 0.95, 'head');
    sphere(root, 0.16, brown, -0.37, 1.98, 0); sphere(root, 0.16, brown, 0.37, 1.98, 0);
    sphere(root, 0.28, cream, 0, 1.57, 0.45, 1.2, 0.8, 0.85, 'muzzle');
    sphere(root, 0.10, black, 0, 1.65, 0.68, 1, 0.8, 0.8, 'nose');
    eye(root, -0.20, 1.78, 0.42, 0.045); eye(root, 0.20, 1.78, 0.42, 0.045);
    box(root, 0.90, 0.58, 0.08, navy, 0, 1.02, 0.52, 1, 1, 1, 'caretaker-vest');
    limbs.arms.push(limbGroup(root, -0.64, 1.28, 0, -1, brown, 0.50, 0.10), limbGroup(root, 0.64, 1.28, 0, 1, brown, 0.50, 0.10));
    const lLeg = new THREE.Group(), rLeg = new THREE.Group(); lLeg.position.set(-0.23, 0.60, 0); rLeg.position.set(0.23, 0.60, 0); root.add(lLeg, rLeg);
    cyl(lLeg, 0.11, 0.47, black, 0, -0.24, 0); cyl(rLeg, 0.11, 0.47, black, 0, -0.24, 0);
    sphere(lLeg, 0.16, black, 0, -0.48, 0.08, 1.3, 0.7, 1.35); sphere(rLeg, 0.16, black, 0, -0.48, 0.08, 1.3, 0.7, 1.35);
    limbs.legs.push(lLeg, rLeg);
    // Keyring on the vest as a tiny brass torus and key.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 12), material('brass', 0xd3a742)); ring.position.set(0.30, 1.00, 0.58); ring.rotation.x = Math.PI / 2; root.add(ring);
    box(root, 0.025, 0.15, 0.025, material('brass', 0xd3a742), 0.30, 0.90, 0.58, 1, 1, 1, 'key');
    height = 1.98;
  } else if (kind === 'bird') {
    const gray = material('bird-gray', 0x98a3a8), green = material('shawl', 0x52756a), orange = material('beak', 0xd18b45);
    torso = sphere(root, 1, white, 0, 0.98, 0, 0.50, 0.72, 0.40, 'torso');
    sphere(root, 0.42, white, 0, 1.53, 0, 1, 0.95, 0.92, 'head');
    cone(root, 0.13, 0.36, orange, 0, 1.50, 0.45, Math.PI / 2, 0, 'beak');
    eye(root, -0.16, 1.63, 0.37, 0.042); eye(root, 0.16, 1.63, 0.37, 0.042);
    limbs.wings.push(sphere(root, 0.30, gray, -0.49, 1.08, 0, 0.45, 1.2, 0.55, 'wing-left'), sphere(root, 0.30, gray, 0.49, 1.08, 0, 0.45, 1.2, 0.55, 'wing-right'));
    const shawl = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.06, 8, 20), green); shawl.rotation.x = Math.PI / 2; shawl.position.y = 1.30; root.add(shawl);
    const lLeg = new THREE.Group(), rLeg = new THREE.Group(); lLeg.position.set(-0.16, 0.40, 0); rLeg.position.set(0.16, 0.40, 0); root.add(lLeg, rLeg);
    cyl(lLeg, 0.045, 0.32, orange, 0, -0.16, 0); cyl(rLeg, 0.045, 0.32, orange, 0, -0.16, 0);
    sphere(lLeg, 0.09, orange, 0, -0.32, 0.06, 1.3, 0.45, 1.4); sphere(rLeg, 0.09, orange, 0, -0.32, 0.06, 1.3, 0.45, 1.4);
    limbs.legs.push(lLeg, rLeg);
    cone(root, 0.13, 0.34, gray, -0.14, 0.38, -0.34, -Math.PI / 2, 0, 'tail-left');
    cone(root, 0.13, 0.34, gray, 0.14, 0.38, -0.34, -Math.PI / 2, 0, 'tail-right');
    height = 1.72;
  } else if (kind === 'penguin') {
    const dark = material('penguin', 0x26363b), belly = material('belly', 0xe7ece8), orange = material('beak-feet', 0xd58a3b), vest = material('worker-vest', 0x815836), cap = material('cap', 0x4a3025);
    torso = sphere(root, 1, dark, 0, 0.67, 0, 0.46, 0.64, 0.37, 'torso');
    sphere(root, 0.34, dark, 0, 1.17, 0, 1, 1.0, 0.95, 'head');
    sphere(root, 0.30, belly, 0, 0.73, 0.34, 1, 1.5, 0.24, 'belly');
    cone(root, 0.11, 0.25, orange, 0, 1.15, 0.34, Math.PI / 2, 0, 'beak');
    eye(root, -0.12, 1.27, 0.31, 0.04); eye(root, 0.12, 1.27, 0.31, 0.04);
    box(root, 0.65, 0.40, 0.08, vest, 0, 0.84, 0.37, 1, 1, 1, 'worker-vest');
    limbs.arms.push(limbGroup(root, -0.43, 0.87, 0, -1, dark, 0.38, 0.07), limbGroup(root, 0.43, 0.87, 0, 1, dark, 0.38, 0.07));
    const lLeg = new THREE.Group(), rLeg = new THREE.Group(); lLeg.position.set(-0.16, 0.34, 0); rLeg.position.set(0.16, 0.34, 0); root.add(lLeg, rLeg);
    sphere(lLeg, 0.13, orange, 0, -0.26, 0.08, 1.35, 0.55, 1.5); sphere(rLeg, 0.13, orange, 0, -0.26, 0.08, 1.35, 0.55, 1.5);
    limbs.legs.push(lLeg, rLeg);
    sphere(root, 0.24, cap, 0, 1.43, -0.01, 1.25, 0.35, 1.15, 'cap');
    height = 1.36;
  } else {
    throw new Error(`Unknown character kind: ${kind}`);
  }

  // The reference wolf is a compact mascot; this overall scale keeps its
  // procedural ears and torso close to the target 1.7-unit in-game height.
  if (kind === 'kanshan') root.scale.set(0.86, 0.82, 0.86);

  // Keep animation data compact and expose one deterministic animation hook.
  const torsoBaseY = torso.scale.y;
  const animate = (time = 0, moving = false) => {
    const t = Number.isFinite(time) ? time : 0;
    const walk = moving ? Math.sin(t * 8) * 0.48 : 0;
    if (limbs.legs.length) { limbs.legs[0].rotation.x = walk; limbs.legs[1].rotation.x = -walk; }
    if (limbs.arms.length) { limbs.arms[0].rotation.x = -walk * 0.72; limbs.arms[1].rotation.x = walk * 0.72; }
    if (limbs.wings.length) { limbs.wings[0].rotation.z = -0.12 + walk * 0.20; limbs.wings[1].rotation.z = 0.12 - walk * 0.20; }
    torso.scale.y = torsoBaseY * (1 + Math.sin(t * 2.1) * 0.018);
    const blink = (t % 4.7) < 0.10 ? 0.12 : 1;
    for (const e of eyes) e.scale.y = (baseScales.get(e) || 0.05) * blink;
  };
  return { root, animate, height };
}

