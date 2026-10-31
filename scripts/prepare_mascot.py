"""Create a solid BOB brown GLB, retaining geometry and dropping unused textures.
Usage: python scripts/prepare_mascot.py input.glb mascot-brown.glb
"""
import json
import struct
import sys
from pathlib import Path

source = Path(sys.argv[1]).read_bytes()
assert source[:4] == b'glTF' and struct.unpack_from('<I', source, 4)[0] == 2
json_size = struct.unpack_from('<I', source, 12)[0]
model = json.loads(source[20:20 + json_size])
binary = source[28 + json_size:]
# glTF base color factors use linear RGB; the palette source is sRGB #5A3A28.
def linear(value):
    value /= 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
brown = [linear(v) for v in (90, 58, 40)] + [1]
model['materials'] = [{'name': 'BoB brown #5A3A28', 'pbrMetallicRoughness': {'baseColorFactor': brown, 'metallicFactor': 0, 'roughnessFactor': .72}, 'doubleSided': True}]
for mesh in model['meshes']:
    for primitive in mesh['primitives']:
        primitive['material'] = 0
        primitive['attributes'].pop('COLOR_0', None)
# The source has no compressed meshes. Keep accessor buffer views and re-pack them.
assert not model.get('extensionsUsed')
used = sorted({a['bufferView'] for a in model['accessors'] if 'bufferView' in a})
packed = bytearray()
views = []
for old in used:
    view = dict(model['bufferViews'][old])
    offset = view.get('byteOffset', 0)
    while len(packed) % 4: packed.append(0)
    view['byteOffset'] = len(packed)
    packed.extend(binary[offset:offset + view['byteLength']])
    views.append(view)
for accessor in model['accessors']:
    if 'bufferView' in accessor: accessor['bufferView'] = used.index(accessor['bufferView'])
model['bufferViews'] = views
for key in ('images', 'textures', 'samplers'): model.pop(key, None)
model['buffers'] = [{'byteLength': len(packed)}]
while len(packed) % 4: packed.append(0)
metadata = json.dumps(model, separators=(',', ':')).encode()
metadata += b' ' * (-len(metadata) % 4)
result = struct.pack('<III', 0x46546c67, 2, 28 + len(metadata) + len(packed)) + struct.pack('<II', len(metadata), 0x4e4f534a) + metadata + struct.pack('<II', len(packed), 0x004e4942) + packed
Path(sys.argv[2]).write_bytes(result)
print(f'Prepared {len(result):,} bytes')
