// Shared by the room and offline checks: positions are world metres.
export const MINIATURE_ASSET_VERSION = '20260925-miniature-v5';
export const MINIATURE_MODELS = [
  {id:'sofa',model:'loungeSofa',label:'亚麻双人沙发',width:2.40,x:-.08,z:-3.20},
  {id:'reading-table',model:'tableRound',label:'阅读角小圆桌',width:.76,x:-1.26,z:-2.02},
  {id:'reading-lamp',model:'lampRoundTable',label:'阅读台灯',height:.42,x:-1.30,y:.404,z:-2.05,rot:.3,collidable:false},
  {id:'cabinet',model:'bookcaseClosed',label:'木书柜',height:1.70,x:-3.36,z:-.05,rot:Math.PI/2},
  {id:'window-chair',model:'chairRounded',label:'窗边木椅',height:.97,x:2.92,z:1.88,rot:Math.PI+.32},
  {id:'armchair',model:'loungeChair',label:'单人阅读椅',width:.91,x:-2.55,z:2.62,rot:Math.PI-.35},
  {id:'console',model:'sideTableDrawers',label:'靠墙边柜',height:.72,x:-3.32,z:1.62,rot:Math.PI/2},
  {id:'reading-rug',model:'rugRectangle',label:'编织地毯',width:2.75,x:-.06,y:-.008,z:-2.21,collidable:false},
  {id:'books',model:'books',label:'旧书',width:.37,x:-1.07,y:.405,z:-1.97,rot:.12,collidable:false},
  {id:'shelf-books-lower',model:'books',label:'柜中书册',width:.32,x:-3.28,y:.38,z:-.17,rot:Math.PI/2,collidable:false},
  {id:'shelf-books-upper',model:'books',label:'柜中旧书',width:.34,x:-3.28,y:1.20,z:.02,rot:Math.PI/2,collidable:false},
  {id:'pillow',model:'pillow',label:'沙发靠垫',height:.35,x:.79,y:.49,z:-3.36,rot:-.3,collidable:false},
  {id:'window-plant',model:'pottedPlant',label:'窗边绿植',height:.92,x:3.13,z:.98},
  {id:'sill-plant',model:'plantSmall1',label:'窗台小盆栽',height:.27,x:3.50,y:.895,z:.64,collidable:false},
  {id:'console-radio',model:'radio',label:'旧收音机',width:.36,x:-3.31,y:.73,z:1.83,rot:Math.PI/2,collidable:false},
  {id:'console-plant',model:'plantSmall1',label:'边柜小盆栽',height:.23,x:-3.29,y:.73,z:1.39,collidable:false},
  {id:'storage-box',model:'cardboardBoxClosed',label:'收纳纸箱',height:.36,x:-3.30,z:3.55,rot:.1},
].map(spec=>({...spec,path:`public/assets/room-miniature/${spec.model}.glb`}));

export const MINIATURE_INSPECTION_POSITIONS = {
  table:[-1.26,.54,-2.02], lamp:[-1.30,.65,-2.05], books:[-1.07,.54,-1.97],
  cabinet:[-3.04,.92,-.05], sofa:[-.08,.80,-3.20],
};
export const MINIATURE_PROP_POSITIONS = {
  'blue-bottle':[2.20,.12,.60], 'fake-wound':[-.69,.527,-3.05], gauze:[.48,.56,-3.04],
  'record-phone':[2.6,.015,-2.8], 'shoot-note':[-1.44,.410,-1.93],
  'sink-residue':[-2.43,1.09,-4.82], 'trash-kit':[-2.67,.19,-4.18],
  'door-scratch':[2.42,1.42,-3.04], diary:[-.12,.545,-3.02],
  'blue-paint':[-2.80,.12,-.58], 'blue-label':[-2.68,.12,-.74],
  'old-clock':[1.10,2.25,-3.79],
};
export const MINIATURE_DRAWER = {
  position:[-3.16,.95,-.05], rotation:Math.PI/2,
  obstacle:{id:'drawer-clearance',minX:-3.19,maxX:-2.79,minZ:-.38,maxZ:.28},
  view:{position:[-1.86,2.02,.63],target:[-3.01,.97,-.05]},
};
