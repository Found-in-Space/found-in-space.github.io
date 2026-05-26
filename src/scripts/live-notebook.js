const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const instances = new Set();
let skykitDataModulePromise = null;
let skykitRuntime = null;

void initLiveNotebooks();

async function initLiveNotebooks() {
	let skykit;
	try {
		skykit = await loadSkykitDataModule();
	} catch (error) {
		for (const root of document.querySelectorAll('[data-live-notebook]:not([data-live-notebook-ready])')) {
			root.setAttribute('data-live-notebook-ready', 'true');
			const status = root.querySelector('[data-live-notebook-status]');
			if (status) {
				status.textContent = [
					'The SkyKit browser modules could not be loaded. The lesson text is still available, but the live preview needs the browser ESM endpoint.',
					formatError(error),
				].join(' ');
			}
		}
		return;
	}
	skykitRuntime = skykit;

	for (const root of document.querySelectorAll('[data-live-notebook]:not([data-live-notebook-ready])')) {
		root.setAttribute('data-live-notebook-ready', 'true');
		instances.add(initNotebook(root, skykit));
	}
}

window.addEventListener('pagehide', disposeAll);
window.addEventListener('beforeunload', disposeAll);

function initNotebook(root, skykit) {
	const initialScript = root.querySelector('[data-live-notebook-initial]');
	const cellsRoot = root.querySelector('[data-live-notebook-cells]');
	const statusEl = root.querySelector('[data-live-notebook-status]');
	const summaryEl = root.querySelector('[data-live-notebook-summary]');
	const tableHead = root.querySelector('[data-live-notebook-table-head]');
	const tableBody = root.querySelector('[data-live-notebook-table-body]');
	const runAllButton = root.querySelector('[data-live-notebook-run-all]');
	const resetButton = root.querySelector('[data-live-notebook-reset]');
	const copyButton = root.querySelector('[data-live-notebook-copy]');
	const cellState = new Map();

	const context = {
		OCTREE_DEFAULT: skykit.OCTREE_DEFAULT,
		createMetaSidecarProviderService: skykit.createMetaSidecarProviderService,
		createObserverShellStrategy: skykit.createObserverShellStrategy,
		createStarCellKey: skykit.createStarCellKey,
		createStarOctreeProviderService: skykit.createStarOctreeProviderService,
		decodeTemperatureK: skykit.decodeTemperatureK,
		deriveMetaSidecarUrlFromRenderUrl: skykit.deriveMetaSidecarUrlFromRenderUrl,
		temperatureToRgb: skykit.temperatureToRgb,
		provider: null,
		metaProvider: null,
		cells: [],
		rows: [],
		metadataRows: [],
		datasetId: null,
		disposeProvider,
		formatLabel,
		renderKeyValue,
		renderTable,
		rowsFromCells,
		showProgress,
		summarizeCells,
	};

	let definitions = [];
	try {
		definitions = JSON.parse(initialScript?.textContent || '{}').cells || [];
	} catch (error) {
		setStatus(`Could not read notebook source: ${formatError(error)}`);
		return { dispose: disposeProvider };
	}

	renderNotebook();
	renderSummary(summarizeCells([]));
	renderTable([], defaultStarColumns());

	runAllButton?.addEventListener('click', () => {
		void runAllCells();
	});

	resetButton?.addEventListener('click', () => {
		resetCells();
	});

	copyButton?.addEventListener('click', () => {
		void copyAllCells();
	});

	function renderNotebook() {
		cellsRoot.innerHTML = definitions.map(renderCellShell).join('');
		for (const definition of definitions) {
			const cell = cellsRoot.querySelector(`[data-live-notebook-cell="${cssEscape(definition.id)}"]`);
			const editor = cell?.querySelector('[data-live-notebook-source]');
			const output = cell?.querySelector('[data-live-notebook-output]');
			const run = cell?.querySelector('[data-live-notebook-run-cell]');
			if (!cell || !editor || !output || !run) continue;

			editor.value = definition.initialCode;
			autosizeTextarea(editor);
			editor.addEventListener('input', () => growTextareaToContent(editor));
			editor.addEventListener('keydown', (event) => {
				if (event.key === 'Tab') {
					event.preventDefault();
					insertAtSelection(editor, '  ');
					return;
				}
				if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
					event.preventDefault();
					void runCell(definition.id);
				}
			});
			run.addEventListener('click', () => {
				void runCell(definition.id);
			});
			cellState.set(definition.id, { cell, definition, editor, output, run });
		}
	}

	function renderCellShell(definition) {
		return `
			<section class="live-notebook__cell" data-live-notebook-cell="${escapeHtml(definition.id)}">
				<header class="live-notebook__cell-header">
					<div>
						<h3>${escapeHtml(definition.title)}</h3>
						${definition.description ? `<p>${escapeHtml(definition.description)}</p>` : ''}
					</div>
					<button type="button" data-live-notebook-run-cell>Run cell</button>
				</header>
				<textarea
					class="live-notebook__editor"
					data-live-notebook-source
					spellcheck="false"
					aria-label="${escapeHtml(definition.title)} code"
				></textarea>
				<pre class="live-notebook__output" data-live-notebook-output aria-live="polite">Not run yet.</pre>
			</section>
		`;
	}

	async function runAllCells() {
		setControlsDisabled(true);
		try {
			for (const definition of definitions) {
				const ok = await runCell(definition.id, { keepControlsDisabled: true });
				if (!ok) break;
			}
		} finally {
			setControlsDisabled(false);
		}
	}

	async function runCell(id, options = {}) {
		const cell = cellState.get(id);
		if (!cell) return false;

		if (!options.keepControlsDisabled) setControlsDisabled(true);
		cell.cell.dataset.state = 'running';
		cell.output.textContent = 'Running...';
		setStatus(`Running ${cell.definition.title}.`);
		const outputState = { logs: [], result: undefined, hasResult: false };

		try {
			const result = await executeCell(cell.editor.value, (level, args) => {
				outputState.logs.push({ level, args });
				cell.output.textContent = formatExecutionOutput(outputState);
				cell.output.scrollTop = cell.output.scrollHeight;
			});
			outputState.result = result;
			outputState.hasResult = true;
			cell.output.textContent = formatExecutionOutput(outputState);
			cell.cell.dataset.state = 'ok';
			setStatus('Ready.');
			return true;
		} catch (error) {
			cell.cell.dataset.state = 'error';
			cell.output.textContent = formatError(error);
			setStatus('Notebook error.');
			return false;
		} finally {
			if (!options.keepControlsDisabled) setControlsDisabled(false);
		}
	}

	async function executeCell(source, onLog) {
		const cellFunction = new AsyncFunction(
			'ctx',
			`with (ctx) {
				return await (async () => {
${source}
				})();
			}`,
		);
		const previousConsole = context.console;
		context.console = createCellConsole(onLog);
		try {
			return await cellFunction(context);
		} finally {
			if (previousConsole === undefined) {
				delete context.console;
			} else {
				context.console = previousConsole;
			}
		}
	}

	function resetCells() {
		for (const definition of definitions) {
			const cell = cellState.get(definition.id);
			if (!cell) continue;
			cell.editor.value = definition.initialCode;
			autosizeTextarea(cell.editor);
			cell.output.textContent = 'Not run yet.';
			cell.cell.dataset.state = '';
		}
		context.cells = [];
		context.rows = [];
		context.metadataRows = [];
		context.datasetId = null;
		disposeProvider();
		renderSummary(summarizeCells([]));
		renderTable([], defaultStarColumns());
		setStatus('Reset.');
	}

	async function copyAllCells() {
		const source = definitions
			.map((definition) => {
				const cell = cellState.get(definition.id);
				const code = cell?.editor.value ?? definition.initialCode;
				return `// ${definition.title}\n${code.trim()}`;
			})
			.join('\n\n');
		try {
			await navigator.clipboard.writeText(source);
			const original = copyButton.textContent;
			copyButton.textContent = 'Copied';
			setStatus('Copied all notebook cells.');
			window.setTimeout(() => {
				copyButton.textContent = original;
			}, 1400);
		} catch (error) {
			setStatus(`Copy failed: ${formatError(error)}`);
		}
	}

	function setControlsDisabled(disabled) {
		if (runAllButton) runAllButton.disabled = disabled;
		if (resetButton) resetButton.disabled = disabled;
		if (copyButton) copyButton.disabled = disabled;
		for (const cell of cellState.values()) {
			cell.run.disabled = disabled;
		}
	}

	function setStatus(message) {
		statusEl.textContent = message;
	}

	function showProgress(cells) {
		renderSummary(summarizeCells(cells));
		setStatus(`Streaming cells (${cells.length}).`);
	}

	function summarizeCells(cells) {
		return {
			cells: cells.length,
			stars: cells.reduce((sum, cell) => sum + cell.count, 0),
			firstCell: cells[0]?.cellKey ?? '',
			datasetId: context.datasetId ?? '',
		};
	}

	function renderSummary(summary) {
		summaryEl.innerHTML = [
			summaryItem('Cells', formatInteger(summary.cells)),
			summaryItem('Stars', formatInteger(summary.stars)),
			summaryItem('First cell', summary.firstCell || '-'),
			summary.datasetId ? summaryItem('Dataset', summary.datasetId) : '',
		].join('');
	}

	function renderTable(rows, columns = defaultStarColumns()) {
		context.rows = rows;
		tableHead.innerHTML = `<tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>`;
		tableBody.innerHTML = rows.length
			? rows.map((row, rowIndex) => renderTableRow(row, rowIndex, columns)).join('')
			: `<tr><td colspan="${columns.length}" class="empty-row">Run the cells to render rows.</td></tr>`;
	}

	function renderKeyValue(values) {
		const rows = Object.entries(values).map(([key, value]) => ({ key, value: formatOutput(value) }));
		renderTable(rows, [
			{ key: 'key', label: 'field' },
			{ key: 'value', label: 'value' },
		]);
	}

	function disposeProvider() {
		context.provider?.dispose?.();
		context.metaProvider?.dispose?.();
		context.provider = null;
		context.metaProvider = null;
	}

	return { dispose: disposeProvider };
}

function rowsFromCells(cells) {
	return cells.flatMap(rowsFromCell);
}

function rowsFromCell(cell) {
	const positions = cell.coordinates?.components;
	const magAbs = cell.attributes?.magAbs;
	const teffLog8 = cell.attributes?.teffLog8;
	if (!positions || !magAbs) {
		return [];
	}

	return Array.from({ length: cell.count }, (_, index) => {
		const ref = cell.refs?.[index] ?? null;
		const ordinal = ref?.ordinal ?? index;
		return {
			index,
			cellKey: ref ? skykitRuntime.createStarCellKey(ref) : cell.cellKey,
			ordinal,
			xPc: positions[index * 3],
			yPc: positions[index * 3 + 1],
			zPc: positions[index * 3 + 2],
			magAbs: magAbs[index],
			temperatureK: teffLog8 ? skykitRuntime.decodeTemperatureK(teffLog8[index]) : null,
			hasObjectRef: Boolean(ref),
			ref,
			cell,
		};
	});
}

function loadSkykitDataModule() {
	if (!skykitDataModulePromise) {
		const esmBase = browserEsmBase();
		skykitDataModulePromise = Promise.all([
			import(packageUrl(esmBase, '@found-in-space/star-octree-provider@0.2.0-alpha.0')),
			import(packageUrl(esmBase, '@found-in-space/meta-sidecar-provider@0.2.0-alpha.0')),
			import(packageUrl(esmBase, '@found-in-space/star-trees@0.2.0-alpha.0')),
		]).then(([octreeProvider, metaSidecarProvider, starTrees]) => ({
			...octreeProvider,
			...metaSidecarProvider,
			...starTrees,
		}));
	}
	return skykitDataModulePromise;
}

function browserEsmBase() {
	const params = new URLSearchParams(window.location.search);
	return normalizeBaseUrl(params.get('skykitEsmBase') || params.get('skykitCdnBase') || 'https://esm.sh/');
}

function packageUrl(base, specifier) {
	return `${base}${specifier}`;
}

function normalizeBaseUrl(value) {
	return value.endsWith('/') ? value : `${value}/`;
}

function defaultStarColumns() {
	return [
		{ key: 'rowNumber', label: '#' },
		{ key: 'cellKey', label: 'cell key' },
		{ key: 'ordinal', label: 'ordinal' },
		{ key: 'xPc', label: 'x pc', format: (value) => formatNumber(value, 2) },
		{ key: 'yPc', label: 'y pc', format: (value) => formatNumber(value, 2) },
		{ key: 'zPc', label: 'z pc', format: (value) => formatNumber(value, 2) },
		{ key: 'magAbs', label: 'absolute magnitude', format: (value) => formatNumber(value, 2) },
		{ key: 'temperatureK', label: 'temperature K', format: (value) => formatTemperature(value) },
		{ key: 'hasObjectRef', label: 'has object ref', format: (value) => value ? 'yes' : 'no' },
	];
}

function renderTableRow(row, rowIndex, columns) {
	return `<tr>${columns.map((column) => {
		const value = column.key === 'rowNumber' ? rowIndex + 1 : row[column.key];
		const formatted = column.format ? column.format(value, row, rowIndex) : value;
		return `<td>${escapeHtml(formatted ?? '')}</td>`;
	}).join('')}</tr>`;
}

function summaryItem(label, value) {
	return `
		<div class="live-notebook__summary-item">
			<span>${escapeHtml(label)}</span>
			<strong>${escapeHtml(value)}</strong>
		</div>
	`;
}

function createCellConsole(onLog) {
	return {
		log: (...args) => onLog('log', args),
		info: (...args) => onLog('info', args),
		warn: (...args) => onLog('warn', args),
		error: (...args) => onLog('error', args),
	};
}

function formatExecutionOutput(state) {
	const sections = [];
	if (state.logs.length > 0) {
		sections.push([
			'console',
			state.logs.map((entry, index) => formatConsoleEntry(entry, index)).join('\n'),
		].join('\n'));
	}
	if (state.hasResult) {
		sections.push(['result', formatOutput(state.result)].join('\n'));
	}
	return sections.join('\n\n') || 'Running...';
}

function formatConsoleEntry(entry, index) {
	return `[${index + 1}] ${entry.level}: ${entry.args.map(formatOutput).join(' ')}`;
}

function formatOutput(value) {
	if (typeof value === 'string') return value;
	if (value === undefined) return 'undefined';
	try {
		return JSON.stringify(summarizeForOutput(value), null, 2);
	} catch {
		return String(value);
	}
}

function summarizeForOutput(value, depth = 0) {
	if (value === null || typeof value !== 'object') return value;
	if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.length})`;
	if (Array.isArray(value)) {
		return {
			type: 'Array',
			length: value.length,
			first: value.slice(0, 3).map((item) => summarizeForOutput(item, depth + 1)),
		};
	}
	if (depth > 2) return '[Object]';
	return Object.fromEntries(
		Object.entries(value).map(([key, nested]) => [key, summarizeForOutput(nested, depth + 1)]),
	);
}

function formatLabel(entry, fallback = '') {
	const properName = metaString(entry?.proper_name);
	if (properName) return properName;

	const bayer = formatBayerDesignation(entry);
	if (bayer) return bayer;

	const flamsteed = metaString(entry?.flamsteed);
	const constellation = metaString(entry?.constellation);
	if (flamsteed) return constellation ? `${flamsteed} ${constellation}` : flamsteed;

	const hd = metaString(entry?.hd);
	if (hd) return `HD ${hd}`;

	const hip = metaString(entry?.hip_id);
	if (hip) return `HIP ${hip}`;

	const gaia = metaString(entry?.gaia_source_id);
	if (gaia) return `Gaia ${gaia}`;

	return fallback;
}

function formatBayerDesignation(entry) {
	const bayer = metaString(entry?.bayer);
	if (!bayer) return '';
	const constellation = metaString(entry?.constellation);
	if (!constellation || designationEndsWithConstellation(bayer, constellation)) return bayer;
	return `${bayer} ${constellation}`;
}

function designationEndsWithConstellation(value, constellation) {
	const lowerValue = value.toLowerCase();
	const lowerConstellation = constellation.toLowerCase();
	if (!lowerValue.endsWith(lowerConstellation)) return false;
	if (lowerValue.length === lowerConstellation.length) return true;
	const separator = value[value.length - constellation.length - 1];
	return separator === ' ' || separator === '-';
}

function metaString(value) {
	if (value == null) return '';
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	if (typeof value === 'bigint') return value.toString();
	return typeof value === 'string' ? value.trim() : '';
}

function autosizeTextarea(textarea) {
	textarea.style.height = 'auto';
	textarea.style.height = `${textarea.scrollHeight}px`;
}

function growTextareaToContent(textarea) {
	if (textarea.scrollHeight > textarea.clientHeight) {
		textarea.style.height = `${textarea.scrollHeight}px`;
	}
}

function insertAtSelection(textarea, value) {
	const start = textarea.selectionStart ?? textarea.value.length;
	const end = textarea.selectionEnd ?? start;
	textarea.setRangeText(value, start, end, 'end');
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function disposeAll() {
	for (const instance of instances) {
		instance.dispose();
	}
	instances.clear();
}

function formatNumber(value, fractionDigits) {
	return Number.isFinite(value)
		? value.toLocaleString(undefined, {
				maximumFractionDigits: fractionDigits,
				minimumFractionDigits: Math.min(fractionDigits, 2),
			})
		: '';
}

function formatInteger(value) {
	return Math.round(value || 0).toLocaleString();
}

function formatTemperature(value) {
	return Number.isFinite(value) ? `${Math.round(value).toLocaleString()} K` : '';
}

function formatError(error) {
	return error instanceof Error ? error.stack || error.message : String(error);
}

function cssEscape(value) {
	return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : String(value).replaceAll('"', '\\"');
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
