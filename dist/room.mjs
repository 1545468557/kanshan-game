import * as THREE from './vendor/three/three.module.min.js';
import {createCharacter} from './character-meshes.mjs';
import {buildRoom} from './room-scene.mjs';
import {moveWithCollision} from './room-physics.mjs';
import {GLTFLoader} from './vendor/three/examples/jsm/loaders/GLTFLoader.js';

const $ = selector => document.querySelector(selector);
const canvas=$('#world'), dialog=$('#story-dialog'), body=$('#dialog-body');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.4:1.8));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x213548);
scene.fog=new THREE.Fog(0x283d49,16,36);
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.06,65);
scene.add(new THREE.HemisphereLight(0xc1ddf2,0x766046,1.25));
const moon=new THREE.DirectionalLight(0xc4deff,2.15);moon.position.set(-3,8,-5);
moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);
Object.assign(moon.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.5,far:26});
moon.shadow.bias=-.0003;moon.shadow.normalBias=.035;scene.add(moon);
const bounce=new THREE.DirectionalLight(0xffd7ae,.38);bounce.position.set(3,4,6);scene.add(bounce);
const room=buildRoom(THREE);scene.add(room.root);
const floorLoader=new THREE.TextureLoader();
const floorMap=(file,configure)=>new Promise((resolve,reject)=>floorLoader.load(`./assets/textures/wood_floor/${file}`,texture=>{configure?.(texture);resolve(texture);},undefined,reject));
Promise.all([
  floorMap('wood_floor_diff_1k.png',texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4.5,3.6);}),
  floorMap('wood_floor_nor_gl_1k.png',texture=>{texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4.5,3.6);}),
  floorMap('wood_floor_rough_1k.png',texture=>{texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4.5,3.6);})
]).then(([map,normal,roughness])=>{const material=room.floorSurface.material;material.map=map;material.normalMap=normal;material.roughnessMap=roughness;material.color.set(0xffffff);material.needsUpdate=true;}).catch(()=>toast('木地板材质暂未载入，已使用内置备用材质。'));
// Replace the procedural cabinet with a textured, scanned CC0 asset when it
// finishes loading. The procedural version remains as an offline-safe fallback.
const cabinetLoader=new GLTFLoader();
cabinetLoader.load('./assets/models/painted_wooden_cabinet/painted_wooden_cabinet_1k.gltf',gltf=>{
  const cabinetAsset=gltf.scene;cabinetAsset.name='polyhaven-painted-wooden-cabinet';cabinetAsset.position.set(.5,.02,-4.08);cabinetAsset.scale.setScalar(1.16);
  cabinetAsset.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;room.cameraSolids.push(object);}});
  room.root.add(cabinetAsset);room.cabinet.visible=false;
  room.cabinetSolids.forEach(object=>{const i=room.cameraSolids.indexOf(object);if(i>=0)room.cameraSolids.splice(i,1);});
  toast('真实木柜资产已载入');
},undefined,()=>toast('真实木柜暂时无法加载，已使用内置备用模型。'));
const player=createCharacter(THREE,'kanshan');scene.add(player.root);
player.root.position.set(0,0,2.9);player.root.rotation.y=Math.PI;
const torch=new THREE.SpotLight(0xe4f2ff,18,10,.48,.75,1.6);
scene.add(torch,torch.target);torch.castShadow=false;

const source='https://www.zhihu.com/question/62901581/answer/2079913121867682184';
const sourceNote=`<p class="tiny">以知乎答主「青山依旧在」的悬疑创作为改编候选。房间布置、调查物品与本版对话是新增试玩设计，尚非完整谜题；改编权限待确认。<a href="${source}" target="_blank" rel="noopener noreferrer">原回答（含剧透）↗</a></p>`;
const npcData=[
  {id:'caretaker',kind:'bear',name:'门卫 · 老熊',role:'在门口等你',x:2.9,z:3.45,angle:-1.4,
    opening:'这么晚了，你还要一件一件看？柜子里的旧物先别扔，我来处理。',
    questions:[
      ['你说的旧物，具体是哪些？','纸张、零碎东西……我也记不清。你先整理别的吧。'],
      ['你刚才进过这间房吗？','我负责开门，可开门不等于一直待在这里。你要问什么时候。'],
      ['谁能说清柜子有没有动过？','搬东西的小伙子还没走，你问他。']
    ]},
  {id:'neighbor',kind:'bird',name:'邻居 · 燕婆婆',role:'站在旧沙发旁',x:-3.45,z:.65,angle:1.2,
    opening:'我住在隔壁，墙很薄。有些声音……不一定是你以为的那样。',
    questions:[
      ['你听见声音时，看见人了吗？','没看见。我当时在自己屋里。听见和看见，是两码事。'],
      ['你以前来过这间屋子吗？','来过。你看墙上那张照片，柜子以前不在现在的位置。'],
      ['你最担心什么？','别急着认定是谁。先把发生过的事问清楚。']
    ]},
  {id:'mover',kind:'penguin',name:'搬运员 · 小企',role:'正在清点纸箱',x:3.8,z:-.3,angle:-1,
    opening:'我只是来搬东西的。没装箱的，都还在原处……至少我接手时是这样。',
    questions:[
      ['你动过那个柜子吗？','我往外挪过一点，准备搬。后来老熊让我先停下，就推回去了。'],
      ['你知道柜子里有什么吗？','不知道，我没打开。搬过它，不代表看过里面。'],
      ['清点纸在哪里？','就在纸箱旁边的地上。那张是我写的，只记数量，不记箱子里面的东西。']
    ]}
];
const targets=[];
for(const data of npcData){
  const character=createCharacter(THREE,data.kind);character.root.position.set(data.x,0,data.z);
  character.root.rotation.y=data.angle;scene.add(character.root);
  // Collision envelope keeps the player from walking through a character.
  room.obstacles.push({minX:data.x-.43,maxX:data.x+.43,minZ:data.z-.40,maxZ:data.z+.40});
  targets.push({...data,type:'npc',character,position:new THREE.Vector3(data.x,character.height+.35,data.z),range:1.8});
}
const evidence=[
  {id:'cabinet',name:'旧木柜',hint:'检查地面与抽屉',x:.5,z:-3.57,y:1.5,
    description:'柜脚前有两道浅色拖痕。你拉开最上层的抽屉，里面暂时只剩灰尘。柜子被挪动过，但这不能说明是谁、为什么挪。',
    record:'柜脚前有新露出的浅色拖痕。上层抽屉是空的。需要向在场的人核对移动经过。'},
  {id:'bed',name:'旧床',hint:'检查床铺状态',x:-2.05,z:-3.02,y:1.05,
    description:'床单铺得很平，靠近门的一角却留着一条没有积灰的窄痕。它只能说明床铺近期被整理或移动过，不能单独证明是谁来过。',
    record:'旧床靠门一角有一条没有积灰的窄痕。床铺状态与“整间房长期无人动过”的印象不完全一致。'},
  {id:'packing',name:'清点纸',hint:'俯身查看',x:3.26,z:1.35,y:.35,
    description:'纸上只写着箱子数量，下面标着“内部未检查”。这是一张搬运清点纸，不是所有物品的完整清单。',
    record:'清点纸只登记纸箱数量，注明未检查内部。不能凭它认定某件旧物原本就在或不在箱里。'},
  {id:'photo',name:'墙上旧照',hint:'对照房间布局',x:5.38,z:.1,y:2.9,
    description:'旧照片里，木柜贴着窗边；现在，它被放在后墙旁。同一件家具，在两个时刻处于不同位置。',
    record:'照片中的柜子位置与现在不同。照片只能证明位置变过，不能单独证明移动时间。'},
  {id:'door',name:'402 房门',hint:'靠近观察',x:0,z:7.20,y:2.65,
    description:'你检查门内外能够看见的部分，没有发现明显破损。仅凭“没有破损”，并不能断定没有人进出过。',
    record:'门上没有可见的明显破损。是否有人持钥匙进入，还需询问。'}
];
const totalEvidence=evidence.length;
for(const item of evidence)targets.push({...item,type:'prop',position:new THREE.Vector3(item.x,item.y,item.z),range:1.7});
for(const target of targets){
  const el=document.createElement('div');el.className=`name-tag ${target.type}`;
  const name=document.createElement('span');name.textContent=target.name;
  const hint=document.createElement('small');hint.textContent=target.role||target.hint;
  el.append(name,hint);$('#labels').append(el);target.label=el;
}

const records=new Set(), keys=new Set(), joystick={x:0,y:0};
let currentTarget=null, activeNPC=null, drawerOpen=false, yaw=0, pitch=.39, distance=3.5;
let dragging=null, joyPointer=null, toastTimer, lastTime=0, stopped=false;
const cameraTarget=new THREE.Vector3(0,1.16,2.9), desiredCamera=new THREE.Vector3();
const ray=new THREE.Raycaster(), projected=new THREE.Vector3(), direction=new THREE.Vector3();
const eye=new THREE.Vector3(), cameraOffset=new THREE.Vector3();
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4600);}
function clearInput(){keys.clear();joystick.x=joystick.y=0;$('#stick').style.transform='';dragging=null;joyPointer=null;}
function showDialog(kicker,title,content){
  clearInput();$('#dialog-kicker').textContent=kicker;
  body.innerHTML=`<h2 id="dialog-title">${title}</h2>${content}`;
  if(!dialog.open)dialog.showModal();$('#close-dialog').focus();
}
function talk(target,answer=null){
  activeNPC=target;
  target.character.root.rotation.y=Math.atan2(player.root.position.x-target.x,player.root.position.z-target.z);
  showDialog('人物交谈 / 试玩',target.name,`<div class="speech">“${answer||target.opening}”</div><div class="choices">${target.questions.map((q,i)=>`<button class="choice" data-question="${i}">${q[0]}</button>`).join('')}<button class="choice" data-leave>结束交谈</button></div><p class="tiny">当前为预设剧情演示。自由输入问题、AI 理解与追问解锁尚未接入。</p>`);
}
function inspect(item){
  activeNPC=null;if(item.id==='cabinet')drawerOpen=true;
  showDialog('观察现场 / 可见事实',item.name,`<p class="dialog-copy">${item.description}</p><div class="choices"><button class="choice primary-action" data-record="${item.id}" ${records.has(item.id)?'disabled':''}>${records.has(item.id)?'已记入线索本':'记入线索本'}</button><button class="choice" data-leave>继续探索</button></div><p class="tiny">物品记录是观察，不自动等于结论。</p>`);
}
function interact(){if(dialog.open||!currentTarget)return;currentTarget.type==='npc'?talk(currentTarget):inspect(currentTarget);}
function addRecord(id){
  const item=evidence.find(e=>e.id===id);if(!item)return;
  records.add(id);$('#clue-count').textContent=records.size;$('#progress').textContent=`现场记录 ${records.size} / ${totalEvidence}`;
  if(records.size===totalEvidence){$('#objective').textContent='初查完成。把现场记录与三人的说法对照。';toast('已完成现场初查；这版尚未开放最终结案。');}
  else toast(`已记下：${item.name}`);
  inspect(item);
}
function notebook(){
  activeNPC=null;
  const entries=evidence.filter(e=>records.has(e.id));
  showDialog('调查员的笔记',`现场记录 · ${entries.length}/${totalEvidence}`,entries.length?entries.map(e=>`<article class="clue-entry"><h3>${e.name}</h3><p>${e.record}</p></article>`).join('')+sourceNote:`<p class="dialog-copy">还没有记录。靠近房门、旧床、木柜、清点纸或旧照片，按 E 查看，再选择“记入线索本”。</p>${sourceNote}`);
}
function help(){activeNPC=null;showDialog('操作说明 / 3D 场景试玩','先走进现场',`<div class="controls-list"><kbd>W A S D</kbd><span>移动刘看山（也可用方向键）</span><kbd>鼠标拖动</kbd><span>环绕角色转动视角</span><kbd>滚轮</kbd><span>拉近或拉远视角</span><kbd>E</kbd><span>与靠近的人物 / 物品交互</span><kbd>F / B</kbd><span>切换手电 / 打开线索本</span><kbd>Esc</kbd><span>关闭对话或笔记</span></div><p class="dialog-copy">手机：左下摇杆移动，拖动场景转动视角，点击交互按钮。</p><p class="tiny">这是第一间房的玩法原型，不是完整关卡。刘看山是参照官方素材制作的简化模型；其他角色为符合剧情的原创动物形象。人物对话暂未连接大模型。记录保留到本次页面关闭或刷新。</p>${sourceNote}`);}
function toggleTorch(){torch.visible=!torch.visible;$('#torch').textContent=`手电 · ${torch.visible?'开':'关'}`;$('#torch').setAttribute('aria-pressed',String(torch.visible));}
$('#interact').addEventListener('click',interact);$('#notebook').addEventListener('click',notebook);
$('#help').addEventListener('click',help);$('#torch').addEventListener('click',toggleTorch);
$('#close-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{activeNPC=null;clearInput();canvas.focus({preventScroll:true});});
body.addEventListener('click',event=>{
  const q=event.target.closest('[data-question]');if(q&&activeNPC)talk(activeNPC,activeNPC.questions[Number(q.dataset.question)][1]);
  const record=event.target.closest('[data-record]');if(record)addRecord(record.dataset.record);
  if(event.target.closest('[data-leave]'))dialog.close();
});
document.addEventListener('keydown',event=>{
  if(dialog.open||event.metaKey||event.ctrlKey||event.altKey)return;
  const movement=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'];
  if(movement.includes(event.code)){event.preventDefault();keys.add(event.code);}
  if(event.repeat)return;
  if(event.code==='KeyE'){event.preventDefault();interact();}
  if(event.code==='KeyF'){event.preventDefault();toggleTorch();}
  if(event.code==='KeyB'){event.preventDefault();notebook();}
});
document.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{clearInput();lastTime=0;});
canvas.addEventListener('pointerdown',event=>{
  if(dialog.open||event.button!==0||dragging)return;
  dragging={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
});
canvas.addEventListener('pointermove',event=>{
  if(!dragging||dragging.id!==event.pointerId)return;
  yaw-=(event.clientX-dragging.x)*.005;
  pitch=THREE.MathUtils.clamp(pitch+(event.clientY-dragging.y)*.003,.10,.91);
  dragging.x=event.clientX;dragging.y=event.clientY;
});
const endDrag=event=>{if(dragging?.id===event.pointerId)dragging=null;};
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
canvas.addEventListener('wheel',event=>{if(dialog.open)return;event.preventDefault();distance=THREE.MathUtils.clamp(distance+event.deltaY*.0025,2.1,5.0);},{passive:false});
const joy=$('#joystick');
function updateJoy(event){const bounds=joy.getBoundingClientRect();let x=(event.clientX-bounds.left-bounds.width/2)/40,y=(event.clientY-bounds.top-bounds.height/2)/40;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}joystick.x=x;joystick.y=y;$('#stick').style.transform=`translate(${x*33}px,${y*33}px)`;}
joy.addEventListener('pointerdown',event=>{if(joyPointer!==null||dialog.open)return;joyPointer=event.pointerId;joy.setPointerCapture(event.pointerId);updateJoy(event);});
joy.addEventListener('pointermove',event=>{if(event.pointerId===joyPointer)updateJoy(event);});
const endJoy=event=>{if(joyPointer===event.pointerId){joyPointer=null;joystick.x=joystick.y=0;$('#stick').style.transform='';}};
joy.addEventListener('pointerup',endJoy);joy.addEventListener('pointercancel',endJoy);joy.addEventListener('lostpointercapture',endJoy);

function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();stopped=true;clearInput();$('#loading').hidden=false;$('.loading-line').style.display='none';
  $('#loading-text').textContent='浏览器的 3D 绘图连接已中断，请刷新页面重新进入。';
});
// World transforms must exist before the first camera/visibility raycast.
scene.updateMatrixWorld(true);
function updateCamera(dt){
  eye.copy(player.root.position);eye.y=1.18;
  cameraTarget.lerp(eye,1-Math.exp(-12*dt));
  cameraOffset.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  desiredCamera.copy(cameraOffset).multiplyScalar(distance).add(cameraTarget);
  direction.copy(desiredCamera).sub(cameraTarget).normalize();ray.set(cameraTarget,direction);ray.far=distance;
  const hit=ray.intersectObjects(room.cameraSolids,false)[0];
  const safeDistance=hit?Math.max(.18,Math.min(distance,hit.distance-.14)):distance;
  camera.position.copy(cameraTarget).addScaledVector(direction,safeDistance);camera.lookAt(cameraTarget);
  // When a wall pushes the lens close, keep the inside of the mascot off-screen.
  player.root.visible=safeDistance>.65;
  camera.updateMatrixWorld();
}
function updateInteraction(){
  let nearest=null,best=Infinity;
  eye.copy(player.root.position);eye.y=1.2;
  for(const target of targets){
    const d=Math.hypot(player.root.position.x-target.x,player.root.position.z-target.z);
    projected.copy(target.position).project(camera);
    direction.copy(target.position).sub(camera.position);const rayLength=direction.length();
    ray.set(camera.position,direction.normalize());ray.far=Math.max(0,rayLength-.35);
    const occluded=ray.intersectObjects(room.cameraSolids,false).length>0;
    const visible=!dialog.open&&d<6.5&&projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.94&&Math.abs(projected.y)<.87&&!occluded;
    target.label.hidden=!visible;
    if(visible){target.label.style.left=`${(projected.x*.5+.5)*canvas.clientWidth}px`;target.label.style.top=`${(-projected.y*.5+.5)*canvas.clientHeight}px`;}
    // Use a separate eye-height ray: hidden labels cannot enable through-wall interactions.
    direction.set(target.x,1.2,target.z).sub(eye);ray.set(eye,direction.clone().normalize());ray.far=Math.max(0,direction.length()-.25);
    const blocked=ray.intersectObjects(room.cameraSolids,false).length>0;
    if(d<target.range&&d<best&&!blocked){nearest=target;best=d;}
  }
  currentTarget=nearest;
  $('#interact').hidden=!nearest||dialog.open;
  if(nearest)$('#interact-text').textContent=nearest.type==='npc'?`与${nearest.name.split(' · ')[1]}交谈`:`查看${nearest.name}`;
  for(const target of targets)target.label.classList.toggle('active',target===nearest);
}
function frame(time){
  if(stopped)return;
  const dt=lastTime?Math.min((time-lastTime)/1000,.05):1/60;lastTime=time;
  let moving=false;
  if(!dialog.open&&!document.hidden){
    let x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;
    let z=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+joystick.y;
    const len=Math.hypot(x,z);
    if(len>.06){
      if(len>1){x/=len;z/=len;}const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?3.5:2.25)*dt;
      const dx=(x*Math.cos(yaw)+z*Math.sin(yaw))*speed,dz=(-x*Math.sin(yaw)+z*Math.cos(yaw))*speed;
      const beforeX=player.root.position.x,beforeZ=player.root.position.z;
      moveWithCollision(player.root.position,dx,dz,room.obstacles,.30);
      moving=Math.hypot(player.root.position.x-beforeX,player.root.position.z-beforeZ)>.001;
      const angle=Math.atan2(dx,dz);player.root.rotation.y+=Math.atan2(Math.sin(angle-player.root.rotation.y),Math.cos(angle-player.root.rotation.y))*Math.min(1,dt*12);
    }
  }
  player.animate(time/1000,moving);
  targets.filter(t=>t.type==='npc').forEach((t,i)=>t.character.animate(time/1000+i*1.3,false));
  room.drawer.position.z=THREE.MathUtils.damp(room.drawer.position.z,drawerOpen ? .76 : .44,8,dt);
  updateCamera(dt);
  torch.position.copy(player.root.position).add(new THREE.Vector3(0,1.17,0));
  torch.target.position.copy(torch.position).add(new THREE.Vector3(Math.sin(player.root.rotation.y)*4,-.45,Math.cos(player.root.rotation.y)*4));
  scene.updateMatrixWorld(true);
  updateInteraction();renderer.render(scene,camera);
  if(!window.roomReady){window.roomReady=true;$('#loading').hidden=true;toast('WASD 移动 · 拖动画面转视角 · 靠近人物或物品按 E');}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
