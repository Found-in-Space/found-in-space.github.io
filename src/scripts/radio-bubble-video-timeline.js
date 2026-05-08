import {
	HYADES_CENTER_PC,
	ORION_NEBULA_PC,
	SOLAR_ORIGIN_PC,
} from '@found-in-space/skykit';

export const RADIO_BUBBLE_VIDEO_DURATION_SECS = 60;

const HYADES_FRAMING_TARGET_PC = Object.freeze({
	x: HYADES_CENTER_PC.x * 0.64,
	y: HYADES_CENTER_PC.y * 0.64,
	z: HYADES_CENTER_PC.z * 0.64,
});

export const RADIO_BUBBLE_VIDEO_CUES = Object.freeze([
	{
		startSecs: 0,
		endSecs: 8,
		eyebrow: 'Inside the bubble',
		title: 'Earth sits inside a shell of old signals.',
		body: 'Every radio broadcast and radar pulse expands outward at light speed, centred on the Sun.',
	},
	{
		startSecs: 8,
		endSecs: 18,
		eyebrow: 'The wavefront',
		title: 'After 131 years, it reaches about 40 parsecs.',
		body: 'The blue mesh marks the leading edge. Stars inside have been washed over by our electromagnetic history.',
	},
	{
		startSecs: 18,
		endSecs: 30,
		eyebrow: 'Pulling back',
		title: 'The impressive sphere quickly becomes small.',
		body: 'A thousand nearby systems sounds like a lot, until the local neighbourhood begins to fill the frame.',
	},
	{
		startSecs: 30,
		endSecs: 42,
		eyebrow: 'Galactic scale',
		title: 'Against the Milky Way, the bubble is almost nothing.',
		body: "If the galaxy were a football pitch, humanity's radio footprint would be smaller than a grain of sand.",
	},
	{
		startSecs: 42,
		endSecs: 52,
		eyebrow: 'The Hyades',
		title: 'The nearest open cluster is still just beyond reach.',
		body: 'The Hyades sit about 48 parsecs away. Our earliest signals are still roughly 8 parsecs short.',
	},
	{
		startSecs: 52,
		endSecs: 60,
		eyebrow: 'Back home',
		title: 'The volume that knows we are here is tiny.',
		body: 'From inside, the shell becomes invisible again. Most of the galaxy has no electromagnetic evidence of us at all.',
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

function orbitPoint(center, radiusPc, angleRad, heightPc = 0) {
	return {
		x: center.x + Math.cos(angleRad) * radiusPc,
		y: center.y + heightPc,
		z: center.z + Math.sin(angleRad) * radiusPc,
	};
}

function insideCamera(sceneTimeSecs) {
	const angle = -0.95 + sceneTimeSecs * 0.08;
	return {
		observerPc: orbitPoint(SOLAR_ORIGIN_PC, 8, angle, 1.6),
		targetPc: ORION_NEBULA_PC,
	};
}

function outsideCamera(sceneTimeSecs) {
	const angle = 0.34 + (sceneTimeSecs - 24) * 0.045;
	return {
		observerPc: orbitPoint(SOLAR_ORIGIN_PC, 175, angle, 28),
		targetPc: SOLAR_ORIGIN_PC,
	};
}

function hyadesCamera(sceneTimeSecs) {
	const angle = -0.65 + (sceneTimeSecs - 48) * 0.08;
	return {
		observerPc: orbitPoint(HYADES_CENTER_PC, 28, angle, 8),
		targetPc: HYADES_FRAMING_TARGET_PC,
	};
}

export function getRadioBubbleVideoCamera(sceneTimeSecs) {
	const t = Number(sceneTimeSecs) || 0;
	if (t < 10) {
		return insideCamera(t);
	}
	if (t < 24) {
		const u = smoothstep((t - 10) / 14);
		const start = insideCamera(10);
		const end = outsideCamera(24);
		return {
			observerPc: lerpPoint(start.observerPc, end.observerPc, u),
			targetPc: lerpPoint(start.targetPc, SOLAR_ORIGIN_PC, u),
		};
	}
	if (t < 38) {
		return outsideCamera(t);
	}
	if (t < 48) {
		const u = smoothstep((t - 38) / 10);
		const start = outsideCamera(38);
		const end = hyadesCamera(48);
		return {
			observerPc: lerpPoint(start.observerPc, end.observerPc, u),
			targetPc: lerpPoint(SOLAR_ORIGIN_PC, HYADES_FRAMING_TARGET_PC, u),
		};
	}
	if (t < 54) {
		return hyadesCamera(t);
	}
	const u = smoothstep((t - 54) / 6);
	const start = hyadesCamera(54);
	const end = insideCamera(60);
	return {
		observerPc: lerpPoint(start.observerPc, end.observerPc, u),
		targetPc: lerpPoint(HYADES_FRAMING_TARGET_PC, ORION_NEBULA_PC, u),
	};
}

export function getRadioBubbleVideoCue(sceneTimeSecs) {
	return RADIO_BUBBLE_VIDEO_CUES.find((entry) => sceneTimeSecs >= entry.startSecs && sceneTimeSecs < entry.endSecs)
		?? RADIO_BUBBLE_VIDEO_CUES[RADIO_BUBBLE_VIDEO_CUES.length - 1];
}

export function getRadioBubbleVideoCueOpacity(sceneTimeSecs, fadeSecs = 0.85) {
	const cue = getRadioBubbleVideoCue(sceneTimeSecs);
	const localTime = sceneTimeSecs - cue.startSecs;
	const fadeIn = clamp01(localTime / fadeSecs);
	const fadeOut = clamp01((cue.endSecs - sceneTimeSecs) / fadeSecs);
	return Math.min(fadeIn, fadeOut);
}
