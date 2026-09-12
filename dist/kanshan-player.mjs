import * as T from './vendor/three/three.module.min.js';
import { createCharacter } from './character-meshes.mjs';
import { PLAYER_START, moveInApartment, cameraRelativeMove } from './apartment-navigation.mjs';

export function createKanshanPlayer({ scene, camera, canvas, obstacles, cameraSolids, blocked, onInteract, onResume, joystick, stick }) {
  const character = createCharacter(T, 'kanshan');
  character.root.scale.multiplyScalar(.76);
  character.root.updateMatrixWorld(true);
  const feet = -.002 - new T.Box3().setFromObject(character.root).min.y;
  character.root.position.set(PLAYER_START.x, feet, PLAYER_START.z);
  character.root.rotation.y = Math.PI;
  character.root.name = 'player-liu-kanshan';
  scene.add(character.root);
  const keys = new Set(), touch = { x: 0, y: 0 };
  const eye = new T.Vector3(), offset = new T.Vector3(), ray = new T.Raycaster();
  let yaw = 0, pitch = .31, distance = 2.6, mode = 'walk', dragging = null, stickPointer = null, moving = false;
  const movementCodes = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
  function clearInput() {
    keys.clear();touch.x = touch.y = 0;dragging = null;stickPointer = null;
    stick.style.transform = 'translate(0,0)';moving = false;
  }
  const resetOnModal = new MutationObserver(() => { if (blocked()) clearInput(); });
  document.querySelectorAll('dialog').forEach(dialog => resetOnModal.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', clearInput);
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input,textarea,select,[contenteditable="true"]') || blocked()) return;
    if (e.code === 'KeyR') { e.preventDefault();onResume();return; }
    if (e.code === 'KeyE' && mode === 'walk' && !e.repeat) { e.preventDefault();clearInput();onInteract();return; }
    if (mode === 'walk' && movementCodes.has(e.code)) { e.preventDefault();keys.add(e.code); }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'walk' || blocked() || dragging || e.button > 0) return;
    canvas.focus({ preventScroll: true });
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging || dragging.id !== e.pointerId || mode !== 'walk' || blocked()) return;
    yaw -= (e.clientX - dragging.x) * .005;
    pitch = T.MathUtils.clamp(pitch + (e.clientY - dragging.y) * .004, -.08, .76);
    dragging.x = e.clientX;dragging.y = e.clientY;
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, e => { if (dragging?.id === e.pointerId) dragging = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    if (mode !== 'walk' || blocked()) return;
    e.preventDefault();distance = T.MathUtils.clamp(distance + e.deltaY * .002, 1.35, 3.8);
  }, { passive: false });
  function stickMove(e) {
    const box = joystick.getBoundingClientRect();
    let x = (e.clientX - box.left - box.width / 2) / 34;
    let y = (e.clientY - box.top - box.height / 2) / 34;
    const amount = Math.max(1, Math.hypot(x, y));x /= amount;y /= amount;
    touch.x = x;touch.y = -y;stick.style.transform = `translate(${x * 30}px,${y * 30}px)`;
  }
  joystick.addEventListener('pointerdown', e => {
    if (mode !== 'walk' || blocked() || stickPointer !== null) return;
    e.preventDefault();stickPointer = e.pointerId;joystick.setPointerCapture(e.pointerId);stickMove(e);
  });
  joystick.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) stickMove(e); });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) joystick.addEventListener(event, e => {
    if (e.pointerId === stickPointer) { stickPointer = null;touch.x = touch.y = 0;stick.style.transform = 'translate(0,0)'; }
  });
  function placeCamera() {
    const p = character.root.position;
    eye.set(p.x, 1.04, p.z);
    offset.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    // Pull the camera in before walls/furniture; never interpolate through a
    // wall. Multiple near-plane probes avoid corners clipping the viewport.
    let length = distance;
    const side = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const shift of [-.12,0,.12]) {
      ray.set(eye.clone().addScaledVector(side, shift), offset);ray.far = distance + .18;
      const hit = ray.intersectObjects(cameraSolids, true)[0];
      if (hit) length = Math.min(length, Math.max(.13, hit.distance - .19));
    }
    for (const [axis, lower, upper] of [['x',-3.62,3.62],['z',-5.32,4.0],['y',.2,3.30]]) {
      const component = offset[axis];
      if (Math.abs(component) > .0001) length = Math.min(length, ((component > 0 ? upper : lower) - eye[axis]) / component);
    }
    camera.position.copy(eye).addScaledVector(offset, Math.max(.13, length));
    // Final safety envelope: OrbitControls and a very wide drag can otherwise
    // place the eye just beyond the shell before the next ray probe runs.
    camera.position.x=T.MathUtils.clamp(camera.position.x,-3.55,3.55);
    camera.position.z=T.MathUtils.clamp(camera.position.z,-5.27,3.98);
    camera.position.y=T.MathUtils.clamp(camera.position.y,.24,3.28);
    camera.lookAt(eye);
    character.root.visible = length > .67;
  }
  function update(dt, seconds) {
    const paused = blocked();
    if (paused) clearInput();
    moving = false;
    if (mode === 'walk' && !paused) {
      const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touch.x;
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + touch.y;
      const vector = cameraRelativeMove(right, forward, yaw);
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.35 : 1.55;
      const p = character.root.position;
      const next = moveInApartment(p, { x: vector.x * speed * dt, z: vector.z * speed * dt }, obstacles);
      moving = Math.hypot(next.x - p.x, next.z - p.z) > .0001;
      if (Math.hypot(vector.x,vector.z) > .03) {
        const facing = Math.atan2(vector.x,vector.z), angle = Math.atan2(Math.sin(facing-character.root.rotation.y),Math.cos(facing-character.root.rotation.y));
        character.root.rotation.y += angle * Math.min(1,dt * 12);
      }
      p.x = next.x;p.z = next.z;
    }
    character.animate(seconds, moving);
    if (mode === 'walk') placeCamera();
  }
  return {
    root: character.root, update, clearInput,
    suspend() { mode = 'inspect';clearInput();character.root.visible = false; },
    resume() { mode = 'walk';clearInput();placeCamera(); },
    state() { return { mode, position: character.root.position.toArray(), facing: character.root.rotation.y, moving, paused: blocked(), visible: character.root.visible }; }
  };
}
