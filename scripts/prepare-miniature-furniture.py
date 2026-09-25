"""Adapt selected CC0 Kenney Furniture Kit assets for the miniature apartment.

Run with Blender -b --factory-startup --python scripts/prepare-miniature-furniture.py
The original downloaded GLBs are retained unchanged under art/room-miniature.
"""
import bpy
import bmesh
import hashlib
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art/room-miniature/source/kenney-furniture-kit'
OUT = ROOT / 'public/assets/room-miniature'
OUT.mkdir(parents=True, exist_ok=True)
NAMES = ['loungeSofa', 'loungeChair', 'chairRounded', 'tableRound',
         'bookcaseClosed', 'sideTableDrawers', 'lampRoundTable', 'lampRoundFloor',
         'books', 'pillow', 'rugRectangle', 'pottedPlant', 'plantSmall1',
         'cardboardBoxClosed', 'radio']
PALETTE = {
    'wood': '#b49a7e', 'woodDark': '#806b58', 'carpet': '#9ba99a',
    'carpetDarker': '#b68b76', 'carpetWhite': '#e6dfcf',
    'metal': '#9d9e8d', 'metalDark': '#575f59', 'metalMedium': '#737e73',
    'metalLight': '#c7cbbd', 'lamp': '#eadfc0', 'plant': '#6e8e76',
    '_defaultMat': '#e4dece', 'glass': '#b9cec6',
}
OVERRIDES = {
    'loungeChair': {'carpet': '#b99077'},
    'pillow': {'carpet': '#c7ae85'},
    'rugRectangle': {'carpet': '#c2b99e', 'carpetDarker': '#9d9f88'},
    'books': {'carpetDarker': '#947060', 'plant': '#748678', 'metal': '#c2b28e'},
    'pottedPlant': {'wood': '#b78a73', 'woodDark': '#927263'},
    'plantSmall1': {'wood': '#bba080'},
}

def linear_color(hex_color):
    values = [int(hex_color[i:i+2], 16)/255 for i in (1, 3, 5)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values)

manifest = []
for name in NAMES:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        if mat.users == 0: bpy.data.materials.remove(mat)
    original = SOURCE / 'Models/GLTF format' / (name + '.glb')
    bpy.ops.import_scene.gltf(filepath=str(original))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    transforms = {obj: obj.matrix_world.copy() for obj in meshes}
    # Apply the source transforms, preserving its authored geometry and parts.
    for obj in meshes:
        transform = transforms[obj]
        obj.data = obj.data.copy()
        obj.parent = None
        obj.data.transform(transform)
        obj.matrix_world = Matrix.Identity(4)
    points = [v.co for o in meshes for v in o.data.vertices]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    offset = Vector((-(low.x+high.x)/2, -(low.y+high.y)/2, -low.z))
    for obj in meshes:
        for vertex in obj.data.vertices: vertex.co += offset
        # The source pillow has overlapping triangles. Rebuild its convex shell
        # from the authored outline before calculating normals and soft edges.
        if name == 'pillow':
            bm = bmesh.new()
            for point in {tuple(vertex.co) for vertex in obj.data.vertices}:
                bm.verts.new(point)
            bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
            bmesh.ops.dissolve_limit(bm, angle_limit=.001, verts=list(bm.verts),
                                   edges=list(bm.edges))
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(obj.data); bm.free()
        else:
            bm = bmesh.new(); bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
            # Dissolve import triangles on planar faces so bevels follow real edges.
            bmesh.ops.dissolve_limit(bm, angle_limit=.001, verts=list(bm.verts),
                                   edges=list(bm.edges), delimit={'MATERIAL'})
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(obj.data); bm.free()
        bpy.context.view_layer.objects.active = obj
        for other in bpy.context.selected_objects: other.select_set(False)
        obj.select_set(True)
        if name not in ['pottedPlant', 'plantSmall1', 'rugRectangle']:
            bevel = obj.modifiers.new('Soft miniature edges', 'BEVEL')
            bevel.width = (.0045 if name == 'pillow' else
                           max(high-low) * (.023 if name.startswith('lounge') else .012))
            bevel.segments = 4 if name.startswith('lounge') else 3
            bevel.limit_method = 'ANGLE'; bevel.angle_limit = .35
            bevel.use_clamp_overlap = True
            bpy.ops.object.modifier_apply(modifier=bevel.name)
            for polygon in obj.data.polygons: polygon.use_smooth = True
            weighted = obj.modifiers.new('Face-weighted normals', 'WEIGHTED_NORMAL')
            weighted.keep_sharp = True; weighted.weight = 50
            bpy.ops.object.modifier_apply(modifier=weighted.name)
        for mat in obj.data.materials:
            base_name = mat.name.split('.')[0]
            color = OVERRIDES.get(name, {}).get(base_name, PALETTE.get(base_name))
            shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            if color:
                rgba = (*linear_color(color), 1)
                shader.inputs['Base Color'].default_value = rgba
                mat.diffuse_color = rgba
            shader.inputs['Metallic'].default_value = .15 if base_name.startswith('metal') else 0
            shader.inputs['Roughness'].default_value = .64 if base_name.startswith('metal') else .86
            shader.inputs['Specular IOR Level'].default_value = .27
        obj['source'] = 'Kenney Furniture Kit / CC0-1.0'
        obj['source_model'] = name + '.glb'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes: obj.select_set(True)
    destination = OUT / (name + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB',
        use_selection=True, export_animations=False, export_cameras=False,
        export_lights=False, export_extras=True)
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles(); triangles += len(obj.data.loop_triangles)
    manifest.append({'id':name, 'file':name+'.glb', 'sourceFile':str(original.relative_to(ROOT)),
        'sourceSHA256':hashlib.sha256(original.read_bytes()).hexdigest(),
        'bytes':destination.stat().st_size, 'triangles':triangles})

(OUT/'License.txt').write_bytes((SOURCE/'License.txt').read_bytes())
(OUT/'manifest.json').write_text(json.dumps({
    'author':'Kenney', 'source':'https://kenney.nl/assets/furniture-kit',
    'license':'CC0-1.0', 'changes':'Recentered and grounded; soft bevels and a muted miniature palette.',
    'assets':manifest}, ensure_ascii=False, indent=2)+'\n')
print('MINIATURE_ASSETS', len(manifest), 'files;', sum(a['bytes'] for a in manifest), 'bytes')
