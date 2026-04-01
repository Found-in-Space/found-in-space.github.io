import {
	createCameraRigController,
	createParallaxPositionController,
	buildConstellationDirectionResolver,
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
	SOLAR_ORIGIN_PC,
	resolveFoundInSpaceDatasetOverrides,
	createConstellationPreset,
	createFlyToAction,
	createLookAtAction,
	createSpeedReadout,
	createDistanceReadout,
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

function createParallaxConstellationCatalog(manifest) {
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

/**
 * Mount a constellation viewer in free-fly or parallax mode.
 *
 * @param {HTMLElement} mount   Container element for the viewer canvas.
 * @param {object}      options
 * @param {'freeFly'|'parallax'} options.mode
 * @param {(msg: string) => void} [options.onStatus]
 * @returns {Promise<{
 *  viewer: object,
 *  cameraController: object,
 *  constellations?: Array<{iau: string, label: string}>,
 *  setConstellation?: (iau: string) => boolean
 * }>}
 */
export async function mountConstellationViewer(mount, options = {}) {
	const mode = options.mode ?? 'freeFly';
	const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

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
	const parallaxCatalog = mode === 'parallax'
		? createParallaxConstellationCatalog(manifest)
		: null;

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
			createStarFieldLayer({
				id: `website-explore-${mode}-stars`,
				positionTransform: SCENE_TRANSFORM,
				materialFactory: () => createDefaultStarFieldMaterialProfile(),
			}),
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
		onStatus('Drag to look around. Use on-screen buttons or WASD to move.');
	} else {
		onStatus('Move the pointer across the scene to shift Earth and watch nearer stars slide more than distant ones.');
	}

	window.addEventListener('beforeunload', () => {
		viewer.dispose().catch((err) => {
			console.error(`[website:${mode}-cleanup]`, err);
		});
	});

	if (mode !== 'parallax') {
		return { viewer, cameraController };
	}

	const orionEntry = parallaxCatalog?.byIau.get('Ori') ?? null;
	cameraController.lockAt(ORION_CENTER_PC, {
		upIcrs: orionEntry?.imageUpIcrs ?? null,
		recenterSpeed: 1.0,
	});
	parallaxController.enable();

	const setConstellation = (iau) => {
		const entry = parallaxCatalog?.byIau.get(iau) ?? null;
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
		constellations: parallaxCatalog?.catalog ?? [],
		setConstellation,
	};
}
