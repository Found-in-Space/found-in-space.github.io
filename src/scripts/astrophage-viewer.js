import * as THREE from 'three';
import {
	createCameraRigController,
	createDefaultStarFieldMaterialProfile,
	createFoundInSpaceDatasetOptions,
	createObserverShellField,
	createSceneOrientationTransforms,
	createSelectionRefreshController,
	createStarFieldLayer,
	createViewer,
	DEFAULT_STAR_FIELD_STATE,
	getDatasetSession,
	ORION_CENTER_PC,
	SOLAR_ORIGIN_PC,
	SCALE,
	resolveFoundInSpaceDatasetOverrides,
} from '@found-in-space/skykit';

const NO_KEYBOARD_EVENTS_TARGET = {
	addEventListener() {},
	removeEventListener() {},
};

const {
	icrsToScene: SCENE_TRANSFORM,
	sceneToIcrs: SCENE_TO_ICRS,
} = createSceneOrientationTransforms(ORION_CENTER_PC);

// ── Star data (ICRS parsec positions from the CSV) ──────────────────────────

const STARS = {
	sol:       { label: 'Sol',            pc: { x: 0, y: 0, z: 0 } },
	tauCet:    { label: 'Tau Ceti',       pc: { x: 3.154460107907653, y: 1.5391502529382706, z: -1.002060948 } },
	epsEri:    { label: 'Epsilon Eri',    pc: { x: 1.8990489188581705, y: 2.541125984862447, z: -0.528486271 } },
	keid:      { label: '40 Eridani',     pc: { x: 2.1804124116897583, y: 4.432736895978451, z: -0.665108382 } },
	sirius:    { label: 'Sirius',         pc: { x: -0.494206324, y: 2.4767243303358555, z: -0.75873686 } },
	wise0855:  { label: 'WISE 0855-0714', pc: { x: -1.562884194, y: 1.63211063, z: -0.287158773 } },
	wolf359:   { label: 'Wolf 359',       pc: { x: -2.299204003, y: 0.6548070814460516, z: 0.29364819056354463 } },
	lalande:   { label: 'Lalande 21185',  pc: { x: -1.998496009, y: 0.50454837, z: 1.4947312884032726 } },
	ross128:   { label: 'Ross 128',       pc: { x: -3.369750688, y: 0.18027640180662274, z: 0.047068897 } },
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

// Which stars and links appear at each chapter
const CHAPTER_REVEAL = {
	'sol-dimming':     { stars: ['sol'], links: [] },
	'tau-ceti-sky':    { stars: ['sol', 'tauCet'], links: [] },
	'tau-ceti-arrive': { stars: ['sol', 'tauCet'], links: [] },
	'inner-spread':    { stars: ['sol', 'tauCet', 'epsEri', 'keid'], links: [['tauCet', 'epsEri'], ['tauCet', 'keid']] },
	'sirius-wise':     { stars: ['sol', 'tauCet', 'epsEri', 'keid', 'sirius', 'wise0855'], links: [['tauCet', 'epsEri'], ['tauCet', 'keid'], ['epsEri', 'sirius'], ['sirius', 'wise0855']] },
	'final-spread':    { stars: Object.keys(STARS), links: INFECTION_LINKS },
	'keid-lookback':   { stars: Object.keys(STARS), links: INFECTION_LINKS },
};

// ── Camera presets per chapter ──────────────────────────────────────────────

const CHAPTER_CAMERA = {
	'sol-dimming': {
		type: 'orbit',
		center: STARS.sol.pc,
		orbitRadius: 2,
		angularSpeed: 0.25,
		flySpeed: 40,
	},
	'tau-ceti-sky': {
		type: 'flyAndLook',
		target: STARS.sol.pc,
		lookAt: STARS.tauCet.pc,
		flySpeed: 40,
	},
	'tau-ceti-arrive': {
		type: 'orbit',
		center: STARS.tauCet.pc,
		orbitRadius: 1,
		angularSpeed: 0.22,
		flySpeed: 60,
	},
	'inner-spread': {
		type: 'orbit',
		center: STARS.tauCet.pc,
		orbitRadius: 5,
		angularSpeed: 0.10,
		flySpeed: 60,
	},
	'sirius-wise': {
		type: 'orbit',
		center: { x: -1.0, y: 2.0, z: -0.5 },
		orbitRadius: 6,
		angularSpeed: 0.08,
		flySpeed: 70,
	},
	'final-spread': {
		type: 'orbit',
		center: { x: -0.8, y: 0.8, z: 0.2 },
		orbitRadius: 10,
		angularSpeed: 0.05,
		flySpeed: 80,
	},
	'keid-lookback': {
		type: 'orbit',
		center: STARS.keid.pc,
		orbitRadius: 0.5,
		angularSpeed: 0.18,
		flySpeed: 80,
		lookAt: STARS.sol.pc,
	},
};

// ── Scene helpers ───────────────────────────────────────────────────────────

function pcToScene(pc) {
	const [sx, sy, sz] = SCENE_TRANSFORM(pc.x, pc.y, pc.z);
	return new THREE.Vector3(sx * SCALE, sy * SCALE, sz * SCALE);
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

const MARKER_SIZE_PC = 0.12;
const LABEL_OFFSET_PC = 0.18;
const INFECTION_COLOR = 0xff4444;
const INFECTION_COLOR_FADED = 0xcc6644;

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
		const pos = pcToScene(star.pc);
		const markerScale = MARKER_SIZE_PC * SCALE;

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
		const labelScale = LABEL_OFFSET_PC * SCALE;
		const aspect = width / height;
		label.scale.set(labelScale * aspect, labelScale, 1);
		label.position.copy(pos);
		label.position.y += MARKER_SIZE_PC * SCALE * 0.8;
		label.renderOrder = 901;
		label.visible = false;
		group.add(label);
		labels[key] = label;
	}

	const lineGroup = new THREE.Group();
	lineGroup.name = 'infection-lines';
	const lineMeshes = [];

	for (const [fromKey, toKey] of INFECTION_LINKS) {
		const fromPos = pcToScene(STARS[fromKey].pc);
		const toPos = pcToScene(STARS[toKey].pc);
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

	const { markers, labels, lineMeshes } = annotations;

	for (const [key, marker] of Object.entries(markers)) {
		const show = reveal.stars.includes(key);
		marker.visible = show;
		labels[key].visible = show;
	}

	for (const entry of lineMeshes) {
		const show = reveal.links.some(
			([f, t]) => f === entry.fromKey && t === entry.toKey,
		);
		entry.line.visible = show;
	}
}

// ── Dataset session ─────────────────────────────────────────────────────────

function createDatasetSession() {
	return getDatasetSession(
		createFoundInSpaceDatasetOptions({
			id: 'website-learn-astrophage',
			...resolveFoundInSpaceDatasetOverrides(),
			capabilities: {
				sharedCaches: true,
				bootstrapLoading: 'website-learn-astrophage',
			},
		}),
	);
}

// ── Public mount ────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} mount
 * @param {object} options
 * @param {(msg: string) => void} [options.onStatus]
 * @returns {Promise<{ viewer: object, goTo: (id: string) => void }>}
 */
export async function mountAstrophageViewer(mount, options = {}) {
	const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

	const datasetSession = createDatasetSession();

	onStatus('Loading star data…');
	await datasetSession.ensureRenderRootShard();
	await datasetSession.ensureRenderBootstrap();

	const cameraController = createCameraRigController({
		id: 'website-astrophage-camera',
		icrsToSceneTransform: SCENE_TRANSFORM,
		sceneToIcrsTransform: SCENE_TO_ICRS,
		lookAtPc: ORION_CENTER_PC,
		moveSpeed: 18,
		keyboardTarget: NO_KEYBOARD_EVENTS_TARGET,
	});

	const viewer = await createViewer(mount, {
		datasetSession,
		interestField: createObserverShellField({
			id: 'website-astrophage-field',
		}),
		controllers: [
			cameraController,
			createSelectionRefreshController({
				id: 'website-astrophage-refresh',
				observerDistancePc: 6,
				minIntervalMs: 250,
				watchSize: false,
			}),
		],
		layers: [
			createStarFieldLayer({
				id: 'website-astrophage-stars',
				positionTransform: SCENE_TRANSFORM,
				materialFactory: () => createDefaultStarFieldMaterialProfile(),
			}),
		],
		state: {
			...DEFAULT_STAR_FIELD_STATE,
			observerPc: { ...SOLAR_ORIGIN_PC },
			targetPc: ORION_CENTER_PC,
			fieldStrategy: 'observer-shell',
		},
		clearColor: 0x02040b,
	});

	const annotations = buildAnnotations();
	viewer.contentRoot.add(annotations.group);
	applyChapterVisibility('sol-dimming', annotations);

	onStatus('Drag on the view to look around.');

	function goTo(id) {
		const cam = CHAPTER_CAMERA[id];
		if (!cam) return;

		applyChapterVisibility(id, annotations);
		cameraController.cancelAutomation();

		if (cam.type === 'flyAndLook') {
			cameraController.lockAt(cam.lookAt, {
				dwellMs: 0,
				recenterSpeed: 0.08,
			});
			cameraController.flyTo(cam.target, {
				speed: cam.flySpeed,
				deceleration: 2.5,
			});
			return;
		}

		const lookTarget = cam.lookAt ?? cam.center;
		cameraController.lockAt(lookTarget, {
			dwellMs: 5_000,
			recenterSpeed: 0.06,
		});
		cameraController.orbitalInsert(cam.center, {
			orbitRadius: cam.orbitRadius,
			angularSpeed: cam.angularSpeed,
			approachSpeed: cam.flySpeed,
			deceleration: 2.5,
		});
	}

	window.addEventListener('beforeunload', () => {
		viewer.dispose().catch((err) => {
			console.error('[website:astrophage-cleanup]', err);
		});
	});

	return { viewer, goTo };
}
