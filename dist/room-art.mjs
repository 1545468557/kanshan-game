import * as T from 'three';
import {GLTFLoader} from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {RGBELoader} from './vendor/three/examples/jsm/loaders/RGBELoader.js';
import {OrbitControls} from './vendor/three/examples/jsm/controls/OrbitControls.js';
import {EffectComposer} from './vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/three/examples/jsm/postprocessing/RenderPass.js';
import {SSAOPass} from './vendor/three/examples/jsm/postprocessing/SSAOPass.js';
import {OutputPass} from './vendor/three/examples/jsm/postprocessing/OutputPass.js';
import {createCistern} from './cistern.mjs';
import {createWallPhoto,photoViewForViewport} from './wall-photo.mjs';
import {createDrawer} from './drawer.mjs';
import {blueBloodCase,scoreAnswer} from './blueblood-case.mjs';
import {createCharacter} from './character-meshes.mjs';
import {createKanshanPlayer} from './kanshan-player.mjs';
import {apartmentObstacles} from './apartment-navigation.mjs';

// Current furnished apartment with a controllable player. Keep the older
// room-gameplay.html prototype separate; its geometry is not this floor plan.
const $=id=>document.getElementById(id);
const canvas=$('world'), coarse=matchMedia('(pointer:coarse)').matches;
const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1.25:1.6));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.26; // v14 lighter: floor shadows appear lighter
renderer.outputColorSpace=T.SRGBColorSpace;
const scene=new T.Scene();scene.background=new T.Color('#393c34');
const sceneCharacters=[];
for(const [kind,position,rotation] of [['bear',[2.35,0,-.55],-1.15],['bird',[-.60,0,3.35],3.10],['penguin',[2.90,0,-2.05],-1.8]]){
  const character=createCharacter(T,kind);character.root.position.set(...position);character.root.rotation.y=rotation;character.root.scale.setScalar(.82);scene.add(character.root);sceneCharacters.push(character);
}
const camera=new T.PerspectiveCamera(55,1,.07,50);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.08;
controls.minDistance=1.1;controls.maxDistance=9;
controls.minPolarAngle=1.04;controls.maxPolarAngle=1.78;
controls.minAzimuthAngle=-.83;controls.maxAzimuthAngle=.83;
controls.maxTargetRadius=2.9;controls.cursor.set(0,1.2,-1.7);
controls.panSpeed=.55;controls.rotateSpeed=.45;
const views={
  wide:{position:[.45,1.78,3.85],target:[-.12,1.5,-2.48]},
  alcove:{position:[.75,1.35,.65],target:[-.15,.95,-2.9]},
  entry:{position:[-2.85,1.55,-3.32],target:[-2.95,.97,-4.95]},
  tank:{position:[-2.93,1.78,-4.30],target:[-3.12,.76,-4.96]},
  photo:{position:[.05,2.65,-1.68],target:[.20,2.18,-3.73]},
  cabinet:{position:[-2.25,1.62,.92],target:[-3.28,1.02,.48]}
};
let transition=null,activeView='wide',cistern=null,wallPhoto=null,drawer=null,selectedInspect=null,lastTankPhase='closed',lastPhotoPhase='closed',lastDrawerPhase='closed';
let playerController=null,nearby=null,toastUntil=0;
const modalOpen=()=>Boolean(document.querySelector('dialog[open]'));
function resumePlayer(){
  if(!playerController)return;
  transition=null;activeView='walk';controls.enabled=false;
  $('inspect-panel').hidden=true;selectedInspect=null;setHovered(null);
  document.body.classList.remove('observing');
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  playerController.resume();canvas.focus({preventScroll:true});
}
$('player-resume').onclick=resumePlayer;
function playerToast(text){$('player-toast').textContent=text;toastUntil=performance.now()+2600;$('player-toast').hidden=false;}
function setView(name,animate=true){
  const v=name==='photo'?photoViewForViewport(innerWidth):views[name];if(!v)return;
  if(playerController){playerController.suspend();document.body.classList.add('observing');}
  activeView=name;
  const bathroomView=name==='entry'||name==='tank',focusedView=bathroomView||name==='photo'||name==='cabinet';
  controls.minAzimuthAngle=-Infinity;controls.maxAzimuthAngle=Infinity;
  controls.cursor.set(...(focusedView?v.target:[0,1.2,-1.7]));
  controls.maxTargetRadius=focusedView ? .25 : 2.9;
  controls.minDistance=focusedView ? .55 : 1.1;controls.maxDistance=focusedView ? 2.2 : 9;
  controls.minPolarAngle=focusedView ? .32 : 1.04;controls.maxPolarAngle=focusedView ? 1.35 : 1.78;
  if(name==='photo'){controls.minDistance=v.minDistance;controls.maxDistance=v.maxDistance;controls.maxPolarAngle=1.6;}
  // Freeze orbit input during the short approach, not the rendering loop.
  controls.enabled=false;
  if(animate&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
    transition={from:camera.position.clone(),to:new T.Vector3(...v.position),fromTarget:controls.target.clone(),toTarget:new T.Vector3(...v.target),t:0};
  }else{transition=null;camera.position.set(...v.position);controls.target.set(...v.target);controls.update();controls.enabled=true;}
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===(name==='tank'?'entry':name))));
}
setView('wide',false);controls.addEventListener('start',()=>{transition=null;});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
  b.closest('details')?.removeAttribute('open');
  setView(b.dataset.view);
  const id=b.dataset.view==='entry'&&cistern?'toilet':b.dataset.view==='photo'&&wallPhoto?'photo':b.dataset.view==='cabinet'&&drawer?'cabinet':null;
  if(id)openInspection(inspectData.find(item=>item.id===id),false);else $('inspect-panel').hidden=true;
}));
const clean=on=>{document.body.classList.toggle('clean',on);$('ui-show').hidden=!on;};
$('ui-hide').onclick=()=>clean(true);$('ui-show').onclick=()=>clean(false);
$('credits-open').onclick=()=>{$('credits').showModal();$('credits-close').focus();};
$('credits-close').onclick=()=>$('credits').close();
const characterCredit=document.createElement('p');
characterCredit.textContent='刘看山使用参考官方形象制作的程序化 3D 近似模型，并非官方 3D 素材。熊、鸟、企鹅是原创动物替身；本次加入主角移动没有接通远程 AI。';
$('credits').querySelector('.credits-copy').append(characterCredit);
const memoKey='zhihu-investigation-memo-v1';
const memo=$('memo'),memoText=$('memo-text'),memoSave=$('memo-save');
try{memoText.value=localStorage.getItem(memoKey)||'';}catch{}
$('memo-open').onclick=()=>{memo.showModal();memoText.focus();};
$('memo-close').onclick=()=>memo.close();
memoText.addEventListener('input',()=>{try{localStorage.setItem(memoKey,memoText.value);memoSave.textContent='已保存在本机 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}catch{memoSave.textContent='当前浏览器不允许保存';}});

// The player's five-part explanation is deliberately independent from clue
// collection: observations inform the player, but never unlock or force an
// answer. Free-form text is scored only when the player submits the case.
const caseBoard=$('case-board'),caseForm=$('case-form'),caseResult=$('case-result');
const caseAnswers=new Map();let caseSubmitted=false;
blueBloodCase.questions.forEach((question,index)=>{
  const label=document.createElement('label');label.className='case-question';
  const title=document.createElement('span');title.textContent=`${index+1}. ${question.label}`;
  const input=document.createElement('textarea');input.rows=2;input.placeholder='写下你目前的判断……';input.dataset.question=question.id;
  try{input.value=localStorage.getItem(`zhihu-blueblood-answer-${question.id}`)||'';}catch{}
  input.addEventListener('input',()=>{caseAnswers.set(question.id,input.value);try{localStorage.setItem(`zhihu-blueblood-answer-${question.id}`,input.value);}catch{}});
  label.append(title,input);caseForm.append(label);caseAnswers.set(question.id,input.value);
});
function openCase(){caseSubmitted=false;caseResult.hidden=true;caseBoard.showModal();caseForm.querySelector('textarea')?.focus();}
$('case-open').onclick=openCase;$('case-close').onclick=()=>caseBoard.close();
$('case-reset').onclick=()=>{caseForm.querySelectorAll('textarea').forEach(input=>{input.value='';caseAnswers.set(input.dataset.question,'');try{localStorage.removeItem(`zhihu-blueblood-answer-${input.dataset.question}`);}catch{}});caseResult.hidden=true;};
$('case-submit').onclick=()=>{const scores=blueBloodCase.questions.map(q=>scoreAnswer(q,caseAnswers.get(q.id)||''));const total=scores.reduce((sum,value)=>sum+value,0);caseSubmitted=true;caseResult.hidden=false;caseResult.innerHTML=`<strong>本次解释：${total} / 5</strong><br>${total===5?'你把蓝血、来源、昨夜经过、撒谎者和动机全部串起来了。':total>=3?'大部分关键关系已经被你抓住，仍有几处需要重新核对。':'你的解释还很早期，房间里还有不少细节没有被重新组合。'}<details><summary>查看标准答案</summary>${blueBloodCase.questions.map((q,i)=>`<p><b>${i+1}. ${q.label}</b><br>${q.answer}<br><small>本题得分：${scores[i]} / 1</small></p>`).join('')}</details>`;};

let diaryPage=0;const diary=$('diary');
function renderDiary(){const page=blueBloodCase.diary[diaryPage];$('diary-page').innerHTML=`<h3>${page.date} · ${page.title}</h3><p>${page.text}</p>`;$('diary-index').textContent=`${diaryPage+1} / ${blueBloodCase.diary.length}`;$('diary-prev').disabled=diaryPage===0;$('diary-next').disabled=diaryPage===blueBloodCase.diary.length-1;}
$('diary-open').onclick=()=>{diaryPage=0;renderDiary();diary.showModal();};$('diary-close').onclick=()=>diary.close();$('diary-prev').onclick=()=>{diaryPage=Math.max(0,diaryPage-1);renderDiary();};$('diary-next').onclick=()=>{diaryPage=Math.min(blueBloodCase.diary.length-1,diaryPage+1);renderDiary();};

const npcBoard=$('npc-board');
function renderNPCs(id){
  $('npc-copy').innerHTML=blueBloodCase.npc.filter(person=>!id||person.id===id).map(person=>`<article class="npc-card"><h3>${person.name}</h3><p>${person.opening}</p><div class="npc-ask"><input aria-label="向${person.name}提问" placeholder="问一个具体问题……" data-npc="${person.id}"><button type="button" data-ask-npc="${person.id}">追问</button></div><p class="npc-answer" data-npc-answer="${person.id}" hidden></p></article>`).join('')+'<p class="tiny">当前为本地预设对话，尚未连接大模型。</p>';
}
function npcReply(person,text){
  const t=text.toLowerCase();
  if(person.id==='trainer'){
    if(/假伤|贴片|道具|瓶|模拟/.test(t))return '教具里确实有模拟用品，但你不能仅凭它们证明昨晚使用过。';
    if(/录像|拍摄|反应|观察|测试|为什么/.test(t))return '记录演示效果很正常。至于你提出质疑时的反应，只能说明你当时比较紧张。';
    return person.opening;
  }
  if(person.id==='zhangwei'){
    if(/看见|血|颜色|伤口/.test(t))return '我看见的是蓝色液体，不是伤口内部。现在想想，我当时把“看到”直接当成了“理解”。';
    if(/坚持|聚餐|改口|培训师|老师/.test(t))return '他之前问过我，你是不是那种会坚持再核对一次的人。我当时只觉得他在了解培训对象。';
    return person.opening;
  }
  if(/录像|拍摄|镜头|时间/.test(t))return '你自己看时间轴吧。镜头在你质疑之后才真正对准你，这个我可以确认。';
  if(/教具|箱子|瓶|来源/.test(t))return '教具箱是我送来的，蓝色液体和假伤口贴片都在里面。其他的，我没有动。';
  return person.opening;
}
$('npc-open').onclick=()=>{renderNPCs();npcBoard.showModal();};$('npc-close').onclick=()=>npcBoard.close();
$('npc-copy').addEventListener('click',e=>{const button=e.target.closest('[data-ask-npc]');if(!button)return;const person=blueBloodCase.npc.find(item=>item.id===button.dataset.askNpc);const input=document.querySelector(`input[data-npc="${person.id}"]`);const answer=document.querySelector(`[data-npc-answer="${person.id}"]`);answer.textContent=npcReply(person,input.value);answer.hidden=false;input.value='';});
document.addEventListener('keydown',e=>{
  if(modalOpen()||e.target.closest?.('textarea,input,[contenteditable=true]')||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='Escape'){clean(false);if(!$('inspect-panel').hidden||activeView!=='walk')resumePlayer();}
});

const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const ao=new SSAOPass(scene,camera,innerWidth,innerHeight,16);
ao.kernelRadius=3;ao.minDistance=.006;ao.maxDistance=.022; // v31: was (5 / .003 / .08) — .08 ≈ 4 m of depth range at near .07 / far 50, so the AO bled a halo around the moving protagonist
composer.addPass(ao);composer.addPass(new OutputPass());
function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  renderer.setSize(w,h,false);composer.setSize(w,h);
  camera.aspect=w/h;camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();
let last=0,stopped=false;
canvas.addEventListener('webglcontextlost',e=>{
  e.preventDefault();stopped=true;$('loading').hidden=false;
  $('loading-text').textContent='三维绘图连接中断，请重新加载。';$('load-progress').hidden=true;$('retry').hidden=false;
});
function frame(now){
  if(stopped)return;
  const dt=last?Math.min((now-last)/1000,.05):.016;last=now;
  if(transition){
    transition.t=Math.min(1,transition.t+dt*1.45);
    const t=transition.t*transition.t*(3-2*transition.t);
    camera.position.lerpVectors(transition.from,transition.to,t);
    controls.target.lerpVectors(transition.fromTarget,transition.toTarget,t);
    camera.lookAt(controls.target);
    if(transition.t===1){transition=null;controls.enabled=true;}
  }
  else if(!playerController||activeView!=='walk')controls.update();
  playerController?.update(dt,now/1000);
  if(playerController){
    if(activeView==='walk')controls.target.copy(playerController.root.position).setY(1.04);
    updateNearby();
    if(now>toastUntil)$('player-toast').hidden=true;
  }
  if(cistern){cistern.update(dt);const phase=cistern.state().phase;if(phase!==lastTankPhase){lastTankPhase=phase;if(selectedInspect?.id==='toilet')renderInspection();}}
  if(wallPhoto){wallPhoto.update(dt);const phase=wallPhoto.state().phase;if(phase!==lastPhotoPhase){lastPhotoPhase=phase;if(selectedInspect?.id==='photo')renderInspection();}}
  if(drawer){drawer.update(dt);const phase=drawer.state().phase;if(phase!==lastDrawerPhase){lastDrawerPhase=phase;if(selectedInspect?.id==='cabinet')renderInspection();}}
  sceneCharacters.forEach((character,index)=>character.animate(now/1000+index*.8,false));
  if(window.roomArtReport){window.roomArtReport.camera=camera.position.toArray();window.roomArtReport.target=controls.target.toArray();window.roomArtReport.cistern=cistern?.state();window.roomArtReport.photo=wallPhoto?.state();window.roomArtReport.drawer=drawer?.state();window.roomArtReport.view=activeView;window.roomArtReport.player={...playerController?.state(),nearby:nearby?.id||null};}
  const renderStart=performance.now();
  if(!document.hidden)composer.render();
  if(window.roomArtReport)window.roomArtReport.renderMs=Math.round((performance.now()-renderStart)*10)/10;
  requestAnimationFrame(frame);
}

let completed=0;const failures=[],modelBounds=[],loadedModels=[];
function done(label){
  completed++;$('load-progress').value=completed;
  $('loading-text').textContent='正在布置：'+label+' · '+completed+'/'+$('load-progress').max;
}
const textures=new T.TextureLoader();
async function material(id,tint='#ffffff',glow=null){
  const maps=await Promise.all(['color','normal','roughness'].map(async key=>{
    const texture=await textures.loadAsync('./assets/materials/'+id+'/'+key+'.jpg');
    texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    if(key==='color')texture.colorSpace=T.SRGBColorSpace;return texture;
  }));
  const m=new T.MeshStandardMaterial({map:maps[0],normalMap:maps[1],roughnessMap:maps[2],color:tint,roughness:1,normalScale:new T.Vector2(.5,.5),emissive:glow||'#000000',emissiveIntensity:glow?.5:0});
  done(id);return m;
}
const [plaster,wood,floor,lime]=await Promise.all([
  material('worn_plaster_wall','#c6b89e'),
  material('wood_peeling_paint_weathered','#85725f'),
  material('old_wooden_floor_02','#b8b1a4','#8d8475'),
  material('grey_plaster','#d6c9b4')
]);
const architecture=new T.Group();architecture.name='new-apartment-architecture';scene.add(architecture);
// A procedural aged-plaster texture is used as a thin interior finish. It
// gives the large side walls real variation (fine grain, old roller bands,
// damp blooms and hairline seams) instead of a single dark colour.
function agedPlasterMaterial(){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#9b927f';ctx.fillRect(0,0,768,768);
  const random=seed=>{let x=seed;return()=>{x=(x*1664525+1013904223)%4294967296;return x/4294967296;};};
  const r=random(402);
  for(let i=0;i<5200;i++){const x=r()*768,y=r()*768,s=.3+r()*2.6;ctx.fillStyle=`rgba(${55+Math.floor(r()*45)},${48+Math.floor(r()*42)},${38+Math.floor(r()*35)},${.035+r()*.10})`;ctx.fillRect(x,y,s,s);}
  for(const stain of [[.12,.28,.20,.14],[.73,.66,.26,.20],[.42,.87,.18,.08],[.88,.18,.15,.10]]){const g=ctx.createRadialGradient(stain[0]*768,stain[1]*768,2,stain[0]*768,stain[1]*768,stain[2]*768);g.addColorStop(0,'rgba(72,60,47,.28)');g.addColorStop(1,'rgba(72,60,47,0)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(stain[0]*768,stain[1]*768,stain[2]*768,stain[3]*768,0,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='rgba(67,58,48,.23)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,274);ctx.bezierCurveTo(170,267,330,281,500,270);ctx.bezierCurveTo(620,264,705,275,768,267);ctx.stroke();
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(2.3,1.15);texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const material=new T.MeshStandardMaterial({map:texture,roughness:.96,metalness:0,color:'#907656',emissive:'#7a6746',emissiveIntensity:.55});
  // The player may look from an unusual angle near a wall. Render the aged
  // finish from either side so an accidental near-plane view never exposes
  // the scene background as a hollow wall.
  material.side=T.DoubleSide;
  return material;
}
const limeUnused=agedPlasterMaterial();
// One texel density for every wall plane. All planes now use world-anchored UVs
// (see surface() below), so a single density keeps the plaster continuous; 2.8 m
// per tile is large enough that the aged texture reads as soft wear, not busy grime.
const WALL_TILE=2.8, CEIL_TILE=3;
function surface(w,h,x,y,z,ry,mat=plaster,scale=WALL_TILE){
  const g=new T.PlaneGeometry(w,h);const uv=g.attributes.uv;
  // Anchor the finish to world space rather than to the plane's own origin, so
  // all the planes that make up one wall sample one continuous plaster field.
  // The jambs, returns and lintels around the front niche then line up with the
  // long walls instead of each showing an unrelated slice of the map.
  const tx=Math.cos(ry),tz=-Math.sin(ry);
  const uBase=(x*tx+z*tz-w/2)/scale,vBase=(y-h/2)/scale;
  for(let i=0;i<uv.count;i++){uv.setXY(i,uBase+uv.getX(i)*w/scale,vBase+uv.getY(i)*h/scale);}
  const m=new T.Mesh(g,mat);m.position.set(x,y,z);m.rotation.y=ry;m.castShadow=m.receiveShadow=true;architecture.add(m);return m;
}
// Boxes here are load-bearing walls and moulding substrates, never stand-ins
// for the furniture. Face texture scale follows physical dimensions.
function structural(w,h,d,x,y,z,mat=wood){
  const g=new T.BoxGeometry(w,h,d),uv=g.attributes.uv;
  for(let face=0;face<6;face++){
    const dims=face<2?[d,h]:face<4?[w,d]:[w,h];
    for(let j=0;j<4;j++){const i=face*4+j;uv.setXY(i,uv.getX(i)*dims[0]/1.7,uv.getY(i)*dims[1]/1.7);}
  }
  const m=new T.Mesh(g,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;architecture.add(m);return m;
}
const ground=surface(7.5,10,0,-.012,-.65,0,floor,2.65);ground.rotation.x=-Math.PI/2;
const ceiling=surface(7.5,9.5,0,3.5,-.65,0,lime,CEIL_TILE);ceiling.rotation.x=Math.PI/2;
surface(8.5,3.5,-3.75,1.75,-.2,Math.PI/2,lime,WALL_TILE);
// Interior finish planes sit a few centimetres inside the structural walls so
// the textured surface is what the player sees, while the original planes
// continue to provide collision and occlusion.
surface(8.5,3.5,-3.695,1.75,-.2,Math.PI/2,lime,WALL_TILE);
// Right wall has a physical window aperture. Only light through it can make
// the long afternoon shadows across the floor.
surface(3.6,3.5,3.75,1.75,-2.95,-Math.PI/2,lime,WALL_TILE);
surface(2,3.5,3.75,1.75,2.5,-Math.PI/2,lime,WALL_TILE);
surface(2.05,.85,3.75,.425,.28,-Math.PI/2,lime,WALL_TILE);
surface(2.05,.48,3.75,3.26,.28,-Math.PI/2,lime,WALL_TILE);
surface(3.6,3.5,3.695,1.75,-2.95,-Math.PI/2,lime,WALL_TILE);
surface(2,3.5,3.695,1.75,2.5,-Math.PI/2,lime,WALL_TILE);
// Frontal composition: dark side passage, deep centre niche, closed door.
surface(.32,3.5,-3.59,1.75,-3.18,0,lime,WALL_TILE);
surface(.7,3.5,-1.95,1.75,-3.18,0,lime,WALL_TILE);
surface(1.12,.54,-2.9,3.23,-3.18,0,lime,WALL_TILE);
surface(.52,3.5,1.82,1.75,-3.18,0,lime,WALL_TILE);
surface(.25,3.5,3.62,1.75,-3.18,0,lime,WALL_TILE);
surface(1.31,.55,2.85,3.225,-3.18,0,lime,WALL_TILE);
surface(3.4,.4,-.08,3.3,-3.18,0,lime,WALL_TILE);
// The recessed back wall is the surface seen in the close side camera. It
// must receive the same aged finish as the side walls; otherwise it reads as
// an unfinished dark-green placeholder behind the actual furnishings.
surface(3.38,3.1,-.08,1.55,-3.84,0,lime,WALL_TILE);
surface(.66,3.1,-1.77,1.55,-3.51,Math.PI/2,lime,WALL_TILE);
surface(.66,3.1,1.61,1.55,-3.51,-Math.PI/2,lime,WALL_TILE);
const nicheSoffit=surface(3.38,.66,-.08,3.1,-3.51,0,lime,WALL_TILE);nicheSoffit.rotation.x=Math.PI/2;
// The +z end of the main room was open: the right wall stops at z~3.5 and
// no cross-wall closed the rear, so rear-facing cameras saw the scene
// background as a blank dark-green wall. Close it with the same aged
// plaster so every wall reads identically.
surface(7.5,3.5,0,1.75,4.05,Math.PI,lime,WALL_TILE);
surface(.55,3.5,3.75,1.75,3.775,-Math.PI/2,lime,WALL_TILE);
// Wall treatment: the old plaster is not a single unbroken colour field.
// These restrained, physical decals and the low skirting catch side light and
// make the wall read as a used surface even when the camera is close to it.
const wallWear=new T.Group();wallWear.name='old-wall-wear';scene.add(wallWear);
const wearMat=new T.MeshStandardMaterial({color:'#625d4e',roughness:1,transparent:true,opacity:.22,depthWrite:false}); // v16 blend into wall
const crackMat=new T.MeshStandardMaterial({color:'#5a5547',roughness:1,transparent:true,opacity:.45,depthWrite:false}); // v16 blend into wall
function rightWallPatch(z,y,sx,sy,rotation=0){
  const patch=new T.Mesh(new T.CircleGeometry(1,18),wearMat);patch.position.set(3.705,y,z);patch.rotation.y=-Math.PI/2;patch.rotation.z=rotation;patch.scale.set(sx,sy,1);wallWear.add(patch);return patch;
}
rightWallPatch(.42,1.26,.34,.18,-.28);rightWallPatch(2.86,2.64,.26,.14,.42);rightWallPatch(1.88,.64,.20,.11,-.15);
function leftWallPatch(z,y,sx,sy,rotation=0){
  const patch=new T.Mesh(new T.CircleGeometry(1,18),wearMat);patch.position.set(-3.695,y,z);patch.rotation.y=Math.PI/2;patch.rotation.z=rotation;patch.scale.set(sx,sy,1);wallWear.add(patch);return patch;
}
// Large, irregular repair blooms make the blank wall beside the cabinet read
// as the same old plaster, rather than an untextured placeholder.
leftWallPatch(1.98,2.52,.54,.30,-.18);leftWallPatch(2.72,1.32,.32,.18,.25);leftWallPatch(.72,2.02,.28,.15,-.35);
// v32: the rectangular repair patch was removed. Its material carried a flat
// untextured colour (#666052) while the surrounding plaster used a dark worn
// map, so it blended out noticeably brighter and read as a board stuck on the
// wall — most obvious while the camera moved past it. The three soft circular
// wear blooms above are kept: they are gradients, so they read as age instead.
for(const [z,y,len,lean] of [[.68,2.45,.56,-.06],[1.34,1.74,.42,.04],[2.76,1.25,.30,-.08]]){
  const crack=new T.Mesh(new T.BoxGeometry(.012,len,.018),crackMat);crack.position.set(3.698,y,z);crack.rotation.y=-Math.PI/2;crack.rotation.z=lean;wallWear.add(crack);
}
for(const [z,w] of [[-2.96,3.1],[-1.72,2.1],[2.48,2.0]]){
  const skirting=structural(.12,.16,w,3.67,.08,z,wood);skirting.name='wall-skirting';
}
// One old switch plate and a cable clip keep the broad side wall legible at
// human eye level without turning it into a clue board.
const switchPlate=structural(.035,.24,.16,3.685,1.32,.10,wood);switchPlate.rotation.y=Math.PI/2;switchPlate.name='aged-switch-plate';
const switchMat=new T.MeshStandardMaterial({color:'#89704e',roughness:.43,metalness:.78});
const switchButton=new T.Mesh(new T.BoxGeometry(.018,.075,.052),switchMat);switchButton.position.set(3.65,1.33,.10);switchButton.castShadow=switchButton.receiveShadow=true;scene.add(switchButton);
// A lived-in old apartment needs a few wall-scale objects. This faded
// residents' notice is deliberately quiet: paper, glass glare and a crooked
// timber frame give the blank side wall a believable history without turning
// it into a decorative clue board.
function wallNotice(){
  const group=new T.Group();group.name='faded-residents-notice';
  const frameMat=new T.MeshStandardMaterial({color:'#604b36',roughness:.78,metalness:.05});
  const paperMat=new T.MeshStandardMaterial({color:'#b5a98f',roughness:.92});
  const glassMat=new T.MeshPhysicalMaterial({color:'#b5c0bd',roughness:.12,metalness:.05,transmission:.16,transparent:true,opacity:.25});
  const lineMat=new T.MeshBasicMaterial({color:'#655d4c',transparent:true,opacity:.56});
  const add=(mesh,x,y,z,ry=0)=>{mesh.position.set(x,y,z);mesh.rotation.y=ry;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;};
  const x=3.705,y=2.28,z=2.28,ry=-Math.PI/2;
  // v35: the backing board had its height and depth swapped (.045 tall, 1.28
  // deep), so it read as a shelf jutting ~1.3 m into the room through the
  // notice. BoxGeometry is (width along wall, height, depth off the wall).
  add(new T.Mesh(new T.BoxGeometry(.95,1.28,.045),frameMat),x,y,z,ry);
  add(new T.Mesh(new T.PlaneGeometry(.77,1.10),paperMat),x-.028,y,z,ry);
  add(new T.Mesh(new T.PlaneGeometry(.78,1.11),glassMat),x-.052,y,z,ry);
  for(const [dy,w] of [[.36,.53],[.16,.66],[-.06,.62],[-.28,.48]]){
    const line=add(new T.Mesh(new T.PlaneGeometry(.035,w),lineMat),x-.065,y+dy,z,ry);line.rotation.z=Math.PI/2;
  }
  const pin=add(new T.Mesh(new T.SphereGeometry(.035,12,8),new T.MeshStandardMaterial({color:'#a46f42',metalness:.6,roughness:.3})),x-.08,y+.43,z,ry);
  pin.scale.set(.7,1,.7);group.position.set(0,.02,0);return group;
}
const residentsNotice=wallNotice();scene.add(residentsNotice);
function leftWallCalendar(){
  const group=new T.Group();group.name='old-wall-calendar';
  const woodMat=new T.MeshStandardMaterial({color:'#5e4935',roughness:.82});
  const paperMat=new T.MeshStandardMaterial({color:'#c8bda2',roughness:.95});
  const x=-3.698,y=2.22,z=1.34,ry=Math.PI/2;
  const add=(mesh,px,py,pz)=>{mesh.position.set(px,py,pz);mesh.rotation.y=ry;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;};
  // A shallow timber frame, a stack of old sheets, and two visible binder rings.
  // BoxGeometry is authored in LOCAL axes and then rotated by ry=Math.PI/2, so
  // local x -> world z (width along the wall), local y -> world y (height),
  // local z -> world x (depth off the wall). The frame and the sheet stack had
  // their height and depth swapped, which made them jut ~1 m into the room.
  add(new T.Mesh(new T.BoxGeometry(.82,1.06,.055),woodMat),x,y,z);
  add(new T.Mesh(new T.BoxGeometry(.67,.88,.018),paperMat),x+.038,y,z);
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=960;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#d1c3a4';ctx.fillRect(0,0,720,960);
  ctx.fillStyle='#8d4c3e';ctx.fillRect(0,0,720,150);
  ctx.fillStyle='#eadfc6';ctx.font='bold 62px serif';ctx.fillText('八月',42,100);
  ctx.font='26px sans-serif';ctx.fillText('1998  ·  旧公寓值日表',365,91);
  const left=42,top=205,cw=91,ch=102;ctx.strokeStyle='#756958';ctx.lineWidth=2;
  ctx.font='24px sans-serif';ctx.fillStyle='#6c5b4c';['日','一','二','三','四','五','六'].forEach((d,i)=>ctx.fillText(d,left+i*cw+31,top-26));
  for(let r=0;r<6;r++)for(let c=0;c<7;c++){ctx.strokeRect(left+c*cw,top+r*ch,cw,ch);const day=r*7+c-5;if(day>0&&day<=31){ctx.font='22px sans-serif';ctx.fillStyle=c===0?'#9a4c45':'#625849';ctx.fillText(String(day),left+c*cw+12,top+r*ch+31);if((day===6||day===18||day===27)&&r>0){ctx.strokeStyle='#a05c4d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(left+c*cw+18,top+r*ch+48);ctx.lineTo(left+c*cw+63,top+r*ch+71);ctx.stroke();ctx.strokeStyle='#756958';ctx.lineWidth=2;}}}
  ctx.fillStyle='#766451';ctx.font='19px serif';ctx.fillText('缴费 · 晾晒 · 夜间安静',42,887);ctx.fillStyle='#a08e73';ctx.fillRect(42,914,420,3);
  const calendarTex=new T.CanvasTexture(canvas);calendarTex.colorSpace=T.SRGBColorSpace;calendarTex.anisotropy=4;
  add(new T.Mesh(new T.PlaneGeometry(.61,.82),new T.MeshStandardMaterial({map:calendarTex,roughness:.92})),x+.052,y,z);
  const ringMat=new T.MeshStandardMaterial({color:'#777067',metalness:.72,roughness:.32});
  for(const rz of [-.19,.19]){const ring=new T.Mesh(new T.TorusGeometry(.035,.009,8,18),ringMat);ring.position.set(x+.07,y+.42,z+rz);ring.rotation.set(Math.PI/2,0,0);ring.castShadow=true;group.add(ring);}
  const curl=new T.Mesh(new T.PlaneGeometry(.11,.09),new T.MeshStandardMaterial({color:'#b3a384',roughness:1}));curl.position.set(x+.061,y-.36,z+.25);curl.rotation.set(0,ry,.22);group.add(curl);
  return group;
}
scene.add(leftWallCalendar());
// The short side passage supplies real parallax and occlusion, not a flat
// image of another room. It remains part of this single art-review space.
surface(2.35,3.5,-3.50,1.75,-4.30,Math.PI/2,lime,WALL_TILE);
surface(2.35,3.5,-2.28,1.75,-4.30,-Math.PI/2,lime,WALL_TILE);
surface(1.22,3.5,-2.89,1.75,-5.46,0,lime,WALL_TILE);
const corridorFill=new T.PointLight('#b7c3a0',.8,4,2);corridorFill.position.set(-2.9,2.6,-4.7);scene.add(corridorFill);
// Multi-profile door casings and room skirting, restrained faded pink-brown.
function casing(cx,z,width,height){
  for(const side of [-1,1]){
    structural(.16,height+.14,.14,cx+side*(width/2+.08),height/2,z);
    structural(.045,height+.23,.22,cx+side*(width/2+.16),height/2+.02,z+.025);
    structural(.024,height,.055,cx+side*(width/2+.015),height/2,z+.1);
  }
  structural(width+.32,.16,.15,cx,height+.02,z);
  structural(width+.4,.045,.22,cx,height+.12,z+.035);
}
casing(-2.89,-3.04,1.1,2.94);casing(2.86,-3.03,1.2,2.93);
for(const z of [-3.8]){
  structural(3.37,.22,.065,-.08,.11,z+.02);
  structural(3.37,.045,.095,-.08,.23,z+.03);
}
for(const x of [-3.7,3.7]){
  structural(.075,.21,7.6,x,.105,.3);structural(.1,.035,7.6,x,.225,.3);
  structural(.17,.095,7.6,x,3.37,.3);structural(.08,.16,7.6,x,3.44,.3);
}
structural(7.5,.09,.18,0,3.37,-3.1);structural(7.5,.16,.08,0,3.44,-3.14);
// Window: deep sill, separate mullions and weathered timber frame.
for(const z of [-.78,.28,1.34])structural(.12,2.18,.065,3.65,1.96,z);
for(const y of [.87,1.96,3.05])structural(.12,.075,2.22,3.65,y,.28);
structural(.37,.09,2.40,3.60,.825,.28);structural(.06,2.36,.09,3.7,1.97,-.91);structural(.06,2.36,.09,3.7,1.97,1.47);
const outside=new T.MeshBasicMaterial({color:'#b5b8a2',side:T.DoubleSide});
surface(2.3,2.3,4.1,2,.28,-Math.PI/2,outside).castShadow=false;
// Single panelled apartment door, constructed as a continuous frame with
// stepped inset panels and hardware rather than a blank rectangular slab.
const doorwood=new T.MeshStandardMaterial({color:'#94705a',normalMap:wood.normalMap,roughnessMap:wood.roughnessMap,roughness:.9,normalScale:new T.Vector2(.38,.38)});
structural(1.16,2.89,.095,2.86,1.445,-3.13,doorwood);
for(const [cy,h] of [[.72,1.03],[2.05,1.23]]){
  const panel=structural(.84,h,.028,2.86,cy,-3.065,doorwood);
  for(const x of [2.40,3.32]){
    structural(.055,h+.10,.05,x,cy,-3.015,doorwood);
    structural(.018,h,.025,x+(x<2.8?.035:-.035),cy,-2.985,doorwood);
  }
  for(const y of [cy-h/2-.035,cy+h/2+.035]){
    structural(.98,.06,.05,2.86,y,-3.014,doorwood);
    structural(.87,.017,.022,2.86,y+(y<cy?.04:-.04),-2.985,doorwood);
  }
  panel.receiveShadow=true;
}
const brass=new T.MeshStandardMaterial({color:'#89704e',roughness:.43,metalness:.78});
structural(.085,.23,.018,2.42,1.34,-3.035,brass);
const knob=new T.Mesh(new T.SphereGeometry(.035,20,12),brass);knob.position.set(2.42,1.40,-2.987);architecture.add(knob);
const lever=new T.Mesh(new T.CapsuleGeometry(.017,.10,4,10),brass);lever.rotation.z=Math.PI/2;lever.position.set(2.46,1.40,-2.97);architecture.add(lever);
// Functional room plate; canvas text is signage, not fake scene imagery.
const plateCanvas=document.createElement('canvas');plateCanvas.width=256;plateCanvas.height=128;
const ctx=plateCanvas.getContext('2d');ctx.fillStyle='#a48d65';ctx.fillRect(0,0,256,128);ctx.strokeStyle='#4c4030';ctx.lineWidth=5;ctx.strokeRect(8,8,240,112);ctx.fillStyle='#28241c';ctx.textAlign='center';ctx.font='66px Georgia';ctx.fillText('402',128,87);
const plateMap=new T.CanvasTexture(plateCanvas);plateMap.colorSpace=T.SRGBColorSpace;
const plate=surface(.24,.12,2.86,2.49,-3.005,0,new T.MeshStandardMaterial({map:plateMap,roughness:.6,metalness:.25}),1);
plate.geometry.attributes.uv.setXY(0,0,1);plate.geometry.attributes.uv.setXY(1,1,1);plate.geometry.attributes.uv.setXY(2,0,0);plate.geometry.attributes.uv.setXY(3,1,0);

// The narrow side doorway is a small old-apartment bathroom, not a storage
// alcove.  The fixtures are deliberately readable from the entry camera so
// the player understands the room layout at a glance.
const bathroom=new T.Group();bathroom.name='old-apartment-bathroom';scene.add(bathroom);
const tileMat=new T.MeshStandardMaterial({color:'#b8b7ac',roughness:.78,metalness:.02});
const ceramic=new T.MeshStandardMaterial({color:'#e2dfd4',roughness:.32,metalness:.02});
const porcelain=new T.MeshStandardMaterial({color:'#d5d2c7',roughness:.22,metalness:.02});
const chrome=new T.MeshStandardMaterial({color:'#777a72',roughness:.25,metalness:.78});
const mirrorMat=new T.MeshStandardMaterial({color:'#9da6a5',roughness:.12,metalness:.65});
function bathBox(w,h,d,x,y,z,mat){
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;bathroom.add(mesh);return mesh;
}
function bathCyl(radius,height,x,y,z,mat,radial=24){
  const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,height,radial),mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;bathroom.add(mesh);return mesh;
}
// Back wall tile field and two short tiled returns; grout-like strips keep the
// surfaces legible without introducing a flat placeholder image.
bathBox(1.18,3.02,.035,-2.89,1.52,-5.42,tileMat);
for(const y of [.54,1.04,1.54,2.04,2.54,3.04])bathBox(1.19,.018,.045,-2.89,y,-5.395,ceramic);
for(const x of [-3.18,-2.89,-2.60])bathBox(.018,3.02,.045,x,1.52,-5.395,ceramic);
// Wall-mounted washbasin on the right return, with a visible trap and tap.
bathBox(.43,.075,.31,-2.43,1.03,-4.82,porcelain);
bathBox(.36,.045,.24,-2.43,1.075,-4.82,ceramic);
bathCyl(.024,.20,-2.43,1.18,-4.82,chrome,16);
bathCyl(.018,.16,-2.43,1.28,-4.82,chrome,16);
bathCyl(.012,.18,-2.43,1.36,-4.82,chrome,12).rotation.z=Math.PI/2;
bathCyl(.018,.20,-2.43,.91,-4.82,chrome,16);
// A narrow framed mirror makes the object read as a wash area from a distance.
bathBox(.055,.72,.46,-2.315,1.82,-4.82,wood);
bathBox(.018,.56,.34,-2.282,1.82,-4.82,mirrorMat);
for(const z of [-5.06,-4.58])bathBox(.065,.045,.46,-2.30,1.82,z,wood);
// Compact toilet tucked against the left wall: bowl, rim, cistern and flush.
bathCyl(.28,.18,-3.18,.23,-4.66,porcelain,28);
bathCyl(.23,.20,-3.18,.34,-4.66,ceramic,28);
const seat=new T.Mesh(new T.TorusGeometry(.19,.035,12,28),porcelain);seat.rotation.x=Math.PI/2;seat.position.set(-3.18,.47,-4.66);seat.castShadow=seat.receiveShadow=true;bathroom.add(seat);
cistern=createCistern();cistern.root.position.set(-3.18,.43,-5.00);bathroom.add(cistern.root);
// Small aged drain and a cool light source give the tiled room depth.
bathCyl(.085,.012,-2.88,.012,-4.72,chrome,24);
const bathLight=new T.PointLight('#d9e2d2',1.1,3.4,2);bathLight.position.set(-2.88,2.55,-4.82);bathroom.add(bathLight);

// v34: the ambient used to be a cool green-grey (#d2d7c6) at low intensity, so
// any wall out of the direct sun picked up a green cast while sunlit walls read
// warm — the "two different wall colours" split. Warm it up and raise it so the
// whole room shares one warm, aged-plaster tone.
scene.add(new T.HemisphereLight('#ddd0b6','#4a4436',.7));
const sun=new T.DirectionalLight('#ffe1ad',3.6);
sun.position.set(6,3.8,1.4);sun.target.position.set(-1,.15,-2.5);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:22});
sun.shadow.bias=-.00015;sun.shadow.normalBias=.025;sun.shadow.radius=3;scene.add(sun,sun.target);
const windowBounce=new T.PointLight('#d8d8bd',3,10,2);windowBounce.position.set(3.20,2.10,.1);scene.add(windowBounce);
const roomBounce=new T.PointLight('#bd9d7d',1.2,9,2);roomBounce.position.set(-1,2.8,.3);scene.add(roomBounce);
const plasterFillLeft=new T.PointLight('#e0c6a1',2,7,2);plasterFillLeft.position.set(-2.7,2.25,.55);scene.add(plasterFillLeft);
const plasterFillRight=new T.PointLight('#d7bea0',1.6,6,2);plasterFillRight.position.set(2.7,2.1,1.55);scene.add(plasterFillRight);
const pmrem=new T.PMREMGenerator(renderer);
const hdrTask=new RGBELoader().loadAsync('./assets/materials/old_room.hdr').then(hdr=>{
  const env=pmrem.fromEquirectangular(hdr);scene.environment=env.texture;scene.environmentIntensity=.55;hdr.dispose();pmrem.dispose();done('室内环境光');
}).catch(e=>{failures.push('环境光');console.error(e);done('环境光未载入');});

const modelSpecs=[
  {id:'Sofa_01',label:'旧布艺木沙发',width:2.5,x:-.08,z:-3.15,rot:0},
  {id:'painted_wooden_chair_02',label:'靠窗旧木椅',height:1.04,x:2.72,z:1.92,rot:Math.PI},
  {id:'round_wooden_table_01',label:'圆木边桌',height:.68,x:-1.78,z:3.12,rot:.13},
  {id:'vintage_cabinet_01',label:'旧木柜',height:1.76,x:-3.30,z:-.05,rot:Math.PI/2},
  // The lamp belongs on the round table (its warm pool of light, lampGlow, has
  // always sat there); its y is the case bottom, so 0.68 = the table top.
  {id:'desk_lamp_arm_01',label:'金属台灯',height:.48,x:-1.93,y:.68,z:3.00,rot:1.8},
  {id:'book_encyclopedia_set_01',label:'旧书',height:.3,x:-.6,y:.5,z:-3.15,rot:.20}
];
$('load-progress').max=modelSpecs.length+7;
const photoTask=textures.loadAsync('./assets/wall-photo-v1.png').then(texture=>{
  texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  wallPhoto=createWallPhoto({texture,wallMaterial:plaster,frameMaterial:wood});
  wallPhoto.root.position.set(-.18,2.18,-3.832);scene.add(wallPhoto.root);done('可移动旧照片');
}).catch(error=>{failures.push('墙上照片');console.error(error);done('墙上照片未载入');});
drawer=createDrawer({material:wood,handleMaterial:brass});
drawer.root.position.set(-3.30,1.08,.76);scene.add(drawer.root);done('可操作旧木柜抽屉');
const loader=new GLTFLoader();
const assetList=$('asset-list');
for(const spec of modelSpecs){
  const li=document.createElement('li'),a=document.createElement('a');a.href='https://polyhaven.com/a/'+spec.id;a.textContent=spec.label;a.target='_blank';a.rel='noopener noreferrer';li.append(a);assetList.append(li);
}
async function loadModel(spec){
  const gltf=await loader.loadAsync('./assets/room-v2-models/'+spec.id+'/'+spec.id+'_1k.gltf');
  const model=gltf.scene;model.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  const s=spec.width?spec.width/size.x:spec.height/size.y;
  // Ground each mesh on its lowest point before rotation and placement.
  model.position.set(-center.x,-bounds.min.y,-center.z);
  const scaled=new T.Group();scaled.add(model);scaled.scale.setScalar(s);
  const placed=new T.Group();placed.name='asset-'+spec.id;placed.add(scaled);
  placed.position.set(spec.x,spec.y||0,spec.z);placed.rotation.y=spec.rot||0;
  model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;for(const m of [o.material].flat()){if(m.map)m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}}});
  scene.add(placed);loadedModels.push(placed);placed.updateMatrixWorld(true);
  const b=new T.Box3().setFromObject(placed);modelBounds.push({id:spec.id,min:b.min.toArray(),max:b.max.toArray()});
  done(spec.label);return placed;
}
const modelTasks=modelSpecs.map(spec=>loadModel(spec).catch(e=>{failures.push(spec.label);console.error(spec.id,e);done(spec.label+'未载入');}));
requestAnimationFrame(frame);
await Promise.all([hdrTask,photoTask,...modelTasks]);
// Observation layer: every major visible object can be inspected without an
// AI request. Key observations are fixed facts for this art-preview slice;
// later the chapter manifest can replace them with source-checked clues.
const inspectData=[
  {id:'table',name:'圆木桌',type:'环境记录',position:[-1.78,.78,3.12],radius:.52,text:'桌面落满灰尘，边角还有一层细灰。看来已经很久没人使用了。',clue:false},
  {id:'lamp',name:'金属台灯',type:'环境记录',position:[-1.93,.92,3.00],radius:.28,text:'灯罩上有一层薄灰，电线却被理得很整齐。它最后一次被移动的时间，无法仅凭外观判断。',clue:false},
  {id:'books',name:'旧书',type:'环境记录',position:[-.6,.65,-3.15],radius:.25,text:'书脊发白，页角卷曲。最上面那本比下面几本干净一些。',clue:true,clueText:'调查提示：物品表面的灰尘并不完全一致。'},
  {id:'cabinet',name:'旧木柜抽屉',type:'物件操作',position:[-3.30,1.08,.76],radius:.38,text:'木柜上层有一只小抽屉，拉手边缘被磨得发亮。可以拉开看看。',clue:false},
  {id:'sofa',name:'旧布艺沙发',type:'环境记录',position:[-.08,1.05,-3.15],radius:1.05,text:'坐垫已经塌陷，布面褪色，没有新近坐过的明显痕迹。',clue:false},
  {id:'door',name:'402 房门',type:'调查对象',position:[2.86,1.45,-3.03],radius:.7,text:'门板没有明显撬动痕迹。锁孔附近有几道很细的金属划痕，肉眼不容易发现。',clue:true,clueText:'线索记录：没有暴力破门，但锁孔附近存在细小划痕。'},
  {id:'photo',name:'墙上旧照片',type:'物件操作',position:[-.18,2.18,-3.79],radius:.45,text:'一张泛黄的走廊照片，纸边已经卷起。木相框挂在墙上，可以移开查看。',clue:false},
  {id:'residents-notice',name:'褪色的住户通知',type:'环境记录',position:[3.48,2.28,2.28],radius:.34,text:'玻璃后是一张褪色的住户通知，字迹已经模糊，只能辨认出“夜间”“请勿喧哗”和一个被涂改的日期。它更像长期贴在这里的公寓告示，没有明显的新近痕迹。',clue:false},
  {id:'old-calendar',name:'墙上的旧日历',type:'环境记录',position:[-3.48,2.22,1.34],radius:.34,text:'日历停在很久以前的八月，纸张边缘已经卷曲。格子里的手写圈记已经褪色，只能看出它被挂在这里很久了。',clue:false},
  {id:'sink',name:'洗漱台',type:'调查对象',position:[-2.43,1.05,-4.82],radius:.42,text:'水池边缘有一圈未完全干掉的水痕，排水口附近没有积灰。',clue:true,clueText:'线索记录：卫生间最近可能被使用过。'},
  {id:'mirror',name:'旧镜子',type:'环境记录',position:[-2.30,1.82,-4.82],radius:.38,text:'镜面大部分蒙着灰，右下角却有一小块擦拭痕迹。',clue:true,clueText:'调查提示：有人在近期靠近并擦过镜面。'},
  {id:'toilet',name:'马桶水箱',type:'物件操作',position:[-3.18,.76,-5.00],radius:.38,text:'陶瓷盖板搭在水箱上。可以取下盖板，看看里面的结构。',clue:false}
];
// Case props are deliberately split into evidence, supporting details and
// red herrings. They all have a physical 3D presence, but only the player's
// final five answers affect the score.
const propPositions={
  'blue-bottle':[2.2,.12,.6],'fake-wound':[-1.0,.52,-3.2],gauze:[.5,.545,-3.18],
  'record-phone':[2.6,.015,-2.8],'shoot-note':[-1.66,.69,3.22],'sink-residue':[-2.43,1.09,-4.82],
  'trash-kit':[-2.67,.34,-4.18],'door-scratch':[2.42,1.42,-3.04],diary:[-.1,.53,-3.12],
  // The old clock hung at z=-3.12, i.e. ~0.7 m in front of the niche plaster,
  // so it read as floating. Mount it flush on the niche rear wall (z=-3.84),
  // to the right of the framed print. Group origin + half of the 0.095 case
  // depth => -3.84 + 0.0475 ≈ -3.79 so the case back sits on the plaster.
  'blue-paint':[-2.30,.18,-.55],'blue-label':[-2.72,.18,-.84],'old-clock':[1.10,2.25,-3.79]
};
const propRoot=new T.Group();propRoot.name='blueblood-case-props';scene.add(propRoot);
const propMats={blue:new T.MeshStandardMaterial({color:'#416e82',roughness:.42,metalness:.12}),paper:new T.MeshStandardMaterial({color:'#c9b990',roughness:.94}),dark:new T.MeshStandardMaterial({color:'#20282a',roughness:.8}),red:new T.MeshStandardMaterial({color:'#762f35',roughness:.5}),metal:new T.MeshStandardMaterial({color:'#706d66',roughness:.35,metalness:.72}),paint:new T.MeshStandardMaterial({color:'#41627a',roughness:.78}),glass:new T.MeshStandardMaterial({color:'#507b8e',roughness:.16,metalness:.22,transparent:true,opacity:.85})};
function makePropMesh(id,pos){
  let mesh;
  if(id==='blue-bottle'||id==='blue-label'){
    mesh=new T.Mesh(new T.CylinderGeometry(.065,.075,.22,18),id==='blue-bottle'?propMats.blue:propMats.glass);
    const cap=new T.Mesh(new T.CylinderGeometry(.043,.043,.035,16),propMats.dark);cap.position.y=.128;mesh.add(cap);
  }else if(id==='fake-wound'){mesh=new T.Mesh(new T.BoxGeometry(.25,.035,.14),propMats.red);}
  else if(id==='gauze'){mesh=new T.Mesh(new T.BoxGeometry(.24,.09,.18),propMats.paper);}
  else if(id==='record-phone'){mesh=new T.Mesh(new T.BoxGeometry(.16,.025,.29),propMats.dark);}
  else if(id==='shoot-note'){mesh=new T.Mesh(new T.BoxGeometry(.28,.012,.19),propMats.paper);mesh.rotation.y=-.15;}
  else if(id==='sink-residue'){mesh=new T.Mesh(new T.TorusGeometry(.08,.014,10,22),propMats.blue);mesh.rotation.x=Math.PI/2;}
  else if(id==='trash-kit'){mesh=new T.Mesh(new T.CylinderGeometry(.19,.16,.35,18),propMats.dark);}
  else if(id==='door-scratch'){mesh=new T.Mesh(new T.BoxGeometry(.05,.16,.012),propMats.metal);}
  else if(id==='diary'){mesh=new T.Mesh(new T.BoxGeometry(.34,.065,.25),new T.MeshStandardMaterial({color:'#6c4e3d',roughness:.9}));}
  else if(id==='blue-paint'){mesh=new T.Mesh(new T.CylinderGeometry(.13,.13,.22,18),propMats.paint);}
  else if(id==='old-clock'){
    const clock=new T.Group();clock.name='stopped-wall-clock';
    const rim=new T.Mesh(new T.CylinderGeometry(.37,.37,.095,48),new T.MeshStandardMaterial({color:'#47382d',roughness:.72,metalness:.08}));rim.rotation.x=Math.PI/2;clock.add(rim);
    const brass=new T.Mesh(new T.TorusGeometry(.325,.027,12,48),new T.MeshStandardMaterial({color:'#9b7950',roughness:.34,metalness:.72}));brass.position.z=.052;clock.add(brass);
    const faceCanvas=document.createElement('canvas');faceCanvas.width=640;faceCanvas.height=640;const fctx=faceCanvas.getContext('2d');
    fctx.fillStyle='#d8ccb0';fctx.fillRect(0,0,640,640);fctx.strokeStyle='#9f8e70';fctx.lineWidth=5;fctx.strokeRect(12,12,616,616);
    fctx.fillStyle='#695747';fctx.textAlign='center';fctx.textBaseline='middle';fctx.font='bold 58px serif';
    for(let n=1;n<=12;n++){const a=n*Math.PI/6;fctx.fillText(String(n),320+Math.sin(a)*245,320-Math.cos(a)*245);}
    fctx.strokeStyle='#74624e';fctx.lineWidth=4;for(let n=0;n<60;n++){const a=n*Math.PI/30;const r1=n%5===0?270:282;fctx.beginPath();fctx.moveTo(320+Math.sin(a)*r1,320-Math.cos(a)*r1);fctx.lineTo(320+Math.sin(a)*292,320-Math.cos(a)*292);fctx.stroke();}
    const faceTex=new T.CanvasTexture(faceCanvas);faceTex.colorSpace=T.SRGBColorSpace;faceTex.anisotropy=4;
    const face=new T.Mesh(new T.CircleGeometry(.298,48),new T.MeshStandardMaterial({map:faceTex,roughness:.82}));face.position.z=.06;clock.add(face);
    const handMat=new T.MeshStandardMaterial({color:'#3a3029',roughness:.56});
    const minuteGeometry=new T.BoxGeometry(.018,.22,.018);minuteGeometry.translate(0,.11,0);
    const minute=new T.Mesh(minuteGeometry,handMat);minute.position.set(0,0,.085);minute.rotation.z=-Math.PI*3/5;clock.add(minute);
    const hourGeometry=new T.BoxGeometry(.026,.15,.02);hourGeometry.translate(0,.075,0);
    const hour=new T.Mesh(hourGeometry,handMat);hour.position.set(0,0,.09);hour.rotation.z=-Math.PI/20;clock.add(hour);
    const pin=new T.Mesh(new T.SphereGeometry(.028,14,8),new T.MeshStandardMaterial({color:'#9b4f43',metalness:.3,roughness:.38}));pin.position.z=.105;clock.add(pin);
    mesh=clock;
  }
  if(!mesh)return null;mesh.position.set(...pos);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.caseProp=id;propRoot.add(mesh);return mesh;
}
const caseInspectData=[];const casePropMeshes=[];
for(const prop of blueBloodCase.props){
  if(inspectData.some(item=>item.id===prop.id))continue;
  const position=propPositions[prop.id];if(!position)continue;
  const data={id:prop.id,name:prop.name,type:prop.category,position,radius:prop.id==='diary'?.34:.25,text:prop.text,clue:prop.supports.length>0,clueText:prop.supports.length?`调查方向：${prop.supports.map(id=>blueBloodCase.questions.find(q=>q.id===id)?.label.replace('？','')).join('、')}`:''};
  inspectData.push(data);caseInspectData.push(data);const propMesh=makePropMesh(prop.id,position);if(propMesh){propMesh.userData.inspect=data;casePropMeshes.push(propMesh);}
}
const hotspotGroup=new T.Group();hotspotGroup.name='inspection-hotspots';scene.add(hotspotGroup);
const hotspotMaterial=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,visible:false}); // invisible hit-test proxy; never renders a white orb
const markerMaterial=new T.MeshBasicMaterial({color:'#b8d9df',transparent:true,opacity:.75,depthWrite:false});
const hotspots=[];
for(const data of inspectData){
  if(data.id==='toilet'||data.id==='photo')continue;
  const mesh=new T.Mesh(new T.SphereGeometry(data.radius,16,10),hotspotMaterial);mesh.position.set(...data.position);mesh.userData.inspect=data;hotspotGroup.add(mesh);
  const marker=new T.Mesh(new T.RingGeometry(.11,.14,28),markerMaterial);marker.rotation.x=-Math.PI/2;marker.position.set(data.position[0],.025,data.position[2]);marker.visible=false;scene.add(marker);mesh.userData.marker=marker;hotspots.push(mesh);
}
const cisternMeshes=[];
cistern.root.traverse(o=>{if(o.isMesh){o.userData.inspect=inspectData.find(item=>item.id==='toilet');cisternMeshes.push(o);}});
const photoMeshes=[];
wallPhoto?.root.traverse(o=>{if(o.isMesh){o.userData.inspect=inspectData.find(item=>item.id==='photo');photoMeshes.push(o);}});
if(!wallPhoto)document.querySelector('[data-view="photo"]').disabled=true;
const drawerMeshes=[];
drawer.root.traverse(o=>{if(o.isMesh){o.userData.inspect=inspectData.find(item=>item.id==='cabinet');drawerMeshes.push(o);}});
const npcMeshes=[];
const npcInspect=sceneCharacters.map((character,index)=>{
  const person=blueBloodCase.npc[index];
  const data={id:'npc-'+person.id,npcId:person.id,name:person.name,type:'人物对话',radius:.48,position:[character.root.position.x,1.10,character.root.position.z]};
  character.root.traverse(mesh=>{if(mesh.isMesh){mesh.userData.inspect=data;npcMeshes.push(mesh);}});
  return data;
});
const reachRay=new T.Raycaster(),reachFrom=new T.Vector3(),reachTo=new T.Vector3();
function canReach(data){
  if(!playerController)return false;
  const p=playerController.root.position;
  if(Math.hypot(p.x-data.position[0],p.z-data.position[2])>1.65+Math.min(data.radius,.45))return false;
  reachFrom.set(p.x,1.08,p.z);reachTo.set(...data.position).sub(reachFrom);
  reachRay.set(reachFrom,reachTo.clone().normalize());reachRay.far=Math.max(0,reachTo.length()-.09);
  return reachRay.intersectObject(architecture,true).length===0;
}
function updateNearby(){
  if(activeView!=='walk'||modalOpen()||!$('inspect-panel').hidden){nearby=null;$('interact-prompt').hidden=true;return;}
  const p=playerController.root.position;
  const aimed=hovered?.userData.inspect;
  nearby=aimed&&canReach(aimed)?aimed:[...npcInspect,...inspectData].filter(canReach).sort((a,b)=>Math.hypot(a.position[0]-p.x,a.position[2]-p.z)-Math.hypot(b.position[0]-p.x,b.position[2]-p.z))[0]||null;
  $('interact-prompt').hidden=!nearby;
  if(nearby){$('interact-name').textContent=nearby.name;$('interact-kind').textContent=nearby.npcId?'交谈':'观察';}
}
$('interact-prompt').onclick=()=>{if(nearby)openInspection(nearby);};
const raycaster=new T.Raycaster(),pointer=new T.Vector2();let hovered=null,pressPoint=null;
raycaster.params.Line.threshold=.002;
function updatePointer(e){
  const r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width*2-1;pointer.y=-(e.clientY-r.top)/r.height*2+1;scene.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);
  // Close inspection uses the actual object surfaces, not the sofa's broad
  // observation sphere, which can otherwise cover the moved frame in front.
  const candidates=activeView==='photo'?photoMeshes:activeView==='tank'?cisternMeshes:[...hotspots,...casePropMeshes,...cisternMeshes,...photoMeshes,...drawerMeshes,...npcMeshes];
  const hit=raycaster.intersectObjects(candidates,false)[0];if(!hit)return null;
  const id=hit.object.userData.inspect?.id;
  if(id==='toilet'||id==='photo'){
    const surfaceHit=raycaster.intersectObjects([architecture,bathroom,...(wallPhoto?[wallPhoto.root]:[])],true)[0];
    if(surfaceHit&&surfaceHit.distance<hit.distance-.015&&surfaceHit.object.userData.inspect?.id!==id)return null;
  }
  return hit.object;
}
function setHovered(next){if(hovered===next)return;if(hovered?.userData.marker)hovered.userData.marker.visible=false;hovered=next;if(hovered?.userData.marker)hovered.userData.marker.visible=true;canvas.classList.toggle('hotspot-cursor',Boolean(hovered));}
canvas.addEventListener('pointermove',e=>{if(pressPoint&&Math.hypot(e.clientX-pressPoint.x,e.clientY-pressPoint.y)>8)pressPoint.dragged=true;if(!pressPoint?.dragged)setHovered(updatePointer(e));else setHovered(null);});
canvas.addEventListener('pointerdown',e=>{if(pressPoint){pressPoint.dragged=true;return;}pressPoint={x:e.clientX,y:e.clientY,id:e.pointerId,dragged:false};});
canvas.addEventListener('pointercancel',()=>{pressPoint=null;setHovered(null);});
canvas.addEventListener('pointerup',e=>{
  if(e.button!==0||!pressPoint||pressPoint.dragged||pressPoint.id!==e.pointerId||transition||modalOpen()){pressPoint=null;return;}
  const hit=updatePointer(e);pressPoint=null;if(!hit)return;const data=hit.userData.inspect;
  if(activeView==='walk'&&!canReach(data)){playerToast('先走近'+data.name+'，再观察或交谈。');return;}
  openInspection(data);
});
function openInspection(data,focus=true){
  if(!data)return;playerController?.clearInput();
  if(data.npcId){renderNPCs(data.npcId);npcBoard.showModal();$('npc-copy').querySelector('input')?.focus();return;}
  if(data.id==='diary'){diaryPage=0;renderDiary();diary.showModal();return;}
  selectedInspect=data;
  if(focus&&(data.id==='toilet'||data.id==='photo'||data.id==='cabinet'))setView(data.id==='toilet'?'tank':data.id==='photo'?'photo':'cabinet');
  renderInspection();$('inspect-panel').hidden=false;
}
function renderInspection(){
  const data=selectedInspect;if(!data)return;
  $('inspect-type').textContent=data.type;$('inspect-title').textContent=data.name;$('inspect-copy').textContent=data.text;
  $('inspect-panel').dataset.object=data.id;delete $('inspect-panel').dataset.state;
  // Do not score or automatically copy an observation into the player's memo.
  const operable=data.id==='toilet'||data.id==='photo'||data.id==='cabinet';
  $('inspect-clue').hidden=true;$('inspect-action').hidden=!operable;$('inspect-return').hidden=!operable;
  if(!operable)return;
  const isPhoto=data.id==='photo',isDrawer=data.id==='cabinet',controller=isPhoto?wallPhoto:isDrawer?drawer:cistern;
  if(!controller)return;
  const {phase,busy}=controller.state();
  const copy=isPhoto?{closed:data.text,opening:'轻轻抬起相框，让挂线脱离挂钉，再拿到一旁。',open:'你将相框拿在一旁。原先被遮住的墙面颜色浅一些，上方留着一枚挂钉；没有夹藏其他物品。',closing:'将相框移回墙前，对准挂钉，慢慢落回原位。'}:isDrawer?{closed:data.text,opening:'抽屉沿着木轨缓慢向外滑出。',open:'抽屉里面是空的，底板落着薄灰，木轨发出轻微的摩擦声。',closing:'把抽屉推回柜体，对齐面板。'}:{closed:'陶瓷盖板搭在水箱上。可以取下盖板，看看里面的结构。',opening:'先把盖板抬起，再放到前方的座圈上。',open:'水面下方是排水口，旁边有进水阀和浮子。内壁留着一圈水垢，箱底没有其他物品。',closing:'把盖板抬回水箱上方，对齐边缘，轻轻放下。'};
  $('inspect-copy').textContent=copy[phase];
  $('inspect-action').textContent=busy?(phase==='opening'?'正在打开…':'正在关上…'):(phase==='open'?(isPhoto?'放回照片':isDrawer?'推回抽屉':'放回盖板'):(isPhoto?'移开照片':isDrawer?'打开抽屉':'取下盖板'));
  $('inspect-return').textContent='回到刘看山';
  $('inspect-action').disabled=busy;
  $('inspect-action').setAttribute('aria-expanded',String(phase==='open'));
  $('inspect-panel').dataset.state=phase;
}
$('inspect-action').onclick=()=>{
  const isPhoto=selectedInspect?.id==='photo',isDrawer=selectedInspect?.id==='cabinet',controller=isPhoto?wallPhoto:isDrawer?drawer:selectedInspect?.id==='toilet'?cistern:null;
  if(!controller||controller.state().busy)return;
  setView(isPhoto?'photo':isDrawer?'cabinet':'tank');controller.setOpen(controller.state().phase!=='open',{immediate:matchMedia('(prefers-reduced-motion:reduce)').matches});renderInspection();
};
$('inspect-return').onclick=resumePlayer;
$('inspect-close').onclick=resumePlayer;
// A very small, physically located pool of warm light at the metal lamp.
const lampGlow=new T.PointLight('#ffd19a',.6,2.2,2);lampGlow.position.set(-1.93,1.04,3.00);scene.add(lampGlow);
if(failures.length){
  $('art-status').textContent='蓝血第一幕 · '+failures.join('、')+'未载入，请刷新重试';
}else $('art-status').textContent='第一幕 · 蓝血 · 调查现场';
const obstacles=apartmentObstacles(modelBounds,sceneCharacters.map((character,index)=>({x:character.root.position.x,z:character.root.position.z,radius:[.60,.45,.40][index]})));
obstacles.push({id:'drawer-clearance',minX:-3.56,maxX:-3.04,minZ:.7,maxZ:1.04});
playerController=createKanshanPlayer({scene,camera,canvas,obstacles,cameraSolids:[architecture,bathroom,...loadedModels],
  blocked:()=>modalOpen()||!$('inspect-panel').hidden||!$('loading').hidden||document.hidden,
  onInteract:()=>{updateNearby();if(nearby)openInspection(nearby);else playerToast('走近人物或道具，按 E 交互。');},
  onResume:resumePlayer,joystick:$('move-stick'),stick:$('move-stick-thumb')});
$('loading').hidden=true;
resumePlayer();
window.roomReady=true;
// Read-only QA summary. No secrets or gameplay internals are exposed.
window.roomArtReport={mode:'blueblood-case',characters:sceneCharacters.length+1,npcProfiles:3,models:modelBounds,failures,materials:4,interactive:inspectData.length,memo:true,caseQuestions:blueBloodCase.questions.length,diaryPages:blueBloodCase.diary.length,protagonist:'刘看山（程序化近似模型）',player:playerController.state(),view:activeView};
