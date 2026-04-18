import * as THREE from 'three';
import {
	GALACTIC_CENTER_PC,
	HRDiagramRenderer,
	SOLAR_ORIGIN_PC,
	createCameraRigController,
	createFoundInSpaceDatasetOptions,
	createHighlightStarFieldMaterialProfile,
	createObserverShellField,
	createSelectionRefreshController,
	createStarFieldLayer,
	createViewer,
	createVolumeHRLoader,
	getDatasetSession,
	resolveFoundInSpaceDatasetOverrides,
} from '@found-in-space/skykit';

const NO_KEYBOARD_EVENTS_TARGET = {
	addEventListener() {},
	removeEventListener() {},
};

export const DEFAULT_HR_MAG_LIMIT = 6.5;
export const DEFAULT_HR_VOLUME_RADIUS = 25;
export const INNER_GALACTIC_PLANE_TARGET_PC = GALACTIC_CENTER_PC;
const MOBILE_HR_MARGIN_PX = 14;
const DESKTOP_HR_MARGIN_PX = 24;

const DEFAULT_LOOK_DISTANCE_PC = 2500;
const HR_TRANSIT_MOTION_ADAPTIVE_MAX_LEVEL = Object.freeze({
	lookaheadSecs: 0.5,
	minLevel: 8,
});

const GALACTIC_TO_ICRS_ROTATION = [
	[-0.0548755604, +0.4941094279, -0.8676661490],
	[-0.8734370902, -0.4448296300, -0.1980763734],
	[-0.4838350155, +0.7469822445, +0.4559837762],
];

export const GALACTIC_NORTH_TARGET_PC = Object.freeze(galacticToIcrsPoint(0, DEFAULT_LOOK_DISTANCE_PC, 0));

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

function galacticToIcrsPoint(gx, gy, gz) {
	return {
		x:
			GALACTIC_TO_ICRS_ROTATION[0][0] * gx
			+ GALACTIC_TO_ICRS_ROTATION[0][1] * gy
			+ GALACTIC_TO_ICRS_ROTATION[0][2] * gz,
		y:
			GALACTIC_TO_ICRS_ROTATION[1][0] * gx
			+ GALACTIC_TO_ICRS_ROTATION[1][1] * gy
			+ GALACTIC_TO_ICRS_ROTATION[1][2] * gz,
		z:
			GALACTIC_TO_ICRS_ROTATION[2][0] * gx
			+ GALACTIC_TO_ICRS_ROTATION[2][1] * gy
			+ GALACTIC_TO_ICRS_ROTATION[2][2] * gz,
	};
}

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

function normalizePoint(point, fallback = null) {
	if (!point || typeof point !== 'object') {
		return fallback;
	}

	const x = Number(point.x);
	const y = Number(point.y);
	const z = Number(point.z);
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
		return fallback;
	}

	return { x, y, z };
}

function pointDistance(left, right) {
	if (!left || !right) {
		return Number.POSITIVE_INFINITY;
	}

	const dx = right.x - left.x;
	const dy = right.y - left.y;
	const dz = right.z - left.z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export async function mountHrDiagramViewer(root) {
	const mount = root.querySelector('[data-hr-diagram-viewer-shell]');
	if (!mount) {
		throw new Error('Missing [data-hr-diagram-viewer-shell] mount for HR diagram viewer.');
	}

	const hrCanvasElement = root.querySelector('[data-hr-diagram-viewer-hr]');
	const highlightName = root.dataset.highlight || '';
	const showHr = parseBoolean(root.dataset.showHr);
	let activeMagLimit = DEFAULT_HR_MAG_LIMIT;
	let activeMode = 0;
	let activeRadius = DEFAULT_HR_VOLUME_RADIUS;
	let viewer = null;
	let cameraController = null;
	let hrDiagram = null;
	let volumeLoader = null;
	let volumeLoadPromise = null;
	let volumeReloadPending = false;
	let reloadQueued = false;
	let pendingVolumeForce = false;
	let lastObserverPc = { ...SOLAR_ORIGIN_PC };
	let lastVolumeObserverPc = null;
	let lastStarFieldGeometry = null;
	let lastStarFieldCount = 0;
	let lastVolumeGeometry = null;

	const topicId = root.dataset.topic || 'hr-diagram';
	const sessionId =
		root.dataset.datasetId || `website-learn-hr-diagram-${topicId}`;
	const octreeUrl = readDatasetString(root, 'octreeUrl');
	const metaUrl = readDatasetString(root, 'metaUrl');
	const datasetSession = createLocalDatasetSession(sessionId, {
		...(octreeUrl ? { octreeUrl } : {}),
		...(metaUrl ? { metaUrl } : {}),
	});

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
		hrDiagram?.setStarCount(0);

		if (magRow) magRow.hidden = mode === 1;
		if (volumeRow) volumeRow.hidden = mode !== 1;
	}

	function syncHrFromStarField() {
		if (!hrDiagram || !lastStarFieldGeometry) return;
		hrDiagram.setGeometry(lastStarFieldGeometry);
		hrDiagram.setStarCount(0);
	}

	async function refreshSelection() {
		if (!viewer?.refreshSelection) return;
		try {
			await viewer.refreshSelection();
		} catch (error) {
			console.error('[website:hr-diagram-viewer] refresh failed', error);
		}
	}

	async function loadVolumeHR({ force = false } = {}) {
		if (!volumeLoader || activeMode !== 1) return;
		if (volumeLoadPromise) {
			volumeReloadPending = true;
			pendingVolumeForce = pendingVolumeForce || force;
			return volumeLoadPromise;
		}
		const observerPc =
			viewer?.getSnapshotState?.()?.state?.observerPc ?? SOLAR_ORIGIN_PC;
		if (
			!force
			&& lastVolumeGeometry
			&& pointDistance(lastVolumeObserverPc, observerPc) < Math.max(6, activeRadius * 0.4)
		) {
			return null;
		}

		lastObserverPc = { ...observerPc };
		lastVolumeObserverPc = { ...observerPc };
		volumeLoadPromise = volumeLoader.load({
			observerPc,
			maxRadiusPc: activeRadius,
		});

		try {
			const result = await volumeLoadPromise;
			if (!result) return null;

			lastVolumeGeometry = result.geometry;
			if (activeMode === 1) {
				hrDiagram?.setGeometry(result.geometry);
				hrDiagram?.setStarCount(0);
			}

			return result;
		} finally {
			volumeLoadPromise = null;
			if (volumeReloadPending && activeMode === 1) {
				const nextForce = pendingVolumeForce;
				volumeReloadPending = false;
				pendingVolumeForce = false;
				queueVolumeReload({ force: nextForce });
			}
		}
	}

	function queueVolumeReload({ force = false } = {}) {
		if (reloadQueued) return;
		pendingVolumeForce = pendingVolumeForce || force;
		reloadQueued = true;
		requestAnimationFrame(() => {
			reloadQueued = false;
			const nextForce = pendingVolumeForce;
			pendingVolumeForce = false;
			loadVolumeHR({ force: nextForce }).catch((err) =>
				console.error('[website:hr-diagram-viewer] volume load failed', err),
			);
		});
	}

	const highlightState = buildHighlightState(highlightName);
	const highlightPreset = HIGHLIGHT_PRESETS[highlightName] || null;
	if (showHr && hrCanvasElement instanceof HTMLCanvasElement) {
		const isPhone = window.matchMedia('(max-width: 720px)').matches;
		hrDiagram = new HRDiagramRenderer(hrCanvasElement, {
			mode: activeMode,
			marginPx: isPhone ? MOBILE_HR_MARGIN_PX : DESKTOP_HR_MARGIN_PX,
		});
		hrDiagram.setAppMagLimit(activeMagLimit);
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
							if (moved > Math.max(6, activeRadius * 0.4)) {
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
				hrDiagram?.setStarCount(0);
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

		cameraController = createCameraRigController({
			id: `website-hr-diagram-fly-${topicId}`,
			observerPc: SOLAR_ORIGIN_PC,
			lookAtPc: INNER_GALACTIC_PLANE_TARGET_PC,
			moveSpeed: 12,
			keyboardTarget: NO_KEYBOARD_EVENTS_TARGET,
		});

		viewer = await createViewer(mount, {
			datasetSession,
			interestField: createObserverShellField({
				id: `website-hr-diagram-field-${topicId}`,
				note: 'HR diagram topic observer-shell field.',
				motionAdaptiveMaxLevel: HR_TRANSIT_MOTION_ADAPTIVE_MAX_LEVEL,
			}),
			controllers: [
				cameraController,
				createSelectionRefreshController({
					id: `website-hr-diagram-refresh-${topicId}`,
					observerDistancePc: 12,
					minIntervalMs: 220,
					watchSize: false,
				}),
			],
			layers: [starLayer],
			overlays: hrOverlay ? [hrOverlay] : [],
			state: {
				observerPc: { ...SOLAR_ORIGIN_PC },
				targetPc: { ...INNER_GALACTIC_PLANE_TARGET_PC },
				fieldStrategy: 'observer-shell',
				mDesired: activeMagLimit,
				starFieldExposure: 80,
				...highlightState,
			},
			clearColor: 0x02040b,
		});

		volumeLoader = createVolumeHRLoader({ datasetSession });
	}

	function updateMagUi() {
		if (magInput) magInput.value = String(activeMagLimit);
		if (magValue) magValue.textContent = activeMagLimit.toFixed(1);
		hrDiagram?.setAppMagLimit(activeMagLimit);
	}

	function updateRadiusUi() {
		if (radiusInput) radiusInput.value = String(activeRadius);
		if (radiusValue) radiusValue.textContent = `${activeRadius} pc`;
	}

	function lookAtPc(targetPc, options = {}) {
		const target = normalizePoint(targetPc, null);
		if (!target) {
			return null;
		}

		const blend = Number.isFinite(options.blend) ? options.blend : 0.16;
		cameraController?.cancelOrientation?.();
		cameraController?.lookAt?.(target, { blend });
		viewer?.setState?.({ targetPc: target });
		return target;
	}

	async function applyScene(scene = {}) {
		const nextObserverPc = normalizePoint(scene.observerPc, null);
		const nextTargetPc = normalizePoint(scene.targetPc, null);
		const orbitCenterPc = normalizePoint(scene.orbitCenter, null);
		const nextMode = Number.isFinite(scene.mode) ? Number(scene.mode) : null;
		const nextMagLimit = Number.isFinite(scene.magLimit) ? Number(scene.magLimit) : null;
		const nextRadius = Number.isFinite(scene.radius) ? Number(scene.radius) : null;
		const shouldOrbit = Boolean(orbitCenterPc);
		const shouldFly = !shouldOrbit && nextObserverPc && Number.isFinite(scene.flySpeed);

		function afterMotion() {
			refreshSelection().catch((error) => {
				console.error('[website:hr-diagram-viewer] motion refresh failed', error);
			});

			if (activeMode === 1) {
				loadVolumeHR({ force: true }).catch((error) => {
					console.error('[website:hr-diagram-viewer] motion volume refresh failed', error);
				});
			} else {
				syncHrFromStarField();
			}
		}

		if (nextMode !== null) {
			setActiveMode(nextMode);
		}

		if (nextMagLimit !== null) {
			activeMagLimit = nextMagLimit;
			updateMagUi();
		}

		if (nextRadius !== null) {
			activeRadius = nextRadius;
			updateRadiusUi();
		}

		const stateUpdate = {};
		if (nextObserverPc && !shouldFly) {
			stateUpdate.observerPc = nextObserverPc;
			lastObserverPc = { ...nextObserverPc };
		}
		if (nextTargetPc) {
			stateUpdate.targetPc = nextTargetPc;
		}
		if (nextMagLimit !== null) {
			stateUpdate.mDesired = activeMagLimit;
		}

		if (viewer && Object.keys(stateUpdate).length > 0) {
			viewer.setState(stateUpdate);
		}

		cameraController?.cancelAutomation?.();

		if (shouldOrbit && orbitCenterPc) {
			const lockTarget = nextTargetPc ?? orbitCenterPc;
			if (lockTarget) {
				viewer?.setState?.({ targetPc: lockTarget });
				cameraController?.lockAt?.(lockTarget, {
					dwellMs: Number.isFinite(scene.dwellMs) ? scene.dwellMs : 5_000,
					recenterSpeed: Number.isFinite(scene.recenterSpeed) ? scene.recenterSpeed : 0.06,
				});
			}
			cameraController?.orbitalInsert?.(orbitCenterPc, {
				orbitRadius: Number.isFinite(scene.orbitRadius) ? scene.orbitRadius : 8,
				angularSpeed: Number.isFinite(scene.angularSpeed) ? scene.angularSpeed : 0.16,
				approachSpeed: Number.isFinite(scene.flySpeed) ? scene.flySpeed : 120,
				deceleration: Number.isFinite(scene.deceleration) ? scene.deceleration : 2.5,
				onInserted: afterMotion,
			});
		} else if (shouldFly && nextObserverPc) {
			if (nextTargetPc) {
				viewer?.setState?.({ targetPc: nextTargetPc });
				cameraController?.lockAt?.(nextTargetPc, {
					dwellMs: Number.isFinite(scene.dwellMs) ? scene.dwellMs : 4_000,
					recenterSpeed: Number.isFinite(scene.recenterSpeed) ? scene.recenterSpeed : 0.05,
				});
			}
			cameraController?.flyTo?.(nextObserverPc, {
				speed: scene.flySpeed,
				deceleration: Number.isFinite(scene.deceleration) ? scene.deceleration : 2.2,
				arrivalThreshold: Number.isFinite(scene.arrivalThreshold) ? scene.arrivalThreshold : 0.05,
				onArrive: afterMotion,
			});
			lastObserverPc = { ...nextObserverPc };
		} else if (nextTargetPc) {
			lookAtPc(nextTargetPc, scene);
		}

		if (!shouldFly && !shouldOrbit && viewer && (nextObserverPc || nextMagLimit !== null)) {
			await refreshSelection();
		}

		if (!shouldFly && !shouldOrbit && activeMode === 1) {
			await loadVolumeHR();
		} else if (!shouldFly && !shouldOrbit) {
			syncHrFromStarField();
		}

		return getState();
	}

	function getState() {
		const snapshot = viewer?.getSnapshotState?.()?.state ?? {};
		return {
			mode: activeMode,
			magLimit: activeMagLimit,
			radius: activeRadius,
			observerPc: snapshot.observerPc ?? { ...SOLAR_ORIGIN_PC },
			targetPc: snapshot.targetPc ?? { ...INNER_GALACTIC_PLANE_TARGET_PC },
		};
	}

	function onResize() {
		hrDiagram?.resize();
	}

	async function destroy() {
		volumeLoader?.cancel();
		window.removeEventListener('resize', onResize);
		window.removeEventListener('beforeunload', destroy);
		await viewer?.dispose?.();
	}

	modeButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			const mode = Number(btn.dataset.hrMode);
			applyScene({ mode }).catch((err) =>
				console.error('[website:hr-diagram-viewer] mode change failed', err),
			);
		});
	});

	magInput?.addEventListener('input', () => {
		activeMagLimit = Number(magInput.value) || DEFAULT_HR_MAG_LIMIT;
		updateMagUi();
	});

	magInput?.addEventListener('change', () => {
		const magLimit = Number(magInput.value) || DEFAULT_HR_MAG_LIMIT;
		applyScene({ magLimit }).catch((err) =>
			console.error('[website:hr-diagram-viewer] mag refresh failed', err),
		);
	});

	radiusInput?.addEventListener('input', () => {
		activeRadius = Number(radiusInput.value) || DEFAULT_HR_VOLUME_RADIUS;
		updateRadiusUi();
	});

	radiusInput?.addEventListener('change', () => {
		const radius = Number(radiusInput.value) || DEFAULT_HR_VOLUME_RADIUS;
		applyScene({ radius }).catch((err) =>
			console.error('[website:hr-diagram-viewer] radius refresh failed', err),
		);
	});

	setActiveMode(activeMode);
	updateMagUi();
	updateRadiusUi();
	await createAndMountViewer();
	window.addEventListener('resize', onResize);
	window.addEventListener('beforeunload', destroy);

	return {
		applyScene,
		destroy,
		getState,
		lookAtPc,
		viewer,
	};
}
