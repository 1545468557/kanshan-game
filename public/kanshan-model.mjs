import * as T from './vendor/three/three.module.min.js';

export const KANSHAN_MODEL_URL = './assets/characters/liukanshan/liukanshan.glb?v=20260925-reference-v3';
export const KANSHAN_ANIMATIONS = ['Idle', 'Walk', 'FastWalk'];
const STRIDE_SPEED = { Walk: 1.55, FastWalk: 2.35 };

// The GLB is already exported at game scale, with feet at y=0 and +Z forward.
// Keep the mixer below the navigation root so skeletal motion cannot move the
// collider or fight the controller's heading.
export function createKanshanModel(gltf, { asset = KANSHAN_MODEL_URL } = {}) {
  if (!gltf?.scene?.isObject3D) throw new Error('刘看山模型缺少三维场景');
  const clips = new Map((gltf.animations || []).map(clip => [clip.name, clip]));
  const missing = KANSHAN_ANIMATIONS.filter(name => !clips.has(name));
  if (missing.length) throw new Error('刘看山模型缺少动画：' + missing.join('、'));

  const root = new T.Group();
  root.name = 'player-liu-kanshan';
  const model = gltf.scene;
  model.name ||= 'liu-kanshan-visual';
  model.traverse(object => {
    if (object.isMesh) object.castShadow = object.receiveShadow = true;
  });
  root.add(model);
  const mixer = new T.AnimationMixer(model);
  const actions = new Map(KANSHAN_ANIMATIONS.map(name => [name, mixer.clipAction(clips.get(name))]));
  let animation = 'Idle', motionSpeed = 0;
  actions.get(animation).play();

  function update(dt, { moving = false, speed = 0 } = {}) {
    motionSpeed = moving && Number.isFinite(speed) ? Math.max(0, speed) : 0;
    const next = motionSpeed < .01 ? 'Idle' : motionSpeed > 1.9 ? 'FastWalk' : 'Walk';
    if (next !== animation) {
      const previous = actions.get(animation), action = actions.get(next);
      action.reset().setEffectiveWeight(1).play();
      previous.crossFadeTo(action, .16, false);
      animation = next;
    }
    const action = actions.get(animation);
    action.setEffectiveTimeScale(animation === 'Idle' ? 1 : T.MathUtils.clamp(motionSpeed / STRIDE_SPEED[animation], .15, 1.5));
    mixer.update(Number.isFinite(dt) ? Math.max(0, dt) : 0);
  }

  return {
    root, update,
    state() { return { asset, animation, animationTime: actions.get(animation).time, motionSpeed }; }
  };
}

export async function loadKanshanModel({ loader, url = KANSHAN_MODEL_URL }) {
  try {
    return createKanshanModel(await loader.loadAsync(url), { asset: url });
  } catch (cause) {
    throw new Error('刘看山模型加载失败，请重新加载。', { cause });
  }
}
