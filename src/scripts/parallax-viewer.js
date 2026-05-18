import * as THREE from 'three';

import {
	loadAnchoredImageManifest,
	buildAnchoredImageDirectionResolver,
	icrsDirectionToTargetPc,
} from '@found-in-space/anchored-image';
import {
	createAnchoredImageGroup,
	disposeAnchoredImageObject,
} from '@found-in-space/anchored-image/three';
import {
	SKYKIT_ACTIONS,
	createObject3dPlugin,
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
import { computeSpatialLookAtOrientation } from '@found-in-space/spatial';
import { createThreeStarField } from '@found-in-space/three-star-field';

import { showDeviceOrientationUi } from './device-capabilities.js';

const ZERO_PC = Object.freeze({ x: 0, y: 0, z: 0 });
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
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
	const manifest = await loadAnchoredImageManifest({
		manifest: westernSkycultureAnchoredImageManifest,
	});
	const resolver = buildAnchoredImageDirectionResolver(manifest);
	const constellations = buildConstellationCatalog(resolver);
	const defaultIau = constellations.some((entry) => entry.iau === 'Ori')
		? 'Ori'
		: constellations[0]?.iau ?? null;
	const initialConstellation = getCatalogEntry(constellations, defaultIau);
	const initialTargetPc = resolveConstellationTargetPc(initialConstellation);
	let selectedImageUpIcrs = resolveConstellationUpIcrs(initialConstellation);
	const initialAspectRatio = resolveAspectRatio(mount);
	const initialOrientationIcrs = computeLookAtOrientation(ZERO_PC, initialTargetPc, selectedImageUpIcrs);

	onStatus('Creating SkyKit viewer…');
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setClearColor(0x02040b, 1);
	const camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, initialAspectRatio, 0.0001, 1000);
	const provider = createStarOctreeProviderService({ url: OCTREE_DEFAULT });
	const starField = createThreeStarField({
		limitingMagnitude: LIMITING_MAGNITUDE,
		exposure: 2500,
	});
	const artRoot = new THREE.Group();
	artRoot.name = 'selected-constellation-art';

	let artRequestToken = 0;
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
			createObject3dPlugin({
				id: 'selected-constellation-art',
				object3d: artRoot,
				anchorMode: 'observer-centric',
			}),
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

	async function setConstellation(iau) {
		const entry = getCatalogEntry(constellations, iau);
		if (!entry || disposed) return false;

		const targetPc = resolveConstellationTargetPc(entry);
		selectedImageUpIcrs = resolveConstellationUpIcrs(entry);
		const orientationIcrs = computeLookAtOrientation(ZERO_PC, targetPc, selectedImageUpIcrs);

		onStatus(`Centering ${entry.label}…`);
		await viewer.actions.invoke(SKYKIT_ACTIONS.observer.recenterParallax, undefined, {
			source: 'website.parallax',
		});
		viewer.requestViewState({
			observerPc: ZERO_PC,
			targetPc,
			orientationIcrs,
			aspectRatio: resolveAspectRatio(mount),
		}, 'website.parallax.constellation');

		const requestToken = artRequestToken + 1;
		artRequestToken = requestToken;
		const group = await createSelectedConstellationArt(manifest, entry.iau);
		if (disposed || requestToken !== artRequestToken) {
			disposeAnchoredGroup(group);
			return false;
		}
		replaceArtGroup(artRoot, group);
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
		artRequestToken += 1;
		window.removeEventListener('resize', onResize);
		tiltButton?.removeEventListener('click', onTiltButtonClick);
		unsubscribeStatus?.();
		loop.dispose();
		await viewer.dispose();
		provider.dispose?.();
		disposeAnchoredGroup(artRoot);
	}
}

function buildConstellationCatalog(resolver) {
	return resolver.listImages()
		.filter((entry) => typeof entry.iau === 'string' && Array.isArray(entry.centroidIcrs))
		.map((entry) => ({
			iau: entry.iau,
			label: resolveConstellationLabel(entry),
			centroidIcrs: entry.centroidIcrs,
			imageUpIcrs: vector3FromIcrs(entry.imageUpIcrs),
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
}

function resolveConstellationLabel(entry) {
	if (entry.name && typeof entry.name === 'object') {
		return entry.name.native ?? entry.name.english ?? entry.label ?? entry.iau;
	}
	return entry.label ?? entry.iau;
}

function getCatalogEntry(catalog, iau) {
	return catalog.find((entry) => entry.iau === iau) ?? catalog[0] ?? null;
}

function resolveConstellationTargetPc(entry) {
	if (!entry) return { ...ORION_REFERENCE_PC };
	return icrsDirectionToTargetPc(entry.centroidIcrs, CONSTELLATION_TARGET_DISTANCE_PC, ZERO_PC)
		?? { ...ORION_REFERENCE_PC };
}

function resolveConstellationUpIcrs(entry) {
	return entry?.imageUpIcrs ?? ICRS_NORTH;
}

function computeLookAtOrientation(position, target, upIcrs = ICRS_NORTH) {
	return computeSpatialLookAtOrientation({
		position,
		target,
		up: upIcrs ?? ICRS_NORTH,
	}) ?? { x: 0, y: 0, z: 0, w: 1 };
}

async function createSelectedConstellationArt(manifest, iau) {
	const group = await createAnchoredImageGroup({
		id: `selected-constellation-${iau}`,
		manifest,
		iauFilter: [iau],
		radius: ART_RADIUS,
		opacity: 0.24,
		cutoff: 0.05,
		subdivisions: 5,
		skipTextureErrors: true,
		onTextureError({ image, error }) {
			console.warn('[website:parallax-art]', image.id, error);
		},
	});
	group.name = `selected-constellation-${iau}`;
	return group;
}

function replaceArtGroup(root, group) {
	disposeAnchoredGroup(root);
	root.clear();
	root.add(group);
}

function disposeAnchoredGroup(group) {
	if (!group) return;
	group.userData?.anchoredImage?.dispose?.();
	for (const child of [...group.children]) {
		disposeAnchoredGroup(child);
		disposeAnchoredImageObject(child);
		child.parent?.remove(child);
	}
	group.clear?.();
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

function vector3FromIcrs(value) {
	if (!Array.isArray(value) || value.length < 3) return null;
	const x = Number(value[0]);
	const y = Number(value[1]);
	const z = Number(value[2]);
	return [x, y, z].every(Number.isFinite) && Math.hypot(x, y, z) > 0
		? { x, y, z }
		: null;
}
