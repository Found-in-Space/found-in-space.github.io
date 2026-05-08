import {
	HYADES_CENTER_PC,
	ORION_NEBULA_PC,
	SOLAR_ORIGIN_PC,
} from '@found-in-space/skykit';

export const RADIO_BUBBLE_VIDEO_DURATION_SECS = 60;

export const RADIO_BUBBLE_VIDEO_CUES = Object.freeze([
	{
		startSecs: 0,
		endSecs: 8,
		eyebrow: 'From the Sun',
		title: 'Orion gives us a familiar landmark.',
		body: 'From here, our radio broadcasts expand outward at light speed, centred on the Sun.',
	},
	{
		startSecs: 8,
		endSecs: 16,
		eyebrow: 'Stepping sideways',
		title: 'Orion starts to lose its familiar shape.',
		body: 'A small sideways move is enough to reveal that the constellation is a nearby line of sight, not a flat pattern.',
	},
	{
		startSecs: 16,
		endSecs: 24,
		eyebrow: 'Turning back',
		title: 'Now the bubble comes into view.',
		body: 'The blue mesh is the wavefront: every early broadcast and radar pulse moving together through nearby space.',
	},
	{
		startSecs: 24,
		endSecs: 32,
		eyebrow: 'The shell',
		title: 'After 131 years, it reaches about 40 parsecs.',
		body: "Stars inside this sphere have already been washed over by humanity's electromagnetic history.",
	},
	{
		startSecs: 32,
		endSecs: 40,
		eyebrow: 'The Hyades',
		title: 'The nearest open cluster is just beyond reach.',
		body: 'We follow the same outward path toward the Hyades, about 48 parsecs from the Sun.',
	},
	{
		startSecs: 40,
		endSecs: 52,
		eyebrow: 'Around the cluster',
		title: 'A full orbit makes the scale feel real.',
		body: 'Even this nearby cluster sits beyond the first radio shell. Our earliest signals are still roughly 8 parsecs short.',
	},
	{
		startSecs: 52,
		endSecs: 60,
		eyebrow: 'Back to alignment',
		title: 'The journey ends with Orion behind the Sun.',
		body: 'From this line of sight Orion keeps its shape again, while the radio bubble collapses back into a local footprint.',
	},
]);

function clamp01(value) {
	return Math.min(1, Math.max(0, Number(value) || 0));
}

function smoothstep(value) {
	const t = clamp01(value);
	return t * t * (3 - 2 * t);
}

function lerp(left, right, t) {
	return left + (right - left) * t;
}

function lerpPoint(left, right, t) {
	return {
		x: lerp(left.x, right.x, t),
		y: lerp(left.y, right.y, t),
		z: lerp(left.z, right.z, t),
	};
}

function clonePoint(point) {
	return {
		x: point.x,
		y: point.y,
		z: point.z,
	};
}

function addPoint(left, right) {
	return {
		x: left.x + right.x,
		y: left.y + right.y,
		z: left.z + right.z,
	};
}

function subtractPoint(left, right) {
	return {
		x: left.x - right.x,
		y: left.y - right.y,
		z: left.z - right.z,
	};
}

function scalePoint(point, scale) {
	return {
		x: point.x * scale,
		y: point.y * scale,
		z: point.z * scale,
	};
}

function dotPoint(left, right) {
	return left.x * right.x + left.y * right.y + left.z * right.z;
}

function lengthPoint(point) {
	return Math.hypot(point.x, point.y, point.z);
}

function distancePoint(left, right) {
	return lengthPoint(subtractPoint(left, right));
}

function normalizePoint(point) {
	const length = lengthPoint(point);
	return length > 0 ? scalePoint(point, 1 / length) : { x: 0, y: 0, z: 0 };
}

const ORION_FORWARD = normalizePoint(subtractPoint(ORION_NEBULA_PC, SOLAR_ORIGIN_PC));
const HYADES_FROM_SUN = subtractPoint(HYADES_CENTER_PC, SOLAR_ORIGIN_PC);
const PATH_SIDE = normalizePoint(subtractPoint(
	HYADES_FROM_SUN,
	scalePoint(ORION_FORWARD, dotPoint(HYADES_FROM_SUN, ORION_FORWARD)),
));
const HYADES_ORBIT_START_ANGLE = -0.72;
const HYADES_ORBIT_RADIUS_PC = 24;
const SUN_RETURN_RADIUS_PC = 24;

function pathPoint({ forwardPc = 0, sidePc = 0 } = {}) {
	return addPoint(
		SOLAR_ORIGIN_PC,
		addPoint(
			scalePoint(ORION_FORWARD, forwardPc),
			scalePoint(PATH_SIDE, sidePc),
		),
	);
}

function hyadesOrbitCamera(progress) {
	const angle = HYADES_ORBIT_START_ANGLE + progress * Math.PI * 2;
	return {
		observerPc: addPoint(
			HYADES_CENTER_PC,
			addPoint(
				scalePoint(PATH_SIDE, Math.cos(angle) * HYADES_ORBIT_RADIUS_PC),
				scalePoint(ORION_FORWARD, Math.sin(angle) * HYADES_ORBIT_RADIUS_PC),
			),
		),
		targetPc: HYADES_CENTER_PC,
	};
}

export function getRadioBubbleVideoCamera(sceneTimeSecs) {
	const t = Number(sceneTimeSecs) || 0;
	if (t < 8) {
		return {
			observerPc: { ...SOLAR_ORIGIN_PC },
			targetPc: ORION_NEBULA_PC,
		};
	}
	if (t < 16) {
		const u = smoothstep((t - 8) / 8);
		return {
			observerPc: pathPoint({
				forwardPc: lerp(0, 3, u),
				sidePc: lerp(0, 20, u),
			}),
			targetPc: ORION_NEBULA_PC,
		};
	}
	if (t < 24) {
		const u = smoothstep((t - 16) / 8);
		return {
			observerPc: pathPoint({
				forwardPc: lerp(3, 10, u),
				sidePc: lerp(20, 58, u),
			}),
			targetPc: lerpPoint(ORION_NEBULA_PC, SOLAR_ORIGIN_PC, u),
		};
	}
	if (t < 32) {
		const u = smoothstep((t - 24) / 8);
		return {
			observerPc: pathPoint({
				forwardPc: lerp(10, 4, u),
				sidePc: lerp(58, 72, u),
			}),
			targetPc: SOLAR_ORIGIN_PC,
		};
	}
	if (t < 40) {
		const u = smoothstep((t - 32) / 8);
		const start = pathPoint({ forwardPc: 4, sidePc: 72 });
		const end = hyadesOrbitCamera(0).observerPc;
		return {
			observerPc: lerpPoint(start, end, u),
			targetPc: lerpPoint(SOLAR_ORIGIN_PC, HYADES_CENTER_PC, u),
		};
	}
	if (t < 52) {
		return hyadesOrbitCamera((t - 40) / 12);
	}
	if (t < 56) {
		const u = smoothstep((t - 52) / 4);
		const start = hyadesOrbitCamera(1).observerPc;
		const end = pathPoint({ forwardPc: SUN_RETURN_RADIUS_PC, sidePc: 0 });
		return {
			observerPc: lerpPoint(start, end, u),
			targetPc: lerpPoint(HYADES_CENTER_PC, SOLAR_ORIGIN_PC, u),
		};
	}
	const u = smoothstep((t - 56) / 4);
	const angle = u * Math.PI;
	return {
		observerPc: pathPoint({
			forwardPc: Math.cos(angle) * SUN_RETURN_RADIUS_PC,
			sidePc: Math.sin(angle) * SUN_RETURN_RADIUS_PC,
		}),
		targetPc: SOLAR_ORIGIN_PC,
	};
}

export function getRadioBubbleVideoCue(sceneTimeSecs) {
	return RADIO_BUBBLE_VIDEO_CUES.find((entry) => sceneTimeSecs >= entry.startSecs && sceneTimeSecs < entry.endSecs)
		?? RADIO_BUBBLE_VIDEO_CUES[RADIO_BUBBLE_VIDEO_CUES.length - 1];
}

export function getRadioBubbleVideoCueIndex(sceneTimeSecs) {
	const index = RADIO_BUBBLE_VIDEO_CUES.findIndex((entry) => sceneTimeSecs >= entry.startSecs && sceneTimeSecs < entry.endSecs);
	return index >= 0 ? index : RADIO_BUBBLE_VIDEO_CUES.length - 1;
}

export function getRadioBubbleVideoLandmarks() {
	return {
		sunPc: clonePoint(SOLAR_ORIGIN_PC),
		hyadesCenterPc: clonePoint(HYADES_CENTER_PC),
		orionNebulaPc: clonePoint(ORION_NEBULA_PC),
		orionForward: clonePoint(ORION_FORWARD),
		pathSide: clonePoint(PATH_SIDE),
		radioBubbleRadiusPc: 131 / 3.2615637775591093,
	};
}

export function sampleRadioBubbleVideoPath(options = {}) {
	const stepSecs = Number.isFinite(options.stepSecs) && options.stepSecs > 0
		? options.stepSecs
		: 1;
	const durationSecs = Number.isFinite(options.durationSecs) && options.durationSecs > 0
		? options.durationSecs
		: RADIO_BUBBLE_VIDEO_DURATION_SECS;
	const includeEnd = options.includeEnd !== false;
	const samples = [];
	const limit = includeEnd ? durationSecs + stepSecs * 0.5 : durationSecs - stepSecs * 0.5;
	let frameIndex = 0;

	for (let sceneTimeSecs = 0; sceneTimeSecs <= limit; sceneTimeSecs += stepSecs) {
		const clampedTimeSecs = Math.min(sceneTimeSecs, durationSecs);
		const camera = getRadioBubbleVideoCamera(clampedTimeSecs);
		const cueIndex = getRadioBubbleVideoCueIndex(clampedTimeSecs);
		const cue = RADIO_BUBBLE_VIDEO_CUES[cueIndex];
		const lookVectorPc = subtractPoint(camera.targetPc, camera.observerPc);
		samples.push({
			frameIndex,
			sceneTimeSecs: clampedTimeSecs,
			cueIndex,
			cueEyebrow: cue.eyebrow,
			observerPc: clonePoint(camera.observerPc),
			targetPc: clonePoint(camera.targetPc),
			lookVectorPc,
			lookDistancePc: lengthPoint(lookVectorPc),
			distanceToSunPc: distancePoint(camera.observerPc, SOLAR_ORIGIN_PC),
			distanceToHyadesPc: distancePoint(camera.observerPc, HYADES_CENTER_PC),
		});
		frameIndex += 1;
		if (clampedTimeSecs >= durationSecs) {
			break;
		}
	}

	return samples;
}

export function getRadioBubbleVideoCueOpacity(sceneTimeSecs, fadeSecs = 0.85) {
	const cue = getRadioBubbleVideoCue(sceneTimeSecs);
	const localTime = sceneTimeSecs - cue.startSecs;
	const fadeIn = clamp01(localTime / fadeSecs);
	const fadeOut = clamp01((cue.endSecs - sceneTimeSecs) / fadeSecs);
	return Math.min(fadeIn, fadeOut);
}
