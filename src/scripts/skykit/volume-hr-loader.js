import * as THREE from 'three';
import {
	aabbDistance,
	selectOctreeNodes,
} from '../../../node_modules/@found-in-space/skykit/src/fields/octree-selection.js';

const SQRT_3 = Math.sqrt(3);

function createNodeCacheKey(node) {
	return node?.nodeKey ?? `${node?.shardOffset ?? 'none'}:${node?.nodeIndex ?? 'none'}`;
}

function normalizePoint(point) {
	if (!point || typeof point !== 'object') {
		return null;
	}

	const x = Number(point.x);
	const y = Number(point.y);
	const z = Number(point.z);
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
		return null;
	}

	return { x, y, z };
}

function createPathSegments(points) {
	const normalized = points
		.map((point) => normalizePoint(point))
		.filter(Boolean);
	const segments = [];
	for (let index = 1; index < normalized.length; index += 1) {
		const start = normalized[index - 1];
		const end = normalized[index];
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const dz = end.z - start.z;
		const lengthSquared = dx * dx + dy * dy + dz * dz;
		if (!(lengthSquared > 0)) {
			continue;
		}
		segments.push({
			start,
			end,
			dx,
			dy,
			dz,
			lengthSquared,
		});
	}
	return segments;
}

function distancePointToSegment(point, segment) {
	const px = point.x - segment.start.x;
	const py = point.y - segment.start.y;
	const pz = point.z - segment.start.z;
	const t = Math.max(
		0,
		Math.min(
			1,
			(px * segment.dx + py * segment.dy + pz * segment.dz) / segment.lengthSquared,
		),
	);
	const closestX = segment.start.x + segment.dx * t;
	const closestY = segment.start.y + segment.dy * t;
	const closestZ = segment.start.z + segment.dz * t;
	const dx = point.x - closestX;
	const dy = point.y - closestY;
	const dz = point.z - closestZ;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function minimumDistanceToSegments(point, segments) {
	let minimum = Number.POSITIVE_INFINITY;
	for (const segment of segments) {
		minimum = Math.min(minimum, distancePointToSegment(point, segment));
	}
	return minimum;
}

/**
 * Select nodes whose AABBs overlap the observer sphere, decode their payloads,
 * and let the HR shader do the final per-star distance test on the GPU.
 */
export function createVolumeHRLoader({ datasetSession }) {
	let loadGeneration = 0;
	let cancelGeneration = 0;
	const decodedPayloadCache = new Map();

	function getDecodedPayload(node, renderService, buffer = null) {
		const cacheKey = createNodeCacheKey(node);
		if (decodedPayloadCache.has(cacheKey)) {
			return decodedPayloadCache.get(cacheKey);
		}
		if (!buffer) {
			return null;
		}
		const decoded = renderService.decodePayload(buffer, node);
		decodedPayloadCache.set(cacheKey, decoded);
		return decoded;
	}

	async function load({ observerPc, maxRadiusPc, maxLevel, onProgress }) {
		const generation = ++loadGeneration;
		const cancelToken = cancelGeneration;
		const notify = typeof onProgress === 'function' ? onProgress : () => {};

		notify({ phase: 'selecting', starCount: 0, nodeCount: 0 });

		const context = { datasetSession };
		const result = await selectOctreeNodes(context, {
			maxLevel,
			predicate(node) {
				const distancePc = aabbDistance(
					observerPc.x, observerPc.y, observerPc.z,
					node.geom.centerX, node.geom.centerY, node.geom.centerZ,
					node.geom.halfSize,
				);
				return { include: distancePc <= maxRadiusPc };
			},
		});

		if (generation !== loadGeneration || cancelToken !== cancelGeneration) return null;

		const nodes = result.nodes.filter((node) => node && node.payloadLength > 0);
		if (nodes.length === 0) {
			const empty = createEmptyResult();
			notify({ phase: 'done', ...empty });
			return empty;
		}

		notify({ phase: 'fetching', starCount: 0, nodeCount: nodes.length });

		const renderService = datasetSession.getRenderService();
		let totalCount = 0;
		for (const node of nodes) {
			const cached = getDecodedPayload(node, renderService);
			if (cached) {
				totalCount += cached.count;
			}
		}

		const missingNodes = nodes.filter((node) => !decodedPayloadCache.has(createNodeCacheKey(node)));
		if (missingNodes.length > 0) {
			await renderService.fetchNodePayloadBatchProgressive(missingNodes, {
				onBatch(entries) {
					if (generation !== loadGeneration || cancelToken !== cancelGeneration) return;
					for (const { node, buffer } of entries) {
						const payload = getDecodedPayload(node, renderService, buffer);
						totalCount += payload?.count ?? 0;
					}
					notify({ phase: 'fetching', starCount: totalCount, nodeCount: nodes.length });
				},
			});
		} else {
			notify({ phase: 'fetching', starCount: totalCount, nodeCount: nodes.length });
		}

		if (generation !== loadGeneration || cancelToken !== cancelGeneration) return null;

		const positions = new Float32Array(totalCount * 3);
		const teffLog8 = new Uint8Array(totalCount);
		const magAbs = new Float32Array(totalCount);

		let offset = 0;
		for (const node of nodes) {
			const payload = getDecodedPayload(node, renderService);
			if (!payload) {
				continue;
			}
			positions.set(payload.positions, offset * 3);
			teffLog8.set(payload.teffLog8, offset);
			magAbs.set(payload.magAbs, offset);
			offset += payload.count;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('teff_log8', new THREE.Uint8BufferAttribute(teffLog8, 1, true));
		geometry.setAttribute('magAbs', new THREE.BufferAttribute(magAbs, 1));
		geometry.setDrawRange(0, totalCount);

		const out = {
			geometry,
			starCount: totalCount,
			nodeCount: nodes.length,
			decodedStarCount: totalCount,
			stats: result.stats,
		};

		notify({ phase: 'done', ...out });
		return out;
	}

	async function preloadNodes(nodes, { onProgress, cancelToken, notifyPrefix = '' } = {}) {
		const notify = typeof onProgress === 'function' ? onProgress : () => {};
		const renderService = datasetSession.getRenderService();
		let decodedStarCount = 0;

		for (const node of nodes) {
			const cached = getDecodedPayload(node, renderService);
			if (cached) {
				decodedStarCount += cached.count;
			}
		}

		const missingNodes = nodes.filter((node) => !decodedPayloadCache.has(createNodeCacheKey(node)));
		if (missingNodes.length > 0) {
			notify({ phase: `${notifyPrefix}fetching`, nodeCount: nodes.length, starCount: decodedStarCount });
			await renderService.fetchNodePayloadBatchProgressive(missingNodes, {
				onBatch(entries) {
					if (cancelToken !== cancelGeneration) return;
					for (const { node, buffer } of entries) {
						const payload = getDecodedPayload(node, renderService, buffer);
						decodedStarCount += payload?.count ?? 0;
					}
					notify({ phase: `${notifyPrefix}fetching`, nodeCount: nodes.length, starCount: decodedStarCount });
				},
			});
		}

		if (cancelToken !== cancelGeneration) return null;

		const out = {
			nodeCount: nodes.length,
			decodedStarCount,
		};
		notify({ phase: `${notifyPrefix}done`, ...out });
		return out;
	}

	async function preloadVolume({ observerPc, maxRadiusPc, maxLevel, onProgress }) {
		const cancelToken = cancelGeneration;
		const notify = typeof onProgress === 'function' ? onProgress : () => {};

		notify({ phase: 'selecting', nodeCount: 0, starCount: 0 });
		const result = await selectOctreeNodes({ datasetSession }, {
			maxLevel,
			predicate(node) {
				const distancePc = aabbDistance(
					observerPc.x, observerPc.y, observerPc.z,
					node.geom.centerX, node.geom.centerY, node.geom.centerZ,
					node.geom.halfSize,
				);
				return { include: distancePc <= maxRadiusPc };
			},
		});

		if (cancelToken !== cancelGeneration) return null;

		const nodes = result.nodes.filter((node) => node && node.payloadLength > 0);
		const warmed = await preloadNodes(nodes, { onProgress, cancelToken });
		if (!warmed) return null;

		return {
			...warmed,
			stats: result.stats,
		};
	}

	async function preloadPath({ points, maxRadiusPc, maxLevel, onProgress }) {
		const cancelToken = cancelGeneration;
		const notify = typeof onProgress === 'function' ? onProgress : () => {};
		const segments = createPathSegments(Array.isArray(points) ? points : []);
		if (segments.length === 0) {
			return {
				nodeCount: 0,
				decodedStarCount: 0,
				stats: null,
			};
		}

		notify({ phase: 'selecting', nodeCount: 0, starCount: 0 });
		const result = await selectOctreeNodes({ datasetSession }, {
			maxLevel,
			predicate(node) {
				const capsuleRadius = maxRadiusPc + node.geom.halfSize * SQRT_3;
				const distanceToPath = minimumDistanceToSegments(
					{
						x: node.geom.centerX,
						y: node.geom.centerY,
						z: node.geom.centerZ,
					},
					segments,
				);
				return { include: distanceToPath <= capsuleRadius };
			},
		});

		if (cancelToken !== cancelGeneration) return null;

		const nodes = result.nodes.filter((node) => node && node.payloadLength > 0);
		const warmed = await preloadNodes(nodes, { onProgress, cancelToken });
		if (!warmed) return null;

		return {
			...warmed,
			stats: result.stats,
		};
	}

	function cancel() {
		loadGeneration += 1;
		cancelGeneration += 1;
	}

	return {
		load,
		preloadVolume,
		preloadPath,
		cancel,
	};
}

function createEmptyResult() {
	return {
		geometry: new THREE.BufferGeometry(),
		starCount: 0,
		nodeCount: 0,
		stats: null,
	};
}
