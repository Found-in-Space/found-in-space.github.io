import * as THREE from 'three';

import {
	SKYKIT_ACTIONS,
	createAnchoredImageCatalog,
	createAnchoredImageSkyPlugin,
	createSkykitAnimationLoop,
	createSkykitViewer,
	createStreamingStarsPlugin,
} from '@found-in-space/skykit';
import {
	createParallaxOffsetInputPlugin,
	createParallaxObserverPlugin,
} from '@found-in-space/skykit/parallax';
import {
	OCTREE_DEFAULT,
	createStarOctreeProviderService,
	createTargetFrustumStrategy,
} from '@found-in-space/star-octree-provider';
import { anchoredImageManifest as westernSkycultureAnchoredImageManifest } from '@found-in-space/stellarium-skycultures-western/anchored-image';
import { createThreeStarField } from '@found-in-space/three-star-field';

import { showDeviceOrientationUi } from './device-capabilities.js';

const ZERO_PC = Object.freeze({ x: 0, y: 0, z: 0 });
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
const DEFAULT_IMAGE_KEY = 'Ori';
const UNITS_PER_PARSEC = 0.001;
const LIMITING_MAGNITUDE = 7.5;
const VERTICAL_FOV_DEG = 52;
const OVERSCAN_DEG = 18;
const TARGET_RADIUS_PC = 180;
const PARALLAX_OFFSET_PC = 1.0;
const ART_RADIUS = 0.13;
const ORION_REFERENCE_PC = Object.freeze({ x: 62.775, y: 602.667, z: -12.713 });
const CONSTELLATION_TARGET_DISTANCE_PC = vectorLength(ORION_REFERENCE_PC);

/**
 * Mount the alpha SkyKit parallax viewer used by /explore/parallax/.
 *
 * @param {HTMLElement} mount
 * @param {{
 *   tiltButton?: HTMLButtonElement | null;
 *   onStatus?: (message: string) => void;
 * }} [options]
 */
export async function mountParallaxViewer(mount, options = {}) {
	const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
	const tiltButton = options.tiltButton instanceof HTMLButtonElement ? options.tiltButton : null;

	onStatus('Loading constellation catalog…');
	const catalog = await createAnchoredImageCatalog({ manifest: westernSkycultureAnchoredImageManifest });
	const constellations = catalog.list().map(({ key, label }) => ({ key, label }));
	const defaultKey = (catalog.get(DEFAULT_IMAGE_KEY) ?? catalog.list()[0] ?? null)?.key ?? null;
	const initialLook = defaultKey
		? catalog.resolveLookAt(defaultKey, {
				observerPc: ZERO_PC,
				distancePc: CONSTELLATION_TARGET_DISTANCE_PC,
			})
		: null;
	const initialTargetPc = initialLook?.targetPc ?? ORION_REFERENCE_PC;
	let selectedImageUpIcrs = initialLook?.upIcrs ?? ICRS_NORTH;
	const initialAspectRatio = resolveAspectRatio(mount);
	const initialOrientationIcrs = initialLook?.orientationIcrs ?? { x: 0, y: 0, z: 0, w: 1 };

	onStatus('Creating SkyKit viewer…');
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setClearColor(0x02040b, 1);
	const camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, initialAspectRatio, 0.0001, 1000);
	const provider = createStarOctreeProviderService({ url: OCTREE_DEFAULT });
	const starField = createThreeStarField({
		limitingMagnitude: LIMITING_MAGNITUDE,
		exposure: 2500,
	});
	const constellationArt = createAnchoredImageSkyPlugin({
		id: 'selected-constellation-art',
		catalog,
		mode: 'fixed',
		loading: 'lazy',
		selection: defaultKey ?? undefined,
		fixedAtInfinity: true,
		radius: ART_RADIUS,
		opacity: 0.24,
		cutoff: 0.05,
		subdivisions: 5,
		skipTextureErrors: true,
		onTextureError({ image, error }) {
			console.warn('[website:parallax-art]', image.id, error);
		},
	});

	let disposed = false;

	const viewer = await createSkykitViewer({
		id: 'website-parallax-alpha',
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
			createStreamingStarsPlugin({
				id: 'parallax-streamed-stars',
				provider,
				renderer: starField,
				attributes: ['position', 'magAbs', 'teffLog8'],
				session: {
					id: 'website-explore-parallax',
					strategy: createTargetFrustumStrategy({
						verticalFovDeg: VERTICAL_FOV_DEG,
						overscanDeg: OVERSCAN_DEG,
						targetRadiusPc: TARGET_RADIUS_PC,
					}),
					demandThresholds: {
						observerMoveThresholdPc: 0.02,
						limitingMagnitudeDelta: 0.05,
						directionAngleDeg: 0.2,
					},
				},
			}),
			constellationArt,
			createParallaxOffsetInputPlugin({
				id: 'parallax-pointer-and-tilt',
				target: mount,
				pointer: {
					mode: 'hover',
					invertX: true,
					resetOnLeave: true,
				},
				tilt: showDeviceOrientationUi
					? {
							responseDeg: 18,
							invertX: true,
						}
					: false,
			}),
			createParallaxObserverPlugin({
				id: 'target-locked-parallax',
				offsetPc: PARALLAX_OFFSET_PC,
				lockTarget: true,
				upIcrs: ICRS_NORTH,
				resolveUpIcrs: () => selectedImageUpIcrs ?? ICRS_NORTH,
				smoothing: 0.18,
			}),
		],
	});

	const loop = createSkykitAnimationLoop(viewer);
	let lastStatusText = '';
	let lastStatusAt = -Infinity;
	const unsubscribeStatus = viewer.on('viewer/render', (event) => {
		if (event.frame.elapsedSeconds - lastStatusAt < 0.5) return;
		lastStatusAt = event.frame.elapsedSeconds;
		const status = summarizeViewerStatus(viewer);
		if (status && status !== lastStatusText) {
			lastStatusText = status;
			onStatus(status);
		}
	});
	const onResize = () => resizeViewer(viewer, renderer, camera, mount);
	window.addEventListener('resize', onResize);
	onResize();
	loop.start();

	if (tiltButton) {
		tiltButton.hidden = !showDeviceOrientationUi;
		tiltButton.disabled = !showDeviceOrientationUi;
		tiltButton.addEventListener('click', onTiltButtonClick);
	}

	onStatus('Move across the viewer to shift the observer around the selected constellation.');

	return {
		viewer,
		loop,
		provider,
		constellations,
		setConstellation,
		dispose,
	};

	async function setConstellation(key) {
		const entry = catalog.get(key);
		if (!entry || disposed) return false;

		const look = catalog.resolveLookAt(entry.key, {
			observerPc: ZERO_PC,
			distancePc: CONSTELLATION_TARGET_DISTANCE_PC,
		});
		if (!look) return false;
		selectedImageUpIcrs = look.upIcrs;

		onStatus(`Centering ${entry.label}…`);
		await viewer.actions.invoke(SKYKIT_ACTIONS.observer.recenterParallax, undefined, {
			source: 'website.parallax',
		});
		viewer.requestViewState({
			observerPc: ZERO_PC,
			targetPc: look.targetPc,
			orientationIcrs: look.orientationIcrs,
			aspectRatio: resolveAspectRatio(mount),
		}, 'website.parallax.constellation');
		constellationArt.setSelection(entry.key);
		onStatus(`${entry.label} selected. Stars are streaming through the alpha SkyKit stack.`);
		return true;
	}

	async function onTiltButtonClick() {
		if (!tiltButton || !showDeviceOrientationUi) return;
		tiltButton.disabled = true;
		onStatus('Requesting device motion…');
		try {
			const results = await viewer.actions.invoke(SKYKIT_ACTIONS.observer.enableParallaxTilt, undefined, {
				source: 'website.parallax',
			});
			const firstValue = results.find((result) => result.status === 'fulfilled')?.value;
			const ok = firstValue?.ok !== false;
			onStatus(ok ? 'Device motion enabled.' : 'Device motion is not available on this device.');
		} catch (error) {
			onStatus(error instanceof Error ? error.message : String(error));
		} finally {
			tiltButton.disabled = false;
		}
	}

	async function dispose() {
		if (disposed) return;
		disposed = true;
		window.removeEventListener('resize', onResize);
		tiltButton?.removeEventListener('click', onTiltButtonClick);
		unsubscribeStatus?.();
		loop.dispose();
		await viewer.dispose();
		provider.dispose?.();
	}
}

function resizeViewer(viewer, renderer, camera, mount) {
	const width = Math.max(1, mount.clientWidth || 1);
	const height = Math.max(1, mount.clientHeight || 1);
	const aspectRatio = width / height;
	camera.aspect = aspectRatio;
	camera.updateProjectionMatrix();
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	viewer.resize({
		width,
		height,
		devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
	});
	viewer.requestViewState({ aspectRatio }, 'website.parallax.resize');
}

function summarizeViewerStatus(viewer) {
	const snapshot = viewer.getSnapshot();
	const starLayer = snapshot.parts.find((part) => part.id === 'parallax-streamed-stars');
	const layerSnapshot = starLayer?.snapshot;
	const status = layerSnapshot?.status;
	const starCount = layerSnapshot?.renderer?.starCount ?? 0;
	if (status === 'current') {
		return `Current: ${starCount.toLocaleString()} stars loaded for this view.`;
	}
	if (status === 'streaming') {
		return `Streaming stars… ${starCount.toLocaleString()} loaded.`;
	}
	if (status === 'failed') {
		return layerSnapshot.lastError ?? 'Star stream failed.';
	}
	return null;
}

function resolveAspectRatio(element) {
	const width = Math.max(1, element.clientWidth || 1);
	const height = Math.max(1, element.clientHeight || 1);
	return width / height;
}

function vectorLength(value) {
	return Math.hypot(value.x, value.y, value.z);
}
