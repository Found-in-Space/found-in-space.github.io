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

const DEFAULT_WESTERN_MANIFEST_URL =
	'https://unpkg.com/@found-in-space/stellarium-skycultures-western@0.1.0/dist/manifest.json';
const DEFAULT_MAG_LIMIT = 7.5;

const mount = document.querySelector('[data-example="constellation-viewer"]');
const statusValue = document.querySelector('[data-constellation-status]');
const magInput = document.querySelector('[data-constellation-mag-limit]');
const magValue = document.querySelector('[data-constellation-mag-limit-value]');
const recenterButton = document.querySelector('[data-action="recenter-constellation"]');

const {
	icrsToScene: orionSceneTransform,
	sceneToIcrs: orionSceneToIcrsTransform,
} = createSceneOrientationTransforms(ORION_CENTER_PC);

const datasetSession = getDatasetSession(
	createFoundInSpaceDatasetOptions({
		id: 'website-explore-constellations',
		...resolveFoundInSpaceDatasetOverrides(),
		capabilities: {
			sharedCaches: true,
			bootstrapLoading: 'website-explore-constellations',
		},
	}),
);

let viewer = null;
let activeMagLimit = Number.isFinite(Number(magInput?.value))
	? Number(magInput.value)
	: DEFAULT_MAG_LIMIT;

function setStatus(message) {
	if (statusValue) {
		statusValue.textContent = message;
	}
}

function syncMagValue() {
	if (magValue) {
		magValue.textContent = activeMagLimit.toFixed(1);
	}
}

async function disposeViewer() {
	if (!viewer) {
		return;
	}

	await viewer.dispose();
	viewer = null;
}

async function mountViewer({ forceReset = false } = {}) {
	if (!mount) {
		return null;
	}

	if (forceReset) {
		await disposeViewer();
	}

	if (viewer) {
		return viewer;
	}

	setStatus('Loading the Orion fly-through…');
	await datasetSession.ensureRenderRootShard();
	await datasetSession.ensureRenderBootstrap();

	viewer = await createViewer(mount, {
		datasetSession,
		interestField: createObserverShellField({
			id: 'website-explore-orion-field',
			maxLevel: 13,
			note: 'Website Orion fly-through field.',
		}),
		controllers: [
			createFreeFlyController({
				id: 'website-explore-orion-free-fly',
				icrsToSceneTransform: orionSceneTransform,
				sceneToIcrsTransform: orionSceneToIcrsTransform,
				lookAtPc: ORION_CENTER_PC,
				moveSpeedPcPerSecond: 18,
			}),
			createSelectionRefreshController({
				id: 'website-explore-orion-refresh',
				observerDistancePc: 12,
				minIntervalMs: 250,
				watchSize: false,
			}),
		],
		layers: [
			createStarFieldLayer({
				id: 'website-explore-orion-stars',
				positionTransform: orionSceneTransform,
				materialFactory: () =>
					createDesktopStarFieldMaterialProfile({
						exposure: 80,
					}),
			}),
			createConstellationArtLayer({
				id: 'website-explore-orion-art',
				manifestUrl: DEFAULT_WESTERN_MANIFEST_URL,
				iauFilter: ['Ori'],
				transformDirection: orionSceneTransform,
				radius: 8,
				opacity: 0.24,
			}),
		],
		state: {
			demo: 'website-explore-constellations',
			observerPc: { x: 0, y: 0, z: 0 },
			targetPc: ORION_CENTER_PC,
			fieldStrategy: 'observer-shell',
			mDesired: activeMagLimit,
			starFieldExposure: 80,
		},
		clearColor: 0x02040b,
	});

	setStatus('Drag to look around. Use WASD, Q/E, or Shift/Space to move through Orion.');
	return viewer;
}

function reportError(error, label) {
	console.error(`[website:${label}]`, error);
	setStatus(error instanceof Error ? error.message : String(error));
}

recenterButton?.addEventListener('click', () => {
	mountViewer({ forceReset: true }).catch((error) => {
		reportError(error, 'constellation-recenter');
	});
});

magInput?.addEventListener('input', () => {
	const parsed = Number(magInput.value);
	if (!Number.isFinite(parsed)) {
		return;
	}

	activeMagLimit = parsed;
	syncMagValue();
});

magInput?.addEventListener('change', () => {
	const parsed = Number(magInput.value);
	if (!Number.isFinite(parsed)) {
		magInput.value = String(activeMagLimit);
		return;
	}

	activeMagLimit = parsed;
	syncMagValue();

	if (!viewer) {
		return;
	}

	viewer.setState({ mDesired: activeMagLimit });
	viewer.refreshSelection().catch((error) => {
		reportError(error, 'constellation-mag-limit');
	});
});

window.addEventListener('beforeunload', () => {
	if (viewer) {
		viewer.dispose().catch((error) => {
			console.error('[website:constellation-cleanup]', error);
		});
	}
});

syncMagValue();
mountViewer().catch((error) => {
	reportError(error, 'constellation-mount');
});
