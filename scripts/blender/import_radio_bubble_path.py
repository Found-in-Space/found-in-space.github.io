#!/usr/bin/env python3
"""Build an editable Blender scene from the radio bubble path interchange JSON."""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="Import radio bubble path data into Blender.")
    parser.add_argument("--input", required=True, help="radio-bubble-blender-scene.json")
    parser.add_argument("--output", help="Path to save the .blend file")
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--quit", action="store_true", help="Quit Blender after import")
    return parser.parse_args(argv)


def point_to_tuple(point):
    return (
        float(point.get("x", 0.0)),
        float(point.get("y", 0.0)),
        float(point.get("z", 0.0)),
    )


def hex_to_rgba(value, alpha=1.0):
    color = str(value or "#ffffff").lstrip("#")
    if len(color) != 6:
        color = "ffffff"
    return (
        int(color[0:2], 16) / 255.0,
        int(color[2:4], 16) / 255.0,
        int(color[4:6], 16) / 255.0,
        float(alpha),
    )


def material(name, color, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = hex_to_rgba(color, alpha)
    if alpha < 1.0:
        mat.use_nodes = True
        mat.blend_method = "BLEND"
        mat.show_transparent_back = True
        principled = mat.node_tree.nodes.get("Principled BSDF")
        if principled:
            principled.inputs["Alpha"].default_value = alpha
            principled.inputs["Base Color"].default_value = hex_to_rgba(color, alpha)
    return mat


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def add_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_to_collection(obj, collection):
    collection.objects.link(obj)
    for current in list(obj.users_collection):
        if current != collection:
            current.objects.unlink(obj)


def create_poly_curve(name, points, mat, collection, bevel_depth=0.08):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(max(len(points) - 1, 0))
    for index, point in enumerate(points):
        spline.points[index].co = (*point_to_tuple(point), 1.0)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(mat)
    collection.objects.link(obj)
    return obj


def create_sphere(name, location, radius, mat, collection, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=float(radius),
        location=point_to_tuple(location),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.name = f"{name}_Mesh"
    obj.data.materials.append(mat)
    link_to_collection(obj, collection)
    return obj


def create_empty(name, location, collection, display_type="PLAIN_AXES", display_size=2.0):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = display_type
    obj.empty_display_size = display_size
    obj.location = point_to_tuple(location)
    collection.objects.link(obj)
    return obj


def create_label(name, text, location, color, collection):
    bpy.ops.object.text_add(location=point_to_tuple(location), rotation=(math.radians(65), 0, math.radians(0)))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = 1.8
    mat = material(f"{name}_Material", color, 1.0)
    obj.data.materials.append(mat)
    link_to_collection(obj, collection)
    return obj


def create_feature(feature, mats, collection):
    feature_type = feature.get("type")
    color = feature.get("color", "#ffffff")
    mat = mats.setdefault(f"feature_{feature.get('id', 'unknown')}", material(
        f"Feature_{feature.get('id', 'unknown')}",
        color,
        float(feature.get("opacity", 1.0)),
    ))

    if feature_type == "landmark":
        obj = create_sphere(
            f"Feature_{feature.get('id')}",
            feature.get("pointPc", {}),
            feature.get("radiusPc", 1.0),
            mat,
            collection,
        )
        create_label(
            f"Label_{feature.get('id')}",
            feature.get("label", feature.get("id", "feature")),
            feature.get("pointPc", {}),
            color,
            collection,
        )
        return obj

    if feature_type == "sphere":
        obj = create_sphere(
            f"Feature_{feature.get('id')}",
            feature.get("centerPc", {}),
            feature.get("radiusPc", 1.0),
            mat,
            collection,
            segments=64,
            rings=32,
        )
        obj.display_type = "WIRE"
        obj.show_wire = True
        create_label(
            f"Label_{feature.get('id')}",
            feature.get("label", feature.get("id", "sphere")),
            feature.get("centerPc", {}),
            color,
            collection,
        )
        return obj

    if feature_type == "line":
        return create_poly_curve(
            f"Feature_{feature.get('id')}",
            feature.get("pointsPc", []),
            mat,
            collection,
            bevel_depth=0.045,
        )

    return None


def keyframe_object_location(obj, samples, point_key, fps):
    for sample in samples:
        scene_time = float(sample.get("sceneTimeSecs", 0.0))
        frame = int(round(scene_time * fps)) + 1
        point = sample.get(point_key, sample.get("observerPc", {}))
        obj.location = point_to_tuple(point)
        obj.keyframe_insert(data_path="location", frame=frame)

    if obj.animation_data and obj.animation_data.action:
        for fcurve in obj.animation_data.action.fcurves:
            for keyframe in fcurve.keyframe_points:
                keyframe.interpolation = "BEZIER"


def build_camera(payload, collection, fps):
    samples = payload["paths"]["camera"]["samples"]
    target_samples = [
        {
            "sceneTimeSecs": sample.get("sceneTimeSecs", 0.0),
            "targetPc": sample.get("targetPc", {}),
        }
        for sample in samples
    ]

    bpy.ops.object.camera_add(location=point_to_tuple(samples[0]["observerPc"]))
    camera = bpy.context.object
    camera.name = payload.get("roundTrip", {}).get("editableCameraObject", "RadioBubble_Camera")
    camera.data.name = "RadioBubble_Camera_Data"
    camera.data.lens = 22
    camera.data.angle = math.radians(60)
    link_to_collection(camera, collection)

    target = create_empty(
        payload.get("roundTrip", {}).get("editableTargetObject", "RadioBubble_Target"),
        samples[0].get("targetPc", {}),
        collection,
        display_type="SPHERE",
        display_size=2.2,
    )

    keyframe_object_location(camera, samples, "observerPc", fps)
    keyframe_object_location(target, target_samples, "targetPc", fps)

    constraint = camera.constraints.new(type="TRACK_TO")
    constraint.name = "RadioBubble_LookAt_Target"
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"
    constraint.target = target

    bpy.context.scene.camera = camera
    return camera, target


def build_waypoints(payload, collection):
    for waypoint in payload.get("waypoints", []):
        cue_index = int(waypoint.get("cueIndex", 0))
        time_label = f"{waypoint.get('sceneTimeSecs', 0):05.2f}s"
        observer = create_empty(
            f"Waypoint_Camera_{cue_index}_{time_label}",
            waypoint.get("observerPc", {}),
            collection,
            display_type="CUBE",
            display_size=1.2,
        )
        observer["sceneTimeSecs"] = float(waypoint.get("sceneTimeSecs", 0.0))
        observer["cueIndex"] = cue_index
        target = create_empty(
            f"Waypoint_Target_{cue_index}_{time_label}",
            waypoint.get("targetPc", {}),
            collection,
            display_type="SPHERE",
            display_size=0.9,
        )
        target["sceneTimeSecs"] = float(waypoint.get("sceneTimeSecs", 0.0))
        target["cueIndex"] = cue_index


def build_scene(payload, fps):
    clear_scene()
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = int(round(float(payload.get("durationSecs", 60)) * fps)) + 1
    scene.frame_set(1)
    scene.render.fps = fps
    scene.unit_settings.system = "METRIC"
    scene["radioBubbleFormat"] = payload.get("format", "")
    scene["radioBubbleDurationSecs"] = float(payload.get("durationSecs", 60))
    scene["radioBubbleSampleStepSecs"] = float(payload.get("sampleStepSecs", 0.25))

    features_collection = add_collection("Radio Bubble Features")
    path_collection = add_collection("Radio Bubble Paths")
    camera_collection = add_collection("Radio Bubble Camera")
    waypoint_collection = add_collection("Radio Bubble Waypoints")

    mats = {
        "camera": material("Camera_Path_Material", "#ffffff", 1.0),
        "target": material("Target_Path_Material", "#91f7ff", 0.45),
    }

    for feature in payload.get("features", []):
        create_feature(feature, mats, features_collection)

    camera_samples = payload["paths"]["camera"]["samples"]
    create_poly_curve(
        "RadioBubble_Camera_Path_Current",
        [sample["observerPc"] for sample in camera_samples],
        mats["camera"],
        path_collection,
        bevel_depth=0.09,
    )
    create_poly_curve(
        "RadioBubble_Target_Path_Current",
        [sample["targetPc"] for sample in camera_samples],
        mats["target"],
        path_collection,
        bevel_depth=0.045,
    )

    camera, target = build_camera(payload, camera_collection, fps)
    build_waypoints(payload, waypoint_collection)

    light_data = bpy.data.lights.new("RadioBubble_Key_Light", type="SUN")
    light = bpy.data.objects.new("RadioBubble_Key_Light", light_data)
    light.rotation_euler = (math.radians(45), 0, math.radians(35))
    bpy.context.scene.collection.objects.link(light)

    return camera, target


def main():
    args = parse_args()
    with open(args.input, "r", encoding="utf-8") as file:
        payload = json.load(file)

    build_scene(payload, args.fps)

    if args.output:
        output_path = os.path.abspath(args.output)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=output_path)
        print(f"[radio-bubble:blender] saved {output_path}")

    if args.quit:
        bpy.ops.wm.quit_blender()


if __name__ == "__main__":
    main()
