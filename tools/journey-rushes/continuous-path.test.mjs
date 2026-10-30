import test from 'node:test';
import assert from 'node:assert/strict';
import {computeSpatialLookAtOrientation} from '@found-in-space/spatial';
import {createContinuousJourney, auditContinuousJourney, distance, angularDistance} from './continuous-path.mjs';
const orbitCounts = {'radio-bubble': 4, astrophage: 5, 'hr-diagram': 3, 'star-clusters': 6};
for (const [id, expectedOrbits] of Object.entries(orbitCounts)) {
  test(`${id}: continuous position, orientation and velocity across every join`, () => {
    const plan = createContinuousJourney(id), epsilon = .0001;
    const audit = auditContinuousJourney(plan);
    assert.ok(audit.maxAngularStepDegrees < .961);
    for (const knot of plan.knots.slice(1, -1)) {
      const left = plan.evaluate(knot.time-epsilon), right = plan.evaluate(knot.time+epsilon);
      assert.ok(distance(left.observerPc, right.observerPc) < 1e-7);
      assert.ok(angularDistance(left.orientationIcrs, right.orientationIcrs) < .00001);
      assert.ok(distance(left.velocityPcPerSec, right.velocityPcPerSec) < .0001);
    }
  });
  test(`${id}: full circles retain radius, keep the target centred, and visit the far side`, () => {
    const plan = createContinuousJourney(id);
    const orbits = plan.journey.chapters.filter(c => c.orbit).map(c => c.orbit);
    assert.equal(orbits.length, expectedOrbits);
    for (const orbit of orbits) {
      const entry = plan.evaluate(orbit.start), opposite = plan.evaluate(orbit.start+orbit.seconds/2);
      assert.ok(Math.abs(distance(entry.observerPc, opposite.observerPc)-2*orbit.radiusPc) < 1e-7);
      const quarterA = plan.evaluate(orbit.start+1+orbit.seconds/4-.5);
      const quarterB = plan.evaluate(orbit.end-1-orbit.seconds/4+.5);
      assert.ok(distance(quarterA.observerPc, quarterB.observerPc) > 1.9*orbit.radiusPc);
      let totalTurn = 0, previous = entry;
      for (let t = orbit.start; t <= orbit.end+.0001; t += 1/25) {
        const sample = plan.evaluate(Math.min(t, orbit.end));
        assert.ok(Math.abs(distance(sample.observerPc, orbit.centerPc)-orbit.radiusPc) < 1e-7);
        assert.ok(distance(sample.targetPc, orbit.centerPc) < 1e-7);
        const facing = computeSpatialLookAtOrientation({position: sample.observerPc, target: orbit.centerPc, up: {x: 0, y: 0, z: 1}});
        assert.ok(angularDistance(sample.orientationIcrs, facing) < .00001);
        totalTurn += angularDistance(previous.orientationIcrs, sample.orientationIcrs);
        previous = sample;
      }
      assert.ok(totalTurn >= 359.9, `Orbit collapsed to ${totalTurn} degrees`);
      assert.ok(distance(entry.observerPc, plan.evaluate(orbit.end).observerPc) < 1e-7);
    }
  });
}
