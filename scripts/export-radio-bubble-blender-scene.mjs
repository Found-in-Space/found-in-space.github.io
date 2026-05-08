#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	RADIO_BUBBLE_VIDEO_CUES,
	RADIO_BUBBLE_VIDEO_DURATION_SECS,
	getRadioBubbleVideoCamera,
	getRadioBubbleVideoCueIndex,
	getRadioBubbleVideoLandmarks,
	sampleRadioBubbleVideoPath,
} from '../src/scripts/radio-bubble-video-timeline.js';

const DEFAULT_OUTPUT_DIR = 'video-output/radio-bubble/blender';
const FORMAT_VERSION = 'radio-bubble-blender-scene-v1';
const LY_PER_PC = 3.2615637775591093;

function parseArgs(argv) {
	const options = {
		outputDir: DEFAULT_OUTPUT_DIR,
		stepSecs: 0.25,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith('--')) continue;
		const [key, inlineValue] = arg.slice(2).split('=', 2);
		const value = inlineValue ?? argv[index + 1];
		if (inlineValue === undefined && value && !value.startsWith('--')) {
			index += 1;
		}
		if (key === 'output' || key === 'output-dir') {
			options.outputDir = value;
		} else if (key === 'step') {
			options.stepSecs = Number(value);
		} else if (key === 'fps') {
			const fps = Number(value);
			options.stepSecs = fps > 0 ? 1 / fps : options.stepSecs;
		}
	}
	if (!Number.isFinite(options.stepSecs) || options.stepSecs <= 0) {
		throw new Error(`Invalid Blender scene step: ${options.stepSecs}`);
	}
	return options;
}

function clonePoint(point) {
	return {
		x: point.x,
		y: point.y,
		z: point.z,
	};
}

function subtractPoint(left, right) {
	return {
		x: left.x - right.x,
		y: left.y - right.y,
		z: left.z - right.z,
	};
}

function lengthPoint(point) {
	return Math.hypot(point.x, point.y, point.z);
}

function normalizePoint(point) {
	const length = lengthPoint(point);
	return length > 0
		? { x: point.x / length, y: point.y / length, z: point.z / length }
		: { x: 0, y: 0, z: -1 };
}

function addPoint(left, right) {
	return {
		x: left.x + right.x,
		y: left.y + right.y,
		z: left.z + right.z,
	};
}

function scalePoint(point, scale) {
	return {
		x: point.x * scale,
		y: point.y * scale,
		z: point.z * scale,
	};
}

function sampleAtTime(sceneTimeSecs) {
	const camera = getRadioBubbleVideoCamera(sceneTimeSecs);
	const lookVectorPc = subtractPoint(camera.targetPc, camera.observerPc);
	return {
		sceneTimeSecs,
		cueIndex: getRadioBubbleVideoCueIndex(sceneTimeSecs),
		observerPc: clonePoint(camera.observerPc),
		targetPc: clonePoint(camera.targetPc),
		lookVectorPc,
		lookDirectionPc: normalizePoint(lookVectorPc),
		lookDistancePc: lengthPoint(lookVectorPc),
	};
}

function buildWaypoints() {
	const times = new Set([0, RADIO_BUBBLE_VIDEO_DURATION_SECS]);
	for (const cue of RADIO_BUBBLE_VIDEO_CUES) {
		times.add(cue.startSecs);
		times.add(cue.endSecs);
	}
	return [...times]
		.sort((left, right) => left - right)
		.map((sceneTimeSecs) => sampleAtTime(sceneTimeSecs));
}

function buildFeatures(landmarks) {
	const orionGuidePc = addPoint(landmarks.sunPc, scalePoint(landmarks.orionForward, 90));
	return [
		{
			id: 'sun',
			label: 'Sun',
			type: 'landmark',
			pointPc: landmarks.sunPc,
			color: '#ffd56a',
			radiusPc: 1.0,
		},
		{
			id: 'hyades-center',
			label: 'Hyades center',
			type: 'landmark',
			pointPc: landmarks.hyadesCenterPc,
			color: '#d98cff',
			radiusPc: 1.8,
		},
		{
			id: 'orion-direction',
			label: 'Orion direction guide',
			type: 'landmark',
			pointPc: orionGuidePc,
			color: '#83a8ff',
			radiusPc: 1.3,
		},
		{
			id: 'orion-nebula',
			label: 'Orion Nebula actual position',
			type: 'landmark',
			pointPc: landmarks.orionNebulaPc,
			color: '#aebfff',
			radiusPc: 2.4,
		},
		{
			id: 'radio-bubble',
			label: 'Radio bubble radius',
			type: 'sphere',
			centerPc: landmarks.sunPc,
			radiusPc: landmarks.radioBubbleRadiusPc,
			radiusLy: landmarks.radioBubbleRadiusPc * LY_PER_PC,
			color: '#45c8ff',
			opacity: 0.16,
		},
		{
			id: 'sun-to-orion',
			label: 'Sun to Orion direction',
			type: 'line',
			pointsPc: [landmarks.sunPc, orionGuidePc],
			color: '#83a8ff',
			opacity: 0.45,
		},
		{
			id: 'sun-to-hyades',
			label: 'Sun to Hyades',
			type: 'line',
			pointsPc: [landmarks.sunPc, landmarks.hyadesCenterPc],
			color: '#d98cff',
			opacity: 0.35,
		},
	];
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const outputDir = path.resolve(process.cwd(), options.outputDir);
	const landmarks = getRadioBubbleVideoLandmarks();
	const samples = sampleRadioBubbleVideoPath({
		stepSecs: options.stepSecs,
		includeEnd: true,
	});
	const payload = {
		format: FORMAT_VERSION,
		generatedAt: new Date().toISOString(),
		coordinateSystem: 'ICRS-aligned parsec coordinates from SkyKit constants; Blender units are parsecs.',
		durationSecs: RADIO_BUBBLE_VIDEO_DURATION_SECS,
		sampleStepSecs: options.stepSecs,
		sampleCount: samples.length,
		recommendedFps: 24,
		cues: RADIO_BUBBLE_VIDEO_CUES,
		features: buildFeatures(landmarks),
		landmarks,
		waypoints: buildWaypoints(),
		paths: {
			camera: {
				id: 'camera-path-current',
				label: 'Current generated camera path',
				samples,
			},
			target: {
				id: 'target-path-current',
				label: 'Current generated look-at target path',
				samples: samples.map((sample) => ({
					frameIndex: sample.frameIndex,
					sceneTimeSecs: sample.sceneTimeSecs,
					cueIndex: sample.cueIndex,
					targetPc: clonePoint(sample.targetPc),
				})),
			},
		},
		roundTrip: {
			editableCameraObject: 'RadioBubble_Camera',
			editableTargetObject: 'RadioBubble_Target',
			sceneFormat: 'radio-bubble-camera-scene-v1',
		},
	};

	await mkdir(outputDir, { recursive: true });
	const scenePath = path.join(outputDir, 'radio-bubble-blender-scene.json');
	await writeFile(scenePath, `${JSON.stringify(payload, null, 2)}\n`);
	console.log(`[radio-bubble:blender] wrote ${path.relative(process.cwd(), scenePath)}`);
	console.log(`[radio-bubble:blender] samples=${samples.length} step=${options.stepSecs}s`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
