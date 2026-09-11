import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectReadiness, waitForStarsReady } from './readiness.mjs';
const fixture = () => ({ parts: [{ snapshot: { id: 'stars', status: 'current', renderer: { starCount: 20, cellCount:3, lastCurrentRevision:{viewRevision:2,demandRevision:7} }, session: { cells:[{starCount:20}], view: { revision: 2 }, demand: { revision:7, status: 'current', activeWorkItemCount: 0, inFlightCellCount: 0, desiredCellCount: 3, currentCellCount: 3 } } } }] });
test('old current layer cannot pass while a new demand is planning', () => {
  const s = fixture(); s.parts[0].snapshot.session.demand.status = 'planning';
  assert.equal(inspectReadiness(s).ready, false);
});
test('pending work and missing cells prevent capture', () => {
  for (const patch of [{activeWorkItemCount:1}, {inFlightCellCount:1}, {currentCellCount:2}]) {
    const s=fixture(); Object.assign(s.parts[0].snapshot.session.demand, patch);
    assert.equal(inspectReadiness(s).ready,false);
  }
});
test('fully delivered demand passes and errors abort', () => {
  const s=fixture(); assert.equal(inspectReadiness(s).ready,true);
  s.parts[0].snapshot.session.lastError='network failure';
  assert.throws(()=>inspectReadiness(s), /network failure/);
});

test('loading wait redraws without updating animation or advancing camera', async () => {
  let renders=0;
  const viewer={frame(){throw new Error('Must not advance animation');},
    render(){renders++;},getSnapshot:fixture,getViewState:()=>({observerPc:{x:1,y:2,z:3}})};
  const result=await waitForStarsReady(viewer,{pollMs:1});
  assert.equal(result.readiness.ready,true);
  assert.equal(renders,3);
});
test('loading wait rejects camera drift', async () => {
  let revision=0;
  await assert.rejects(waitForStarsReady({render(){revision++;},getSnapshot:fixture,
    getViewState:()=>({revision})},{pollMs:1}),/Camera state changed/);
});

test('HR retained-cell cleanup may report streaming after the current revision was delivered', () => {
  const s=fixture();s.parts[0].snapshot.status='streaming';
  assert.equal(inspectReadiness(s).ready,true);
  s.parts[0].snapshot.renderer.cellCount=4;
  assert.equal(inspectReadiness(s).ready,false);
});
test('stale delivered revision or wrong star count blocks capture', () => {
  for(const patch of [{lastCurrentRevision:{viewRevision:1,demandRevision:7}},{starCount:19}]) {
    const s=fixture();Object.assign(s.parts[0].snapshot.renderer,patch);
    assert.equal(inspectReadiness(s).ready,false);
  }
});
