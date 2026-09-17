import * as THREE from 'three';
import {
	createSkyGrabPlugin,
	createSkykitAnimationLoop,
	createSkykitDebugBridge,
	createSkykitHrDiagramPlugin,
	createSkykitNavigationPlugin,
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
import { createOrbitTransferRoute } from '@found-in-space/spatial';
import {
	createSphereVolumeStrategy,
} from '@found-in-space/star-trees';
import { createThreeStarField } from '@found-in-space/three-star-field';
import { activateChapterCamera } from './chapter-navigation.js';
import {
	createCanonicalOmegaCenRoute,
	createOmegaReturnRoutePoints,
	createOrbitAnchorPoint,
} from './hr-diagram-omega-route.js';

export const DEFAULT_HR_MAG_LIMIT = 6.5;
export const DEFAULT_HR_VOLUME_RADIUS = 25;
export const INNER_GALACTIC_PLANE_TARGET_PC = Object.freeze({
	x: -446.986,
	y: -7138.118,
	z: -3965.748,
});

const SOLAR_ORIGIN_PC = Object.freeze({ x: 0, y: 0, z: 0 });
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
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
const OMEGA_CEN_RETURN_TO_INNER_TRAVEL_SECS = 20;
const OMEGA_CEN_INITIAL_CURRENT_RADIUS_PC = LESSON_VOLUME_RADIUS_PC;
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

const OMEGA_CEN_ROUTE = createCanonicalOmegaCenRoute({
	createOrbitTransferRoute,
	ngc752CenterPc: NGC_752_CENTER_PC,
	ngc752OrbitRadiusPc: NGC_752_ORBIT_RADIUS_PC,
	ngc752AngularSpeedRadPerSec: NGC_752_ANGULAR_SPEED_RAD_PER_SEC,
	omegaCenCenterPc: OMEGA_CEN_CENTER_PC,
	omegaCenOrbitRadiusPc: OMEGA_CEN_ORBIT_RADIUS_PC,
	omegaCenAngularSpeedRadPerSec: OMEGA_CEN_ANGULAR_SPEED_RAD_PER_SEC,
	omegaCenTravelSecs: OMEGA_CEN_TRAVEL_SECS,
	defaultOrbitNormal: DEFAULT_ORBIT_NORMAL,
	omegaCenOrbitNormal: OMEGA_CEN_ORBIT_NORMAL,
});
const OMEGA_CEN_TRAVEL_HOLD_DEMAND_STRATEGY = createSphereVolumeStrategy({
	centerPc: OMEGA_CEN_ROUTE.startAnchorPc,
	radiusPc: LESSON_VOLUME_RADIUS_PC,
});
const OMEGA_CEN_DESTINATION_DEMAND_STRATEGY = createSphereVolumeStrategy({
	centerPc: OMEGA_CEN_CENTER_PC,
	radiusPc: OMEGA_CEN_INITIAL_CURRENT_RADIUS_PC,
});
const PLEIADES_RETURN_ANCHOR_PC = Object.freeze(
	createOrbitAnchorPoint(PLEIADES_CENTER_PC, 10, DEFAULT_ORBIT_NORMAL),
);
const OMEGA_RETURN_ROUTES = Object.freeze({
	'ngc-752': OMEGA_CEN_ROUTE.reversePointsPc,
	pleiades: Object.freeze(createOmegaReturnRoutePoints(OMEGA_CEN_ROUTE.reversePointsPc, PLEIADES_RETURN_ANCHOR_PC)),
	'away-volume': Object.freeze(createOmegaReturnRoutePoints(OMEGA_CEN_ROUTE.reversePointsPc, OFFSET_SAMPLE_PC)),
	'local-volume': Object.freeze(createOmegaReturnRoutePoints(OMEGA_CEN_ROUTE.reversePointsPc, SOLAR_ORIGIN_PC)),
});

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

const HR_INITIAL_CHAPTER_ID = 'all-stars';
const HR_CHAPTER_ORDER = Object.freeze([
		'all-stars',
		'inner-plane',
		'out-of-plane',
		'local-volume',
		'away-volume',
		'pleiades',
		'ngc-752',
		'omega-cen',
]);

export const HR_SCENES = {
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
};

function createOmegaForwardTravel() {
	return {
		type: 'orbit-transfer',
		durationSecs: OMEGA_CEN_TRAVEL_SECS,
		sampleStepSecs: 1 / 24,
		arrivalThreshold: 0.05,
		pointsPc: OMEGA_CEN_ROUTE.forwardPointsPc,
		arrivalAction: OMEGA_CEN_ROUTE.forwardArrivalAction,
	};
}

function createOmegaReturnTravel(pointsPc, {
	durationSecs = OMEGA_CEN_RETURN_TO_INNER_TRAVEL_SECS,
	arrivalAction = null,
} = {}) {
	return {
		type: 'orbit-transfer',
		durationSecs,
		sampleStepSecs: 1 / 24,
		arrivalThreshold: 0.05,
		pointsPc,
		...(arrivalAction ? { arrivalAction } : {}),
	};
}

export function createHrChapters(applyHrSceneState) {
	let latestActivation = 0;
	return Object.fromEntries(HR_CHAPTER_ORDER.map((id) => [
		id,
		{
			...HR_SCENES[id],
			label: HR_SCENES[id].label ?? id,
			async activate(ctx) {
				const activation = ++latestActivation;
				const activationScene = createHrActivationScene(id, ctx.previousSceneId);
				await applyHrSceneState(createRouteAwareHrState(activationScene), 'website.hrDiagram.scene');
				if (activation !== latestActivation) return;
				await activateChapterCamera(ctx, {
					...HR_SCENES[id],
					travel: resolveHrChapterTravel(id, ctx.previousSceneId),
				}, {
					source: 'website.hrDiagram',
					onArrive: async () => {
						if (activation !== latestActivation) return;
						const arrivalVolumeRadiusPc = positiveFiniteOrNull(activationScene?.hr?.arrivalVolumeRadiusPc);
						const hrState = createRouteAwareHrState(activationScene, { arrival: true });
						if (arrivalVolumeRadiusPc !== null) {
							hrState.volumeRadiusPc = arrivalVolumeRadiusPc;
						}
						await applyHrSceneState(hrState, 'website.hrDiagram.arrival');
					},
				});
			},
		},
	]));
}

function createHrActivationScene(sceneId, previousSceneId) {
	return {
		...HR_SCENES[sceneId],
		sceneId,
		fromSceneId: previousSceneId,
		toSceneId: sceneId,
	};
}

export function resolveHrChapterTravel(sceneId, previousSceneId) {
	if (previousSceneId === 'ngc-752' && sceneId === 'omega-cen') {
		return createOmegaForwardTravel();
	}
	if (previousSceneId === 'omega-cen' && Object.hasOwn(OMEGA_RETURN_ROUTES, sceneId)) {
		return createOmegaReturnTravel(OMEGA_RETURN_ROUTES[sceneId], {
			...(sceneId === 'ngc-752'
				? {
					durationSecs: OMEGA_CEN_TRAVEL_SECS,
					arrivalAction: OMEGA_CEN_ROUTE.reverseArrivalAction,
				}
				: {}),
		});
	}
	return HR_SCENES[sceneId]?.travel ?? {};
}

function createRouteAwareHrState(scene, { arrival = false } = {}) {
	const state = {
		...(scene?.hr && typeof scene.hr === 'object' ? scene.hr : {}),
	};
	const sceneId = typeof scene?.sceneId === 'string'
		? scene.sceneId
		: (typeof scene?.toSceneId === 'string' ? scene.toSceneId : null);
	if (arrival) {
		state.demandStrategy = sceneId === 'omega-cen'
			? useOmegaCenDestinationDemandStrategy
			: null;
		return state;
	}
	if (isOmegaForwardTransferScene(scene)) {
		state.demandStrategy = useOmegaCenTravelHoldDemandStrategy;
	} else if (isOmegaReturnTransferScene(scene)) {
		state.demandStrategy = useOmegaCenDestinationDemandStrategy;
	} else if (sceneId === 'omega-cen') {
		state.demandStrategy = useOmegaCenDestinationDemandStrategy;
	} else {
		state.demandStrategy = null;
	}
	return state;
}

function isOmegaForwardTransferScene(scene) {
	const fromSceneId = typeof scene?.fromSceneId === 'string' ? scene.fromSceneId : null;
	const toSceneId = typeof scene?.toSceneId === 'string' ? scene.toSceneId : null;
	return fromSceneId === 'ngc-752' && toSceneId === 'omega-cen';
}

function isOmegaReturnTransferScene(scene) {
	const fromSceneId = typeof scene?.fromSceneId === 'string' ? scene.fromSceneId : null;
	const toSceneId = typeof scene?.toSceneId === 'string' ? scene.toSceneId : null;
	return fromSceneId === 'omega-cen' && Object.hasOwn(OMEGA_RETURN_ROUTES, toSceneId);
}

function useOmegaCenTravelHoldDemandStrategy() {
	return OMEGA_CEN_TRAVEL_HOLD_DEMAND_STRATEGY;
}

function useOmegaCenDestinationDemandStrategy() {
	return OMEGA_CEN_DESTINATION_DEMAND_STRATEGY;
}

export async function mountHrDiagramViewer(root) {
	const mount = root.querySelector('[data-hr-diagram-viewer-shell]');
	if (!(mount instanceof HTMLElement)) {
		throw new Error('Missing [data-hr-diagram-viewer-shell] mount for HR diagram viewer.');
	}

	const topicId = root.dataset.topic || 'hr-diagram';
	const sessionId = root.dataset.datasetId || `website-learn-hr-diagram-${topicId}`;
	const octreeUrl = readDatasetString(root, 'octreeUrl') ?? OCTREE_DEFAULT;
	const initialScene = HR_SCENES[HR_INITIAL_CHAPTER_ID];
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
		retainCellsOnRestart: {
			until: 'current',
			maxAgeMs: 20_000,
		},
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
	let activeSceneId = HR_INITIAL_CHAPTER_ID;
	let activeMode = 'magnitude-limited';
	let activeMagLimit = DEFAULT_HR_MAG_LIMIT;
	let activeRadius = DEFAULT_HR_VOLUME_RADIUS;
	let disposed = false;
	const navigation = createSkykitNavigationPlugin({ speed: 600, acceleration: 240, deceleration: 180 });
	let cachedHudRoot = null;
	let cachedHudRootKey = '';
	let viewer = null;
	let debugViewer = null;
	const pendingHrSceneStates = [];
	const chapters = createHrChapters(applyHrSceneState);

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
			lookAt: initialView.orientationIcrs
				? { orientationIcrs: initialView.orientationIcrs }
				: { targetPc: initialView.targetPc ?? INNER_GALACTIC_PLANE_TARGET_PC },
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
			navigation,
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

	async function goTo(sceneId) {
		const chapter = chapters[sceneId];
		if (!chapter || disposed) return null;
		const previousSceneId = activeSceneId;
		activeSceneId = sceneId;
		await chapter.activate({ viewer, navigation, provider, renderer, previousSceneId });
		return sceneId;
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
		if ('demandStrategy' in state) {
			hrOptions.demandStrategy = typeof state.demandStrategy === 'function'
				? state.demandStrategy
				: null;
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
		initialSceneId: HR_INITIAL_CHAPTER_ID,
	};
}

function createLookScene({
	observerPc = SOLAR_ORIGIN_PC,
	targetPc,
	durationSecs = TRANSITION_LOOK_SECS,
	hr,
}) {
	return {
		view: { lookAt: { targetPc } },
		navigation: {
			transitionTo: {
				observerPc,
				lookAt: { targetPc },
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

function resolveAspectRatio(element) {
	const width = element.clientWidth || 1;
	const height = element.clientHeight || 1;
	return width / height;
}

function positiveFiniteOrNull(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
}
