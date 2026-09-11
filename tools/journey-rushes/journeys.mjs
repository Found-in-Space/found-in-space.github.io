// Short screen copy adapted from the corresponding website lessons.
// Complete original prose is archived with each export by the runner.
const chapter = (id, seconds, title, body, eyebrow='') => ({id, seconds, title, body, eyebrow});
export const journeys = {
  'radio-bubble': {title:'The radio bubble', source:'radio-bubble', chapters:[
    chapter('before-radio',6,'Before the bubble','We begin at the solar origin. Before wireless telegraphy, no human radio wavefront has crossed the space between the stars.','Earth orbit · before radio'),
    chapter('marconi',12,'A century at light speed','Starting from an approximate date in summer 1895, the shell expands by one light-year each year. Watch it grow through the solar neighbourhood.','1895 → September 2026'),
    chapter('outside',10,'Our small footprint','After about 131 years, the first wavefront is only about 40 parsecs from home. The shell marks possible arrival, not whether a signal could be detected.','One parsec ≈ 3.26 light-years'),
    chapter('hyades',12,'Almost in reach','The Hyades, our nearest open star cluster, lie about 48 parsecs away. Our earliest signals still have roughly 25 years of travel ahead.','The Hyades · about 48 pc'),
    chapter('home',10,'Back inside','The shell passes over us as we return. Our radio footprint is large on a human scale, but tiny compared with the Milky Way.','Return to the Sun'),
  ]},
  'astrophage': {title:'The Astrophage journey',source:'astrophage',note:'Fictional scenario · real stellar positions',chapters:[
    chapter('sol-dimming',8,'The Sun is dimming','In the fictional universe of Project Hail Mary, an organism steals energy from stars. We trace the imagined spread through our real stellar neighbourhood.','Project Hail Mary · story spoilers'),
    chapter('tau-ceti-sky',8,'Where it began','Turn toward Tau Ceti, about 12 light-years away. The story leads back to this Sun-like star, which behaves differently from its infected neighbours.','Looking toward Tau Ceti'),
    chapter('tau-ceti-arrive',8,'The origin system','In the novel, Astrophage cycles between a star and a carbon-dioxide-rich planet. The real distance to Tau Ceti gives the fictional journey its scale.','Arriving at Tau Ceti'),
    chapter('inner-spread',10,'The nearest victims','The red links trace the lesson’s imagined first jumps from Tau Ceti toward Epsilon Eridani and 40 Eridani. Real stars become stepping stones in a fictional chain.','First spread · nearby systems'),
    chapter('sirius-wise',10,'An invisible stepping stone','The chain continues through Sirius and the cold brown dwarf WISE 0855-0714. The labels mark destinations that are not all visible as bright stars.','Sirius → WISE 0855-0714'),
    chapter('final-spread',10,'The Sun falls','The final links reach the Sun and other nearby systems. Pull back to see how a sequence of short jumps can connect the neighbourhood.','The complete imagined network'),
    chapter('keid-lookback',10,'Looking home','From 40 Eridani, look back toward the Sun. This is a fictional route drawn across measured stellar positions: a familiar story in a three-dimensional neighbourhood.','40 Eridani · about 16 light-years'),
  ]},
  'star-clusters': {title:'A journey through star clusters',source:'star-clusters',chapters:[
    chapter('start',8,'Our stellar neighbourhood','We start near the Sun, then travel among groups of stars with very different ages. The star field shows catalogue measurements; the journey reveals their depth.','Home · the solar neighbourhood'),
    chapter('orion-nebula',10,'A stellar nursery','Travel toward the Orion star-forming region, roughly 400 parsecs away. Its very young stars are still close to the clouds in which they formed.','Orion · young stars'),
    chapter('upper-sco',10,'A loose young family','Upper Scorpius is a young association of stars. They share a recent origin but spread across a much larger volume than a compact cluster.','Upper Scorpius · about 145 pc'),
    chapter('pleiades',10,'The Seven Sisters','The Pleiades form a young open cluster. Moving around it reveals that the familiar knot of blue-white stars has real depth.','Pleiades · about 135 pc'),
    chapter('hyades',10,'An older neighbour','The Hyades are the nearest open cluster to the Sun. Their older stellar population offers a contrast with the young Pleiades.','Hyades · about 48 pc'),
    chapter('omega-cen',16,'An ancient stellar city','We leave the local neighbourhood for Omega Centauri, about 5,200 parsecs away. This dense globular cluster contains an ancient population of stars.','Omega Centauri · about 5.2 kpc'),
    chapter('return-home',16,'Back to the Sun','The long journey home puts the scale in perspective: our nearest clusters occupy only a small part of the space around the Milky Way.','Return · the solar neighbourhood'),
  ]},
  'hr-diagram': {title:'Reading the lives of stars',source:'hr-diagram',chapters:[
    chapter('all-stars',10,'A map of stellar lives','The HR diagram compares stellar temperature with intrinsic brightness. The main sequence runs diagonally; cool, luminous giants rise on the right.','All sky · apparent magnitude ≤ 6.5'),
    chapter('inner-plane',8,'Toward the Milky Way','Keep the same brightness limit, but use only the sky in front of us. Looking toward the rich Carina direction changes which stars enter the diagram.','View only · toward Carina'),
    chapter('out-of-plane',8,'Away from the disc','Turn toward a quieter high-latitude direction. The diagram now samples a different population, with fewer young, massive stars.','View only · high galactic latitude'),
    chapter('local-volume',10,'Count the nearby stars','Switch from a brightness limit to a 25-parsec sphere. Faint red dwarfs and white dwarfs enter the diagram, revealing the less conspicuous neighbourhood.','Volume sample · 25 pc around the Sun'),
    chapter('away-volume',10,'A changing census','Move the same-sized sampling sphere 200 parsecs from the Sun. Faint stars become harder for the catalogue to capture, so apparent gaps can reflect missing data.','Volume sample · 200 pc from home'),
    chapter('pleiades',12,'A young cluster','Fly to the Pleiades. Stars born together show a clearer main sequence than a mixed-age field, allowing us to compare stellar evolution at one shared age.','Pleiades · young open cluster'),
    chapter('ngc-752',12,'A stellar clock','In older NGC 752, massive stars have left the main sequence. The point where stars turn away from it helps reveal the cluster’s age.','NGC 752 · older open cluster'),
    chapter('omega-cen',24,'An ancient population','Travel to Omega Centauri. On arrival the sampling radius expands to 100 parsecs, revealing a wider slice of this dense, old cluster and its giant branch.','Omega Centauri · 100 pc sample on arrival'),
  ]},
};
for (const j of Object.values(journeys)) {
  let t=0; for(const c of j.chapters) {c.start=t; t+=c.seconds; c.end=t;} j.duration=t;
}
