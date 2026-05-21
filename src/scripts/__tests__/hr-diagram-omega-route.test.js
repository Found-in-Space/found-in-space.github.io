import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createCanonicalOmegaCenRoute,
	createOmegaCenPreloadHints,
	createOmegaReturnRoutePoints,
	OMEGA_CEN_MEMORY_LEASE_KEY,
} from '../hr-diagram-omega-route.js';

const DEFAULT_OPTIONS = Object.freeze({
	ngc752CenterPc: { x: 300, y: 160, z: 260 },
	ngc752OrbitRadiusPc: 10,
	ngc752AngularSpeedRadPerSec: 0.22,
	omegaCenCenterPc: { x: -3290, y: -1309, z: -3862 },
	omegaCenOrbitRadiusPc: 60,
	omegaCenAngularSpeedRadPerSec: 0.08,
	omegaCenTravelSecs: 15,
	defaultOrbitNormal: { x: 0, y: 0, z: 1 },
	omegaCenOrbitNormal: { x: 0, y: 1, z: 0 },
});

test('canonical Omega Cen route builds stable forward and reverse points', () => {
	const route = createCanonicalOmegaCenRoute({
		...DEFAULT_OPTIONS,
		createOrbitTransferRoute({ start }) {
			return {
				points: [
					start,
					{ x: 120, y: 90, z: 40 },
					{ x: -3230, y: -1309, z: -3862 },
				],
				arrivalAction: {
					type: 'orbit',
					center: DEFAULT_OPTIONS.omegaCenCenterPc,
					radius: DEFAULT_OPTIONS.omegaCenOrbitRadiusPc,
					angularSpeedRadPerSec: DEFAULT_OPTIONS.omegaCenAngularSpeedRadPerSec,
					normal: DEFAULT_OPTIONS.omegaCenOrbitNormal,
				},
			};
		},
	});

	assert.equal(route.forwardPointsPc.length, 3);
	assert.deepEqual(route.reversePointsPc, route.forwardPointsPc.slice().reverse());
	assert.deepEqual(route.forwardArrivalAction.center, DEFAULT_OPTIONS.omegaCenCenterPc);
	assert.deepEqual(route.reverseArrivalAction.center, DEFAULT_OPTIONS.ngc752CenterPc);
});

test('Omega return route keeps the shared corridor before forking to the destination', () => {
	const reverseCorridor = [
		{ x: -3230, y: -1309, z: -3862 },
		{ x: 120, y: 90, z: 40 },
		{ x: 310, y: 160, z: 260 },
	];
	const destination = { x: 0, y: 0, z: 0 };
	const route = createOmegaReturnRoutePoints(reverseCorridor, destination);

	assert.deepEqual(route.slice(0, reverseCorridor.length), reverseCorridor);
	assert.deepEqual(route.at(-1), destination);
});

test('Omega preload hints are deterministic for duplicate corridor requests', () => {
	const routePointsPc = [
		{ x: 310, y: 160, z: 260 },
		{ x: 120, y: 90, z: 40 },
		{ x: -3230, y: -1309, z: -3862 },
	];
	const options = {
		routePointsPc,
		buildTravelVolumeRequests({ routePointsPc: points }) {
			return [
				{ pointsPc: points.slice(0, 2), radiusPc: 25 },
				{ pointsPc: points.slice(1), radiusPc: 60 },
			];
		},
		radiusProfile: [],
		paddingPc: 4,
		quantizeStepPc: 5,
		omegaCenCenterPc: DEFAULT_OPTIONS.omegaCenCenterPc,
		omegaCenVolumeRadiusPc: 100,
		omegaCenOrbitRadiusPc: DEFAULT_OPTIONS.omegaCenOrbitRadiusPc,
		omegaCenTravelSecs: DEFAULT_OPTIONS.omegaCenTravelSecs,
	};

	assert.deepEqual(
		createOmegaCenPreloadHints(options),
		createOmegaCenPreloadHints(options),
	);
});

test('Omega forward and return journeys share a stable decoded memory lease key', () => {
	assert.equal(OMEGA_CEN_MEMORY_LEASE_KEY, 'website.hr-diagram.omega-corridor');
});
