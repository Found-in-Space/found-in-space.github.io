import * as THREE from 'three';

import {
	SKYKIT_ACTIONS,
	createAnchoredImageCatalog,
	createAnchoredImageSkyPlugin,
	createViewAnchoredImageController,
	createKeyboardNavigationPlugin,
	createSkyGrabPlugin,
	createSkykitAnimationLoop,
	createSkykitDefaultKeyboardNavigationBindings,
	createSkykitNavigationPlugin,
	createSkykitStatusPlugin,
	createSkykitViewer,
	createStreamingStarsPlugin,
} from '@found-in-space/skykit';
import {
	createSkykitShipControlsRoot,
	createTouchOsHudPlugin,
} from '@found-in-space/skykit/touch-os';
import {
	OCTREE_DEFAULT,
	createStarOctreeProviderService,
} from '@found-in-space/star-octree-provider';
import { createObserverShellStrategy } from '@found-in-space/star-trees';
import { anchoredImageManifest as westernSkycultureAnchoredImageManifest } from '@found-in-space/stellarium-skycultures-western/anchored-image';
import { createThreeStarField } from '@found-in-space/three-star-field';

import { showTouchControls } from './device-capabilities.js';

const APP_ACTIONS = Object.freeze({
	flySun: 'website.freeRoam.flySun',
	lookSun: 'website.freeRoam.lookSun',
});
const ZERO_PC = Object.freeze({ x: 0, y: 0, z: 0 });
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
const DEFAULT_IMAGE_KEY = 'Ori';
const ORION_REFERENCE_PC = Object.freeze({ x: 62.775, y: 602.667, z: -12.713 });
const CONSTELLATION_TARGET_DISTANCE_PC = vectorLength(ORION_REFERENCE_PC);
const UNITS_PER_PARSEC = 0.001;
const LIMITING_MAGNITUDE = 7.5;
const VERTICAL_FOV_DEG = 58;
const ART_RADIUS = 0.13;

/**
 * Mount the SkyKit alpha free-roam constellation viewer.
 *
 * @param {HTMLElement} mount
 * @param {{ onStatus?: (message: string) => void }} [options]
 */
export async function mountFreeRoamViewer(mount, options = {}) {
	const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

	onStatus('Loading constellation catalog...');
	const catalog = await createAnchoredImageCatalog({ manifest: westernSkycultureAnchoredImageManifest });
	const constellations = catalog.list().map(({ key, label }) => ({ key, label }));
	const initialEntry = catalog.get(DEFAULT_IMAGE_KEY) ?? catalog.list()[0] ?? null;
	const initialLook = initialEntry
		? catalog.resolveLookAt(initialEntry.key, {
				observerPc: ZERO_PC,
				distancePc: CONSTELLATION_TARGET_DISTANCE_PC,
			})
		: null;
	const initialTargetPc = initialLook?.targetPc ?? ORION_REFERENCE_PC;
	const initialOrientationIcrs = initialLook?.orientationIcrs ?? { x: 0, y: 0, z: 0, w: 1 };
	const initialAspectRatio = resolveAspectRatio(mount);
	const constellationController = createViewAnchoredImageController({ strategy: 'nearest' });
	const constellationArt = createAnchoredImageSkyPlugin({
		id: 'free-roam-constellation-art',
		catalog,
		controller: constellationController,
		loading: 'preload',
		fixedAtInfinity: true,
		radius: ART_RADIUS,
		opacity: 0.28,
		fadeInSeconds: 0.4,
		fadeOutSeconds: 0.4,
		cutoff: 0.05,
		subdivisions: 5,
		skipTextureErrors: true,
		onTextureError({ image, error }) {
			console.warn('[website:free-roam-art]', image.id, error);
		},
	});

	onStatus('Creating SkyKit viewer...');
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setClearColor(0x02040b, 1);
	const camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, initialAspectRatio, 0.0001, 1000);
	const provider = createStarOctreeProviderService({
		url: OCTREE_DEFAULT,
		persistentCache: 'on',
	});
	const starField = createThreeStarField({ limitingMagnitude: LIMITING_MAGNITUDE, exposure: 2500 });
	let lastStreamStatus = '';
	let disposed = false;

	const viewer = await createSkykitViewer({
		id: 'website-free-roam-alpha',
		host: mount,
		renderer,
		camera,
		view: {
			observerPc: ZERO_PC,
			targetPc: initialTargetPc,
			orientationIcrs: initialOrientationIcrs,
			coordinateUnitsPerParsec: UNITS_PER_PARSEC,
			limitingMagnitude: LIMITING_MAGNITUDE,
			verticalFovDeg: VERTICAL_FOV_DEG,
			aspectRatio: initialAspectRatio,
		},
		plugins: [
			createFreeRoamActionsPlugin({ onStatus }),
			createStreamingStarsPlugin({
				id: 'free-roam-streamed-stars',
				provider,
				renderer: starField,
				attributes: ['position', 'magAbs', 'teffLog8', 'objectRef', 'pickMeta'],
				session: { id: 'website-explore-free-roam', strategy: createObserverShellStrategy() },
			}),
			constellationArt,
			createSkykitNavigationPlugin({ speed: 120, acceleration: 80, deceleration: 60 }),
			createKeyboardNavigationPlugin({
				speedPcPerSec: 18,
				boostMultiplier: 6,
				bindings: createSkykitDefaultKeyboardNavigationBindings({
					KeyZ: SKYKIT_ACTIONS.ship.rollAnticlockwise,
					KeyC: SKYKIT_ACTIONS.ship.rollClockwise,
					KeyR: APP_ACTIONS.flySun,
				}),
			}),
			createSkyGrabPlugin({
				target: mount,
				sensitivityRadiansPerPixel: 0.00075,
			}),
			createTouchOsHudPlugin({
				id: 'free-roam-touch-hud',
				target: mount,
				enabled: showTouchControls,
				root: createSkykitShipControlsRoot({
					id: 'free-roam-touch-controls',
					controlsMaxHeight: 178,
					commands: [
						{ id: 'free-roam-look-sun', label: 'Look Sun', actionId: APP_ACTIONS.lookSun },
						{ id: 'free-roam-fly-sun', label: 'Fly Sun', actionId: APP_ACTIONS.flySun },
					],
				}),
			}),
			createSkykitStatusPlugin({
				intervalSeconds: 0.5,
				render({ viewer: snapshot }) {
					const stars = snapshot.parts.find((part) => part.id === 'free-roam-streamed-stars')?.snapshot;
					const starCount = stars?.renderer?.starCount ?? 0;
					if (stars?.status === 'streaming') {
						updateStreamStatus(`Streaming stars... ${starCount.toLocaleString()} loaded.`);
					} else if (stars?.status === 'current') {
						updateStreamStatus(`Current: ${starCount.toLocaleString()} stars loaded for this view.`);
					} else if (stars?.status === 'failed') {
						updateStreamStatus(stars.lastError ?? 'Star stream failed.');
					}
				},
			}),
		],
	});

	const loop = createSkykitAnimationLoop(viewer);
	const onResize = () => resizeViewer(viewer, renderer, camera, mount);
	window.addEventListener('resize', onResize);
	onResize();
	loop.start();

	onStatus(showTouchControls
		? 'Drag to look around. Use touch controls or keys to fly through the stars.'
		: 'Drag to look around. Use WASD, arrow keys, Q/E, Shift, and R to fly.');

	return {
		viewer,
		canvas: renderer.domElement,
		constellations,
		setConstellation,
		dispose,
	};

	function setConstellation(key) {
		const entry = catalog.get(key);
		if (!entry || disposed) return false;
		const observerPc = viewer.getViewState().observerPc;
		const look = catalog.resolveLookAt(entry.key, {
			observerPc,
			distancePc: CONSTELLATION_TARGET_DISTANCE_PC,
		});
		if (!look) return false;
		viewer.requestViewState({ targetPc: look.targetPc }, 'website.freeRoam.constellation');
		void viewer.actions.invoke(SKYKIT_ACTIONS.navigation.lookAt, {
			...look.targetPc,
			up: look.upIcrs,
			blend: 0.06,
		}, { source: 'website.freeRoam.constellation' });
		onStatus(`Looking toward ${entry.label}.`);
		return true;
	}

	async function dispose() {
		if (disposed) return;
		disposed = true;
		window.removeEventListener('resize', onResize);
		loop.dispose();
		await viewer.dispose();
		provider.dispose?.();
	}

	function updateStreamStatus(message) {
		if (!message || message === lastStreamStatus) return;
		lastStreamStatus = message;
		onStatus(message);
	}
}

function createFreeRoamActionsPlugin({ onStatus }) {
	return {
		id: 'website-free-roam-actions',
		setup(context) {
			return context.actions.registerContext('website.freeRoam', {
				flySun: () => {
					onStatus('Flying back to the Sun...');
					void context.actions.invoke(SKYKIT_ACTIONS.navigation.flyTo, {
						...ZERO_PC,
						speed: 120,
						arrivalThreshold: 0.1,
					}, { source: APP_ACTIONS.flySun });
				},
				lookSun: () => {
					onStatus('Looking toward the Sun...');
					void context.actions.invoke(SKYKIT_ACTIONS.navigation.lookAt, {
						...ZERO_PC,
						up: ICRS_NORTH,
						blend: 0.08,
					}, { source: APP_ACTIONS.lookSun });
				},
			});
		},
	};
}

function resizeViewer(viewer, renderer, camera, mount) {
	const width = Math.max(1, mount.clientWidth || 1);
	const height = Math.max(1, mount.clientHeight || 1);
	const aspectRatio = width / height;
	camera.aspect = aspectRatio;
	camera.updateProjectionMatrix();
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	viewer.resize({ width, height, devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
	viewer.requestViewState({ aspectRatio }, 'website.freeRoam.resize');
}

function resolveAspectRatio(element) {
	const width = Math.max(1, element.clientWidth || 1);
	const height = Math.max(1, element.clientHeight || 1);
	return width / height;
}

function vectorLength(value) {
	return Math.hypot(value.x, value.y, value.z);
}
