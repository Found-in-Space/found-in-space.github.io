const DEFAULT_ROOT_MARGIN = '900px 0px';

export function mountWhenNearViewport(target, mount, options = {}) {
	const rootMargin = options.rootMargin ?? DEFAULT_ROOT_MARGIN;
	const onWaiting = typeof options.onWaiting === 'function' ? options.onWaiting : () => {};
	const onStart = typeof options.onStart === 'function' ? options.onStart : () => {};
	const onError = typeof options.onError === 'function' ? options.onError : null;
	let observer = null;
	let started = false;
	let cancelled = false;

	function start() {
		if (started || cancelled) return;
		started = true;
		observer?.disconnect();
		onStart();
		Promise.resolve()
			.then(mount)
			.catch((err) => {
				if (onError) {
					onError(err);
					return;
				}
				throw err;
			});
	}

	onWaiting();

	if (!('IntersectionObserver' in window)) {
		window.setTimeout(start, 0);
		return { start, cancel };
	}

	observer = new IntersectionObserver((entries) => {
		if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
			start();
		}
	}, { rootMargin, threshold: 0 });

	observer.observe(target);

	return { start, cancel };

	function cancel() {
		cancelled = true;
		observer?.disconnect();
	}
}
