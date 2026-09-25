// Collision footprints in metres, matching room-art.mjs, not the older room.
export const PLAYER_RADIUS = .36;
export const PLAYER_START = { x: .65, z: .90 };
const rect = (id, minX, maxX, minZ, maxZ) => ({ id, minX, maxX, minZ, maxZ });
export function apartmentObstacles(models = [], characters = []) {
  return [
    rect('left-wall', -4, -3.71, -3.18, 4.5),
    rect('right-wall', 3.71, 4, -3.5, 4.5),
    rect('front-wall', -4, 4, 4.12, 4.5),
    rect('bath-left', -4, -3.48, -5.6, -3.18),
    rect('bath-right', -2.30, -2.18, -5.6, -3.18),
    rect('bath-back', -3.6, -2.2, -5.6, -5.40),
    rect('left-jamb', -3.75, -3.44, -3.26, -2.94),
    rect('middle-pier', -2.34, -1.61, -3.30, -2.94),
    rect('right-facade', 1.55, 3.8, -3.30, -2.94),
    rect('niche-back', -1.82, 1.68, -3.94, -3.79),
    rect('niche-left', -1.83, -1.71, -3.94, -3.18),
    rect('niche-right', 1.55, 1.67, -3.94, -3.18),
    rect('toilet', -3.48, -2.90, -5.16, -4.37),
    rect('basin', -2.65, -2.22, -5.01, -4.62),
    ...models.filter(m => m.collidable !== false && m.min[1] < .15).map(m => rect(m.id, m.min[0], m.max[0], m.min[2], m.max[2])),
    ...characters.map((p, i) => { const r = p.radius ?? .45;return rect(`npc-${i}`, p.x - r, p.x + r, p.z - r, p.z + r); })
  ];
}
export function isWalkable(point, obstacles, radius = PLAYER_RADIUS) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  // Broad envelope also protects against an accidentally missing wall model.
  if (point.x < -3.75 + radius || point.x > 3.75 - radius || point.z < -5.46 + radius || point.z > 4.12 - radius) return false;
  return obstacles.every(b => {
    const x = Math.max(b.minX, Math.min(point.x, b.maxX));
    const z = Math.max(b.minZ, Math.min(point.z, b.maxZ));
    return Math.hypot(point.x - x, point.z - z) >= radius;
  });
}
export function moveInApartment(point, delta, obstacles, radius = PLAYER_RADIUS) {
  const p = { x: point.x, z: point.z };
  if (![delta.x, delta.z].every(Number.isFinite)) return p;
  // Small steps prevent tunnelling even on a slow device. Resolve axes apart
  // so walking obliquely against a wall slides along it instead of sticking.
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / .045));
  for (let i = 0; i < steps; i++) {
    const nextX = { x: p.x + delta.x / steps, z: p.z };
    if (isWalkable(nextX, obstacles, radius)) p.x = nextX.x;
    const nextZ = { x: p.x, z: p.z + delta.z / steps };
    if (isWalkable(nextZ, obstacles, radius)) p.z = nextZ.z;
  }
  return p;
}
export function cameraRelativeMove(right, forward, yaw) {
  const length = Math.hypot(right, forward);
  const divisor = Math.max(1, length);
  return { x: (right * Math.cos(yaw) - forward * Math.sin(yaw)) / divisor,
    z: (-right * Math.sin(yaw) - forward * Math.cos(yaw)) / divisor };
}
