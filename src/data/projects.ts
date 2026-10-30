// Public project information shared by the homepage, Explore, and project pages.
// Keep availability explicit. Never substitute a private repository or a local
// development address for a public launch link. See docs/site-structure.md.
export const projects = [
	{
		slug: 'stars',
		name: 'SkyKit',
		topic: 'Stars & perspective',
		title: 'Find the depth behind the night sky.',
		status: 'Browser experiences',
		summary: 'Move through a measured star field and watch familiar constellations open into three dimensions.',
		material: 'Gaia and Hipparcos catalogue measurements, with derived distances and positions. The view depends on measurement uncertainty, sample selection, and choices about how stars are drawn.',
		prompt: 'Do stars that look close together belong together?',
		tryThis: 'Keep Orion in view as you move sideways. Compare the changing pattern with the view from Earth. Which relationships survive a change of viewpoint?',
		access: 'The constellation and parallax experiences run in your browser. You can start without coding or astronomy knowledge.',
		explore: { label: 'Explore the star field', href: '/explore/constellations-and-3d-space/' },
		more: { label: 'Try parallax', href: '/explore/parallax/' },
		question: { label: 'Investigate apparent cluster shapes', href: '/learn/next-steps/why-orion-and-the-pleiades-can-look-elongated/' },
		build: { label: 'Build with SkyKit', href: '/learn-build/skykit/' },
		source: { label: 'SkyKit source and package guides', href: 'https://github.com/Found-in-Space/skykit' },
	},
	{
		slug: 'worlds',
		name: 'Pas de Géant',
		topic: 'Worlds, scale & motion',
		title: 'Walk around worlds.',
		status: 'Browser experience · WebXR',
		summary: 'Explore Earth and Moon surfaces, the Sun and planets, and satellite motion in a Solar System you can change in scale.',
		material: 'Terrain and imagery, calculated Solar System positions, and satellite orbital data brought into a shared view. Physical distances, display scale, and terrain exaggeration have different roles.',
		prompt: 'What changes when you make a world small enough to walk around?',
		tryThis: 'Compare two scales of the same world. Notice how the horizon and your sense of distance change. Check the scale and terrain settings before interpreting a feature’s apparent size.',
		access: 'Open the browser experience with a WebXR-capable headset for immersive exploration. The application guide also documents desktop controls and local setup for working with the project.',
		explore: { label: 'Explore Pas de Géant', href: 'https://foundin.space/pas-de-geant/' },
		more: null,
		question: null,
		build: { label: 'Set up Pas de Géant', href: 'https://github.com/Found-in-Space/pas-de-geant/blob/main/apps/pas-de-geant/README.md' },
		source: { label: 'Pas de Géant source', href: 'https://github.com/Found-in-Space/pas-de-geant' },
	},
	{
		slug: 'eclipses',
		name: 'Shadowline',
		topic: 'Eclipses & predictions',
		title: 'Follow a shadow across Earth.',
		status: 'Browser experience · alpha',
		summary: 'Explore eclipse paths and local circumstances, and see how the event changes with your observing location.',
		material: 'Astronomical positions and a model of Sun–Moon–Earth geometry produce eclipse predictions. These are calculations, with assumptions and validation limits described in the project documentation.',
		prompt: 'How can the same eclipse look different from two nearby places?',
		tryThis: 'Compare locations near and far from the central path. Predict how timing and the amount of the Sun covered will change, then inspect the calculated local circumstances.',
		access: 'The eclipse explorer and tracker run in your browser. Shadowline is an early alpha; its source documentation describes accuracy and validation.',
		explore: { label: 'Explore eclipses', href: 'https://foundin.space/shadowline/browse/' },
		more: { label: 'Track the 2 August 2027 eclipse', href: 'https://foundin.space/shadowline/tracker/202708/' },
		question: { label: 'Read the model and validation notes', href: 'https://github.com/Found-in-Space/shadowline#accuracy-and-validation' },
		build: { label: 'Build with eclipse calculations', href: 'https://github.com/Found-in-Space/shadowline#run-an-example' },
		source: { label: 'Shadowline source', href: 'https://github.com/Found-in-Space/shadowline' },
	},
	{
		slug: 'music',
		name: 'Aeolian Measure',
		topic: 'Measurements & music',
		title: 'Make music from measured systems.',
		status: 'In private development',
		summary: 'An experiment in turning measurements into structured music through analysis, mapping, and composition.',
		material: 'Measurements pass through chosen analyses and musical mappings. Rhythm, harmony, and instrumentation are authored choices: the music is an artistic interpretation of data, not the literal sound of the measured system.',
		prompt: 'Which patterns belong to the measurements, and which to the music?',
		tryThis: 'A question behind the project: if the same measurements are used with two musical mappings, which changes can still be recognised? This is a direction for investigation, with no public activity available yet.',
		access: 'Aeolian Measure is currently in private development. There is no public player, source release, or teaching activity linked here yet.',
		explore: null,
		more: null,
		question: null,
		build: null,
		source: null,
	},
] as const;

export type Project = (typeof projects)[number];

// Only website routes follow BASE_URL; independently deployed apps keep their URLs.
export function siteHref(href: string, basePath: string) {
	return href.startsWith('/') ? `${basePath}${href.slice(1)}` : href;
}
