import * as THREE from 'three';
import {
	createCameraRigController,
	createDistanceReadout,
	createFlyToAction,
	createFoundInSpaceDatasetOptions,
	createHighlightStarFieldMaterialProfile,
	createHud,
	createObserverShellField,
	createSelectionRefreshController,
	createStarFieldLayer,
	createViewer,
	createVolumeHRLoader,
	getDatasetSession,
	HRDiagramRenderer,
	resolveFoundInSpaceDatasetOverrides,
	SOLAR_ORIGIN_PC,
} from '@found-in-space/skykit';

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
	let activeMagLimit = DEFAULT_MAG_LIMIT;
	let activeMode = 0;
	let activeRadius = 25;
	let viewer = null;
	let hrDiagram = null;
	let volumeLoader = null;
	let reloadQueued = false;
	let lastObserverPc = { x: 0, y: 0, z: 0 };
	let lastStarFieldGeometry = null;
	let lastStarFieldCount = 0;

	const topicId = root.dataset.topic || 'hr-diagram';
	const sessionId =
		root.dataset.datasetId || `website-learn-hr-diagram-${topicId}`;
	const octreeUrl = readDatasetString(root, 'octreeUrl');
	const metaUrl = readDatasetString(root, 'metaUrl');
	const datasetSession = createLocalDatasetSession(sessionId, {
		...(octreeUrl ? { octreeUrl } : {}),
		...(metaUrl ? { metaUrl } : {}),
	});

	// ── Controls ────────────────────────────────────────────────────────
	const modeButtons = root.querySelectorAll('[data-hr-mode]');
	const magRow = root.querySelector('[data-hr-mag-row]');
	const magInput = root.querySelector('[data-hr-mag-limit]');
	const magValue = root.querySelector('[data-hr-mag-value]');
	const volumeRow = root.querySelector('[data-hr-volume-row]');
	const radiusInput = root.querySelector('[data-hr-radius]');
	const radiusValue = root.querySelector('[data-hr-radius-value]');

	function setActiveMode(mode) {
		activeMode = mode;
		modeButtons.forEach((btn) => {
			btn.classList.toggle('active', Number(btn.dataset.hrMode) === mode);
		});
		hrDiagram?.setMode(mode);

		if (magRow) magRow.hidden = mode === 1;
		if (volumeRow) volumeRow.hidden = mode !== 1;
	}

	function syncHrFromStarField() {
		if (!hrDiagram || !lastStarFieldGeometry) return;
		hrDiagram.setGeometry(lastStarFieldGeometry);
		hrDiagram.setStarCount(lastStarFieldCount);
	}

	// ── Volume loading ─────────────────────────────────────────────────
	async function loadVolumeHR() {
		if (!volumeLoader || activeMode !== 1) return;
		const observerPc =
			viewer?.getSnapshotState?.()?.state?.observerPc ?? SOLAR_ORIGIN_PC;
		lastObserverPc = { ...observerPc };

		const result = await volumeLoader.load({
			observerPc,
			maxRadiusPc: activeRadius,
		});
		if (!result) return;

		hrDiagram?.setGeometry(result.geometry);
		hrDiagram?.setStarCount(result.starCount);
	}

	function queueVolumeReload() {
		if (reloadQueued) return;
		reloadQueued = true;
		requestAnimationFrame(() => {
			reloadQueued = false;
			loadVolumeHR().catch((err) =>
				console.error('[website:hr-diagram-viewer] volume load failed', err),
			);
		});
	}

	// ── HR diagram ─────────────────────────────────────────────────────
	const highlightState = buildHighlightState(highlightName);
	const highlightPreset = HIGHLIGHT_PRESETS[highlightName] || null;
	if (showHr && hrCanvasElement instanceof HTMLCanvasElement) {
		hrDiagram = new HRDiagramRenderer(hrCanvasElement, { mode: activeMode });
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
	const vpMatrix = new THREE.Matrix4();
	const hrOverlay = hrDiagram
		? {
				id: 'hr-diagram-render',
				update(context) {
					context.camera.getWorldPosition(cameraWorldPos);

					if (activeMode === 2) {
						vpMatrix.multiplyMatrices(
							context.camera.projectionMatrix,
							context.camera.matrixWorldInverse,
						);
						hrDiagram.setViewProjection(vpMatrix);
					}

					hrDiagram.render(cameraWorldPos);

					if (activeMode === 1) {
						const obs = context.state?.observerPc;
						if (obs) {
							const dx = obs.x - lastObserverPc.x;
							const dy = obs.y - lastObserverPc.y;
							const dz = obs.z - lastObserverPc.z;
							const moved = Math.sqrt(dx * dx + dy * dy + dz * dz);
							if (moved > Math.max(2, activeRadius * 0.15)) {
								queueVolumeReload();
							}
						}
					}
				},
			}
		: null;

	const starLayer = createStarFieldLayer({
		id: `website-hr-diagram-stars-${topicId}`,
		materialFactory: () =>
			createHighlightStarFieldMaterialProfile({
				exposure: 80,
			}),
		onCommit({ geometry, starCount }) {
			lastStarFieldGeometry = geometry;
			lastStarFieldCount = starCount;
			if (activeMode !== 1) {
				hrDiagram?.setGeometry(geometry);
				hrDiagram?.setStarCount(starCount);
			}
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
					],
				}),
			],
			layers: [starLayer],
			overlays: hrOverlay ? [hrOverlay] : [],
			state: {
				observerPc: { ...SOLAR_ORIGIN_PC },
				fieldStrategy: 'observer-shell',
				mDesired: activeMagLimit,
				starFieldExposure: 80,
				...highlightState,
			},
			clearColor: 0x02040b,
		});

		volumeLoader = createVolumeHRLoader({ datasetSession });
	}

	// ── Event handlers ──────────────────────────────────────────────────

	modeButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			const mode = Number(btn.dataset.hrMode);
			setActiveMode(mode);
			if (mode === 1) {
				queueVolumeReload();
			} else {
				syncHrFromStarField();
			}
		});
	});

	magInput?.addEventListener('input', () => {
		activeMagLimit = Number(magInput.value) || DEFAULT_MAG_LIMIT;
		if (magValue) magValue.textContent = activeMagLimit.toFixed(1);
	});

	magInput?.addEventListener('change', () => {
		activeMagLimit = Number(magInput.value) || DEFAULT_MAG_LIMIT;
		if (magValue) magValue.textContent = activeMagLimit.toFixed(1);
		hrDiagram?.setAppMagLimit(activeMagLimit);
		if (viewer) {
			viewer.setState({ mDesired: activeMagLimit });
			viewer.refreshSelection().catch((err) => {
				console.error('[website:hr-diagram-viewer] mag refresh failed', err);
			});
		}
	});

	radiusInput?.addEventListener('input', () => {
		activeRadius = Number(radiusInput.value) || 25;
		if (radiusValue) radiusValue.textContent = `${activeRadius} pc`;
	});

	radiusInput?.addEventListener('change', () => {
		activeRadius = Number(radiusInput.value) || 25;
		if (radiusValue) radiusValue.textContent = `${activeRadius} pc`;
		if (activeMode === 1) queueVolumeReload();
	});

	// ── Boot ────────────────────────────────────────────────────────────

	setActiveMode(activeMode);

	try {
		await createAndMountViewer();

		window.addEventListener('resize', () => {
			hrDiagram?.resize();
		});
	} catch (error) {
		console.error('[website:hr-diagram-viewer]', error);
	}

	window.addEventListener('beforeunload', () => {
		volumeLoader?.cancel();
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
