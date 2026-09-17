import { SKYKIT_ACTIONS } from '@found-in-space/skykit';
import { createOrbitTransferRoute } from '@found-in-space/spatial';

const DEFAULT_NORMAL = Object.freeze({ x: 0, y: 0, z: 1 });
const activeChapters = new WeakMap();

export function createChapterViewpoints(chapters, order = Object.keys(chapters)) {
	return order.map((id) => ({
		id,
		label: chapters[id]?.label ?? id,
	}));
}

export async function activateChapterCamera(ctx, chapter, options = {}) {
	const { viewer } = ctx;
	const source = options.source ?? 'website.chapter';
	const activation = {};
	activeChapters.set(viewer, activation);
	const isCurrent = () => activeChapters.get(viewer) === activation;
	const onArrive = once(() => {
		if (isCurrent()) return options.onArrive?.(chapter, ctx);
	});
	const motion = ctx.navigation?.getSnapshot()?.navigation;
	await viewer.actions.invoke(SKYKIT_ACTIONS.navigation.cancel, null, { source });
	if (!isCurrent()) return;
	// SkyKit 0.2 queues navigation's next pose until the following update.
	// Cancelling automation leaves that queued sample intact. Hold the displayed
	// pose so an interrupted operation cannot write one more frame after cancel.
	const current = viewer.getViewState();
	viewer.requestViewState({
		observerPc: current.observerPc,
		orientationIcrs: current.orientationIcrs,
	}, source);

	// A scene view describes a destination, never the departure pose. In SkyKit
	// 0.2, both lookAt and targetPc view patches immediately change orientation.
	// Initial camera placement belongs only in createSkykitViewer({ view }).
	const { observerPc, orientationIcrs, lookAt, targetPc, ...settings } = chapter.view ?? {};
	if (Object.keys(settings).length) viewer.requestViewState(settings, source);

	const transitionTo = chapter.navigation?.transitionTo;
	if (chapter.camera?.type === 'orbit') {
		await activateOrbitCamera(ctx, chapter, { ...options, onArrive, isCurrent, motion });
		return;
	}

	if (transitionTo && typeof transitionTo === 'object') {
		await viewer.actions.invoke(SKYKIT_ACTIONS.navigation.transitionTo, {
			...transitionTo,
			onArrive,
		}, { source });
		return;
	}

	if (observerPc || orientationIcrs || lookAt || targetPc) {
		await viewer.actions.invoke(SKYKIT_ACTIONS.navigation.transitionTo, {
			...chapter.view,
			durationSecs: positiveNumber(chapter.travel?.durationSecs, 5),
			onArrive,
		}, { source });
		return;
	}

	onArrive();
}

async function activateOrbitCamera(ctx, chapter, options) {
	const { viewer } = ctx;
	const source = options.source ?? 'website.chapter';
	const camera = chapter.camera;
	const center = normalizeVector3(camera.center, { x: 0, y: 0, z: 0 });
	const normal = normalizeDirectionVector(camera.normal, DEFAULT_NORMAL);
	const lookTarget = normalizeVector3(camera.lookAt ?? camera.center, center);
	const radius = positiveNumber(camera.radiusPc ?? camera.radius, 1);
	const angularSpeedRadPerSec = finiteNumber(camera.angularSpeedRadPerSec, 0.1);
	const orbit = {
		type: 'orbit',
		center,
		radius,
		angularSpeedRadPerSec,
		normal,
	};
	const travel = {
		...(chapter.travel && typeof chapter.travel === 'object' ? chapter.travel : {}),
		...(options.travel && typeof options.travel === 'object' ? options.travel : {}),
	};
	const durationSecs = positiveNumber(travel.durationSecs, 5);
	const sampleStepSecs = positiveNumber(travel.sampleStepSecs, 1 / 30);
	const arrivalThreshold = positiveNumber(travel.arrivalThreshold, 0.05);
	const arrivalAction = normalizeOrbitAction(travel.arrivalAction, orbit);
	const onArrive = options.onArrive;

	await viewer.actions.invoke(SKYKIT_ACTIONS.navigation.lockAt, {
		...lookTarget,
		up: normal,
		dwellSecs: Math.max(0, finiteNumber(camera.dwellSecs, 0)),
		recenterSpeed: 0.06,
	}, { source });
	if (!options.isCurrent()) return;

	const explicitPoints = normalizePointList(travel.pointsPc ?? travel.points);
	if (explicitPoints.length >= 2) {
		// Authored corridor points are waypoints ahead of the live observer.
		// flyPolyline itself starts at points[0]; it does not fly to that point.
		const start = viewer.getViewState().observerPc;
		await viewer.actions.invoke(SKYKIT_ACTIONS.navigation.flyPolyline, {
			points: [start, ...explicitPoints],
			durationSecs,
			currentSpeed: options.motion?.speedNavigationUnitsPerSecond ?? 0,
			arrivalSpeed: Math.abs(arrivalAction.radius * arrivalAction.angularSpeedRadPerSec),
			arrivalThreshold,
			arrivalAction,
			onArrive,
		}, { source });
		return;
	}

	const route = createOrbitTransferRoute({
		start: viewer.getViewState().observerPc,
		sourceOrbit: options.motion?.movementAutomation?.type === 'orbit'
			? {
				...options.motion.movementAutomation,
				angularSpeedRadPerSec: options.motion.movementAutomation.angularSpeed,
			} : undefined,
		approachVelocity: options.motion?.velocity ?? { x: 0, y: 0, z: 0 },
		destinationOrbit: orbit,
		durationSecs,
		sampleStepSecs,
	});
	if (route?.points?.length >= 2) {
		await viewer.actions.invoke(SKYKIT_ACTIONS.navigation.flyPolyline, {
			points: route.points,
			durationSecs,
			currentSpeed: route.departureSpeed,
			arrivalSpeed: route.arrivalSpeed,
			arrivalThreshold,
			arrivalAction: route.arrivalAction ?? arrivalAction,
			onArrive,
		}, { source });
		return;
	}

	await viewer.actions.invoke(SKYKIT_ACTIONS.navigation.transitionTo, {
		observerPc: defaultOrbitPosition(center, radius, normal),
		lookAt: { targetPc: lookTarget },
		movement: { durationSecs },
		orientationTransition: { durationSecs: Math.min(durationSecs, 2) },
		onArrive: () => {
			if (!options.isCurrent()) return;
			void viewer.actions.invoke(SKYKIT_ACTIONS.navigation.orbit, orbit, { source });
			onArrive();
		},
	}, { source });
}

function normalizeOrbitAction(value, fallback) {
	const source = value && typeof value === 'object' ? value : {};
	const fallbackNormal = fallback.normal ?? DEFAULT_NORMAL;
	return {
		type: 'orbit',
		center: normalizeVector3(source.center, fallback.center),
		radius: positiveNumber(source.radius ?? source.radiusPc, fallback.radius),
		angularSpeedRadPerSec: finiteNumber(
			source.angularSpeedRadPerSec ?? source.angularSpeed,
			fallback.angularSpeedRadPerSec,
		),
		normal: normalizeDirectionVector(source.normal, fallbackNormal),
	};
}

function normalizePointList(value) {
	return Array.isArray(value) ? value.map((point) => normalizeVector3(point, null)).filter(Boolean) : [];
}

function normalizeVector3(value, fallback) {
	if (!value || typeof value !== 'object') return fallback ? { ...fallback } : null;
	const x = Number(value.x);
	const y = Number(value.y);
	const z = Number(value.z);
	return [x, y, z].every(Number.isFinite) ? { x, y, z } : (fallback ? { ...fallback } : null);
}

function normalizeDirectionVector(value, fallback) {
	const vector = normalizeVector3(value, fallback);
	const length = Math.hypot(vector.x, vector.y, vector.z);
	return length > 1e-9
		? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
		: { ...fallback };
}

function defaultOrbitPosition(center, radius, normal) {
	const axis = Math.abs(normal.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
	const projected = projectOnPlane(axis, normal);
	const length = Math.hypot(projected.x, projected.y, projected.z);
	const direction = length > 1e-9
		? { x: projected.x / length, y: projected.y / length, z: projected.z / length }
		: { x: 1, y: 0, z: 0 };
	return {
		x: center.x + direction.x * radius,
		y: center.y + direction.y * radius,
		z: center.z + direction.z * radius,
	};
}

function projectOnPlane(vector, normal) {
	const amount = vector.x * normal.x + vector.y * normal.y + vector.z * normal.z;
	return {
		x: vector.x - normal.x * amount,
		y: vector.y - normal.y * amount,
		z: vector.z - normal.z * amount,
	};
}

function positiveNumber(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function once(fn) {
	let called = false;
	return (...args) => {
		if (called) return;
		called = true;
		void Promise.resolve(fn(...args));
	};
}
