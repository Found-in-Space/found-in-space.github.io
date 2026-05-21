import * as THREE from 'three';
import { createJourney } from '@found-in-space/journey';
import {
	SKYKIT_ACTIONS,
	createSkyGrabPlugin,
	createSkykitAnimationLoop,
	createSkykitDebugBridge,
	createSkykitHrDiagramPlugin,
	createSkykitJourneyPlugin,
	createSkykitNavigationPlugin,
	createSkykitStarPreloadRequestsFromSpatialHints,
	createSkykitStarSourcePlugin,
	createSkykitViewer,
	createStreamingStarsPlugin,
	installSkykitDebugGlobal,
} from '@found-in-space/skykit';
import { createTouchOsHudPlugin } from '@found-in-space/skykit/touch-os';
import {
	createColumn,
	createDockLayout,
	createEmbeddedSurfaceService,
} from '@found-in-space/touch-os';
import {
	OCTREE_DEFAULT,
	createStarOctreeProviderService,
} from '@found-in-space/star-octree-provider';
import { computeSpatialLookAtOrientation, createOrbitTransferRoute } from '@found-in-space/spatial';
import { buildTravelVolumeRequests } from '@found-in-space/star-trees';
import { createThreeStarField } from '@found-in-space/three-star-field';

export const DEFAULT_HR_MAG_LIMIT = 6.5;
export const DEFAULT_HR_VOLUME_RADIUS = 25;
export const INNER_GALACTIC_PLANE_TARGET_PC = Object.freeze({
	x: -446.986,
	y: -7138.118,
	z: -3965.748,
});

const SOLAR_ORIGIN_PC = Object.freeze({ x: 0, y: 0, z: 0 });
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
const IDENTITY_ORIENTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const UNITS_PER_PARSEC = 0.001;
const VERTICAL_FOV_DEG = 58;
const MAX_DEVICE_PIXEL_RATIO = 2;
const STAR_ATTRIBUTES = Object.freeze(['position', 'magAbs', 'teffLog8']);
const HR_TEXTURE_WIDTH = 512;
const HR_TEXTURE_HEIGHT = 360;
const HUD_MOBILE_BREAKPOINT_PX = 720;
const TRANSITION_LOOK_SECS = 2.25;

const OFFSET_SAMPLE_PC = Object.freeze({ x: 200, y: 0, z: 0 });
const DEFAULT_ORBIT_NORMAL = ICRS_NORTH;
const LESSON_VOLUME_RADIUS_PC = DEFAULT_HR_VOLUME_RADIUS;
const OMEGA_CEN_VOLUME_RADIUS_PC = 100;
const NGC_752_ORBIT_RADIUS_PC = 10;
const NGC_752_ANGULAR_SPEED_RAD_PER_SEC = 0.22;
const OMEGA_CEN_ORBIT_RADIUS_PC = 60;
const OMEGA_CEN_ANGULAR_SPEED_RAD_PER_SEC = 0.08;
const OMEGA_CEN_TRAVEL_SECS = 15;
const OMEGA_CEN_PRELOAD_PADDING_PC = 4;
const OMEGA_CEN_PRELOAD_QUANTIZE_STEP_PC = 5;
const PLEIADES_CENTER_PC = Object.freeze({ x: 67.379, y: 103.162, z: 55.161 });
const NGC_752_CENTER_PC = Object.freeze({ x: 303.7, y: 167.0, z: 269.3 });
const OMEGA_CEN_CENTER_PC = Object.freeze({ x: -3290.566, y: -1309.263, z: -3862.073 });
const ARCTURUS_PC = Object.freeze({ x: -8.8, y: -5.9, z: 3.7 });
const ACRUX_PC = Object.freeze({ x: -44.4, y: -5.2, z: -88.0 });
const OMEGA_CEN_ORBIT_NORMAL = Object.freeze({ x: 0, y: 1, z: 0 });

const HR_MODE_TO_LESSON_MODE = Object.freeze({
	'magnitude-limited': 0,
	'volume-complete': 1,
	frustum: 2,
});

const OMEGA_CEN_TRAVEL_RADIUS_PROFILE = Object.freeze([
	Object.freeze({ progress: 0, radiusPc: LESSON_VOLUME_RADIUS_PC }),
	Object.freeze({ progress: 0.55, radiusPc: LESSON_VOLUME_RADIUS_PC }),
	Object.freeze({ progress: 0.72, radiusPc: 40 }),
	Object.freeze({ progress: 0.84, radiusPc: 60 }),
	Object.freeze({ progress: 0.93, radiusPc: 80 }),
	Object.freeze({ progress: 1, radiusPc: OMEGA_CEN_VOLUME_RADIUS_PC }),
]);

const OMEGA_CEN_PRELOAD_HINTS = Object.freeze(createOmegaCenPreloadHints());

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

const HR_JOURNEY = createJourney({
	initial: 'all-stars',
	order: [
		'all-stars',
		'inner-plane',
		'out-of-plane',
		'local-volume',
		'away-volume',
		'pleiades',
		'ngc-752',
		'omega-cen',
	],
	scenes: {
		'all-stars': createLookScene({
			targetPc: INNER_GALACTIC_PLANE_TARGET_PC,
			hr: {
				mode: 'magnitude-limited',
				limitingMagnitude: DEFAULT_HR_MAG_LIMIT,
			},
		}),
		'inner-plane': createLookScene({
			targetPc: ACRUX_PC,
			hr: {
				mode: 'frustum',
				limitingMagnitude: DEFAULT_HR_MAG_LIMIT,
			},
		}),
		'out-of-plane': createLookScene({
			targetPc: ARCTURUS_PC,
			hr: {
				mode: 'frustum',
				limitingMagnitude: DEFAULT_HR_MAG_LIMIT,
			},
		}),
		'local-volume': createLookScene({
			targetPc: ARCTURUS_PC,
			hr: {
				mode: 'volume-complete',
				volumeRadiusPc: LESSON_VOLUME_RADIUS_PC,
			},
		}),
		'away-volume': createLookScene({
			observerPc: OFFSET_SAMPLE_PC,
			targetPc: SOLAR_ORIGIN_PC,
			durationSecs: 4,
			hr: {
				mode: 'volume-complete',
				volumeRadiusPc: LESSON_VOLUME_RADIUS_PC,
			},
		}),
		pleiades: createOrbitScene({
			center: PLEIADES_CENTER_PC,
			radiusPc: 10,
			angularSpeedRadPerSec: 0.22,
			normal: DEFAULT_ORBIT_NORMAL,
			travelDurationSecs: 5,
			hr: {
				mode: 'volume-complete',
				volumeRadiusPc: LESSON_VOLUME_RADIUS_PC,
			},
		}),
		'ngc-752': createOrbitScene({
			center: NGC_752_CENTER_PC,
			radiusPc: NGC_752_ORBIT_RADIUS_PC,
			angularSpeedRadPerSec: NGC_752_ANGULAR_SPEED_RAD_PER_SEC,
			normal: DEFAULT_ORBIT_NORMAL,
			travelDurationSecs: 5,
			preloadHints: OMEGA_CEN_PRELOAD_HINTS,
			hr: {
				mode: 'volume-complete',
				volumeRadiusPc: LESSON_VOLUME_RADIUS_PC,
			},
		}),
		'omega-cen': createOrbitScene({
			center: OMEGA_CEN_CENTER_PC,
			radiusPc: OMEGA_CEN_ORBIT_RADIUS_PC,
			angularSpeedRadPerSec: OMEGA_CEN_ANGULAR_SPEED_RAD_PER_SEC,
			normal: OMEGA_CEN_ORBIT_NORMAL,
			travelDurationSecs: OMEGA_CEN_TRAVEL_SECS,
			dwellSecs: 6,
			hr: {
				mode: 'volume-complete',
				volumeRadiusPc: LESSON_VOLUME_RADIUS_PC,
				arrivalVolumeRadiusPc: OMEGA_CEN_VOLUME_RADIUS_PC,
			},
		}),
	},
	transitions: [
		{
			fromSceneId: 'ngc-752',
			toSceneId: 'omega-cen',
			preloadHints: OMEGA_CEN_PRELOAD_HINTS,
		},
	],
	travel: { type: 'orbit-transfer', durationSecs: 5, sampleStepSecs: 1 / 24 },
});

export async function mountHrDiagramViewer(root) {
	const mount = root.querySelector('[data-hr-diagram-viewer-shell]');
	if (!(mount instanceof HTMLElement)) {
		throw new Error('Missing [data-hr-diagram-viewer-shell] mount for HR diagram viewer.');
	}

	const topicId = root.dataset.topic || 'hr-diagram';
	const sessionId = root.dataset.datasetId || `website-learn-hr-diagram-${topicId}`;
	const octreeUrl = readDatasetString(root, 'octreeUrl') ?? OCTREE_DEFAULT;
	const initialScene = HR_JOURNEY.getScene(HR_JOURNEY.initialSceneId) ?? HR_JOURNEY.getScene('all-stars');
	const initialView = initialScene?.view ?? {};
	const initialAspectRatio = resolveAspectRatio(mount);
	const highlightRegion = buildHighlightRegion(root.dataset.highlight || '');
	const surfaces = createEmbeddedSurfaceService();
	const provider = createStarOctreeProviderService({
		url: octreeUrl,
		persistentCache: 'on',
	});
	const source = createSkykitStarSourcePlugin({
		id: `website-hr-diagram-source-${topicId}`,
		provider,
		session: { id: sessionId },
	});
	const starField = createThreeStarField({
		limitingMagnitude: DEFAULT_HR_MAG_LIMIT,
		exposure: 2500,
	});
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setClearColor(0x02040b, 1);
	const camera = new THREE.PerspectiveCamera(
		VERTICAL_FOV_DEG,
		initialAspectRatio,
		0.0001,
		10_000,
	);
	const debug = createSkykitDebugBridge();
	const uninstallDebugGlobal = installSkykitDebugGlobal(debug);
	let activeSceneId = HR_JOURNEY.initialSceneId;
	let activeMode = 'magnitude-limited';
	let activeMagLimit = DEFAULT_HR_MAG_LIMIT;
	let activeRadius = DEFAULT_HR_VOLUME_RADIUS;
	let disposed = false;
	let cachedHudRoot = null;
	let cachedHudRootKey = '';
	let viewer = null;
	let debugViewer = null;
	const pendingHrSceneStates = [];
	const completedPreloadKeys = new Set();
	const inFlightPreloads = new Map();
	const activePreloadControllers = new Map();
	let activePreloadKeys = new Set();
	let preloadQueue = Promise.resolve();

	const hr = createSkykitHrDiagramPlugin({
		id: `website-hr-diagram-${topicId}`,
		source,
		mode: activeMode,
		limitingMagnitude: activeMagLimit,
		volumeRadiusPc: activeRadius,
		highlightRegion,
		touchOs: {
			surfaces,
			width: HR_TEXTURE_WIDTH,
			height: HR_TEXTURE_HEIGHT,
		},
	});

	viewer = await createSkykitViewer({
		id: `website-hr-diagram-alpha-${topicId}`,
		host: mount,
		renderer,
		camera,
		view: {
			observerPc: initialView.observerPc ?? SOLAR_ORIGIN_PC,
			targetPc: initialView.targetPc ?? INNER_GALACTIC_PLANE_TARGET_PC,
			orientationIcrs: initialView.orientationIcrs
				?? computeLookAtOrientation(SOLAR_ORIGIN_PC, INNER_GALACTIC_PLANE_TARGET_PC),
			coordinateUnitsPerParsec: UNITS_PER_PARSEC,
			limitingMagnitude: activeMagLimit,
			verticalFovDeg: VERTICAL_FOV_DEG,
			aspectRatio: initialAspectRatio,
		},
		plugins: [
			createStreamingStarsPlugin({
				id: `website-hr-diagram-stars-${topicId}`,
				source,
				renderer: starField,
				attributes: STAR_ATTRIBUTES,
			}),
			hr,
			source,
			createSkykitNavigationPlugin({ speed: 600, acceleration: 240, deceleration: 180 }),
			createSkyGrabPlugin({
				target: mount,
				sensitivityRadiansPerPixel: 0.00075,
			}),
			createTouchOsHudPlugin({
				id: `website-hr-diagram-touch-hud-${topicId}`,
				target: mount,
				root: () => createHudRoot(hr, mount),
				runtimeOptions: { services: { surfaces } },
			}),
			createSkykitJourneyPlugin({
				id: `website-hr-diagram-journey-${topicId}`,
				journey: HR_JOURNEY,
				onScene(scene) {
					updateActivePreloadScope(scene?.preloadHints);
					activeSceneId = typeof scene?.sceneId === 'string' ? scene.sceneId : activeSceneId;
					void applyHrSceneState(scene?.hr, 'website.hrDiagram.scene');
				},
				onSceneArrive(scene) {
					const arrivalVolumeRadiusPc = positiveFiniteOrNull(scene?.hr?.arrivalVolumeRadiusPc);
					if (arrivalVolumeRadiusPc !== null) {
						void applyHrSceneState({
							volumeRadiusPc: arrivalVolumeRadiusPc,
						}, 'website.hrDiagram.arrival');
					}
				},
				onPreloadHints(hints) {
					queuePreloadHints(hints);
				},
			}),
		],
	});
	const loop = createSkykitAnimationLoop(viewer);

	debugViewer = debug.registerViewer(viewer, {
		id: 'website-hr-diagram',
		label: 'Website HR Diagram Lesson',
	});
	await flushPendingHrSceneStates();

	function createHudRoot(hrPlugin, host) {
		const isMobile = host.clientWidth > 0 && host.clientWidth <= HUD_MOBILE_BREAKPOINT_PX;
		const key = isMobile ? 'mobile' : 'desktop';
		if (cachedHudRoot && cachedHudRootKey === key) return cachedHudRoot;

		cachedHudRootKey = key;
		cachedHudRoot = createDockLayout('website-hr-diagram-hud-root', {
			padding: isMobile ? 10 : 18,
			bottomRight: {
				maxWidth: isMobile ? 310 : 430,
				maxHeight: isMobile ? 230 : 330,
				child: createColumn('website-hr-diagram-hud-panel', {
					gap: 8,
					padding: 8,
					backgroundColor: 'rgba(8, 15, 30, 0.76)',
					children: [hrPlugin.getNode()],
				}),
			},
		});
		return cachedHudRoot;
	}

	function resize() {
		const width = mount.clientWidth || 1;
		const height = mount.clientHeight || 1;
		const aspectRatio = width / height;
		camera.aspect = aspectRatio;
		camera.updateProjectionMatrix();
		viewer.resize({
			width,
			height,
			devicePixelRatio: Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO),
		});
		viewer.requestViewState({ aspectRatio }, 'website.hrDiagram.resize');
	}

	function goTo(sceneId) {
		if (!HR_JOURNEY.getScene(sceneId) || disposed) return Promise.resolve(null);
		return viewer.actions.invoke(SKYKIT_ACTIONS.journey.goToChapter, sceneId, {
			source: 'website.hrDiagram',
		});
	}

	function queuePreloadHints(hints) {
		const requests = createSkykitStarPreloadRequestsFromSpatialHints(hints);
		for (const request of requests) {
			activePreloadKeys.add(createPreloadRequestKey(request));
		}
		preloadQueue = preloadQueue
			.catch(() => null)
			.then(() => warmPreloadRequests(requests));
		void preloadQueue.catch((error) => {
			if (!isAbortError(error)) {
				console.error('[website:hr-diagram-preload]', error);
			}
		});
	}

	async function warmPreloadRequests(requests) {
		if (disposed) return;
		for (const request of requests) {
			const key = createPreloadRequestKey(request);
			if (disposed || !activePreloadKeys.has(key)) return;
			if (completedPreloadKeys.has(key)) continue;

			const existing = inFlightPreloads.get(key);
			if (existing) {
				await existing.promise.catch(() => null);
				if (completedPreloadKeys.has(key)) continue;
				if (!activePreloadKeys.has(key)) return;
			}

			const controller = new AbortController();
			activePreloadControllers.set(key, controller);
			const promise = provider.warmCells({
				sessionId,
				strategy: request.strategy,
				view: request.view,
				attributes: STAR_ATTRIBUTES,
				streaming: { emitCachedFirst: true },
				signal: controller.signal,
			})
				.then((result) => {
					if (!controller.signal.aborted && activePreloadKeys.has(key)) {
						completedPreloadKeys.add(key);
					}
					return result;
				})
				.catch((error) => {
					if (!isAbortError(error)) throw error;
					return null;
				})
				.finally(() => {
					if (activePreloadControllers.get(key) === controller) {
						activePreloadControllers.delete(key);
					}
					if (inFlightPreloads.get(key)?.promise === promise) {
						inFlightPreloads.delete(key);
					}
				});

			inFlightPreloads.set(key, { promise });
			await promise;
		}
	}

	function updateActivePreloadScope(hints) {
		const requests = createSkykitStarPreloadRequestsFromSpatialHints(hints ?? []);
		const nextKeys = new Set(requests.map(createPreloadRequestKey));
		activePreloadKeys = nextKeys;
		for (const [key, controller] of activePreloadControllers) {
			if (!nextKeys.has(key)) {
				controller.abort('scene-change');
				activePreloadControllers.delete(key);
			}
		}
	}

	async function applyHrSceneState(hrState, reason) {
		const state = hrState && typeof hrState === 'object' ? hrState : null;
		if (!state) return;
		if (!viewer) {
			pendingHrSceneStates.push({ hrState, reason });
			return;
		}

		const hrOptions = {};
		const mode = normalizeHrMode(state.mode);
		const limitingMagnitude = positiveFiniteOrNull(state.limitingMagnitude);
		const volumeRadiusPc = positiveFiniteOrNull(state.volumeRadiusPc);

		if (mode && mode !== activeMode) {
			activeMode = mode;
			hrOptions.mode = activeMode;
		}
		if (limitingMagnitude !== null) {
			activeMagLimit = limitingMagnitude;
			hrOptions.limitingMagnitude = activeMagLimit;
			viewer.requestViewState({ limitingMagnitude: activeMagLimit }, reason);
		}
		if (volumeRadiusPc !== null) {
			activeRadius = volumeRadiusPc;
			hrOptions.volumeRadiusPc = activeRadius;
		}
		if (Object.keys(hrOptions).length > 0) {
			await hr.setOptions(hrOptions);
		}
	}

	async function flushPendingHrSceneStates() {
		while (pendingHrSceneStates.length > 0) {
			const pending = pendingHrSceneStates.shift();
			await applyHrSceneState(pending.hrState, pending.reason);
		}
	}

	function getState() {
		const snapshot = viewer.getViewState();
		return {
			sceneId: activeSceneId,
			mode: activeMode,
			lessonMode: HR_MODE_TO_LESSON_MODE[activeMode] ?? null,
			magLimit: activeMagLimit,
			radius: activeRadius,
			observerPc: snapshot.observerPc ?? { ...SOLAR_ORIGIN_PC },
			targetPc: snapshot.targetPc ?? { ...INNER_GALACTIC_PLANE_TARGET_PC },
		};
	}

	async function destroy() {
		if (disposed) return;
		disposed = true;
		updateActivePreloadScope([]);
		window.removeEventListener('resize', resize);
		window.removeEventListener('beforeunload', destroy);
		loop.dispose();
		debugViewer?.unregister?.();
		uninstallDebugGlobal?.();
		await viewer.dispose().catch((error) => {
			console.error('[website:hr-diagram-cleanup]', error);
		});
		await Promise.resolve(provider.dispose?.()).catch((error) => {
			console.error('[website:hr-diagram-provider-cleanup]', error);
		});
	}

	window.addEventListener('resize', resize);
	window.addEventListener('beforeunload', destroy);
	resize();
	loop.start();

	return {
		viewer,
		goTo,
		destroy,
		getState,
		initialSceneId: HR_JOURNEY.initialSceneId,
	};
}

function createOmegaCenPreloadHints() {
	const start = defaultOrbitPosition(NGC_752_CENTER_PC, NGC_752_ORBIT_RADIUS_PC, DEFAULT_ORBIT_NORMAL);
	const route = createOrbitTransferRoute({
		start,
		sourceOrbit: {
			center: NGC_752_CENTER_PC,
			radius: NGC_752_ORBIT_RADIUS_PC,
			angularSpeedRadPerSec: NGC_752_ANGULAR_SPEED_RAD_PER_SEC,
			normal: DEFAULT_ORBIT_NORMAL,
		},
		destinationOrbit: {
			center: OMEGA_CEN_CENTER_PC,
			radius: OMEGA_CEN_ORBIT_RADIUS_PC,
			angularSpeedRadPerSec: OMEGA_CEN_ANGULAR_SPEED_RAD_PER_SEC,
			normal: OMEGA_CEN_ORBIT_NORMAL,
		},
		durationSecs: OMEGA_CEN_TRAVEL_SECS,
		sampleStepSecs: 1 / 24,
	});
	const routePointsPc = route?.points?.length >= 2
		? route.points
		: [
			start,
			defaultOrbitPosition(OMEGA_CEN_CENTER_PC, OMEGA_CEN_ORBIT_RADIUS_PC, OMEGA_CEN_ORBIT_NORMAL),
		];
	const pathRequests = buildTravelVolumeRequests({
		routePointsPc,
		radiusProfile: OMEGA_CEN_TRAVEL_RADIUS_PROFILE,
		paddingPc: OMEGA_CEN_PRELOAD_PADDING_PC,
		quantizeStepPc: OMEGA_CEN_PRELOAD_QUANTIZE_STEP_PC,
	});
	const hints = pathRequests.map((request, index) => ({
		kind: 'path-volume',
		pointsPc: request.pointsPc,
		radiusPc: request.radiusPc,
		priority: 30 - index,
	}));
	hints.push({
		kind: 'sphere-volume',
		centerPc: OMEGA_CEN_CENTER_PC,
		radiusPc: OMEGA_CEN_VOLUME_RADIUS_PC + OMEGA_CEN_ORBIT_RADIUS_PC + OMEGA_CEN_PRELOAD_PADDING_PC,
		timeRangeSecs: [OMEGA_CEN_TRAVEL_SECS, OMEGA_CEN_TRAVEL_SECS + 6],
		priority: 5,
	});
	return hints;
}

function createLookScene({
	observerPc = SOLAR_ORIGIN_PC,
	targetPc,
	durationSecs = TRANSITION_LOOK_SECS,
	hr,
}) {
	return {
		view: { targetPc },
		navigation: {
			transitionTo: {
				observerPc,
				orientationIcrs: computeLookAtOrientation(observerPc, targetPc),
				durationSecs,
				movement: { durationSecs },
				orientationTransition: { durationSecs },
			},
		},
		hr,
	};
}

function createOrbitScene({
	center,
	radiusPc,
	angularSpeedRadPerSec,
	normal = DEFAULT_ORBIT_NORMAL,
	travelDurationSecs,
	dwellSecs = 5,
	preloadHints,
	hr,
}) {
	return {
		camera: {
			type: 'orbit',
			center,
			radiusPc,
			angularSpeedRadPerSec,
			lookAt: center,
			normal,
			dwellSecs,
		},
		travel: {
			durationSecs: travelDurationSecs,
			sampleStepSecs: 1 / 24,
			arrivalThreshold: 0.05,
		},
		...(Array.isArray(preloadHints) ? { preloadHints } : {}),
		hr,
	};
}

function readDatasetString(root, key) {
	const value = root.dataset[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildHighlightRegion(name) {
	const preset = HIGHLIGHT_PRESETS[name];
	if (!preset) return null;
	return {
		teffMin: preset.teffMin,
		teffMax: preset.teffMax,
		magAbsMin: preset.magAbsMin,
		magAbsMax: preset.magAbsMax,
		color: preset.color,
		label: preset.label,
	};
}

function normalizeHrMode(value) {
	if (
		value === 'magnitude-limited'
		|| value === 'volume-complete'
		|| value === 'frustum'
	) {
		return value;
	}
	return null;
}

function computeLookAtOrientation(observerPc, targetPc, upIcrs = ICRS_NORTH) {
	return computeSpatialLookAtOrientation({
		position: observerPc,
		target: targetPc,
		up: upIcrs,
	}) ?? IDENTITY_ORIENTATION;
}

function resolveAspectRatio(element) {
	const width = element.clientWidth || 1;
	const height = element.clientHeight || 1;
	return width / height;
}

function positiveFiniteOrNull(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
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
	const normalLength = Math.hypot(normal.x, normal.y, normal.z);
	if (!(normalLength > 1e-9)) return { ...vector };
	const unitNormal = {
		x: normal.x / normalLength,
		y: normal.y / normalLength,
		z: normal.z / normalLength,
	};
	const dot = vector.x * unitNormal.x + vector.y * unitNormal.y + vector.z * unitNormal.z;
	return {
		x: vector.x - unitNormal.x * dot,
		y: vector.y - unitNormal.y * dot,
		z: vector.z - unitNormal.z * dot,
	};
}

function createPreloadRequestKey(request) {
	return `${createPreloadHintKey(request.sourceHint)}|view:${hashString(JSON.stringify(request.view ?? null))}`;
}

function createPreloadHintKey(hint) {
	if (hint?.kind === 'path-volume') {
		return [
			'path',
			roundKey(hint.radiusPc),
			roundKey(hint.priority ?? 0),
			Array.isArray(hint.pointsPc) ? hint.pointsPc.length : 0,
			hashString((hint.pointsPc ?? []).map(pointKey).join('|')),
		].join(':');
	}
	if (hint?.kind === 'sphere-volume') {
		return [
			'sphere',
			pointKey(hint.centerPc),
			roundKey(hint.radiusPc),
			roundKey(hint.priority ?? 0),
		].join(':');
	}
	return hashString(JSON.stringify(hint ?? null));
}

function pointKey(point) {
	return `${roundKey(point?.x)},${roundKey(point?.y)},${roundKey(point?.z)}`;
}

function roundKey(value) {
	const number = Number(value);
	return Number.isFinite(number) ? String(Math.round(number * 1000) / 1000) : 'null';
}

function hashString(input) {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function isAbortError(error) {
	return error?.name === 'AbortError';
}
