import * as THREE from 'three';

import {
	SKYKIT_ACTIONS,
	createObject3dPlugin,
	createSkyGrabPlugin,
	createSkykitAnimationLoop,
	createSkykitJourneyPlugin,
	createSkykitNavigationPlugin,
	createSkykitViewer,
	createStreamingStarsPlugin,
} from '@found-in-space/skykit';
import { createJourney } from '@found-in-space/journey';
import {
	OCTREE_DEFAULT,
	createStarOctreeProviderService,
} from '@found-in-space/star-octree-provider';
import { computeSpatialLookAtOrientation } from '@found-in-space/spatial';
import { createObserverShellStrategy } from '@found-in-space/star-trees';
import { createThreeStarField } from '@found-in-space/three-star-field';

const UNITS_PER_PARSEC = 0.001;
const LIMITING_MAGNITUDE = 7.5;
const VERTICAL_FOV_DEG = 58;
const LY_PER_PC = 3.2615637775591093;
const JULIAN_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const FIRST_RADIO_SIGNAL_DATE_UTC_MS = Date.UTC(1895, 6, 1);
const MAX_DEVICE_PIXEL_RATIO = 2;
const ZERO_PC = Object.freeze({ x: 0, y: 0, z: 0 });
const SOLAR_ORIGIN_PC = ZERO_PC;
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
const IDENTITY_ORIENTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const HYADES_CENTER_PC = Object.freeze({ x: 17.574, y: 42.316, z: 13.963 });
const BEFORE_RADIO_ORBIT_RADIUS_PC = 0.25;
const MARCONI_GROW_DURATION_SECS = 10;
const MARCONI_ORBIT_START_MARGIN_PC = 0.25;
const MARCONI_ORBIT_END_MARGIN_PC = 80;
const MARCONI_ORBIT_ANGULAR_SPEED_RAD_PER_SEC = 0.0;
const HYADES_ORBIT_RADIUS_PC = 15;
const STAR_ATTRIBUTES = Object.freeze(['position', 'magAbs', 'teffLog8']);
const MONTH_LABELS = Object.freeze([
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
]);

/**
 * Mount the radio bubble tour viewer.
 *
 * @param {HTMLElement} mount
 * @param {object}      options
 * @param {(id: string|null) => void}  [options.onViewpointChange]
 * @param {(msg: string) => void}      [options.onStatus]
 * @param {(label: string|null) => void} [options.onTimelineDateChange]
 * @returns {Promise<{ viewer: object, goTo: (id: string) => void, viewpoints: Array<{ id: string, label: string }>, radiusPc: number, radiusLy: number }>}
 */
export async function mountRadioBubbleViewer(mount, options = {}) {
	const onViewpointChange = typeof options.onViewpointChange === 'function'
		? options.onViewpointChange
		: () => {};
	const onStatus = typeof options.onStatus === 'function'
		? options.onStatus
		: () => {};
	const onTimelineDateChange = typeof options.onTimelineDateChange === 'function'
		? options.onTimelineDateChange
		: () => {};

	onStatus('Creating SkyKit viewer...');
	const firstSignalDateMs = FIRST_RADIO_SIGNAL_DATE_UTC_MS;
	const currentDateMs = Date.now();
	const initialAspectRatio = resolveAspectRatio(mount);
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setClearColor(0x02040b, 1);
	const camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, initialAspectRatio, 0.0001, 1000);
	const provider = createStarOctreeProviderService({
		url: OCTREE_DEFAULT,
		persistentCache: 'on',
	});
	const starField = createThreeStarField({ limitingMagnitude: LIMITING_MAGNITUDE, exposure: 2500 });
	const { radiusPc, radiusLy } = computeRadioBubbleRadius({
		firstSignalDate: firstSignalDateMs,
		currentDate: currentDateMs,
	});
	const { group: bubbleGroup } = createRadioBubbleMeshes({ radiusPc, radiusLy });
	const { journey, scenes, viewpoints, viewpointById } = createRadioBubbleJourney();
	const bubbleAnimation = createRadioBubbleOriginAnimationPlugin({
		bubbleGroup,
		radiusPc,
		firstSignalDateMs,
		currentDateMs,
		onTimelineDateChange,
	});
	let disposed = false;
	setBubbleProgress(bubbleGroup, 0);

	const viewer = await createSkykitViewer({
		id: 'website-radio-bubble-alpha',
		host: mount,
		renderer,
		camera,
		view: {
			...scenes['before-radio'].view,
			coordinateUnitsPerParsec: UNITS_PER_PARSEC,
			limitingMagnitude: LIMITING_MAGNITUDE,
			verticalFovDeg: VERTICAL_FOV_DEG,
			aspectRatio: initialAspectRatio,
		},
		plugins: [
			createStreamingStarsPlugin({
				id: 'radio-bubble-streamed-stars',
				provider,
				renderer: starField,
				attributes: STAR_ATTRIBUTES,
				session: {
					id: 'website-learn-radio-bubble',
					strategy: createObserverShellStrategy(),
				},
			}),
			createObject3dPlugin({
				id: 'radio-bubble',
				object3d: bubbleGroup,
				anchorMode: 'world-space',
				disposeObject: true,
			}),
			bubbleAnimation,
			createSkykitNavigationPlugin({ speed: 120, acceleration: 80, deceleration: 60 }),
			createSkyGrabPlugin({
				target: mount,
				sensitivityRadiansPerPixel: 0.00075,
			}),
			createSkykitJourneyPlugin({
				id: 'radio-bubble-journey',
				journey,
				onScene(scene) {
					const sceneId = typeof scene?.sceneId === 'string' ? scene.sceneId : null;
					if (!sceneId || !viewpointById.has(sceneId)) return;
					bubbleAnimation.setScene(sceneId);
					onViewpointChange(sceneId);
				},
			}),
		],
	});

	const loop = createSkykitAnimationLoop(viewer);
	window.addEventListener('resize', resize);
	window.addEventListener('beforeunload', destroy);
	resize();
	loop.start();

	onStatus('Drag on the view to look around.');

	function goTo(id) {
		if (!viewpointById.has(id)) return;
		void viewer.actions.invoke(SKYKIT_ACTIONS.journey.goToChapter, id, {
			source: 'website.radioBubble',
		});
	}

	function resize() {
		const aspectRatio = resolveAspectRatio(mount);
		camera.aspect = aspectRatio;
		camera.updateProjectionMatrix();
		viewer.resize({
			width: mount.clientWidth || 1,
			height: mount.clientHeight || 1,
			devicePixelRatio: Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO),
		});
		viewer.requestViewState({ aspectRatio }, 'website.radioBubble.resize');
	}

	function destroy() {
		if (disposed) return;
		disposed = true;
		window.removeEventListener('resize', resize);
		window.removeEventListener('beforeunload', destroy);
		loop.dispose();
		void viewer.dispose().catch((err) => {
			console.error('[website:radio-bubble-cleanup]', err);
		});
		void provider.dispose?.();
	}

	return { viewer, goTo, viewpoints, radiusPc, radiusLy };
}

function createRadioBubbleJourney() {
	const scenes = {
		'before-radio': {
			label: 'Before radio',
			view: createSolarOrbitView(BEFORE_RADIO_ORBIT_RADIUS_PC),
			camera: {
				type: 'orbit',
				center: SOLAR_ORIGIN_PC,
				radiusPc: BEFORE_RADIO_ORBIT_RADIUS_PC,
				angularSpeedRadPerSec: 0.05,
				lookAt: SOLAR_ORIGIN_PC,
				normal: ICRS_NORTH,
				dwellSecs: 5,
			},
		},
		marconi: {
			label: 'Marconi',
		},
		outside: {
			label: 'Outside the bubble',
			camera: {
				type: 'orbit',
				center: SOLAR_ORIGIN_PC,
				radiusPc: 350,
				angularSpeedRadPerSec: 0.02,
				lookAt: SOLAR_ORIGIN_PC,
				normal: ICRS_NORTH,
				dwellSecs: 5,
			},
		},
		hyades: {
			label: 'The Hyades',
			camera: {
				type: 'orbit',
				center: HYADES_CENTER_PC,
				radiusPc: HYADES_ORBIT_RADIUS_PC,
				angularSpeedRadPerSec: 0.20,
				lookAt: HYADES_CENTER_PC,
				normal: ICRS_NORTH,
				dwellSecs: 5,
			},
		},
		home: {
			label: 'Return home',
			camera: {
				type: 'orbit',
				center: SOLAR_ORIGIN_PC,
				radiusPc: 1,
				angularSpeedRadPerSec: 0.26,
				lookAt: SOLAR_ORIGIN_PC,
				normal: ICRS_NORTH,
				dwellSecs: 5,
			},
		},
	};
	const order = ['before-radio', 'marconi', 'outside', 'hyades', 'home'];
	const journey = createJourney({
		id: 'website-radio-bubble-journey',
		title: 'The radio bubble',
		order,
		scenes,
		travel: { type: 'orbit-transfer', durationSecs: 5 },
	});
	const viewpoints = order.map((id) => ({
		id,
		label: scenes[id].label,
	}));

	return {
		journey,
		scenes,
		viewpoints,
		viewpointById: new Map(viewpoints.map((viewpoint) => [viewpoint.id, viewpoint])),
	};
}

function createRadioBubbleOriginAnimationPlugin({
	bubbleGroup,
	radiusPc,
	firstSignalDateMs,
	currentDateMs,
	onTimelineDateChange,
}) {
	let context = null;
	let activeSceneId = null;
	let mode = 'hidden';
	let elapsedSecs = 0;
	let orbitAngleRad = 0;
	let progress = 0;
	let timelineLabel = undefined;

	return {
		id: 'radio-bubble-origin-animation',
		setup(nextContext) {
			context = nextContext;
			context.addPart({
				id: 'radio-bubble-origin-animation',
				priority: 100,
				update(frame) {
					if (mode !== 'growing' && mode !== 'settled') return;
					const dt = Math.max(0, Number.isFinite(frame.deltaSeconds) ? frame.deltaSeconds : 0);
					if (mode === 'growing') {
						elapsedSecs = Math.min(MARCONI_GROW_DURATION_SECS, elapsedSecs + dt);
						const timeProgress = MARCONI_GROW_DURATION_SECS > 0
							? elapsedSecs / MARCONI_GROW_DURATION_SECS
							: 1;
						progress = easeInOutSmoothstep(timeProgress);
						if (timeProgress >= 1) {
							progress = 1;
							mode = 'settled';
						}
					}
					orbitAngleRad += MARCONI_ORBIT_ANGULAR_SPEED_RAD_PER_SEC * dt;
					setBubbleProgress(bubbleGroup, progress);
					emitTimelineProgress(progress);
					requestMarconiCamera(frame.viewer, radiusPc, progress, orbitAngleRad);
				},
				getSnapshot() {
					return {
						activeSceneId,
						mode,
						progress,
						elapsedSecs,
						radiusPc,
					};
				},
			});
		},
		setScene(sceneId) {
			activeSceneId = sceneId;
			if (sceneId === 'before-radio') {
				mode = 'hidden';
				elapsedSecs = 0;
				progress = 0;
				setBubbleProgress(bubbleGroup, 0);
				emitTimelineLabel(null);
				return;
			}

			if (sceneId === 'marconi') {
				mode = 'growing';
				elapsedSecs = 0;
				progress = 0;
				orbitAngleRad = resolveOrbitAngle(context?.getViewState().observerPc);
				setBubbleProgress(bubbleGroup, 0);
				emitTimelineProgress(0);
				void context?.actions.invoke(SKYKIT_ACTIONS.navigation.cancel, null, {
					source: 'website.radioBubble.marconi',
				});
				if (context) {
					requestMarconiCamera(context, radiusPc, 0, orbitAngleRad);
				}
				return;
			}

			mode = 'complete';
			elapsedSecs = MARCONI_GROW_DURATION_SECS;
			progress = 1;
			setBubbleProgress(bubbleGroup, 1);
			emitTimelineProgress(1);
		},
	};

	function emitTimelineProgress(nextProgress) {
		emitTimelineLabel(formatRadioBubbleTimelineDate(
			firstSignalDateMs,
			currentDateMs,
			nextProgress,
		));
	}

	function emitTimelineLabel(label) {
		if (label === timelineLabel) return;
		timelineLabel = label;
		onTimelineDateChange(label);
	}
}

function computeRadioBubbleRadius(options = {}) {
	const firstSignalDateMs = resolveDateMs(options.firstSignalDate, FIRST_RADIO_SIGNAL_DATE_UTC_MS);
	const currentDateMs = resolveDateMs(options.currentDate, Date.now());
	const radiusLy = Math.max(0, (currentDateMs - firstSignalDateMs) / JULIAN_YEAR_MS);
	const radiusPc = radiusLy / LY_PER_PC;
	return { radiusPc, radiusLy };
}

function createRadioBubbleMeshes(options = {}) {
	const fillColor = options.fillColor ?? 0x2299ff;
	const fillOpacity = options.fillOpacity ?? 0.05;
	const wireColor = options.wireColor ?? 0x55ccff;
	const wireOpacity = options.wireOpacity ?? 0.22;
	const computedRadius = options.radiusPc == null ? computeRadioBubbleRadius(options) : null;
	const radiusPc = nonNegativeNumber(options.radiusPc, computedRadius?.radiusPc ?? 0);
	const radiusLy = nonNegativeNumber(options.radiusLy, computedRadius?.radiusLy ?? radiusPc * LY_PER_PC);
	const radiusScene = radiusPc * UNITS_PER_PARSEC;
	const group = new THREE.Group();
	group.name = 'radio-bubble';
	group.rotation.x = Math.PI / 2;

	const fillGeometry = new THREE.SphereGeometry(radiusScene, 64, 32);
	const fillMaterial = new THREE.MeshBasicMaterial({
		color: fillColor,
		transparent: true,
		opacity: fillOpacity,
		depthWrite: false,
		side: THREE.FrontSide,
	});
	group.add(new THREE.Mesh(fillGeometry, fillMaterial));

	const wireGeometry = new THREE.SphereGeometry(radiusScene, 36, 18);
	const wireMaterial = new THREE.MeshBasicMaterial({
		color: wireColor,
		transparent: true,
		opacity: wireOpacity,
		depthWrite: false,
		wireframe: true,
		side: THREE.FrontSide,
	});
	group.add(new THREE.Mesh(wireGeometry, wireMaterial));

	return { group, radiusPc, radiusLy };
}

function createSolarOrbitView(radiusPc, angleRad = 0) {
	const observerPc = solarOrbitPosition(radiusPc, angleRad);
	return {
		observerPc,
		targetPc: SOLAR_ORIGIN_PC,
		orientationIcrs: computeLookAtOrientation(observerPc, SOLAR_ORIGIN_PC),
	};
}

function requestMarconiCamera(target, finalRadiusPc, progress, angleRad) {
	const observerPc = solarOrbitPosition(resolveMarconiOrbitRadius(finalRadiusPc, progress), angleRad);
	target.requestViewState({
		observerPc,
		targetPc: SOLAR_ORIGIN_PC,
		orientationIcrs: computeLookAtOrientation(observerPc, SOLAR_ORIGIN_PC),
	}, 'website.radioBubble.marconi');
}

function resolveMarconiOrbitRadius(finalRadiusPc, progress) {
	const clamped = clampUnit(progress);
	const shellRadiusPc = finalRadiusPc * clamped;
	const growthMarginPc = MARCONI_ORBIT_START_MARGIN_PC
		+ (MARCONI_ORBIT_END_MARGIN_PC - MARCONI_ORBIT_START_MARGIN_PC) * clamped;
	return shellRadiusPc + growthMarginPc;
}

function easeInOutSmoothstep(value) {
	const t = clampUnit(value);
	return t * t * (3 - 2 * t);
}

function solarOrbitPosition(radiusPc, angleRad) {
	return {
		x: Math.cos(angleRad) * radiusPc,
		y: -Math.sin(angleRad) * radiusPc,
		z: 0,
	};
}

function resolveOrbitAngle(observerPc) {
	if (!observerPc) return 0;
	const x = Number(observerPc.x) - SOLAR_ORIGIN_PC.x;
	const y = Number(observerPc.y) - SOLAR_ORIGIN_PC.y;
	return Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) > 1e-9
		? Math.atan2(-y, x)
		: 0;
}

function setBubbleProgress(group, progress) {
	const clamped = clampUnit(progress);
	group.visible = clamped > 0;
	group.scale.setScalar(clamped);
	group.updateMatrixWorld(true);
}

function formatRadioBubbleTimelineDate(firstSignalDateMs, currentDateMs, progress) {
	const startMs = Number.isFinite(firstSignalDateMs)
		? firstSignalDateMs
		: FIRST_RADIO_SIGNAL_DATE_UTC_MS;
	const endMs = Number.isFinite(currentDateMs) && currentDateMs >= startMs
		? currentDateMs
		: startMs;
	const dateMs = startMs + (endMs - startMs) * clampUnit(progress);
	const date = new Date(dateMs);
	return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function resolveDateMs(value, fallbackMs) {
	if (value instanceof Date) {
		const time = value.getTime();
		return Number.isFinite(time) ? time : fallbackMs;
	}
	if (typeof value === 'string') {
		const time = Date.parse(value);
		return Number.isFinite(time) ? time : fallbackMs;
	}
	const time = Number(value);
	return Number.isFinite(time) ? time : fallbackMs;
}

function computeLookAtOrientation(observerPc, targetPc, upIcrs = ICRS_NORTH) {
	return computeSpatialLookAtOrientation({
		position: observerPc,
		target: targetPc,
		up: upIcrs,
	}) ?? IDENTITY_ORIENTATION;
}

function nonNegativeNumber(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function clampUnit(value) {
	return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
}

function resolveAspectRatio(mount) {
	const width = mount.clientWidth || 1;
	const height = mount.clientHeight || 1;
	return width / height;
}
