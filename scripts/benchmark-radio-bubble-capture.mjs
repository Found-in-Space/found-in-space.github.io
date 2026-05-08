#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const FPS = 24;
const HOST = '127.0.0.1';
const PORT = 4326;
const SERVER_READY_TIMEOUT_MS = 90_000;
const PAGE_READY_TIMEOUT_MS = 180_000;
const RESOLUTIONS = Object.freeze({
	'1080p': {
		width: 1920,
		height: 1080,
		layoutId: 'landscape-1080p',
	},
	'4k': {
		width: 3840,
		height: 2160,
		layoutId: 'landscape-4k',
	},
});
const BROWSERS = Object.freeze({
	chromium: {
		launcher: chromium,
		launchOptions: {
			headless: true,
			args: ['--disable-dev-shm-usage'],
		},
	},
	firefox: {
		launcher: firefox,
		launchOptions: {
			headless: true,
		},
	},
	webkit: {
		launcher: webkit,
		launchOptions: {
			headless: true,
		},
	},
});
const CAPTURES = new Set([
	'screenshot',
	'canvas-blob',
	'composite-blob',
	'media-recorder',
	'media-recorder-paced',
	'media-recorder-composite',
	'media-recorder-composite-paced',
]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const options = parseArgs(process.argv.slice(2));
const resolution = RESOLUTIONS[options.resolution];
const browserProfile = BROWSERS[options.browser];
const outputRoot = path.join(
	projectRoot,
	'video-output',
	`radio-bubble-capture-benchmark-${options.browser}-${options.resolution}-frames-${options.frames}`,
);

function parseArgs(args) {
	const parsed = {
		browser: 'chromium',
		resolution: '1080p',
		frames: 30,
		captures: ['screenshot', 'canvas-blob', 'composite-blob', 'media-recorder', 'media-recorder-paced', 'media-recorder-composite-paced'],
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg?.startsWith('--')) {
			continue;
		}
		const [rawName, inlineValue] = arg.slice(2).split('=');
		const value = inlineValue ?? args[index + 1];
		if (inlineValue == null) {
			index += 1;
		}

		if (rawName === 'browser') {
			if (!BROWSERS[value]) {
				throw new Error(`Unknown --browser "${value}". Expected: ${Object.keys(BROWSERS).join(', ')}`);
			}
			parsed.browser = value;
		} else if (rawName === 'resolution') {
			if (!RESOLUTIONS[value]) {
				throw new Error(`Unknown --resolution "${value}". Expected: ${Object.keys(RESOLUTIONS).join(', ')}`);
			}
			parsed.resolution = value;
		} else if (rawName === 'frames') {
			const frames = Number(value);
			if (!Number.isInteger(frames) || frames <= 0) {
				throw new Error(`Invalid --frames "${value}". Expected a positive integer.`);
			}
			parsed.frames = frames;
		} else if (rawName === 'captures') {
			parsed.captures = String(value)
				.split(',')
				.map((entry) => entry.trim())
				.filter(Boolean);
			for (const capture of parsed.captures) {
				if (!CAPTURES.has(capture)) {
					throw new Error(`Unknown capture "${capture}". Expected: ${Array.from(CAPTURES).join(', ')}`);
				}
			}
		} else {
			throw new Error(`Unknown option --${rawName}`);
		}
	}

	return parsed;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function rel(filePath) {
	return path.relative(projectRoot, filePath);
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

function createPageUrl({ preserveDrawingBuffer = false, canvasOverlay = false } = {}) {
	const url = new URL(`http://${HOST}:${PORT}/video/radio-bubble-full/`);
	url.searchParams.set('layout', resolution.layoutId);
	if (preserveDrawingBuffer) {
		url.searchParams.set('preserveDrawingBuffer', '1');
	}
	if (canvasOverlay) {
		url.searchParams.set('canvasOverlay', '1');
	}
	return url;
}

async function waitForServer(server) {
	const startedAt = Date.now();
	let lastError = null;
	const url = createPageUrl();

	while (Date.now() - startedAt < SERVER_READY_TIMEOUT_MS) {
		if (server.child.exitCode != null) {
			throw createProcessError('astro dev', [], server.child.exitCode, server.serverLog);
		}

		try {
			const response = await fetch(url.href, {
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
	throw new Error(`Timed out waiting for ${url.href}. Last error: ${lastError?.message ?? 'unknown'}${tail}`);
}

async function createBenchmarkPage(browser, options = {}) {
	const page = await browser.newPage({
		viewport: { width: resolution.width, height: resolution.height },
		deviceScaleFactor: 1,
	});
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

	const url = createPageUrl(options);
	await page.goto(url.href, {
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
	return page;
}

async function writeDataUrl(dataUrl, outputPath) {
	const [, base64 = ''] = String(dataUrl).split(',');
	await writeFile(outputPath, Buffer.from(base64, 'base64'));
}

async function captureFrame(page, frameIndex) {
	const timeSecs = (frameIndex - 1) / FPS;
	const deltaSecs = frameIndex === 1 ? 0 : 1 / FPS;
	const startedAt = performance.now();
	const stats = await page.evaluate(
		(args) => window.__radioBubbleVideoExport.captureFrame(args),
		{ frameIndex, timeSecs, deltaSecs },
	);
	return {
		stats,
		evaluateMs: performance.now() - startedAt,
	};
}

function sampleFrameIndex() {
	return Math.min(options.frames, 30);
}

async function runScreenshotBenchmark(browser) {
	const page = await createBenchmarkPage(browser);
	const samplePath = path.join(outputRoot, 'screenshot-sample.png');
	const evaluateMs = [];
	const screenshotMs = [];
	await page.evaluate(() => window.__radioBubbleVideoExport.startClip());

	for (let frameIndex = 1; frameIndex <= options.frames; frameIndex += 1) {
		const captured = await captureFrame(page, frameIndex);
		evaluateMs.push(captured.evaluateMs);
		const startedAt = performance.now();
		const buffer = await page.screenshot({
			type: 'png',
			fullPage: false,
			animations: 'disabled',
			caret: 'hide',
		});
		screenshotMs.push(performance.now() - startedAt);
		if (frameIndex === sampleFrameIndex()) {
			await writeFile(samplePath, buffer);
		}
	}

	await page.close();
	return {
		id: 'screenshot',
		frameCount: options.frames,
		samplePath: rel(samplePath),
		evaluate: summarize(evaluateMs),
		capture: summarize(screenshotMs),
	};
}

async function runCanvasBlobBenchmark(browser) {
	const page = await createBenchmarkPage(browser, { preserveDrawingBuffer: true });
	const samplePath = path.join(outputRoot, 'canvas-blob-sample.png');
	const evaluateMs = [];
	const encodeMs = [];
	const sizes = [];
	let canvasInfo = null;
	let sampleReadMs = 0;

	await page.evaluate(() => window.__radioBubbleVideoExport.startClip());
	canvasInfo = await page.evaluate(() => window.__radioBubbleVideoExport.getCanvasInfo());

	for (let frameIndex = 1; frameIndex <= options.frames; frameIndex += 1) {
		const captured = await captureFrame(page, frameIndex);
		evaluateMs.push(captured.evaluateMs);
		if (frameIndex === sampleFrameIndex()) {
			const sample = await page.evaluate(
				() => window.__radioBubbleVideoExport.captureCanvasBlobDataUrl({ type: 'image/png' }),
			);
			encodeMs.push(sample.encodeMs);
			sampleReadMs = sample.readMs;
			sizes.push(sample.size);
			await writeDataUrl(sample.dataUrl, samplePath);
		} else {
			const blobStats = await page.evaluate(
				() => window.__radioBubbleVideoExport.captureCanvasBlob({ type: 'image/png' }),
			);
			encodeMs.push(blobStats.encodeMs);
			sizes.push(blobStats.size);
		}
	}

	await page.close();
	return {
		id: 'canvas-blob',
		frameCount: options.frames,
		samplePath: rel(samplePath),
		canvasInfo,
		evaluate: summarize(evaluateMs),
		capture: summarize(encodeMs),
		avgSizeBytes: Math.round(average(sizes)),
		sampleReadMs: round(sampleReadMs),
	};
}

async function runCompositeBlobBenchmark(browser) {
	const page = await createBenchmarkPage(browser, {
		preserveDrawingBuffer: true,
		canvasOverlay: true,
	});
	const samplePath = path.join(outputRoot, 'composite-blob-sample.png');
	const evaluateMs = [];
	const encodeMs = [];
	const sizes = [];
	let canvasInfo = null;
	let sampleReadMs = 0;

	await page.evaluate(() => window.__radioBubbleVideoExport.startClip());
	canvasInfo = await page.evaluate(() => window.__radioBubbleVideoExport.getCanvasInfo());

	for (let frameIndex = 1; frameIndex <= options.frames; frameIndex += 1) {
		const captured = await captureFrame(page, frameIndex);
		evaluateMs.push(captured.evaluateMs);
		if (frameIndex === sampleFrameIndex()) {
			const sample = await page.evaluate(
				() => window.__radioBubbleVideoExport.captureCompositeBlobDataUrl({ type: 'image/png' }),
			);
			encodeMs.push(sample.encodeMs);
			sampleReadMs = sample.readMs;
			sizes.push(sample.size);
			await writeDataUrl(sample.dataUrl, samplePath);
		} else {
			const blobStats = await page.evaluate(
				() => window.__radioBubbleVideoExport.captureCompositeBlob({ type: 'image/png' }),
			);
			encodeMs.push(blobStats.encodeMs);
			sizes.push(blobStats.size);
		}
	}

	await page.close();
	return {
		id: 'composite-blob',
		frameCount: options.frames,
		samplePath: rel(samplePath),
		canvasInfo,
		evaluate: summarize(evaluateMs),
		capture: summarize(encodeMs),
		avgSizeBytes: Math.round(average(sizes)),
		sampleReadMs: round(sampleReadMs),
	};
}

async function runMediaRecorderBenchmark(browser, { paceFrames = false, composite = false } = {}) {
	const page = await createBenchmarkPage(browser, {
		preserveDrawingBuffer: composite,
		canvasOverlay: composite,
	});
	const startedAt = performance.now();
	const result = await page.evaluate(
		(args) => window.__radioBubbleVideoExport.recordCanvasStream(args),
		{
			frameCount: options.frames,
			fps: FPS,
			mimeType: 'video/webm;codecs=vp9',
			bitsPerSecond: 18_000_000,
			paceFrames,
			source: composite ? 'composite' : 'canvas',
		},
	);
	const wallMs = performance.now() - startedAt;
	const extension = result.mimeType.includes('mp4') ? 'mp4' : 'webm';
	const id = [
		'media-recorder',
		composite ? 'composite' : null,
		paceFrames ? 'paced' : null,
	].filter(Boolean).join('-');
	const videoPath = path.join(outputRoot, `${id}.${extension}`);
	await writeDataUrl(result.dataUrl, videoPath);
	await page.close();

	const captureMs = result.timings.map((entry) => Number(entry.captureMs ?? 0));
	const requestFrameMs = result.timings.map((entry) => Number(entry.requestFrameMs ?? 0));
	const routeMs = result.timings.map((entry) => Number(entry.routeMs ?? 0));

	return {
		id,
		frameCount: result.frameCount,
		fps: result.fps,
		paceFrames,
		source: result.source,
		mimeType: result.mimeType,
		videoPath: rel(videoPath),
		sizeBytes: result.size,
		wallMs: round(wallMs),
		recordMs: round(result.recordMs),
		readMs: round(result.readMs),
		capture: summarize(captureMs),
		requestFrame: summarize(requestFrameMs),
		route: summarize(routeMs),
	};
}

async function runCapture(name, browser) {
	const startedAt = performance.now();
	try {
		let result = null;
		if (name === 'screenshot') {
			result = await runScreenshotBenchmark(browser);
		} else if (name === 'canvas-blob') {
			result = await runCanvasBlobBenchmark(browser);
		} else if (name === 'composite-blob') {
			result = await runCompositeBlobBenchmark(browser);
		} else {
			result = await runMediaRecorderBenchmark(browser, {
				composite: name.includes('-composite'),
				paceFrames: name.endsWith('-paced'),
			});
		}
		result.wallMs = round(performance.now() - startedAt);
		console.log(
			`[benchmark:${options.browser}:${name}] ok wall=${result.wallMs}ms captureAvg=${result.capture?.avgMs ?? 'n/a'}ms`,
		);
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.log(`[benchmark:${options.browser}:${name}] failed ${message}`);
		return {
			id: name,
			error: message,
			wallMs: round(performance.now() - startedAt),
		};
	}
}

async function main() {
	await rm(outputRoot, { recursive: true, force: true });
	await mkdir(outputRoot, { recursive: true });

	const server = startAstroServer();
	let browser = null;
	const results = {
		browser: options.browser,
		resolution: options.resolution,
		width: resolution.width,
		height: resolution.height,
		fps: FPS,
		frameCount: options.frames,
		captures: [],
	};

	try {
		await waitForServer(server);
		browser = await browserProfile.launcher.launch(browserProfile.launchOptions);
		for (const capture of options.captures) {
			results.captures.push(await runCapture(capture, browser));
		}
	} finally {
		if (browser) {
			await browser.close().catch(() => null);
		}
		await stopProcess(server.child);
	}

	const resultsPath = path.join(outputRoot, 'benchmark-results.json');
	await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
	console.log(`[benchmark:${options.browser}] wrote ${rel(resultsPath)}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack : error);
	process.exitCode = 1;
});
