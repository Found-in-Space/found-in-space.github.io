import * as THREE from 'three';
import {
	createDesktopStarFieldMaterialProfile,
	createFoundInSpaceDatasetOptions,
	createObserverShellField,
	createSelectionRefreshController,
	createStarFieldLayer,
	createThrustController,
	createViewer,
	getDatasetSession,
	resolveFoundInSpaceDatasetOverrides,
	SOLAR_ORIGIN_PC,
} from '@found-in-space/skykit';

const PC_TO_LY = 3.26156;
const DEFAULT_MAX_SPEED_PC_PER_SECOND = 45;

function setText(node, text) {
	if (node) {
		node.textContent = text;
	}
}

function formatLy(valueLy) {
	if (!Number.isFinite(valueLy)) {
		return '--';
	}
	if (valueLy >= 1000) {
		return `${(valueLy / 1000).toFixed(1)}k ly`;
	}
	if (valueLy >= 10) {
		return `${valueLy.toFixed(1)} ly`;
	}
	return `${valueLy.toFixed(2)} ly`;
}

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

function estimateSceneScale(viewer, fallback = 1000) {
	const snapshot = viewer.getSnapshotState();
	const observerPc = snapshot.state?.observerPc;
	const camera = viewer.runtime?.camera;
	if (!observerPc || !camera) {
		return fallback;
	}

	const ratios = [];
	if (Math.abs(observerPc.x) > 1e-6) {
		ratios.push(Math.abs(camera.position.x / observerPc.x));
	}
	if (Math.abs(observerPc.y) > 1e-6) {
		ratios.push(Math.abs(camera.position.y / observerPc.y));
	}
	if (Math.abs(observerPc.z) > 1e-6) {
		ratios.push(Math.abs(camera.position.z / observerPc.z));
	}
	if (ratios.length === 0) {
		return fallback;
	}
	return ratios.reduce((sum, next) => sum + next, 0) / ratios.length;
}

async function mountLightYear(root) {
	const mount = root.querySelector('[data-lightyear-mount]');
	if (!mount) {
		return;
	}

	const status = root.querySelector('[data-lightyear-status]');
	const speedText = root.querySelector('[data-lightyear-speed]');
	const speedBar = root.querySelector('[data-lightyear-speed-bar]');
	const sunDistance = root.querySelector('[data-lightyear-sun-distance]');
	const sunArrow = root.querySelector('[data-lightyear-sun-arrow]');
	const pickedDistance = root.querySelector('[data-lightyear-picked-distance]');
	const pickedName = root.querySelector('[data-lightyear-picked-name]');
	let viewer = null;
	let animationHandle = null;
	let pointsMesh = null;
	let selectedStar = null;
	let sceneScale = 1000;
	const raycaster = new THREE.Raycaster();
	const ndc = new THREE.Vector2();
	const tempVector = new THREE.Vector3();
	const sunVector = new THREE.Vector3();
	const cameraSpaceSun = new THREE.Vector3();
	const maxSpeedPcPerSecond = Number.isFinite(Number(root.dataset.maxSpeed))
		? Number(root.dataset.maxSpeed)
		: DEFAULT_MAX_SPEED_PC_PER_SECOND;
	const topicSlug = root.dataset.topic || 'how-far-is-a-light-year';
	const datasetId = root.dataset.datasetId || `website-topic-lightyear-${topicSlug}`;
	const datasetSession = createDatasetSession(datasetId);

	const starLayerId = `website-lightyear-stars-${topicSlug}`;
	const starLayer = createStarFieldLayer({
		id: starLayerId,
		materialFactory: () =>
			createDesktopStarFieldMaterialProfile({
				exposure: 85,
			}),
	});

	const thrustController = createThrustController({
		id: `website-lightyear-thrust-${topicSlug}`,
		observerPc: SOLAR_ORIGIN_PC,
		maxSpeed: maxSpeedPcPerSecond,
		thrustAcceleration: 9,
		brakeFactor: 2,
		dragCoefficient: 0.015,
	});

	function setStatus(message) {
		setText(status, message);
	}

	function updateHud() {
		if (!viewer) {
			return;
		}
		const camera = viewer.runtime?.camera;
		if (!camera) {
			return;
		}
		sceneScale = estimateSceneScale(viewer, sceneScale);

		const speedLyPerSecond = thrustController.speed * PC_TO_LY;
		setText(speedText, `${speedLyPerSecond.toFixed(2)} ly/s`);
		if (speedBar) {
			const speedNorm = Math.min(1, thrustController.speed / maxSpeedPcPerSecond);
			speedBar.style.width = `${Math.max(2, speedNorm * 100)}%`;
		}

		sunVector.set(0, 0, 0).sub(camera.position);
		const distancePc = sunVector.length() / Math.max(sceneScale, 1e-6);
		setText(sunDistance, formatLy(distancePc * PC_TO_LY));

		if (sunArrow) {
			cameraSpaceSun.copy(sunVector).applyQuaternion(camera.quaternion.clone().invert());
			const angleRad = Math.atan2(cameraSpaceSun.x, -cameraSpaceSun.z);
			const pitchFactor = Math.max(0.4, Math.min(1.2, 1 - cameraSpaceSun.y * 0.2));
			sunArrow.style.transform = `rotate(${angleRad}rad) scale(${pitchFactor})`;
		}

		if (selectedStar) {
			tempVector.fromArray(selectedStar.positions, selectedStar.index * 3);
			const starDistancePc = tempVector.distanceTo(camera.position) / Math.max(sceneScale, 1e-6);
			setText(pickedDistance, formatLy(starDistancePc * PC_TO_LY));
		}

		animationHandle = requestAnimationFrame(updateHud);
	}

	function pickStar(event) {
		if (!viewer || !pointsMesh) {
			return;
		}
		const rect = viewer.canvas.getBoundingClientRect();
		ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.params.Points.threshold = 2;
		raycaster.setFromCamera(ndc, viewer.runtime.camera);
		const intersections = raycaster.intersectObject(pointsMesh, false);
		if (intersections.length === 0 || !Number.isInteger(intersections[0].index)) {
			selectedStar = null;
			setText(pickedName, 'No star selected');
			setText(pickedDistance, '--');
			return;
		}
		const selection = starLayer.getStarData();
		if (!selection) {
			return;
		}
		selectedStar = {
			index: intersections[0].index,
			positions: selection.positions,
		};
		setText(pickedName, `Star #${selectedStar.index + 1}`);
	}

	try {
		setStatus('Loading light-year explorer…');
		await datasetSession.ensureRenderRootShard();
		await datasetSession.ensureRenderBootstrap();

		viewer = await createViewer(mount, {
			datasetSession,
			interestField: createObserverShellField({
				id: `website-lightyear-field-${topicSlug}`,
				maxLevel: 13,
				note: 'Light-year thrust explorer field.',
			}),
			controllers: [
				thrustController,
				createSelectionRefreshController({
					id: `website-lightyear-refresh-${topicSlug}`,
					observerDistancePc: 6,
					minIntervalMs: 220,
					watchSize: false,
				}),
			],
			layers: [starLayer],
			state: {
				observerPc: { ...SOLAR_ORIGIN_PC },
				fieldStrategy: 'observer-shell',
				mDesired: 6.5,
				starFieldExposure: 85,
			},
			clearColor: 0x02040b,
		});

		pointsMesh = viewer.contentRoot.getObjectByName(`${starLayerId}-points`);
		viewer.canvas.addEventListener('click', pickStar);
		setText(pickedName, 'Click a star to measure');
		setText(pickedDistance, '--');
		setStatus('W thrusts forward, S brakes. Click stars to measure distance. Arrow points back to the Sun.');
		updateHud();
	} catch (error) {
		console.error('[website:lightyear-explorer]', error);
		setStatus(error instanceof Error ? error.message : String(error));
	}

	window.addEventListener('beforeunload', () => {
		if (animationHandle != null) {
			cancelAnimationFrame(animationHandle);
			animationHandle = null;
		}
		viewer?.dispose().catch((error) => {
			console.error('[website:lightyear-explorer-dispose]', error);
		});
	});
}

document.querySelectorAll('[data-example="light-year-explorer"]').forEach((root) => {
	mountLightYear(root).catch((error) => {
		console.error('[website:lightyear-explorer-mount]', error);
	});
});

