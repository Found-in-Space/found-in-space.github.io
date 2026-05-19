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
const MAX_DEVICE_PIXEL_RATIO = 2;
const STAR_SESSION_ID = 'website-learn-astrophage';
const STAR_ATTRIBUTES = Object.freeze(['position', 'magAbs', 'teffLog8']);
const ICRS_NORTH = Object.freeze({ x: 0, y: 0, z: 1 });
const IDENTITY_ORIENTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

// ICRS parsec positions for the real stars in the fictional infection chain.
const STARS = {
	sol: { label: 'Sol', pc: { x: 0, y: 0, z: 0 } },
	tauCet: { label: 'Tau Ceti', pc: { x: 3.154460107907653, y: 1.5391502529382706, z: -1.002060948 } },
	epsEri: { label: 'Epsilon Eri', pc: { x: 1.8990489188581705, y: 2.541125984862447, z: -0.528486271 } },
	keid: { label: '40 Eridani', pc: { x: 2.1804124116897583, y: 4.432736895978451, z: -0.665108382 } },
	sirius: { label: 'Sirius', pc: { x: -0.494206324, y: 2.4767243303358555, z: -0.75873686 } },
	wise0855: { label: 'WISE 0855-0714', pc: { x: -1.562884194, y: 1.63211063, z: -0.287158773 } },
	wolf359: { label: 'Wolf 359', pc: { x: -2.299204003, y: 0.6548070814460516, z: 0.29364819056354463 } },
	lalande: { label: 'Lalande 21185', pc: { x: -1.998496009, y: 0.50454837, z: 1.4947312884032726 } },
	ross128: { label: 'Ross 128', pc: { x: -3.369750688, y: 0.18027640180662274, z: 0.047068897 } },
};

const INFECTION_LINKS = [
	['tauCet', 'epsEri'],
	['tauCet', 'keid'],
	['epsEri', 'sirius'],
	['sirius', 'wise0855'],
	['wise0855', 'sol'],
	['wise0855', 'wolf359'],
	['wise0855', 'lalande'],
	['wise0855', 'ross128'],
];

const CHAPTER_REVEAL = {
	'sol-dimming': { stars: ['sol'], links: [] },
	'tau-ceti-sky': { stars: ['sol', 'tauCet'], links: [] },
	'tau-ceti-arrive': { stars: ['sol', 'tauCet'], links: [] },
	'inner-spread': {
		stars: ['sol', 'tauCet', 'epsEri', 'keid'],
		links: [['tauCet', 'epsEri'], ['tauCet', 'keid']],
	},
	'sirius-wise': {
		stars: ['sol', 'tauCet', 'epsEri', 'keid', 'sirius', 'wise0855'],
		links: [['tauCet', 'epsEri'], ['tauCet', 'keid'], ['epsEri', 'sirius'], ['sirius', 'wise0855']],
	},
	'final-spread': { stars: Object.keys(STARS), links: INFECTION_LINKS },
	'keid-lookback': { stars: Object.keys(STARS), links: INFECTION_LINKS },
};

const SCENES = {
	'sol-dimming': {
		label: 'The Sun is dimming',
		view: {
			observerPc: { x: 2, y: 0, z: 0 },
			targetPc: STARS.sol.pc,
			orientationIcrs: computeSpatialLookAtOrientation({
				position: { x: 2, y: 0, z: 0 },
				target: STARS.sol.pc,
				up: ICRS_NORTH,
			}) ?? IDENTITY_ORIENTATION,
		},
		camera: {
			type: 'orbit',
			center: STARS.sol.pc,
			radiusPc: 2,
			angularSpeedRadPerSec: 0.25,
			lookAt: STARS.sol.pc,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
		travel: { durationSecs: 3 },
	},
	'tau-ceti-sky': {
		label: 'Where it began',
		view: {
			targetPc: STARS.tauCet.pc,
		},
		navigation: {
			transitionTo: {
				observerPc: STARS.sol.pc,
				orientationIcrs: computeSpatialLookAtOrientation({
					position: STARS.sol.pc,
					target: STARS.tauCet.pc,
					up: ICRS_NORTH,
				}) ?? IDENTITY_ORIENTATION,
				durationSecs: 2.5,
				movement: { durationSecs: 2.5 },
				orientationTransition: { durationSecs: 2.5 },
			},
		},
	},
	'tau-ceti-arrive': {
		label: 'Patient zero',
		camera: {
			type: 'orbit',
			center: STARS.tauCet.pc,
			radiusPc: 1,
			angularSpeedRadPerSec: 0.22,
			lookAt: STARS.tauCet.pc,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
		travel: { durationSecs: 3.5 },
	},
	'inner-spread': {
		label: 'The nearest victims',
		camera: {
			type: 'orbit',
			center: STARS.tauCet.pc,
			radiusPc: 5,
			angularSpeedRadPerSec: 0.10,
			lookAt: STARS.tauCet.pc,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
		travel: { durationSecs: 4 },
	},
	'sirius-wise': {
		label: 'Sirius and WISE 0855',
		camera: {
			type: 'orbit',
			center: { x: -1.0, y: 2.0, z: -0.5 },
			radiusPc: 6,
			angularSpeedRadPerSec: 0.08,
			lookAt: { x: -1.0, y: 2.0, z: -0.5 },
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
		travel: { durationSecs: 4.5 },
	},
	'final-spread': {
		label: 'The Sun falls',
		camera: {
			type: 'orbit',
			center: { x: -0.8, y: 0.8, z: 0.2 },
			radiusPc: 11.5,
			angularSpeedRadPerSec: 0.05,
			lookAt: { x: -0.8, y: 0.8, z: 0.2 },
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
		travel: { durationSecs: 5 },
	},
	'keid-lookback': {
		label: 'Looking back at the Sun',
		camera: {
			type: 'orbit',
			center: STARS.keid.pc,
			radiusPc: 0.5,
			angularSpeedRadPerSec: 0.18,
			lookAt: STARS.sol.pc,
			normal: ICRS_NORTH,
			dwellSecs: 5,
		},
		travel: { durationSecs: 5 },
	},
};

const CHAPTER_IDS = Object.freeze(Object.keys(SCENES));
const CHAPTERS = new Set(CHAPTER_IDS);
const ASTROPHAGE_JOURNEY = createJourney({
	id: 'website-astrophage-journey',
	title: 'The astrophage infestation',
	order: CHAPTER_IDS,
	scenes: SCENES,
	travel: { type: 'orbit-transfer', durationSecs: 4 },
});

const MARKER_SIZE_PC = 0.12;
const LABEL_OFFSET_PC = 0.18;
const INFECTION_COLOR = 0xff4444;

/**
 * @param {HTMLElement} mount
 * @param {object} options
 * @param {(msg: string) => void} [options.onStatus]
 * @returns {Promise<{ viewer: object, goTo: (id: string) => void, dispose: () => Promise<void> }>}
 */
export async function mountAstrophageViewer(mount, options = {}) {
	const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

	onStatus('Creating SkyKit viewer...');
	const initialAspectRatio = resolveAspectRatio(mount);
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setClearColor(0x02040b, 1);
	const camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, initialAspectRatio, 0.0001, 1000);
	const provider = createStarOctreeProviderService({
		url: OCTREE_DEFAULT,
		persistentCache: 'on',
	});
	const starField = createThreeStarField({
		limitingMagnitude: LIMITING_MAGNITUDE,
		exposure: 2500,
	});
	const annotations = buildAnnotations();
	let disposed = false;

	applyChapterVisibility('sol-dimming', annotations);

	const viewer = await createSkykitViewer({
		id: 'website-astrophage-alpha',
		host: mount,
		renderer,
		camera,
		view: {
			...SCENES['sol-dimming'].view,
			coordinateUnitsPerParsec: UNITS_PER_PARSEC,
			limitingMagnitude: LIMITING_MAGNITUDE,
			verticalFovDeg: VERTICAL_FOV_DEG,
			aspectRatio: initialAspectRatio,
		},
		plugins: [
			createStreamingStarsPlugin({
				id: 'astrophage-streamed-stars',
				provider,
				renderer: starField,
				attributes: STAR_ATTRIBUTES,
				session: {
					id: STAR_SESSION_ID,
					strategy: createObserverShellStrategy(),
				},
			}),
			createObject3dPlugin({
				id: 'astrophage-annotations',
				object3d: annotations.group,
				anchorMode: 'world-space',
				disposeObject: true,
			}),
			createSkykitNavigationPlugin({ speed: 120, acceleration: 80, deceleration: 60 }),
			createSkyGrabPlugin({
				target: mount,
				sensitivityRadiansPerPixel: 0.00075,
			}),
			createSkykitJourneyPlugin({
				id: 'astrophage-journey',
				journey: ASTROPHAGE_JOURNEY,
				onScene(scene) {
					const sceneId = typeof scene?.sceneId === 'string' ? scene.sceneId : null;
					if (sceneId) applyChapterVisibility(sceneId, annotations);
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
		if (!CHAPTERS.has(id)) return;
		void viewer.actions.invoke(SKYKIT_ACTIONS.journey.goToChapter, id, {
			source: 'website.astrophage',
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
		viewer.requestViewState({ aspectRatio }, 'website.astrophage.resize');
	}

	async function dispose() {
		if (disposed) return;
		disposed = true;
		window.removeEventListener('resize', resize);
		window.removeEventListener('beforeunload', destroy);
		loop.dispose();
		await viewer.dispose();
		await provider.dispose?.();
	}

	function destroy() {
		void dispose().catch((err) => {
			console.error('[website:astrophage-cleanup]', err);
		});
	}

	return { viewer, goTo, dispose };
}

function buildAnnotations() {
	const group = new THREE.Group();
	group.name = 'astrophage-annotations';

	const circleTexture = createCircleTexture();
	const markerMaterial = new THREE.SpriteMaterial({
		map: circleTexture,
		transparent: true,
		depthTest: false,
		sizeAttenuation: true,
	});

	const markers = {};
	const labels = {};

	for (const [key, star] of Object.entries(STARS)) {
		const pos = toRenderPosition(star.pc);
		const markerScale = MARKER_SIZE_PC * UNITS_PER_PARSEC;

		const marker = new THREE.Sprite(markerMaterial.clone());
		marker.position.copy(pos);
		marker.scale.set(markerScale, markerScale, 1);
		marker.renderOrder = 900;
		marker.visible = false;
		group.add(marker);
		markers[key] = marker;

		const { texture, width, height } = createLabelTexture(star.label);
		const labelMat = new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
			depthTest: false,
			sizeAttenuation: true,
		});
		const label = new THREE.Sprite(labelMat);
		const labelScale = LABEL_OFFSET_PC * UNITS_PER_PARSEC;
		const aspect = width / height;
		label.scale.set(labelScale * aspect, labelScale, 1);
		label.position.copy(pos);
		label.position.z += MARKER_SIZE_PC * UNITS_PER_PARSEC * 0.8;
		label.renderOrder = 901;
		label.visible = false;
		group.add(label);
		labels[key] = label;
	}

	const lineGroup = new THREE.Group();
	lineGroup.name = 'infection-lines';
	const lineMeshes = [];

	for (const [fromKey, toKey] of INFECTION_LINKS) {
		const fromPos = toRenderPosition(STARS[fromKey].pc);
		const toPos = toRenderPosition(STARS[toKey].pc);
		const geometry = new THREE.BufferGeometry().setFromPoints([fromPos, toPos]);
		const material = new THREE.LineBasicMaterial({
			color: INFECTION_COLOR,
			transparent: true,
			opacity: 0.7,
			depthTest: false,
		});
		const line = new THREE.Line(geometry, material);
		line.renderOrder = 899;
		line.visible = false;
		lineGroup.add(line);
		lineMeshes.push({ fromKey, toKey, line });
	}
	group.add(lineGroup);

	return { group, markers, labels, lineMeshes };
}

function applyChapterVisibility(chapterId, annotations) {
	const reveal = CHAPTER_REVEAL[chapterId];
	if (!reveal) return;

	for (const [key, marker] of Object.entries(annotations.markers)) {
		const show = reveal.stars.includes(key);
		marker.visible = show;
		annotations.labels[key].visible = show;
	}

	for (const entry of annotations.lineMeshes) {
		entry.line.visible = reveal.links.some(
			([fromKey, toKey]) => fromKey === entry.fromKey && toKey === entry.toKey,
		);
	}
}

function toRenderPosition(pc) {
	return new THREE.Vector3(
		pc.x * UNITS_PER_PARSEC,
		pc.y * UNITS_PER_PARSEC,
		pc.z * UNITS_PER_PARSEC,
	);
}

function createCircleTexture(size = 64) {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	const cx = size / 2;
	const r = size / 2 - 4;
	ctx.strokeStyle = 'rgba(242, 200, 121, 0.9)';
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.arc(cx, cx, r, 0, Math.PI * 2);
	ctx.stroke();
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	return texture;
}

function createLabelTexture(text) {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	const fontSize = 40;
	ctx.font = `bold ${fontSize}px "Avenir Next", "Avenir", system-ui, sans-serif`;
	const measured = ctx.measureText(text);
	const pad = 16;
	canvas.width = measured.width + pad * 2;
	canvas.height = fontSize + pad;
	ctx.font = `bold ${fontSize}px "Avenir Next", "Avenir", system-ui, sans-serif`;
	ctx.fillStyle = '#f2c879';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, pad, canvas.height / 2);
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	return { texture, width: canvas.width, height: canvas.height };
}

function resolveAspectRatio(element) {
	const width = Math.max(1, element.clientWidth || 1);
	const height = Math.max(1, element.clientHeight || 1);
	return width / height;
}
