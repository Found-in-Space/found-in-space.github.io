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
import { createObserverShellStrategy } from '@found-in-space/star-trees';
import { createThreeStarField } from '@found-in-space/three-star-field';

const UNITS_PER_PARSEC = 0.001;
const LIMITING_MAGNITUDE = 7.5;
const VERTICAL_FOV_DEG = 58;
const LY_PER_PC = 3.2615637775591093;
const MAX_RENDER_FPS = 30;
const MAX_DEVICE_PIXEL_RATIO = 2;
const ZERO_PC = Object.freeze({ x: 0, y: 0, z: 0 });
const SOLAR_ORIGIN_PC = ZERO_PC;
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
const HYADES_CENTER_PC = Object.freeze({ x: 17.574, y: 42.316, z: 13.963 });
const ORION_NEBULA_PC = Object.freeze({ x: 44.371, y: 409.774, z: -38.889 });

const TARGETS = {
	sun: { positionPc: SOLAR_ORIGIN_PC },
	hyades: { positionPc: HYADES_CENTER_PC },
	orion: { positionPc: ORION_NEBULA_PC },
};

const SCENES = {
	inside: {
		label: 'Inside the bubble',
		camera: {
			type: 'orbit',
			center: 'sun',
			radiusPc: 8,
			angularSpeedRadPerSec: 0.26,
			lookAt: 'sun',
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
	outside: {
		label: 'Outside the bubble',
		camera: {
			type: 'orbit',
			center: 'sun',
			radiusPc: 175,
			angularSpeedRadPerSec: 0.06,
			lookAt: 'sun',
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
	hyades: {
		label: 'The Hyades',
		camera: {
			type: 'orbit',
			center: 'hyades',
			radiusPc: 15,
			angularSpeedRadPerSec: 0.20,
			lookAt: 'hyades',
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
	home: {
		label: 'Return home',
		camera: {
			type: 'orbit',
			center: 'sun',
			radiusPc: 8,
			angularSpeedRadPerSec: 0.26,
			lookAt: 'sun',
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
};

const RADIO_BUBBLE_JOURNEY = createJourney({
	initial: 'inside',
	order: ['inside', 'outside', 'hyades', 'home'],
	targets: TARGETS,
	scenes: SCENES,
	travel: { type: 'orbit-transfer', durationSecs: 5 },
});
const VIEWPOINTS = RADIO_BUBBLE_JOURNEY.order.map((id) => ({
	id,
	label: SCENES[id].label,
}));
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
				journey: RADIO_BUBBLE_JOURNEY,
				onScene(scene) {
					const sceneId = typeof scene?.sceneId === 'string' ? scene.sceneId : null;
					if (sceneId && VIEWPOINT_BY_ID.has(sceneId)) onViewpointChange(sceneId);
				},
			}),
		],
	});

	const loop = createSkykitAnimationLoop(viewer, { maxFramesPerSecond: MAX_RENDER_FPS });
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

	return { viewer, goTo, viewpoints: VIEWPOINTS, radiusPc, radiusLy };
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

function resolveAspectRatio(mount) {
	const width = mount.clientWidth || 1;
	const height = mount.clientHeight || 1;
	return width / height;
}
