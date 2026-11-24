"""Blender 4.x headless script to batch-merge Adobe Mixamo FBX animations into a
single Draco-compressed GLB with WebP textures and NLA tracks.

Usage:
  blender --background --python scripts/blender/merge_mixamo_to_glb.py -- \
    --input raw_assets/3d/mixamo/luffy_base \
    --output public/assets/3d/characters/luffy_base.glb \
    [--rotate-y-180] [--max-tex-size 1024]
"""

import argparse
import math
import os
import sys

try:
    import bpy  # type: ignore
except ImportError as exc:  # pragma: no cover
    sys.stderr.write(
        f"[merge_mixamo_to_glb] Must be executed inside Blender (--python): {exc}\n"
    )
    sys.exit(1)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Merge Mixamo FBX animations into GLB")
    parser.add_argument("--input", required=True, help="Directory with IDLE.fbx + motion FBXs")
    parser.add_argument("--output", required=True, help="Output .glb path")
    parser.add_argument(
        "--rotate-y-180",
        action="store_true",
        help="Rotate root armature 180 degrees to face glTF +Z forward",
    )
    parser.add_argument(
        "--max-tex-size",
        type=int,
        default=1024,
        help="Maximum width/height for packed textures (default: 1024)",
    )
    return parser.parse_args(argv)


def find_fbx_files(input_dir):
    if not os.path.isdir(input_dir):
        raise FileNotFoundError(f"Input directory does not exist: {input_dir}")
    fbx_files = [
        f
        for f in sorted(os.listdir(input_dir))
        if f.lower().endswith(".fbx") and os.path.isfile(os.path.join(input_dir, f))
    ]
    if not fbx_files:
        raise FileNotFoundError(f"No .fbx files found inside {input_dir}")

    idle_idx = next(
        (i for i, name in enumerate(fbx_files) if os.path.splitext(name)[0].upper() == "IDLE"),
        0,
    )
    idle_file = fbx_files.pop(idle_idx)
    return os.path.join(input_dir, idle_file), [os.path.join(input_dir, f) for f in fbx_files]


def push_action_to_nla(armature, action, clip_name):
    if armature.animation_data is None:
        armature.animation_data_create()
    action.name = clip_name
    action.use_fake_user = True
    track = armature.animation_data.nla_tracks.new()
    track.name = clip_name
    start_frame = int(round(action.frame_range[0]))
    strip = track.strips.new(clip_name, start_frame, action)
    strip.name = clip_name
    armature.animation_data.action = None


def downscale_oversized_images(max_size):
    if max_size <= 0:
        return
    for img in bpy.data.images:
        if img.source not in {"FILE", "GENERATED"}:
            continue
        w, h = img.size[0], img.size[1]
        if w <= 0 or h <= 0:
            continue
        if w > max_size or h > max_size:
            scale = min(max_size / float(w), max_size / float(h))
            new_w = max(1, int(round(w * scale)))
            new_h = max(1, int(round(h * scale)))
            img.scale(new_w, new_h)


def rotate_armature_180(armature):
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for child in armature.children_recursive:
        if child.type == "MESH":
            child.select_set(True)
    bpy.context.view_layer.objects.active = armature
    armature.rotation_euler[2] += math.pi
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def purge_orphans():
    if hasattr(bpy.ops.outliner, "orphans_purge"):
        try:
            bpy.ops.outliner.orphans_purge(do_recursive=True)
        except TypeError:
            bpy.ops.outliner.orphans_purge()


def export_glb(output_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    supported = {
        prop.identifier
        for prop in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    desired = {
        "filepath": output_path,
        "export_format": "GLB",
        "export_yup": True,
        "export_apply": False,
        "export_animations": True,
        "export_animation_mode": "NLA_TRACKS",
        "export_force_sampling": True,
        "export_draco_mesh_compression_enable": True,
        "export_draco_mesh_compression_level": 6,
        "export_image_format": "WEBP",
        "export_materials": "EXPORT",
        "use_selection": False,
    }
    kwargs = {k: v for k, v in desired.items() if k in supported}
    bpy.ops.export_scene.gltf(**kwargs)


def main():
    args = parse_args()
    idle_path, extra_paths = find_fbx_files(args.input)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=idle_path, automatic_bone_orientation=True)

    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError(f"Base file {idle_path} contains no Armature")
    base_armature = armatures[0]

    idle_clip_name = os.path.splitext(os.path.basename(idle_path))[0].upper()
    if base_armature.animation_data and base_armature.animation_data.action:
        push_action_to_nla(base_armature, base_armature.animation_data.action, idle_clip_name)
    elif bpy.data.actions:
        push_action_to_nla(base_armature, bpy.data.actions[0], idle_clip_name)

    for motion_path in extra_paths:
        before_objs = set(bpy.data.objects)
        before_actions = set(bpy.data.actions)

        bpy.ops.import_scene.fbx(filepath=motion_path, automatic_bone_orientation=True)

        new_objs = [o for o in bpy.data.objects if o not in before_objs]
        new_actions = [a for a in bpy.data.actions if a not in before_actions]

        clip_name = os.path.splitext(os.path.basename(motion_path))[0].upper()
        chosen_action = None
        for obj in new_objs:
            if obj.type == "ARMATURE" and obj.animation_data and obj.animation_data.action:
                chosen_action = obj.animation_data.action
                break
        if chosen_action is None and new_actions:
            chosen_action = new_actions[0]

        if chosen_action is not None:
            push_action_to_nla(base_armature, chosen_action, clip_name)

        for obj in new_objs:
            bpy.data.objects.remove(obj, do_unlink=True)
        purge_orphans()

    if args.rotate_y_180:
        rotate_armature_180(base_armature)

    downscale_oversized_images(args.max_tex_size)
    try:
        bpy.ops.file.pack_all()
    except RuntimeError:
        pass

    export_glb(args.output)
    print(f"[merge_mixamo_to_glb] Exported {args.output} cleanly.")


if __name__ == "__main__":
    main()
