import {
	createCameraRigController,
	createDefaultStarFieldMaterialProfile,
	createDistanceReadout,
	createFlyToAction,
	createFoundInSpaceDatasetOptions,
	createFullscreenPreset,
	createHud,
	createObserverShellField,
	createRadioBubbleMeshes,
	createSceneOrientationTransforms,
	createSelectionRefreshController,
	createStarFieldLayer,
	createViewer,
	DEFAULT_STAR_FIELD_STATE,
	getDatasetSession,
	HYADES_CENTER_PC,
	ORION_CENTER_PC,
	ORION_NEBULA_PC,
	SOLAR_ORIGIN_PC,
	resolveFoundInSpaceDatasetOverrides,
} from '@found-in-space/skykit';

const VIEWPOINTS = [
	{
		id: 'inside',
		label: 'Inside the bubble',
		center: SOLAR_ORIGIN_PC,
		orbitRadius: 8,
		angularSpeed: 0.26,
		flySpeed: 120,
	},
	{
		id: 'outside',
		label: 'Outside the bubble',
		center: SOLAR_ORIGIN_PC,
		orbitRadius: 175,
		angularSpeed: 0.06,
		flySpeed: 180,
	},
	{
		id: 'hyades',
		label: 'The Hyades',
		center: HYADES_CENTER_PC,
		orbitRadius: 15,
		angularSpeed: 0.20,
		flySpeed: 120,
	},
	{
		id: 'home',
		label: 'Return home',
		center: SOLAR_ORIGIN_PC,
		orbitRadius: 8,
		angularSpeed: 0.26,
		flySpeed: 120,
	},
];

const VIEWPOINT_BY_ID = new Map(VIEWPOINTS.map((v) => [v.id, v]));

const {
	icrsToScene: SCENE_TRANSFORM,
	sceneToIcrs: SCENE_TO_ICRS,
} = createSceneOrientationTransforms(ORION_CENTER_PC);

function createDatasetSession() {
	return getDatasetSession(
		createFoundInSpaceDatasetOptions({
			id: 'website-learn-radio-bubble',
			...resolveFoundInSpaceDatasetOverrides(),
			capabilities: {
				sharedCaches: true,
				bootstrapLoading: 'website-learn-radio-bubble',
			},
		}),
	);
}

/**
 * Mount the radio bubble tour viewer.
 *
 * @param {HTMLElement} mount
 * @param {object}      options
 * @param {(id: string|null) => void}  [options.onViewpointChange]
 * @param {(msg: string) => void}      [options.onStatus]
 * @returns {Promise<{ viewer: object, goTo: (id: string) => void, radiusPc: number, radiusLy: number }>}
 */
export async function mountRadioBubbleViewer(mount, options = {}) {
	const onViewpointChange = typeof options.onViewpointChange === 'function'
		? options.onViewpointChange
		: () => {};
	const onStatus = typeof options.onStatus === 'function'
		? options.onStatus
		: () => {};

	const datasetSession = createDatasetSession();

	onStatus('Loading star data…');
	await datasetSession.ensureRenderRootShard();
	await datasetSession.ensureRenderBootstrap();

	const cameraController = createCameraRigController({
		id: 'website-radio-bubble-camera',
		icrsToSceneTransform: SCENE_TRANSFORM,
		sceneToIcrsTransform: SCENE_TO_ICRS,
		lookAtPc: ORION_NEBULA_PC,
		moveSpeed: 18,
	});

	const fullscreen = createFullscreenPreset();

	const viewer = await createViewer(mount, {
		datasetSession,
		interestField: createObserverShellField({
			id: 'website-radio-bubble-field',
		}),
		controllers: [
			cameraController,
			createSelectionRefreshController({
				id: 'website-radio-bubble-refresh',
				observerDistancePc: 12,
				minIntervalMs: 250,
				watchSize: false,
			}),
			fullscreen.controller,
			createHud({
				cameraController,
				controls: [
					{ preset: 'arrows', position: 'bottom-right' },
					{ preset: 'wasd-qe', position: 'bottom-left' },
					createDistanceReadout(cameraController, SOLAR_ORIGIN_PC, {
						label: 'Distance to Sun',
						position: 'top-left',
					}),
					createFlyToAction(cameraController, SOLAR_ORIGIN_PC, {
						label: '→ Sun',
						title: 'Fly back to the Sun',
						speed: 120,
						position: 'top-right',
					}),
					...fullscreen.controls,
				],
			}),
		],
		layers: [
			createStarFieldLayer({
				id: 'website-radio-bubble-stars',
				positionTransform: SCENE_TRANSFORM,
				materialFactory: () => createDefaultStarFieldMaterialProfile(),
			}),
		],
		state: {
			...DEFAULT_STAR_FIELD_STATE,
			observerPc: { ...SOLAR_ORIGIN_PC },
			targetPc: ORION_NEBULA_PC,
			fieldStrategy: 'observer-shell',
		},
		clearColor: 0x02040b,
	});

	const { group: bubbleGroup, radiusPc, radiusLy } = createRadioBubbleMeshes();
	viewer.contentRoot.add(bubbleGroup);

	onStatus('Drag to look around. Use on-screen buttons or WASD to move.');

	let activeViewpoint = null;

	function goTo(id) {
		const vp = VIEWPOINT_BY_ID.get(id);
		if (!vp) return;

		activeViewpoint = id;
		onViewpointChange(id);

		cameraController.cancelAutomation();
		cameraController.lockAt(vp.center, {
			dwellMs: 5_000,
			recenterSpeed: 0.06,
		});
		cameraController.orbitalInsert(vp.center, {
			orbitRadius: vp.orbitRadius,
			angularSpeed: vp.angularSpeed,
			approachSpeed: vp.flySpeed,
			deceleration: 2.5,
		});
	}

	window.addEventListener('beforeunload', () => {
		viewer.dispose().catch((err) => {
			console.error('[website:radio-bubble-cleanup]', err);
		});
	});

	return { viewer, goTo, viewpoints: VIEWPOINTS, radiusPc, radiusLy };
}
