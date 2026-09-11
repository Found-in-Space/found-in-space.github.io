import test from 'node:test';
import assert from 'node:assert/strict';
import {createContinuousJourney,auditContinuousJourney,distance,angularDistance} from './continuous-path.mjs';
for(const id of ['radio-bubble','astrophage','hr-diagram','star-clusters']) {
  test(`${id}: continuous position, orientation and velocity across every join`,()=>{
    const plan=createContinuousJourney(id),epsilon=.0001;
    const audit=auditContinuousJourney(plan);
    assert.ok(audit.maxAngularStepDegrees<.961);
    for(const knot of plan.knots.slice(1,-1)) {
      const left=plan.evaluate(knot.time-epsilon),right=plan.evaluate(knot.time+epsilon);
      assert.ok(distance(left.observerPc,right.observerPc)<1e-7);
      assert.ok(angularDistance(left.orientationIcrs,right.orientationIcrs)<.00001);
      assert.ok(distance(left.velocityPcPerSec,right.velocityPcPerSec)<.0001);
    }
    for(const chapter of plan.journey.chapters.slice(1)) {
      const before=plan.evaluate(chapter.start-1/25),at=plan.evaluate(chapter.start);
      assert.ok(angularDistance(before.orientationIcrs,at.orientationIcrs)<.961);
    }
  });
}
