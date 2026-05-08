#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	RADIO_BUBBLE_VIDEO_CUES,
	RADIO_BUBBLE_VIDEO_DURATION_SECS,
	getRadioBubbleVideoLandmarks,
	sampleRadioBubbleVideoPath,
} from '../src/scripts/radio-bubble-video-timeline.js';

const DEFAULT_OUTPUT_DIR = 'video-output/radio-bubble/path-debug';

function parseArgs(argv) {
	const options = {
		outputDir: DEFAULT_OUTPUT_DIR,
		stepSecs: 0.25,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith('--')) continue;
		const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
		const value = inlineValue ?? argv[index + 1];
		if (inlineValue === undefined && value && !value.startsWith('--')) {
			index += 1;
		}
		if (rawKey === 'output' || rawKey === 'output-dir') {
			options.outputDir = value;
		} else if (rawKey === 'step') {
			options.stepSecs = Number(value);
		} else if (rawKey === 'fps') {
			const fps = Number(value);
			options.stepSecs = fps > 0 ? 1 / fps : options.stepSecs;
		}
	}
	if (!Number.isFinite(options.stepSecs) || options.stepSecs <= 0) {
		throw new Error(`Invalid path sample step: ${options.stepSecs}`);
	}
	return options;
}

function formatNumber(value) {
	return Number.isFinite(value) ? value.toFixed(6) : '';
}

function csvCell(value) {
	if (typeof value === 'number') {
		return formatNumber(value);
	}
	return JSON.stringify(String(value ?? ''));
}

function buildCsv(samples) {
	const headers = [
		'frameIndex',
		'sceneTimeSecs',
		'cueIndex',
		'cueEyebrow',
		'observerX',
		'observerY',
		'observerZ',
		'targetX',
		'targetY',
		'targetZ',
		'lookX',
		'lookY',
		'lookZ',
		'lookDistancePc',
		'distanceToSunPc',
		'distanceToHyadesPc',
	];
	const rows = samples.map((sample) => [
		sample.frameIndex,
		sample.sceneTimeSecs,
		sample.cueIndex,
		sample.cueEyebrow,
		sample.observerPc.x,
		sample.observerPc.y,
		sample.observerPc.z,
		sample.targetPc.x,
		sample.targetPc.y,
		sample.targetPc.z,
		sample.lookVectorPc.x,
		sample.lookVectorPc.y,
		sample.lookVectorPc.z,
		sample.lookDistancePc,
		sample.distanceToSunPc,
		sample.distanceToHyadesPc,
	]);
	return [
		headers.join(','),
		...rows.map((row) => row.map(csvCell).join(',')),
		'',
	].join('\n');
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const outputDir = path.resolve(process.cwd(), options.outputDir);
	const samples = sampleRadioBubbleVideoPath({
		stepSecs: options.stepSecs,
		includeEnd: true,
	});
	const payload = {
		generatedAt: new Date().toISOString(),
		coordinateSystem: 'ICRS-aligned parsec coordinates from SkyKit constants; positions are not scene-scaled.',
		durationSecs: RADIO_BUBBLE_VIDEO_DURATION_SECS,
		stepSecs: options.stepSecs,
		sampleCount: samples.length,
		cues: RADIO_BUBBLE_VIDEO_CUES,
		landmarks: getRadioBubbleVideoLandmarks(),
		samples,
	};

	await mkdir(outputDir, { recursive: true });
	const jsonPath = path.join(outputDir, 'radio-bubble-path-coordinates.json');
	const csvPath = path.join(outputDir, 'radio-bubble-path-coordinates.csv');
	await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
	await writeFile(csvPath, buildCsv(samples));

	console.log(`[radio-bubble:path] wrote ${path.relative(process.cwd(), jsonPath)}`);
	console.log(`[radio-bubble:path] wrote ${path.relative(process.cwd(), csvPath)}`);
	console.log(`[radio-bubble:path] samples=${samples.length} step=${options.stepSecs}s duration=${RADIO_BUBBLE_VIDEO_DURATION_SECS}s`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
