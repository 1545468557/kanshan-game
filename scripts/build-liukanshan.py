"""Adapt the supplied Liu Kanshan model, rig it, and export game assets and previews.

Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-liukanshan.py
Optional: -- --no-render (asset only). Coordinates here: Z up, front -Y.
The glTF exporter converts these to Y up, front +Z; dimensions are game metres.
"""
import bpy
import math
import json
import sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "blender" / "liukanshan"
ASSET = ROOT / "public" / "assets" / "characters" / "liukanshan"
OUT.mkdir(parents=True, exist_ok=True)
ASSET.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 60
character = bpy.data.collections.new('LIU KANSHAN | game asset')
scene.collection.children.link(character)
parts = []

def move_collection(obj, collection=character):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)

def material(name, color, roughness, specular=.3):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Specular IOR Level'].default_value = specular
    return mat

# Import and refine the supplied geometry; no procedural replacement silhouette.
exec(compile((ROOT / 'scripts' / 'prepare-liukanshan-reference.py').read_text(),
             str(ROOT / 'scripts' / 'prepare-liukanshan-reference.py'), 'exec'))

armdata=bpy.data.armatures.new('LiuKanshan skeleton')
rig=bpy.data.objects.new('LiuKanshan_Rig',armdata)
character.objects.link(rig)
bpy.context.view_layer.objects.active=rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(head,tail,parent) in bone_defs.items():
    bone=armdata.edit_bones.new(name);bone.head=head;bone.tail=tail
    if parent:bone.parent=armdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front=True
for obj in parts:
    obj.parent=rig
    modifier=obj.modifiers.new('Character skin','ARMATURE');modifier.object=rig
for bone in rig.pose.bones:bone.rotation_mode='QUATERNION'

def bone_pose(name,head,tail):
    rest=rig.data.bones[name]
    delta=(rest.tail_local-rest.head_local).rotation_difference(Vector(tail)-Vector(head))
    rotation=delta@rest.matrix_local.to_quaternion()
    rig.pose.bones[name].matrix=Matrix.LocRotScale(Vector(head),rotation,Vector((1,1,1)))
    bpy.context.view_layer.update()

def two_bone_knee(hip,ankle,upper,lower):
    line=ankle-hip;d=min(line.length,upper+lower-.0001);axis=line.normalized()
    a=(upper*upper-lower*lower+d*d)/(2*d)
    h=math.sqrt(max(0,upper*upper-a*a))
    front=Vector((0,-1,0));perp=(front-axis*front.dot(axis)).normalized()
    return hip+axis*a+perp*h

def animate_action(name,frames,moving=False,fast=False):
    rig.animation_data_create()
    action=bpy.data.actions.new(name);action.use_fake_user=True
    rig.animation_data.action=action
    for frame in range(frames+1):
        scene.frame_set(frame+1)
        phase=frame/frames*2*math.pi
        for p in rig.pose.bones:
            p.location=(0,0,0);p.rotation_quaternion=(1,0,0,0);p.scale=(1,1,1)
        bob=((-0.060 if fast else -.040)+.008*math.cos(phase*2)) if moving else .0022*math.sin(phase)
        sway=(.022 if moving else .006)*math.sin(phase)
        bodyp=rig.pose.bones['Body']
        bodyp.location=(0,bob,0)
        from mathutils import Quaternion
        bodyp.rotation_quaternion=Quaternion((0,1,0),sway)
        bpy.context.view_layer.update()
        body_delta=bodyp.matrix@rig.data.bones['Body'].matrix_local.inverted()
        for side,s in [('L',1),('R',-1)]:
            p=phase+(math.pi if s<0 else 0)
            hip0,knee0,_=bone_defs['Thigh.'+side]
            _,ankle0,_=bone_defs['Shin.'+side]
            hip=body_delta@Vector(hip0)
            ankle=Vector(ankle0)
            if moving:
                # Stance travels linearly from the front to the rear; swing
                # lifts and returns the foot. Both endpoints stay in-place.
                u=(p/(2*math.pi))%1
                reach=.155 if fast else .130
                if u<.5:
                    ankle.y=-reach+4*reach*u
                    # Allow 5 mm for between-frame quaternion interpolation.
                    ankle.z=.074
                else:
                    v=(u-.5)*2;smooth=v*v*(3-2*v)
                    ankle.y=reach-2*reach*smooth
                    ankle.z=.074+(.073 if fast else .057)*math.sin(math.pi*v)
                upper=(Vector(knee0)-Vector(hip0)).length
                lower=(Vector(ankle0)-Vector(knee0)).length
                knee=two_bone_knee(hip,ankle,upper,lower)
            else:
                knee=body_delta@Vector(knee0)
            bone_pose('Thigh.'+side,hip,knee)
            bone_pose('Shin.'+side,knee,ankle)
            bone_pose('Foot.'+side,ankle,ankle+Vector((0,-.095,0)))
            shoulder0,elbow0,_=bone_defs['UpperArm.'+side]
            _,wrist0,_=bone_defs['Forearm.'+side]
            shoulder=body_delta@Vector(shoulder0)
            swing=(.11 if fast else .077)*math.sin(p) if moving else .003*math.sin(p)
            elbow=body_delta@Vector(elbow0)+Vector((0,swing*.56,.008 if moving else 0))
            wrist=body_delta@Vector(wrist0)+Vector((0,swing,.025 if moving else 0))
            bone_pose('UpperArm.'+side,shoulder,elbow)
            bone_pose('Forearm.'+side,elbow,wrist)
            bone_pose('Hand.'+side,wrist,wrist+(Vector(bone_defs['Hand.'+side][1])-Vector(bone_defs['Hand.'+side][0])))
            if not moving:
                blink=max(0,1-abs(frame/frames-.73)/.027)
                rig.pose.bones['Eye.'+side].scale=(1,1-.91*blink,1)
            rig.pose.bones['Ear.'+side].rotation_quaternion=Quaternion((1,0,0),.016*math.sin(phase+s*.3))
        rig.pose.bones['Tail'].rotation_quaternion=Quaternion((0,1,0),.045*math.sin(phase))
        for p in rig.pose.bones:
            p.keyframe_insert('location',frame=frame+1,group=p.name)
            p.keyframe_insert('rotation_quaternion',frame=frame+1,group=p.name)
            p.keyframe_insert('scale',frame=frame+1,group=p.name)
    return action

idle=animate_action('Idle',240)
walk=animate_action('Walk',20,True)
fast=animate_action('FastWalk',16,True,True)
rig.animation_data.action=idle
scene.frame_set(1)
scene.frame_start=1;scene.frame_end=241

bpy.ops.object.select_all(action='DESELECT')
for obj in character.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(ASSET/'liukanshan.glb'),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
    export_frame_range=False,export_skins=True,export_morph=False,export_yup=True,
    export_cameras=False,export_lights=False,export_extras=True)

deps=bpy.context.evaluated_depsgraph_get()
triangles=0
for obj in parts:
    evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
    triangles+=len(mesh.loop_triangles);evaluated.to_mesh_clear()
metadata={'name':'刘看山','authoring':'Blender '+bpy.app.version_string,'triangles':triangles,
    'materials':len({m.name for obj in parts for m in obj.data.materials}),'animations':['Idle','Walk','FastWalk'],'heightApprox':1.30,
    'coordinates':'glTF Y up, front +Z, feet at 0','designReference':'User supplied Liu Kanshan 3D 2026-09-24; source geometry retained and rigged',
    'sourceFile':'art/characters/liukanshan/source-20260924.glb','sourceSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'nominalSpeeds':{'Walk':1.55,'FastWalk':2.35}}
(ASSET/'model-info.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')

# A reusable studio is included in the editable source, excluded from GLB.
studio=bpy.data.collections.new('STUDIO | preview only');scene.collection.children.link(studio)
ground=material('Studio | warm grey',(.73,.76,.78),.82)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.003))
plane=bpy.context.object;plane.name='Studio cyclorama';move_collection(plane,studio);plane.data.materials.append(ground)
def area(name,location,energy,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);studio.objects.link(obj);obj.location=location
    obj.rotation_euler=(Vector((0,0,.7))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Key | broad silk',(-2.5,-3.2,4.1),280,3.2,(1,.93,.85))
area('Fill | cool',(2.8,-1.5,2.1),150,2.6,(.8,.9,1))
area('Rim | crown',(1.2,2,3.1),310,2,(1,1,1))
world=bpy.data.worlds.new('Studio ambience') if not scene.world else scene.world
scene.world=world;world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs[0].default_value=(.55,.60,.68,1)
background.inputs[1].default_value=.35
camdata=bpy.data.cameras.new('Review camera');camera=bpy.data.objects.new('Review camera',camdata);studio.objects.link(camera);scene.camera=camera
camdata.type='ORTHO';camdata.ortho_scale=1.74
def set_camera(position,target=(0,0,.65)):
    camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
set_camera((2.1,-3.3,1.65))
scene.render.engine='CYCLES';scene.cycles.samples=40
scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.render.film_transparent=False
# Display the body with an informative camera and the full rig ready to edit.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'liukanshan.blend'))
print('LIUKANSHAN_BUILD '+json.dumps(metadata,ensure_ascii=False))
if '--no-render' not in sys.argv:
    for name,position in [('hero',(2.1,-3.3,1.65)),('front',(0,-4,.72)),('side',(4,0,.72)),('back',(0,4,.72))]:
        set_camera(position)
        scene.render.filepath=str(OUT/(name+'.png'))
        bpy.ops.render.render(write_still=True)
    print('PREVIEWS '+str(OUT))
