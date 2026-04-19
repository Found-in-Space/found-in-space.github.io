import * as THREE from 'three';
import {
	GALACTIC_CENTER_PC,
	SOLAR_ORIGIN_PC,
	buildPolylineRoute,
	createCameraRigController,
	createFoundInSpaceDatasetOptions,
	createHighlightStarFieldMaterialProfile,
	createObserverShellField,
	createSelectionRefreshController,
	createStarFieldLayer,
	createViewer,
	getDatasetSession,
	resolveFoundInSpaceDatasetOverrides,
	samplePolylineRoutePosition,
	toRaDec,
} from '@found-in-space/skykit';
import { HRDiagramRenderer } from './skykit/hr-diagram-renderer.js';
import { createVolumeHRLoader } from './skykit/volume-hr-loader.js';

const NO_KEYBOARD_EVENTS_TARGET = {
	addEventListener() {},
	removeEventListener() {},
};

export const DEFAULT_HR_MAG_LIMIT = 6.5;
export const DEFAULT_HR_VOLUME_RADIUS = 25;
export const INNER_GALACTIC_PLANE_TARGET_PC = GALACTIC_CENTER_PC;
const MOBILE_HR_MARGIN_PX = 14;
const DESKTOP_HR_MARGIN_PX = 24;

const DEFAULT_LOOK_DISTANCE_PC = 2500;
const HR_TRANSIT_MOTION_ADAPTIVE_MAX_LEVEL = Object.freeze({
	lookaheadSecs: 0.5,
	minLevel: 8,
});
const TRAVEL_RADIUS_PROFILE_STEP_PC = 1;
const PRELOAD_RADIUS_PADDING_PC = 0.5;

const GALACTIC_TO_ICRS_ROTATION = [
	[-0.0548755604, +0.4941094279, -0.8676661490],
	[-0.8734370902, -0.4448296300, -0.1980763734],
	[-0.4838350155, +0.7469822445, +0.4559837762],
];

export const GALACTIC_NORTH_TARGET_PC = Object.freeze(galacticToIcrsPoint(0, DEFAULT_LOOK_DISTANCE_PC, 0));

const HIGHLIGHT_PRESETS = {
	'white-dwarfs': {
		color: '#8cffb8',
		teffMin: 7000,
		teffMax: 40000,
		magAbsMin: 10,
		magAbsMax: 18,
		label: 'White dwarfs',
	},
	'red-dwarfs': {
		color: '#ffc273',
		teffMin: 2000,
		teffMax: 4000,
		magAbsMin: 8,
		magAbsMax: 18,
		label: 'Red dwarfs',
	},
	'brown-dwarfs': {
		color: '#e87dff',
		teffMin: 900,
		teffMax: 2500,
		magAbsMin: 14,
		magAbsMax: 21,
		label: 'Brown dwarfs',
	},
	'hot-stars': {
		color: '#7fb5ff',
		teffMin: 10000,
		teffMax: 40000,
		magAbsMin: -6,
		magAbsMax: 18,
		label: 'Hot stars',
	},
	'cool-stars': {
		color: '#ff896e',
		teffMin: 2000,
		teffMax: 4000,
		magAbsMin: -3,
		magAbsMax: 18,
		label: 'Cool stars',
	},
	'main-sequence': {
		color: '#86c3ff',
		teffMin: 2600,
		teffMax: 12000,
		magAbsMin: 1,
		magAbsMax: 13,
		label: 'Main sequence (approx)',
	},
};

function galacticToIcrsPoint(gx, gy, gz) {
	return {
		x:
			GALACTIC_TO_ICRS_ROTATION[0][0] * gx
			+ GALACTIC_TO_ICRS_ROTATION[0][1] * gy
			+ GALACTIC_TO_ICRS_ROTATION[0][2] * gz,
		y:
			GALACTIC_TO_ICRS_ROTATION[1][0] * gx
			+ GALACTIC_TO_ICRS_ROTATION[1][1] * gy
			+ GALACTIC_TO_ICRS_ROTATION[1][2] * gz,
		z:
			GALACTIC_TO_ICRS_ROTATION[2][0] * gx
			+ GALACTIC_TO_ICRS_ROTATION[2][1] * gy
			+ GALACTIC_TO_ICRS_ROTATION[2][2] * gz,
	};
}

function parseBoolean(value) {
	return value === '' || value === 'true' || value === '1' || value === 'yes';
}

function readDatasetString(root, key) {
	const value = root.dataset[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createLocalDatasetSession(id, datasetOverrides = {}) {
	return getDatasetSession(
		createFoundInSpaceDatasetOptions({
			id,
			...resolveFoundInSpaceDatasetOverrides(),
			...datasetOverrides,
			capabilities: {
				sharedCaches: true,
				bootstrapLoading: id,
			},
		}),
	);
}

function buildHighlightState(name) {
	const preset = HIGHLIGHT_PRESETS[name];
	if (!preset) {
		return {
			highlightEnabled: false,
		};
	}
	return {
		highlightEnabled: true,
		highlightColor: preset.color,
		highlightTeffMin: preset.teffMin,
		highlightTeffMax: preset.teffMax,
		highlightMagAbsMin: preset.magAbsMin,
		highlightMagAbsMax: preset.magAbsMax,
	};
}

function normalizePoint(point, fallback = null) {
	if (!point || typeof point !== 'object') {
		return fallback;
	}

	const x = Number(point.x);
	const y = Number(point.y);
	const z = Number(point.z);
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
		return fallback;
	}

	return { x, y, z };
}

function pointDistance(left, right) {
	if (!left || !right) {
		return Number.POSITIVE_INFINITY;
	}

	const dx = right.x - left.x;
	const dy = right.y - left.y;
	const dz = right.z - left.z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function icrsDirectionToGalacticDirection(direction) {
	if (!direction || typeof direction !== 'object') {
		return null;
	}

	const x = Number(direction.x);
	const y = Number(direction.y);
	const z = Number(direction.z);
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
		return null;
	}

	return {
		x:
			GALACTIC_TO_ICRS_ROTATION[0][0] * x
			+ GALACTIC_TO_ICRS_ROTATION[1][0] * y
			+ GALACTIC_TO_ICRS_ROTATION[2][0] * z,
		y:
			GALACTIC_TO_ICRS_ROTATION[0][1] * x
			+ GALACTIC_TO_ICRS_ROTATION[1][1] * y
			+ GALACTIC_TO_ICRS_ROTATION[2][1] * z,
		z:
			GALACTIC_TO_ICRS_ROTATION[0][2] * x
			+ GALACTIC_TO_ICRS_ROTATION[1][2] * y
			+ GALACTIC_TO_ICRS_ROTATION[2][2] * z,
	};
}

function formatHours(hours) {
	if (!Number.isFinite(hours)) {
		return 'n/a';
	}

	const wrappedHours = ((hours % 24) + 24) % 24;
	const h = Math.floor(wrappedHours);
	const minutesTotal = (wrappedHours - h) * 60;
	const m = Math.floor(minutesTotal);
	const s = (minutesTotal - m) * 60;
	return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${s.toFixed(1).padStart(4, '0')}s`;
}

function formatDegrees(degrees) {
	if (!Number.isFinite(degrees)) {
		return 'n/a';
	}

	const sign = degrees >= 0 ? '+' : '-';
	const absoluteDegrees = Math.abs(degrees);
	const d = Math.floor(absoluteDegrees);
	const minutesTotal = (absoluteDegrees - d) * 60;
	const m = Math.floor(minutesTotal);
	const s = (minutesTotal - m) * 60;
	return `${sign}${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}′ ${s.toFixed(1).padStart(4, '0')}″`;
}

function formatFixedCoordinate(value) {
	return Number.isFinite(value) ? value.toFixed(3) : 'n/a';
}

function serializePoint(point) {
	return `${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`;
}

function quantizeRadius(radiusPc, stepPc = TRAVEL_RADIUS_PROFILE_STEP_PC) {
	if (!Number.isFinite(radiusPc) || !(radiusPc > 0)) {
		return radiusPc;
	}
	if (!(stepPc > 0)) {
		return radiusPc;
	}
	return Math.ceil(radiusPc / stepPc) * stepPc;
}

function normalizeRadiusProfilePoint(point) {
	if (!point || typeof point !== 'object') {
		return null;
	}

	const progress = Number(point.progress);
	const radiusPc = Number(point.radiusPc ?? point.radius);
	if (!Number.isFinite(progress) || !Number.isFinite(radiusPc) || !(radiusPc > 0)) {
		return null;
	}

	return {
		progress: Math.min(1, Math.max(0, progress)),
		radiusPc,
	};
}

function normalizeTravelRadiusProfile(profile, {
	defaultStartRadiusPc = null,
	defaultEndRadiusPc = null,
} = {}) {
	const normalizedProfile = Array.isArray(profile)
		? profile.map((point) => normalizeRadiusProfilePoint(point)).filter(Boolean)
		: [];
	const startRadiusPc = Number.isFinite(defaultStartRadiusPc) && defaultStartRadiusPc > 0
		? defaultStartRadiusPc
		: normalizedProfile[0]?.radiusPc ?? null;
	const endRadiusPc = Number.isFinite(defaultEndRadiusPc) && defaultEndRadiusPc > 0
		? defaultEndRadiusPc
		: normalizedProfile[normalizedProfile.length - 1]?.radiusPc ?? startRadiusPc;
	if (!Number.isFinite(startRadiusPc) || !Number.isFinite(endRadiusPc)) {
		return [];
	}

	const points = [
		{ progress: 0, radiusPc: startRadiusPc },
		...normalizedProfile,
		{ progress: 1, radiusPc: endRadiusPc },
	]
		.sort((left, right) => left.progress - right.progress)
		.filter((point, index, arr) =>
			index === 0
			|| point.progress !== arr[index - 1].progress
			|| point.radiusPc !== arr[index - 1].radiusPc);

	if (points[0].progress !== 0) {
		points.unshift({ progress: 0, radiusPc: startRadiusPc });
	}
	if (points[points.length - 1].progress !== 1) {
		points.push({ progress: 1, radiusPc: endRadiusPc });
	}

	return points;
}

function sampleTravelRadiusProfile(profile, progress) {
	if (!Array.isArray(profile) || profile.length === 0) {
		return null;
	}

	const clampedProgress = Math.min(1, Math.max(0, progress));
	if (clampedProgress <= profile[0].progress) {
		return profile[0].radiusPc;
	}

	for (let index = 1; index < profile.length; index += 1) {
		const previousPoint = profile[index - 1];
		const nextPoint = profile[index];
		if (clampedProgress > nextPoint.progress && index < profile.length - 1) {
			continue;
		}

		const intervalProgress = nextPoint.progress - previousPoint.progress;
		if (!(intervalProgress > 0)) {
			return nextPoint.radiusPc;
		}
		const blend = (clampedProgress - previousPoint.progress) / intervalProgress;
		return previousPoint.radiusPc + (nextPoint.radiusPc - previousPoint.radiusPc) * blend;
	}

	return profile[profile.length - 1].radiusPc;
}

function extractRouteSlicePoints(route, startProgress, endProgress) {
	if (!route || !Array.isArray(route.points) || route.points.length < 2 || !(route.totalLengthPc > 0)) {
		return [];
	}

	const clampedStartProgress = Math.min(1, Math.max(0, startProgress));
	const clampedEndProgress = Math.min(1, Math.max(clampedStartProgress, endProgress));
	const startDistancePc = route.totalLengthPc * clampedStartProgress;
	const endDistancePc = route.totalLengthPc * clampedEndProgress;
	const points = [];
	const startPoint = samplePolylineRoutePosition(route, startDistancePc);
	const endPoint = samplePolylineRoutePosition(route, endDistancePc);
	if (startPoint) {
		points.push(startPoint);
	}
	for (const segment of route.segments ?? []) {
		if (
			segment.cumulativeEndPc <= startDistancePc + 1e-6
			|| segment.cumulativeEndPc >= endDistancePc - 1e-6
		) {
			continue;
		}
		points.push(segment.end);
	}
	if (endPoint && pointDistance(points[points.length - 1], endPoint) > 1e-6) {
		points.push(endPoint);
	}
	return points;
}

function resolveSceneTravelRadiusProfile(scene = {}, {
	defaultStartRadiusPc = null,
	defaultEndRadiusPc = null,
} = {}) {
	if (typeof scene.travelRadiusProfileBuilder === 'function') {
		const profile = scene.travelRadiusProfileBuilder({
			scene,
			defaultStartRadiusPc,
			defaultEndRadiusPc,
		});
		return normalizeTravelRadiusProfile(profile, {
			defaultStartRadiusPc,
			defaultEndRadiusPc,
		});
	}

	return normalizeTravelRadiusProfile(scene.travelRadiusProfile, {
		defaultStartRadiusPc,
		defaultEndRadiusPc,
	});
}

function buildProfiledPathPreloadRequests(route, radiusProfile, { defaultRadiusPc = null } = {}) {
	if (!route || !Array.isArray(route.points) || route.points.length < 2) {
		return [];
	}

	if (!Array.isArray(radiusProfile) || radiusProfile.length === 0) {
		if (!Number.isFinite(defaultRadiusPc) || !(defaultRadiusPc > 0)) {
			return [];
		}
		return [{
			type: 'path',
			points: route.points,
			maxRadiusPc: defaultRadiusPc,
		}];
	}

	const requests = [];
	for (let index = 1; index < radiusProfile.length; index += 1) {
		const previousPoint = radiusProfile[index - 1];
		const nextPoint = radiusProfile[index];
		const slicePoints = extractRouteSlicePoints(route, previousPoint.progress, nextPoint.progress);
		if (slicePoints.length < 2) {
			continue;
		}

		const requestRadiusPc = quantizeRadius(
			Math.max(previousPoint.radiusPc, nextPoint.radiusPc) + PRELOAD_RADIUS_PADDING_PC,
		);
		if (!Number.isFinite(requestRadiusPc) || !(requestRadiusPc > 0)) {
			continue;
		}

		const previousRequest = requests[requests.length - 1];
		if (
			previousRequest
			&& previousRequest.type === 'path'
			&& Math.abs(previousRequest.maxRadiusPc - requestRadiusPc) < 1e-6
			&& pointDistance(
				previousRequest.points[previousRequest.points.length - 1],
				slicePoints[0],
			) < 1e-6
		) {
			previousRequest.points.push(...slicePoints.slice(1));
			continue;
		}

		requests.push({
			type: 'path',
			points: slicePoints,
			maxRadiusPc: requestRadiusPc,
		});
	}

	return requests;
}

function describePreloadRequest(request) {
	if (request.type === 'path') {
		const startPoint = request.points[0];
		const endPoint = request.points[request.points.length - 1];
		return {
			type: 'path',
			radiusPc: request.maxRadiusPc,
			start: startPoint ? serializePoint(startPoint) : 'unknown',
			end: endPoint ? serializePoint(endPoint) : 'unknown',
			pointCount: Array.isArray(request.points) ? request.points.length : 0,
		};
	}

	return {
		type: 'volume',
		radiusPc: request.maxRadiusPc,
		center: request.observerPc ? serializePoint(request.observerPc) : 'unknown',
	};
}

function createEmptyHrGeometry() {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
	geometry.setAttribute('teff_log8', new THREE.Uint8BufferAttribute(new Uint8Array(0), 1, true));
	geometry.setAttribute('magAbs', new THREE.BufferAttribute(new Float32Array(0), 1));
	geometry.setDrawRange(0, 0);
	return geometry;
}

function normalizeVolumeRenderStrategy(strategy) {
	return strategy === 'progressive' ? 'progressive' : 'strict';
}

export async function mountHrDiagramViewer(root) {
	const mount = root.querySelector('[data-hr-diagram-viewer-shell]');
	if (!mount) {
		throw new Error('Missing [data-hr-diagram-viewer-shell] mount for HR diagram viewer.');
	}

	const hrCanvasElement = root.querySelector('[data-hr-diagram-viewer-hr]');
	const highlightName = root.dataset.highlight || '';
	const showHr = parseBoolean(root.dataset.showHr);
	let activeMagLimit = DEFAULT_HR_MAG_LIMIT;
	let activeMode = 0;
	let activeRadius = DEFAULT_HR_VOLUME_RADIUS;
	let viewer = null;
	let cameraController = null;
	let hrDiagram = null;
	let volumeLoader = null;
	let volumeLoadPromise = null;
	let volumeReloadPending = false;
	let reloadQueued = false;
	let pendingVolumeForce = false;
	let activeVolumeRenderStrategy = 'strict';
	let volumeSceneEpoch = 0;
	let lastObserverPc = { ...SOLAR_ORIGIN_PC };
	let lastVolumeObserverPc = null;
	let lastVolumeRadius = null;
	let lastStarFieldGeometry = null;
	let lastStarFieldCount = 0;
	let lastVolumeGeometry = null;
	const completedScenePreloadRequests = new Set();
	const scenePreloadPromises = new Map();
	const queuedScenePreloadTasks = [];
	const scheduledScenePreloadTimeouts = new Set();
	const scheduledScenePreloadIdleCallbacks = new Set();
	let preloadQueueBusy = false;
	let activeTravelRadiusAnimation = null;
	const emptyHrGeometry = createEmptyHrGeometry();
	let directionDebugPointerBound = false;

	const topicId = root.dataset.topic || 'hr-diagram';
	const sessionId =
		root.dataset.datasetId || `website-learn-hr-diagram-${topicId}`;
	const octreeUrl = readDatasetString(root, 'octreeUrl');
	const metaUrl = readDatasetString(root, 'metaUrl');
	const datasetSession = createLocalDatasetSession(sessionId, {
		...(octreeUrl ? { octreeUrl } : {}),
		...(metaUrl ? { metaUrl } : {}),
	});

	const modeButtons = root.querySelectorAll('[data-hr-mode]');
	const magRow = root.querySelector('[data-hr-mag-row]');
	const magInput = root.querySelector('[data-hr-mag-limit]');
	const magValue = root.querySelector('[data-hr-mag-value]');
	const volumeRow = root.querySelector('[data-hr-volume-row]');
	const radiusInput = root.querySelector('[data-hr-radius]');
	const radiusValue = root.querySelector('[data-hr-radius-value]');

	function setActiveMode(mode) {
		activeMode = mode;
		modeButtons.forEach((btn) => {
			btn.classList.toggle('active', Number(btn.dataset.hrMode) === mode);
		});
		hrDiagram?.setMode(mode);
		hrDiagram?.setStarCount(0);

		if (magRow) magRow.hidden = mode === 1;
		if (volumeRow) volumeRow.hidden = mode !== 1;
	}

	function syncHrFromStarField() {
		if (!hrDiagram || !lastStarFieldGeometry) return;
		hrDiagram.setGeometry(lastStarFieldGeometry);
		hrDiagram.setStarCount(0);
	}

	function getCurrentObserverPc(fallback = SOLAR_ORIGIN_PC) {
		return viewer?.getSnapshotState?.()?.state?.observerPc ?? fallback;
	}

	function isMovementAutomationActive() {
		return Boolean(cameraController?.getStats?.()?.movementAutomation);
	}

	function getVolumeReloadDistanceThreshold(radius = activeRadius) {
		if (
			activeMode === 1
			&& activeVolumeRenderStrategy === 'progressive'
			&& isMovementAutomationActive()
		) {
			return Math.max(6, Math.min(radius * 0.4, 12));
		}
		return Math.max(6, radius * 0.4);
	}

	function getProgressiveVolumeApplyDistanceThreshold(radius = activeRadius) {
		return Math.max(8, Math.min(radius * 0.3, 18));
	}

	function applyVolumeGeometry(geometry) {
		if (!hrDiagram || !geometry) return;
		hrDiagram.setGeometry(geometry);
		hrDiagram.setStarCount(0);
	}

	function canReuseVolumeGeometry(observerPc, radius = activeRadius) {
		return Boolean(
			lastVolumeGeometry
			&& lastVolumeObserverPc
			&& Number.isFinite(lastVolumeRadius)
			&& Math.abs(lastVolumeRadius - radius) < 1e-6
			&& pointDistance(lastVolumeObserverPc, observerPc) < Math.max(6, radius * 0.4)
		);
	}

	function syncHrFromCachedVolume(observerPc, { allowEmpty = false } = {}) {
		if (!hrDiagram) return false;
		if (canReuseVolumeGeometry(observerPc, activeRadius)) {
			applyVolumeGeometry(lastVolumeGeometry);
			return true;
		}
		if (allowEmpty) {
			applyVolumeGeometry(emptyHrGeometry);
		}
		return false;
	}

	async function refreshSelection() {
		if (!viewer?.refreshSelection) return;
		try {
			await viewer.refreshSelection();
		} catch (error) {
			console.error('[website:hr-diagram-viewer] refresh failed', error);
		}
	}

	async function loadVolumeHR({ force = false } = {}) {
		if (!volumeLoader || activeMode !== 1) return;
		if (volumeLoadPromise) {
			volumeReloadPending = true;
			pendingVolumeForce = pendingVolumeForce || force;
			return volumeLoadPromise;
		}
		const observerPc = getCurrentObserverPc();
		const loadRadius = activeRadius;
		if (
			!force
			&& canReuseVolumeGeometry(observerPc, loadRadius)
		) {
			lastObserverPc = { ...observerPc };
			applyVolumeGeometry(lastVolumeGeometry);
			return {
				geometry: lastVolumeGeometry,
				cached: true,
			};
		}

		const requestObserverPc = { ...observerPc };
		const requestRadius = loadRadius;
		const requestEpoch = volumeSceneEpoch;
		lastObserverPc = { ...observerPc };
		volumeLoadPromise = volumeLoader.load({
			observerPc: requestObserverPc,
			maxRadiusPc: requestRadius,
		});

		try {
			const result = await volumeLoadPromise;
			if (!result) return null;

			const currentObserverPc = getCurrentObserverPc(requestObserverPc);
			const currentLoadRadius = activeRadius;
			const requestStillCurrent =
				requestEpoch === volumeSceneEpoch
				&& activeMode === 1
				&& Math.abs(currentLoadRadius - requestRadius) < 1e-6;
			const exactMatch =
				pointDistance(currentObserverPc, requestObserverPc) < Math.max(6, requestRadius * 0.4);
			const progressiveMatch =
				activeVolumeRenderStrategy === 'progressive'
				&& isMovementAutomationActive()
				&& pointDistance(currentObserverPc, requestObserverPc)
					< getProgressiveVolumeApplyDistanceThreshold(requestRadius);
			const shouldApply =
				requestStillCurrent
				&& (
					exactMatch
					|| progressiveMatch
				);

			if (requestStillCurrent) {
				lastVolumeGeometry = result.geometry;
				lastVolumeObserverPc = requestObserverPc;
				lastVolumeRadius = requestRadius;
			}

			if (shouldApply) {
				applyVolumeGeometry(result.geometry);
			}

			return result;
		} finally {
			volumeLoadPromise = null;
			if (volumeReloadPending && activeMode === 1) {
				const nextForce = pendingVolumeForce;
				volumeReloadPending = false;
				pendingVolumeForce = false;
				queueVolumeReload({ force: nextForce });
			}
		}
	}

	function queueVolumeReload({ force = false } = {}) {
		if (reloadQueued) return;
		pendingVolumeForce = pendingVolumeForce || force;
		reloadQueued = true;
		requestAnimationFrame(() => {
			reloadQueued = false;
			const nextForce = pendingVolumeForce;
			pendingVolumeForce = false;
			loadVolumeHR({ force: nextForce }).catch((err) =>
				console.error('[website:hr-diagram-viewer] volume load failed', err),
			);
		});
	}

	const highlightState = buildHighlightState(highlightName);
	const highlightPreset = HIGHLIGHT_PRESETS[highlightName] || null;
	if (showHr && hrCanvasElement instanceof HTMLCanvasElement) {
		const isPhone = window.matchMedia('(max-width: 720px)').matches;
		hrDiagram = new HRDiagramRenderer(hrCanvasElement, {
			mode: activeMode,
			marginPx: isPhone ? MOBILE_HR_MARGIN_PX : DESKTOP_HR_MARGIN_PX,
			volumeRadiusPc: activeRadius,
		});
		hrDiagram.setAppMagLimit(activeMagLimit);
		hrDiagram.setVolumeRadiusPc(activeRadius);
		if (highlightPreset) {
			hrDiagram.setHighlightRegion({
				teffMin: highlightPreset.teffMin,
				teffMax: highlightPreset.teffMax,
				magAbsMin: highlightPreset.magAbsMin,
				magAbsMax: highlightPreset.magAbsMax,
				color: highlightPreset.color,
				label: highlightPreset.label,
			});
		}
	}

	const cameraWorldPos = new THREE.Vector3();
	const vpMatrix = new THREE.Matrix4();
	const hrOverlay = hrDiagram
		? {
				id: 'hr-diagram-render',
				update(context) {
					updateTravelRadiusAnimation(context.frame?.deltaSeconds ?? 0);
					context.camera.getWorldPosition(cameraWorldPos);

					if (activeMode === 2) {
						vpMatrix.multiplyMatrices(
							context.camera.projectionMatrix,
							context.camera.matrixWorldInverse,
						);
						hrDiagram.setViewProjection(vpMatrix);
					}

					hrDiagram.render(cameraWorldPos);

					if (activeMode === 1) {
						const obs = context.state?.observerPc;
						if (obs) {
							const dx = obs.x - lastObserverPc.x;
							const dy = obs.y - lastObserverPc.y;
							const dz = obs.z - lastObserverPc.z;
							const moved = Math.sqrt(dx * dx + dy * dy + dz * dz);
							if (moved > getVolumeReloadDistanceThreshold(activeRadius)) {
								queueVolumeReload();
							}
						}
					}
				},
			}
		: null;

	const starLayer = createStarFieldLayer({
		id: `website-hr-diagram-stars-${topicId}`,
		materialFactory: () =>
			createHighlightStarFieldMaterialProfile({
				exposure: 80,
			}),
		onCommit({ geometry, starCount }) {
			lastStarFieldGeometry = geometry;
			lastStarFieldCount = starCount;
			if (activeMode !== 1) {
				hrDiagram?.setGeometry(geometry);
				hrDiagram?.setStarCount(0);
			}
		},
	});

	async function createAndMountViewer() {
		if (viewer) {
			await viewer.dispose();
			viewer = null;
		}

		await datasetSession.ensureRenderRootShard();
		await datasetSession.ensureRenderBootstrap();

		cameraController = createCameraRigController({
			id: `website-hr-diagram-fly-${topicId}`,
			observerPc: SOLAR_ORIGIN_PC,
			lookAtPc: INNER_GALACTIC_PLANE_TARGET_PC,
			moveSpeed: 12,
			keyboardTarget: NO_KEYBOARD_EVENTS_TARGET,
		});

		viewer = await createViewer(mount, {
			datasetSession,
			interestField: createObserverShellField({
				id: `website-hr-diagram-field-${topicId}`,
				note: 'HR diagram topic observer-shell field.',
				motionAdaptiveMaxLevel: HR_TRANSIT_MOTION_ADAPTIVE_MAX_LEVEL,
			}),
			controllers: [
				cameraController,
				createSelectionRefreshController({
					id: `website-hr-diagram-refresh-${topicId}`,
					observerDistancePc: 12,
					minIntervalMs: 220,
					watchSize: false,
				}),
			],
			layers: [starLayer],
			overlays: hrOverlay ? [hrOverlay] : [],
			state: {
				observerPc: { ...SOLAR_ORIGIN_PC },
				targetPc: { ...INNER_GALACTIC_PLANE_TARGET_PC },
				fieldStrategy: 'observer-shell',
				mDesired: activeMagLimit,
				starFieldExposure: 80,
				...highlightState,
			},
			clearColor: 0x02040b,
		});

		volumeLoader = createVolumeHRLoader({ datasetSession });
	}

	function updateMagUi() {
		if (magInput) magInput.value = String(activeMagLimit);
		if (magValue) magValue.textContent = activeMagLimit.toFixed(1);
		hrDiagram?.setAppMagLimit(activeMagLimit);
	}

	function updateRadiusUi() {
		if (radiusInput) radiusInput.value = String(activeRadius);
		if (radiusValue) radiusValue.textContent = `${activeRadius} pc`;
		hrDiagram?.setVolumeRadiusPc(activeRadius);
	}

	function lookAtPc(targetPc, options = {}) {
		const target = normalizePoint(targetPc, null);
		if (!target) {
			return null;
		}

		const blend = Number.isFinite(options.blend) ? options.blend : 0.16;
		cameraController?.cancelOrientation?.();
		cameraController?.lookAt?.(target, { blend });
		viewer?.setState?.({ targetPc: target });
		return target;
	}

	function normalizePointList(points = []) {
		const normalizedPoints = [];
		for (const point of points) {
			const normalizedPoint = normalizePoint(point, null);
			if (!normalizedPoint) {
				continue;
			}
			if (
				normalizedPoints.length > 0
				&& pointDistance(normalizedPoints[normalizedPoints.length - 1], normalizedPoint) < 1e-9
			) {
				continue;
			}
			normalizedPoints.push(normalizedPoint);
		}
		return normalizedPoints;
	}

	function buildSceneTravelRoute(
		scene = {},
		{
			startObserverPc = null,
			prependStartObserver = scene.prependStartObserverToTravelPath !== false,
		} = {},
	) {
		const normalizedStartPc = normalizePoint(startObserverPc, null) ?? getCurrentObserverPc();
		let routeSpec = null;

		if (typeof scene.travelPathBuilder === 'function') {
			routeSpec = scene.travelPathBuilder({
				scene,
				startObserverPc: normalizedStartPc,
			});
		} else if (Array.isArray(scene.travelPathPc)) {
			routeSpec = {
				points: scene.travelPathPc,
				arrivalAction: scene.travelPathArrivalAction,
			};
		}

		if (!routeSpec) {
			return null;
		}

		const points = normalizePointList(
			Array.isArray(routeSpec) ? routeSpec : routeSpec.points,
		);
		if (points.length < 2) {
			return null;
		}

		if (
			prependStartObserver
			&& normalizedStartPc
			&& pointDistance(points[0], normalizedStartPc) > 1e-6
		) {
			points.unshift(normalizedStartPc);
		}

		return {
			points,
			polylineRoute: buildPolylineRoute(points),
			arrivalAction:
				routeSpec.arrivalAction && typeof routeSpec.arrivalAction === 'object'
					? routeSpec.arrivalAction
					: null,
		};
	}

	function resolveSceneTravelTimeSecs(scene = {}, { startObserverPc = null, travelRoute = null } = {}) {
		if (typeof scene.travelTimeSecsBuilder === 'function') {
			const value = scene.travelTimeSecsBuilder({
				scene,
				startObserverPc: normalizePoint(startObserverPc, null) ?? getCurrentObserverPc(),
				travelRoute,
			});
			return Number.isFinite(value) ? Number(value) : null;
		}

		return Number.isFinite(scene.travelTimeSecs) ? Number(scene.travelTimeSecs) : null;
	}

	function startTravelRadiusAnimation(radiusProfile, {
		durationSecs = null,
		finalRadiusPc = null,
	} = {}) {
		if (
			!Array.isArray(radiusProfile)
			|| radiusProfile.length < 2
			|| !Number.isFinite(durationSecs)
			|| !(durationSecs > 0)
		) {
			activeTravelRadiusAnimation = null;
			return false;
		}

		const startRadiusPc = radiusProfile[0]?.radiusPc ?? null;
		const endRadiusPc = radiusProfile[radiusProfile.length - 1]?.radiusPc ?? finalRadiusPc ?? null;
		if (
			!Number.isFinite(startRadiusPc)
			|| !Number.isFinite(endRadiusPc)
			|| Math.abs(startRadiusPc - endRadiusPc) < 1e-6
		) {
			activeTravelRadiusAnimation = null;
			return false;
		}

		activeTravelRadiusAnimation = {
			radiusProfile,
			durationSecs,
			elapsedSecs: 0,
			finalRadiusPc: Number.isFinite(finalRadiusPc) ? finalRadiusPc : endRadiusPc,
			lastRequestedRadiusPc: quantizeRadius(startRadiusPc),
		};
		return true;
	}

	function stopTravelRadiusAnimation({ finalRadiusPc = null, forceReload = false } = {}) {
		activeTravelRadiusAnimation = null;
		if (Number.isFinite(finalRadiusPc) && Math.abs(activeRadius - finalRadiusPc) > 1e-6) {
			activeRadius = finalRadiusPc;
			updateRadiusUi();
			if (forceReload && activeMode === 1) {
				queueVolumeReload({ force: true });
			}
		}
	}

	function updateTravelRadiusAnimation(deltaSeconds = 0) {
		if (!activeTravelRadiusAnimation || !(deltaSeconds > 0)) {
			return;
		}

		const animation = activeTravelRadiusAnimation;
		animation.elapsedSecs = Math.min(animation.elapsedSecs + deltaSeconds, animation.durationSecs);
		const progress = animation.durationSecs > 0
			? animation.elapsedSecs / animation.durationSecs
			: 1;
		const nextRadiusPc = sampleTravelRadiusProfile(animation.radiusProfile, progress);
		if (Number.isFinite(nextRadiusPc) && Math.abs(activeRadius - nextRadiusPc) > 1e-6) {
			activeRadius = nextRadiusPc;
			updateRadiusUi();
		}

		const quantizedRadiusPc = quantizeRadius(nextRadiusPc);
		if (
			activeMode === 1
			&& Number.isFinite(quantizedRadiusPc)
			&& quantizedRadiusPc !== animation.lastRequestedRadiusPc
		) {
			animation.lastRequestedRadiusPc = quantizedRadiusPc;
			queueVolumeReload();
		}
	}

	function buildSceneVolumePreloadRequests(scene = {}, { anchorObserverPc = null } = {}) {
		if (!volumeLoader) {
			return [];
		}

		const sceneMode = Number.isFinite(scene.mode) ? Number(scene.mode) : activeMode;
		if (sceneMode !== 1) {
			return [];
		}

		const normalizedAnchorPc =
			normalizePoint(anchorObserverPc, null)
			?? normalizePoint(scene.preloadAnchorObserverPc, null)
			?? getCurrentObserverPc();
		const sceneTravelRoute = buildSceneTravelRoute(scene, {
			startObserverPc: normalizedAnchorPc,
		});
		const orbitCenterPc = normalizePoint(scene.orbitCenter, null);
		const nextObserverPc = normalizePoint(scene.observerPc, null);
		const nextTargetPc = normalizePoint(scene.targetPc, null);
		const finalRadiusPc = Number.isFinite(scene.radius) ? Number(scene.radius) : activeRadius;
		const travelStartRadiusPc =
			Number.isFinite(scene.travelStartRadiusPc) ? Number(scene.travelStartRadiusPc)
				: Number.isFinite(scene.travelRadiusPc) ? Number(scene.travelRadiusPc)
					: finalRadiusPc;
		const travelRadiusProfile = resolveSceneTravelRadiusProfile(scene, {
			defaultStartRadiusPc: travelStartRadiusPc,
			defaultEndRadiusPc: finalRadiusPc,
		});
		const requests = [];

		if (
			sceneTravelRoute
			&& scene.preloadTravelPath !== false
			&& volumeLoader.preloadPath
		) {
			requests.push(...buildProfiledPathPreloadRequests(
				sceneTravelRoute.polylineRoute,
				travelRadiusProfile,
				{
					defaultRadiusPc: quantizeRadius(travelStartRadiusPc + PRELOAD_RADIUS_PADDING_PC),
				},
			));
		}

		if (requests.length === 0 && volumeLoader.preloadVolume) {
			const preloadCenterPc =
				normalizePoint(scene.preloadVolumeCenterPc, null)
				?? nextObserverPc
				?? orbitCenterPc
				?? nextTargetPc;
			const orbitCoverageRadiusPc =
				orbitCenterPc && Number.isFinite(scene.orbitRadius) ? Number(scene.orbitRadius) : 0;
			const preloadRadiusPc = quantizeRadius(
				finalRadiusPc + orbitCoverageRadiusPc + PRELOAD_RADIUS_PADDING_PC,
			);
			if (
				preloadCenterPc
				&& Number.isFinite(preloadRadiusPc)
				&& preloadRadiusPc > 0
			) {
				requests.push({
					type: 'volume',
					observerPc: preloadCenterPc,
					maxRadiusPc: preloadRadiusPc,
				});
			}
		}

		return requests.filter((request) => Number.isFinite(request.maxRadiusPc) && request.maxRadiusPc > 0);
	}

	function preloadScene(scene = {}, { anchorObserverPc = null } = {}) {
		const requests = buildSceneVolumePreloadRequests(scene, { anchorObserverPc });
		if (requests.length === 0) {
			return Promise.resolve(null);
		}

		return Promise.all(requests.map((request) => {
			const requestKey = request.type === 'path'
				? `path:${request.maxRadiusPc}:${request.points.map(serializePoint).join('>')}`
				: `volume:${request.maxRadiusPc}:${serializePoint(request.observerPc)}`;
			if (completedScenePreloadRequests.has(requestKey)) {
				return Promise.resolve(null);
			}
			if (scenePreloadPromises.has(requestKey)) {
				console.info('[website:hr-diagram-viewer] preload already running', describePreloadRequest(request));
				return scenePreloadPromises.get(requestKey);
			}

			console.info('[website:hr-diagram-viewer] preload started', describePreloadRequest(request));
			const preloadPromise = (
				request.type === 'path'
					? volumeLoader.preloadPath(request)
					: volumeLoader.preloadVolume(request)
			)
				.catch((error) => {
					scenePreloadPromises.delete(requestKey);
					console.error('[website:hr-diagram-viewer] preload failed', {
						...describePreloadRequest(request),
						error,
					});
					throw error;
				})
				.then((result) => {
					scenePreloadPromises.delete(requestKey);
					completedScenePreloadRequests.add(requestKey);
					console.info('[website:hr-diagram-viewer] preload finished', {
						...describePreloadRequest(request),
						nodeCount: result?.nodeCount ?? 0,
						decodedStarCount: result?.decodedStarCount ?? 0,
					});
					return result;
				});

			scenePreloadPromises.set(requestKey, preloadPromise);
			return preloadPromise;
		}));
	}

	function scheduleIdlePreloadTask(task, {
		timeoutMs = 2_000,
		useIdleCallback = true,
	} = {}) {
		return new Promise((resolve, reject) => {
			const runTask = () => {
				Promise.resolve()
					.then(task)
					.then(resolve)
					.catch(reject);
			};

			if (useIdleCallback && typeof window.requestIdleCallback === 'function') {
				const idleHandle = window.requestIdleCallback(() => {
					scheduledScenePreloadIdleCallbacks.delete(idleHandle);
					runTask();
				}, { timeout: timeoutMs });
				scheduledScenePreloadIdleCallbacks.add(idleHandle);
				return;
			}

			const timeoutHandle = window.setTimeout(() => {
				scheduledScenePreloadTimeouts.delete(timeoutHandle);
				runTask();
			}, 0);
			scheduledScenePreloadTimeouts.add(timeoutHandle);
		});
	}

	function pumpScenePreloadQueue() {
		if (preloadQueueBusy || queuedScenePreloadTasks.length === 0) {
			return;
		}

		preloadQueueBusy = true;
		const nextTask = queuedScenePreloadTasks.shift();
		scheduleIdlePreloadTask(nextTask.task, {
			timeoutMs: nextTask.timeoutMs,
			useIdleCallback: nextTask.useIdleCallback,
		})
			.then(nextTask.resolve)
			.catch(nextTask.reject)
			.finally(() => {
				preloadQueueBusy = false;
				if (queuedScenePreloadTasks.length > 0) {
					const timeoutHandle = window.setTimeout(() => {
						scheduledScenePreloadTimeouts.delete(timeoutHandle);
						pumpScenePreloadQueue();
					}, 32);
					scheduledScenePreloadTimeouts.add(timeoutHandle);
				}
			});
	}

	function queueScenePreloadTask(task, options = {}) {
		return new Promise((resolve, reject) => {
			queuedScenePreloadTasks.push({
				task,
				resolve,
				reject,
				timeoutMs: Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 2_000,
				useIdleCallback: options.useIdleCallback !== false,
			});
			pumpScenePreloadQueue();
		});
	}

	function scheduleScenePreload(
		scene = {},
		{
			anchorObserverPc = null,
			delayMs = 0,
			timeoutMs = 2_000,
			useIdleCallback = true,
		} = {},
	) {
		const startPreload = () =>
			queueScenePreloadTask(
				() => preloadScene(scene, { anchorObserverPc }),
				{ timeoutMs, useIdleCallback },
			).catch((error) => {
				console.error('[website:hr-diagram-viewer] scene preload failed', error);
				return null;
			});

		if (Number.isFinite(delayMs) && delayMs > 0) {
			return new Promise((resolve) => {
				const timeoutHandle = window.setTimeout(() => {
					scheduledScenePreloadTimeouts.delete(timeoutHandle);
					startPreload().then(resolve);
				}, delayMs);
				scheduledScenePreloadTimeouts.add(timeoutHandle);
			});
		}

		return startPreload();
	}

	function scheduleScenePreloadBatch(
		scenes = [],
		{
			delayMs = 0,
			staggerMs = 0,
			timeoutMs = 2_000,
			useIdleCallback = true,
			anchorObserverPcBuilder = null,
		} = {},
	) {
		const sceneList = Array.isArray(scenes) ? scenes : [];
		return Promise.allSettled(sceneList.map((scene, index) =>
			scheduleScenePreload(scene, {
				anchorObserverPc:
					typeof anchorObserverPcBuilder === 'function'
						? anchorObserverPcBuilder(scene, index)
						: null,
				delayMs: delayMs + (Math.max(0, Number(staggerMs) || 0) * index),
				timeoutMs,
				useIdleCallback,
			})));
	}

	async function applyScene(scene = {}) {
		const previousMode = activeMode;
		const currentObserverPc = getCurrentObserverPc();
		const nextObserverPc = normalizePoint(scene.observerPc, null);
		const nextTargetPc = normalizePoint(scene.targetPc, null);
		const orbitCenterPc = normalizePoint(scene.orbitCenter, null);
		const nextMode = Number.isFinite(scene.mode) ? Number(scene.mode) : null;
		const nextMagLimit = Number.isFinite(scene.magLimit) ? Number(scene.magLimit) : null;
		const nextRadius = Number.isFinite(scene.radius) ? Number(scene.radius) : null;
		const travelRoute = buildSceneTravelRoute(scene, { startObserverPc: currentObserverPc });
		const travelTimeSecs = resolveSceneTravelTimeSecs(scene, {
			startObserverPc: currentObserverPc,
			travelRoute,
		});
		const resolvedMode = nextMode !== null ? nextMode : activeMode;
		const shouldFollowPath = Boolean(travelRoute && travelRoute.points.length >= 2);
		const shouldOrbit = !shouldFollowPath && Boolean(orbitCenterPc);
		const shouldFly = !shouldFollowPath && !shouldOrbit && nextObserverPc && (
			Number.isFinite(scene.flySpeed)
			|| travelTimeSecs !== null
		);
		const shouldMove = shouldFollowPath || shouldFly || shouldOrbit;
		const travelStartRadiusPc =
			Number.isFinite(scene.travelStartRadiusPc) ? Number(scene.travelStartRadiusPc)
				: Number.isFinite(scene.travelRadiusPc) ? Number(scene.travelRadiusPc)
					: (nextRadius ?? activeRadius);
		const travelRadiusProfile = resolveSceneTravelRadiusProfile(scene, {
			defaultStartRadiusPc: travelStartRadiusPc,
			defaultEndRadiusPc: nextRadius ?? activeRadius,
		});
		const initialTravelRadiusPc = travelRadiusProfile[0]?.radiusPc ?? travelStartRadiusPc;
		const finalTravelRadiusPc =
			travelRadiusProfile[travelRadiusProfile.length - 1]?.radiusPc ?? nextRadius ?? initialTravelRadiusPc;
		const appliedSceneRadius = shouldMove ? initialTravelRadiusPc : nextRadius;
		const nextVolumeRenderStrategy =
			resolvedMode === 1
				? normalizeVolumeRenderStrategy(scene.volumeRenderStrategy)
				: activeVolumeRenderStrategy;
		const shouldAnimateTravelRadius =
			resolvedMode === 1
			&& shouldMove
			&& Number.isFinite(travelTimeSecs)
			&& travelRadiusProfile.length > 1
			&& Number.isFinite(initialTravelRadiusPc)
			&& Number.isFinite(finalTravelRadiusPc)
			&& Math.abs(initialTravelRadiusPc - finalTravelRadiusPc) > 1e-6;

		function afterMotion() {
			stopTravelRadiusAnimation({
				finalRadiusPc: activeMode === 1 ? (nextRadius ?? finalTravelRadiusPc) : null,
				forceReload: activeMode === 1,
			});

			refreshSelection().catch((error) => {
				console.error('[website:hr-diagram-viewer] motion refresh failed', error);
			});

			if (activeMode === 1) {
				loadVolumeHR({ force: true }).catch((error) => {
					console.error('[website:hr-diagram-viewer] motion volume refresh failed', error);
				});
			} else {
				syncHrFromStarField();
			}
		}

		stopTravelRadiusAnimation();

		if (nextMode !== null) {
			setActiveMode(nextMode);
		}

		if (nextMagLimit !== null) {
			activeMagLimit = nextMagLimit;
			updateMagUi();
		}

		if (appliedSceneRadius !== null) {
			activeRadius = appliedSceneRadius;
			updateRadiusUi();
		}

		if (resolvedMode === 1) {
			activeVolumeRenderStrategy = nextVolumeRenderStrategy;
			volumeSceneEpoch += 1;
			volumeReloadPending = false;
			pendingVolumeForce = false;
		}

		if (shouldAnimateTravelRadius) {
			startTravelRadiusAnimation(travelRadiusProfile, {
				durationSecs: travelTimeSecs,
				finalRadiusPc: nextRadius ?? finalTravelRadiusPc,
			});
		}

		const stateUpdate = {};
		if (nextObserverPc && !shouldFollowPath && !shouldFly) {
			stateUpdate.observerPc = nextObserverPc;
			lastObserverPc = { ...nextObserverPc };
		}
		if (nextTargetPc) {
			stateUpdate.targetPc = nextTargetPc;
		}
		if (nextMagLimit !== null) {
			stateUpdate.mDesired = activeMagLimit;
		}

		if (viewer && Object.keys(stateUpdate).length > 0) {
			viewer.setState(stateUpdate);
		}

		if (activeMode === 1 && activeVolumeRenderStrategy === 'strict' && previousMode !== 1) {
			const volumeObserverPc = nextObserverPc ?? getCurrentObserverPc();
			syncHrFromCachedVolume(volumeObserverPc, { allowEmpty: true });
		}

		cameraController?.cancelAutomation?.();

		if (shouldFollowPath && travelRoute) {
			const lockTarget = nextTargetPc ?? orbitCenterPc;
			if (lockTarget) {
				viewer?.setState?.({ targetPc: lockTarget });
				cameraController?.lockAt?.(lockTarget, {
					dwellMs: Number.isFinite(scene.dwellMs) ? scene.dwellMs : 5_000,
					recenterSpeed: Number.isFinite(scene.recenterSpeed) ? scene.recenterSpeed : 0.06,
				});
			}
			cameraController?.flyPolyline?.(travelRoute.points, {
				...(Number.isFinite(scene.flySpeed) ? { speed: scene.flySpeed } : {}),
				...(travelTimeSecs !== null ? { durationSecs: travelTimeSecs } : {}),
				deceleration: Number.isFinite(scene.deceleration) ? scene.deceleration : 2.5,
				arrivalThreshold: Number.isFinite(scene.arrivalThreshold) ? scene.arrivalThreshold : 0.05,
				arrivalAction: travelRoute.arrivalAction,
				onArrive: afterMotion,
			});
			lastObserverPc = { ...currentObserverPc };
		} else if (shouldOrbit && orbitCenterPc) {
			const lockTarget = nextTargetPc ?? orbitCenterPc;
			if (lockTarget) {
				viewer?.setState?.({ targetPc: lockTarget });
				cameraController?.lockAt?.(lockTarget, {
					dwellMs: Number.isFinite(scene.dwellMs) ? scene.dwellMs : 5_000,
					recenterSpeed: Number.isFinite(scene.recenterSpeed) ? scene.recenterSpeed : 0.06,
				});
			}
			cameraController?.orbitalInsert?.(orbitCenterPc, {
				orbitRadius: Number.isFinite(scene.orbitRadius) ? scene.orbitRadius : 8,
				angularSpeed: Number.isFinite(scene.angularSpeed) ? scene.angularSpeed : 0.16,
				...(travelTimeSecs !== null
					? { durationSecs: travelTimeSecs }
					: { approachSpeed: Number.isFinite(scene.flySpeed) ? scene.flySpeed : 120 }),
				deceleration: Number.isFinite(scene.deceleration) ? scene.deceleration : 2.5,
				onInserted: afterMotion,
			});
		} else if (shouldFly && nextObserverPc) {
			if (nextTargetPc) {
				viewer?.setState?.({ targetPc: nextTargetPc });
				cameraController?.lockAt?.(nextTargetPc, {
					dwellMs: Number.isFinite(scene.dwellMs) ? scene.dwellMs : 4_000,
					recenterSpeed: Number.isFinite(scene.recenterSpeed) ? scene.recenterSpeed : 0.05,
				});
			}
			cameraController?.flyTo?.(nextObserverPc, {
				...(Number.isFinite(scene.flySpeed) ? { speed: scene.flySpeed } : {}),
				...(travelTimeSecs !== null ? { durationSecs: travelTimeSecs } : {}),
				deceleration: Number.isFinite(scene.deceleration) ? scene.deceleration : 2.2,
				arrivalThreshold: Number.isFinite(scene.arrivalThreshold) ? scene.arrivalThreshold : 0.05,
				onArrive: afterMotion,
			});
			lastObserverPc = { ...nextObserverPc };
		} else if (nextTargetPc) {
			stopTravelRadiusAnimation({
				finalRadiusPc: activeMode === 1 ? (nextRadius ?? finalTravelRadiusPc) : null,
			});
			lookAtPc(nextTargetPc, scene);
		}

		if (!shouldMove && viewer && (nextObserverPc || nextMagLimit !== null)) {
			await refreshSelection();
		}

		if (!shouldMove && activeMode === 1) {
			await loadVolumeHR();
		} else if (!shouldMove) {
			syncHrFromStarField();
		}

		return getState();
	}

	function getState() {
		const snapshot = viewer?.getSnapshotState?.()?.state ?? {};
		return {
			mode: activeMode,
			magLimit: activeMagLimit,
			radius: activeRadius,
			observerPc: snapshot.observerPc ?? { ...SOLAR_ORIGIN_PC },
			targetPc: snapshot.targetPc ?? { ...INNER_GALACTIC_PLANE_TARGET_PC },
		};
	}

	function getCurrentAimDebugInfo() {
		const motion = cameraController?.getStats?.()?.motion;
		const observerPc = getCurrentObserverPc();
		const forwardIcrs = normalizePoint(motion?.forwardIcrs, null);
		if (!forwardIcrs) {
			return null;
		}

		const icrsRaDec = toRaDec([forwardIcrs.x, forwardIcrs.y, forwardIcrs.z]);
		const galacticDirection = icrsDirectionToGalacticDirection(forwardIcrs);
		const galacticRaDec = galacticDirection
			? toRaDec([galacticDirection.x, galacticDirection.y, galacticDirection.z])
			: null;

		return {
			observerPc,
			forwardIcrs,
			raDeg: icrsRaDec?.raDeg ?? null,
			raHours: icrsRaDec?.raHours ?? null,
			decDeg: icrsRaDec?.decDeg ?? null,
			galacticLonDeg: galacticRaDec?.raDeg ?? null,
			galacticLatDeg: galacticRaDec?.decDeg ?? null,
		};
	}

	function logCurrentAimDebug(label = 'Current aim') {
		const info = getCurrentAimDebugInfo();
		if (!info) {
			console.warn('[website:hr-diagram-viewer] no aim direction available yet');
			return null;
		}

		const payload = {
			observerPc: {
				x: formatFixedCoordinate(info.observerPc?.x),
				y: formatFixedCoordinate(info.observerPc?.y),
				z: formatFixedCoordinate(info.observerPc?.z),
			},
			icrs: {
				raDeg: formatFixedCoordinate(info.raDeg),
				raHms: formatHours(info.raHours),
				decDeg: formatFixedCoordinate(info.decDeg),
				decDms: formatDegrees(info.decDeg),
				direction: {
					x: formatFixedCoordinate(info.forwardIcrs.x),
					y: formatFixedCoordinate(info.forwardIcrs.y),
					z: formatFixedCoordinate(info.forwardIcrs.z),
				},
			},
			galactic: {
				lDeg: formatFixedCoordinate(info.galacticLonDeg),
				bDeg: formatFixedCoordinate(info.galacticLatDeg),
			},
		};
		console.info(`[website:hr-diagram-viewer] ${label}`, payload);
		return info;
	}

	function bindDirectionDebug() {
		if (directionDebugPointerBound) {
			return;
		}
		directionDebugPointerBound = true;

		const logPointerAim = () => {
			window.requestAnimationFrame(() => {
				logCurrentAimDebug('Pointer release aim');
			});
		};

		mount.addEventListener('pointerup', logPointerAim);
		mount.addEventListener('pointercancel', logPointerAim);
		root.__hrDiagramDirectionDebugCleanup = () => {
			mount.removeEventListener('pointerup', logPointerAim);
			mount.removeEventListener('pointercancel', logPointerAim);
			directionDebugPointerBound = false;
			delete root.__hrDiagramDirectionDebugCleanup;
		};
	}

	function onResize() {
		hrDiagram?.resize();
	}

	async function destroy() {
		volumeLoader?.cancel();
		activeTravelRadiusAnimation = null;
		queuedScenePreloadTasks.length = 0;
		for (const timeoutHandle of scheduledScenePreloadTimeouts) {
			window.clearTimeout(timeoutHandle);
		}
		scheduledScenePreloadTimeouts.clear();
		if (typeof window.cancelIdleCallback === 'function') {
			for (const idleHandle of scheduledScenePreloadIdleCallbacks) {
				window.cancelIdleCallback(idleHandle);
			}
		}
		scheduledScenePreloadIdleCallbacks.clear();
		emptyHrGeometry.dispose();
		root.__hrDiagramDirectionDebugCleanup?.();
		if (window.hrDiagramDebug?.root === root) {
			delete window.hrDiagramDebug;
		}
		window.removeEventListener('resize', onResize);
		window.removeEventListener('beforeunload', destroy);
		await viewer?.dispose?.();
	}

	modeButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			const mode = Number(btn.dataset.hrMode);
			applyScene({ mode }).catch((err) =>
				console.error('[website:hr-diagram-viewer] mode change failed', err),
			);
		});
	});

	magInput?.addEventListener('input', () => {
		activeMagLimit = Number(magInput.value) || DEFAULT_HR_MAG_LIMIT;
		updateMagUi();
	});

	magInput?.addEventListener('change', () => {
		const magLimit = Number(magInput.value) || DEFAULT_HR_MAG_LIMIT;
		applyScene({ magLimit }).catch((err) =>
			console.error('[website:hr-diagram-viewer] mag refresh failed', err),
		);
	});

	radiusInput?.addEventListener('input', () => {
		activeRadius = Number(radiusInput.value) || DEFAULT_HR_VOLUME_RADIUS;
		updateRadiusUi();
	});

	radiusInput?.addEventListener('change', () => {
		const radius = Number(radiusInput.value) || DEFAULT_HR_VOLUME_RADIUS;
		applyScene({ radius }).catch((err) =>
			console.error('[website:hr-diagram-viewer] radius refresh failed', err),
		);
	});

	setActiveMode(activeMode);
	updateMagUi();
	updateRadiusUi();
	await createAndMountViewer();
	bindDirectionDebug();
	window.hrDiagramDebug = {
		root,
		getState,
		getCurrentAimDebugInfo,
		logCurrentAimDebug,
		lookAtPc,
		applyScene,
		preloadScene,
	};
	window.addEventListener('resize', onResize);
	window.addEventListener('beforeunload', destroy);

	return {
		applyScene,
		destroy,
		getState,
		lookAtPc,
		preloadScene,
		scheduleScenePreload,
		scheduleScenePreloadBatch,
		viewer,
	};
}
