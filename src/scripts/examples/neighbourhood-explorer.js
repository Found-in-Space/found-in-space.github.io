import * as THREE from 'three';
import {
	createFoundInSpaceDatasetOptions,
	createFreeFlyController,
	createHighlightStarFieldMaterialProfile,
	createObserverShellField,
	createSelectionRefreshController,
	createStarFieldLayer,
	createViewer,
	getDatasetSession,
	resolveFoundInSpaceDatasetOverrides,
	SOLAR_ORIGIN_PC,
} from '@found-in-space/skykit';
import { HRDiagramGL } from '../hr-diagram-gl.js';

const DEFAULT_MAG_LIMIT = 6.5;
const PLEIADES_CENTER_PC = Object.freeze({
	x: 68.0,
	y: 103.8,
	z: 55.6,
});

const HIGHLIGHT_PRESETS = {
	'white-dwarfs': {
		color: '#8cffb8',
		teffMin: 7000,
		teffMax: 40000,
		magAbsMin: 10,
		magAbsMax: 18,
		label: 'White dwarfs',
	},
	'red-dwarfs': {
		color: '#ffc273',
		teffMin: 2000,
		teffMax: 4000,
		magAbsMin: 8,
		magAbsMax: 18,
		label: 'Red dwarfs',
	},
	'brown-dwarfs': {
		color: '#e87dff',
		teffMin: 900,
		teffMax: 2500,
		magAbsMin: 14,
		magAbsMax: 21,
		label: 'Brown dwarfs',
	},
	'hot-stars': {
		color: '#7fb5ff',
		teffMin: 10000,
		teffMax: 40000,
		magAbsMin: -6,
		magAbsMax: 18,
		label: 'Hot stars',
	},
	'cool-stars': {
		color: '#ff896e',
		teffMin: 2000,
		teffMax: 4000,
		magAbsMin: -3,
		magAbsMax: 18,
		label: 'Cool stars',
	},
	'main-sequence': {
		color: '#86c3ff',
		teffMin: 2600,
		teffMax: 12000,
		magAbsMin: 1,
		magAbsMax: 13,
		label: 'Main sequence (approx)',
	},
};

function parseBoolean(value) {
	return value === '' || value === 'true' || value === '1' || value === 'yes';
}

function readDatasetString(root, key) {
	const value = root.dataset[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createLocalDatasetSession(id, datasetOverrides = {}) {
	return getDatasetSession(
		createFoundInSpaceDatasetOptions({
			id,
			...resolveFoundInSpaceDatasetOverrides(),
			...datasetOverrides,
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

function buildHighlightState(name) {
	const preset = HIGHLIGHT_PRESETS[name];
	if (!preset) {
		return {
			highlightEnabled: false,
		};
	}
	return {
		highlightEnabled: true,
		highlightColor: preset.color,
		highlightTeffMin: preset.teffMin,
		highlightTeffMax: preset.teffMax,
		highlightMagAbsMin: preset.magAbsMin,
		highlightMagAbsMax: preset.magAbsMax,
	};
}

async function mountExplorer(root) {
	const mount = root.querySelector('[data-neighbourhood-mount]');
	if (!mount) {
		return;
	}

	const status = root.querySelector('[data-neighbourhood-status]');
	const recenterButton = root.querySelector('[data-action="recenter-neighbourhood"]');
	const hrCanvasElement = root.querySelector('[data-neighbourhood-hr]');
	const highlightName = root.dataset.highlight || '';
	const showHr = parseBoolean(root.dataset.showHr);
	const activeMag = DEFAULT_MAG_LIMIT;
	let viewer = null;
	let hrDiagram = null;

	const sessionId = root.dataset.datasetId || `website-learn-neighbourhood-${root.dataset.topic || 'topic'}`;
	const octreeUrl = readDatasetString(root, 'octreeUrl');
	const metaUrl = readDatasetString(root, 'metaUrl');
	const datasetSession = createLocalDatasetSession(sessionId, {
		...(octreeUrl ? { octreeUrl } : {}),
		...(metaUrl ? { metaUrl } : {}),
	});

	const highlightState = buildHighlightState(highlightName);
	const highlightPreset = HIGHLIGHT_PRESETS[highlightName] || null;
	if (showHr && hrCanvasElement instanceof HTMLCanvasElement) {
		hrDiagram = new HRDiagramGL(hrCanvasElement);
		if (highlightPreset) {
			hrDiagram.setHighlightRegion({
				teffMin: highlightPreset.teffMin,
				teffMax: highlightPreset.teffMax,
				magAbsMin: highlightPreset.magAbsMin,
				magAbsMax: highlightPreset.magAbsMax,
				color: highlightPreset.color,
				label: highlightPreset.label,
			});
		}
	}

	function setStatus(message) {
		setText(status, message);
	}

	const cameraWorldPos = new THREE.Vector3();
	const hrOverlay = hrDiagram
		? {
				id: 'hr-diagram-render',
				update(context) {
					context.camera.getWorldPosition(cameraWorldPos);
					hrDiagram.render(cameraWorldPos);
				},
			}
		: null;

	const topicId = root.dataset.topic || 'topic';
	const starLayer = createStarFieldLayer({
		id: `website-neighbourhood-stars-${topicId}`,
		materialFactory: () =>
			createHighlightStarFieldMaterialProfile({
				exposure: 80,
			}),
		onCommit({ geometry }) {
			hrDiagram?.setGeometry(geometry);
		},
	});

	async function createAndMountViewer() {
		if (viewer) {
			await viewer.dispose();
			viewer = null;
		}

		setStatus('Loading nearby stars…');
		await datasetSession.ensureRenderRootShard();
		await datasetSession.ensureRenderBootstrap();

		viewer = await createViewer(mount, {
			datasetSession,
			interestField: createObserverShellField({
				id: `website-neighbourhood-field-${topicId}`,
				maxLevel: 13,
				note: 'Website local-neighbourhood field.',
			}),
			controllers: [
				createFreeFlyController({
					id: `website-neighbourhood-fly-${topicId}`,
					observerPc: SOLAR_ORIGIN_PC,
					lookAtPc: PLEIADES_CENTER_PC,
					moveSpeedPcPerSecond: 12,
				}),
				createSelectionRefreshController({
					id: `website-neighbourhood-refresh-${topicId}`,
					observerDistancePc: 6,
					minIntervalMs: 220,
					watchSize: false,
				}),
			],
			layers: [starLayer],
			overlays: hrOverlay ? [hrOverlay] : [],
			state: {
				observerPc: { ...SOLAR_ORIGIN_PC },
				fieldStrategy: 'observer-shell',
				mDesired: activeMag,
				starFieldExposure: 80,
				...highlightState,
			},
			clearColor: 0x02040b,
		});

		setStatus(
			highlightPreset
				? `Fly around with WASD and drag to look. Highlighting: ${highlightPreset.label}.`
				: 'Fly around with WASD and drag to look.',
		);
	}

	try {
		await createAndMountViewer();

		window.addEventListener('resize', () => {
			hrDiagram?.resize();
		});
	} catch (error) {
		console.error('[website:neighbourhood-mount]', error);
		setStatus(error instanceof Error ? error.message : String(error));
	}

	recenterButton?.addEventListener('click', () => {
		createAndMountViewer().catch((error) => {
			console.error('[website:neighbourhood-recenter]', error);
			setStatus(error instanceof Error ? error.message : String(error));
		});
	});

	window.addEventListener('beforeunload', () => {
		viewer?.dispose().catch((error) => {
			console.error('[website:neighbourhood-dispose]', error);
		});
	});
}

document.querySelectorAll('[data-example="neighbourhood-explorer"]').forEach((root) => {
	mountExplorer(root).catch((error) => {
		console.error('[website:neighbourhood]', error);
	});
});

