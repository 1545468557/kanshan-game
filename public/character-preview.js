import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { KANSHAN_MODEL_URL } from './kanshan-model.mjs?v=20260925-reference-v3';

const canvas = document.querySelector('#character-canvas');
const stage = document.querySelector('.stage');
const modelStatus = document.querySelector('#model-status');
const statusDot = document.querySelector('#status-dot');
const loadMessage = document.querySelector('#load-message');
const pauseButton = document.querySelector('#pause-animation');
const turntableButton = document.querySelector('#turntable');
const animationButtons = [...document.querySelectorAll('[data-animation]')];
const viewButtons = [...document.querySelectorAll('[data-view]')];
const params = new URLSearchParams(location.search);
const assetUrl = KANSHAN_MODEL_URL;

function showError(message) {
  modelStatus.textContent = '模型未能加载';
  statusDot.className = 'status-dot error';
  loadMessage.hidden = false;
  loadMessage.classList.add('failed');
  document.querySelector('#load-copy').textContent = message;
  document.querySelector('#retry-load').hidden = false;
}

document.querySelector('#retry-load').addEventListener('click', () => location.reload());

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
} catch (error) {
  showError('浏览器无法启动三维预览，请开启硬件加速后重新加载。');
  console.error('Character preview WebGL initialization failed:', error);
}

if (renderer) initializePreview();

function initializePreview() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e7e7e2');
  scene.fog = new THREE.Fog('#e7e7e2', 5, 14);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 40);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 1.1;
  controls.maxDistance = 5.5;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.515;
  controls.autoRotateSpeed = 1.4;
  const lookAt = new THREE.Vector3(0, 0.66, 0);
  let viewDistance = 2.9;

  scene.add(new THREE.HemisphereLight('#f1f6ff', '#b9b7a8', 2.3));
  const key = new THREE.DirectionalLight('#fff8eb', 2.0);
  key.position.set(-2.8, 4.5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 2.5;
  key.shadow.camera.bottom = -1.5;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 12;
  key.shadow.normalBias = 0.008;
  key.shadow.bias = -0.00005;
  key.shadow.radius = 14;
  key.shadow.blurSamples = 12;
  key.target.position.y = 0.65;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#e7f1ff', 1.6);
  fill.position.set(3, 2, -2);
  scene.add(fill);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: '#dedfd7', roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.008;
  floor.receiveShadow = true;
  scene.add(floor);

  // A very soft ambient contact shadow complements the real, animated shadow.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const context = shadowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(48,59,49,0.22)');
  gradient.addColorStop(0.35, 'rgba(48,59,49,0.12)');
  gradient.addColorStop(1, 'rgba(48,59,49,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.85),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = -0.006;
  scene.add(contactShadow);

  function setView(name) {
    const views = {
      'three-quarter': new THREE.Vector3(0.58, 0.15, 0.8),
      front: new THREE.Vector3(0, 0.02, 1),
      side: new THREE.Vector3(1, 0.02, 0),
      back: new THREE.Vector3(0, 0.02, -1),
    };
    const selected = views[name] ? name : 'three-quarter';
    controls.target.copy(lookAt);
    camera.position.copy(views[selected]).normalize().multiplyScalar(viewDistance).add(lookAt);
    camera.lookAt(lookAt);
    controls.update();
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === selected)));
  }

  viewButtons.forEach(button => button.addEventListener('click', () => {
    controls.autoRotate = false;
    turntableButton.setAttribute('aria-pressed', 'false');
    setView(button.dataset.view);
  }));
  controls.addEventListener('start', () => {
    viewButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
  });
  turntableButton.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    turntableButton.setAttribute('aria-pressed', String(controls.autoRotate));
    if (controls.autoRotate) viewButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
  });

  let mixer;
  let activeAction;
  let paused = false;
  const actions = new Map();
  function setAnimation(name) {
    const next = actions.get(name);
    if (!next || next === activeAction) return;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (activeAction) activeAction.crossFadeTo(next, paused ? 0 : 0.25, false);
    activeAction = next;
    animationButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.animation === name)));
    // Apply the selected pose even when the animation is paused.
    mixer.update(0);
  }
  animationButtons.forEach(button => button.addEventListener('click', () => setAnimation(button.dataset.animation)));
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? '继续动画' : '暂停动画';
    pauseButton.setAttribute('aria-pressed', String(paused));
  });

  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  setView(params.get('view'));

  new GLTFLoader().load(assetUrl, gltf => {
    const model = gltf.scene;
    let triangles = 0;
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const geometry = object.geometry;
      const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
      triangles += Math.floor(count / 3) * (object.isInstancedMesh ? object.count : 1);
    });
    scene.add(model);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    lookAt.copy(center);
    // Leave comfortable headroom while retaining the asset's real scale.
    viewDistance = Math.max(2.7, size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.26);
    setView(params.get('view'));
    document.querySelector('#triangle-count').textContent = triangles.toLocaleString('zh-CN');
    document.querySelector('#model-height').textContent = `${size.y.toFixed(2)} m`;

    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach(clip => actions.set(clip.name, mixer.clipAction(clip)));
    animationButtons.forEach(button => {
      button.disabled = !actions.has(button.dataset.animation);
      button.setAttribute('aria-pressed', 'false');
      if (button.disabled) button.title = '模型未包含此动作';
    });
    pauseButton.disabled = actions.size === 0;
    const requested = [...actions.keys()].find(name => name.toLowerCase() === params.get('animation')?.toLowerCase());
    setAnimation(requested || (actions.has('Idle') ? 'Idle' : actions.keys().next().value));
    modelStatus.textContent = '模型已就绪';
    statusDot.className = 'status-dot ready';
    loadMessage.hidden = true;
  }, progress => {
    if (progress.total) document.querySelector('#load-copy').textContent = `正在准备刘看山… ${Math.round(progress.loaded / progress.total * 100)}%`;
  }, error => {
    console.error('Character preview model loading failed:', error);
    showError('模型加载失败，请确认本地服务已启动且模型文件已生成，再重新加载。');
  });

  let previousTime;
  renderer.setAnimationLoop(time => {
    const delta = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (mixer && !paused) mixer.update(delta);
    controls.update(delta);
    renderer.render(scene, camera);
  });
  document.addEventListener('visibilitychange', () => { previousTime = undefined; });
}
