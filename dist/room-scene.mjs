// A compact, entirely mesh-built apartment. One world unit is roughly a metre.
export function buildRoom(T) {
  const root = new T.Group(), obstacles = [], cameraSolids = [], cabinetSolids = [];
  const materials = new Map();
  const mat = (color, roughness = .85, metalness = 0) => {
    const key = `${color}/${roughness}/${metalness}`;
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({color, roughness, metalness}));
    return materials.get(key);
  };
  const mesh = (geometry, material, x, y, z, parent = root) => {
    const m = new T.Mesh(geometry, material); m.position.set(x,y,z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (w,h,d,color,x,y,z,parent=root) => mesh(new T.BoxGeometry(w,h,d),mat(color),x,y,z,parent);
  // Rounded edges catch light like painted wood instead of reading as debug cubes.
  const bevelBox = (w,h,d,color,x,y,z,parent=root,bevel=.045) => {
    const shape=new T.Shape();shape.moveTo(-w/2+bevel,-h/2);shape.lineTo(w/2-bevel,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+bevel);shape.lineTo(w/2,h/2-bevel);shape.quadraticCurveTo(w/2,h/2,w/2-bevel,h/2);shape.lineTo(-w/2+bevel,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-bevel);shape.lineTo(-w/2,-h/2+bevel);shape.quadraticCurveTo(-w/2,-h/2,-w/2+bevel,-h/2);
    const geometry=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:bevel,bevelThickness:bevel});geometry.translate(0,0,-d/2);
    return mesh(geometry,mat(color),x,y,z,parent);
  };
  const solid = (w,h,d,color,x,y,z) => { const m=box(w,h,d,color,x,y,z);cameraSolids.push(m);return m; };
  const block = (x,z,w,d) => obstacles.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2});
  const cyl = (r,h,color,x,y,z,top=r) => mesh(new T.CylinderGeometry(top,r,h,20),mat(color),x,y,z);
  const wall = 0x526064, trim = 0x273e44, wood = 0x684b36, brass = 0xc4a36b;

  // Individually coloured boards share a single instanced draw call.
  box(12,.16,10,0x382d27,0,-.11,0);
  // Texture hook: a real scanned PBR floor will be layered just above the
  // board geometry when its local maps finish loading in room.mjs.
  const floorSurface=mesh(new T.PlaneGeometry(11.7,9.7),mat(0xffffff),0,.026,0);floorSurface.rotation.x=-Math.PI/2;
  const boards = new T.InstancedMesh(new T.BoxGeometry(.493,.065,2.49),mat(0xffffff),96);
  let index=0; const transform = new T.Object3D();
  for(let i=0;i<24;i++) for(let j=0;j<4;j++) {
    transform.position.set(-5.75+i*.5,-.007,-3.75+j*2.5);transform.updateMatrix();boards.setMatrixAt(index,transform.matrix);
    boards.setColorAt(index,new T.Color().setHSL(.077+Math.sin(i*13+j)*.009,.25,.26+Math.sin(i*7+j*11)*.025));index++;
  }
  boards.receiveShadow=true;root.add(boards);
  bevelBox(2.5,.14,2.8,0x4c4841,0,-.07,6.4,root,.035);
  // Far wall has an actual opening for the window, not a background image.
  solid(12,1.15,.25,wall,0,.575,-5);
  solid(12,.55,.25,wall,0,3.725,-5);
  solid(1.2,2.3,.25,wall,-5.4,2.3,-5);
  solid(7.6,2.3,.25,wall,2.2,2.3,-5);
  solid(.25,4,10,wall,-6,2,0);solid(.25,4,10,wall,6,2,0);
  solid(4.75,4,.25,wall,-3.625,2,5);solid(4.75,4,.25,wall,3.625,2,5);
  solid(2.5,1.1,.25,wall,0,3.45,5);
  solid(.22,4,2.8,trim,-1.36,2,6.4);solid(.22,4,2.8,trim,1.36,2,6.4);
  solid(2.95,4,.22,trim,0,2,7.8);
  for(const x of [-5.84,5.84]) {
    box(.10,1.10,9.8,trim,x,.55,0);box(.13,.09,9.8,0x728180,x,1.14,0);
    box(.12,.13,9.8,0x1d3239,x,.07,0);box(.18,.14,9.8,0x3a4a4f,x,3.8,0);
  }
  for(const z of [-4.84,4.84]) {
    if(z<0){box(11.7,1.10,.10,trim,0,.55,z);box(11.7,.09,.13,0x728180,0,1.14,z);}
    else for(const x of [-3.6,3.6]){box(4.4,1.10,.10,trim,x,.55,z);box(4.4,.09,.13,0x728180,x,1.14,z);}
  }
  // Window panes and a small night skyline outside the apartment.
  const glass = new T.MeshBasicMaterial({color:0x426985});
  mesh(new T.PlaneGeometry(3.2,2.3),glass,-3.2,2.3,-5.14);
  for(const x of [-4.82,-3.2,-1.58]) box(.075,2.43,.19,0x202f36,x,2.3,-4.86);
  for(const y of [1.09,2.27,3.5]) box(3.32,.09,.20,0x202f36,-3.2,y,-4.86);
  box(3.65,.12,.55,0x344145,-3.2,1.04,-4.8);
  for(let i=0;i<8;i++){
    const h=.35+((i*17)%7)*.09;
    const building = mesh(new T.PlaneGeometry(.37,h),new T.MeshBasicMaterial({color:0x1a3446}),-4.59+i*.39,1.22+h/2,-5.12);
    building.castShadow=false;
  }
  // Soft folds made from vertices; this remains true 3D geometry.
  const curtainMat = mat(0x68797b,.96);curtainMat.side=T.DoubleSide;
  for(const x of [-4.87,-1.5]) {
    const geo=new T.PlaneGeometry(.52,2.6,14,1), a=geo.attributes.position;
    for(let i=0;i<a.count;i++)a.setZ(i,Math.sin((a.getX(i)+.26)*45)*.06);
    geo.computeVertexNormals();mesh(geo,curtainMat,x,2.2,-4.66);
  }
  const rod=cyl(.027,3.9,brass,-3.2,3.59,-4.67);rod.rotation.z=Math.PI/2;

  // A lived-in bed anchors the reference image and gives the room a human
  // scale. It is intentionally made from a few layered pieces so the player
  // can read the mattress, blanket, headboard and legs while moving around it.
  const bedX=-2.05, bedZ=-3.92;
  bevelBox(3.18,.34,1.62,0x4f3d31,bedX,.25,bedZ,root,.055);
  bevelBox(2.98,.34,1.43,0x8f8172,bedX,.57,bedZ,root,.08);
  bevelBox(1.70,.075,1.34,0x6c6258,-1.42,.78,bedZ,root,.035);
  bevelBox(.78,.16,.53,0xc3b7a3,-2.93,.82,bedZ,root,.08);
  bevelBox(3.12,1.20,.14,0x44372e,bedX,.93,-4.67,root,.04);
  for(const x of [bedX-1.32,bedX+1.32])for(const z of [bedZ-.63,bedZ+.63])box(.10,.26,.10,0x332b27,x,.10,z);
  block(bedX,bedZ,3.30,1.72);

  // Damp plaster and a few old nail/patch marks make the back wall feel
  // inhabited without turning it into a generic horror texture.
  const dampPatches=[
    [1.75,2.54,1.55,.82,0x3b4b4a,-.10],
    [2.40,1.95,.92,.58,0x52605a,.08],
    [1.28,1.73,.62,.38,0x6e6956,-.16],
    [2.82,2.88,.48,.32,0x2f3e40,.12]
  ];
  for(const [x,y,w,h,color,rot] of dampPatches){const stain=box(w,h,.026,color,x,y,-4.855);stain.rotation.z=rot;}
  for(const [x,y,h] of [[1.18,3.08,.46],[2.07,3.12,.31],[2.66,1.32,.24]]){
    const crack=box(.018,h,.032,0x273738,x,y,-4.84);crack.rotation.z=-.18;
  }

  // Small bedside table: it creates a natural place for a note or key in a
  // later story revision while keeping the current evidence layout intact.
  bevelBox(.62,.10,.48,0x5c4535,-.04,.72,-2.93,root,.035);
  for(const x of [-.28,.20])for(const z of [-3.10,-2.76])box(.055,.68,.055,0x46352d,x,.38,z);
  box(.30,.035,.22,0x7e684f,-.04,.80,-2.93);
  box(.08,.02,.07,0x9b805c,-.04,.83,-2.93);

  // Worn rug, central route kept free for third-person movement.
  bevelBox(4.8,.025,3.1,0x455c60,0,.032,.3,root,.018);
  for(const x of [-2.25,2.25])box(.055,.03,2.9,0xb39c70,x,.049,.3);
  for(const z of [-1.1,1.7])box(4.5,.03,.055,0xb39c70,0,.049,z);
  // An old cabinet; its upper drawer can physically slide out.
  const cabinet=new T.Group();cabinet.position.set(.5,0,-4.3);root.add(cabinet);
  bevelBox(2.5,1.28,.82,wood,0,.70,0,cabinet,.07);bevelBox(2.7,.10,.97,0x8d6946,0,1.39,0,cabinet,.035);
  for(const x of [-1.02,1.02])for(const z of [-.26,.26])box(.13,.2,.13,0x3b3025,x,.1,z,cabinet);
  const drawer=new T.Group();drawer.position.set(0,1.05,.44);cabinet.add(drawer);
  box(2.25,.37,.06,0x79563a,0,0,0,drawer);box(.28,.036,.07,brass,0,0,.06,drawer);
  box(2.1,.045,.56,0x302a25,0,-.18,-.25,drawer);
  for(const x of [-.58,.58]) {box(1.08,.57,.065,0x644830,x,.54,.445,cabinet);box(.035,.19,.07,brass,x,.62,.5,cabinet);}
  block(.5,-4.3,2.7,1.0);
  const cabinetMeshes=cabinet.children.filter(m=>m.isMesh);cameraSolids.push(...cabinetMeshes);cabinetSolids.push(...cabinetMeshes);
  for(const x of [-.49,1.43]){
    const scratch=box(.025,.002,.7,0xc39e6e,x,.03,-3.38);scratch.rotation.y=.08;
  }
  // Desk with a warm lamp and scattered paper.
  const deskTop=bevelBox(2.6,.13,1.25,0x664a35,-4.16,.85,-3.55,root,.045);cameraSolids.push(deskTop);block(-4.16,-3.55,2.6,1.25);
  for(const x of [-5.22,-3.12])for(const z of [-4.02,-3.1])box(.12,.83,.12,0x413b31,x,.415,z);
  const paper=box(.58,.015,.77,0xc7bea2,-3.81,.93,-3.32);paper.rotation.y=-.13;
  for(let i=0;i<6;i++)box(.38,.002,.006,0x6e756d,-3.85,.94,-3.49+i*.065);
  for(let i=0;i<3;i++)box(.4,.09,.58,[0x3c555c,0x7f6444,0x61624f][i],-4.83,.96+i*.09,-3.54);
  cyl(.18,.04,brass,-4.73,.945,-3.91);cyl(.025,.55,brass,-4.73,1.23,-3.91);
  mesh(new T.ConeGeometry(.29,.36,24,1,true),new T.MeshStandardMaterial({color:0xceaa76,side:T.DoubleSide,emissive:0xc98938,emissiveIntensity:.24}),-4.73,1.63,-3.91);
  const lamp=new T.PointLight(0xffc180,17,6,2);lamp.position.set(-4.73,1.43,-3.84);root.add(lamp);
  // Chair, sofa and moving boxes.
  solid(.65,.12,.66,wood,-4.08,.46,-2.30);block(-4.08,-2.30,.76,.76);
  solid(.67,.69,.09,0x584a39,-4.08,.85,-1.99);
  for(const x of [-4.34,-3.82])for(const z of [-2.56,-2.04])box(.065,.45,.065,wood,x,.225,z);
  bevelBox(1.26,.44,2.85,0x334e55,-5.12,.37,1.02,root,.045);block(-5.12,1.02,1.35,2.95);
  solid(.25,1.01,2.89,0x29434c,-5.67,.82,1.02);
  for(const z of [-.34,2.38])solid(1.31,.36,.22,0x324b51,-5.10,.79,z);
  for(const z of [.30,1.67])box(.96,.21,1.28,0x51686b,-4.98,.65,z);
  const cushion=box(.30,.6,.62,0x9a835c,-5.19,1.0,1.52);cushion.rotation.z=.2;
  bevelBox(1.1,2.7,1.6,0x594635,5.2,1.45,-3.65,root,.09);block(5.2,-3.65,1.2,1.72);
  for(const z of [-4.02,-3.3])box(.06,.20,.045,brass,4.63,1.46,z);
  const boxes=[[4.92,1.43,.84,.71],[4.25,2.25,.73,.55],[4.94,1.43,.59,.6]];
  boxes.forEach(([x,z,w,h],i)=>{
    const y=i===2?.71+h/2:h/2;
    bevelBox(w,h,w,0x806546,x,y,z,root,.035);
    box(.10,.008,w+.008,0xc4ad78,x,y+h/2+.005,z);
    if(i<2)block(x,z,w+.06,w+.06);
  });
  // A packing sheet beside the boxes, reachable from the centre.
  const list=box(.43,.02,.59,0xcec4a7,3.26,.035,1.35);list.rotation.y=.2;
  for(let i=0;i<4;i++)box(.25,.003,.009,0x687169,3.23,.048,1.18+i*.07);
  // Entry frame and closed main door in the short foyer.
  for(const x of [-1.21,1.21])box(.16,2.93,.28,0x493e31,x,1.465,5);
  box(2.58,.18,.28,0x6b5340,0,2.93,5);
  bevelBox(1.86,2.9,.13,0x76573a,0,1.45,7.61,root,.03);
  for(const y of [.83,2.1])box(1.48,1.07,.06,0x65472f,0,y,7.51);
  box(.07,.23,.10,brass,-.69,1.35,7.47);
  box(.42,.2,.02,brass,0,2.52,7.42);
  // Raised segment geometry makes the 402 plate read as a real metal label.
  const digit=mat(0x2b241e,.58,.18),seg=(x,y,w,h)=>box(w,h,.027,digit,x,y,7.395);
  seg(-.145,2.52,.025,.13);seg(-.06,2.57,.12,.025);seg(-.06,2.48,.12,.025);seg(0,2.52,.025,.13);
  seg(.105,2.58,.09,.025);seg(.105,2.46,.09,.025);seg(.15,2.52,.025,.13);seg(.06,2.52,.025,.13);
  seg(.285,2.58,.09,.025);seg(.285,2.46,.09,.025);seg(.33,2.52,.025,.13);seg(.24,2.52,.025,.06);
  // Ceiling beams and pendant are geometry, with open ceiling for a clear camera.
  for(const z of [-2.4,2.5])box(12,.17,.21,0x383c39,0,3.89,z);
  cyl(.018,.57,0x2a3031,.1,3.63,.4);
  mesh(new T.ConeGeometry(.38,.25,28,1,true),mat(0x62736f),.1,3.27,.4);
  mesh(new T.SphereGeometry(.10,12,8),new T.MeshBasicMaterial({color:0xffddb0}),.1,3.13,.4);
  const roomLight=new T.PointLight(0xffd49b,11,13,2);roomLight.position.set(.1,3.02,.4);root.add(roomLight);
  // A faded framed photograph, used as a non-technical inspection item.
  box(.08,.86,1.2,0x886e48,5.80,2.25,.1);
  box(.085,.73,1.06,0xa5a996,5.75,2.25,.1);
  for(let i=0;i<4;i++)box(.09,.26,.12,0x57676a,5.70,2.13,-.21+i*.2);
  return {root,obstacles,cameraSolids,drawer,cabinet,cabinetSolids,floorSurface};
}
