import re

import bpy
from mathutils import Vector

FBX = "/Users/soma/Projects/GitHub/Horikore/hori-daisuke-session-before-v4.fbx"
GLB = "/Users/soma/Projects/GitHub/Horikore/public/models/hori-daisuke.glb"

HEAD_TOKENS = (
    "Hair",
    "Brow",
    "Ear",
    "Eye",
    "Iris",
    "Lid",
    "Lip",
    "Mouth",
    "Smile",
    "Head",
    "Nostril",
    "Crown",
    "Fringe",
    "Occipital",
    "Scalp",
    "Temple",
    "Lock",
    "Teeth",
    "Neck",
)

ARM_L = ("Arm_L", "Deltoid_L", "Cuff_L", "Sleeve_L", "Finger_L", "Palm_L", "Thumb_L")
ARM_R = ("Arm_R", "Deltoid_R", "Cuff_R", "Sleeve_R", "Finger_R", "Palm_R", "Thumb_R")
LEG_L = ("Pants_Leg_L", "Sneaker_L", "Sole_L", "Lace_L")
LEG_R = ("Pants_Leg_R", "Sneaker_R", "Sole_R", "Lace_R")


def is_head(name: str) -> bool:
    return any(token in name for token in HEAD_TOKENS)


def limb_of(name: str) -> str:
    if any(token in name for token in ARM_L):
        return "arm_l"
    if any(token in name for token in ARM_R):
        return "arm_r"
    if any(token in name for token in LEG_L):
        return "leg_l"
    if any(token in name for token in LEG_R):
        return "leg_r"
    return "body"


def side_of(name: str) -> str:
    if re.search(r"(?:^|_)L(?:_|\d|$)", name) or name.endswith("_L"):
        return "L"
    if re.search(r"(?:^|_)R(?:_|\d|$)", name) or name.endswith("_R"):
        return "R"
    return "C"


def join_group(meshes: list) -> None:
    if len(meshes) < 2:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()


def bbox_world(meshes: list) -> tuple[Vector, Vector]:
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    return mins, maxs


def make_empty(name: str, location: Vector):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.empty_display_size = 0.05
    return obj


def parent_keep(children: list, parent) -> None:
    if not children:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for obj in children:
        obj.select_set(True)
    parent.select_set(True)
    bpy.context.view_layer.objects.active = parent
    bpy.ops.object.parent_set(type="OBJECT", keep_transform=True)


bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)

for obj in list(bpy.data.objects):
    if obj.type == "CAMERA" or obj.name.endswith("_Guide"):
        bpy.data.objects.remove(obj, do_unlink=True)

scene = bpy.context.scene
root = make_empty("HoriRoot", Vector((0.0, 0.0, 0.0)))
head = make_empty("HeadPivot", Vector((0.0, 0.0, 0.82)))
arm_l = make_empty("ArmPivot_L", Vector((-0.18, 0.0, 0.72)))
arm_r = make_empty("ArmPivot_R", Vector((0.18, 0.0, 0.72)))
leg_l = make_empty("LegPivot_L", Vector((-0.08, 0.0, 0.48)))
leg_r = make_empty("LegPivot_R", Vector((0.08, 0.0, 0.48)))
bpy.context.view_layer.update()

heads = []
bodies = []
for obj in list(bpy.data.objects):
    if obj.type != "MESH":
        continue
    (heads if is_head(obj.name) else bodies).append(obj)

groups: dict[tuple[str, str, str], list] = {}
for obj in heads:
    mat = obj.data.materials[0].name if obj.data.materials else "_none"
    groups.setdefault(("head", mat, side_of(obj.name)), []).append(obj)
for obj in bodies:
    mat = obj.data.materials[0].name if obj.data.materials else "_none"
    groups.setdefault((limb_of(obj.name), mat, side_of(obj.name)), []).append(obj)
for meshes in groups.values():
    join_group(meshes)

bpy.context.view_layer.update()
meshes_now = [obj for obj in bpy.data.objects if obj.type == "MESH"]
by_limb: dict[str, list] = {"arm_l": [], "arm_r": [], "leg_l": [], "leg_r": [], "body": []}
heads_now = []
for obj in meshes_now:
    if is_head(obj.name):
        heads_now.append(obj)
    else:
        by_limb[limb_of(obj.name)].append(obj)

for limb, pivot in (("arm_l", arm_l), ("arm_r", arm_r), ("leg_l", leg_l), ("leg_r", leg_r)):
    members = by_limb[limb]
    if not members:
        continue
    mins, maxs = bbox_world(members)
    center = (mins + maxs) * 0.5
    if limb.startswith("arm"):
        pivot.location = Vector((center.x, center.y, maxs.z - 0.04))
    else:
        pivot.location = Vector((center.x, center.y, maxs.z - 0.02))
bpy.context.view_layer.update()

parent_keep(by_limb["body"], root)
parent_keep(heads_now, head)
parent_keep(by_limb["arm_l"], arm_l)
parent_keep(by_limb["arm_r"], arm_r)
parent_keep(by_limb["leg_l"], leg_l)
parent_keep(by_limb["leg_r"], leg_r)
parent_keep([head, arm_l, arm_r, leg_l, leg_r], root)

bpy.ops.export_scene.gltf(
    filepath=GLB,
    export_format="GLB",
    export_animations=False,
    export_cameras=False,
    export_yup=True,
)
print("exported", GLB)
for obj in bpy.data.objects:
    parent = obj.parent.name if obj.parent else "-"
    print(obj.type, obj.name, "->", parent)
