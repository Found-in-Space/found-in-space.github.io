import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createSkykitNavigationPlugin, createSkykitViewer } from '@found-in-space/skykit';
import { activateChapterCamera } from '../chapter-navigation.js';
import { SCENES as astrophage } from '../astrophage-viewer.js';
import { SCENES as clusters } from '../cluster-tour-viewer.js';
import { HR_SCENES as hr, resolveHrChapterTravel, createHrChapters } from '../hr-diagram-viewer.js';
import { createRadioBubbleChapters, createRadioBubbleOriginAnimationPlugin } from '../radio-bubble-viewer.js';

const liveView = {
	observerPc: { x: 73, y: -41, z: 9 },
	orientationIcrs: { x: 0, y: Math.sin(0.4), z: 0, w: Math.cos(0.4) },
};
const contexts = new WeakMap();

async function createViewer(t, view = liveView, plugins = []) {
	const navigation = createSkykitNavigationPlugin();
	const viewer = await createSkykitViewer({
		renderer: { render() {} },
		view,
		plugins: [navigation, ...plugins],
	});
	contexts.set(viewer, { viewer, navigation });
	t.after(() => viewer.dispose());
	return viewer;
}

function distance(a, b) {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function angle(a, b) {
	assert.ok(a && b, 'camera orientation must remain defined');
	return 2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)));
}

function assertContinuousStart(viewer, before) {
	// requestViewState is queued. Inspect the first rendered frame, not just
	// getViewState immediately after accepting a navigation action.
	viewer.frame(0);
	const zero = viewer.getViewState();
	assert.ok(distance(before.observerPc, zero.observerPc) < 1e-9, 'position changed at t=0');
	assert.ok(angle(before.orientationIcrs, zero.orientationIcrs) < 1e-7, 'orientation changed at t=0');
	viewer.frame(1e-6);
	viewer.frame(0);
	const next = viewer.getViewState();
	assert.ok(distance(before.observerPc, next.observerPc) < 0.01, 'position jumped on first positive-time update');
	assert.ok(angle(before.orientationIcrs, next.orientationIcrs) < 0.001, 'orientation jumped on first positive-time update');
}

for (const [topic, scenes] of Object.entries({ astrophage, clusters, hr, radio: createRadioBubbleChapters().scenes })) {
	for (const [id, scene] of Object.entries(scenes)) {
		if (id === 'marconi') continue;
		test(`${topic}/${id} starts from the live pose, including initial chapter revisits`, async (t) => {
			const viewer = await createViewer(t);
			const before = viewer.getViewState();
			await activateChapterCamera(contexts.get(viewer), scene);
			assertContinuousStart(viewer, before);
		});
	}
}

for (const [from, to] of [['ngc-752', 'omega-cen'], ['omega-cen', 'ngc-752']]) {
	test(`HR ${from} -> ${to} joins the authored corridor from the current orbit phase`, async (t) => {
		const camera = hr[from].camera;
		const observerPc = {
			...camera.center,
			y: camera.center.y + (from === 'ngc-752' ? camera.radiusPc : 0),
			z: camera.center.z + (from === 'omega-cen' ? camera.radiusPc : 0),
		};
		const viewer = await createViewer(t, { ...liveView, observerPc });
		const before = viewer.getViewState();
		await activateChapterCamera(contexts.get(viewer), { ...hr[to], travel: resolveHrChapterTravel(to, from) });
		assertContinuousStart(viewer, before);
	});
}

test('Astrophage can be interrupted, reversed, and revisited after manual looking', async (t) => {
	const viewer = await createViewer(t, astrophage['sol-dimming'].view);
	for (const id of ['tau-ceti-sky', 'tau-ceti-arrive', 'inner-spread', 'sol-dimming', 'keid-lookback', 'sirius-wise']) {
		viewer.requestViewState({ orientationIcrs: liveView.orientationIcrs }, 'test.manual-look');
		viewer.frame(0);
		const before = viewer.getViewState();
		await activateChapterCamera(contexts.get(viewer), astrophage[id]);
		assertContinuousStart(viewer, before);
		for (let frame = 0; frame < 15; frame++) viewer.frame(1 / 60);
	}
});

test('returning to Marconi uses navigation from the live pose while the bubble grows', async (t) => {
	const bubbleGroup = new THREE.Group();
	const animation = createRadioBubbleOriginAnimationPlugin({
		bubbleGroup,
		radiusPc: 40,
		firstSignalDateMs: Date.UTC(1895, 6, 1),
		currentDateMs: Date.UTC(2026, 8, 17),
		onTimelineDateChange() {},
	});
	const viewer = await createViewer(t, liveView, [animation]);
	const before = viewer.getViewState();
	animation.setScene('marconi');
	await createRadioBubbleChapters({ radiusPc: 40 }).chapters.marconi.activate(contexts.get(viewer));
	assertContinuousStart(viewer, before);
	for (let frame = 0; frame < 660; frame++) viewer.frame(1 / 60);
	assert.ok(Math.abs(Math.hypot(...Object.values(viewer.getViewState().observerPc)) - 120) < 0.01);
	assert.equal(bubbleGroup.scale.x, 1);
});

test('rapid chapter activation keeps only the newest camera and arrival callback', async (t) => {
	const viewer = await createViewer(t);
	const arrived = [];
	await Promise.all([
		activateChapterCamera(contexts.get(viewer), astrophage['keid-lookback'], { onArrive: () => arrived.push('old') }),
		activateChapterCamera(contexts.get(viewer), astrophage['tau-ceti-sky'], { onArrive: () => arrived.push('new') }),
	]);
	assertContinuousStart(viewer, liveView);
	for (let frame = 0; frame < 660; frame++) viewer.frame(1 / 60);
	assert.deepEqual(viewer.getViewState().observerPc, astrophage['tau-ceti-sky'].navigation.transitionTo.observerPc);
	assert.deepEqual(arrived, ['new']);
});

test('slow HR preparation cannot reinstate an older chapter camera', async (t) => {
	const viewer = await createViewer(t);
	let release;
	const waiting = new Promise((resolve) => { release = resolve; });
	let calls = 0;
	const chapters = createHrChapters(async () => { if (++calls === 1) await waiting; });
	const oldActivation = chapters['omega-cen'].activate(contexts.get(viewer));
	await chapters['inner-plane'].activate(contexts.get(viewer));
	release();
	await oldActivation;
	assertContinuousStart(viewer, liveView);
	for (let frame = 0; frame < 360; frame++) viewer.frame(1 / 60);
	assert.deepEqual(viewer.getViewState().observerPc, hr['inner-plane'].navigation.transitionTo.observerPc);
});

test('all orbit chapters still arrive on the intended orbit and continue orbiting', async (t) => {
	for (const scenes of [astrophage, clusters, hr, createRadioBubbleChapters().scenes]) {
		for (const [id, scene] of Object.entries(scenes)) {
			if (!scene.camera) continue;
			const viewer = await createViewer(t);
			let arrivals = 0;
			await activateChapterCamera(contexts.get(viewer), scene, { onArrive: () => arrivals++ });
			const seconds = (scene.travel?.durationSecs ?? 5) + 2;
			for (let frame = 0; frame < seconds * 60; frame++) viewer.frame(1 / 60);
			const before = viewer.getViewState();
			assert.ok(Math.abs(distance(before.observerPc, scene.camera.center) - scene.camera.radiusPc) < 1e-6, id);
			for (let frame = 0; frame < 60; frame++) viewer.frame(1 / 60);
			assert.ok(distance(before.observerPc, viewer.getViewState().observerPc) > 0.01, `${id} continues orbiting`);
			assert.equal(arrivals, 1, id);
		}
	}
});
