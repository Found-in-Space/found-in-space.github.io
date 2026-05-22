export const OMEGA_CEN_MEMORY_LEASE_KEY = 'website.hr-diagram.omega-corridor';

export function createCanonicalOmegaCenRoute({
	createOrbitTransferRoute,
	ngc752CenterPc,
	ngc752OrbitRadiusPc,
	ngc752AngularSpeedRadPerSec,
	omegaCenCenterPc,
	omegaCenOrbitRadiusPc,
	omegaCenAngularSpeedRadPerSec,
	omegaCenTravelSecs,
	defaultOrbitNormal,
	omegaCenOrbitNormal,
	sampleStepSecs = 1 / 24,
}) {
	const start = defaultOrbitPosition(ngc752CenterPc, ngc752OrbitRadiusPc, defaultOrbitNormal);
	const sourceOrbit = {
		center: clonePoint(ngc752CenterPc),
		radius: ngc752OrbitRadiusPc,
		angularSpeedRadPerSec: ngc752AngularSpeedRadPerSec,
		normal: clonePoint(defaultOrbitNormal),
	};
	const destinationOrbit = {
		center: clonePoint(omegaCenCenterPc),
		radius: omegaCenOrbitRadiusPc,
		angularSpeedRadPerSec: omegaCenAngularSpeedRadPerSec,
		normal: clonePoint(omegaCenOrbitNormal),
	};
	const route = typeof createOrbitTransferRoute === 'function'
		? createOrbitTransferRoute({
			start,
			sourceOrbit,
			destinationOrbit,
			durationSecs: omegaCenTravelSecs,
			sampleStepSecs,
		})
		: null;
	const computedPoints = normalizePointList(route?.points);
	const forwardPointsPc = computedPoints.length >= 2
		? computedPoints
		: [
			start,
			defaultOrbitPosition(omegaCenCenterPc, omegaCenOrbitRadiusPc, omegaCenOrbitNormal),
		];
	const reversePointsPc = reversePointList(forwardPointsPc);
	const forwardArrivalAction = normalizeOrbitArrivalAction(route?.arrivalAction, destinationOrbit);
	const reverseArrivalAction = normalizeOrbitArrivalAction(null, sourceOrbit);

	return freezeRoute({
		forwardPointsPc,
		reversePointsPc,
		forwardArrivalAction,
		reverseArrivalAction,
		startAnchorPc: forwardPointsPc[0],
		omegaAnchorPc: forwardPointsPc[forwardPointsPc.length - 1],
	});
}

export function createOmegaCenPreloadHints({
	routePointsPc,
	buildTravelVolumeRequests,
	radiusProfile,
	paddingPc,
	quantizeStepPc,
	omegaCenCenterPc,
	omegaCenVolumeRadiusPc,
	omegaCenOrbitRadiusPc,
	omegaCenTravelSecs,
	omegaCenDwellSecs = 6,
	priorityBase = 30,
	destinationPriority = 5,
	includeDestinationSphere = true,
}) {
	const pathRequests = typeof buildTravelVolumeRequests === 'function'
		? buildTravelVolumeRequests({
			routePointsPc: normalizePointList(routePointsPc),
			radiusProfile,
			paddingPc,
			quantizeStepPc,
		})
		: [];
	const hints = pathRequests.map((request, index) => ({
		kind: 'path-volume',
		pointsPc: normalizePointList(request.pointsPc),
		radiusPc: request.radiusPc,
		priority: priorityBase - index,
	}));
	if (includeDestinationSphere) {
		hints.push({
			kind: 'sphere-volume',
			centerPc: clonePoint(omegaCenCenterPc),
			radiusPc: omegaCenVolumeRadiusPc + omegaCenOrbitRadiusPc + paddingPc,
			timeRangeSecs: [omegaCenTravelSecs, omegaCenTravelSecs + omegaCenDwellSecs],
			priority: destinationPriority,
		});
	}
	return hints;
}

export function createOmegaReturnRoutePoints(reversePointsPc, destinationPc) {
	const points = normalizePointList(reversePointsPc);
	const destination = normalizePoint(destinationPc);
	if (!destination) return points;
	const last = points.at(-1);
	if (!last || !samePoint(last, destination)) {
		points.push(destination);
	}
	return points;
}

export function createOrbitAnchorPoint(center, radius, normal) {
	return defaultOrbitPosition(center, radius, normal);
}

export function reversePointList(points) {
	return normalizePointList(points).reverse();
}

function freezeRoute(route) {
	return Object.freeze({
		...route,
		forwardPointsPc: Object.freeze(route.forwardPointsPc.map(freezePoint)),
		reversePointsPc: Object.freeze(route.reversePointsPc.map(freezePoint)),
		forwardArrivalAction: freezeArrivalAction(route.forwardArrivalAction),
		reverseArrivalAction: freezeArrivalAction(route.reverseArrivalAction),
		startAnchorPc: freezePoint(route.startAnchorPc),
		omegaAnchorPc: freezePoint(route.omegaAnchorPc),
	});
}

function freezeArrivalAction(action) {
	return Object.freeze({
		...action,
		center: freezePoint(action.center),
		normal: freezePoint(action.normal),
	});
}

function freezePoint(point) {
	return Object.freeze(clonePoint(point));
}

function normalizePointList(points) {
	return Array.from(points ?? [])
		.map(normalizePoint)
		.filter(Boolean);
}

function normalizePoint(point) {
	const x = Number(point?.x);
	const y = Number(point?.y);
	const z = Number(point?.z);
	return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function clonePoint(point) {
	return {
		x: Number(point?.x) || 0,
		y: Number(point?.y) || 0,
		z: Number(point?.z) || 0,
	};
}

function normalizeOrbitArrivalAction(action, fallback) {
	const source = action && typeof action === 'object' ? action : {};
	return {
		type: 'orbit',
		center: normalizePoint(source.center) ?? clonePoint(fallback.center),
		radius: positiveFinite(source.radius ?? source.radiusPc, fallback.radius),
		angularSpeedRadPerSec: finiteNumber(
			source.angularSpeedRadPerSec ?? source.angularSpeed,
			fallback.angularSpeedRadPerSec,
		),
		normal: normalizeDirection(source.normal, fallback.normal),
	};
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
	const unitNormal = normalizeDirection(normal, { x: 0, y: 0, z: 1 });
	const dot = vector.x * unitNormal.x + vector.y * unitNormal.y + vector.z * unitNormal.z;
	return {
		x: vector.x - unitNormal.x * dot,
		y: vector.y - unitNormal.y * dot,
		z: vector.z - unitNormal.z * dot,
	};
}

function normalizeDirection(vector, fallback) {
	const normalized = normalizePoint(vector) ?? normalizePoint(fallback) ?? { x: 0, y: 1, z: 0 };
	const length = Math.hypot(normalized.x, normalized.y, normalized.z);
	if (!(length > 1e-9)) return { x: 0, y: 1, z: 0 };
	return {
		x: normalized.x / length,
		y: normalized.y / length,
		z: normalized.z / length,
	};
}

function positiveFinite(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function samePoint(a, b) {
	return Math.abs(a.x - b.x) < 1e-9
		&& Math.abs(a.y - b.y) < 1e-9
		&& Math.abs(a.z - b.z) < 1e-9;
}
