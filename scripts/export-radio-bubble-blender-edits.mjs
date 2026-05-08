#!/usr/bin/env node
import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const DEFAULT_OUTPUT_DIR = 'video-output/radio-bubble/blender';

function parseArgs(argv) {
	const options = {
		outputDir: DEFAULT_OUTPUT_DIR,
		blendPath: null,
		outputPath: null,
		blenderBin: process.env.BLENDER_BIN || null,
		fps: 24,
		stepSecs: 0.25,
		durationSecs: 60,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith('--')) continue;
		const [key, inlineValue] = arg.slice(2).split('=', 2);
		const value = inlineValue ?? argv[index + 1];
		if (inlineValue === undefined && value && !value.startsWith('--')) {
			index += 1;
		}
		if (key === 'output-dir') {
			options.outputDir = value;
		} else if (key === 'blend') {
			options.blendPath = value;
		} else if (key === 'output') {
			options.outputPath = value;
		} else if (key === 'blender' || key === 'blender-bin') {
			options.blenderBin = value;
		} else if (key === 'fps') {
			options.fps = Number(value);
		} else if (key === 'step') {
			options.stepSecs = Number(value);
		} else if (key === 'duration' || key === 'seconds') {
			options.durationSecs = Number(value);
		}
	}
	if (!Number.isFinite(options.fps) || options.fps <= 0) {
		throw new Error(`Invalid fps: ${options.fps}`);
	}
	if (!Number.isFinite(options.stepSecs) || options.stepSecs <= 0) {
		throw new Error(`Invalid step: ${options.stepSecs}`);
	}
	if (!Number.isFinite(options.durationSecs) || options.durationSecs <= 0) {
		throw new Error(`Invalid duration: ${options.durationSecs}`);
	}
	return options;
}

function runChecked(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: projectRoot,
			stdio: 'inherit',
			env: process.env,
		});
		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} ${args.join(' ')} exited with ${signal ?? code}`));
		});
	});
}

async function pathExists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function findBlender(explicit) {
	if (explicit) {
		return explicit;
	}
	const macAppPath = '/Applications/Blender.app/Contents/MacOS/Blender';
	if (process.platform === 'darwin' && await pathExists(macAppPath)) {
		return macAppPath;
	}
	return 'blender';
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const outputDir = path.resolve(projectRoot, options.outputDir);
	const blendPath = path.resolve(projectRoot, options.blendPath ?? path.join(outputDir, 'radio-bubble-path.blend'));
	const outputPath = path.resolve(projectRoot, options.outputPath ?? path.join(outputDir, 'radio-bubble-camera-scene.json'));
	const blenderBin = await findBlender(options.blenderBin);
	if (!await pathExists(blendPath)) {
		throw new Error(`Blend file does not exist: ${blendPath}`);
	}

	const args = [
		'--background',
		blendPath,
		'--python',
		path.join(scriptDir, 'blender', 'export_radio_bubble_camera_path.py'),
		'--',
		'--output',
		outputPath,
		'--fps',
		String(options.fps),
		'--duration',
		String(options.durationSecs),
		'--step',
		String(options.stepSecs),
	];
	console.log(`[radio-bubble:blender] converting ${path.relative(projectRoot, blendPath)}`);
	await runChecked(blenderBin, args);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
