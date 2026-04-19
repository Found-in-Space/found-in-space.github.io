function cloneSceneSpec(spec = {}) {
	return {
		...spec,
	};
}

function createTransitionKey(fromSceneId, toSceneId) {
	return `${fromSceneId}->${toSceneId}`;
}

export function createJourneyGraph({
	initialSceneId = null,
	scenes = {},
	transitions = [],
} = {}) {
	const sceneMap = new Map(
		Object.entries(scenes).map(([sceneId, scene]) => [
			sceneId,
			{
				...cloneSceneSpec(scene),
				sceneId,
			},
		]),
	);

	const transitionList = transitions.map((transition, index) => {
		const fromSceneId = transition.fromSceneId ?? transition.from;
		const toSceneId = transition.toSceneId ?? transition.to;
		if (typeof fromSceneId !== 'string' || typeof toSceneId !== 'string') {
			throw new TypeError('Journey transitions require string fromSceneId/toSceneId values.');
		}

		return {
			...cloneSceneSpec(transition),
			id: transition.id ?? createTransitionKey(fromSceneId, toSceneId),
			fromSceneId,
			toSceneId,
		};
	});

	const transitionMap = new Map(
		transitionList.map((transition) => [
			createTransitionKey(transition.fromSceneId, transition.toSceneId),
			transition,
		]),
	);

	function getScene(sceneId) {
		return sceneMap.get(sceneId) ?? null;
	}

	function getTransition(fromSceneId, toSceneId) {
		if (typeof fromSceneId !== 'string' || typeof toSceneId !== 'string') {
			return null;
		}
		return transitionMap.get(createTransitionKey(fromSceneId, toSceneId)) ?? null;
	}

	function resolveSceneSpec(toSceneId, { fromSceneId = null } = {}) {
		const scene = getScene(toSceneId);
		if (!scene) {
			return null;
		}

		const transition = getTransition(fromSceneId, toSceneId);
		const resolved = {
			...cloneSceneSpec(scene),
			...(transition ? cloneSceneSpec(transition) : {}),
			sceneId: toSceneId,
		};

		if (transition) {
			resolved.transitionId = transition.id;
			resolved.fromSceneId = transition.fromSceneId;
			resolved.toSceneId = transition.toSceneId;
		}

		return resolved;
	}

	function listResolvedTransitionSpecs() {
		return transitionList
			.map((transition) =>
				resolveSceneSpec(transition.toSceneId, { fromSceneId: transition.fromSceneId }))
			.filter(Boolean);
	}

	return {
		initialSceneId,
		getScene,
		getTransition,
		resolveSceneSpec,
		listResolvedTransitionSpecs,
		sceneIds: [...sceneMap.keys()],
		transitions: transitionList,
	};
}
