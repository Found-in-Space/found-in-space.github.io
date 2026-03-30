import {
	createConstellationArtLayer,
	createDesktopStarFieldMaterialProfile,
	createFoundInSpaceDatasetOptions,
	createFreeFlyController,
	createObserverShellField,
	createSceneOrientationTransforms,
	createSelectionRefreshController,
	createStarFieldLayer,
	createViewer,
	getDatasetSession,
	ORION_CENTER_PC,
	resolveFoundInSpaceDatasetOverrides,
} from '@found-in-space/skykit';

const WESTERN_MANIFEST_URL =
	'https://unpkg.com/@found-in-space/stellarium-skycultures-western@0.1.0/dist/manifest.json';

const { icrsToScene: orionSceneTransform, sceneToIcrs: orionSceneToIcrsTransform } =
	createSceneOrientationTransforms(ORION_CENTER_PC);

function createDatasetSession(id) {
	return getDatasetSession(
		createFoundInSpaceDatasetOptions({
			id,
			...resolveFoundInSpaceDatasetOverrides(),
			capabilities: {
				sharedCaches: true,
				bootstrapLoading: id,
			},
		}),
	);
}

function setText(node, text) {
	if (node) {
		node.textContent = text;
	}
}

async function mountDepthViewer(root) {
	const mount = root.querySelector('[data-constellation-depth-mount]');
	if (!mount) {
		return;
	}
	const status = root.querySelector('[data-constellation-depth-status]');
	const activeMag = 6.5;
	let viewer = null;
	const datasetId = root.dataset.datasetId || `website-topic-depth-${root.dataset.topic || 'topic'}`;
	const datasetSession = createDatasetSession(datasetId);

	try {
		setText(status, 'Loading Orion depth viewer…');
		await datasetSession.ensureRenderRootShard();
		await datasetSession.ensureRenderBootstrap();

		viewer = await createViewer(mount, {
			datasetSession,
			interestField: createObserverShellField({
				id: `website-depth-field-${root.dataset.topic || 'topic'}`,
				maxLevel: 13,
				note: 'Topic Orion depth field.',
			}),
			controllers: [
				createFreeFlyController({
					id: `website-depth-fly-${root.dataset.topic || 'topic'}`,
					icrsToSceneTransform: orionSceneTransform,
					sceneToIcrsTransform: orionSceneToIcrsTransform,
					lookAtPc: ORION_CENTER_PC,
					moveSpeedPcPerSecond: 15,
				}),
				createSelectionRefreshController({
					id: `website-depth-refresh-${root.dataset.topic || 'topic'}`,
					observerDistancePc: 8,
					minIntervalMs: 240,
					watchSize: false,
				}),
			],
			layers: [
				createStarFieldLayer({
					id: `website-depth-stars-${root.dataset.topic || 'topic'}`,
					positionTransform: orionSceneTransform,
					materialFactory: () =>
						createDesktopStarFieldMaterialProfile({
							exposure: 80,
						}),
				}),
				createConstellationArtLayer({
					id: `website-depth-art-${root.dataset.topic || 'topic'}`,
					manifestUrl: WESTERN_MANIFEST_URL,
					iauFilter: ['Ori'],
					transformDirection: orionSceneTransform,
					radius: 8,
					opacity: 0.24,
				}),
			],
			state: {
				observerPc: { x: 0, y: 0, z: 0 },
				targetPc: ORION_CENTER_PC,
				fieldStrategy: 'observer-shell',
				mDesired: activeMag,
				starFieldExposure: 80,
			},
			clearColor: 0x02040b,
		});

		setText(status, 'Drag to look. Fly sideways to feel Orion unfold in 3D.');
	} catch (error) {
		console.error('[website:constellation-depth]', error);
		setText(status, error instanceof Error ? error.message : String(error));
	}

	window.addEventListener('beforeunload', () => {
		viewer?.dispose().catch((error) => {
			console.error('[website:constellation-depth-dispose]', error);
		});
	});
}

document.querySelectorAll('[data-example="constellation-depth"]').forEach((root) => {
	mountDepthViewer(root).catch((error) => {
		console.error('[website:constellation-depth-mount]', error);
	});
});

