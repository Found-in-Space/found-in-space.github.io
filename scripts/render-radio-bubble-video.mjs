#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import {
	PREVIEW_RADIO_BUBBLE_VIDEO_LAYOUT_ID,
	RADIO_BUBBLE_VIDEO_LAYOUT_IDS,
	getRadioBubbleVideoLayout,
} from '../src/scripts/radio-bubble-video-layouts.js';

const HOST = '127.0.0.1';
const PORT = 4325;
const SERVER_READY_TIMEOUT_MS = 90_000;
const PAGE_READY_TIMEOUT_MS = 180_000;
const RADIO_BUBBLE_DURATION_SECS = 60;
const FRAME_PLATES = Object.freeze(['composite', 'sky', 'overlay']);
const CAPTURES = Object.freeze(['stream', 'frames', 'screenshot']);
const PLATE_MODES = Object.freeze(['none', 'all']);
const MODES = Object.freeze({
	preview: Object.freeze({
		mode: 'preview',
		layout: PREVIEW_RADIO_BUBBLE_VIDEO_LAYOUT_ID,
		fps: 12,
		capture: 'stream',
		browser: 'webkit',
		crf: 20,
		seconds: RADIO_BUBBLE_DURATION_SECS,
	}),
	final: Object.freeze({
		mode: 'final',
		layout: 'landscape-4k',
		fps: 24,
		capture: 'stream',
		browser: 'webkit',
		crf: 18,
		seconds: RADIO_BUBBLE_DURATION_SECS,
	}),
});
const BROWSERS = Object.freeze({
	chromium: {
		id: 'chromium',
		launcher: chromium,
		launchOptions: {
			headless: true,
			args: ['--disable-dev-shm-usage'],
		},
	},
	firefox: {
		id: 'firefox',
		launcher: firefox,
		launchOptions: {
			headless: true,
		},
	},
	webkit: {
		id: 'webkit',
		launcher: webkit,
		launchOptions: {
			headless: true,
		},
	},
});

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const cli = resolveOptions(process.argv.slice(2));
const layout = getRadioBubbleVideoLayout(cli.layout);
const browserProfile = BROWSERS[cli.browser];
const outputRoot = path.join(
	projectRoot,
	'video-output',
	'radio-bubble',
	layout.id,
	`${cli.mode}-${cli.capture}-${cli.fps}fps`,
);
const framesRoot = path.join(outputRoot, 'frames');
const videoPath = path.join(outputRoot, `radio-bubble-${layout.id}-${cli.mode}.mp4`);
const pageUrl = createPageUrl();
const runLabel = `${cli.mode}:${layout.id}:${cli.capture}:${cli.fps}fps:${browserProfile.id}`;

function resolveOptions(rawArgs) {
	const args = normalizeLegacyArgs([...rawArgs]);
	const parsed = {
		mode: null,
		layout: null,
		capture: null,
		plates: 'none',
		fps: null,
		seconds: null,
		frames: null,
		browser: null,
		crf: null,
		journeyPath: null,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg?.startsWith('--')) {
			throw new Error(`Unexpected positional argument "${arg}". Use --mode, --layout, or another named option.`);
		}
		const [rawName, inlineValue] = arg.slice(2).split('=');
		const value = inlineValue ?? args[index + 1];
		if (inlineValue == null) {
			index += 1;
		}

		if (rawName === 'mode') {
			if (!MODES[value]) {
				throw new Error(`Invalid --mode "${value}". Expected: ${Object.keys(MODES).join(', ')}`);
			}
			parsed.mode = value;
		} else if (rawName === 'layout') {
			if (!RADIO_BUBBLE_VIDEO_LAYOUT_IDS.includes(value)) {
				throw new Error(`Invalid --layout "${value}". Expected: ${RADIO_BUBBLE_VIDEO_LAYOUT_IDS.join(', ')}`);
			}
			parsed.layout = value;
		} else if (rawName === 'capture') {
			if (!CAPTURES.includes(value)) {
				throw new Error(`Invalid --capture "${value}". Expected: ${CAPTURES.join(', ')}`);
			}
			parsed.capture = value;
		} else if (rawName === 'plates') {
			if (!PLATE_MODES.includes(value)) {
				throw new Error(`Invalid --plates "${value}". Expected: ${PLATE_MODES.join(', ')}`);
			}
			parsed.plates = value;
		} else if (rawName === 'fps') {
			parsed.fps = parsePositiveInteger(value, '--fps');
		} else if (rawName === 'seconds') {
			parsed.seconds = parsePositiveNumber(value, '--seconds');
		} else if (rawName === 'frames') {
			parsed.frames = parsePositiveInteger(value, '--frames');
		} else if (rawName === 'browser') {
			if (!BROWSERS[value]) {
				throw new Error(`Invalid --browser "${value}". Expected: ${Object.keys(BROWSERS).join(', ')}`);
			}
			parsed.browser = value;
		} else if (rawName === 'crf') {
			parsed.crf = parseCrf(value);
		} else if (rawName === 'journey') {
			if (!value) {
				throw new Error('Invalid --journey. Expected a JSON file path.');
			}
			parsed.journeyPath = value;
		} else {
			throw new Error(`Unknown option --${rawName}`);
		}
	}

	const mode = parsed.mode ?? 'preview';
	const defaults = MODES[mode];
	const fps = parsed.fps ?? defaults.fps;
	const seconds = parsed.seconds ?? defaults.seconds;
	const frameCount = parsed.frames ?? Math.ceil(seconds * fps);
	const plates = parsed.plates;
	const capture = plates === 'all'
		? 'frames'
		: parsed.capture ?? defaults.capture;

	return {
		mode,
		layout: parsed.layout ?? defaults.layout,
		capture,
		plates,
		fps,
		seconds,
		frameCount,
		browser: parsed.browser ?? defaults.browser,
		crf: parsed.crf ?? defaults.crf,
		journeyPath: parsed.journeyPath,
	};
}

function normalizeLegacyArgs(args) {
	const positionals = [];
	while (args[0] && !args[0].startsWith('--')) {
		positionals.push(args.shift());
	}
	const mapped = [];
	for (const positional of positionals) {
		if (positional === 'test') {
			mapped.push('--mode=preview', '--seconds=6', '--layout=landscape-4k', '--capture=screenshot');
		} else if (positional === 'full') {
			mapped.push('--mode=final');
		} else if (positional === '1080p') {
			mapped.push('--layout=landscape-1080p');
		} else if (positional === '4k') {
			mapped.push('--layout=landscape-4k');
		} else {
			throw new Error(`Unknown legacy argument "${positional}".`);
		}
	}
	return [...mapped, ...args];
}

function parsePositiveInteger(value, label) {
	const number = Number(value);
	if (!Number.isInteger(number) || number <= 0) {
		throw new Error(`Invalid ${label} "${value}". Expected a positive integer.`);
	}
	return number;
}

function parsePositiveNumber(value, label) {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) {
		throw new Error(`Invalid ${label} "${value}". Expected a positive number.`);
	}
	return number;
}

function parseCrf(value) {
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0 || number > 51) {
		throw new Error(`Invalid --crf "${value}". Expected a number from 0 to 51.`);
	}
	return number;
}

function createPageUrl() {
	const url = new URL(`http://${HOST}:${PORT}/video/radio-bubble-full/`);
	url.searchParams.set('layout', cli.layout);
	url.searchParams.set('canvasOverlay', '1');
	if (cli.capture !== 'screenshot') {
		url.searchParams.set('preserveDrawingBuffer', '1');
	}
	if (cli.journeyPath) {
		url.searchParams.set('journey', 'external');
	}
	return url;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function rel(filePath) {
	return path.relative(projectRoot, filePath);
}

function frameName(frameIndex) {
	return `frame-${String(frameIndex).padStart(6, '0')}.png`;
}

function framePath(plate, frameIndex) {
	return path.join(framesRoot, plate, frameName(frameIndex));
}

function average(values) {
	if (!values.length) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value) {
	return Math.round(value * 10) / 10;
}

function summarize(values) {
	const sorted = [...values].sort((left, right) => left - right);
	return {
		avgMs: round(average(values)),
		minMs: round(sorted[0] ?? 0),
		maxMs: round(sorted[sorted.length - 1] ?? 0),
	};
}

function formatMs(value) {
	return `${Math.round(value)}ms`;
}

function appendLog(log, chunk) {
	const text = chunk.toString();
	for (const line of text.split(/\r?\n/)) {
		if (line.trim()) {
			log.push(line);
		}
	}
	while (log.length > 80) {
		log.shift();
	}
}

function createProcessError(command, args, code, log) {
	const tail = log.length > 0 ? `\n\nLast process output:\n${log.join('\n')}` : '';
	return new Error(`${command} ${args.join(' ')} exited with code ${code}.${tail}`);
}

async function runChecked(command, args, options = {}) {
	const log = [];
	const child = spawn(command, args, {
		cwd: projectRoot,
		env: process.env,
		stdio: ['ignore', 'pipe', 'pipe'],
		...options,
	});

	child.stdout.on('data', (chunk) => {
		process.stdout.write(chunk);
		appendLog(log, chunk);
	});
	child.stderr.on('data', (chunk) => {
		process.stderr.write(chunk);
		appendLog(log, chunk);
	});

	const [code] = await once(child, 'exit');
	if (code !== 0) {
		throw createProcessError(command, args, code, log);
	}
}

async function stopProcess(child) {
	if (!child || child.exitCode != null) {
		return;
	}

	child.kill('SIGTERM');
	const killed = sleep(5_000).then(() => {
		if (child.exitCode == null) {
			child.kill('SIGKILL');
		}
	});
	await Promise.race([
		once(child, 'exit').catch(() => null),
		killed,
	]);
}

function startAstroServer() {
	const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const serverLog = [];
	const child = spawn(
		npmCommand,
		['run', 'dev', '--', '--host', HOST, '--port', String(PORT)],
		{
			cwd: projectRoot,
			env: {
				...process.env,
				ASTRO_TELEMETRY_DISABLED: '1',
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);

	child.stdout.on('data', (chunk) => appendLog(serverLog, chunk));
	child.stderr.on('data', (chunk) => appendLog(serverLog, chunk));
	child.on('error', (error) => {
		serverLog.push(error instanceof Error ? error.message : String(error));
	});

	return { child, serverLog };
}

async function waitForServer(server) {
	const startedAt = Date.now();
	let lastError = null;

	while (Date.now() - startedAt < SERVER_READY_TIMEOUT_MS) {
		if (server.child.exitCode != null) {
			throw createProcessError('astro dev', [], server.child.exitCode, server.serverLog);
		}

		try {
			const response = await fetch(pageUrl.href, {
				signal: AbortSignal.timeout(2_000),
			});
			if (response.ok) {
				return;
			}
			lastError = new Error(`HTTP ${response.status}`);
		} catch (error) {
			lastError = error;
		}

		await sleep(500);
	}

	const tail = server.serverLog.length > 0
		? `\n\nAstro output:\n${server.serverLog.join('\n')}`
		: '';
	throw new Error(`Timed out waiting for ${pageUrl.href}. Last error: ${lastError?.message ?? 'unknown'}${tail}`);
}

async function prepareOutput() {
	await rm(outputRoot, { recursive: true, force: true });
	await mkdir(outputRoot, { recursive: true });
	if (cli.capture !== 'stream') {
		await mkdir(path.join(framesRoot, 'composite'), { recursive: true });
	}
	if (cli.plates === 'all') {
		await Promise.all(FRAME_PLATES.map((plate) => mkdir(path.join(framesRoot, plate), { recursive: true })));
	}
}

async function loadJourneyInput() {
	if (!cli.journeyPath) {
		return null;
	}
	const journeyPath = path.resolve(projectRoot, cli.journeyPath);
	const raw = await readFile(journeyPath, 'utf8');
	const payload = JSON.parse(raw);
	if (payload?.format !== 'fis-journey-v1') {
		throw new Error(`Journey file must use format "fis-journey-v1": ${journeyPath}`);
	}
	return {
		path: journeyPath,
		payload,
	};
}

async function waitForExportPage(page) {
	await page.goto(pageUrl.href, {
		waitUntil: 'domcontentloaded',
		timeout: 60_000,
	});
	await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
	await page.waitForFunction(
		() => {
			const api = window.__radioBubbleVideoExport;
			return api?.readyState === 'ready' || api?.readyState === 'error';
		},
		null,
		{ timeout: PAGE_READY_TIMEOUT_MS },
	);

	const status = await page.evaluate(() => window.__radioBubbleVideoExport.getStatus());
	if (status.readyState !== 'ready') {
		throw new Error(`Radio bubble export page failed readiness: ${status.error ?? 'unknown error'}`);
	}
	return status;
}

async function writeDataUrl(dataUrl, outputPath) {
	const [, base64 = ''] = String(dataUrl).split(',');
	await writeFile(outputPath, Buffer.from(base64, 'base64'));
}

function getRawVideoExtension(mimeType) {
	if (String(mimeType).includes('mp4')) {
		return 'mp4';
	}
	return 'webm';
}

function streamBitrate() {
	return cli.mode === 'final' ? 45_000_000 : 18_000_000;
}

function normalizeFrameStats(stats) {
	return {
		frameIndex: stats.frameIndex,
		sceneTimeSecs: stats.sceneTimeSecs,
		expectedStarCount: stats.expectedStarCount,
		actualStarCount: stats.actualStarCount,
		nodeCount: stats.nodeCount,
		committedNodeCount: stats.committedNodeCount,
		expectedCacheHit: stats.expectedCacheHit,
		skippedCommitWait: stats.skippedCommitWait,
		timings: stats.timings,
	};
}

function summarizeFrameTimings(frameEntries) {
	const evaluateMs = frameEntries.map((entry) => entry.evaluateMs);
	const captureMs = frameEntries.map((entry) => entry.captureMs);
	const routeMs = frameEntries.map((entry) => Number(entry.stats?.timings?.totalMs ?? entry.routeMs ?? 0));
	const selectionMs = frameEntries.map((entry) => Number(entry.stats?.timings?.selectionMs ?? 0));
	const expectedMs = frameEntries.map((entry) => Number(entry.stats?.timings?.expectedMs ?? 0));
	const commitWaitMs = frameEntries.map((entry) => Number(entry.stats?.timings?.commitWaitMs ?? 0));
	const renderOnceMs = frameEntries.map((entry) => Number(entry.stats?.timings?.renderOnceMs ?? 0));
	const cacheHits = frameEntries.filter((entry) => entry.stats?.expectedCacheHit === true).length;
	const skippedWaits = frameEntries.filter((entry) => entry.stats?.skippedCommitWait === true).length;
	return {
		evaluate: summarize(evaluateMs),
		capture: summarize(captureMs),
		route: summarize(routeMs),
		selection: summarize(selectionMs),
		expected: summarize(expectedMs),
		commitWait: summarize(commitWaitMs),
		renderOnce: summarize(renderOnceMs),
		expectedCacheHits: cacheHits,
		expectedCacheMisses: frameEntries.length - cacheHits,
		skippedCommitWaits: skippedWaits,
	};
}

function summarizeStreamTimings(timings) {
	const entries = Array.isArray(timings) ? timings : [];
	const cacheHits = entries.filter((entry) => entry.expectedCacheHit === true).length;
	const skippedWaits = entries.filter((entry) => entry.skippedCommitWait === true).length;
	return {
		capture: summarize(entries.map((entry) => Number(entry.captureMs ?? 0))),
		requestFrame: summarize(entries.map((entry) => Number(entry.requestFrameMs ?? 0))),
		route: summarize(entries.map((entry) => Number(entry.routeMs ?? 0))),
		expectedCacheHits: cacheHits,
		expectedCacheMisses: entries.length - cacheHits,
		skippedCommitWaits: skippedWaits,
		lastFrame: entries.length > 0 ? entries[entries.length - 1] : null,
	};
}

async function runStreamCapture(page) {
	const startedAt = performance.now();
	const result = await page.evaluate(
		(args) => window.__radioBubbleVideoExport.recordCanvasStream(args),
		{
			source: 'composite',
			frameCount: cli.frameCount,
			fps: cli.fps,
			mimeType: 'video/webm;codecs=vp9',
			bitsPerSecond: streamBitrate(),
			paceFrames: false,
		},
	);
	const rawVideoPath = path.join(outputRoot, `radio-bubble-${layout.id}-${cli.mode}-raw.${getRawVideoExtension(result.mimeType)}`);
	await writeDataUrl(result.dataUrl, rawVideoPath);

	const ffmpegArgs = [
		'-y',
		'-r',
		String(cli.fps),
		'-i',
		rawVideoPath,
		'-an',
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-crf',
		String(cli.crf),
		videoPath,
	];
	await runChecked('ffmpeg', ffmpegArgs);

	const info = await stat(videoPath);
	const { dataUrl, ...recording } = result;
	return {
		output: {
			videoPath: rel(videoPath),
			rawVideoPath: rel(rawVideoPath),
			videoSizeBytes: info.size,
			rawVideoSizeBytes: result.size,
		},
		capture: {
			wallMs: round(performance.now() - startedAt),
			recording,
			timings: summarizeStreamTimings(result.timings),
		},
		ffmpeg: {
			args: ffmpegArgs,
		},
	};
}

async function captureFrameToArtifacts(page, frameIndex, plates) {
	const timeSecs = (frameIndex - 1) / cli.fps;
	const deltaSecs = frameIndex === 1 ? 0 : 1 / cli.fps;
	const startedAt = performance.now();
	const result = await page.evaluate(
		(args) => window.__radioBubbleVideoExport.captureFrameArtifacts(args),
		{
			frameIndex,
			timeSecs,
			deltaSecs,
			plates,
			type: 'image/png',
		},
	);
	const evaluateMs = performance.now() - startedAt;
	const writeStartedAt = performance.now();
	for (const [plate, artifact] of Object.entries(result.artifacts)) {
		await writeDataUrl(artifact.dataUrl, framePath(plate, frameIndex));
	}
	return {
		frameIndex,
		stats: normalizeFrameStats(result.stats),
		evaluateMs,
		captureMs: performance.now() - writeStartedAt,
		artifacts: Object.fromEntries(
			Object.entries(result.artifacts).map(([plate, artifact]) => [
				plate,
				{
					width: artifact.width,
					height: artifact.height,
					type: artifact.type,
					size: artifact.size,
					encodeMs: round(artifact.encodeMs),
					readMs: round(artifact.readMs),
				},
			]),
		),
	};
}

async function captureFrameToScreenshot(page, frameIndex) {
	const timeSecs = (frameIndex - 1) / cli.fps;
	const deltaSecs = frameIndex === 1 ? 0 : 1 / cli.fps;
	const evaluateStartedAt = performance.now();
	const stats = await page.evaluate(
		(args) => window.__radioBubbleVideoExport.captureFrame(args),
		{ frameIndex, timeSecs, deltaSecs },
	);
	const evaluateMs = performance.now() - evaluateStartedAt;
	const captureStartedAt = performance.now();
	await page.screenshot({
		path: framePath('composite', frameIndex),
		type: 'png',
		fullPage: false,
		animations: 'disabled',
		caret: 'hide',
	});
	return {
		frameIndex,
		stats: normalizeFrameStats(stats),
		evaluateMs,
		captureMs: performance.now() - captureStartedAt,
	};
}

async function runFrameCapture(page) {
	const startedAt = performance.now();
	const startStats = await page.evaluate(() => window.__radioBubbleVideoExport.startClip());
	const plates = cli.plates === 'all' ? FRAME_PLATES : ['composite'];
	const frameEntries = [];

	console.log(
		`[video:${runLabel}] start stars=${startStats.actualStarCount}/${startStats.expectedStarCount} nodes=${startStats.nodeCount} committed=${startStats.committedNodeCount}`,
	);
	for (let frameIndex = 1; frameIndex <= cli.frameCount; frameIndex += 1) {
		const entry = cli.capture === 'screenshot'
			? await captureFrameToScreenshot(page, frameIndex)
			: await captureFrameToArtifacts(page, frameIndex, plates);
		frameEntries.push(entry);
		const stats = entry.stats;
		console.log(
			`[video:${runLabel}] frame=${String(frameIndex).padStart(4, '0')}/${cli.frameCount}`
			+ ` time=${stats.sceneTimeSecs.toFixed(3)}s`
			+ ` stars=${stats.actualStarCount}/${stats.expectedStarCount}`
			+ ` nodes=${stats.nodeCount}`
			+ ` eval=${formatMs(entry.evaluateMs)}`
			+ ` capture=${formatMs(entry.captureMs)}`
			+ ` expected=${stats.expectedCacheHit ? 'hit' : 'miss'}`
			+ ` wait=${stats.skippedCommitWait ? 'skip' : 'commit'}`,
		);
	}

	const ffmpegArgs = [
		'-y',
		'-framerate',
		String(cli.fps),
		'-i',
		path.join(framesRoot, 'composite', 'frame-%06d.png'),
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-crf',
		String(cli.crf),
		videoPath,
	];
	await runChecked('ffmpeg', ffmpegArgs);

	const info = await stat(videoPath);
	return {
		output: {
			videoPath: rel(videoPath),
			videoSizeBytes: info.size,
			framesRoot: rel(framesRoot),
			plates,
		},
		capture: {
			wallMs: round(performance.now() - startedAt),
			startStats: normalizeFrameStats(startStats),
			timings: summarizeFrameTimings(frameEntries),
			firstFrame: frameEntries[0] ?? null,
			lastFrame: frameEntries[frameEntries.length - 1] ?? null,
		},
		ffmpeg: {
			args: ffmpegArgs,
		},
	};
}

async function writeMetadata(metadata) {
	const metadataPath = path.join(outputRoot, 'render-metadata.json');
	await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
	console.log(`[video:${runLabel}] wrote ${rel(metadataPath)}`);
}

async function main() {
	const journeyInput = await loadJourneyInput();
	await prepareOutput();

	const server = startAstroServer();
	let browser = null;
	try {
		await waitForServer(server);
		console.log(`[video:${runLabel}] Astro ready at ${pageUrl.href}`);

		try {
			browser = await browserProfile.launcher.launch(browserProfile.launchOptions);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes('Executable') || message.includes('browserType.launch')) {
				throw new Error(`${message}\n\nInstall Playwright browsers with: npx playwright install ${browserProfile.id}`);
			}
			throw error;
		}

		const page = await browser.newPage({
			viewport: { width: layout.width, height: layout.height },
			deviceScaleFactor: 1,
		});
		if (journeyInput) {
			await page.addInitScript({
				content: `window.__fisJourneyInput = ${JSON.stringify(journeyInput.payload)};`,
			});
		}
		page.setDefaultTimeout(PAGE_READY_TIMEOUT_MS);
		page.on('console', (message) => {
			const type = message.type();
			const text = message.text();
			if (type === 'error' || text.includes('[radio-bubble-video]')) {
				console.log(`[page:${type}] ${text}`);
			}
		});
		page.on('pageerror', (error) => {
			console.error('[page:error]', error);
		});

		const status = await waitForExportPage(page);
		const canvasInfo = await page.evaluate(() => window.__radioBubbleVideoExport.getCanvasInfo());
		console.log(
			`[video:${runLabel}] page ready stars=${status.starStats.starCount} nodes=${status.starStats.nodeCount} commits=${status.commitCount}`,
		);

		const renderResult = cli.capture === 'stream'
			? await runStreamCapture(page)
			: await runFrameCapture(page);

		await browser.close();
		browser = null;

		const metadata = {
			generatedAt: new Date().toISOString(),
			journey: journeyInput
				? {
					source: 'external',
					path: rel(journeyInput.path),
					format: journeyInput.payload.format,
					id: journeyInput.payload.id ?? null,
					title: journeyInput.payload.title ?? null,
				}
				: {
					source: 'builtin',
					id: 'radio-bubble',
				},
			mode: cli.mode,
			layout: {
				id: layout.id,
				width: layout.width,
				height: layout.height,
			},
			fps: cli.fps,
			seconds: cli.seconds,
			frameCount: cli.frameCount,
			browser: browserProfile.id,
			captureMethod: cli.capture,
			plates: cli.plates,
			crf: cli.crf,
			pageUrl: pageUrl.href,
			status,
			canvasInfo,
			outputRoot: rel(outputRoot),
			...renderResult,
		};
		await writeMetadata(metadata);

		console.log(`[video:${runLabel}] wrote ${renderResult.output.videoPath}`);
	} finally {
		if (browser) {
			await browser.close().catch(() => null);
		}
		await stopProcess(server.child);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack : error);
	process.exitCode = 1;
});
