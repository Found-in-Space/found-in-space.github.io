import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {journeys} from './journeys.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const website=path.resolve(here,'../..');
const require=createRequire(path.join(website,'package.json'));
const {createServer}=await import(require.resolve('vite'));
const pwPath=process.env.PLAYWRIGHT_MODULE ?? path.resolve(website,'../skykit-studio/node_modules/playwright/index.mjs');
const {chromium}=await import(pwPath);
const output=process.argv[2];
if(!output || !path.isAbsolute(output)) throw new Error('Usage: node tools/journey-rushes/render.mjs ABSOLUTE_OUTPUT [journey|all] [maxFrames]');
const ids=process.argv[3] && process.argv[3]!=='all' ? [process.argv[3]] : Object.keys(journeys);
const maxFrames=Number(process.argv[4])||Infinity;
const fps=12.5;
await fs.mkdir(output,{recursive:true});
const server=await createServer({configFile:false,root:website,cacheDir:'/tmp/fis-journey-vite-cache',optimizeDeps:{entries:['tools/journey-rushes/index.html']},server:{host:'127.0.0.1',port:5197,strictPort:true},logLevel:'warn'});
await server.listen();
let browser;
try {
 browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
 for(const id of ids) {
   if(!journeys[id]) throw new Error(`Unknown journey ${id}`);
   const dir=path.join(output,id); await fs.mkdir(dir,{recursive:true});
   const errors=[];
   const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
   page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
   page.on('console',m=>{if(m.type()==='error') console.error('BROWSER',m.text());});
   await page.goto('http://127.0.0.1:5197/tools/journey-rushes/index.html');
   await page.waitForFunction(()=>Boolean(window.rush));
   console.log(`START ${id}`);
   const info=await page.evaluate(id=>window.rush.init(id),id);
   const count=Math.min(maxFrames,Math.round(info.duration*fps));
   const video=path.join(dir,`${id}-rush-540p.mp4`);
   const ffmpeg=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','png','-i','pipe:0','-vf','fps=25,setsar=1','-an','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',video]);
   let fferr='';ffmpeg.stderr.on('data',x=>fferr+=x);ffmpeg.stdin.on('error',()=>{});
   const completion=once(ffmpeg,'close');
   const entries=[];const started=Date.now();
   let lastChapter='';
   try {
    for(let index=0;index<count;index++) {
      const frame=await page.evaluate(input=>window.rush.capture(input),{index,fps});
      const bytes=Buffer.from(frame.dataUrl.split(',')[1],'base64');delete frame.dataUrl;
      if(!ffmpeg.stdin.write(bytes)) await once(ffmpeg.stdin,'drain');
      entries.push(frame);
      if(frame.chapter!==lastChapter || index%125===0 || index===count-1) {
        console.log(`${id} ${index+1}/${count} ${frame.time.toFixed(2)}s ${frame.chapter} stars=${frame.readiness.stars[0].starCount} wait=${Math.round(frame.waitMs)}ms`);
        await fs.writeFile(path.join(dir,`review-${String(index).padStart(5,'0')}.png`),bytes);
        lastChapter=frame.chapter;
      }
      if(index%25===0) await fs.writeFile(path.join(dir,'progress.json'),JSON.stringify({id,index,count,elapsedMs:Date.now()-started,lastFrame:frame},null,2));
      if(errors.length) throw new Error(errors.join('\n'));
    }
    ffmpeg.stdin.end();
    const [code]=await completion;if(code!==0) throw new Error(fferr);
    const metadata={id,...info,captureFps:fps,outputFps:25,width:960,height:540,frameCount:count,outputDuration:count/fps,createdAt:new Date().toISOString(),renderMs:Date.now()-started,websiteCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:website,encoding:'utf8'}).trim(),readinessRule:'Forced demand at each view; provider current; renderer has delivered current view/demand revision; exact cell and star counts agree with provider; zero active/in-flight work; stable through two render-only passes.',chapters:journeys[id].chapters,frames:entries};
    await fs.writeFile(path.join(dir,'capture.json'),JSON.stringify(metadata,null,2));
    await fs.copyFile(path.join(website,`src/pages/learn/topic/${journeys[id].source}.astro`),path.join(dir,'original-lesson.astro.txt'));
    console.log(`DONE ${id}: ${video}`);
   } catch(error) {
    ffmpeg.stdin.end();await completion;
    await fs.writeFile(path.join(dir,'failed.json'),JSON.stringify({error:error.stack,frames:entries,fferr},null,2));throw error;
   } finally {await page.close();}
 }
} finally {await browser?.close();await server.close();}
