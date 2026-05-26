const LIVE_CODE_SOURCE = 'found-in-space-live-code';

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src 'unsafe-inline' https:;
  connect-src https: data: blob:;
  img-src https: data: blob:;
  style-src 'unsafe-inline' https:;
  font-src https: data:;
  worker-src blob:;
">`;

const CONSOLE_BRIDGE = `<script>
  (() => {
    const send = (type, payload) => {
      parent.postMessage({
        source: 'found-in-space-live-code',
        type,
        payload
      }, '*');
    };

    for (const level of ['log', 'info', 'warn', 'error']) {
      const original = console[level];
      console[level] = (...args) => {
        send('console', {
          level,
          args: args.map((value) => {
            try {
              if (typeof value === 'string') return value;
              return JSON.stringify(value);
            } catch {
              return String(value);
            }
          })
        });
        original.apply(console, args);
      };
    }

    window.addEventListener('error', (event) => {
      send('error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      send('error', {
        message: event.reason?.message || String(event.reason)
      });
    });
  })();
</script>`;

initLiveCodePlaygrounds();

function initLiveCodePlaygrounds() {
	for (const root of document.querySelectorAll('[data-live-code]:not([data-live-code-ready])')) {
		root.setAttribute('data-live-code-ready', 'true');
		initPlayground(root);
	}
}

function initPlayground(root) {
	const editor = root.querySelector('[data-live-code-editor]');
	const iframe = root.querySelector('[data-live-code-preview]');
	const consoleEl = root.querySelector('[data-live-code-console]');
	const consoleShell = root.querySelector('.live-code__console-shell');
	const statusEl = root.querySelector('[data-live-code-status]');
	const runButton = root.querySelector('[data-live-code-run]');
	const resetButton = root.querySelector('[data-live-code-reset]');
	const copyButton = root.querySelector('[data-live-code-copy]');
	const initialScript = root.querySelector('[data-live-code-initial]');

	if (!editor || !iframe || !consoleEl || !statusEl || !initialScript) {
		return;
	}

	let initialCode = '';
	try {
		const parsed = JSON.parse(initialScript.textContent || '{}');
		initialCode = String(parsed.code || '');
	} catch (error) {
		consoleEl.textContent = formatError(error);
		statusEl.textContent = 'Could not read example source.';
		return;
	}

	editor.value = initialCode;
	if (consoleShell && window.matchMedia('(min-width: 721px)').matches) {
		consoleShell.open = true;
	}
	let runCount = 0;

	const handleMessage = (event) => {
		if (event.source !== iframe.contentWindow) return;
		if (event.data?.source !== LIVE_CODE_SOURCE) return;

		if (event.data.type === 'console') {
			appendConsole(consoleEl, formatConsoleMessage(event.data.payload));
			return;
		}

		if (event.data.type === 'error') {
			const message = formatPreviewError(event.data.payload);
			appendConsole(consoleEl, message);
			if (looksLikeSkykitBundleError(message)) {
				appendConsole(
					consoleEl,
					'The SkyKit browser modules could not be loaded. The lesson text is still available, but the live preview needs the browser ESM endpoint.',
				);
			}
			statusEl.textContent = 'Preview error.';
		}
	};

	window.addEventListener('message', handleMessage);

	runButton?.addEventListener('click', () => {
		runPreview();
	});

	resetButton?.addEventListener('click', () => {
		editor.value = initialCode;
		statusEl.textContent = 'Reset to the original example.';
		runPreview();
	});

	copyButton?.addEventListener('click', () => {
		void copyText(editor.value, copyButton, statusEl);
	});

	editor.addEventListener('keydown', (event) => {
		if (event.key === 'Tab') {
			event.preventDefault();
			insertAtSelection(editor, '  ');
			return;
		}
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			runPreview();
		}
	});

	window.addEventListener('pagehide', () => {
		window.removeEventListener('message', handleMessage);
		iframe.srcdoc = '<!doctype html><title>Disposed preview</title>';
	}, { once: true });

	runPreview();

	function runPreview() {
		runCount += 1;
		consoleEl.textContent = '';
		statusEl.textContent = 'Running preview...';
		iframe.srcdoc = '<!doctype html><title>Resetting preview</title>';
		window.setTimeout(() => {
			iframe.srcdoc = createSrcdoc(editor.value, runCount);
			statusEl.textContent = 'Preview running.';
		}, 0);
	}
}

function createSrcdoc(source, runCount) {
	const injection = [
		CSP_META,
		`<meta name="found-in-space-live-code-run" content="${runCount}">`,
		createEsmOverrideScript(),
		CONSOLE_BRIDGE,
	].join('\n');

	if (/<head[\s>]/i.test(source)) {
		return source.replace(/<head([^>]*)>/i, `<head$1>\n${injection}`);
	}

	if (/<html[\s>]/i.test(source)) {
		return source.replace(/<html([^>]*)>/i, `<html$1>\n<head>${injection}</head>`);
	}

	return `<!doctype html>
<html lang="en">
<head>
${injection}
</head>
<body>
${source}
</body>
</html>`;
}

function createEsmOverrideScript() {
	const params = new URLSearchParams(window.location.search);
	const esmBase = params.get('skykitEsmBase') || params.get('skykitCdnBase');
	if (!esmBase) {
		return '';
	}
	return `<script>window.__SKYKIT_ESM_BASE_OVERRIDE__ = ${JSON.stringify(esmBase).replace(/</g, '\\u003c')};</script>`;
}

function appendConsole(consoleEl, text) {
	const next = consoleEl.textContent ? `${consoleEl.textContent}\n${text}` : text;
	consoleEl.textContent = next;
	consoleEl.scrollTop = consoleEl.scrollHeight;
}

function formatConsoleMessage(payload) {
	const level = payload?.level || 'log';
	const args = Array.isArray(payload?.args) ? payload.args : [];
	return `[${level}] ${args.join(' ')}`;
}

function formatPreviewError(payload) {
	if (!payload) {
		return '[error] Preview error.';
	}
	const location = [
		payload.filename,
		payload.lineno ? `:${payload.lineno}` : '',
		payload.colno ? `:${payload.colno}` : '',
	].join('');
	return `[error] ${payload.message || 'Preview error.'}${location.trim() ? ` (${location})` : ''}`;
}

function looksLikeSkykitBundleError(message) {
	return /esm\.sh|@found-in-space|module.*load|failed.*import|network/i
		.test(message);
}

function insertAtSelection(textarea, value) {
	const start = textarea.selectionStart ?? textarea.value.length;
	const end = textarea.selectionEnd ?? start;
	textarea.setRangeText(value, start, end, 'end');
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function copyText(text, button, statusEl) {
	try {
		await navigator.clipboard.writeText(text);
		const original = button.textContent;
		button.textContent = 'Copied';
		statusEl.textContent = 'Copied current source.';
		window.setTimeout(() => {
			button.textContent = original;
		}, 1400);
	} catch (error) {
		statusEl.textContent = `Copy failed: ${formatError(error)}`;
	}
}

function formatError(error) {
	return error instanceof Error ? error.message : String(error);
}
