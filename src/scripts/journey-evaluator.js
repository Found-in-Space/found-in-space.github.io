import * as THREE from 'three';

export const FIS_JOURNEY_FORMAT = 'fis-journey-v1';

const EPSILON = 1e-6;
const DEFAULT_TARGET_DISTANCE_PC = 100;
const DEFAULT_ARC_SAMPLES_PER_SEGMENT = 80;
const DEFAULT_POINT = Object.freeze({ x: 0, y: 0, z: 0 });
const DEFAULT_FORWARD = Object.freeze({ x: 0, y: 0, z: -1 });
const DEFAULT_UP = Object.freeze({ x: 0, y: 1, z: 0 });

const CAMERA_FORWARD = new THREE.Vector3(0, 0, -1);
const CAMERA_UP = new THREE.Vector3(0, 1, 0);

function finiteNumber(value, fallback = 0) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function clonePoint(point, fallback = DEFAULT_POINT) {
	const source = point && typeof point === 'object' ? point : fallback;
	return {
		x: finiteNumber(source.x, fallback.x),
		y: finiteNumber(source.y, fallback.y),
		z: finiteNumber(source.z, fallback.z),
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

function dotPoint(left, right) {
	return left.x * right.x + left.y * right.y + left.z * right.z;
}

function crossPoint(left, right) {
	return {
		x: left.y * right.z - left.z * right.y,
		y: left.z * right.x - left.x * right.z,
		z: left.x * right.y - left.y * right.x,
	};
}

function lengthPoint(point) {
	return Math.hypot(point.x, point.y, point.z);
}

function distancePoint(left, right) {
	return lengthPoint(subtractPoint(left, right));
}

export function normalizeJourneyVector(point, fallback = DEFAULT_FORWARD) {
	const candidate = clonePoint(point, fallback);
	const length = lengthPoint(candidate);
	if (length <= EPSILON) {
		return clonePoint(fallback);
	}
	return scalePoint(candidate, 1 / length);
}

function clamp01(value) {
	return Math.min(1, Math.max(0, Number(value) || 0));
}

function sortByTime(entries) {
	return [...entries].sort((left, right) => {
		const timeDiff = finiteNumber(left.timeSecs) - finiteNumber(right.timeSecs);
		return timeDiff || String(left.id ?? '').localeCompare(String(right.id ?? ''));
	});
}

function cleanMotionGroup(motionGroup) {
	if (!motionGroup || typeof motionGroup !== 'object' || motionGroup.id == null) {
		return null;
	}
	const role = ['anchor', 'real', 'helper'].includes(motionGroup.role) ? motionGroup.role : 'real';
	return {
		id: String(motionGroup.id),
		kind: motionGroup.kind === 'ease' ? 'ease' : String(motionGroup.kind ?? 'ease'),
		role,
		easeSecs: Math.max(0, finiteNumber(motionGroup.easeSecs, 0)),
		rampSampleSecs: Math.max(0, finiteNumber(motionGroup.rampSampleSecs, 0)),
	};
}

function cleanLocationWaypoints(waypoints) {
	const entries = Array.isArray(waypoints) ? waypoints : [];
	return sortByTime(entries).map((entry, index) => {
		const waypoint = {
			id: String(entry.id ?? `loc-${index}`),
			timeSecs: finiteNumber(entry.timeSecs),
			positionPc: clonePoint(entry.positionPc),
		};
		const motionGroup = cleanMotionGroup(entry.motionGroup);
		if (motionGroup) {
			waypoint.motionGroup = motionGroup;
		}
		return waypoint;
	});
}

function orthonormalizeUp(forward, up) {
	const candidate = normalizeJourneyVector(up, DEFAULT_UP);
	const projected = subtractPoint(candidate, scalePoint(forward, dotPoint(candidate, forward)));
	const projectedLength = lengthPoint(projected);
	if (projectedLength > EPSILON) {
		return scalePoint(projected, 1 / projectedLength);
	}

	const fallbackCandidates = [
		DEFAULT_UP,
		{ x: 0, y: 0, z: 1 },
		{ x: 1, y: 0, z: 0 },
	];
	for (const fallback of fallbackCandidates) {
		const next = subtractPoint(fallback, scalePoint(forward, dotPoint(fallback, forward)));
		const nextLength = lengthPoint(next);
		if (nextLength > EPSILON) {
			return scalePoint(next, 1 / nextLength);
		}
	}
	return { x: 0, y: 1, z: 0 };
}

function cleanDirectionLookWaypoint(entry, index) {
	const forward = normalizeJourneyVector(entry.forward, DEFAULT_FORWARD);
	return {
		id: String(entry.id ?? `cam-${index}`),
		timeSecs: finiteNumber(entry.timeSecs),
		kind: 'direction',
		forward,
		up: orthonormalizeUp(forward, entry.up),
	};
}

function cleanTargetGuide(targetGuide) {
	if (!targetGuide || typeof targetGuide !== 'object') {
		return null;
	}
	const id = targetGuide.id == null ? '' : String(targetGuide.id);
	const label = targetGuide.label == null ? '' : String(targetGuide.label);
	if (!id && !label) {
		return null;
	}
	return { id, label };
}

function cleanCameraLookWaypoints(cameraLookWaypoints, legacyCameraWaypoints) {
	const entries = Array.isArray(cameraLookWaypoints) && cameraLookWaypoints.length > 0
		? cameraLookWaypoints
		: legacyCameraWaypoints;
	const waypoints = Array.isArray(entries) ? entries : [];
	return sortByTime(waypoints).map((entry, index) => {
		if (entry.kind === 'target') {
			const waypoint = {
				id: String(entry.id ?? `cam-${index}`),
				timeSecs: finiteNumber(entry.timeSecs),
				kind: 'target',
				targetPc: clonePoint(entry.targetPc),
				up: normalizeJourneyVector(entry.up, DEFAULT_UP),
			};
			const targetGuide = cleanTargetGuide(entry.targetGuide);
			if (targetGuide) {
				waypoint.targetGuide = targetGuide;
			}
			return waypoint;
		}
		return cleanDirectionLookWaypoint(entry, index);
	});
}

function cleanGuides(guides) {
	const entries = Array.isArray(guides) ? guides : [];
	return entries.map((entry, index) => ({
		id: String(entry.id ?? `guide-${index}`),
		label: String(entry.label ?? entry.id ?? `Guide ${index + 1}`),
		shape: entry.shape === 'cube' ? 'cube' : 'sphere',
		positionPc: clonePoint(entry.positionPc),
		radiusPc: Math.max(0, finiteNumber(entry.radiusPc ?? entry.sizePc, 1)),
		sizePc: Math.max(0, finiteNumber(entry.sizePc ?? entry.radiusPc, 1)),
		color: String(entry.color ?? '#8fd5ff'),
		opacity: Math.min(1, Math.max(0, finiteNumber(entry.opacity, 0.45))),
	}));
}

export function normalizeJourney(journey) {
	const source = journey && typeof journey === 'object' ? journey : {};
	return {
		format: source.format ?? FIS_JOURNEY_FORMAT,
		id: String(source.id ?? 'journey'),
		title: String(source.title ?? 'Journey'),
		durationSecs: Math.max(EPSILON, finiteNumber(source.durationSecs, 60)),
		locationWaypoints: cleanLocationWaypoints(source.locationWaypoints),
		cameraLookWaypoints: cleanCameraLookWaypoints(source.cameraLookWaypoints, source.cameraWaypoints),
		guides: cleanGuides(source.guides),
		cues: Array.isArray(source.cues) ? source.cues.map((cue) => ({ ...cue })) : [],
	};
}

function extrapolateBefore(first, second) {
	return subtractPoint(scalePoint(first, 2), second);
}

function extrapolateAfter(last, previous) {
	return subtractPoint(scalePoint(last, 2), previous);
}

function interpolateCentripetal(pa, pb, ta, tb, t) {
	if (Math.abs(tb - ta) <= EPSILON) {
		return clonePoint(pb);
	}
	const left = scalePoint(pa, (tb - t) / (tb - ta));
	const right = scalePoint(pb, (t - ta) / (tb - ta));
	return addPoint(left, right);
}

function knot(nextT, pa, pb) {
	return nextT + Math.max(Math.sqrt(distancePoint(pa, pb)), EPSILON);
}

function catmullRomSegmentPoint(points, index, u) {
	const p1 = points[index];
	const p2 = points[index + 1];
	if (!p1 || !p2) {
		return clonePoint(points[points.length - 1] ?? DEFAULT_POINT);
	}
	const p0 = points[index - 1] ?? extrapolateBefore(p1, p2);
	const p3 = points[index + 2] ?? extrapolateAfter(p2, p1);
	const t0 = 0;
	const t1 = knot(t0, p0, p1);
	const t2 = knot(t1, p1, p2);
	const t3 = knot(t2, p2, p3);
	const t = lerp(t1, t2, clamp01(u));

	const a1 = interpolateCentripetal(p0, p1, t0, t1, t);
	const a2 = interpolateCentripetal(p1, p2, t1, t2, t);
	const a3 = interpolateCentripetal(p2, p3, t2, t3, t);
	const b1 = interpolateCentripetal(a1, a2, t0, t2, t);
	const b2 = interpolateCentripetal(a2, a3, t1, t3, t);
	return interpolateCentripetal(b1, b2, t1, t2, t);
}

function createArcTable(points, index, samplesPerSegment) {
	const samples = [{ u: 0, distance: 0, point: catmullRomSegmentPoint(points, index, 0) }];
	let distance = 0;
	let previous = samples[0].point;
	for (let step = 1; step <= samplesPerSegment; step += 1) {
		const u = step / samplesPerSegment;
		const point = catmullRomSegmentPoint(points, index, u);
		distance += distancePoint(previous, point);
		samples.push({ u, distance, point });
		previous = point;
	}
	return {
		length: distance,
		samples,
	};
}

function createLocationArcSegments(waypoints, options = {}) {
	const points = waypoints.map((entry) => entry.positionPc);
	const samplesPerSegment = Math.max(8, Math.floor(options.samplesPerSegment ?? DEFAULT_ARC_SAMPLES_PER_SEGMENT));
	const segments = [];
	for (let index = 0; index < waypoints.length - 1; index += 1) {
		const start = waypoints[index];
		const end = waypoints[index + 1];
		const durationSecs = end.timeSecs - start.timeSecs;
		const held = distancePoint(start.positionPc, end.positionPc) <= EPSILON;
		const arc = held
			? { length: 0, samples: [{ u: 0, distance: 0, point: clonePoint(start.positionPc) }] }
			: createArcTable(points, index, samplesPerSegment);
		segments.push({
			index,
			start,
			end,
			durationSecs,
			held,
			arc,
			speedPcPerSec: durationSecs > EPSILON && !held ? arc.length / durationSecs : 0,
		});
	}
	return segments;
}

export function getLocationWaypointArcSegments(waypoints, options = {}) {
	return createLocationArcSegments(cleanLocationWaypoints(waypoints), options).map((segment) => ({
		index: segment.index,
		startId: segment.start.id,
		endId: segment.end.id,
		startTimeSecs: segment.start.timeSecs,
		endTimeSecs: segment.end.timeSecs,
		durationSecs: segment.durationSecs,
		lengthPc: segment.arc.length,
		held: segment.held,
		speedPcPerSec: segment.speedPcPerSec,
	}));
}

function uAtArcDistance(table, targetDistance) {
	if (table.length <= EPSILON) {
		return 0;
	}
	const clamped = Math.min(table.length, Math.max(0, targetDistance));
	for (let index = 1; index < table.samples.length; index += 1) {
		const right = table.samples[index];
		const left = table.samples[index - 1];
		if (right.distance >= clamped) {
			const span = right.distance - left.distance;
			const local = span > EPSILON ? (clamped - left.distance) / span : 0;
			return lerp(left.u, right.u, local);
		}
	}
	return 1;
}

export function sampleLocationWaypointArcPoint(waypoints, segmentIndex, distancePc, options = {}) {
	const cleanWaypoints = cleanLocationWaypoints(waypoints);
	const segments = createLocationArcSegments(cleanWaypoints, options);
	const segment = segments[segmentIndex];
	if (!segment) {
		return clonePoint(cleanWaypoints[cleanWaypoints.length - 1]?.positionPc ?? DEFAULT_POINT);
	}
	if (segment.held || segment.arc.length <= EPSILON) {
		return clonePoint(segment.start.positionPc);
	}
	const u = uAtArcDistance(segment.arc, finiteNumber(distancePc));
	return catmullRomSegmentPoint(cleanWaypoints.map((entry) => entry.positionPc), segment.index, u);
}

function createLocationTrack(waypoints, options = {}) {
	const segments = createLocationArcSegments(waypoints, options)
		.filter((segment) => segment.durationSecs > EPSILON);
	return { waypoints, segments };
}

function findTimedSegment(segments, timeSecs) {
	if (segments.length === 0) {
		return null;
	}
	if (timeSecs <= segments[0].start.timeSecs) {
		return segments[0];
	}
	for (const segment of segments) {
		if (timeSecs >= segment.start.timeSecs && timeSecs <= segment.end.timeSecs) {
			return segment;
		}
	}
	return segments[segments.length - 1];
}

function evaluateLocation(track, timeSecs) {
	if (track.waypoints.length === 0) {
		return {
			observerPc: clonePoint(DEFAULT_POINT),
			velocityUnitVectorPc: clonePoint(DEFAULT_POINT),
			speedPcPerSec: 0,
		};
	}
	if (track.waypoints.length === 1 || track.segments.length === 0) {
		return {
			observerPc: clonePoint(track.waypoints[0].positionPc),
			velocityUnitVectorPc: clonePoint(DEFAULT_POINT),
			speedPcPerSec: 0,
		};
	}

	const segment = findTimedSegment(track.segments, timeSecs);
	if (!segment) {
		return {
			observerPc: clonePoint(track.waypoints[0].positionPc),
			velocityUnitVectorPc: clonePoint(DEFAULT_POINT),
			speedPcPerSec: 0,
		};
	}

	const localTime = Math.min(segment.durationSecs, Math.max(0, timeSecs - segment.start.timeSecs));
	if (segment.held || segment.arc.length <= EPSILON) {
		return {
			observerPc: clonePoint(segment.start.positionPc),
			velocityUnitVectorPc: clonePoint(DEFAULT_POINT),
			speedPcPerSec: 0,
		};
	}

	const targetDistance = (localTime / segment.durationSecs) * segment.arc.length;
	const u = uAtArcDistance(segment.arc, targetDistance);
	const observerPc = catmullRomSegmentPoint(track.waypoints.map((entry) => entry.positionPc), segment.index, u);
	const deltaDistance = Math.max(segment.arc.length * 0.0025, 0.01);
	const beforeU = uAtArcDistance(segment.arc, targetDistance - deltaDistance);
	const afterU = uAtArcDistance(segment.arc, targetDistance + deltaDistance);
	const before = catmullRomSegmentPoint(track.waypoints.map((entry) => entry.positionPc), segment.index, beforeU);
	const after = catmullRomSegmentPoint(track.waypoints.map((entry) => entry.positionPc), segment.index, afterU);
	return {
		observerPc,
		velocityUnitVectorPc: normalizeJourneyVector(subtractPoint(after, before), DEFAULT_POINT),
		speedPcPerSec: segment.speedPcPerSec,
	};
}

function quaternionFromForwardUp(forwardInput, upInput) {
	const forward = normalizeJourneyVector(forwardInput, DEFAULT_FORWARD);
	const up = orthonormalizeUp(forward, upInput);
	const backward = scalePoint(forward, -1);
	const right = normalizeJourneyVector(crossPoint(up, backward), { x: 1, y: 0, z: 0 });
	const correctedUp = normalizeJourneyVector(crossPoint(backward, right), up);
	const matrix = new THREE.Matrix4().makeBasis(
		new THREE.Vector3(right.x, right.y, right.z),
		new THREE.Vector3(correctedUp.x, correctedUp.y, correctedUp.z),
		new THREE.Vector3(backward.x, backward.y, backward.z),
	);
	return new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
}

function pointFromVector(vector) {
	return {
		x: vector.x,
		y: vector.y,
		z: vector.z,
	};
}

function quaternionObject(quaternion) {
	return {
		x: quaternion.x,
		y: quaternion.y,
		z: quaternion.z,
		w: quaternion.w,
	};
}

function frameFromQuaternion(quaternion) {
	const forward = CAMERA_FORWARD.clone().applyQuaternion(quaternion).normalize();
	const up = CAMERA_UP.clone().applyQuaternion(quaternion).normalize();
	return {
		forward: pointFromVector(forward),
		up: pointFromVector(up),
	};
}

function createCameraLookTrack(waypoints, options = {}) {
	return {
		waypoints: [...waypoints],
		useLinearInterpolation: options.useLinearInterpolation === true,
	};
}

function findBracketingWaypoints(waypoints, timeSecs) {
	if (waypoints.length === 0) {
		return null;
	}
	if (waypoints.length === 1 || timeSecs <= waypoints[0].timeSecs) {
		return { left: waypoints[0], right: waypoints[0], t: 0 };
	}
	for (let index = 0; index < waypoints.length - 1; index += 1) {
		const left = waypoints[index];
		const right = waypoints[index + 1];
		if (timeSecs >= left.timeSecs && timeSecs <= right.timeSecs) {
			const durationSecs = right.timeSecs - left.timeSecs;
			return {
				left,
				right,
				t: durationSecs > EPSILON ? clamp01((timeSecs - left.timeSecs) / durationSecs) : 0,
			};
		}
	}
	const last = waypoints[waypoints.length - 1];
	return { left: last, right: last, t: 0 };
}

function smoothstep01(value) {
	const t = clamp01(value);
	return t * t * (3 - 2 * t);
}

function quaternionFromLookWaypoint(waypoint, observerPc) {
	if (waypoint.kind === 'target') {
		const forward = normalizeJourneyVector(subtractPoint(waypoint.targetPc, observerPc), DEFAULT_FORWARD);
		return quaternionFromForwardUp(forward, waypoint.up);
	}
	return quaternionFromForwardUp(waypoint.forward, waypoint.up);
}

function evaluateCamera(track, timeSecs, observerPc) {
	const bracket = findBracketingWaypoints(track.waypoints, timeSecs);
	if (!bracket) {
		const quaternion = quaternionFromForwardUp(DEFAULT_FORWARD, DEFAULT_UP);
		const frame = frameFromQuaternion(quaternion);
		return {
			cameraQuaternion: quaternionObject(quaternion),
			cameraForwardPc: frame.forward,
			cameraUpPc: frame.up,
		};
	}
	const leftQuaternion = quaternionFromLookWaypoint(bracket.left, observerPc);
	const rightQuaternion = quaternionFromLookWaypoint(bracket.right, observerPc);
	const t = track.useLinearInterpolation ? bracket.t : smoothstep01(bracket.t);
	const quaternion = leftQuaternion.clone().slerp(rightQuaternion, t).normalize();
	const frame = frameFromQuaternion(quaternion);
	return {
		cameraQuaternion: quaternionObject(quaternion),
		cameraForwardPc: frame.forward,
		cameraUpPc: frame.up,
	};
}

export function createJourneyEvaluator(journeyInput, options = {}) {
	const source = journeyInput && typeof journeyInput === 'object' ? journeyInput : {};
	const usesLegacyCameraTrack = !(Array.isArray(source.cameraLookWaypoints) && source.cameraLookWaypoints.length > 0)
		&& Array.isArray(source.cameraWaypoints)
		&& source.cameraWaypoints.length > 0;
	const journey = normalizeJourney(journeyInput);
	const locationTrack = createLocationTrack(journey.locationWaypoints, {
		samplesPerSegment: options.samplesPerSegment,
	});
	const cameraTrack = createCameraLookTrack(journey.cameraLookWaypoints, {
		useLinearInterpolation: usesLegacyCameraTrack,
	});
	const targetDistancePc = Math.max(EPSILON, finiteNumber(options.targetDistancePc ?? journey.targetDistancePc, DEFAULT_TARGET_DISTANCE_PC));

	function evaluate(sceneTimeSecs) {
		const timeSecs = Math.min(journey.durationSecs, Math.max(0, finiteNumber(sceneTimeSecs)));
		const location = evaluateLocation(locationTrack, timeSecs);
		const camera = evaluateCamera(cameraTrack, timeSecs, location.observerPc);
		const targetPc = addPoint(location.observerPc, scalePoint(camera.cameraForwardPc, targetDistancePc));
		return {
			sceneTimeSecs: timeSecs,
			observerPc: location.observerPc,
			targetPc,
			cameraQuaternion: camera.cameraQuaternion,
			cameraForwardPc: camera.cameraForwardPc,
			cameraUpPc: camera.cameraUpPc,
			velocityUnitVectorPc: location.velocityUnitVectorPc,
			speedPcPerSec: location.speedPcPerSec,
		};
	}

	function sample(options = {}) {
		const stepSecs = Math.max(EPSILON, finiteNumber(options.stepSecs, 1));
		const samples = [];
		let frameIndex = 0;
		for (let timeSecs = 0; timeSecs <= journey.durationSecs + stepSecs * 0.5; timeSecs += stepSecs) {
			const evaluated = evaluate(Math.min(timeSecs, journey.durationSecs));
			samples.push({
				frameIndex,
				...evaluated,
			});
			frameIndex += 1;
			if (evaluated.sceneTimeSecs >= journey.durationSecs) {
				break;
			}
		}
		return samples;
	}

	return {
		journey,
		durationSecs: journey.durationSecs,
		evaluate,
		sample,
	};
}

export function evaluateJourneyAtTime(journey, sceneTimeSecs, options = {}) {
	return createJourneyEvaluator(journey, options).evaluate(sceneTimeSecs);
}
