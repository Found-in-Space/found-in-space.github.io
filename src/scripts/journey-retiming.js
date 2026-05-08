import {
	getLocationWaypointArcSegments,
	sampleLocationWaypointArcPoint,
} from './journey-evaluator.js';

const EPSILON = 1e-6;
const DEFAULT_TIME_STEP_SECS = 0.05;
const DEFAULT_EASE_SECS = 3;
const DEFAULT_RAMP_SAMPLE_SECS = 0.5;

function finiteNumber(value, fallback = 0) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function clonePoint(point) {
	return {
		x: finiteNumber(point?.x),
		y: finiteNumber(point?.y),
		z: finiteNumber(point?.z),
	};
}

function cloneMotionGroup(motionGroup) {
	if (!motionGroup || typeof motionGroup !== 'object' || motionGroup.id == null) return null;
	return {
		id: String(motionGroup.id),
		kind: motionGroup.kind === 'ease' ? 'ease' : String(motionGroup.kind ?? 'ease'),
		role: ['anchor', 'real', 'helper'].includes(motionGroup.role) ? motionGroup.role : 'real',
		...(motionGroup.phase === 'start' || motionGroup.phase === 'end' ? { phase: motionGroup.phase } : {}),
		easeSecs: Math.max(0, finiteNumber(motionGroup.easeSecs, DEFAULT_EASE_SECS)),
		rampSampleSecs: Math.max(0, finiteNumber(motionGroup.rampSampleSecs, DEFAULT_RAMP_SAMPLE_SECS)),
	};
}

function withMotionGroup(waypoint, motionGroup) {
	const next = { ...waypoint };
	if (motionGroup) {
		next.motionGroup = cloneMotionGroup(motionGroup);
	} else {
		delete next.motionGroup;
	}
	return next;
}

function sortLocationWaypoints(waypoints) {
	return [...waypoints].sort((left, right) => {
		const timeDiff = finiteNumber(left.timeSecs) - finiteNumber(right.timeSecs);
		return timeDiff || String(left.id ?? '').localeCompare(String(right.id ?? ''));
	});
}

function locationRange(sortedWaypoints, anchorId, focusId) {
	const anchorIndex = sortedWaypoints.findIndex((entry) => entry.id === anchorId);
	const focusIndex = sortedWaypoints.findIndex((entry) => entry.id === focusId);
	if (anchorIndex < 0 || focusIndex < 0) {
		return null;
	}
	const startIndex = Math.min(anchorIndex, focusIndex);
	const endIndex = Math.max(anchorIndex, focusIndex);
	if (endIndex <= startIndex) {
		return null;
	}
	return {
		startIndex,
		endIndex,
		waypoints: sortedWaypoints.slice(startIndex, endIndex + 1),
	};
}

function movementSegments(segments) {
	return segments.filter((segment) => !segment.held && segment.lengthPc > EPSILON && segment.durationSecs > EPSILON);
}

function speedStats(segments) {
	const moving = movementSegments(segments);
	const totalLengthPc = segments.reduce((sum, segment) => sum + Math.max(0, segment.lengthPc), 0);
	const movingDurationSecs = moving.reduce((sum, segment) => sum + Math.max(0, segment.durationSecs), 0);
	const speeds = moving.map((segment) => segment.speedPcPerSec).filter((speed) => Number.isFinite(speed));
	return {
		totalLengthPc,
		averageSpeedPcPerSec: movingDurationSecs > EPSILON ? totalLengthPc / movingDurationSecs : 0,
		minSpeedPcPerSec: speeds.length > 0 ? Math.min(...speeds) : 0,
		maxSpeedPcPerSec: speeds.length > 0 ? Math.max(...speeds) : 0,
		movingSegmentCount: moving.length,
		holdSegmentCount: segments.length - moving.length,
	};
}

function snapTime(value, stepSecs) {
	const step = Math.max(EPSILON, finiteNumber(stepSecs, DEFAULT_TIME_STEP_SECS));
	return Math.round(finiteNumber(value) / step) * step;
}

function timeKey(value) {
	return Number(value).toFixed(6);
}

function clampInteriorTimes(times, startIndex, endIndex, stepSecs) {
	const startTime = times[startIndex];
	const endTime = times[endIndex];
	const segmentCount = endIndex - startIndex;
	const minimumDuration = segmentCount * stepSecs;
	if (endTime - startTime + EPSILON < minimumDuration) {
		for (let index = startIndex + 1; index < endIndex; index += 1) {
			times[index] = Math.min(endTime, Math.max(startTime, times[index]));
		}
		return;
	}
	for (let index = startIndex + 1; index < endIndex; index += 1) {
		times[index] = Math.max(times[index], times[index - 1] + stepSecs);
	}
	for (let index = endIndex - 1; index > startIndex; index -= 1) {
		times[index] = Math.min(times[index], times[index + 1] - stepSecs);
	}
}

function rangeContext(locationWaypoints, anchorId, focusId, options = {}) {
	const sortedWaypoints = sortLocationWaypoints(locationWaypoints).map((waypoint) => ({
		...waypoint,
		positionPc: clonePoint(waypoint.positionPc),
		motionGroup: cloneMotionGroup(waypoint.motionGroup),
	}));
	const range = locationRange(sortedWaypoints, anchorId, focusId);
	if (!range) return null;
	const allSegments = getLocationWaypointArcSegments(sortedWaypoints, options);
	const rangeSegments = allSegments.filter((segment) => segment.index >= range.startIndex && segment.index < range.endIndex);
	const movement = rangeSegments.filter((segment) => !segment.held && segment.lengthPc > EPSILON);
	const startTime = sortedWaypoints[range.startIndex].timeSecs;
	const endTime = sortedWaypoints[range.endIndex].timeSecs;
	const rangeDuration = endTime - startTime;
	const holdDurationSecs = rangeSegments
		.filter((segment) => segment.held || segment.lengthPc <= EPSILON)
		.reduce((sum, segment) => sum + Math.max(0, segment.durationSecs), 0);
	const movementDurationSecs = Math.max(0, rangeDuration - holdDurationSecs);
	const movementLengthPc = movement.reduce((sum, segment) => sum + segment.lengthPc, 0);
	return {
		anchorId,
		focusId,
		options,
		sortedWaypoints,
		range,
		rangeSegments,
		startTime,
		endTime,
		rangeDuration,
		holdDurationSecs,
		movementDurationSecs,
		movementLengthPc,
		before: getLocationRangeSpeedStats(sortedWaypoints, anchorId, focusId, options),
	};
}

function nextEaseGroupIds(locationWaypoints, count = 1) {
	let maxIndex = 0;
	for (const waypoint of locationWaypoints) {
		const match = /^ease-(\d+)$/.exec(String(waypoint.motionGroup?.id ?? ''));
		if (match) {
			maxIndex = Math.max(maxIndex, Number(match[1]));
		}
	}
	return Array.from({ length: Math.max(1, count) }, (_, index) => `ease-${maxIndex + index + 1}`);
}

function groupMetadata(groupId, role, profile, options = {}, phase = null) {
	return {
		id: groupId,
		kind: 'ease',
		role,
		...(phase === 'start' || phase === 'end' ? { phase } : {}),
		easeSecs: profile.effectiveEaseSecs,
		rampSampleSecs: Math.max(EPSILON, finiteNumber(options.rampSampleSecs, DEFAULT_RAMP_SAMPLE_SECS)),
	};
}

function noChangeResult(locationWaypoints, before, extra = {}) {
	return {
		locationWaypoints,
		before,
		after: before,
		changedIds: [],
		insertedIds: [],
		insertedCount: 0,
		...extra,
	};
}

function retimeExistingWaypoints(context, profile, timeStepSecs) {
	const nextTimes = context.sortedWaypoints.map((waypoint) => waypoint.timeSecs);
	let holdCursor = 0;
	let traversedLengthPc = 0;
	for (const segment of context.rangeSegments) {
		if (segment.held || segment.lengthPc <= EPSILON) {
			holdCursor += Math.max(0, segment.durationSecs);
		} else {
			traversedLengthPc += segment.lengthPc;
		}
		if (segment.index + 1 < context.range.endIndex) {
			const movementTimeSecs = profile.timeAtDistance(traversedLengthPc);
			nextTimes[segment.index + 1] = snapTime(context.startTime + holdCursor + movementTimeSecs, timeStepSecs);
		}
	}
	nextTimes[context.range.startIndex] = context.startTime;
	nextTimes[context.range.endIndex] = context.endTime;
	clampInteriorTimes(nextTimes, context.range.startIndex, context.range.endIndex, timeStepSecs);
	return nextTimes;
}

function applyTimes(context, nextTimes) {
	const changedIds = [];
	for (let index = context.range.startIndex + 1; index < context.range.endIndex; index += 1) {
		const waypoint = context.sortedWaypoints[index];
		const nextTime = Number(nextTimes[index].toFixed(6));
		if (Math.abs(waypoint.timeSecs - nextTime) > EPSILON) {
			changedIds.push(waypoint.id);
		}
		waypoint.timeSecs = nextTime;
	}
	return changedIds;
}

function rebuildLocationWaypoints(originalWaypoints, sortedWaypoints, insertedWaypoints = []) {
	const byId = new Map(sortedWaypoints.map((waypoint) => [waypoint.id, waypoint]));
	const updatedOriginals = originalWaypoints.map((waypoint) => {
		const updated = byId.get(waypoint.id);
		if (!updated) return waypoint;
		return withMotionGroup({ ...waypoint, timeSecs: updated.timeSecs }, updated.motionGroup);
	});
	return sortLocationWaypoints([...updatedOriginals, ...insertedWaypoints]);
}

function linearProfile(movementLengthPc, movementDurationSecs) {
	return {
		effectiveEaseSecs: 0,
		distanceAtTime(timeSecs) {
			if (movementDurationSecs <= EPSILON) return 0;
			return movementLengthPc * Math.min(1, Math.max(0, timeSecs / movementDurationSecs));
		},
		timeAtDistance(distancePc) {
			if (movementLengthPc <= EPSILON) return 0;
			return movementDurationSecs * Math.min(1, Math.max(0, distancePc / movementLengthPc));
		},
	};
}

function cosineRampProfile(movementLengthPc, movementDurationSecs, easeSecs) {
	const effectiveEaseSecs = Math.min(
		Math.max(0, finiteNumber(easeSecs, DEFAULT_EASE_SECS)),
		Math.max(0, movementDurationSecs / 2),
	);
	if (effectiveEaseSecs <= EPSILON || movementDurationSecs <= EPSILON || movementLengthPc <= EPSILON) {
		return linearProfile(movementLengthPc, movementDurationSecs);
	}
	const cruiseSpeedPcPerSec = movementLengthPc / Math.max(EPSILON, movementDurationSecs - effectiveEaseSecs);

	function rampDistance(timeSecs) {
		const t = Math.min(effectiveEaseSecs, Math.max(0, timeSecs));
		return cruiseSpeedPcPerSec * (0.5 * t - (effectiveEaseSecs / (2 * Math.PI)) * Math.sin(Math.PI * t / effectiveEaseSecs));
	}

	function distanceAtTime(timeSecs) {
		const t = Math.min(movementDurationSecs, Math.max(0, timeSecs));
		if (t < effectiveEaseSecs) {
			return rampDistance(t);
		}
		if (t <= movementDurationSecs - effectiveEaseSecs) {
			return rampDistance(effectiveEaseSecs) + cruiseSpeedPcPerSec * (t - effectiveEaseSecs);
		}
		return movementLengthPc - rampDistance(movementDurationSecs - t);
	}

	function timeAtDistance(distancePc) {
		const target = Math.min(movementLengthPc, Math.max(0, distancePc));
		let low = 0;
		let high = movementDurationSecs;
		for (let index = 0; index < 32; index += 1) {
			const middle = (low + high) / 2;
			if (distanceAtTime(middle) < target) low = middle;
			else high = middle;
		}
		return (low + high) / 2;
	}

	return {
		effectiveEaseSecs,
		distanceAtTime,
		timeAtDistance,
	};
}

function holdDurationBeforeMovementDistance(context, movementDistancePc) {
	let holdDurationSecs = 0;
	let traversedLengthPc = 0;
	for (const segment of context.rangeSegments) {
		if (segment.held || segment.lengthPc <= EPSILON) {
			holdDurationSecs += Math.max(0, segment.durationSecs);
			continue;
		}
		if (movementDistancePc <= traversedLengthPc + segment.lengthPc + EPSILON) {
			return holdDurationSecs;
		}
		traversedLengthPc += segment.lengthPc;
	}
	return holdDurationSecs;
}

function pointAtMovementDistance(context, movementDistancePc) {
	let traversedLengthPc = 0;
	for (const segment of context.rangeSegments) {
		if (segment.held || segment.lengthPc <= EPSILON) continue;
		const nextLengthPc = traversedLengthPc + segment.lengthPc;
		if (movementDistancePc <= nextLengthPc + EPSILON) {
			return sampleLocationWaypointArcPoint(
				context.sortedWaypoints,
				segment.index,
				Math.max(0, movementDistancePc - traversedLengthPc),
				context.options,
			);
		}
		traversedLengthPc = nextLengthPc;
	}
	return clonePoint(context.sortedWaypoints[context.range.endIndex]?.positionPc);
}

function generatedRampTimes(profile, movementDurationSecs, rampSampleSecs) {
	const entries = [];
	const sampleStepSecs = Math.max(EPSILON, finiteNumber(rampSampleSecs, DEFAULT_RAMP_SAMPLE_SECS));
	const easeSecs = profile.effectiveEaseSecs;
	if (easeSecs <= EPSILON) return entries;
	function add(timeSecs, phase) {
		if (timeSecs <= EPSILON || timeSecs >= movementDurationSecs - EPSILON) return;
		if (!entries.some((entry) => Math.abs(entry.timeSecs - timeSecs) <= EPSILON)) {
			entries.push({ timeSecs, phase });
		}
	}
	for (let timeSecs = sampleStepSecs; timeSecs <= easeSecs + EPSILON; timeSecs += sampleStepSecs) {
		add(Math.min(timeSecs, easeSecs), 'start');
	}
	for (let timeSecs = movementDurationSecs - easeSecs; timeSecs < movementDurationSecs - EPSILON; timeSecs += sampleStepSecs) {
		add(timeSecs, 'end');
	}
	return entries.sort((left, right) => left.timeSecs - right.timeSecs);
}

function easePhaseForMovementTime(profile, movementDurationSecs, movementTimeSecs) {
	if (profile.effectiveEaseSecs <= EPSILON) return null;
	if (movementTimeSecs <= profile.effectiveEaseSecs + EPSILON) return 'start';
	if (movementTimeSecs >= movementDurationSecs - profile.effectiveEaseSecs - EPSILON) return 'end';
	return null;
}

function tagEaseSourceWaypoints(context, profile, groupIds, options = {}) {
	let traversedLengthPc = 0;
	context.sortedWaypoints[context.range.startIndex].motionGroup = groupMetadata(groupIds.start, 'anchor', profile, options, 'start');
	context.sortedWaypoints[context.range.endIndex].motionGroup = groupMetadata(groupIds.end, 'anchor', profile, options, 'end');
	for (let index = context.range.startIndex + 1; index < context.range.endIndex; index += 1) {
		context.sortedWaypoints[index].motionGroup = null;
	}
	for (let index = context.range.startIndex; index <= context.range.endIndex; index += 1) {
		if (index < context.range.startIndex || index >= context.range.endIndex) continue;
		const segment = context.rangeSegments.find((entry) => entry.index === index);
		if (!segment) continue;
		if (!segment.held && segment.lengthPc > EPSILON) {
			traversedLengthPc += segment.lengthPc;
		}
		const waypointIndex = index + 1;
		if (waypointIndex >= context.range.endIndex) continue;
		const movementTimeSecs = profile.timeAtDistance(traversedLengthPc);
		const phase = easePhaseForMovementTime(profile, context.movementDurationSecs, movementTimeSecs);
		if (phase) {
			context.sortedWaypoints[waypointIndex].motionGroup = groupMetadata(groupIds[phase], 'real', profile, options, phase);
		}
	}
}

function generateEaseWaypoints(context, profile, nextTimes, groupIds, options = {}) {
	const timeStepSecs = Math.max(EPSILON, finiteNumber(options.timeStepSecs, DEFAULT_TIME_STEP_SECS));
	const usedTimes = new Set(nextTimes.map(timeKey));
	const insertedWaypoints = [];
	const phaseCounts = { start: 0, end: 0 };
	for (const { timeSecs: movementTimeSecs, phase } of generatedRampTimes(profile, context.movementDurationSecs, options.rampSampleSecs)) {
		const movementDistancePc = profile.distanceAtTime(movementTimeSecs);
		const actualTimeSecs = snapTime(
			context.startTime + holdDurationBeforeMovementDistance(context, movementDistancePc) + movementTimeSecs,
			timeStepSecs,
		);
		if (actualTimeSecs <= context.startTime + EPSILON || actualTimeSecs >= context.endTime - EPSILON) continue;
		const key = timeKey(actualTimeSecs);
		if (usedTimes.has(key)) continue;
		usedTimes.add(key);
		phaseCounts[phase] += 1;
		const groupId = groupIds[phase];
		insertedWaypoints.push({
			id: `loc-${groupId}-${String(phaseCounts[phase]).padStart(3, '0')}`,
			timeSecs: Number(actualTimeSecs.toFixed(6)),
			positionPc: pointAtMovementDistance(context, movementDistancePc),
			motionGroup: groupMetadata(groupId, 'helper', profile, options, phase),
		});
	}
	return insertedWaypoints;
}

export function getLocationRangeSpeedStats(locationWaypoints, anchorId, focusId, options = {}) {
	const sortedWaypoints = sortLocationWaypoints(locationWaypoints);
	const range = locationRange(sortedWaypoints, anchorId, focusId);
	if (!range) {
		return null;
	}
	const segments = getLocationWaypointArcSegments(sortedWaypoints, options)
		.filter((segment) => segment.index >= range.startIndex && segment.index < range.endIndex);
	const start = sortedWaypoints[range.startIndex];
	const end = sortedWaypoints[range.endIndex];
	return {
		startId: start.id,
		endId: end.id,
		startTimeSecs: start.timeSecs,
		endTimeSecs: end.timeSecs,
		durationSecs: Math.max(0, end.timeSecs - start.timeSecs),
		waypointCount: range.waypoints.length,
		segmentCount: segments.length,
		segments,
		...speedStats(segments),
	};
}

export function equalizeLocationRangeSpeeds(locationWaypoints, anchorId, focusId, options = {}) {
	const timeStepSecs = Math.max(EPSILON, finiteNumber(options.timeStepSecs, DEFAULT_TIME_STEP_SECS));
	const context = rangeContext(locationWaypoints, anchorId, focusId, options);
	if (!context) return noChangeResult(locationWaypoints, null);
	if (context.movementLengthPc <= EPSILON || context.movementDurationSecs <= EPSILON) {
		return noChangeResult(locationWaypoints, context.before);
	}
	const profile = linearProfile(context.movementLengthPc, context.movementDurationSecs);
	const nextTimes = retimeExistingWaypoints(context, profile, timeStepSecs);
	const changedIds = applyTimes(context, nextTimes);
	const locationWaypointsNext = rebuildLocationWaypoints(locationWaypoints, context.sortedWaypoints);
	const after = getLocationRangeSpeedStats(locationWaypointsNext, anchorId, focusId, options);
	return {
		locationWaypoints: locationWaypointsNext,
		before: context.before,
		after,
		changedIds,
		insertedIds: [],
		insertedCount: 0,
		effectiveEaseSecs: 0,
	};
}

export function easeLocationRangeStartEnd(locationWaypoints, anchorId, focusId, options = {}) {
	const timeStepSecs = Math.max(EPSILON, finiteNumber(options.timeStepSecs, DEFAULT_TIME_STEP_SECS));
	const context = rangeContext(locationWaypoints, anchorId, focusId, options);
	if (!context) return noChangeResult(locationWaypoints, null, { effectiveEaseSecs: 0 });
	if (context.movementLengthPc <= EPSILON || context.movementDurationSecs <= EPSILON) {
		return noChangeResult(locationWaypoints, context.before, { effectiveEaseSecs: 0 });
	}
	const fallbackIds = nextEaseGroupIds(locationWaypoints, 2);
	const startGroupId = String(options.startGroupId ?? options.groupId ?? fallbackIds[0]);
	const endGroupId = String(options.endGroupId ?? fallbackIds[startGroupId === fallbackIds[0] ? 1 : 0]);
	const groupIds = { start: startGroupId, end: endGroupId };
	const profile = cosineRampProfile(context.movementLengthPc, context.movementDurationSecs, options.easeSecs);
	const nextTimes = retimeExistingWaypoints(context, profile, timeStepSecs);
	tagEaseSourceWaypoints(context, profile, groupIds, options);
	const insertedWaypoints = generateEaseWaypoints(context, profile, nextTimes, groupIds, options);
	const changedIds = applyTimes(context, nextTimes);
	const locationWaypointsNext = rebuildLocationWaypoints(locationWaypoints, context.sortedWaypoints, insertedWaypoints);
	const after = getLocationRangeSpeedStats(locationWaypointsNext, anchorId, focusId, options);
	return {
		locationWaypoints: locationWaypointsNext,
		before: context.before,
		after,
		changedIds,
		insertedIds: insertedWaypoints.map((waypoint) => waypoint.id),
		insertedCount: insertedWaypoints.length,
		effectiveEaseSecs: profile.effectiveEaseSecs,
		groupId: startGroupId,
		startGroupId,
		endGroupId,
		groupIds: [startGroupId, endGroupId],
		anchorId,
		focusId,
	};
}

export function deleteEaseLocationGroupHelpers(locationWaypoints, groupId, options = {}) {
	const phase = options.phase === 'start' || options.phase === 'end' ? options.phase : null;
	const deletedIds = [];
	const clearedIds = [];
	const locationWaypointsNext = [];
	for (const waypoint of locationWaypoints) {
		const motionGroup = cloneMotionGroup(waypoint.motionGroup);
		if (
			motionGroup?.id !== groupId
			|| motionGroup.kind !== 'ease'
			|| (phase && motionGroup.phase !== phase)
		) {
			locationWaypointsNext.push(waypoint);
			continue;
		}
		if (motionGroup.role === 'helper') {
			deletedIds.push(waypoint.id);
		} else {
			clearedIds.push(waypoint.id);
			locationWaypointsNext.push(withMotionGroup(waypoint, null));
		}
	}
	return {
		locationWaypoints: sortLocationWaypoints(locationWaypointsNext),
		deletedIds,
		clearedIds,
	};
}

export function rebuildEaseLocationGroup(locationWaypoints, groupId, options = {}) {
	const groupWaypoints = sortLocationWaypoints(locationWaypoints)
		.filter((waypoint) => waypoint.motionGroup?.id === groupId && waypoint.motionGroup?.kind === 'ease');
	const anchors = groupWaypoints.filter((waypoint) => waypoint.motionGroup?.role === 'anchor');
	if (anchors.length < 2) {
		return noChangeResult(locationWaypoints, null, { groupId, effectiveEaseSecs: 0 });
	}
	const locationWaypointsWithoutHelpers = locationWaypoints
		.filter((waypoint) => !(waypoint.motionGroup?.id === groupId && waypoint.motionGroup?.role === 'helper'));
	const start = anchors[0];
	const end = anchors[anchors.length - 1];
	return easeLocationRangeStartEnd(locationWaypointsWithoutHelpers, start.id, end.id, {
		...options,
		groupId,
	});
}
