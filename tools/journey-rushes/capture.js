import { mountRadioBubbleViewer } from '/src/scripts/radio-bubble-viewer.js';
import { mountAstrophageViewer } from '/src/scripts/astrophage-viewer.js';
import { mountClusterTourViewer } from '/src/scripts/cluster-tour-viewer.js';
import { mountHrDiagramViewer } from '/src/scripts/hr-diagram-viewer.js';
import { waitForStarsReady } from './readiness.mjs';
import { journeys } from './journeys.mjs';

const out=document.querySelector('#output');
const ctx=out.getContext('2d');
const root=document.querySelector('#root');
const mount=document.querySelector('#view');
let app, journey, active=-1, time=0, frameIndex=-1, timeline=null;
const delay=ms=>new Promise(r=>setTimeout(r,ms));

window.rush = {
  async init(id) {
    journey=journeys[id]; if(!journey) throw new Error(`Unknown journey ${id}`);
    const options={autoStart:false,capture:true,currentDateMs:Date.UTC(2026,8,11,12),onTimelineDateChange:s=>timeline=s};
    if(id==='radio-bubble') app=await mountRadioBubbleViewer(mount,options);
    if(id==='astrophage') app=await mountAstrophageViewer(mount,options);
    if(id==='star-clusters') app=await mountClusterTourViewer(mount,options);
    if(id==='hr-diagram') app=await mountHrDiagramViewer(root,options);
    for (const chapter of journey.chapters) composite(chapter);
    return {duration:journey.duration, title:journey.title};
  },
  status() {return {time,frameIndex,view:app?.viewer.getViewState(),snapshot:app?.viewer.getSnapshot()};},
  async capture({index,fps=12.5,timeoutMs=180000}) {
    if(index!==frameIndex+1) throw new Error('Capture requires sequential fixed-time frames');
    time=index/fps;
    const ch=journey.chapters.findIndex(c=>time>=c.start && time<c.end);
    if(ch<0) throw new Error('Frame is outside journey');
    // Bring the previous chapter to the exact boundary before activating the next.
    if(index>0) app.viewer.frame(1/fps);
    if(ch!==active) {await app.goTo(journey.chapters[ch].id); active=ch;}
    // Flush pending navigation/view patches without advancing simulation time.
    app.viewer.frame(0);
    await delay(0);
    app.viewer.frame(0);
    const {readiness: ready,waitMs}=await waitForStarsReady(app.viewer,{timeoutMs});
    app.viewer.render();
    composite(journey.chapters[ch]);
    frameIndex=index;
    return {dataUrl:out.toDataURL('image/png'),time,index,chapter:journey.chapters[ch].id,
      waitMs,readiness:ready,view:app.viewer.getViewState(),
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
