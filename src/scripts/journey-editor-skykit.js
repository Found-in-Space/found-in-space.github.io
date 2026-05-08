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
	ORION_NEBULA_PC,
	SCENE_SCALE,
	SOLAR_ORIGIN_PC,
	resolveFoundInSpaceDatasetOverrides,
} from '@found-in-space/skykit';
import * as THREE from 'three';

const NO_KEYBOARD_EVENTS_TARGET = {
	addEventListener() {},
	removeEventListener() {},
};

const {
	icrsToScene: SCENE_TRANSFORM,
	sceneToIcrs: SCENE_TO_ICRS,
} = createSceneOrientationTransforms(ORION_CENTER_PC);

function createEditorDatasetSession() {
	return getDatasetSession(
		createFoundInSpaceDatasetOptions({
			id: 'website-journey-editor',
			...resolveFoundInSpaceDatasetOverrides(),
			capabilities: {
				sharedCaches: true,
				bootstrapLoading: 'website-journey-editor',
			},
		}),
	);
}

function colorNumber(value, fallback = 0x8fd5ff) {
	const text = String(value ?? '').trim();
	if (/^#[0-9a-f]{6}$/i.test(text)) {
		return Number.parseInt(text.slice(1), 16);
	}
	return fallback;
}

function pointToSceneVector(point) {
	const [x, y, z] = SCENE_TRANSFORM(
		Number(point?.x ?? 0) * SCENE_SCALE,
		Number(point?.y ?? 0) * SCENE_SCALE,
		Number(point?.z ?? 0) * SCENE_SCALE,
	);
	return new THREE.Vector3(x, y, z);
}

function createGuideMesh(guide) {
	const opacity = Math.min(1, Math.max(0, Number(guide.opacity ?? 0.45)));
	const color = colorNumber(guide.color);
	const material = new THREE.MeshBasicMaterial({
		color,
		transparent: opacity < 1,
		opacity,
		depthWrite: opacity >= 0.95,
		wireframe: opacity < 0.3,
	});
	const radiusPc = Math.max(0, Number(guide.radiusPc ?? guide.sizePc ?? 1));
	const sizePc = Math.max(0, Number(guide.sizePc ?? guide.radiusPc ?? 1));
	const geometry = guide.shape === 'cube'
		? new THREE.BoxGeometry(sizePc * SCENE_SCALE, sizePc * SCENE_SCALE, sizePc * SCENE_SCALE)
		: new THREE.SphereGeometry(radiusPc * SCENE_SCALE, 32, 16);
	const mesh = new THREE.Mesh(geometry, material);
	mesh.name = `journey-guide-${guide.id ?? 'guide'}`;
	mesh.position.copy(pointToSceneVector(guide.positionPc));
	return mesh;
}

function disposeObject(object) {
	object.traverse((entry) => {
		if (entry.geometry) {
			entry.geometry.dispose();
		}
		if (entry.material) {
			if (Array.isArray(entry.material)) {
				for (const material of entry.material) material.dispose();
			} else {
				entry.material.dispose();
			}
		}
	});
}

export async function mountJourneyEditorSkyKit(mount, options = {}) {
	const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
	const datasetSession = createEditorDatasetSession();

	onStatus('loading stars');
	await datasetSession.ensureRenderRootShard();
	await datasetSession.ensureRenderBootstrap();

	const cameraController = createCameraRigController({
		id: 'website-journey-editor-camera',
		icrsToSceneTransform: SCENE_TRANSFORM,
		sceneToIcrsTransform: SCENE_TO_ICRS,
		lookAtPc: ORION_NEBULA_PC,
		moveSpeed: 18,
		keyboardTarget: NO_KEYBOARD_EVENTS_TARGET,
	});
	const starLayer = createStarFieldLayer({
		id: 'website-journey-editor-stars',
		positionTransform: SCENE_TRANSFORM,
		materialFactory: () => createDefaultStarFieldMaterialProfile(),
	});
	const viewer = await createViewer(mount, {
		datasetSession,
		interestField: createObserverShellField({
			id: 'website-journey-editor-field',
		}),
		controllers: [
			cameraController,
			createSelectionRefreshController({
				id: 'website-journey-editor-refresh',
				observerDistancePc: 12,
				minIntervalMs: 250,
				watchSize: false,
			}),
		],
		layers: [starLayer],
		state: {
			...DEFAULT_STAR_FIELD_STATE,
			observerPc: { ...SOLAR_ORIGIN_PC },
			targetPc: ORION_NEBULA_PC,
			fieldStrategy: 'observer-shell',
		},
		clearColor: 0x02040b,
		pixelRatio: Number.isFinite(options.pixelRatio) ? options.pixelRatio : undefined,
	});

	const guideGroup = new THREE.Group();
	guideGroup.name = 'journey-editor-guides';
	viewer.contentRoot.add(guideGroup);

	function updateGuides(guides = []) {
		for (const child of [...guideGroup.children]) {
			guideGroup.remove(child);
			disposeObject(child);
		}
		for (const guide of guides) {
			guideGroup.add(createGuideMesh(guide));
		}
		viewer.runtime?.renderOnce?.();
	}

	function applyCamera(evaluated) {
		cameraController.cancelAutomation();
		cameraController.rig.setPosition(evaluated.observerPc);
		cameraController.rig.orientToward(evaluated.targetPc, evaluated.cameraUpPc);
		viewer.setState({
			observerPc: { ...evaluated.observerPc },
			targetPc: { ...evaluated.targetPc },
		});
		viewer.runtime?.renderOnce?.();
	}

	async function refreshStars() {
		await viewer.refreshSelection();
		viewer.runtime?.renderOnce?.();
	}

	async function dispose() {
		for (const child of [...guideGroup.children]) {
			guideGroup.remove(child);
			disposeObject(child);
		}
		await viewer.dispose();
	}

	onStatus('ready');

	return {
		viewer,
		datasetSession,
		starLayer,
		cameraController,
		guideGroup,
		applyCamera,
		updateGuides,
		refreshStars,
		dispose,
	};
}

