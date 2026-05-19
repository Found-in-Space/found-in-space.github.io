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
import {
	OCTREE_DEFAULT,
	createStarOctreeProviderService,
} from '@found-in-space/star-octree-provider';
import { createObserverShellStrategy } from '@found-in-space/star-trees';
import { createThreeStarField } from '@found-in-space/three-star-field';

const UNITS_PER_PARSEC = 0.001;
const LIMITING_MAGNITUDE = 7.5;
const VERTICAL_FOV_DEG = 58;
const LY_PER_PC = 3.2615637775591093;
const ZERO_PC = Object.freeze({ x: 0, y: 0, z: 0 });
const SOLAR_ORIGIN_PC = ZERO_PC;
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
const HYADES_CENTER_PC = Object.freeze({ x: 17.574, y: 42.316, z: 13.963 });
const ORION_NEBULA_PC = Object.freeze({ x: 44.371, y: 409.774, z: -38.889 });

const VIEWPOINTS = [
	{
		id: 'inside',
		label: 'Inside the bubble',
		centerPc: SOLAR_ORIGIN_PC,
		orbitRadius: 8,
		angularSpeed: 0.26,
		flySpeed: 120,
	},
	{
		id: 'outside',
		label: 'Outside the bubble',
		centerPc: SOLAR_ORIGIN_PC,
		orbitRadius: 175,
		angularSpeed: 0.06,
		flySpeed: 180,
	},
	{
		id: 'hyades',
		label: 'The Hyades',
		centerPc: HYADES_CENTER_PC,
		orbitRadius: 15,
		angularSpeed: 0.20,
		flySpeed: 120,
	},
	{
		id: 'home',
		label: 'Return home',
		centerPc: SOLAR_ORIGIN_PC,
		orbitRadius: 8,
		angularSpeed: 0.26,
		flySpeed: 120,
	},
];

const SCENES = Object.fromEntries(VIEWPOINTS.map((viewpoint) => [viewpoint.id, viewpoint]));
const VIEWPOINT_BY_ID = new Map(VIEWPOINTS.map((viewpoint) => [viewpoint.id, viewpoint]));

/**
 * Mount the radio bubble tour viewer.
 *
 * @param {HTMLElement} mount
 * @param {object}      options
 * @param {(id: string|null) => void}  [options.onViewpointChange]
 * @param {(msg: string) => void}      [options.onStatus]
 * @returns {Promise<{ viewer: object, goTo: (id: string) => void, viewpoints: typeof VIEWPOINTS, radiusPc: number, radiusLy: number }>}
 */
export async function mountRadioBubbleViewer(mount, options = {}) {
	const onViewpointChange = typeof options.onViewpointChange === 'function'
		? options.onViewpointChange
		: () => {};
	const onStatus = typeof options.onStatus === 'function'
		? options.onStatus
		: () => {};

	onStatus('Creating SkyKit viewer...');
	const initialAspectRatio = resolveAspectRatio(mount);
	const initialOrientationIcrs = computeLookAtOrientation(SOLAR_ORIGIN_PC, ORION_NEBULA_PC, ICRS_NORTH);
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setClearColor(0x02040b, 1);
	const camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, initialAspectRatio, 0.0001, 1000);
	const provider = createStarOctreeProviderService({
		url: OCTREE_DEFAULT,
		persistentCache: 'on',
	});
	const starField = createThreeStarField({ limitingMagnitude: LIMITING_MAGNITUDE, exposure: 2500 });
	const { group: bubbleGroup, radiusPc, radiusLy } = createRadioBubbleMeshes();
	let disposed = false;

	const viewer = await createSkykitViewer({
		id: 'website-radio-bubble-alpha',
		host: mount,
		renderer,
		camera,
		view: {
			observerPc: SOLAR_ORIGIN_PC,
			targetPc: ORION_NEBULA_PC,
			orientationIcrs: initialOrientationIcrs,
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
				attributes: ['position', 'magAbs', 'teffLog8'],
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
			createSkykitNavigationPlugin({ speed: 120, acceleration: 80, deceleration: 60 }),
			createSkyGrabPlugin({
				target: mount,
				sensitivityRadiansPerPixel: 0.00075,
			}),
			createSkykitJourneyPlugin({
				id: 'radio-bubble-journey',
				scenes: SCENES,
				initialSceneId: 'inside',
				onScene(scene, context) {
					void applyJourneyScene(scene, context, onViewpointChange).catch((err) => {
						console.error('[website:radio-bubble-journey]', err);
					});
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
		if (!VIEWPOINT_BY_ID.has(id)) return;
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
			devicePixelRatio: window.devicePixelRatio || 1,
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

	return { viewer, goTo, viewpoints: VIEWPOINTS, radiusPc, radiusLy };
}

/**
 * @param {import('@found-in-space/journey').JourneySceneSpec | Record<string, unknown> | null} scene
 * @param {import('@found-in-space/skykit').SkykitThreePluginContext} context
 * @param {(id: string|null) => void} onViewpointChange
 * @returns {Promise<void>}
 */
async function applyJourneyScene(scene, context, onViewpointChange) {
	const sceneId = typeof scene?.sceneId === 'string' ? scene.sceneId : null;
	const viewpoint = sceneId ? VIEWPOINT_BY_ID.get(sceneId) : null;
	if (!viewpoint) return;

	onViewpointChange(viewpoint.id);
	await context.actions.invoke(SKYKIT_ACTIONS.navigation.cancel, null, {
		source: 'website.radioBubble.journey',
	});
	await context.actions.invoke(SKYKIT_ACTIONS.navigation.lockAt, {
		...viewpoint.centerPc,
		up: ICRS_NORTH,
		dwellSecs: 5,
		recenterSpeed: 0.06,
	}, {
		source: 'website.radioBubble.journey',
	});
	await startSceneOrbit(context, viewpoint);
}

async function startSceneOrbit(context, viewpoint) {
	const center = viewpoint.centerPc;
	const radius = viewpoint.orbitRadius;
	const current = context.getViewState().observerPc;
	const currentRadius = distanceBetween(current, center);
	const orbitPayload = {
		center,
		radius,
		orbitNormal: ICRS_NORTH,
		angularSpeed: viewpoint.angularSpeed,
	};
	const metadata = { source: 'website.radioBubble.journey' };

	if (currentRadius <= radius * 1.01) {
		if (Math.abs(currentRadius - radius) <= radius * 0.03) {
			await context.actions.invoke(SKYKIT_ACTIONS.navigation.orbit, orbitPayload, metadata);
			return;
		}

		const target = pointOnOrbitRadius(center, current, radius);
		await context.actions.invoke(SKYKIT_ACTIONS.navigation.flyTo, {
			...target,
			speed: viewpoint.flySpeed,
			deceleration: 2.5,
			arrivalThreshold: 0.1,
			onArrive() {
				void context.actions.invoke(SKYKIT_ACTIONS.navigation.orbit, orbitPayload, metadata);
			},
		}, metadata);
		return;
	}

	await context.actions.invoke(SKYKIT_ACTIONS.navigation.orbitalInsert, {
		...orbitPayload,
		approachSpeed: viewpoint.flySpeed,
		deceleration: 2.5,
	}, metadata);
}

function createRadioBubbleMeshes(options = {}) {
	const epochYear = options.epochYear ?? 1895;
	const currentYear = options.currentYear ?? 2026;
	const fillColor = options.fillColor ?? 0x2299ff;
	const fillOpacity = options.fillOpacity ?? 0.05;
	const wireColor = options.wireColor ?? 0x55ccff;
	const wireOpacity = options.wireOpacity ?? 0.22;
	const radiusLy = currentYear - epochYear;
	const radiusPc = radiusLy / LY_PER_PC;
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

function computeLookAtOrientation(observerPc, targetPc, upIcrs = ICRS_NORTH) {
	const direction = new THREE.Vector3(
		targetPc.x - observerPc.x,
		targetPc.y - observerPc.y,
		targetPc.z - observerPc.z,
	);
	if (direction.lengthSq() === 0) return { x: 0, y: 0, z: 0, w: 1 };

	const scratch = new THREE.Object3D();
	scratch.position.set(0, 0, 0);
	scratch.up.set(upIcrs.x, upIcrs.y, upIcrs.z);
	scratch.lookAt(direction);
	return {
		x: scratch.quaternion.x,
		y: scratch.quaternion.y,
		z: scratch.quaternion.z,
		w: scratch.quaternion.w,
	};
}

function distanceBetween(a, b) {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function pointOnOrbitRadius(center, current, radius) {
	const dx = current.x - center.x;
	const dy = current.y - center.y;
	const dz = current.z - center.z;
	const length = Math.hypot(dx, dy, dz);
	const nx = length > 1e-6 ? dx / length : 1;
	const ny = length > 1e-6 ? dy / length : 0;
	const nz = length > 1e-6 ? dz / length : 0;
	return {
		x: center.x + nx * radius,
		y: center.y + ny * radius,
		z: center.z + nz * radius,
	};
}

function resolveAspectRatio(mount) {
	const width = mount.clientWidth || 1;
	const height = mount.clientHeight || 1;
	return width / height;
}
