#!/usr/bin/env python3
"""Export edited Blender camera and target animation to renderer scene JSON."""

import argparse
import json
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

    parser = argparse.ArgumentParser(description="Export radio bubble camera path from Blender.")
    parser.add_argument("--input", help="Optional .blend file to open before export")
    parser.add_argument("--output", required=True, help="Output radio-bubble-camera-scene.json")
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--duration", type=float, default=None)
    parser.add_argument("--step", type=float, default=0.25)
    parser.add_argument("--camera", default="RadioBubble_Camera")
    parser.add_argument("--target", default="RadioBubble_Target")
    return parser.parse_args(argv)


def vector_to_point(vector):
    return {
        "x": float(vector.x),
        "y": float(vector.y),
        "z": float(vector.z),
    }


def quaternion_to_object(quaternion):
    return {
        "w": float(quaternion.w),
        "x": float(quaternion.x),
        "y": float(quaternion.y),
        "z": float(quaternion.z),
    }


def find_object(name, fallback=None):
    obj = bpy.data.objects.get(name)
    if obj:
        return obj
    return fallback


def get_duration_secs(scene, requested_duration, fps):
    if requested_duration is not None:
        return requested_duration
    custom_duration = scene.get("radioBubbleDurationSecs")
    if custom_duration is not None:
        return float(custom_duration)
    return max(scene.frame_end - scene.frame_start, 0) / fps


def sample_scene(camera, target, duration_secs, step_secs, fps):
    scene = bpy.context.scene
    samples = []
    sample_index = 0
    scene_time = 0.0
    while scene_time <= duration_secs + step_secs * 0.5:
        clamped_time = min(scene_time, duration_secs)
        frame = int(round(clamped_time * fps)) + 1
        scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        camera_eval = camera.evaluated_get(depsgraph)
        camera_matrix = camera_eval.matrix_world.copy()
        observer = camera_matrix.translation
        rotation = camera_matrix.to_quaternion()
        forward = rotation @ Vector((0.0, 0.0, -1.0))
        up = rotation @ Vector((0.0, 1.0, 0.0))

        if target:
            target_eval = target.evaluated_get(depsgraph)
            target_point = target_eval.matrix_world.translation.copy()
        else:
            target_point = observer + forward * 100.0

        look_vector = target_point - observer
        samples.append({
            "frameIndex": sample_index,
            "sceneTimeSecs": clamped_time,
            "frame": frame,
            "observerPc": vector_to_point(observer),
            "targetPc": vector_to_point(target_point),
            "lookVectorPc": vector_to_point(look_vector),
            "lookDistancePc": float(look_vector.length),
            "cameraQuaternion": quaternion_to_object(rotation),
            "cameraForwardPc": vector_to_point(forward),
            "cameraUpPc": vector_to_point(up),
        })
        sample_index += 1
        if clamped_time >= duration_secs:
            break
        scene_time += step_secs
    return samples


def main():
    args = parse_args()
    if args.input:
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.input))

    if args.step <= 0:
        raise ValueError("--step must be greater than zero")
    if args.fps <= 0:
        raise ValueError("--fps must be greater than zero")

    scene = bpy.context.scene
    camera = find_object(args.camera, scene.camera)
    if camera is None:
        raise RuntimeError(f"Could not find camera object {args.camera!r}")
    target = find_object(args.target)
    duration_secs = get_duration_secs(scene, args.duration, args.fps)
    samples = sample_scene(camera, target, duration_secs, args.step, args.fps)
    payload = {
        "format": "radio-bubble-camera-scene-v1",
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "sourceBlend": bpy.data.filepath,
        "coordinateSystem": "Blender units interpreted as SkyKit ICRS-aligned parsecs.",
        "durationSecs": duration_secs,
        "fps": args.fps,
        "sampleStepSecs": args.step,
        "sampleCount": len(samples),
        "cameraObject": camera.name,
        "targetObject": target.name if target else None,
        "samples": samples,
    }

    output_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)
        file.write("\n")
    print(f"[radio-bubble:blender] exported {output_path}")


if __name__ == "__main__":
    main()
