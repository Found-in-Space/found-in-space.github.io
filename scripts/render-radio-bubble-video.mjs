#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WIDTH = 3840;
const HEIGHT = 2160;
const FPS = 24;
const HOST = '127.0.0.1';
const PORT = 4325;
const SERVER_READY_TIMEOUT_MS = 90_000;
const PAGE_READY_TIMEOUT_MS = 180_000;
const CONFIGS = Object.freeze({
	test: {
		id: 'radio-bubble-test',
		routePath: '/video/radio-bubble-test/',
		seconds: 6,
		outputName: 'radio-bubble-test',
	},
	full: {
		id: 'radio-bubble-full',
		routePath: '/video/radio-bubble-full/',
		seconds: 60,
		outputName: 'radio-bubble-full',
	},
});

const mode = process.argv[2] ?? 'test';
const config = CONFIGS[mode];
if (!config) {
	const modes = Object.keys(CONFIGS).join(', ');
	throw new Error(`Unknown radio bubble video mode "${mode}". Expected one of: ${modes}`);
}
const FRAME_COUNT = FPS * config.seconds;
const PAGE_URL = `http://${HOST}:${PORT}${config.routePath}`;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const outputRoot = path.join(projectRoot, 'video-output', config.outputName);
const framesRoot = path.join(outputRoot, 'frames');
const videoPath = path.join(outputRoot, `${config.outputName}.mp4`);

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function rel(filePath) {
	return path.relative(projectRoot, filePath);
}

function frameName(frameIndex) {
	return `frame-${String(frameIndex).padStart(6, '0')}.png`;
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
			const response = await fetch(PAGE_URL, {
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
	throw new Error(`Timed out waiting for ${PAGE_URL}. Last error: ${lastError?.message ?? 'unknown'}${tail}`);
}

async function prepareOutput() {
	await rm(outputRoot, { recursive: true, force: true });
	await mkdir(framesRoot, { recursive: true });
}

async function waitForExportPage(page) {
	await page.goto(PAGE_URL, {
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

async function captureFrames(page) {
	const startStats = await page.evaluate(() => window.__radioBubbleVideoExport.startClip());
	console.log(
		`[video:${config.id}] start stars=${startStats.actualStarCount}/${startStats.expectedStarCount} nodes=${startStats.nodeCount} committed=${startStats.committedNodeCount}`,
	);

	for (let frameIndex = 1; frameIndex <= FRAME_COUNT; frameIndex += 1) {
		const timeSecs = (frameIndex - 1) / FPS;
		const deltaSecs = frameIndex === 1 ? 0 : 1 / FPS;
		const stats = await page.evaluate(
			(args) => window.__radioBubbleVideoExport.captureFrame(args),
			{ frameIndex, timeSecs, deltaSecs },
		);
		const framePath = path.join(framesRoot, frameName(frameIndex));
		await page.screenshot({
			path: framePath,
			type: 'png',
			fullPage: false,
			animations: 'disabled',
			caret: 'hide',
		});
		console.log(
			`[video:${config.id}] frame=${String(frameIndex).padStart(4, '0')}/${FRAME_COUNT} time=${timeSecs.toFixed(3)}s stars=${stats.actualStarCount}/${stats.expectedStarCount} nodes=${stats.nodeCount} committed=${stats.committedNodeCount}`,
		);
	}
}

async function encodeVideo() {
	await runChecked('ffmpeg', [
		'-y',
		'-framerate',
		String(FPS),
		'-i',
		path.join(framesRoot, 'frame-%06d.png'),
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-crf',
		'18',
		videoPath,
	]);
	const info = await stat(videoPath);
	console.log(`[video:${config.id}] wrote ${rel(videoPath)} (${info.size.toLocaleString()} bytes)`);
}

async function main() {
	await prepareOutput();

	const server = startAstroServer();
	let browser = null;
	try {
		await waitForServer(server);
		console.log(`[video:${config.id}] Astro ready at ${PAGE_URL}`);

		try {
			browser = await chromium.launch({
				headless: true,
				args: ['--disable-dev-shm-usage'],
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes('Executable') || message.includes('browserType.launch')) {
				throw new Error(`${message}\n\nInstall Chromium with: npm run video:install-browsers`);
			}
			throw error;
		}

		const page = await browser.newPage({
			viewport: { width: WIDTH, height: HEIGHT },
			deviceScaleFactor: 1,
		});
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
		console.log(
			`[video:${config.id}] page ready stars=${status.starStats.starCount} nodes=${status.starStats.nodeCount} commits=${status.commitCount}`,
		);
		await captureFrames(page);
		await browser.close();
		browser = null;

		await encodeVideo();
		console.log(`[video:${config.id}] captured ${FRAME_COUNT} PNG frames at ${WIDTH}x${HEIGHT}`);
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
