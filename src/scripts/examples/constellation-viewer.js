import {
	buildConstellationDirectionResolver,
	buildSimbadBasicSearch,
	createCameraRigController,
	createParallaxPositionController,
	createPickController,
	icrsDirectionToTargetPc,
	createDefaultStarFieldMaterialProfile,
	createFoundInSpaceDatasetOptions,
	createFullscreenPreset,
	createHud,
	createObserverShellField,
	createSceneOrientationTransforms,
	createSelectionRefreshController,
	createStarFieldLayer,
	createTargetFrustumField,
	createViewer,
	DEFAULT_STAR_FIELD_STATE,
	getDatasetSession,
	loadConstellationArtManifest,
	ORION_CENTER_PC,
	SCALE,
	SOLAR_ORIGIN_PC,
	resolveFoundInSpaceDatasetOverrides,
	createConstellationPreset,
	createFlyToAction,
	createLookAtAction,
	createSpeedReadout,
	createDistanceReadout,
	formatDistancePc,
} from '@found-in-space/skykit';

import { showDeviceOrientationUi } from '../device-capabilities.js';

const DEFAULT_WESTERN_MANIFEST_URL =
	'https://unpkg.com/@found-in-space/stellarium-skycultures-western@0.1.0/dist/manifest.json';

const {
	icrsToScene: SCENE_TRANSFORM,
	sceneToIcrs: SCENE_TO_ICRS_TRANSFORM,
} = createSceneOrientationTransforms(ORION_CENTER_PC);
const PARALLAX_TARGET_DISTANCE_PC = Math.hypot(
	ORION_CENTER_PC.x,
	ORION_CENTER_PC.y,
	ORION_CENTER_PC.z,
);

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

function resolveManifestName(name, iau) {
	if (name?.native) return name.native;
	if (name?.english) return name.english;
	return iau;
}

function createConstellationJumpCatalog(manifest) {
	const resolver = buildConstellationDirectionResolver(manifest);
	const byIau = new Map();
	const catalog = [];
	for (const entry of resolver.listConstellations()) {
		if (!entry?.iau || !Array.isArray(entry?.centroidIcrs) || entry.centroidIcrs.length !== 3) {
			continue;
		}
		const label = resolveManifestName(entry.name, entry.iau);
		const row = {
			iau: entry.iau,
			label,
			centroidIcrs: entry.centroidIcrs,
			imageUpIcrs: Array.isArray(entry.imageUpIcrs) ? entry.imageUpIcrs : null,
		};
		byIau.set(entry.iau, row);
		catalog.push({ iau: entry.iau, label });
	}
	catalog.sort((a, b) => a.label.localeCompare(b.label));
	return { catalog, byIau };
}

function scenePositionToIcrsPc(pos) {
	const [ix, iy, iz] = SCENE_TO_ICRS_TRANSFORM(pos.x, pos.y, pos.z);
	return { x: ix / SCALE, y: iy / SCALE, z: iz / SCALE };
}

/**
 * @param {HTMLElement} starPickCard
 * @param {{ datasetSession: object, starFieldLayer: object, cameraController: object }} ctx
 * @returns {{ pickController: object, dispose: () => void }}
 */
function createStarPickCardBinding(starPickCard, ctx) {
	const { datasetSession, starFieldLayer, cameraController } = ctx;
	const root = starPickCard;
	const properEl = root.querySelector('[data-star-pick-proper]');
	const bayerEl = root.querySelector('[data-star-pick-bayer]');
	const catalogValueEl = root.querySelector('[data-star-pick-catalog-value]');
	const distanceEl = root.querySelector('[data-star-pick-distance]');
	const dismissBtn = root.querySelector('[data-star-pick-dismiss]');
	const flyOrbitBtn = root.querySelector('[data-star-pick-fly-orbit]');
	const simbadBtn = root.querySelector('[data-star-pick-simbad]');

	let pickGeneration = 0;
	let lastResult = null;
	let lastSimbadUrl = null;
	let distanceRafId = null;

	function stopDistanceUpdates() {
		if (distanceRafId != null) {
			cancelAnimationFrame(distanceRafId);
			distanceRafId = null;
		}
	}

	function updateDistanceDisplay() {
		if (!distanceEl || !lastResult?.position || !cameraController) {
			if (distanceEl) distanceEl.textContent = '—';
			return;
		}
		const starPc = scenePositionToIcrsPc(lastResult.position);
		const obs = cameraController.getStats()?.motion?.observerPc;
		if (
			!obs
			|| !Number.isFinite(starPc.x)
			|| !Number.isFinite(obs.x)
		) {
			distanceEl.textContent = '—';
			return;
		}
		const dPc = Math.hypot(
			starPc.x - obs.x,
			starPc.y - obs.y,
			starPc.z - obs.z,
		);
		distanceEl.textContent = formatDistancePc(dPc);
	}

	function distanceTick() {
		distanceRafId = null;
		if (root.hidden || !lastResult?.position) return;
		updateDistanceDisplay();
		distanceRafId = requestAnimationFrame(distanceTick);
	}

	function startDistanceUpdates() {
		stopDistanceUpdates();
		updateDistanceDisplay();
		if (!root.hidden && lastResult?.position) {
			distanceRafId = requestAnimationFrame(distanceTick);
		}
	}

	function renderCatalogFields(fields) {
		const f = fields && typeof fields === 'object' ? fields : {};
		if (properEl) {
			properEl.textContent =
				typeof f.properName === 'string' && f.properName.trim() ? f.properName.trim() : '—';
		}
		if (bayerEl) {
			bayerEl.textContent =
				typeof f.bayer === 'string' && f.bayer.trim() ? f.bayer.trim() : '—';
		}
		const simbad = buildSimbadBasicSearch(f);
		lastSimbadUrl = simbad?.url ?? null;
		if (catalogValueEl) {
			if (simbad) {
				catalogValueEl.textContent = simbad.label;
			} else {
				const hdOnly = typeof f.hd === 'string' && f.hd.trim() ? f.hd.trim() : '';
				catalogValueEl.textContent = hdOnly ? `HD ${hdOnly}` : '—';
			}
		}
		if (simbadBtn) {
			simbadBtn.hidden = !simbad;
		}
	}

	function hideCard() {
		stopDistanceUpdates();
		if (distanceEl) distanceEl.textContent = '—';
		root.hidden = true;
		pickGeneration += 1;
		lastResult = null;
		lastSimbadUrl = null;
	}

	function handlePick(result) {
		pickGeneration += 1;
		const gen = pickGeneration;
		lastResult = result;

		if (!result) {
			if (!root.hidden) {
				cameraController?.cancelAutomation();
			}
			stopDistanceUpdates();
			if (distanceEl) distanceEl.textContent = '—';
			root.hidden = true;
			lastResult = null;
			return;
		}

		delete result.sidecarFields;
		root.hidden = false;
		renderCatalogFields({});
		startDistanceUpdates();

		const starData = starFieldLayer.getStarData();
		const pickMeta = starData?.pickMeta?.[result.index];
		if (!pickMeta || !datasetSession.getSidecarService('meta')) {
			return;
		}

		void (async () => {
			try {
				const fields = await datasetSession.resolveSidecarMetaFields('meta', pickMeta);
				if (gen !== pickGeneration || lastResult !== result) return;
				if (fields) {
					result.sidecarFields = fields;
					renderCatalogFields(fields);
				} else {
					renderCatalogFields({});
				}
			} catch {
				if (gen !== pickGeneration || lastResult !== result) return;
				renderCatalogFields({});
			}
		})();
	}

	const pickController = createPickController({
		id: 'website-explore-constellations-pick',
		getStarData: () => starFieldLayer.getStarData(),
		onPick(result) {
			handlePick(result);
		},
	});

	function dismiss() {
		cameraController?.cancelAutomation();
		pickController.clearSelection();
		hideCard();
	}

	function onFlyOrbitClick(e) {
		e.preventDefault();
		e.stopPropagation();
		if (!cameraController || !lastResult?.position) return;
		const centerPc = scenePositionToIcrsPc(lastResult.position);
		const distPc = Number.isFinite(lastResult.distancePc) ? lastResult.distancePc : 1;
		const orbitRadius = Math.min(Math.max(distPc * 0.065, 0.12), 28);
		cameraController.cancelAutomation();
		cameraController.lockAt(centerPc, {
			dwellMs: 120_000,
			recenterSpeed: 0.06,
		});
		cameraController.orbitalInsert(centerPc, {
			orbitRadius,
			angularSpeed: 0.12,
			approachSpeed: 120,
			deceleration: 2.5,
		});
	}

	function onSimbadClick(e) {
		e.preventDefault();
		e.stopPropagation();
		if (!lastSimbadUrl) return;
		window.open(lastSimbadUrl, '_blank', 'noopener,noreferrer');
	}

	function onStarPickActionPointerDown(e) {
		e.stopPropagation();
	}

	function onKeydown(e) {
		if (e.key === 'Escape' && !root.hidden) {
			dismiss();
		}
	}

	document.addEventListener('keydown', onKeydown);
	dismissBtn?.addEventListener('click', dismiss);
	flyOrbitBtn?.addEventListener('click', onFlyOrbitClick);
	flyOrbitBtn?.addEventListener('pointerdown', onStarPickActionPointerDown);
	simbadBtn?.addEventListener('click', onSimbadClick);
	simbadBtn?.addEventListener('pointerdown', onStarPickActionPointerDown);

	return {
		pickController,
		dispose() {
			stopDistanceUpdates();
			document.removeEventListener('keydown', onKeydown);
			dismissBtn?.removeEventListener('click', dismiss);
			flyOrbitBtn?.removeEventListener('click', onFlyOrbitClick);
			flyOrbitBtn?.removeEventListener('pointerdown', onStarPickActionPointerDown);
			simbadBtn?.removeEventListener('click', onSimbadClick);
			simbadBtn?.removeEventListener('pointerdown', onStarPickActionPointerDown);
		},
	};
}

/**
 * Mount a constellation viewer in free-fly or parallax mode.
 *
 * @param {HTMLElement} mount   Container element for the viewer canvas.
 * @param {object}      options
 * @param {'freeFly'|'parallax'} options.mode
 * @param {(msg: string) => void} [options.onStatus]
 * @param {HTMLElement} [options.starPickCard] When set (freeFly only), enables click-to-identify with a compact catalog card.
 * @returns {Promise<{
 *  viewer: object,
 *  cameraController: object,
 *  parallaxController?: object,
 *  constellations: Array<{iau: string, label: string}>,
 *  setConstellation: (iau: string) => boolean
 * }>}
 */
export async function mountConstellationViewer(mount, options = {}) {
	const mode = options.mode ?? 'freeFly';
	const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
	const starPickCard = options.starPickCard instanceof HTMLElement ? options.starPickCard : null;
	const enableStarPick = Boolean(starPickCard && mode === 'freeFly');

	const sessionId = mode === 'parallax'
		? 'website-explore-parallax'
		: 'website-explore-constellations';
	const datasetSession = createDatasetSession(sessionId);

	onStatus('Loading star data…');
	await datasetSession.ensureRenderRootShard();
	await datasetSession.ensureRenderBootstrap();

	const manifest = await loadConstellationArtManifest({
		manifestUrl: DEFAULT_WESTERN_MANIFEST_URL,
	});
	const constellationCatalog = createConstellationJumpCatalog(manifest);

	const cameraController = createCameraRigController({
		id: `website-explore-${mode}-camera`,
		icrsToSceneTransform: SCENE_TRANSFORM,
		sceneToIcrsTransform: SCENE_TO_ICRS_TRANSFORM,
		...(mode === 'parallax'
			? {}
			: {
					lookAtPc: ORION_CENTER_PC,
					moveSpeed: 18,
				}),
	});

	const parallaxController = mode === 'parallax'
		? createParallaxPositionController({
				id: 'website-explore-parallax-position',
				cameraController,
				offsetPc: 1.0,
				pointer: { invertX: true },
				motion: { swapAxes: false, invertX: true },
				onModeChange: (m) => onStatus(`Input: ${m}`),
				onStatus,
			})
		: null;

	const constellation = createConstellationPreset({
		manifest,
		manifestUrl: DEFAULT_WESTERN_MANIFEST_URL,
		sceneToIcrsTransform: SCENE_TO_ICRS_TRANSFORM,
		transformDirection: SCENE_TRANSFORM,
		position: 'top-left',
	});

	const fullscreen = createFullscreenPreset();

	const freeFlyControls = mode === 'freeFly'
		? [
				{ preset: 'arrows', position: 'bottom-right' },
				{ preset: 'wasd-qe', position: 'bottom-left' },
				createSpeedReadout(cameraController, { position: 'top-left' }),
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
			]
		: [];

	const parallaxControls =
		mode === 'parallax' && showDeviceOrientationUi && parallaxController
			? [
					{
						label: '📱 Device Motion',
						title: 'Enable tilt-based parallax',
						position: 'bottom-right',
						onPress: () => {
							parallaxController.enableMotion().catch((err) => {
								console.error('[website:parallax-motion]', err);
							});
						},
					},
				]
			: [];

	const interestField = mode === 'parallax'
		? createTargetFrustumField({
				id: 'website-explore-parallax-field',
				targetPc: (ctx) => ctx?.state?.targetPc ?? ORION_CENTER_PC,
				verticalFovDeg: 52,
				overscanDeg: 18,
				targetRadiusPc: 180,
				preloadDistancePc: 6,
			})
		: createObserverShellField({
				id: 'website-explore-freeFly-field',
			});

	const starFieldLayer = createStarFieldLayer({
		id: `website-explore-${mode}-stars`,
		positionTransform: SCENE_TRANSFORM,
		materialFactory: () => createDefaultStarFieldMaterialProfile(),
		includePickMeta: enableStarPick,
	});

	const starPickBinding = enableStarPick
		? createStarPickCardBinding(starPickCard, {
				datasetSession,
				starFieldLayer,
				cameraController,
			})
		: null;

	const viewer = await createViewer(mount, {
		datasetSession,
		interestField,
		controllers: [
			cameraController,
			...(parallaxController ? [parallaxController] : []),
			createSelectionRefreshController({
				id: `website-explore-${mode}-refresh`,
				observerDistancePc: mode === 'parallax' ? 0.02 : 12,
				...(mode === 'parallax' ? { targetDistancePc: 0.5 } : {}),
				minIntervalMs: mode === 'parallax' ? 120 : 250,
				watchSize: false,
			}),
			constellation.compassController,
			fullscreen.controller,
			...(starPickBinding ? [starPickBinding.pickController] : []),
			createHud({
				cameraController,
				controls: [
					...constellation.controls,
					...freeFlyControls,
					...parallaxControls,
					...fullscreen.controls,
				],
			}),
		],
		layers: [
			constellation.artLayer,
			starFieldLayer,
		],
		state: {
			...DEFAULT_STAR_FIELD_STATE,
			observerPc: { x: 0, y: 0, z: 0 },
			targetPc: ORION_CENTER_PC,
			fieldStrategy: mode === 'parallax' ? 'target-frustum' : 'observer-shell',
		},
		clearColor: 0x02040b,
	});

	if (mode === 'freeFly') {
		onStatus(
			enableStarPick
				? 'Drag to look around. Use on-screen buttons or WASD to move. Click a star for catalog names.'
				: 'Drag to look around. Use on-screen buttons or WASD to move.',
		);
	} else {
		onStatus('Move the pointer across the scene to shift Earth and watch nearer stars slide more than distant ones.');
	}

	window.addEventListener('beforeunload', () => {
		starPickBinding?.dispose();
		viewer.dispose().catch((err) => {
			console.error(`[website:${mode}-cleanup]`, err);
		});
	});

	const setConstellationFreeFly = (iau) => {
		const entry = constellationCatalog.byIau.get(iau) ?? null;
		if (!entry) {
			return false;
		}
		const observerPc =
			viewer.getSnapshotState().state?.observerPc
			?? cameraController.getStats().observerPc
			?? { x: 0, y: 0, z: 0 };
		const targetPc = icrsDirectionToTargetPc(
			entry.centroidIcrs,
			PARALLAX_TARGET_DISTANCE_PC,
			observerPc,
		);
		if (!targetPc) {
			return false;
		}

		viewer.setState({ targetPc });
		cameraController.lookAt(targetPc, {
			blend: 0.06,
			upIcrs: entry.imageUpIcrs ?? null,
		});

		return true;
	};

	if (mode === 'freeFly') {
		return {
			viewer,
			cameraController,
			constellations: constellationCatalog.catalog,
			setConstellation: setConstellationFreeFly,
		};
	}

	const orionEntry = constellationCatalog.byIau.get('Ori') ?? null;
	cameraController.lockAt(ORION_CENTER_PC, {
		upIcrs: orionEntry?.imageUpIcrs ?? null,
		recenterSpeed: 1.0,
	});
	parallaxController.enable();

	const setConstellation = (iau) => {
		const entry = constellationCatalog.byIau.get(iau) ?? null;
		if (!entry) {
			return false;
		}
		const targetPc = icrsDirectionToTargetPc(entry.centroidIcrs, PARALLAX_TARGET_DISTANCE_PC);
		if (!targetPc) {
			return false;
		}

		parallaxController.disable();
		viewer.setState({ targetPc });

		cameraController.lookAt(targetPc, {
			blend: 0.06,
			upIcrs: entry.imageUpIcrs ?? null,
			onArrive: () => {
				cameraController.lockAt(targetPc, {
					upIcrs: entry.imageUpIcrs ?? null,
					recenterSpeed: 1.0,
				});
				parallaxController.enable();
			},
		});

		return true;
	};

	return {
		viewer,
		cameraController,
		parallaxController,
		constellations: constellationCatalog.catalog,
		setConstellation,
	};
}
