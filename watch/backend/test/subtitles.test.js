import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../app.js',import.meta.url),'utf8');
function harness(){
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',replaceChildren(...options){this.options=options;}});return elements.get(id);};
 const tracks=[];tracks.addEventListener=()=>{};
 let revoked=0,blobs=0;
 const video={textTracks:tracks,append(element){tracks.push(element.track);queueMicrotask(()=>element.onload());}};
 const context=vm.createContext({video,$:get,ready:true,Blob,URL:{createObjectURL(){return `blob:${++blobs}`;},revokeObjectURL(){revoked++;}},Option:class{constructor(label,value){this.label=label;this.value=value;}},document:{createElement(){const track={kind:'subtitles',mode:'disabled',cues:[{}]};return {track,set label(v){track.label=v;},remove(){const i=tracks.indexOf(track);if(i>=0)tracks.splice(i,1);}};}}});
 vm.runInContext(source.slice(source.indexOf('let subtitleURL,'),source.lastIndexOf('connect();')),context);
 return {context,get,tracks,revoked:()=>revoked};
}
test('subtitle conversion preserves VTT and converts multiline CRLF/BOM SRT timestamps',()=>{const {context}=harness();const convert=text=>vm.runInContext(`subtitleVtt(${JSON.stringify(text)})`,context);assert.equal(convert('\uFEFFWEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nHello'),'WEBVTT\n\n00:01.000 --> 00:02.000\nHello');assert.equal(convert('1\r\n00:00:01,250 --> 00:00:03,500\r\nHello\r\nworld\r\n'),'WEBVTT\n\n1\n00:00:01.250 --> 00:00:03.500\nHello\nworld\n');assert.throws(()=>convert('not subtitles'),/valid WebVTT/);});
test('track menu selects a single embedded track and Off disables all',()=>{const {context,get,tracks}=harness();tracks.push({kind:'subtitles',label:'English',mode:'disabled'},{kind:'captions',label:'French',mode:'showing'},{kind:'metadata',mode:'hidden'});vm.runInContext('refreshSubtitles()',context);assert.equal(get('subtitles').value,'1');get('subtitles').value='0';get('subtitles').onchange();assert.equal(tracks[0].mode,'showing');assert.equal(tracks[1].mode,'disabled');get('subtitles').value='off';get('subtitles').onchange();assert.equal(tracks[0].mode,'disabled');assert.equal(tracks[2].mode,'hidden');});
test('local subtitle replacement revokes URLs; video replacement cancels pending reads',async()=>{const {context,get,tracks,revoked}=harness();const pick=text=>get('subtitle-file').onchange({target:{files:[{name:'local.srt',size:60,text:async()=>text}]}});await pick('1\n00:00:01,000 --> 00:00:02,000\nHello');assert.equal(tracks.length,1);assert.equal(tracks[0].mode,'showing');await pick('WEBVTT\n\n00:01.000 --> 00:02.000\nHi');assert.equal(tracks.length,1);assert.equal(revoked(),1);let finish;const pending=get('subtitle-file').onchange({target:{files:[{name:'old.vtt',size:10,text:()=>new Promise(r=>finish=r)}]}});vm.runInContext('clearLocalSubtitles()',context);finish('WEBVTT\n');await pending;assert.equal(tracks.length,0);assert.equal(revoked(),2);});
