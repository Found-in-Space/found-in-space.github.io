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
	SCALE,
	SOLAR_ORIGIN_PC,
	resolveFoundInSpaceDatasetOverrides,
} from '@found-in-space/skykit';

const RAW_INBOUND_MOTION = Object.freeze({ x: -0.400096, y: 0.856262, z: 0.326710 });
const RAW_OUTBOUND_MOTION = Object.freeze({ x: -0.085865, y: 0.936930, z: 0.338805 });

const RAY_LENGTH_PC = 1_000;
const INBOUND_SPEED_PC_PER_KYR = 0.059312;
const OUTBOUND_SPEED_PC_PER_KYR = 0.059328;
const TIME_MARKER_STEP_KYR = 100;
const TIME_MARKER_SIZE_PC = 0.9;
const LABEL_DISTANCE_PC = 120;
const LABEL_OFFSET_PC = 3.2;
const SUN_LABEL_OFFSET_PC = 1.4;
const SUN_LABEL_HEIGHT_PC = 0.8;
const LINE_LABEL_HEIGHT_PC = 1.2;
const VIEW_DISTANCE_PC = 140;
const VIEW_OFFSET_PC = 16;
const ORBIT_RADIUS_PC = 320;
const FREE_ROAM_DISTANCE_PC = 260;
const FREE_ROAM_OFFSET_PC = 60;

function scalePoint(point, scalar) {
	return {
		x: point.x * scalar,
		y: point.y * scalar,
		z: point.z * scalar,
	};
}

function addPoints(a, b) {
	return {
		x: a.x + b.x,
		y: a.y + b.y,
		z: a.z + b.z,
	};
}

function crossPoints(a, b) {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x,
	};
}

function normalizePoint(point, fallback = { x: 0, y: 0, z: 1 }) {
	const magnitude = Math.hypot(point.x, point.y, point.z);
	if (magnitude < 1e-9) {
		return { ...fallback };
	}

	return {
		x: point.x / magnitude,
		y: point.y / magnitude,
		z: point.z / magnitude,
	};
}

const INBOUND_DIRECTION_PC = normalizePoint(scalePoint(RAW_INBOUND_MOTION, -1));
const OUTBOUND_DIRECTION_PC = normalizePoint(RAW_OUTBOUND_MOTION);
const BEND_NORMAL_PC = normalizePoint(
	crossPoints(INBOUND_DIRECTION_PC, OUTBOUND_DIRECTION_PC),
	{ x: 0, y: 0, z: 1 },
);

const CHAPTERS = [
	{
		id: 'inbound',
		label: 'Inbound',
		type: 'flyAndLook',
		observerPc: addPoints(
			scalePoint(INBOUND_DIRECTION_PC, VIEW_DISTANCE_PC),
			scalePoint(BEND_NORMAL_PC, VIEW_OFFSET_PC),
		),
		lookAtPc: SOLAR_ORIGIN_PC,
		flySpeed: 60,
	},
	{
		id: 'outbound',
		label: 'Outbound',
		type: 'flyAndLook',
		observerPc: addPoints(
			scalePoint(OUTBOUND_DIRECTION_PC, VIEW_DISTANCE_PC),
			scalePoint(BEND_NORMAL_PC, VIEW_OFFSET_PC),
		),
		lookAtPc: SOLAR_ORIGIN_PC,
		flySpeed: 60,
	},
	{
		id: 'three-d',
		label: '3D view',
		type: 'orbit',
		centerPc: SOLAR_ORIGIN_PC,
		lookAtPc: SOLAR_ORIGIN_PC,
		orbitRadiusPc: ORBIT_RADIUS_PC,
		angularSpeed: 0.035,
		flySpeed: 140,
	},
	{
		id: 'free-roam',
		label: 'Free roam',
		type: 'free-roam',
		observerPc: addPoints(
			scalePoint(BEND_NORMAL_PC, FREE_ROAM_DISTANCE_PC),
			scalePoint(OUTBOUND_DIRECTION_PC, FREE_ROAM_OFFSET_PC),
		),
		lookAtPc: SOLAR_ORIGIN_PC,
		flySpeed: 150,
	},
];

const CHAPTER_BY_ID = new Map(CHAPTERS.map((chapter) => [chapter.id, chapter]));

const CHAPTER_EMPHASIS = Object.freeze({
	inbound: {
		inboundOpacity: 0.96,
		outboundOpacity: 0.28,
		showInboundLabel: true,
		showOutboundLabel: false,
	},
	outbound: {
		inboundOpacity: 0.28,
		outboundOpacity: 0.96,
		showInboundLabel: false,
		showOutboundLabel: true,
	},
	'three-d': {
		inboundOpacity: 0.9,
		outboundOpacity: 0.9,
		showInboundLabel: true,
		showOutboundLabel: true,
	},
	'free-roam': {
		inboundOpacity: 0.9,
		outboundOpacity: 0.9,
		showInboundLabel: true,
		showOutboundLabel: true,
	},
});

const {
	icrsToScene: SCENE_TRANSFORM,
	sceneToIcrs: SCENE_TO_ICRS,
} = createSceneOrientationTransforms(ORION_CENTER_PC);

function createDatasetSession() {
	return getDatasetSession(
		createFoundInSpaceDatasetOptions({
			id: 'website-learn-three-i-atlas',
			...resolveFoundInSpaceDatasetOverrides(),
			capabilities: {
				sharedCaches: true,
				bootstrapLoading: 'website-learn-three-i-atlas',
			},
		}),
	);
}

function pcToSceneVector(pc) {
	const [sx, sy, sz] = SCENE_TRANSFORM(pc.x, pc.y, pc.z);
	return new THREE.Vector3(sx * SCALE, sy * SCALE, sz * SCALE);
}

function readThemeColor(name) {
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value || '#ffffff';
}

function createDiscTexture(color) {
	const canvas = document.createElement('canvas');
	canvas.width = 96;
	canvas.height = 96;
	const ctx = canvas.getContext('2d');
	const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 42);
	gradient.addColorStop(0, color);
	gradient.addColorStop(0.38, color);
	gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 96, 96);
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	return texture;
}

function createCircularPointTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const ctx = canvas.getContext('2d');
	const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
	gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
	gradient.addColorStop(0.45, 'rgba(255, 255, 255, 1)');
	gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 64, 64);
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	return texture;
}

function createLabelTexture(text, color) {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	const fontSize = 38;
	const paddingX = 22;
	const paddingY = 16;

	ctx.font = `600 ${fontSize}px "Avenir Next", Avenir, "Segoe UI", Arial, sans-serif`;
	const measured = ctx.measureText(text);
	canvas.width = Math.ceil(measured.width + paddingX * 2);
	canvas.height = fontSize + paddingY * 2;

	ctx.font = `600 ${fontSize}px "Avenir Next", Avenir, "Segoe UI", Arial, sans-serif`;
	ctx.fillStyle = color;
	ctx.textBaseline = 'middle';
	ctx.fillText(text, paddingX, canvas.height / 2);

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	return { texture, width: canvas.width, height: canvas.height };
}

function createMarkerMaterial({ color, texture, opacity }) {
	return new THREE.SpriteMaterial({
		map: texture,
		color,
		transparent: true,
		opacity,
		depthTest: false,
		depthWrite: false,
		sizeAttenuation: true,
	});
}

function createSprite(texture, scalePc, positionPc) {
	const sprite = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
			depthTest: false,
			sizeAttenuation: true,
		}),
	);
	sprite.position.copy(pcToSceneVector(positionPc));
	sprite.scale.set(scalePc * SCALE, scalePc * SCALE, 1);
	sprite.renderOrder = 900;
	return sprite;
}

function createLabelSprite(text, color, positionPc, heightPc) {
	const { texture, width, height } = createLabelTexture(text, color);
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false,
		sizeAttenuation: true,
	});
	const sprite = new THREE.Sprite(material);
	const aspect = width / height;
	sprite.position.copy(pcToSceneVector(positionPc));
	sprite.scale.set(heightPc * aspect * SCALE, heightPc * SCALE, 1);
	sprite.renderOrder = 901;
	return sprite;
}

function createTimeMarkerSprites({
	directionPc,
	spacingPc,
	lengthPc,
	color,
	texture,
	sizePc,
	opacity,
	renderOrder,
}) {
	const group = new THREE.Group();
	const material = createMarkerMaterial({ color, texture, opacity });
	const markerScale = sizePc * SCALE;
	const count = Math.floor(lengthPc / spacingPc);

	for (let index = 0; index < count; index += 1) {
		const distancePc = spacingPc * (index + 1);
		const pointPc = scalePoint(directionPc, distancePc);
		const sprite = new THREE.Sprite(material);
		sprite.position.copy(pcToSceneVector(pointPc));
		sprite.scale.set(markerScale, markerScale, 1);
		sprite.renderOrder = renderOrder;
		group.add(sprite);
	}

	return { group, material };
}

function buildAnnotations() {
	const colors = {
		inbound: readThemeColor('--fis-blue'),
		outbound: readThemeColor('--fis-gold'),
		text: readThemeColor('--fis-text'),
	};
	const pointTexture = createCircularPointTexture();

	const group = new THREE.Group();
	group.name = 'three-i-atlas-annotations';

	const inboundEndPc = scalePoint(INBOUND_DIRECTION_PC, RAY_LENGTH_PC);
	const outboundEndPc = scalePoint(OUTBOUND_DIRECTION_PC, RAY_LENGTH_PC);
	const inboundLabelPc = scalePoint(INBOUND_DIRECTION_PC, LABEL_DISTANCE_PC);
	const outboundLabelPc = scalePoint(OUTBOUND_DIRECTION_PC, LABEL_DISTANCE_PC);
	const labelOffsetPc = scalePoint(BEND_NORMAL_PC, LABEL_OFFSET_PC);
	const sunLabelOffsetPc = scalePoint(BEND_NORMAL_PC, SUN_LABEL_OFFSET_PC);

	const inboundLine = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints([
			pcToSceneVector(SOLAR_ORIGIN_PC),
			pcToSceneVector(inboundEndPc),
		]),
		new THREE.LineBasicMaterial({
			color: colors.inbound,
			transparent: true,
			opacity: 0.9,
			depthTest: false,
		}),
	);
	inboundLine.renderOrder = 840;
	group.add(inboundLine);

	const inboundTimeMarkers = createTimeMarkerSprites({
		directionPc: INBOUND_DIRECTION_PC,
		spacingPc: INBOUND_SPEED_PC_PER_KYR * TIME_MARKER_STEP_KYR,
		lengthPc: RAY_LENGTH_PC,
		color: colors.inbound,
		sizePc: TIME_MARKER_SIZE_PC,
		opacity: 0.72,
		texture: pointTexture,
		renderOrder: 842,
	});
	group.add(inboundTimeMarkers.group);

	const outboundLine = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints([
			pcToSceneVector(SOLAR_ORIGIN_PC),
			pcToSceneVector(outboundEndPc),
		]),
		new THREE.LineBasicMaterial({
			color: colors.outbound,
			transparent: true,
			opacity: 0.9,
			depthTest: false,
		}),
	);
	outboundLine.renderOrder = 841;
	group.add(outboundLine);

	const outboundTimeMarkers = createTimeMarkerSprites({
		directionPc: OUTBOUND_DIRECTION_PC,
		spacingPc: OUTBOUND_SPEED_PC_PER_KYR * TIME_MARKER_STEP_KYR,
		lengthPc: RAY_LENGTH_PC,
		color: colors.outbound,
		sizePc: TIME_MARKER_SIZE_PC,
		opacity: 0.72,
		texture: pointTexture,
		renderOrder: 843,
	});
	group.add(outboundTimeMarkers.group);

	const sunMarker = createSprite(createDiscTexture(colors.text), 0.32, SOLAR_ORIGIN_PC);
	group.add(sunMarker);

	const sunLabel = createLabelSprite(
		'Sun',
		colors.text,
		addPoints(SOLAR_ORIGIN_PC, sunLabelOffsetPc),
		SUN_LABEL_HEIGHT_PC,
	);
	group.add(sunLabel);

	const inboundLabel = createLabelSprite(
		'Inbound',
		colors.inbound,
		addPoints(inboundLabelPc, labelOffsetPc),
		LINE_LABEL_HEIGHT_PC,
	);
	group.add(inboundLabel);

	const outboundLabel = createLabelSprite(
		'Outbound',
		colors.outbound,
		addPoints(outboundLabelPc, labelOffsetPc),
		LINE_LABEL_HEIGHT_PC,
	);
	group.add(outboundLabel);

	return {
		group,
		inboundLine,
		inboundTimeMarkers,
		outboundLine,
		outboundTimeMarkers,
		sunMarker,
		sunLabel,
		inboundLabel,
		outboundLabel,
	};
}

function applyChapterEmphasis(chapterId, annotations) {
	const emphasis = CHAPTER_EMPHASIS[chapterId] ?? CHAPTER_EMPHASIS['three-d'];

	annotations.inboundLine.material.opacity = emphasis.inboundOpacity;
	annotations.outboundLine.material.opacity = emphasis.outboundOpacity;
	annotations.inboundTimeMarkers.material.opacity = emphasis.inboundOpacity * 0.72;
	annotations.outboundTimeMarkers.material.opacity = emphasis.outboundOpacity * 0.72;
	annotations.inboundLabel.visible = emphasis.showInboundLabel;
	annotations.outboundLabel.visible = emphasis.showOutboundLabel;
	annotations.sunMarker.material.opacity = 1;
	annotations.sunLabel.visible = true;
}

export async function mountThreeIAtlasViewer(mount, options = {}) {
	const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

	const datasetSession = createDatasetSession();

	onStatus('Loading star data...');
	await datasetSession.ensureRenderRootShard();
	await datasetSession.ensureRenderBootstrap();

	const cameraController = createCameraRigController({
		id: 'website-three-i-atlas-camera',
		icrsToSceneTransform: SCENE_TRANSFORM,
		sceneToIcrsTransform: SCENE_TO_ICRS,
		lookAtPc: SOLAR_ORIGIN_PC,
		moveSpeed: 18,
	});

	const viewer = await createViewer(mount, {
		datasetSession,
		interestField: createObserverShellField({
			id: 'website-three-i-atlas-field',
		}),
		controllers: [
			cameraController,
			createSelectionRefreshController({
				id: 'website-three-i-atlas-refresh',
				observerDistancePc: 16,
				minIntervalMs: 250,
				watchSize: false,
			}),
		],
		layers: [
			createStarFieldLayer({
				id: 'website-three-i-atlas-stars',
				positionTransform: SCENE_TRANSFORM,
				materialFactory: () => createDefaultStarFieldMaterialProfile(),
			}),
		],
		state: {
			...DEFAULT_STAR_FIELD_STATE,
			observerPc: { ...SOLAR_ORIGIN_PC },
			targetPc: SOLAR_ORIGIN_PC,
			fieldStrategy: 'observer-shell',
		},
		clearColor: 0x02040b,
	});

	const annotations = buildAnnotations();
	viewer.contentRoot.add(annotations.group);
	applyChapterEmphasis('inbound', annotations);

	onStatus('Drag on the view to look around.');

	function goTo(id) {
		const chapter = CHAPTER_BY_ID.get(id);
		if (!chapter) return;

		applyChapterEmphasis(id, annotations);
		cameraController.cancelAutomation();

		if (chapter.type === 'flyAndLook') {
			cameraController.lockAt(chapter.lookAtPc, {
				dwellMs: 0,
				recenterSpeed: 0.08,
			});
			cameraController.flyTo(chapter.observerPc, {
				speed: chapter.flySpeed,
				deceleration: 2.5,
			});
			return;
		}

		if (chapter.type === 'free-roam') {
			cameraController.lockAt(chapter.lookAtPc, {
				dwellMs: 0,
				recenterSpeed: 0.08,
			});
			cameraController.flyTo(chapter.observerPc, {
				speed: chapter.flySpeed,
				deceleration: 2.5,
				onArrive() {
					cameraController.unlockAt();
				},
			});
			return;
		}

		cameraController.lockAt(chapter.lookAtPc, {
			dwellMs: 5_000,
			recenterSpeed: 0.06,
		});
		cameraController.orbitalInsert(chapter.centerPc, {
			orbitRadius: chapter.orbitRadiusPc,
			angularSpeed: chapter.angularSpeed,
			approachSpeed: chapter.flySpeed,
			deceleration: 2.5,
		});
	}

	window.addEventListener('beforeunload', () => {
		viewer.dispose().catch((err) => {
			console.error('[website:three-i-atlas-cleanup]', err);
		});
	});

	return { viewer, goTo, chapters: CHAPTERS };
}
