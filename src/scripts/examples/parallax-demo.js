import {
	createConstellationArtLayer,
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

const DEFAULT_WESTERN_MANIFEST_URL =
	'https://unpkg.com/@found-in-space/stellarium-skycultures-western@0.1.0/dist/manifest.json';
const DEFAULT_OFFSET_PC = 0.12;

const mount = document.querySelector('[data-example="parallax-viewer"]');
const statusValue = document.querySelector('[data-parallax-status]');
const modeValue = document.querySelector('[data-parallax-mode]');
const offsetInput = document.querySelector('[data-parallax-offset]');
const offsetValue = document.querySelector('[data-parallax-offset-value]');
const motionButton = document.querySelector('[data-action="enable-motion"]');

const {
	icrsToScene: orionSceneTransform,
	sceneToIcrs: orionSceneToIcrsTransform,
} = createSceneOrientationTransforms(ORION_CENTER_PC);

const datasetSession = getDatasetSession(
	createFoundInSpaceDatasetOptions({
		id: 'website-learn-parallax',
		...resolveFoundInSpaceDatasetOverrides(),
		capabilities: {
			sharedCaches: true,
			bootstrapLoading: 'website-learn-parallax',
		},
	}),
);

let viewer = null;
let activeOffsetPc = Number.isFinite(Number(offsetInput?.value))
	? Number(offsetInput.value)
	: DEFAULT_OFFSET_PC;

function setStatus(message) {
	if (statusValue) {
		statusValue.textContent = message;
	}
}

function setMode(message) {
	if (modeValue) {
		modeValue.textContent = message;
	}
}

function syncOffsetValue() {
	if (offsetValue) {
		offsetValue.textContent = `${activeOffsetPc.toFixed(2)} pc`;
	}
}

async function disposeViewer() {
	if (!viewer) {
		return;
	}

	await viewer.dispose();
	viewer = null;
}

function reportError(error, label) {
	console.error(`[website:${label}]`, error);
	setStatus(error instanceof Error ? error.message : String(error));
}

async function mountViewer() {
	if (!mount) {
		return null;
	}

	if (viewer) {
		return viewer;
	}

	setStatus('Loading the parallax example…');
	await datasetSession.ensureRenderRootShard();
	await datasetSession.ensureRenderBootstrap();

	const parallaxController = createFixedTargetParallaxController({
		id: 'website-learn-parallax-controller',
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
		onModeChange: setMode,
		onStatus: setStatus,
	});

	viewer = await createViewer(mount, {
		datasetSession,
		interestField: createTargetFrustumField({
			id: 'website-learn-parallax-field',
			targetPc: ORION_CENTER_PC,
			verticalFovDeg: 52,
			overscanDeg: 18,
			targetRadiusPc: 180,
			preloadDistancePc: 6,
			maxLevel: 13,
			note: 'Website parallax lesson field.',
		}),
		controllers: [
			parallaxController,
			createSelectionRefreshController({
				id: 'website-learn-parallax-refresh',
				observerDistancePc: 0.02,
				targetDistancePc: 0.5,
				minIntervalMs: 120,
				watchSize: false,
			}),
		],
		layers: [
			createStarFieldLayer({
				id: 'website-learn-parallax-stars',
				positionTransform: orionSceneTransform,
				materialFactory: () =>
					createDesktopStarFieldMaterialProfile({
						exposure: 90,
					}),
			}),
			createConstellationArtLayer({
				id: 'website-learn-parallax-art',
				manifestUrl: DEFAULT_WESTERN_MANIFEST_URL,
				iauFilter: ['Ori'],
				transformDirection: orionSceneTransform,
				radius: 8,
				opacity: 0.18,
			}),
		],
		state: {
			demo: 'website-learn-parallax',
			observerPc: { x: 0, y: 0, z: 0 },
			targetPc: ORION_CENTER_PC,
			fieldStrategy: 'target-frustum',
			mDesired: 7.5,
			starFieldExposure: 90,
		},
		clearColor: 0x02040b,
	});

	if (motionButton) {
		const hasMotionApi = parallaxController.isMotionSupported();
		motionButton.hidden = !hasMotionApi;
		motionButton.addEventListener('click', () => {
			parallaxController.enableMotion().catch((error) => {
				reportError(error, 'parallax-motion');
			});
		});
		if (hasMotionApi) {
			motionButton.textContent = 'Enable Device Motion';
		}
	}

	setMode('pointer');
	setStatus('Move the pointer across the scene to shift Earth and watch the nearer stars slide more than the distant ones.');
	return viewer;
}

offsetInput?.addEventListener('input', () => {
	const parsed = Number(offsetInput.value);
	if (!Number.isFinite(parsed)) {
		return;
	}

	activeOffsetPc = parsed;
	syncOffsetValue();
});

window.addEventListener('beforeunload', () => {
	if (viewer) {
		viewer.dispose().catch((error) => {
			console.error('[website:parallax-cleanup]', error);
		});
	}
});

syncOffsetValue();
mountViewer().catch((error) => {
	reportError(error, 'parallax-mount');
});
