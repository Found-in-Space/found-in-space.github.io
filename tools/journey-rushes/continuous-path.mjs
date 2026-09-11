import { computeSpatialLookAtOrientation } from '@found-in-space/spatial';
import { Quaternion } from 'three';
import { journeys } from './journeys.mjs';

const NORTH = {x:0,y:0,z:1};
const SUN = {x:0,y:0,z:0};
const TAU = {x:3.154460107907653,y:1.5391502529382706,z:-1.002060948};
const KEID = {x:2.1804124116897583,y:4.432736895978451,z:-0.665108382};
const HYADES = {x:17.574,y:42.316,z:13.963};
const PLEIADES = {x:67.379,y:103.162,z:55.161};
const NGC752 = {x:303.7,y:167,z:269.3};
const OMEGA = {x:-3290.566,y:-1309.263,z:-3862.073};
export const MAX_ANGULAR_SPEED_DEG = 24;
const roundFrame = seconds => Math.ceil((seconds - 1e-9)*25)/25;
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const scale=(a,s)=>({x:a.x*s,y:a.y*s,z:a.z*s});
const length=a=>Math.hypot(a.x,a.y,a.z);
const unit=a=>scale(a,1/(length(a)||1));
const rotate=(v,angle)=>({x:v.x*Math.cos(angle)-v.y*Math.sin(angle),y:v.x*Math.sin(angle)+v.y*Math.cos(angle),z:v.z});
const quat=q=>new Quaternion(q.x,q.y,q.z,q.w);
const jsonQuat=q=>({x:q.x,y:q.y,z:q.z,w:q.w});
export const angularDistance = (a,b) => quat(a).angleTo(quat(b))*180/Math.PI;
export const distance = (a,b) => length(sub(a,b));
// Zero velocity AND acceleration at both ends: adjacent moves join at C2.
const ease=u=>u*u*u*(10+u*(-15+6*u));
const easeDerivative=u=>30*u*u*(1-u)*(1-u);

function pose(position,target) {
  const orientation=computeSpatialLookAtOrientation({position,target,up:NORTH});
  if(!orientation) throw new Error('Camera cannot occupy its look target');
  return {position,orientation,target};
}

function specs(id) {
  if(id==='radio-bubble') return [
    {center:SUN,radius:.25}, {center:SUN,radius:120.4,travel:10},
    {center:SUN,radius:350}, {center:HYADES,radius:15}, {center:SUN,radius:1},
  ];
  if(id==='astrophage') return [
    {center:SUN,radius:2}, {at:SUN,look:TAU}, {center:TAU,radius:1},
    {center:TAU,radius:5}, {center:{x:-1,y:2,z:-.5},radius:6},
    {center:{x:-.8,y:.8,z:.2},radius:11.5}, {center:KEID,radius:.5,look:SUN},
  ];
  if(id==='star-clusters') return [
    {center:SUN,radius:8}, {center:{x:44.371,y:409.774,z:-38.889},radius:100},
    {center:{x:-60.596,y:-118.925,z:-56.656},radius:50},
    {center:PLEIADES,radius:25}, {center:HYADES,radius:15},
    {center:OMEGA,radius:200,travel:14}, {center:SUN,radius:8,travel:15},
  ];
  if(id==='hr-diagram') return [
    {at:SUN,look:{x:-44.4,y:-5.2,z:-88}}, {at:SUN,look:{x:-44.4,y:-5.2,z:-88}},
    {at:SUN,look:{x:-8.8,y:-5.9,z:3.7}}, {at:SUN,look:{x:-8.8,y:-5.9,z:3.7}},
    {at:{x:200,y:0,z:0},look:SUN}, {center:PLEIADES,radius:10},
    {center:NGC752,radius:10}, {center:OMEGA,radius:60,travel:19},
  ];
  throw new Error(`No continuous route for ${id}`);
}

export function createContinuousJourney(id) {
  const source=journeys[id], destinations=specs(id), knots=[], chapters=[];
  let time=0;
  const initial=destinations[0];
  let current=initial.at ? pose(initial.at,initial.look)
    : pose(add(initial.center,{x:initial.radius,y:0,z:initial.radius*.15}),initial.look??initial.center);
  knots.push({time:0,...current});
  function append(next,requestedSeconds) {
    // Quintic interpolation peaks at 1.875 times its average angular speed.
    const seconds=roundFrame(Math.max(requestedSeconds,1.875*angularDistance(current.orientation,next.orientation)/MAX_ANGULAR_SPEED_DEG));
    time=roundFrame(time+seconds);knots.push({time,...next});current=next;
  }
  for(let i=0;i<source.chapters.length;i++) {
    const original=source.chapters[i], spec=destinations[i], start=time;
    let arrival=time;
    if(i>0) {
      let position=spec.at;
      if(!position) position=add(spec.center,scale(unit(sub(current.position,spec.center)),spec.radius));
      const destination=pose(position,spec.look??spec.center);
      append(destination,spec.travel??Math.max(5,original.seconds-3));
      arrival=time;
    }
    const dwell=i===0?original.seconds:Math.max(3,original.seconds-(spec.travel??(original.seconds-3)));
    const next=spec.at ? current : pose(add(spec.center,rotate(sub(current.position,spec.center),.22)),spec.look??spec.center);
    append(next,dwell);
    chapters.push({...original,start,arrival,end:time,seconds:time-start});
  }
  const journey={...source,chapters,duration:time};
  function evaluate(sceneTime) {
    const t=Math.max(0,Math.min(time,sceneTime));
    let i=knots.findIndex((k,index)=>index<knots.length-1 && t<=knots[index+1].time);
    if(i<0)i=knots.length-2;
    const a=knots[i],b=knots[i+1],duration=b.time-a.time;
    const u=Math.max(0,Math.min(1,(t-a.time)/duration)),s=ease(u);
    const delta=sub(b.position,a.position);
    const position=add(a.position,scale(delta,s));
    const orientation=jsonQuat(new Quaternion().slerpQuaternions(quat(a.orientation),quat(b.orientation),s));
    const velocity=scale(delta,easeDerivative(u)/duration);
    return {observerPc:position,orientationIcrs:orientation,
      targetPc:add(a.target,scale(sub(b.target,a.target),s)),velocityPcPerSec:velocity,
      segment:i,time:t};
  }
  return {journey,knots,evaluate};
}

export function auditContinuousJourney(plan,fps=25) {
  let maxStepDeg=0,maxStepPc=0,previous=plan.evaluate(0);
  const count=Math.round(plan.journey.duration*fps);
  for(let i=1;i<=count;i++) {
    const sample=plan.evaluate(i/fps);
    maxStepDeg=Math.max(maxStepDeg,angularDistance(previous.orientationIcrs,sample.orientationIcrs));
    maxStepPc=Math.max(maxStepPc,distance(previous.observerPc,sample.observerPc));
    previous=sample;
  }
  if(maxStepDeg>MAX_ANGULAR_SPEED_DEG/fps+.001) throw new Error(`Camera turn exceeds motion limit: ${maxStepDeg}`);
  return {continuous:true,fps,maxAngularStepDegrees:maxStepDeg,maxPositionStepPc:maxStepPc,
    maxAngularSpeedLimitDegreesPerSecond:MAX_ANGULAR_SPEED_DEG,knots:plan.knots};
}
