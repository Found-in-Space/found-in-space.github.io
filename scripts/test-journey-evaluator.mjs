#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
	createJourneyEvaluator,
	normalizeJourney,
} from '../src/scripts/journey-evaluator.js';
import {
	deleteEaseLocationGroupHelpers,
	easeLocationRangeStartEnd,
	equalizeLocationRangeSpeeds,
	getLocationRangeSpeedStats,
	rebuildEaseLocationGroup,
} from '../src/scripts/journey-retiming.js';

function closeTo(actual, expected, tolerance = 1e-6) {
	assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

function length(point) {
	return Math.hypot(point.x, point.y, point.z);
}

function quaternionLength(quaternion) {
	return Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
}

function dot(left, right) {
	return left.x * right.x + left.y * right.y + left.z * right.z;
}

function normalize(point) {
	const pointLength = length(point);
	return {
		x: point.x / pointLength,
		y: point.y / pointLength,
		z: point.z / pointLength,
	};
}

function subtract(left, right) {
	return {
		x: left.x - right.x,
		y: left.y - right.y,
		z: left.z - right.z,
	};
}

function legacyJourney(overrides = {}) {
	return {
		format: 'fis-journey-v1',
		durationSecs: 30,
		locationWaypoints: [
			{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
			{ id: 'b', timeSecs: 10, positionPc: { x: 10, y: 0, z: 0 } },
			{ id: 'c', timeSecs: 20, positionPc: { x: 20, y: 0, z: 0 } },
		],
		cameraWaypoints: [
			{ id: 'cam-a', timeSecs: 0, forward: { x: 0, y: 0, z: -2 }, up: { x: 0, y: 3, z: 0 } },
			{ id: 'cam-b', timeSecs: 20, forward: { x: 2, y: 0, z: 0 }, up: { x: 0, y: 2, z: 0 } },
		],
		guides: [],
		...overrides,
	};
}

function lookJourney(overrides = {}) {
	const legacy = legacyJourney(overrides);
	const cameraLookWaypoints = Array.isArray(overrides.cameraLookWaypoints)
		? overrides.cameraLookWaypoints
		: (legacy.cameraWaypoints ?? []).map((entry) => ({
				id: entry.id,
				timeSecs: entry.timeSecs,
				kind: 'direction',
				forward: entry.forward,
				up: entry.up,
			}));
	delete legacy.cameraWaypoints;
	return {
		...legacy,
		cameraLookWaypoints,
	};
}

{
	const journey = legacyJourney({
		locationWaypoints: [
			{ id: 'c', timeSecs: 20, positionPc: { x: 20, y: 0, z: 0 } },
			{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
			{ id: 'b', timeSecs: 10, positionPc: { x: 10, y: 0, z: 0 } },
		],
	});
	const normalized = normalizeJourney(journey);
	assert.deepEqual(normalized.locationWaypoints.map((entry) => entry.id), ['a', 'b', 'c']);
	assert.deepEqual(normalized.cameraLookWaypoints.map((entry) => entry.kind), ['direction', 'direction']);
	const evaluated = createJourneyEvaluator(journey).evaluate(5);
	closeTo(evaluated.observerPc.x, 5, 0.05);
}

{
	const normalized = normalizeJourney(lookJourney({
		locationWaypoints: [
			{
				id: 'tagged-location',
				timeSecs: 0,
				positionPc: { x: 0, y: 0, z: 0 },
				motionGroup: { id: 'ease-7', kind: 'ease', role: 'helper', easeSecs: 2, rampSampleSecs: 0.5 },
			},
		],
		cameraLookWaypoints: [
			{
				id: 'tagged-camera',
				timeSecs: 0,
				kind: 'target',
				targetPc: { x: 1, y: 2, z: 3 },
				up: { x: 0, y: 1, z: 0 },
				targetGuide: { id: 'hyades', label: 'Hyades center' },
			},
		],
	}));
	assert.deepEqual(normalized.locationWaypoints[0].motionGroup, {
		id: 'ease-7',
		kind: 'ease',
		role: 'helper',
		easeSecs: 2,
		rampSampleSecs: 0.5,
	});
	assert.deepEqual(normalized.cameraLookWaypoints[0].targetGuide, { id: 'hyades', label: 'Hyades center' });
}

{
	const journey = legacyJourney({
		locationWaypoints: [
			{ id: 'a', timeSecs: 0, positionPc: { x: 5, y: 1, z: -2 } },
			{ id: 'b', timeSecs: 10, positionPc: { x: 5, y: 1, z: -2 } },
		],
	});
	const evaluated = createJourneyEvaluator(journey).evaluate(5);
	closeTo(evaluated.speedPcPerSec, 0);
	closeTo(length(evaluated.velocityUnitVectorPc), 0);
	assert.deepEqual(evaluated.observerPc, { x: 5, y: 1, z: -2 });
}

{
	const journey = legacyJourney({
		locationWaypoints: [
			{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
			{ id: 'b', timeSecs: 10, positionPc: { x: 10, y: 12, z: 0 } },
			{ id: 'c', timeSecs: 20, positionPc: { x: 20, y: 0, z: 0 } },
			{ id: 'd', timeSecs: 30, positionPc: { x: 30, y: 8, z: 0 } },
		],
	});
	const evaluator = createJourneyEvaluator(journey);
	const left = evaluator.evaluate(11);
	const right = evaluator.evaluate(19);
	closeTo(left.speedPcPerSec, right.speedPcPerSec, 1e-9);
	closeTo(length(left.velocityUnitVectorPc), 1, 1e-6);
}

{
	const evaluated = createJourneyEvaluator(lookJourney()).evaluate(10);
	closeTo(length(evaluated.cameraForwardPc), 1, 1e-6);
	closeTo(length(evaluated.cameraUpPc), 1, 1e-6);
	closeTo(quaternionLength(evaluated.cameraQuaternion), 1, 1e-6);
}

{
	const evaluator = createJourneyEvaluator(lookJourney());
	assert.deepEqual(evaluator.evaluate(12), evaluator.evaluate(12));
}

{
	const legacy = createJourneyEvaluator(legacyJourney()).evaluate(10);
	const look = createJourneyEvaluator(lookJourney()).evaluate(10);
	assert.deepEqual(legacy, look);
}

{
	const plain = lookJourney({
		cameraLookWaypoints: [
			{ id: 'target', timeSecs: 0, kind: 'target', targetPc: { x: 10, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
		],
	});
	const tagged = lookJourney({
		locationWaypoints: plain.locationWaypoints.map((entry) => ({
			...entry,
			motionGroup: { id: 'ease-1', kind: 'ease', role: 'real', easeSecs: 3, rampSampleSecs: 0.5 },
		})),
		cameraLookWaypoints: [
			{
				id: 'target',
				timeSecs: 0,
				kind: 'target',
				targetPc: { x: 10, y: 0, z: 0 },
				up: { x: 0, y: 1, z: 0 },
				targetGuide: { id: 'guide-a', label: 'Guide A' },
			},
		],
	});
	assert.deepEqual(createJourneyEvaluator(tagged).evaluate(5), createJourneyEvaluator(plain).evaluate(5));
}

{
	const targetPc = { x: 10, y: 10, z: 0 };
	const evaluator = createJourneyEvaluator(lookJourney({
		locationWaypoints: [
			{ id: 'hold-a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
			{ id: 'hold-b', timeSecs: 10, positionPc: { x: 6, y: 0, z: 0 } },
		],
		cameraLookWaypoints: [
			{ id: 'target-a', timeSecs: 0, kind: 'target', targetPc, up: { x: 0, y: 1, z: 0 } },
			{ id: 'target-b', timeSecs: 10, kind: 'target', targetPc, up: { x: 0, y: 1, z: 0 } },
		],
	}));
	for (const timeSecs of [2, 5, 8]) {
		const evaluated = evaluator.evaluate(timeSecs);
		const expectedForward = normalize(subtract(targetPc, evaluated.observerPc));
		closeTo(dot(evaluated.cameraForwardPc, expectedForward), 1, 1e-6);
	}
}

{
	const evaluator = createJourneyEvaluator(lookJourney({
		locationWaypoints: [
			{ id: 'hold-a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
			{ id: 'hold-b', timeSecs: 10, positionPc: { x: 0, y: 0, z: 0 } },
		],
		cameraLookWaypoints: [
			{ id: 'direction', timeSecs: 0, kind: 'direction', forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } },
			{ id: 'target', timeSecs: 10, kind: 'target', targetPc: { x: 10, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
		],
	}));
	const before = evaluator.evaluate(4.99);
	const after = evaluator.evaluate(5.01);
	assert.ok(dot(before.cameraForwardPc, after.cameraForwardPc) > 0.9999, 'direction-to-target transition should be continuous');
}

{
	const smooth = createJourneyEvaluator(lookJourney({
		locationWaypoints: [
			{ id: 'hold-a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
			{ id: 'hold-b', timeSecs: 10, positionPc: { x: 0, y: 0, z: 0 } },
		],
		cameraLookWaypoints: [
			{ id: 'start', timeSecs: 0, kind: 'direction', forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } },
			{ id: 'end', timeSecs: 10, kind: 'direction', forward: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
		],
	}));
	const linear = createJourneyEvaluator(legacyJourney({
		locationWaypoints: [
			{ id: 'hold-a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
			{ id: 'hold-b', timeSecs: 10, positionPc: { x: 0, y: 0, z: 0 } },
		],
		cameraWaypoints: [
			{ id: 'start', timeSecs: 0, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } },
			{ id: 'end', timeSecs: 10, forward: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
		],
	}));
	const startForward = { x: 0, y: 0, z: -1 };
	assert.ok(
		dot(smooth.evaluate(2.5).cameraForwardPc, startForward) > dot(linear.evaluate(2.5).cameraForwardPc, startForward),
		'smoothstep should hold closer to the starting look key at quarter time',
	);
}

{
	const targetA = { x: 10, y: 0, z: 0 };
	const targetB = { x: 0, y: 10, z: 0 };
	const evaluator = createJourneyEvaluator(lookJourney({
		locationWaypoints: [
			{ id: 'hold-a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
			{ id: 'hold-b', timeSecs: 10, positionPc: { x: 0, y: 0, z: 0 } },
		],
		cameraLookWaypoints: [
			{ id: 'target-a', timeSecs: 0, kind: 'target', targetPc: targetA, up: { x: 0, y: 1, z: 0 } },
			{ id: 'target-b', timeSecs: 10, kind: 'target', targetPc: targetB, up: { x: 0, y: 0, z: 1 } },
		],
	}));
	const before = evaluator.evaluate(4.99);
	const after = evaluator.evaluate(5.01);
	assert.ok(dot(before.cameraForwardPc, after.cameraForwardPc) > 0.9999, 'target-to-target transition should be continuous');
}

{
	const locationWaypoints = [
		{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
		{ id: 'b', timeSecs: 10, positionPc: { x: 10, y: 0, z: 0 } },
		{ id: 'c', timeSecs: 20, positionPc: { x: 40, y: 0, z: 0 } },
	];
	const result = equalizeLocationRangeSpeeds(locationWaypoints, 'a', 'c');
	closeTo(result.locationWaypoints[1].timeSecs, 5, 1e-6);
	closeTo(result.locationWaypoints[0].timeSecs, 0, 1e-6);
	closeTo(result.locationWaypoints[2].timeSecs, 20, 1e-6);
	assert.deepEqual(result.locationWaypoints.map((entry) => entry.positionPc), locationWaypoints.map((entry) => entry.positionPc));
}

{
	const locationWaypoints = [
		{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
		{ id: 'b', timeSecs: 15, positionPc: { x: 5, y: 0, z: 0 } },
		{ id: 'c', timeSecs: 20, positionPc: { x: 30, y: 0, z: 0 } },
	];
	const before = getLocationRangeSpeedStats(locationWaypoints, 'a', 'c');
	const result = equalizeLocationRangeSpeeds(locationWaypoints, 'a', 'c');
	const after = result.after;
	assert.ok(before.maxSpeedPcPerSec - before.minSpeedPcPerSec > 4, 'fixture should begin with uneven speeds');
	assert.ok(after.maxSpeedPcPerSec - after.minSpeedPcPerSec < 0.02, 'equalised speeds should be close after snapping');
}

{
	const locationWaypoints = [
		{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
		{ id: 'b', timeSecs: 5, positionPc: { x: 0, y: 0, z: 0 } },
		{ id: 'c', timeSecs: 15, positionPc: { x: 20, y: 0, z: 0 } },
		{ id: 'd', timeSecs: 25, positionPc: { x: 60, y: 0, z: 0 } },
	];
	const result = equalizeLocationRangeSpeeds(locationWaypoints, 'a', 'd');
	closeTo(result.locationWaypoints[1].timeSecs - result.locationWaypoints[0].timeSecs, 5, 1e-6);
	assert.ok(result.locationWaypoints[2].timeSecs > result.locationWaypoints[1].timeSecs);
	assert.ok(result.locationWaypoints[2].timeSecs < result.locationWaypoints[3].timeSecs);
	assert.deepEqual(result.locationWaypoints.map((entry) => entry.positionPc), locationWaypoints.map((entry) => entry.positionPc));
}

{
	const locationWaypoints = [
		{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
		{ id: 'b', timeSecs: 5, positionPc: { x: 25, y: 0, z: 0 } },
		{ id: 'c', timeSecs: 10, positionPc: { x: 50, y: 0, z: 0 } },
		{ id: 'd', timeSecs: 15, positionPc: { x: 75, y: 0, z: 0 } },
		{ id: 'e', timeSecs: 20, positionPc: { x: 100, y: 0, z: 0 } },
	];
	const result = easeLocationRangeStartEnd(locationWaypoints, 'a', 'e', {
		easeSecs: 3,
		rampSampleSecs: 1,
		groupId: 'ease-2',
	});
	const byId = new Map(result.locationWaypoints.map((entry) => [entry.id, entry]));
	assert.equal(result.groupId, 'ease-2');
	closeTo(byId.get('a').timeSecs, 0, 1e-6);
	closeTo(byId.get('e').timeSecs, 20, 1e-6);
	assert.equal(byId.get('a').motionGroup.role, 'anchor');
	assert.equal(byId.get('c').motionGroup.role, 'real');
	assert.equal(byId.get('e').motionGroup.role, 'anchor');
	assert.ok(byId.get('b').timeSecs > 5, 'ease should spend more time near the start');
	closeTo(byId.get('c').timeSecs, 10, 0.05);
	assert.ok(byId.get('d').timeSecs < 15, 'ease should spend more time near the end');
	for (const waypoint of locationWaypoints) {
		assert.deepEqual(byId.get(waypoint.id).positionPc, waypoint.positionPc);
	}
	assert.ok(result.insertedIds.length > 0, 'ease should insert ramp helper waypoints');
	for (const id of result.insertedIds) {
		assert.ok(id.startsWith('loc-ease-2-'));
		const helper = byId.get(id);
		assert.equal(helper.motionGroup.id, 'ease-2');
		assert.equal(helper.motionGroup.role, 'helper');
		assert.ok(helper.timeSecs > 0 && helper.timeSecs < 20);
		closeTo(helper.positionPc.y, 0, 1e-6);
		closeTo(helper.positionPc.z, 0, 1e-6);
		assert.ok(helper.positionPc.x > 0 && helper.positionPc.x < 100);
	}
}

{
	const locationWaypoints = [
		{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
		{ id: 'b', timeSecs: 4, positionPc: { x: 0, y: 0, z: 0 } },
		{ id: 'c', timeSecs: 8, positionPc: { x: 50, y: 0, z: 0 } },
		{ id: 'd', timeSecs: 12, positionPc: { x: 100, y: 0, z: 0 } },
	];
	const result = easeLocationRangeStartEnd(locationWaypoints, 'a', 'd', {
		easeSecs: 3,
		rampSampleSecs: 1,
		groupId: 'ease-3',
	});
	const byId = new Map(result.locationWaypoints.map((entry) => [entry.id, entry]));
	closeTo(byId.get('b').timeSecs - byId.get('a').timeSecs, 4, 1e-6);
	assert.ok(byId.get('c').timeSecs > byId.get('b').timeSecs);
	assert.ok(byId.get('c').timeSecs < byId.get('d').timeSecs);
	assert.ok(result.insertedIds.length > 0, 'ease should insert helpers after the preserved hold');
	for (const id of result.insertedIds) {
		assert.ok(byId.get(id).timeSecs > byId.get('b').timeSecs);
	}
}

{
	const locationWaypoints = [
		{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
		{ id: 'b', timeSecs: 1, positionPc: { x: 10, y: 0, z: 0 } },
		{ id: 'c', timeSecs: 2, positionPc: { x: 20, y: 0, z: 0 } },
	];
	const result = easeLocationRangeStartEnd(locationWaypoints, 'a', 'c', {
		easeSecs: 10,
		rampSampleSecs: 0.5,
		groupId: 'ease-short',
	});
	assert.ok(result.effectiveEaseSecs <= 1, 'ease duration should clamp to half the moving range duration');
}

{
	const locationWaypoints = [
		{ id: 'a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
		{ id: 'b', timeSecs: 5, positionPc: { x: 25, y: 0, z: 0 } },
		{ id: 'c', timeSecs: 10, positionPc: { x: 50, y: 0, z: 0 } },
		{ id: 'd', timeSecs: 15, positionPc: { x: 75, y: 0, z: 0 } },
		{ id: 'e', timeSecs: 20, positionPc: { x: 100, y: 0, z: 0 } },
	];
	const first = easeLocationRangeStartEnd(locationWaypoints, 'a', 'e', {
		easeSecs: 3,
		rampSampleSecs: 1,
		groupId: 'ease-9',
	});
	const rebuilt = rebuildEaseLocationGroup(first.locationWaypoints, 'ease-9', {
		easeSecs: 1,
		rampSampleSecs: 0.5,
	});
	const rebuiltById = new Map(rebuilt.locationWaypoints.map((entry) => [entry.id, entry]));
	assert.equal(rebuilt.groupId, 'ease-9');
	assert.equal(rebuiltById.get('a').motionGroup.role, 'anchor');
	assert.equal(rebuiltById.get('c').motionGroup.role, 'real');
	assert.ok(rebuilt.insertedIds.length > 0, 'rebuild should create helpers for the same group');
	for (const id of rebuilt.insertedIds) {
		assert.equal(rebuiltById.get(id).motionGroup.id, 'ease-9');
	}
	const deleted = deleteEaseLocationGroupHelpers(rebuilt.locationWaypoints, 'ease-9');
	const deletedById = new Map(deleted.locationWaypoints.map((entry) => [entry.id, entry]));
	assert.ok(deleted.deletedIds.length > 0, 'delete helpers should remove generated helpers');
	assert.ok(deleted.clearedIds.includes('a'));
	assert.ok(deleted.clearedIds.includes('c'));
	assert.ok(deleted.clearedIds.includes('e'));
	assert.ok(deletedById.has('a') && deletedById.has('c') && deletedById.has('e'));
	assert.equal(deletedById.get('a').motionGroup, undefined);
	for (const id of deleted.deletedIds) {
		assert.equal(deletedById.has(id), false);
	}
}

console.log('[journey-evaluator] ok');
