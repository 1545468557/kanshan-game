// Floor-space collision shared by the player and automatic walking helpers.
export function blocked(x, z, obstacles, radius = .28) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return true;
  if (x < -5.82 + radius || x > 5.82 - radius || z < -4.82 + radius || z > 7.5 - radius) return true;
  if (z > 4.82 - radius && (x < -1.25 + radius || x > 1.25 - radius)) return true;
  return obstacles.some(b => {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    return (x - cx) ** 2 + (z - cz) ** 2 < radius * radius;
  });
}
export function moveWithCollision(position, dx, dz, obstacles, radius = .28) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return position;
  // Substeps prevent fast motion tunneling through thin furniture or walls.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .12));
  for (let i=0;i<steps;i++) {
    if (!blocked(position.x + dx/steps, position.z, obstacles, radius)) position.x += dx/steps;
    if (!blocked(position.x, position.z + dz/steps, obstacles, radius)) position.z += dz/steps;
  }
  return position;
}
