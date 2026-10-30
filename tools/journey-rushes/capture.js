import { mountRadioBubbleViewer } from '/src/scripts/radio-bubble-viewer.js';
import { mountAstrophageViewer } from '/src/scripts/astrophage-viewer.js';
import { mountClusterTourViewer } from '/src/scripts/cluster-tour-viewer.js';
import { mountHrDiagramViewer } from '/src/scripts/hr-diagram-viewer.js';
import { waitForStarsReady } from './readiness.mjs';
import { createContinuousJourney, auditContinuousJourney, distance, angularDistance } from './continuous-path.mjs';

const out=document.querySelector('#output');
const ctx=out.getContext('2d');
const root=document.querySelector('#root');
const mount=document.querySelector('#view');
let app, journey, plan, active=-1, arrivalApplied=false, time=0, frameIndex=-1, timeline=null, previousPose=null;
const delay=ms=>new Promise(r=>setTimeout(r,ms));

window.rush = {
  async init(id) {
    plan=createContinuousJourney(id); journey=plan.journey;
    const options={autoStart:false,capture:true,currentDateMs:Date.UTC(2026,8,11,12),onTimelineDateChange:s=>timeline=s};
    if(id==='radio-bubble') app=await mountRadioBubbleViewer(mount,options);
    if(id==='astrophage') app=await mountAstrophageViewer(mount,options);
    if(id==='star-clusters') app=await mountClusterTourViewer(mount,options);
    if(id==='hr-diagram') app=await mountHrDiagramViewer(root,options);
    for (const chapter of journey.chapters) composite(chapter);
    return {duration:journey.duration, title:journey.title,chapters:journey.chapters,motionAudit:auditContinuousJourney(plan)};
  },
  status() {return {time,frameIndex,view:app?.viewer.getViewState(),snapshot:app?.viewer.getSnapshot()};},
  async capture({index,fps=25,timeoutMs=180000}) {
    if(index!==frameIndex+1) throw new Error('Capture requires sequential fixed-time frames');
    time=index/fps;
    const ch=journey.chapters.findIndex(c=>time>=c.start && time<c.end);
    if(ch<0) throw new Error('Frame is outside journey');
    const chapter=journey.chapters[ch];
    if(ch!==active) {
      await app.setCaptureScene?.(chapter.id);
      active=ch;arrivalApplied=false;
    }
    if(journey.source==='hr-diagram' && chapter.id==='omega-cen' && time>=chapter.arrival && !arrivalApplied) {
      await app.setCaptureScene(chapter.id,{arrival:true});arrivalApplied=true;
    }
    if(app.setCaptureProgress) {
      const growth=journey.chapters.find(c=>c.id==='marconi');
      const u=Math.max(0,Math.min(1,(time-growth.start)/(growth.arrival-growth.start)));
      app.setCaptureProgress(u*u*u*(10+u*(-15+6*u)));
    }
    const expected=plan.evaluate(time);
    // The camera track is the only owner of pose. Chapter effects never issue
    // interactive goTo/lockAt/orbit commands during offline capture.
    app.viewer.requestViewState({observerPc:expected.observerPc,
      orientationIcrs:expected.orientationIcrs,targetPc:expected.targetPc},'journey.continuous-pose');
    app.viewer.frame(index===0?0:1/fps);
    await delay(0);
    const actual=app.viewer.getViewState();
    const positionError=distance(actual.observerPc,expected.observerPc);
    const orientationError=angularDistance(actual.orientationIcrs,expected.orientationIcrs);
    if(positionError>1e-7 || orientationError>.0001) throw new Error(`Camera left authored path at ${time}s: ${positionError}pc / ${orientationError}deg`);
    const angularStep=previousPose?angularDistance(previousPose.orientationIcrs,actual.orientationIcrs):0;
    if(angularStep>24/fps+.001) throw new Error(`Camera jump at ${time}s: ${angularStep}deg`);
    previousPose=actual;
    const {readiness: ready,waitMs}=await waitForStarsReady(app.viewer,{timeoutMs});
    app.viewer.render();
    composite(journey.chapters[ch]);
    frameIndex=index;
    return {dataUrl:out.toDataURL('image/png'),time,index,chapter:journey.chapters[ch].id,
      waitMs,readiness:ready,view:app.viewer.getViewState(),path:{segment:expected.segment,kind:expected.kind,orbitProgress:expected.orbitProgress??null},motion:{positionError,orientationError,angularStep},
      hr:app.getState?.() ?? null};
  },
};

function lines(text,font,width) {
  ctx.font=font; const result=[]; let line='';
  for(const word of text.split(/\s+/)) {
    const next=line ? `${line} ${word}` : word;
    if(ctx.measureText(next).width>width && line) {result.push(line);line=word;} else line=next;
  }
  if(line) result.push(line);return result;
}
function drawText(text,x,y,font,width,lineHeight,color) {
  const ls=lines(text,font,width);ctx.font=font;ctx.fillStyle=color;ctx.textBaseline='top';
  for(const l of ls) {ctx.fillText(l,x,y);y+=lineHeight;} return y;
}
function composite(chapter) {
  ctx.fillStyle='#000';ctx.fillRect(0,0,960,540);
  // Include the independent touch-os canvas used for the live HR diagram.
  const base=root.getBoundingClientRect();
  for(const canvas of root.querySelectorAll('canvas')) {
    const b=canvas.getBoundingClientRect();
    if(b.width && b.height) ctx.drawImage(canvas,310+b.left-base.left,b.top-base.top,b.width,b.height);
  }
  drawCaptureLabels();
  ctx.fillStyle='#000';ctx.fillRect(0,0,310,540);
  ctx.fillStyle='#d8b36a';ctx.fillRect(28,34,34,3);
  drawText('FOUND IN SPACE',28,51,'600 12px Avenir, sans-serif',254,16,'#d8b36a');
  drawText(journey.title,28,76,'500 14px Avenir, sans-serif',254,19,'#b9bec9');
  let y=146;
  y=drawText(chapter.title,28,y,'600 29px Avenir, sans-serif',254,33,'#fff');
  y=drawText(chapter.body,28,y+22,'400 19px Avenir, sans-serif',254,26,'#d8dce5');
  if(y>460) throw new Error(`Text overflows safe area: ${chapter.id} (${y}px)`);
  drawText(chapter.eyebrow,28,466,'500 12px Avenir, sans-serif',254,16,'#d8b36a');
  drawText(journey.note ?? 'foundin.space · journey rush',28,514,'400 10px Avenir, sans-serif',254,12,'#8a919d');
  ctx.fillStyle='#353942';ctx.fillRect(310,0,1,540);
  ctx.fillStyle='#d8b36a';ctx.fillRect(310,538,650*(time/journey.duration),2);
  if(timeline) {
    ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(334,24,166,31);
    drawText(timeline,345,32,'500 15px Avenir, sans-serif',160,18,'#fff');
  }
}

function drawCaptureLabels() {
  const placed=[];
  ctx.font='600 14px Avenir, sans-serif';
  for (const label of app?.getCaptureLabels?.() ?? []) {
    const [nx,ny,nz]=label.position;
    if(nz < -1 || nz > 1 || Math.abs(nx)>1 || Math.abs(ny)>1) continue;
    const px=310+(nx+1)*325, py=(1-ny)*270;
    const w=ctx.measureText(label.text).width+12;
    const x=Math.min(950-w,Math.max(320,px-w/2));
    let y=Math.max(10,Math.min(505,py-28));
    for(let attempt=0;attempt<18;attempt++) {
      if(!placed.some(r=>x<r.x+r.w+5 && x+w>r.x-5 && y<r.y+25 && y+22>r.y-3)) break;
      y=10+((y+25-10)%495);
    }
    placed.push({x,y,w});
    ctx.strokeStyle='rgba(237,206,148,.65)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x+w/2,y+20);ctx.stroke();
    ctx.fillStyle='rgba(0,0,0,.82)';ctx.fillRect(x,y,w,21);
    drawText(label.text,x+6,y+3,'600 14px Avenir, sans-serif',w,17,'#ecd097');
  }
}
