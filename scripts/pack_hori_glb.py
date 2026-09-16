from pathlib import Path

import bpy

ROOT = Path("/Users/soma/Projects/GitHub/Horikore")
BASE = ROOT / "models/base/hori.fbx"
GLB = ROOT / "public/models/hori-daisuke.glb"
IDLE_FBX = ROOT / "models/animation/Breathing Idle.fbx"
WALK_FBX = ROOT / "models/animation/Walking.fbx"
ANIMS = [
    ("idle", IDLE_FBX),
    ("strut", ROOT / "models/animation/Strut Walking.fbx"),
    ("sleep", ROOT / "models/animation/Sleeping Idle.fbx"),
    ("workout", ROOT / "models/animation/Capoeira.fbx"),
    ("angry", ROOT / "models/animation/Angry.fbx"),
    ("beauty", ROOT / "models/animation/Beauty.fbx"),
    ("called", ROOT / "models/animation/Called.fbx"),
    ("nodding", ROOT / "models/animation/Sitting Dazed.fbx"),
    ("awake", ROOT / "models/animation/awake.fbx"),
    ("hit", ROOT / "models/animation/Rib Hit.fbx"),
]


def channelbag(action):
    return action.layers[0].strips[0].channelbags[0]


def inplace_xz(action):
    bag = channelbag(action)
    for fc in bag.fcurves:
        if fc.data_path != 'pose.bones["mixamorig:Hips"].location':
            continue
        if fc.array_index not in (0, 2):
            continue
        origin = fc.keyframe_points[0].co.y
        for kp in fc.keyframe_points:
            kp.co.y -= origin
        fc.update()


def parent_first(pose_bones):
    roots = [b for b in pose_bones if b.parent is None]
    out = []

    def walk(b):
        out.append(b)
        for c in b.children:
            walk(c)

    for r in roots:
        walk(r)
    return out


def assign_action(arm, action):
    ad = arm.animation_data_create()
    ad.action = action
    if action and action.slots and hasattr(ad, "action_slot"):
        try:
            ad.action_slot = action.slots[0]
        except TypeError:
            pass
    return ad


def pose_to_mixamo_tpose(char_arm, src_arm):
    bpy.ops.object.select_all(action="DESELECT")
    char_arm.select_set(True)
    bpy.context.view_layer.objects.active = char_arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in parent_first(char_arm.pose.bones):
        src_bone = src_arm.data.bones.get(pb.name)
        if src_bone is None:
            continue
        pb.rotation_mode = "QUATERNION"
        pb.matrix = src_bone.matrix_local
        bpy.context.view_layer.update()


def retarget_walk(src_arm, dst_arm, src_action):
    assign_action(src_arm, src_action)
    bpy.ops.object.select_all(action="DESELECT")
    dst_arm.select_set(True)
    bpy.context.view_layer.objects.active = dst_arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in dst_arm.pose.bones:
        pb.rotation_mode = "QUATERNION"

    start = int(src_action.frame_range[0])
    end = int(src_action.frame_range[1])
    baked = bpy.data.actions.new("walk")
    assign_action(dst_arm, baked)

    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        for pb in parent_first(dst_arm.pose.bones):
            src = src_arm.pose.bones.get(pb.name)
            if src is None:
                continue
            pb.matrix = src.matrix
            bpy.context.view_layer.update()
        for pb in dst_arm.pose.bones:
            pb.keyframe_insert(data_path="location", frame=frame)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            pb.keyframe_insert(data_path="scale", frame=frame)

    bpy.ops.object.mode_set(mode="OBJECT")
    assign_action(dst_arm, None)
    baked.use_fake_user = True
    baked.use_frame_range = True
    baked.frame_start = start
    baked.frame_end = end
    inplace_xz(baked)
    return baked


def print_arm_dir(arm, label):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name in ("mixamorig:LeftArm", "mixamorig:RightArm", "mixamorig:LeftForeArm"):
        eb = arm.data.edit_bones[name]
        d = (eb.tail - eb.head).normalized()
        print(label, name, [round(x, 3) for x in d], "roll", round(eb.roll, 3))
    bpy.ops.object.mode_set(mode="OBJECT")


bpy.ops.wm.read_homefile(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.fbx(filepath=str(BASE))

for obj in list(bpy.data.objects):
    if obj.type in {"CAMERA", "LIGHT", "EMPTY"}:
        bpy.data.objects.remove(obj, do_unlink=True)

char = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
char.name = "Armature"
if char.animation_data:
    char.animation_data.action = None

meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for mesh in meshes:
    mesh.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = "HoriMesh"

before_objects = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=str(IDLE_FBX))
src = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE" and obj not in before_objects)
if src.animation_data:
    src.animation_data.action = None

pose_to_mixamo_tpose(char, src)

bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.context.view_layer.objects.active = body
for mod in list(body.modifiers):
    if mod.type == "ARMATURE":
        bpy.ops.object.modifier_apply(modifier=mod.name)

bpy.ops.object.select_all(action="DESELECT")
char.select_set(True)
bpy.context.view_layer.objects.active = char
bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.select_all(action="SELECT")
bpy.ops.pose.armature_apply()
bpy.ops.object.mode_set(mode="OBJECT")

mod = body.modifiers.new(name="Armature", type="ARMATURE")
mod.object = char
mod.use_vertex_groups = True
print_arm_dir(char, "AFTER_TPOSE_REST")

for obj in list(bpy.data.objects):
    if obj not in before_objects:
        bpy.data.objects.remove(obj, do_unlink=True)

if "Armature|mixamo.com|Layer0" in bpy.data.actions:
    bpy.data.actions.remove(bpy.data.actions["Armature|mixamo.com|Layer0"])

for clip_name, path in ANIMS:
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(path))
    new_actions = [a for a in bpy.data.actions if a not in before_actions]
    action = new_actions[0]
    action.name = clip_name
    action.use_fake_user = True
    inplace_xz(action)
    for obj in list(bpy.data.objects):
        if obj not in before_objects:
            bpy.data.objects.remove(obj, do_unlink=True)

before_objects = set(bpy.data.objects)
before_actions = set(bpy.data.actions)
bpy.ops.import_scene.fbx(filepath=str(WALK_FBX))
src_walk = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE" and obj not in before_objects)
src_action = next(a for a in bpy.data.actions if a not in before_actions)
retarget_walk(src_walk, char, src_action)
for obj in list(bpy.data.objects):
    if obj not in before_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
if src_action.name in bpy.data.actions:
    bpy.data.actions.remove(src_action)

ad = char.animation_data_create()
for name in ("idle", "walk", "strut", "sleep", "workout", "angry", "beauty", "called", "nodding", "awake", "hit"):
    action = bpy.data.actions[name]
    track = ad.nla_tracks.new()
    track.name = name
    start = int(action.frame_range[0])
    strip = track.strips.new(name, start, action)
    if hasattr(strip, "action_slot") and action.slots:
        try:
            strip.action_slot = action.slots[0]
        except TypeError:
            pass
    print("NLA", name, "start", start, "end", float(action.frame_range[1]))

bpy.ops.object.select_all(action="DESELECT")
char.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = char

bpy.ops.export_scene.gltf(
    filepath=str(GLB),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_nla_strips=True,
    export_anim_single_armature=True,
    export_merge_animation="NLA_TRACK",
    export_cameras=False,
    export_extras=False,
    export_yup=True,
    export_apply=False,
)
print("exported", GLB, "size", GLB.stat().st_size)
print("actions", [a.name for a in bpy.data.actions])
