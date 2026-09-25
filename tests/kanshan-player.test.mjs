import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import { createKanshanPlayer } from '../public/kanshan-player.mjs';
import { apartmentObstacles } from '../public/apartment-navigation.mjs';

// Deterministic input harness. Browser tests separately exercise real focus,
// touch events and dialogs; this test covers controller state at any frame rate.
class Surface extends EventTarget {
  style = {};
  focus() {}
  setPointerCapture() {}
  closest() { return null; }
  getBoundingClientRect() { return { left:0, top:0, width:100, height:100 }; }
}
globalThis.window = new Surface();
globalThis.document = new Surface();
document.querySelectorAll = () => [];
globalThis.MutationObserver = class { observe() {} };
const canvas=new Surface(),joystick=new Surface(),stick=new Surface();
const scene=new T.Scene(),camera=new T.PerspectiveCamera(55,1,.07,50);
let paused=false,interactions=0,player,lastMotion,lastDelta;
const character={root:new T.Group(),update(dt,motion){lastDelta=dt;lastMotion=motion;},state(){return {asset:'test-liukanshan.glb'};}};
player=createKanshanPlayer({scene,camera,canvas,character,obstacles:apartmentObstacles(),cameraSolids:[],blocked:()=>paused,
  onInteract:()=>interactions++,onResume:()=>player.resume(),joystick,stick});
function key(type,code){const e=new Event(type,{cancelable:true});Object.assign(e,{code,repeat:false});window.dispatchEvent(e);}
const tick=(frames=60)=>{for(let i=0;i<frames;i++)player.update(1/60,i/60);};
const initial=player.state().position;
assert.equal(initial[1],-.002,'Foot-origin GLB stays on the floor');
assert.deepEqual(character.root.scale.toArray(),[1,1,1],'GLB game scale is preserved');
assert.equal(player.state().asset,'test-liukanshan.glb','Asset identity is exposed for QA');
key('keydown','KeyW');tick();
assert(Math.abs(lastMotion.speed-1.55)<1e-8,'Walk animation receives actual movement speed');
assert.equal(lastDelta,1/60,'Animation receives frame delta');
key('keydown','ShiftLeft');tick(10);key('keyup','ShiftLeft');
assert(Math.abs(lastMotion.speed-2.35)<1e-8,'Fast walk animation follows Shift movement speed');
key('keyup','KeyW');tick(1);
assert(player.state().position[2]<initial[2]-1.4,'W moves forward');
assert.equal(player.state().moving,false,'Releasing key stops walk animation');
assert.deepEqual(lastMotion,{moving:false,speed:0},'No movement requests idle animation');
const beforePause=player.state().position;
paused=true;key('keydown','KeyW');tick();assert.deepEqual(player.state().position,beforePause);
paused=false;tick();assert.deepEqual(player.state().position,beforePause,'No stuck key after modal closes');
key('keydown','KeyE');assert.equal(interactions,1);
player.suspend();key('keydown','KeyW');tick();assert.deepEqual(player.state().position,beforePause);
player.resume();tick(1);assert.deepEqual(player.state().position,beforePause,'Inspection never teleports player');
key('keydown','KeyD');tick(10);window.dispatchEvent(new Event('blur'));const blurPosition=player.state().position;tick();assert.deepEqual(player.state().position,blurPosition);
assert(camera.position.toArray().every(Number.isFinite));assert(camera.position.z<=4.001);
const down=new Event('pointerdown',{cancelable:true});Object.assign(down,{pointerId:1,clientX:50,clientY:16});joystick.dispatchEvent(down);
tick(10);assert(player.state().position[2]<blurPosition[2],'Touch stick moves forward');
const up=new Event('pointerup');Object.assign(up,{pointerId:1});joystick.dispatchEvent(up);const afterTouch=player.state().position;tick();assert.deepEqual(player.state().position,afterTouch);
key('keydown','KeyD');tick(600);
assert.deepEqual(lastMotion,{moving:false,speed:0},'Pushing against an obstacle does not keep walking in place');
key('keyup','KeyD');
console.log('Kanshan controller: model injection, game scale, movement-driven animation, keyboard, touch, modal lock, inspection return, blur release and camera bounds passed.');
