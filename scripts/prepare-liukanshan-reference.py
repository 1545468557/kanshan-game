"""Geometry and skinning preparation for the user-provided Liu Kanshan asset.

Executed by build-liukanshan.py inside Blender. The supplied geometry is the
source of truth; this pass preserves its silhouette and repairs surface noise.
"""
import bmesh
import hashlib

SOURCE = ROOT / 'art' / 'characters' / 'liukanshan' / 'source-20260924.glb'
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
imported=[o for o in scene.objects if o.type=='MESH']
all_points=[o.matrix_world@v.co for o in imported for v in o.data.vertices]
floor=min(p.z for p in all_points)
source_height=max(p.z for p in all_points)-floor
source_scale=1.30/source_height
for obj in imported:
    transform=obj.matrix_world.copy()
    obj.parent=None
    for vertex in obj.data.vertices:
        point=transform@vertex.co
        point.z-=floor
        vertex.co=point*source_scale
    obj.matrix_world.identity()
    move_collection(obj)
for obj in list(scene.objects):
    if obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)

def smoothstep(low,high,value):
    t=max(0,min(1,(value-low)/(high-low)))
    return t*t*(3-2*t)

def smooth_region(obj, suffix, strength, iterations):
    votes=[0.0]*len(obj.data.vertices)
    totals=[0.0]*len(obj.data.vertices)
    for polygon in obj.data.polygons:
        area=max(polygon.area,1e-10)
        selected=obj.data.materials[polygon.material_index].name.endswith(suffix)
        for index in polygon.vertices:
            totals[index]+=area
            if selected:votes[index]+=area
    group=obj.vertex_groups.new(name='Surface cleanup')
    for index,(vote,total) in enumerate(zip(votes,totals)):
        if total and vote:
            group.add([index],(vote/total)**2,'REPLACE')
    modifier=obj.modifiers.new('Gentle '+suffix+' refinement','SMOOTH')
    modifier.factor=strength;modifier.iterations=iterations;modifier.vertex_group=group.name
    group_name=group.name
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    remaining=obj.vertex_groups.get(group_name)
    if remaining:obj.vertex_groups.remove(remaining)

# Weld only coincident import seams, and remove unused texture coordinates.
# Shared positions get shared weights, including the tiny white patches on limbs.
for obj in imported:
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free()
    for uv in list(obj.data.uv_layers):obj.data.uv_layers.remove(uv)
    if len(obj.data.polygons)>5000:
        # The source's texture-to-material conversion left white faces inside
        # the black legs. They become visible when the legs bend. The white
        # belly starts above 0.265 m, so this limit preserves its boundary.
        leg_material=next(i for i,m in enumerate(obj.data.materials) if m.name.endswith('Legs'))
        arm_material=next(i for i,m in enumerate(obj.data.materials) if m.name.endswith('Arms'))
        for polygon in obj.data.polygons:
            if obj.data.materials[polygon.material_index].name.endswith('Body'):
                x,y,z=polygon.center
                if z<.258:
                    polygon.material_index=leg_material
                # Likewise clean the hand and forearm inner shell. The torso
                # stays inside |x|=0.309 m over this height range.
                elif abs(x)>.314 and .33<z<.60 and -.11<y<.10:
                    polygon.material_index=arm_material
        # A white inner shell sits just behind the dark nose surface.
        # Strong smoothing shrinks the outer shell through it.
        smooth_region(obj,'Nose',.12,2)
        smooth_region(obj,'Arms',.27,3)
    obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
    for polygon in obj.data.polygons:polygon.use_smooth=True
    obj.data.validate()
    obj.data.update()

for mat in {m for obj in imported for m in obj.data.materials}:
    shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    if mat.name.endswith('Body'):
        shader.inputs['Roughness'].default_value=.62
    elif mat.name.endswith('Nose'):
        shader.inputs['Roughness'].default_value=.47
    elif mat.name.endswith('Eyes'):
        shader.inputs['Roughness'].default_value=.42
    else:
        shader.inputs['Roughness'].default_value=.53
    shader.inputs['Specular IOR Level'].default_value=.28

bone_defs={
    'Root':((0,0,0),(0,0,.10),None),
    'Body':((0,0,.33),(0,0,1.035),'Root'),
    'Ear.L':((.175,0,1.08),(.225,0,1.275),'Body'),
    'Ear.R':((-.175,0,1.08),(-.225,0,1.275),'Body'),
    'Tail':((0,.235,.465),(0,.41,.50),'Body'),
}
for side,s in [('L',1),('R',-1)]:
    shoulder=(s*.318,.028,.702)
    elbow=(s*.349,.008,.557)
    wrist=(s*.361,-.012,.445)
    hand=(s*.362,-.025,.385)
    # A hip inside the belly gives the short, thick legs a natural pivot.
    hip=(s*.123,.010,.340)
    knee=(s*.128,.005,.202)
    ankle=(s*.144,-.004,.069)
    bone_defs.update({
        'UpperArm.'+side:(shoulder,elbow,'Body'),
        'Forearm.'+side:(elbow,wrist,'UpperArm.'+side),
        'Hand.'+side:(wrist,hand,'Forearm.'+side),
        'Thigh.'+side:(hip,knee,'Body'),
        'Shin.'+side:(knee,ankle,'Thigh.'+side),
        'Foot.'+side:(ankle,(s*.144,-.146,.069),'Shin.'+side),
        'Eye.'+side:((s*.2458,-.2067,.966),(s*.2458,-.2067,.994),'Body'),
    })

def add_weight(weights,name,value):
    if value>1e-7:weights[name]=weights.get(name,0)+value

for obj in imported:
    for group in list(obj.vertex_groups):obj.vertex_groups.remove(group)
    is_eye=all(m.name.endswith('Eyes') for m in obj.data.materials)
    groups={}
    for vertex in obj.data.vertices:
        x,y,z=vertex.co
        side='L' if x>0 else 'R'
        weights={}
        if is_eye:
            weights['Eye.'+side]=1
        else:
            # The inner edge of each broad foot is close to the centre line.
            # It must follow the leg fully; taper the centre exclusion only
            # where the legs meet the belly, above the ankle and shin.
            leg=(1-smoothstep(.255,.332,z))*(1-smoothstep(.19,.255,z)*(1-smoothstep(.043,.085,abs(x))))
            arm=smoothstep(.296,.327,abs(x))*(1-smoothstep(.645,.737,z))*smoothstep(.28,.33,z)
            arm=min(arm,1-leg)
            foot=1-smoothstep(.083,.139,z)
            thigh=smoothstep(.157,.245,z)
            add_weight(weights,'Foot.'+side,leg*foot)
            add_weight(weights,'Thigh.'+side,leg*(1-foot)*thigh)
            add_weight(weights,'Shin.'+side,leg*(1-foot)*(1-thigh))
            hand=1-smoothstep(.423,.469,z)
            upper=smoothstep(.527,.596,z)
            add_weight(weights,'Hand.'+side,arm*hand)
            add_weight(weights,'UpperArm.'+side,arm*(1-hand)*upper)
            add_weight(weights,'Forearm.'+side,arm*(1-hand)*(1-upper))
            body=max(0,1-leg-arm)
            ear=smoothstep(1.075,1.242,z)*smoothstep(.07,.16,abs(x))
            tail=smoothstep(.275,.375,y)*(1-smoothstep(.12,.19,abs(x)))*(1-smoothstep(.61,.69,z))
            add_weight(weights,'Ear.'+side,body*ear)
            add_weight(weights,'Tail',body*(1-ear)*tail)
            add_weight(weights,'Body',body*(1-ear)*(1-tail))
        # glTF stores four influences. Keep the largest, then renormalize.
        weights=dict(sorted(weights.items(),key=lambda item:-item[1])[:4])
        total=sum(weights.values())
        for name,value in weights.items():
            if name not in groups:groups[name]=obj.vertex_groups.new(name=name)
            groups[name].add([vertex.index],min(1,value/total),'REPLACE')
    obj['source']='User supplied Liu Kanshan 3D, 2026-09-24'
    obj['source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
parts=imported
