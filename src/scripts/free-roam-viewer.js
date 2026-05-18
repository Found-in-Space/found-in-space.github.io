import * as THREE from 'three';

import {
	createButton,
	createColumn,
	createDPad,
	createDockLayout,
	createHoldButton,
	createRuntime,
} from '@found-in-space/touch-os';
import { createHudPanelDriver } from '@found-in-space/touch-os/hosts/three';
import {
	SKYKIT_ACTIONS,
	createAnchoredImageCatalog,
	createAnchoredImageSkyPlugin,
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
	OCTREE_DEFAULT,
	createObserverShellStrategy,
	createStarOctreeProviderService,
} from '@found-in-space/star-octree-provider';
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
	const constellationArt = createAnchoredImageSkyPlugin({
		id: 'free-roam-constellation-art',
		catalog,
		mode: 'all',
		loading: 'preload',
		fixedAtInfinity: true,
		radius: ART_RADIUS,
		opacity: 0.18,
		inactiveOpacity: 0.14,
		activeOpacity: 0.28,
		cutoff: 0.05,
		subdivisions: 5,
		skipTextureErrors: true,
		active: { enabled: true, maxImages: 2, fadeDeg: 8 },
		onTextureError({ image, error }) {
			console.warn('[website:free-roam-art]', image.id, error);
		},
	});

	onStatus('Creating SkyKit viewer...');
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setClearColor(0x02040b, 1);
	const camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, initialAspectRatio, 0.0001, 1000);
	const provider = createStarOctreeProviderService({ url: OCTREE_DEFAULT });
	const starField = createThreeStarField({ limitingMagnitude: LIMITING_MAGNITUDE, exposure: 2500 });
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
			createTouchNavigationHudPlugin({
				target: mount,
				enabled: showTouchControls,
			}),
			createSkykitStatusPlugin({
				intervalSeconds: 0.5,
				render({ viewer: snapshot }) {
					const stars = snapshot.parts.find((part) => part.id === 'free-roam-streamed-stars')?.snapshot;
					const starCount = stars?.renderer?.starCount ?? 0;
					if (stars?.status === 'streaming') {
						onStatus(`Streaming stars... ${starCount.toLocaleString()} loaded.`);
					} else if (stars?.status === 'current') {
						onStatus(`Current: ${starCount.toLocaleString()} stars loaded for this view.`);
					} else if (stars?.status === 'failed') {
						onStatus(stars.lastError ?? 'Star stream failed.');
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

function createTouchNavigationHudPlugin({ target, enabled }) {
	return {
		id: 'free-roam-touch-hud',
		setup(context) {
			if (!enabled || !(target instanceof HTMLElement)) return;
			const runtime = createRuntime({
				root: createTouchControlsRoot(),
				surface: resolveTouchSurface(target),
			});
			const driver = createHudPanelDriver({
				runtime,
				sizing: 'viewport',
				distance: 0.58,
				pointerClaimPolicy: 'block-on-hit',
				transparent: true,
			});
			let latestFrame = null;
			const activePointers = new Set();

			const part = {
				id: 'free-roam-touch-hud',
				attach() {
					driver.attach();
					target.addEventListener('pointerdown', onPointerEvent, true);
					target.addEventListener('pointermove', onPointerEvent, true);
					target.addEventListener('pointerup', onPointerEvent, true);
					target.addEventListener('pointercancel', onPointerEvent, true);
				},
				update(frame) {
					latestFrame = frame;
					driver.update(createTouchFrame(frame, target));
					consumeTouchOutputs(runtime.takeOutputs(), context);
				},
				dispose() {
					target.removeEventListener('pointerdown', onPointerEvent, true);
					target.removeEventListener('pointermove', onPointerEvent, true);
					target.removeEventListener('pointerup', onPointerEvent, true);
					target.removeEventListener('pointercancel', onPointerEvent, true);
					activePointers.clear();
					driver.detach();
					runtime.dispose();
				},
			};
			context.addPart(part);

			function onPointerEvent(event) {
				if (!latestFrame || !(event instanceof PointerEvent)) return;
				const pointerId = String(event.pointerId ?? 'default');
				const hostEvent = pointerEventToTouchOs(event, target);
				if (!hostEvent) return;
				const wasActive = activePointers.has(pointerId);
				driver.update({
					...createTouchFrame(latestFrame, target),
					events: [hostEvent],
				});
				const hit = driver.getHit();
				const claimed = Boolean(hit?.componentId);
				if (event.type === 'pointerdown' && claimed) activePointers.add(pointerId);
				if (event.type === 'pointerup' || event.type === 'pointercancel') activePointers.delete(pointerId);
				consumeTouchOutputs(runtime.takeOutputs(), context);
				if (claimed || wasActive) {
					event.preventDefault();
					event.stopImmediatePropagation();
				}
			}
		},
	};
}

function createTouchControlsRoot() {
	const payloadStart = { phase: 'start' };
	const payloadStop = { phase: 'stop' };
	const hold = (id, label, actionId) => createHoldButton(id, {
		label,
		actionId,
		startPayload: payloadStart,
		stopPayload: payloadStop,
	});

	return createDockLayout('free-roam-touch-controls', {
		padding: 24,
		bottomLeft: {
			maxWidth: 168,
			maxHeight: 168,
			child: createDPad('free-roam-move-pad', {
				up: { label: 'F', actionId: SKYKIT_ACTIONS.ship.moveForward, startPayload: payloadStart, stopPayload: payloadStop },
				down: { label: 'B', actionId: SKYKIT_ACTIONS.ship.moveBack, startPayload: payloadStart, stopPayload: payloadStop },
				left: { label: 'L', actionId: SKYKIT_ACTIONS.ship.moveLeft, startPayload: payloadStart, stopPayload: payloadStop },
				right: { label: 'R', actionId: SKYKIT_ACTIONS.ship.moveRight, startPayload: payloadStart, stopPayload: payloadStop },
			}),
		},
		bottomRight: {
			maxWidth: 132,
			maxHeight: 178,
			child: createColumn('free-roam-action-column', {
				gap: 8,
				padding: 0,
				children: [
					hold('free-roam-up', 'Up', SKYKIT_ACTIONS.ship.moveUp),
					hold('free-roam-down', 'Down', SKYKIT_ACTIONS.ship.moveDown),
					createButton('free-roam-look-sun', { label: 'Look Sun', actionId: APP_ACTIONS.lookSun }),
					createButton('free-roam-fly-sun', { label: 'Fly Sun', actionId: APP_ACTIONS.flySun }),
				],
			}),
		},
	});
}

function consumeTouchOutputs(outputs, context) {
	for (const output of outputs) {
		if (output.type !== 'action') continue;
		const source = `touch-os:${output.componentId}`;
		if (output.payload?.phase === 'start') {
			context.actions.press(output.actionId, output.payload, { source });
		} else if (output.payload?.phase === 'stop') {
			context.actions.release(output.actionId, { source });
		} else {
			void context.actions.invoke(output.actionId, output.payload, { source });
		}
	}
}

function createTouchFrame(frame, target) {
	return {
		scene: frame.scene,
		camera: frame.camera,
		parent: frame.scene,
		surfaceMetrics: resolveTouchSurface(target),
	};
}

function pointerEventToTouchOs(event, target) {
	const rect = target.getBoundingClientRect();
	const width = rect.width || 1;
	const height = rect.height || 1;
	const phaseByType = {
		pointerdown: 'pointer-down',
		pointermove: 'pointer-move',
		pointerup: 'pointer-up',
		pointercancel: 'cancel',
	};
	const type = phaseByType[event.type];
	if (!type) return null;
	return {
		type,
		source: 'screen',
		pointerId: String(event.pointerId ?? 'default'),
		pointerType: event.pointerType || 'unknown',
		ndcX: ((event.clientX - rect.left) / width) * 2 - 1,
		ndcY: -(((event.clientY - rect.top) / height) * 2 - 1),
		timestamp: event.timeStamp || performance.now(),
		pressure: event.pressure,
	};
}

function resolveTouchSurface(target) {
	return {
		width: Math.max(320, Math.round(target.clientWidth || 1)),
		height: Math.max(240, Math.round(target.clientHeight || 1)),
		pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
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
