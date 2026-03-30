import {
	createDesktopStarFieldMaterialProfile,
	createFixedTargetParallaxController,
	createFoundInSpaceDatasetOptions,
	createSceneOrientationTransforms,
	createSelectionRefreshController,
	createStarFieldLayer,
	createTargetFrustumField,
	createViewer,
	getDatasetSession,
	ORION_CENTER_PC,
	resolveFoundInSpaceDatasetOverrides,
} from '@found-in-space/skykit';

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

const { icrsToScene: orionSceneTransform, sceneToIcrs: orionSceneToIcrsTransform } =
	createSceneOrientationTransforms(ORION_CENTER_PC);

async function mountParsec(root) {
	const mount = root.querySelector('[data-parsec-mount]');
	if (!mount) {
		return;
	}
	const status = root.querySelector('[data-parsec-status]');
	const mode = root.querySelector('[data-parsec-mode]');
	const offsetInput = root.querySelector('[data-parsec-offset]');
	const offsetValue = root.querySelector('[data-parsec-offset-value]');
	const initialOffset = Number.isFinite(Number(root.dataset.offsetPc))
		? Number(root.dataset.offsetPc)
		: 0.12;
	let activeOffsetPc = initialOffset;
	let viewer = null;
	const datasetId = root.dataset.datasetId || `website-topic-parsec-${root.dataset.topic || 'topic'}`;
	const datasetSession = createDatasetSession(datasetId);

	function syncOffsetText() {
		setText(offsetValue, `${activeOffsetPc.toFixed(2)} pc`);
	}

	try {
		setText(status, 'Loading parallax viewer…');
		await datasetSession.ensureRenderRootShard();
		await datasetSession.ensureRenderBootstrap();
		const parallaxController = createFixedTargetParallaxController({
			id: `website-parsec-controller-${root.dataset.topic || 'topic'}`,
			targetPc: ORION_CENTER_PC,
			getOffsetPc: () => activeOffsetPc,
			icrsToSceneTransform: orionSceneTransform,
			sceneToIcrsTransform: orionSceneToIcrsTransform,
			pointer: {
				invertX: true,
			},
			motion: {
				swapAxes: true,
				invertX: true,
			},
			onModeChange(nextMode) {
				setText(mode, nextMode);
			},
			onStatus(nextStatus) {
				setText(status, nextStatus);
			},
		});

		viewer = await createViewer(mount, {
			datasetSession,
			interestField: createTargetFrustumField({
				id: `website-parsec-field-${root.dataset.topic || 'topic'}`,
				targetPc: ORION_CENTER_PC,
				verticalFovDeg: 52,
				overscanDeg: 18,
				targetRadiusPc: 180,
				preloadDistancePc: 6,
				maxLevel: 13,
				note: 'Topic parsec parallax field.',
			}),
			controllers: [
				parallaxController,
				createSelectionRefreshController({
					id: `website-parsec-refresh-${root.dataset.topic || 'topic'}`,
					observerDistancePc: 0.02,
					targetDistancePc: 0.5,
					minIntervalMs: 120,
					watchSize: false,
				}),
			],
			layers: [
				createStarFieldLayer({
					id: `website-parsec-stars-${root.dataset.topic || 'topic'}`,
					positionTransform: orionSceneTransform,
					materialFactory: () =>
						createDesktopStarFieldMaterialProfile({
							exposure: 90,
						}),
				}),
			],
			state: {
				observerPc: { x: 0, y: 0, z: 0 },
				targetPc: ORION_CENTER_PC,
				fieldStrategy: 'target-frustum',
				mDesired: 6.5,
				starFieldExposure: 90,
			},
			clearColor: 0x02040b,
		});

		offsetInput?.addEventListener('input', () => {
			const parsed = Number(offsetInput.value);
			if (!Number.isFinite(parsed)) {
				return;
			}
			activeOffsetPc = parsed;
			syncOffsetText();
		});

		setText(mode, 'pointer');
		syncOffsetText();
		setText(status, 'Move the pointer to shift viewpoint and compare the parallax shift of near vs far stars.');
	} catch (error) {
		console.error('[website:parsec-parallax]', error);
		setText(status, error instanceof Error ? error.message : String(error));
	}

	window.addEventListener('beforeunload', () => {
		viewer?.dispose().catch((error) => {
			console.error('[website:parsec-parallax-dispose]', error);
		});
	});
}

document.querySelectorAll('[data-example="parsec-parallax"]').forEach((root) => {
	mountParsec(root).catch((error) => {
		console.error('[website:parsec-parallax-mount]', error);
	});
});

