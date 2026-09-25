import * as T from './vendor/three/three.module.min.js';

const SUPPORTED = new Set(['blue-bottle', 'blue-label', 'blue-paint', 'fake-wound', 'gauze', 'record-phone', 'shoot-note', 'diary']);

function roundedRectangle(width, depth, radius) {
  const x = -width / 2, z = -depth / 2;
  const r = Math.min(radius, width / 2, depth / 2);
  const shape = new T.Shape();
  shape.moveTo(x + r, z);
  shape.lineTo(x + width - r, z);
  shape.quadraticCurveTo(x + width, z, x + width, z + r);
  shape.lineTo(x + width, z + depth - r);
  shape.quadraticCurveTo(x + width, z + depth, x + width - r, z + depth);
  shape.lineTo(x + r, z + depth);
  shape.quadraticCurveTo(x, z + depth, x, z + depth - r);
  shape.lineTo(x, z + r);
  shape.quadraticCurveTo(x, z, x + r, z);
  return shape;
}

// Extrusion runs along local Y; bevels stay inside the requested envelope.
function plate(width, height, depth, radius = 0.008, bevel = 0.001) {
  const b = Math.min(bevel, height / 4);
  const geometry = new T.ExtrudeGeometry(roundedRectangle(width - 2 * b, depth - 2 * b, radius), {
    depth: height - 2 * b, bevelEnabled: b > 0, bevelSize: b,
    bevelThickness: b, bevelSegments: 1, curveSegments: 3, steps: 1,
  });
  geometry.translate(0, 0, -(height - 2 * b) / 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function tinted(source, color, roughness = source.roughness) {
  const material = source.clone();
  material.color.set(color);
  material.roughness = roughness;
  return material;
}

// A batch of thin, flat strips gives paper/fabric detail without a texture.
function strips(lines) {
  const positions = [];
  for (const [x1, z1, x2, z2, y, width] of lines) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const dx = -(z2 - z1) / length * width / 2;
    const dz = (x2 - x1) / length * width / 2;
    const a = [x1 + dx, y, z1 + dz], b = [x2 + dx, y, z2 + dz];
    const c = [x2 - dx, y, z2 - dz], d = [x1 - dx, y, z1 - dz];
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Local coordinates match the original evidence props; caller places root. */
export function createMiniatureCaseProp(id, materials) {
  if (!SUPPORTED.has(id)) return null;
  const root = new T.Group();
  root.name = `miniature-case-${id}`;
  function createMesh(name, geometry, material, position = [0, 0, 0]) {
    const object = new T.Mesh(geometry, material);
    object.name = `${id}-${name}`;
    object.userData.name = object.name;
    object.position.set(...position);
    object.castShadow = object.receiveShadow = true;
    root.add(object);
    return object;
  }
  const paper = tinted(materials.paper, '#e3dbc7', 0.96);

  if (id === 'blue-bottle' || id === 'blue-label') {
    const profile = [
      [0, -0.11], [0.060, -0.11], [0.071, -0.104], [0.073, -0.092],
      [0.073, 0.044], [0.070, 0.065], [0.060, 0.081], [0.043, 0.098],
      [0.037, 0.106], [0.037, 0.11], [0, 0.11],
    ].map(([x, y]) => new T.Vector2(x, y));
    createMesh('bottle-body', new T.LatheGeometry(profile, 24), id === 'blue-bottle' ? materials.blue : materials.glass);
    createMesh('screw-cap', new T.CylinderGeometry(0.040, 0.043, 0.035, 20), materials.dark, [0, 0.128, 0]);
    for (const y of [0.116, 0.126, 0.137]) {
      const ridge = createMesh(`cap-ridge-${y}`, new T.TorusGeometry(0.041, 0.0011, 4, 20), materials.dark, [0, y, 0]);
      ridge.rotation.x = Math.PI / 2;
    }
    // A blank label adds shape only; no new words or evidence are introduced.
    createMesh('blank-label', new T.CylinderGeometry(0.0744, 0.0744, 0.079, 12, 1, true, -0.78, 1.56), paper, [0, -0.018, 0]);
    return root;
  }

  if (id === 'blue-paint') {
    createMesh('can-body', new T.CylinderGeometry(0.124, 0.124, 0.204, 24), materials.paint, [0, -0.004, 0]);
    for (const y of [-0.105, 0.103]) {
      const rim = createMesh(`rolled-rim-${y}`, new T.TorusGeometry(0.122, 0.0048, 6, 24), materials.metal, [0, y, 0]);
      rim.rotation.x = Math.PI / 2;
    }
    createMesh('lid', new T.CylinderGeometry(0.117, 0.117, 0.004, 24), materials.paint, [0, 0.102, 0]);
    createMesh('blank-label', new T.CylinderGeometry(0.125, 0.125, 0.105, 12, 1, true, -0.74, 1.48), paper, [0, -0.017, 0]);
    const points = Array.from({ length: 13 }, (_, i) => {
      const angle = i / 12 * Math.PI;
      return new T.Vector3(0.123 * Math.cos(angle), 0.036 - 0.12 * Math.sin(angle), 0.014 + 0.073 * Math.sin(angle));
    });
    createMesh('folded-handle', new T.TubeGeometry(new T.CatmullRomCurve3(points), 24, 0.0032, 5, false), materials.metal);
    return root;
  }

  if (id === 'fake-wound') {
    const shape = new T.Shape();
    shape.moveTo(-0.123, -0.016);
    shape.bezierCurveTo(-0.123, -0.055, -0.057, -0.067, -0.018, -0.062);
    shape.bezierCurveTo(0.024, -0.068, 0.116, -0.053, 0.123, -0.008);
    shape.bezierCurveTo(0.123, 0.037, 0.062, 0.067, 0.013, 0.062);
    shape.bezierCurveTo(-0.049, 0.067, -0.123, 0.042, -0.123, -0.016);
    const patch = new T.ExtrudeGeometry(shape, { depth: 0.027, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 5, steps: 1 });
    patch.translate(0, 0, -0.0135);
    patch.rotateX(-Math.PI / 2);
    createMesh('soft-patch', patch, materials.red);
    const seam = new T.CatmullRomCurve3([
      new T.Vector3(-0.071, 0.0155, -0.003), new T.Vector3(-0.024, 0.0155, 0.008),
      new T.Vector3(0.020, 0.0155, -0.006), new T.Vector3(0.067, 0.0155, 0.003),
    ]);
    createMesh('subtle-seam', new T.TubeGeometry(seam, 12, 0.0017, 4, false), tinted(materials.red, '#65373b', 0.74));
    return root;
  }

  if (id === 'gauze') {
    const gauze = tinted(materials.paper, '#e9e3d3', 1);
    const layers = [[0.234, 0.175, -0.002], [0.229, 0.177, 0.003], [0.238, 0.172, -0.001], [0.231, 0.174, 0.002]];
    layers.forEach(([width, depth, x], i) => {
      createMesh(`fold-${i}`, plate(width, 0.020, depth, 0.009, 0.0012), gauze, [x, -0.034 + i * 0.022, 0]);
    });
    const lines = [];
    for (let i = 0; i < 7; i++) lines.push([-0.100, -0.069 + i * 0.023, 0.101, -0.069 + i * 0.023, 0.0423, 0.00065]);
    for (let i = 0; i < 9; i++) lines.push([-0.093 + i * 0.024, -0.074, -0.093 + i * 0.024, 0.074, 0.0424, 0.0005]);
    createMesh('fine-weave', strips(lines), tinted(gauze, '#cfcaba', 1));
    return root;
  }

  if (id === 'record-phone') {
    const frame = tinted(materials.dark, '#3d4241', 0.6);
    const screen = tinted(materials.dark, '#1c282c', 0.23);
    screen.metalness = 0.1;
    createMesh('rounded-frame', plate(0.16, 0.0238, 0.29, 0.014, 0.0012), frame, [0, -0.0006, 0]);
    createMesh('black-screen', plate(0.138, 0.001, 0.245, 0.01, 0), screen, [0, 0.0117, 0]);
    const reflection = new T.BufferGeometry();
    reflection.setAttribute('position', new T.Float32BufferAttribute([
      -0.061, 0.0123, -0.106, -0.061, 0.0123, -0.072, 0.059, 0.0123, 0.093,
      -0.061, 0.0123, -0.106, 0.059, 0.0123, 0.093, 0.059, 0.0123, 0.059,
    ], 3));
    reflection.computeVertexNormals();
    const sheen = tinted(materials.paper, '#9faeae', 0.46);
    sheen.transparent = true; sheen.opacity = 0.12; sheen.depthWrite = false;
    createMesh('soft-screen-reflection', reflection, sheen);
    createMesh('earpiece', plate(0.033, 0.0007, 0.0035, 0.001, 0), materials.dark, [0, 0.0119, -0.132]);
    return root;
  }

  if (id === 'shoot-note') {
    createMesh('paper-underlay', plate(0.278, 0.002, 0.188, 0.002, 0), paper, [0, -0.005, 0]);
    const topPaper = paper.clone();
    topPaper.side = T.DoubleSide;
    const geometry = new T.PlaneGeometry(0.28, 0.19, 10, 8);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getY(i);
      const lift = Math.max(0, (x - 0.092) / 0.048) * Math.max(0, (z - 0.055) / 0.04);
      positions.setXYZ(i, x, -0.0015 + lift * lift * 0.0074, z);
    }
    geometry.computeVertexNormals();
    createMesh('paper-with-lifted-corner', geometry, topPaper);
    const lines = [
      [-0.107, -0.057, 0.034, -0.057, -0.00125, 0.0014],
      [-0.107, -0.027, 0.092, -0.027, -0.00125, 0.0009],
      [-0.107, -0.004, 0.081, -0.004, -0.00125, 0.0009],
      [-0.107, 0.019, 0.048, 0.019, -0.00125, 0.0009],
      [-0.107, 0.042, 0.076, 0.042, -0.00125, 0.0009],
    ];
    createMesh('unreadable-paper-lines', strips(lines), tinted(materials.paper, '#a99e85', 1));
    return root;
  }

  if (id === 'diary') {
    const cover = tinted(materials.dark, '#77614e', 0.9);
    const binding = tinted(cover, '#665645', 0.92);
    createMesh('page-block', plate(0.317, 0.041, 0.231, 0.004, 0.0006), paper, [0.005, 0, 0]);
    for (const y of [-0.0268, 0.0268]) createMesh(`cover-${y}`, plate(0.34, 0.011, 0.25, 0.006, 0.001), cover, [0, y, 0]);
    createMesh('bound-spine', plate(0.018, 0.052, 0.246, 0.003, 0.001), binding, [-0.161, 0, 0]);
    createMesh('cover-hinge', strips([[-0.142, -0.114, -0.142, 0.114, 0.0324, 0.0012]]), binding);
    const edgeMaterial = tinted(paper, '#c9c0aa', 1);
    for (let i = 0; i < 4; i++) {
      const y = -0.0135 + i * 0.009;
      createMesh(`page-edge-${i}`, new T.BoxGeometry(0.309, 0.0005, 0.0006), edgeMaterial, [0.005, y, 0.1154]);
    }
    return root;
  }
  return root;
}
