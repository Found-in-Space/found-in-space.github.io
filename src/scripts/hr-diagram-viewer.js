import * as THREE from 'three';
import {
	createCameraRigController,
	createDistanceReadout,
	createFlyToAction,
	createFoundInSpaceDatasetOptions,
	createFullscreenPreset,
	createHighlightStarFieldMaterialProfile,
	createHud,
	createLookAtAction,
	createObserverShellField,
	createSelectionRefreshController,
	createStarFieldLayer,
	createViewer,
	getDatasetSession,
	resolveFoundInSpaceDatasetOverrides,
	SOLAR_ORIGIN_PC,
} from '@found-in-space/skykit';
import { HRDiagramGL } from './hr-diagram-gl.js';

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

async function mountHrDiagramViewer(root) {
	const mount = root.querySelector('[data-hr-diagram-viewer-shell]');
	if (!mount) {
		return;
	}

	const hrCanvasElement = root.querySelector('[data-hr-diagram-viewer-hr]');
	const highlightName = root.dataset.highlight || '';
	const showHr = parseBoolean(root.dataset.showHr);
	const activeMag = DEFAULT_MAG_LIMIT;
	let viewer = null;
	let hrDiagram = null;

	const topicId = root.dataset.topic || 'hr-diagram';
	const sessionId =
		root.dataset.datasetId || `website-learn-hr-diagram-${topicId}`;
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

	const starLayer = createStarFieldLayer({
		id: `website-hr-diagram-stars-${topicId}`,
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

		await datasetSession.ensureRenderRootShard();
		await datasetSession.ensureRenderBootstrap();

		const cameraController = createCameraRigController({
			id: `website-hr-diagram-fly-${topicId}`,
			observerPc: SOLAR_ORIGIN_PC,
			lookAtPc: PLEIADES_CENTER_PC,
			moveSpeed: 12,
		});

		const fullscreen = createFullscreenPreset();

		viewer = await createViewer(mount, {
			datasetSession,
			interestField: createObserverShellField({
				id: `website-hr-diagram-field-${topicId}`,
				note: 'HR diagram topic observer-shell field.',
			}),
			controllers: [
				cameraController,
				createSelectionRefreshController({
					id: `website-hr-diagram-refresh-${topicId}`,
					observerDistancePc: 6,
					minIntervalMs: 220,
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
						createLookAtAction(cameraController, SOLAR_ORIGIN_PC, {
							label: '⟳ Sun',
							title: 'Look toward the Sun',
							position: 'top-right',
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
	}

	try {
		await createAndMountViewer();

		window.addEventListener('resize', () => {
			hrDiagram?.resize();
		});
	} catch (error) {
		console.error('[website:hr-diagram-viewer]', error);
	}

	window.addEventListener('beforeunload', () => {
		viewer?.dispose().catch((error) => {
			console.error('[website:hr-diagram-viewer-dispose]', error);
		});
	});
}

document.querySelectorAll('[data-hr-diagram-viewer]').forEach((root) => {
	mountHrDiagramViewer(root).catch((error) => {
		console.error('[website:hr-diagram-viewer]', error);
	});
});
