/**
 * Device capability detection.
 *
 * Pure-JS module with zero dependencies, designed to be portable upstream
 * into skykit once the API stabilises. Detects touch, hover, keyboard, and
 * tilt-sensor capabilities so that UI and controls can adapt.
 */

// ---------------------------------------------------------------------------
// Synchronous probes — available immediately at import time
// ---------------------------------------------------------------------------

function mediaMatches(query) {
	if (typeof matchMedia !== 'function') {
		return false;
	}

	return matchMedia(query).matches;
}

/** Primary pointer is coarse (finger) rather than fine (mouse / trackpad). */
export const touchPrimary = mediaMatches('(pointer: coarse)');

/** At least one connected pointer is coarse (catches laptop + touchscreen). */
export const touchAvailable =
	(typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
	mediaMatches('(any-pointer: coarse)');

/** Primary pointer can hover — implies a mouse or trackpad is present. */
export const hoverCapable = mediaMatches('(hover: hover)');

/** True when the primary input is touch and no hover device is present. */
export const touchOnly = touchPrimary && !hoverCapable;

/**
 * Whether on-screen touch controls should be shown.
 *
 * True on phones and tablets (including iPad + external keyboard) where
 * the primary pointer is a finger. False on desktops and laptops even if
 * they have a touchscreen, because their primary pointer is a trackpad.
 */
export const showTouchControls =
	touchPrimary || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

// ---------------------------------------------------------------------------
// Tilt / device-orientation
// ---------------------------------------------------------------------------

/** DeviceOrientationEvent API exists in this browser. */
export const tiltApiExists =
	typeof globalThis !== 'undefined' && 'DeviceOrientationEvent' in globalThis;

/** iOS 13+ requires an explicit permission grant before sensors fire. */
export const tiltNeedsPermission =
	tiltApiExists &&
	typeof DeviceOrientationEvent.requestPermission === 'function';

/**
 * Whether to offer tilt / device-orientation UI (e.g. parallax "device motion").
 *
 * Many desktop browsers define `DeviceOrientationEvent` even when no IMU is
 * exposed, so {@link tiltApiExists} alone is not enough. Touch-primary
 * devices (phones, tablets) are the common case where orientation is useful.
 */
export const showDeviceOrientationUi = tiltApiExists && touchPrimary;

/**
 * Attempt to confirm that a real gyroscope / accelerometer is producing
 * data. Resolves with `{ supported: true }` on first real reading, or
 * `{ supported: false, reason }` on timeout / denial.
 *
 * On iOS this will trigger the native permission prompt, so call it from
 * a user-gesture handler (e.g. button click).
 */
export async function confirmTiltSensor({ timeoutMs = 1500 } = {}) {
	if (!tiltApiExists) {
		return { supported: false, reason: 'no-api' };
	}

	if (tiltNeedsPermission) {
		try {
			const permission = await DeviceOrientationEvent.requestPermission();
			if (permission !== 'granted') {
				return { supported: false, reason: 'denied' };
			}
		} catch {
			return { supported: false, reason: 'denied' };
		}
	}

	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			window.removeEventListener('deviceorientation', onEvent);
			resolve({ supported: false, reason: 'no-sensor-data' });
		}, timeoutMs);

		function onEvent(e) {
			if (e.alpha == null && e.beta == null && e.gamma == null) {
				return;
			}

			clearTimeout(timer);
			window.removeEventListener('deviceorientation', onEvent);
			resolve({ supported: true });
		}

		window.addEventListener('deviceorientation', onEvent);
	});
}

// ---------------------------------------------------------------------------
// Keyboard detection (asynchronous — confirmed on first keydown)
// ---------------------------------------------------------------------------

let _keyboardConfirmed = false;
const _keyboardCallbacks = new Set();

function _onFirstKey() {
	_keyboardConfirmed = true;
	window.removeEventListener('keydown', _onFirstKey, true);

	for (const cb of _keyboardCallbacks) {
		try {
			cb();
		} catch (err) {
			console.error('[device-capabilities] keyboard callback error', err);
		}
	}

	_keyboardCallbacks.clear();
}

if (typeof window !== 'undefined') {
	window.addEventListener('keydown', _onFirstKey, true);
}

/** True once at least one physical keydown has been observed this session. */
export function isKeyboardConfirmed() {
	return _keyboardConfirmed;
}

/**
 * Register a callback that fires once a physical keyboard is detected.
 * If a keyboard has already been confirmed, the callback fires synchronously.
 */
export function onKeyboardDetected(callback) {
	if (_keyboardConfirmed) {
		callback();
		return;
	}

	_keyboardCallbacks.add(callback);
}

// ---------------------------------------------------------------------------
// Media-query change watcher
// ---------------------------------------------------------------------------

/**
 * Watch for capability changes (e.g. user plugs in a mouse or docks a
 * keyboard). Calls `callback` with a snapshot whenever hover/pointer
 * media queries change. Returns an unsubscribe function.
 */
export function watchCapabilities(callback) {
	if (typeof matchMedia !== 'function') {
		return () => {};
	}

	const hoverMql = matchMedia('(hover: hover)');
	const pointerMql = matchMedia('(pointer: coarse)');

	function notify() {
		callback({
			touchPrimary: pointerMql.matches,
			hoverCapable: hoverMql.matches,
			showTouchControls:
				pointerMql.matches ||
				(typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0),
			keyboardConfirmed: _keyboardConfirmed,
		});
	}

	hoverMql.addEventListener('change', notify);
	pointerMql.addEventListener('change', notify);

	return () => {
		hoverMql.removeEventListener('change', notify);
		pointerMql.removeEventListener('change', notify);
	};
}
