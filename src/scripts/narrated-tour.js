function toArray(value) {
	return Array.isArray(value) ? value : Array.from(value ?? []);
}

function addMediaListener(mql, callback) {
	if (typeof mql.addEventListener === 'function') {
		mql.addEventListener('change', callback);
		return () => mql.removeEventListener('change', callback);
	}

	mql.addListener(callback);
	return () => mql.removeListener(callback);
}

function pickChapterByAnchor(chapters, getChapterId, anchorY) {
	let activeChapter = null;

	for (const chapter of chapters) {
		if (!getChapterId(chapter)) continue;

		if (chapter.getBoundingClientRect().top <= anchorY) {
			activeChapter = chapter;
			continue;
		}

		if (!activeChapter) {
			return chapter;
		}

		break;
	}

	return activeChapter;
}

/**
 * Wire a narrated scrollytelling tour to scroll position, nav pills, and phone/desktop hints.
 *
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {Iterable<HTMLElement>} options.chapters
 * @param {Iterable<HTMLElement>} [options.navButtons]
 * @param {(chapter: HTMLElement) => string | undefined} options.getChapterId
 * @param {(button: HTMLElement) => string | undefined} [options.getNavButtonId]
 * @param {(id: string, context: { source: string }) => void} options.activate
 * @param {HTMLElement | null} [options.statusEl]
 * @param {string} [options.initialId]
 * @param {string} [options.desktopStatus]
 * @param {string} [options.phoneStatus]
 * @param {string} [options.phoneMediaQuery]
 * @param {number} [options.desktopAnchor]
 * @param {number} [options.phoneAnchor]
 * @param {number} [options.suppressMs]
 */
export function setupNarratedTour(options) {
	const {
		root,
		chapters,
		navButtons = [],
		getChapterId,
		getNavButtonId = getChapterId,
		activate,
		statusEl = null,
		initialId = null,
		desktopStatus = '',
		phoneStatus = '',
		phoneMediaQuery = '(max-width: 720px)',
		desktopAnchor = 0.32,
		phoneAnchor = 0.72,
		suppressMs = 1_200,
	} = options;

	if (!root || typeof activate !== 'function') {
		return null;
	}

	const chapterList = toArray(chapters);
	const navList = toArray(navButtons);
	if (!chapterList.length) {
		return null;
	}

	const phoneMql = window.matchMedia(phoneMediaQuery);
	let activeId = null;
	let frameId = 0;
	let suppressUntil = 0;

	function syncStatusHint() {
		if (!statusEl) return;
		statusEl.textContent = phoneMql.matches ? phoneStatus : desktopStatus;
	}

	function syncActiveUi(id) {
		activeId = id;

		chapterList.forEach((chapter) => {
			chapter.classList.toggle('active', getChapterId(chapter) === id);
		});

		navList.forEach((button) => {
			button.classList.toggle('active', getNavButtonId(button) === id);
		});
	}

	function runChapter(id, source, { force = false } = {}) {
		if (!id) return;

		const changed = id !== activeId;
		syncActiveUi(id);

		if (force || changed) {
			activate(id, { source });
		}
	}

	function syncFromScroll(source = 'scroll') {
		if (performance.now() < suppressUntil) return;

		const anchorFraction = phoneMql.matches ? phoneAnchor : desktopAnchor;
		const anchorY = window.innerHeight * anchorFraction;
		const chapter = pickChapterByAnchor(chapterList, getChapterId, anchorY);
		const id = chapter ? getChapterId(chapter) : null;

		if (id && id !== activeId) {
			runChapter(id, source);
		}
	}

	function scheduleSync(source = 'scroll') {
		if (frameId) return;

		frameId = window.requestAnimationFrame(() => {
			frameId = 0;
			syncFromScroll(source);
		});
	}

	function onNavClick(event) {
		const id = getNavButtonId(event.currentTarget);
		if (!id) return;

		suppressUntil = performance.now() + suppressMs;
		runChapter(id, 'nav', { force: true });
	}

	function onScroll() {
		scheduleSync('scroll');
	}

	function onResize() {
		scheduleSync('resize');
	}

	const removeMediaListener = addMediaListener(phoneMql, () => {
		syncStatusHint();
		scheduleSync('media');
	});

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onResize);
	navList.forEach((button) => button.addEventListener('click', onNavClick));

	syncStatusHint();
	runChapter(initialId ?? getChapterId(chapterList[0]), 'init', { force: true });
	scheduleSync('init-sync');

	return {
		destroy() {
			if (frameId) {
				window.cancelAnimationFrame(frameId);
			}

			removeMediaListener();
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
			navList.forEach((button) => button.removeEventListener('click', onNavClick));
		},
	};
}
