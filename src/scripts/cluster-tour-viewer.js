import * as THREE from 'three';

import {
	SKYKIT_ACTIONS,
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
const MAX_DEVICE_PIXEL_RATIO = 2;
const STAR_SESSION_ID = 'website-learn-star-clusters';
const STAR_ATTRIBUTES = Object.freeze(['position', 'magAbs', 'teffLog8']);
const ZERO_PC = Object.freeze({ x: 0, y: 0, z: 0 });
const SOLAR_ORIGIN_PC = ZERO_PC;
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
const ORION_NEBULA_PC = Object.freeze({ x: 44.371, y: 409.774, z: -38.889 });
const UPPER_SCO_CENTER_PC = Object.freeze({ x: -60.596, y: -118.925, z: -56.656 });
const PLEIADES_CENTER_PC = Object.freeze({ x: 67.379, y: 103.162, z: 55.161 });
const HYADES_CENTER_PC = Object.freeze({ x: 17.574, y: 42.316, z: 13.963 });
const OMEGA_CEN_CENTER_PC = Object.freeze({ x: -3290.566, y: -1309.263, z: -3862.073 });

const SCENES = {
	start: {
		label: 'The solar neighbourhood',
		view: {
			observerPc: { x: 8, y: 0, z: 0 },
			targetPc: SOLAR_ORIGIN_PC,
			orientationIcrs: computeLookAtOrientation({ x: 8, y: 0, z: 0 }, SOLAR_ORIGIN_PC, ICRS_NORTH),
		},
		camera: {
			type: 'orbit',
			center: SOLAR_ORIGIN_PC,
			radiusPc: 8,
			angularSpeedRadPerSec: 0.26,
			lookAt: SOLAR_ORIGIN_PC,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
	'orion-nebula': {
		label: 'Orion Nebula',
		camera: {
			type: 'orbit',
			center: ORION_NEBULA_PC,
			radiusPc: 100,
			angularSpeedRadPerSec: 0.12,
			lookAt: ORION_NEBULA_PC,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
	'upper-sco': {
		label: 'Upper Scorpius',
		camera: {
			type: 'orbit',
			center: UPPER_SCO_CENTER_PC,
			radiusPc: 50,
			angularSpeedRadPerSec: 0.15,
			lookAt: UPPER_SCO_CENTER_PC,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
	pleiades: {
		label: 'Pleiades',
		camera: {
			type: 'orbit',
			center: PLEIADES_CENTER_PC,
			radiusPc: 25,
			angularSpeedRadPerSec: 0.18,
			lookAt: PLEIADES_CENTER_PC,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
	hyades: {
		label: 'Hyades',
		camera: {
			type: 'orbit',
			center: HYADES_CENTER_PC,
			radiusPc: 15,
			angularSpeedRadPerSec: 0.22,
			lookAt: HYADES_CENTER_PC,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
	'omega-cen': {
		label: 'Omega Centauri',
		camera: {
			type: 'orbit',
			center: OMEGA_CEN_CENTER_PC,
			radiusPc: 200,
			angularSpeedRadPerSec: 0.08,
			lookAt: OMEGA_CEN_CENTER_PC,
			normal: { x: 0, y: 0, z: 1 },
			dwellSecs: 5,
		},
	},
	'return-home': {
		label: 'Back to the Sun',
		camera: {
			type: 'orbit',
			center: SOLAR_ORIGIN_PC,
			radiusPc: 8,
			angularSpeedRadPerSec: 0.26,
			lookAt: SOLAR_ORIGIN_PC,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
	},
};

const CLUSTER_JOURNEY = createJourney({
	order: ['start', 'orion-nebula', 'upper-sco', 'pleiades', 'hyades', 'omega-cen', 'return-home'],
	scenes: SCENES,
	travel: { type: 'orbit-transfer', durationSecs: 5 },
	transitions: [
		{
			fromSceneId: 'hyades',
			toSceneId: 'omega-cen',
			travel: { durationSecs: 9 },
		},
		{
			fromSceneId: 'omega-cen',
			toSceneId: 'return-home',
			travel: { durationSecs: 10 },
		},
	],
});
const VIEWPOINTS = CLUSTER_JOURNEY.order.map((id) => ({
	id,
	label: SCENES[id].label,
}));
const VIEWPOINT_BY_ID = new Map(VIEWPOINTS.map((viewpoint) => [viewpoint.id, viewpoint]));

/**
 * Mount the cluster tour viewer.
 *
 * @param {HTMLElement} mount
 * @param {object}      options
 * @param {(id: string|null) => void}  [options.onClusterChange]
 * @param {(msg: string) => void}      [options.onStatus]
 * @returns {Promise<{ viewer: object, goTo: (id: string) => void, viewpoints: typeof VIEWPOINTS }>}
 */
export async function mountClusterTourViewer(mount, options = {}) {
	const onClusterChange = typeof options.onClusterChange === 'function'
		? options.onClusterChange
		: () => {};
	const onStatus = typeof options.onStatus === 'function'
		? options.onStatus
		: () => {};

	onStatus('Creating SkyKit viewer...');
	const initialAspectRatio = resolveAspectRatio(mount);
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setClearColor(0x02040b, 1);
	const camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, initialAspectRatio, 0.0001, 1000);
	const provider = createStarOctreeProviderService({
		url: OCTREE_DEFAULT,
		persistentCache: 'on',
	});
	const starField = createThreeStarField({ limitingMagnitude: LIMITING_MAGNITUDE, exposure: 2500 });
	let disposed = false;

	const viewer = await createSkykitViewer({
		id: 'website-cluster-tour-alpha',
		host: mount,
		renderer,
		camera,
		view: {
			...SCENES.start.view,
			coordinateUnitsPerParsec: UNITS_PER_PARSEC,
			limitingMagnitude: LIMITING_MAGNITUDE,
			verticalFovDeg: VERTICAL_FOV_DEG,
			aspectRatio: initialAspectRatio,
		},
		plugins: [
			createStreamingStarsPlugin({
				id: 'cluster-tour-streamed-stars',
				provider,
				renderer: starField,
				attributes: STAR_ATTRIBUTES,
				session: {
					id: STAR_SESSION_ID,
					strategy: createObserverShellStrategy(),
				},
			}),
			createSkykitNavigationPlugin({ speed: 600, acceleration: 240, deceleration: 180 }),
			createSkyGrabPlugin({
				target: mount,
				sensitivityRadiansPerPixel: 0.00075,
			}),
			createSkykitJourneyPlugin({
				id: 'cluster-tour-journey',
				journey: CLUSTER_JOURNEY,
				onScene(scene) {
					const sceneId = typeof scene?.sceneId === 'string' ? scene.sceneId : null;
					if (sceneId && VIEWPOINT_BY_ID.has(sceneId)) onClusterChange(sceneId);
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
			source: 'website.clusterTour',
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
		viewer.requestViewState({ aspectRatio }, 'website.clusterTour.resize');
	}

	function destroy() {
		if (disposed) return;
		disposed = true;
		window.removeEventListener('resize', resize);
		window.removeEventListener('beforeunload', destroy);
		loop.dispose();
		void viewer.dispose().catch((err) => {
			console.error('[website:cluster-tour-cleanup]', err);
		});
		void provider.dispose?.();
	}

	return { viewer, goTo, viewpoints: VIEWPOINTS };
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
