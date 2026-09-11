import { computeSpatialLookAtOrientation } from '@found-in-space/spatial';
import { Quaternion } from 'three';
import { journeys } from './journeys.mjs';

const NORTH = {x: 0, y: 0, z: 1};
const SUN = {x: 0, y: 0, z: 0};
const TAU = {x: 3.154460107907653, y: 1.5391502529382706, z: -1.002060948};
const KEID = {x: 2.1804124116897583, y: 4.432736895978451, z: -0.665108382};
const HYADES = {x: 17.574, y: 42.316, z: 13.963};
const PLEIADES = {x: 67.379, y: 103.162, z: 55.161};
const NGC752 = {x: 303.7, y: 167, z: 269.3};
const OMEGA = {x: -3290.566, y: -1309.263, z: -3862.073};
export const MAX_ANGULAR_SPEED_DEG = 24;
export const ORBIT_SECONDS = 22;
const ORBIT_RAMP_SECONDS = 2;
const ORBIT_INCLINATION = 15 * Math.PI / 180;
const TAU_RADIANS = 2 * Math.PI;
const roundFrame = seconds => Math.ceil((seconds - 1e-9) * 25) / 25;
const add = (a, b) => ({x: a.x + b.x, y: a.y + b.y, z: a.z + b.z});
const sub = (a, b) => ({x: a.x - b.x, y: a.y - b.y, z: a.z - b.z});
const scale = (a, s) => ({x: a.x * s, y: a.y * s, z: a.z * s});
const length = a => Math.hypot(a.x, a.y, a.z);
const unit = a => scale(a, 1 / (length(a) || 1));
const cross = (a, b) => ({x: a.y*b.z-a.z*b.y, y: a.z*b.x-a.x*b.z, z: a.x*b.y-a.y*b.x});
const quat = q => new Quaternion(q.x, q.y, q.z, q.w);
const jsonQuat = q => ({x: q.x, y: q.y, z: q.z, w: q.w});
export const angularDistance = (a, b) => quat(a).angleTo(quat(b)) * 180 / Math.PI;
export const distance = (a, b) => length(sub(a, b));
const ease = u => u*u*u*(10+u*(-15+6*u));
const easeDerivative = u => 30*u*u*(1-u)*(1-u);
const easeIntegral = u => 2.5*u**4 - 3*u**5 + u**6;

function pose(position, target) {
  const orientation = computeSpatialLookAtOrientation({position, target, up: NORTH});
  if (!orientation) throw new Error('Camera cannot occupy its look target');
  return {position, orientation, target};
}

function specs(id) {
  if (id === 'radio-bubble') return [
    {center: SUN, radius: .25}, {center: SUN, radius: 120.4, travel: 10},
    {center: SUN, radius: 350}, {center: HYADES, radius: 15}, {center: SUN, radius: 1},
  ];
  if (id === 'astrophage') return [
    {center: SUN, radius: 2}, {at: SUN, look: TAU}, {center: TAU, radius: 1},
    {center: TAU, radius: 5}, {center: {x: -1, y: 2, z: -.5}, radius: 6},
    {center: {x: -.8, y: .8, z: .2}, radius: 11.5},
    {center: KEID, radius: .5, lookback: SUN},
  ];
  if (id === 'star-clusters') return [
    {center: SUN, radius: 8}, {center: {x: 44.371, y: 409.774, z: -38.889}, radius: 100},
    {center: {x: -60.596, y: -118.925, z: -56.656}, radius: 50},
    {center: PLEIADES, radius: 25}, {center: HYADES, radius: 15},
    {center: OMEGA, radius: 200, travel: 14}, {center: SUN, radius: 8, travel: 15},
  ];
  if (id === 'hr-diagram') return [
    {at: SUN, look: {x: -44.4, y: -5.2, z: -88}}, {at: SUN, look: {x: -44.4, y: -5.2, z: -88}},
    {at: SUN, look: {x: -8.8, y: -5.9, z: 3.7}}, {at: SUN, look: {x: -8.8, y: -5.9, z: 3.7}},
    {at: {x: 200, y: 0, z: 0}, look: SUN}, {center: PLEIADES, radius: 10},
    {center: NGC752, radius: 10}, {center: OMEGA, radius: 60, travel: 19},
  ];
  throw new Error(`No continuous route for ${id}`);
}

// Integrate a smoothly ramped angular velocity, with a long constant-speed middle.
// Full turns must be evaluated geometrically: slerping their identical endpoints
// would collapse a complete orbit into a stationary camera.
function orbitPhase(seconds, duration) {
  const t = Math.max(0, Math.min(duration, seconds));
  const ramp = ORBIT_RAMP_SECONDS;
  const speed = TAU_RADIANS / (duration - ramp);
  if (t < ramp) {
    const u = t / ramp;
    return {angle: speed*ramp*easeIntegral(u), speed: speed*ease(u)};
  }
  if (t > duration - ramp) {
    const u = (duration-t) / ramp;
    return {angle: TAU_RADIANS-speed*ramp*easeIntegral(u), speed: speed*ease(u)};
  }
  return {angle: speed*(t-ramp/2), speed};
}

function sampleSegment(segment, time) {
  const elapsed = Math.max(0, Math.min(segment.duration, time-segment.start));
  if (segment.kind === 'orbit') {
    const {angle, speed} = orbitPhase(elapsed, segment.duration);
    const radial = add(scale(segment.basisU, Math.cos(angle)), scale(segment.basisV, Math.sin(angle)));
    const tangent = add(scale(segment.basisU, -Math.sin(angle)), scale(segment.basisV, Math.cos(angle)));
    const current = pose(add(segment.centerPc, scale(radial, segment.radiusPc)), segment.centerPc);
    return {...current, velocity: scale(tangent, segment.radiusPc*speed), orbitProgress: angle/TAU_RADIANS};
  }
  const u = elapsed/segment.duration, s = ease(u);
  const a = segment.from, b = segment.to, delta = sub(b.position, a.position);
  return {
    position: add(a.position, scale(delta, s)),
    orientation: jsonQuat(new Quaternion().slerpQuaternions(quat(a.orientation), quat(b.orientation), s)),
    target: add(a.target, scale(sub(b.target, a.target), s)),
    velocity: scale(delta, easeDerivative(u)/segment.duration),
  };
}

export function createContinuousJourney(id) {
  const source = journeys[id], destinations = specs(id), knots = [], chapters = [], segments = [];
  let time = 0;
  const initial = destinations[0];
  let current = initial.at ? pose(initial.at, initial.look)
    : pose(add(initial.center, scale(unit({x: 1, y: 0, z: .15}), initial.radius)), initial.center);
  knots.push({time: 0, ...current});

  function append(segment, seconds) {
    segment.start = time;
    segment.duration = roundFrame(seconds);
    segment.end = roundFrame(time+segment.duration);
    segments.push(segment);
    time = segment.end;
    const sample = sampleSegment(segment, time);
    current = {position: sample.position, orientation: sample.orientation, target: sample.target};
    knots.push({time, ...current});
    return segment;
  }
  function transfer(next, seconds, kind = 'transfer') {
    // Quintic interpolation peaks at 1.875 times its average angular speed.
    const turnSeconds = 1.875*angularDistance(current.orientation, next.orientation)/MAX_ANGULAR_SPEED_DEG;
    return append({kind, from: current, to: next}, Math.max(seconds, turnSeconds));
  }
  function orbit(spec) {
    const basisU = unit(sub(current.position, spec.center));
    const basisV = add(scale(cross(NORTH, basisU), Math.cos(ORBIT_INCLINATION)), scale(NORTH, Math.sin(ORBIT_INCLINATION)));
    const segment = append({kind: 'orbit', centerPc: spec.center, radiusPc: spec.radius, basisU, basisV}, ORBIT_SECONDS);
    return {start: segment.start, end: segment.end, seconds: segment.duration,
      degrees: 360, centerPc: spec.center, radiusPc: spec.radius, basisU, basisV};
  }

  for (let i = 0; i < source.chapters.length; i++) {
    const original = source.chapters[i], spec = destinations[i], start = time;
    let arrival = time, orbitInfo;
    if (i > 0) {
      let position = spec.at;
      if (!position) {
        const delta = sub(current.position, spec.center);
        // Enter in the equatorial plane; the following true circular orbit tilts
        // by 15 degrees and passes through this same point, without a pose reset.
        const radial = Math.hypot(delta.x, delta.y) > 1e-9 ? unit({x: delta.x, y: delta.y, z: 0}) : {x: 1, y: 0, z: 0};
        position = add(spec.center, scale(radial, spec.radius));
      }
      transfer(pose(position, spec.look ?? spec.center), spec.travel ?? Math.max(5, original.seconds-3));
      arrival = time;
    }
    if (i > 0 && spec.center) {
      orbitInfo = orbit(spec);
      if (spec.lookback) {
        transfer(pose(current.position, spec.lookback), 5, 'look');
        transfer(current, 3, 'hold');
      }
    } else {
      transfer(current, i === 0 ? original.seconds : 3, 'hold');
    }
    chapters.push({...original, start, arrival, end: time, seconds: time-start, ...(orbitInfo ? {orbit: orbitInfo} : {})});
  }
  const journey = {...source, chapters, duration: time};
  function evaluate(sceneTime) {
    const t = Math.max(0, Math.min(time, sceneTime));
    let index = segments.findIndex(s => t < s.end);
    if (index < 0) index = segments.length-1;
    const segment = segments[index], sample = sampleSegment(segment, t);
    return {observerPc: sample.position, orientationIcrs: sample.orientation,
      targetPc: sample.target, velocityPcPerSec: sample.velocity,
      kind: segment.kind, orbitProgress: sample.orbitProgress,
      segment: index, time: t};
  }
  return {journey, knots, segments, evaluate};
}

export function auditContinuousJourney(plan, fps = 25) {
  let maxStepDeg = 0, maxStepPc = 0, previous = plan.evaluate(0);
  const count = Math.round(plan.journey.duration*fps);
  for (let i = 1; i <= count; i++) {
    const sample = plan.evaluate(i/fps);
    maxStepDeg = Math.max(maxStepDeg, angularDistance(previous.orientationIcrs, sample.orientationIcrs));
    maxStepPc = Math.max(maxStepPc, distance(previous.observerPc, sample.observerPc));
    previous = sample;
  }
  if (maxStepDeg > MAX_ANGULAR_SPEED_DEG/fps+.001) throw new Error(`Camera turn exceeds motion limit: ${maxStepDeg}`);
  return {continuous: true, fps, maxAngularStepDegrees: maxStepDeg, maxPositionStepPc: maxStepPc,
    maxAngularSpeedLimitDegreesPerSecond: MAX_ANGULAR_SPEED_DEG, knots: plan.knots,
    orbits: plan.journey.chapters.filter(c => c.orbit).map(c => ({chapter: c.id, ...c.orbit}))};
}
