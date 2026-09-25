import * as T from './vendor/three/three.module.min.js';
import { mergeGeometries } from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';

// Static outdoor pieces share materials; bake their transforms and draw each
// material once. Split multi-material boxes by face without changing colours.
function mergeExterior(exterior) {
  exterior.updateMatrixWorld(true);
  const inverse = exterior.matrixWorld.clone().invert();
  const batches = new Map();
  const originals = new Set();
  exterior.traverse(object => {
    if (!object.isMesh) return;
    const source = object.geometry;
    originals.add(source);
    const transform = new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    const multi = Array.isArray(object.material);
    const groups = multi ? source.groups : [{ start: 0, count: source.index.count }];
    for (const group of groups) {
      const material = multi ? object.material[group.materialIndex] : object.material;
      const geometry = source.clone();
      if (multi) geometry.setIndex(Array.from(source.index.array.slice(group.start, group.start + group.count)));
      geometry.clearGroups();
      geometry.applyMatrix4(transform);
      if (!batches.has(material)) batches.set(material, { geometries: [], names: new Set() });
      const batch = batches.get(material);
      batch.geometries.push(geometry);
      batch.names.add(object.name);
    }
  });
  exterior.clear();
  for (const [material, batch] of batches) {
    const geometry = mergeGeometries(batch.geometries, false);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const object = new T.Mesh(geometry, material);
    object.name = `outside-batch-${exterior.children.length}`;
    object.userData.sourceNames = [...batch.names];
    object.castShadow = object.receiveShadow = false;
    exterior.add(object);
    batch.geometries.forEach(part => part.dispose());
  }
  originals.forEach(geometry => geometry.dispose());
}

// Auxiliary architecture only. Main furniture and props come from Kenney.
export function addMiniatureDressing({ scene, materials }) {
  const root = new T.Group();
  root.name = 'miniature-dressing';
  root.userData.kind = 'curtains-and-exterior';
  const curtains = new T.Group();
  curtains.name = 'miniature-window-curtains';
  const exterior = new T.Group();
  exterior.name = 'miniature-window-exterior';
  root.add(curtains, exterior);

  const linen = materials.cloth.clone();
  linen.name = 'miniature/cream-linen';
  linen.color.set('#e4ddca');
  linen.roughness = 1;
  linen.side = T.DoubleSide;
  const rodMaterial = materials.wood.clone();
  rodMaterial.name = 'miniature/curtain-rod';
  rodMaterial.color.set('#8c7864');

  function mesh(parent, name, geometry, material, position, shadows = true) {
    const object = new T.Mesh(geometry, material);
    object.name = name;
    if (position) object.position.set(...position);
    object.castShadow = object.receiveShadow = shadows;
    parent.add(object);
    return object;
  }

  // Geometry lies in the YZ wall plane; the folds move only 2 cm in X.
  function curtain(name, zCenter) {
    const geometry = new T.PlaneGeometry(0.38, 1.97, 32, 20);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const u = positions.getX(i) / 0.38 + 0.5;
      const v = positions.getY(i) / 1.97 + 0.5;
      const fold = Math.sin(u * Math.PI * 8);
      const x = 3.50 + fold * (0.019 + (1 - v) * 0.003);
      const y = 1.05 + v * 1.97 + Math.sin(u * Math.PI * 8) * (1 - v) * 0.006;
      const z = zCenter + (u - 0.5) * 0.38;
      positions.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    mesh(curtains, name, geometry, linen);
    // Four short fabric tabs visibly connect each panel to the rod.
    for (let i = 0; i < 4; i++) {
      const z = zCenter - 0.1425 + i * 0.095;
      mesh(curtains, `${name}-tab-${i}`, new T.BoxGeometry(0.012, 0.055, 0.021), linen, [3.50, 3.036, z]);
    }
  }
  curtain('window-curtain-left', -0.76);
  curtain('window-curtain-right', 1.31);

  const rod = mesh(curtains, 'window-curtain-rod', new T.CylinderGeometry(0.016, 0.016, 2.45, 12), rodMaterial, [3.50, 3.068, 0.275]);
  rod.rotation.x = Math.PI / 2;
  for (const z of [-0.95, 1.50]) {
    mesh(curtains, `curtain-rod-end-${z}`, new T.SphereGeometry(0.027, 12, 8), rodMaterial, [3.50, 3.068, z]);
    mesh(curtains, `curtain-rod-bracket-${z}`, new T.BoxGeometry(0.18, 0.021, 0.026), rodMaterial, [3.59, 3.068, z]);
  }

  // A distant, oversized sky plane covers oblique sightlines through the
  // aperture. All exterior geometry stays beyond the room's right wall.
  const skyGeometry = new T.PlaneGeometry(26, 18);
  const skyPositions = skyGeometry.attributes.position;
  const skyColors = [];
  const low = new T.Color('#657682');
  const high = new T.Color('#414f60');
  for (let i = 0; i < skyPositions.count; i++) {
    const t = T.MathUtils.clamp((skyPositions.getY(i) + 9) / 18, 0, 1);
    const color = low.clone().lerp(high, t);
    skyColors.push(color.r, color.g, color.b);
  }
  skyGeometry.setAttribute('color', new T.Float32BufferAttribute(skyColors, 3));
  const sky = mesh(exterior, 'outside-hazy-sky', skyGeometry, new T.MeshBasicMaterial({
    vertexColors: true, side: T.DoubleSide, toneMapped: false,
  }), [6.5, 2.1, 0.28], false);
  sky.rotation.y = -Math.PI / 2;

  const flat = color => new T.MeshBasicMaterial({ color, toneMapped: false });
  const windowFrame = flat('#586873');
  const windowGlass = [flat('#344650'), flat('#42555f'), flat('#52646e')];
  const roofMaterial = flat('#485966');
  const bodyMaterials = [flat('#596a75'), flat('#506370'), flat('#647480'), flat('#485d68'), flat('#566a74'), flat('#5c6e78')];

  function distantBuilding(name, x, z, width, height, columns) {
    const group = new T.Group();
    group.name = name;
    exterior.add(group);
    const depth = 0.38;
    const base = -0.60;
    const faceX = x - depth / 2;
    mesh(group, `${name}-body`, new T.BoxGeometry(depth, height, width), bodyMaterials, [x, base + height / 2, z], false);
    mesh(group, `${name}-roof`, new T.BoxGeometry(depth + 0.05, 0.07, width + 0.07), roofMaterial, [x, base + height + 0.035, z], false);
    const rows = Math.max(2, Math.floor((height - 0.28) / 0.62));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const y = base + 0.43 + row * 0.62;
        const windowZ = z + (col - (columns - 1) / 2) * width / (columns + 0.45);
        const frame = mesh(group, `${name}-window-${row}-${col}-frame`, new T.PlaneGeometry(0.25, 0.34), windowFrame, [faceX - 0.006, y, windowZ], false);
        frame.rotation.y = -Math.PI / 2;
        const pane = mesh(group, `${name}-window-${row}-${col}`, new T.PlaneGeometry(0.19, 0.27), windowGlass[(row + col) % 3], [faceX - 0.008, y, windowZ], false);
        pane.rotation.y = -Math.PI / 2;
      }
    }
  }
  distantBuilding('outside-left-building', 5.40, -1.45, 1.16, 2.62, 2);
  distantBuilding('outside-center-building', 5.95, 0.30, 1.38, 3.48, 3);
  distantBuilding('outside-right-building', 5.30, 2.05, 1.12, 2.26, 2);
  mergeExterior(exterior);

  // The existing window sill is retained; this thin cap adds a painted edge.
  const sillFinish = materials.lime.clone();
  sillFinish.name = 'miniature/window-sill-finish';
  sillFinish.color.set('#ded6c5');
  mesh(curtains, 'window-sill-painted-cap', new T.BoxGeometry(0.37, 0.016, 2.40), sillFinish, [3.60, 0.878, 0.28]);

  scene.add(root);
  return { root };
}
