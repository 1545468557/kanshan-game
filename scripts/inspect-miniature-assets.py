"""Inspect downloaded miniature furniture with Blender, without editing sources.

Usage: Blender --background --python scripts/inspect-miniature-assets.py
Bounds use the game's glTF coordinates: X right, Y up, Z depth.
"""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import struct

import bpy

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'art/room-miniature/source/kenney-furniture-kit'
MODELS = PACKAGE / 'Models/GLTF format'


def vec_to_gltf(vec):
    return [float(vec.x), float(vec.z), float(-vec.y)]


def glb_json(path):
    payload = path.read_bytes()
    length = struct.unpack_from('<I', payload, 12)[0]
    return json.loads(payload[20:20 + length])


def inspect(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    positions = [vec_to_gltf(obj.matrix_world @ vertex.co)
                 for obj in objects for vertex in obj.data.vertices]
    minimum = [min(v[i] for v in positions) for i in range(3)]
    maximum = [max(v[i] for v in positions) for i in range(3)]
    high_vertices = [v for v in positions if v[1] > minimum[1] +
                     (maximum[1] - minimum[1]) * .8]
    triangles = 0
    for obj in objects:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    gltf = glb_json(path)
    return {
        'name': path.stem,
        'path': str(path.relative_to(ROOT)),
        'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'triangles': triangles,
        'vertices': len(positions),
        'meshObjects': len(objects),
        'bounds': {'min': [round(v, 6) for v in minimum],
                   'max': [round(v, 6) for v in maximum]},
        'size': [round(maximum[i] - minimum[i], 6) for i in range(3)],
        'centerXZ': [round((minimum[i] + maximum[i]) / 2, 6) for i in [0, 2]],
        'upperVertexCentroid': [round(sum(v[i] for v in high_vertices) /
                                      len(high_vertices), 6) for i in range(3)],
        'materials': gltf.get('materials', []),
        'embeddedImages': len(gltf.get('images', [])),
        'externalUris': [item['uri'] for key in ['buffers', 'images']
                         for item in gltf.get(key, []) if 'uri' in item],
        'animations': len(gltf.get('animations', [])),
    }


catalog = {
    'sourcePage': 'https://kenney.nl/assets/furniture-kit',
    'downloadUrl': 'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip',
    'license': 'CC0-1.0',
    'licenseFile': str((PACKAGE / 'License.txt').relative_to(ROOT)),
    'axes': 'glTF: X right, Y up, Z depth; dimensions include node transforms',
    'assets': [inspect(path) for path in sorted(MODELS.glob('*.glb'))],
}
output = PACKAGE / 'asset-catalog.json'
output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'output': str(output), 'assets': len(catalog['assets']),
                  'totalTriangles': sum(a['triangles'] for a in catalog['assets'])}))
