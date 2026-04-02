import {
	createCameraRigController,
	createDefaultStarFieldMaterialProfile,
	createDistanceReadout,
	createFlyToAction,
	createFoundInSpaceDatasetOptions,
	createFullscreenPreset,
	createHud,
	createObserverShellField,
	createSceneOrientationTransforms,
	createSelectionRefreshController,
	createStarFieldLayer,
	createViewer,
	DEFAULT_STAR_FIELD_STATE,
	getDatasetSession,
	HYADES_CENTER_PC,
	OMEGA_CEN_CENTER_PC,
	ORION_CENTER_PC,
	ORION_NEBULA_PC,
	PLEIADES_CENTER_PC,
	SOLAR_ORIGIN_PC,
	UPPER_SCO_CENTER_PC,
	resolveFoundInSpaceDatasetOverrides,
} from '@found-in-space/skykit';

const CLUSTER_PRESETS = [
	{
		id: 'orion-nebula',
		label: 'Orion Nebula',
		center: ORION_NEBULA_PC,
		orbitRadius: 100,
		angularSpeed: 0.12,
		flySpeed: 160,
	},
	{
		id: 'upper-sco',
		label: 'Upper Scorpius',
		center: UPPER_SCO_CENTER_PC,
		orbitRadius: 50,
		angularSpeed: 0.15,
		flySpeed: 160,
	},
	{
		id: 'pleiades',
		label: 'Pleiades',
		center: PLEIADES_CENTER_PC,
		orbitRadius: 25,
		angularSpeed: 0.18,
		flySpeed: 150,
	},
	{
		id: 'hyades',
		label: 'Hyades',
		center: HYADES_CENTER_PC,
		orbitRadius: 15,
		angularSpeed: 0.22,
		flySpeed: 100,
	},
	{
		id: 'omega-cen',
		label: 'Omega Centauri',
		center: OMEGA_CEN_CENTER_PC,
		orbitRadius: 200,
		angularSpeed: 0.08,
		flySpeed: 600,
	},
];

const PRESET_BY_ID = new Map(CLUSTER_PRESETS.map((p) => [p.id, p]));

const {
	icrsToScene: SCENE_TRANSFORM,
	sceneToIcrs: SCENE_TO_ICRS,
} = createSceneOrientationTransforms(ORION_CENTER_PC);

function createDatasetSession() {
	return getDatasetSession(
		createFoundInSpaceDatasetOptions({
			id: 'website-learn-star-clusters',
			...resolveFoundInSpaceDatasetOverrides(),
			capabilities: {
				sharedCaches: true,
				bootstrapLoading: 'website-learn-star-clusters',
			},
		}),
	);
}

/**
 * Mount the cluster tour viewer.
 *
 * @param {HTMLElement} mount            Container element for the viewer canvas.
 * @param {object}      options
 * @param {(id: string|null) => void}  [options.onClusterChange]  Called when the active cluster changes.
 * @param {(msg: string) => void}      [options.onStatus]         Called with status text updates.
 * @returns {Promise<{ viewer: object, flyTo: (id: string) => void, goHome: () => void }>}
 */
export async function mountClusterTourViewer(mount, options = {}) {
	const onClusterChange = typeof options.onClusterChange === 'function'
		? options.onClusterChange
		: () => {};
	const onStatus = typeof options.onStatus === 'function'
		? options.onStatus
		: () => {};

	const datasetSession = createDatasetSession();

	onStatus('Loading star data…');
	await datasetSession.ensureRenderRootShard();
	await datasetSession.ensureRenderBootstrap();

	const cameraController = createCameraRigController({
		id: 'website-cluster-tour-camera',
		icrsToSceneTransform: SCENE_TRANSFORM,
		sceneToIcrsTransform: SCENE_TO_ICRS,
		lookAtPc: ORION_NEBULA_PC,
		moveSpeed: 18,
	});

	const fullscreen = createFullscreenPreset();

	const viewer = await createViewer(mount, {
		datasetSession,
		interestField: createObserverShellField({
			id: 'website-cluster-tour-field',
		}),
		controllers: [
			cameraController,
			createSelectionRefreshController({
				id: 'website-cluster-tour-refresh',
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
				id: 'website-cluster-tour-stars',
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

	onStatus('Drag to look around. Use on-screen buttons or WASD to move.');

	let activeClusterId = null;

	function flyTo(id) {
		const preset = PRESET_BY_ID.get(id);
		if (!preset) return;

		activeClusterId = id;
		onClusterChange(id);

		cameraController.cancelAutomation();
		cameraController.lockAt(preset.center, {
			dwellMs: 5_000,
			recenterSpeed: 0.06,
		});
		cameraController.orbitalInsert(preset.center, {
			orbitRadius: preset.orbitRadius,
			angularSpeed: preset.angularSpeed,
			approachSpeed: preset.flySpeed,
			deceleration: 2.5,
		});
	}

	function goHome() {
		activeClusterId = null;
		onClusterChange('home');
		cameraController.cancelAutomation();
		cameraController.lockAt(SOLAR_ORIGIN_PC, {
			dwellMs: 5_000,
			recenterSpeed: 0.06,
		});
		cameraController.orbitalInsert(SOLAR_ORIGIN_PC, {
			orbitRadius: 8,
			angularSpeed: 0.26,
			approachSpeed: 200,
			deceleration: 2.2,
		});
	}

	window.addEventListener('beforeunload', () => {
		viewer.dispose().catch((err) => {
			console.error('[website:cluster-tour-cleanup]', err);
		});
	});

	return { viewer, flyTo, goHome, presets: CLUSTER_PRESETS };
}
