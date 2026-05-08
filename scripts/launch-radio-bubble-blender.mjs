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
		scenePath: null,
		blendPath: null,
		blenderBin: process.env.BLENDER_BIN || null,
		background: false,
		fps: 24,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith('--')) continue;
		const [key, inlineValue] = arg.slice(2).split('=', 2);
		const value = inlineValue ?? argv[index + 1];
		if (inlineValue === undefined && value && !value.startsWith('--')) {
			index += 1;
		}
		if (key === 'output' || key === 'output-dir') {
			options.outputDir = value;
		} else if (key === 'scene') {
			options.scenePath = value;
		} else if (key === 'blend') {
			options.blendPath = value;
		} else if (key === 'blender' || key === 'blender-bin') {
			options.blenderBin = value;
		} else if (key === 'background') {
			options.background = true;
		} else if (key === 'fps') {
			options.fps = Number(value);
		}
	}
	if (!Number.isFinite(options.fps) || options.fps <= 0) {
		throw new Error(`Invalid Blender fps: ${options.fps}`);
	}
	return options;
}

function rel(filePath) {
	return path.relative(projectRoot, filePath);
}

function runChecked(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: projectRoot,
			stdio: options.stdio ?? 'inherit',
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
	const scenePath = path.resolve(projectRoot, options.scenePath ?? path.join(outputDir, 'radio-bubble-blender-scene.json'));
	const blendPath = path.resolve(projectRoot, options.blendPath ?? path.join(outputDir, 'radio-bubble-path.blend'));
	const blenderBin = await findBlender(options.blenderBin);

	if (options.scenePath) {
		if (!await pathExists(scenePath)) {
			throw new Error(`Scene JSON does not exist: ${scenePath}`);
		}
	} else {
		await runChecked(process.execPath, [
			path.join(scriptDir, 'export-radio-bubble-blender-scene.mjs'),
			'--output-dir',
			outputDir,
		]);
	}

	const blenderArgs = [];
	if (options.background) {
		blenderArgs.push('--background');
	}
	blenderArgs.push(
		'--python',
		path.join(scriptDir, 'blender', 'import_radio_bubble_path.py'),
		'--',
		'--input',
		scenePath,
		'--output',
		blendPath,
		'--fps',
		String(options.fps),
	);
	if (options.background) {
		blenderArgs.push('--quit');
	}

	console.log(`[radio-bubble:blender] launching ${blenderBin}`);
	console.log(`[radio-bubble:blender] input ${rel(scenePath)}`);
	console.log(`[radio-bubble:blender] output ${rel(blendPath)}`);
	await runChecked(blenderBin, blenderArgs);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
