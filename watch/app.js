const $ = id => document.getElementById(id);
const video=$('video');
let socket, invite, selfId, state, offset=0, reconnect=0, timer, objectURL, applying=0, ready=false, joined=false, eventCounter=0, settlingUntil=0;
try { const parts=new URLSearchParams(location.hash.slice(1));if(parts.has('room')&&parts.has('token'))invite={room:parts.get('room'),token:parts.get('token')}; } catch {}
const message = text => {$('message').textContent=text;$('message').hidden=!text;};
function send(m){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m));}
function ping(){send({type:'ping',nonce:Date.now()});}
function connect(){
  clearTimeout(timer);$('connection').textContent='Connecting…';
  socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/watch/ws`);
  socket.onopen=()=>{reconnect=0;$('connection').textContent='Connected';$('create').disabled=false;ping();if(invite)send({type:'join',...invite});};
  socket.onmessage=async event=>{
    const m=JSON.parse(event.data);
    if(m.type==='pong'){const rtt=Date.now()-m.nonce;if(rtt>=0&&rtt<5000)offset=m.serverNowMs+rtt/2-Date.now();return;}
    if(m.type==='error'){const errors={invalid_invite:'This invitation is invalid or the room has expired. Create a new room.',room_full:'This room is full.',room_limit:'The server is full. Try again later.',not_ready:'Choose a playable local video first.',stale_revision:'Another control arrived first; playback has been refreshed.'};message(errors[m.code]??`Room request failed: ${m.code}`);return;}
    if(m.type==='created'){invite={room:m.room,token:m.token};location.hash=new URLSearchParams(invite).toString();}
    if(m.type==='created'||m.type==='joined'){selfId=m.selfId;joined=true;$('lobby').hidden=true;$('room').hidden=false;$('room-name').textContent=`Room ${invite.room.slice(0,6)}`;message('');reportReady();}
    if(m.state && (!state||m.state.revision>=state.revision)){state=m.state;if(m.type!=='presence')await align(true);}
    if(m.participants)renderPeople(m.participants);
  };
  socket.onclose=()=>{joined=false;$('create').disabled=true;$('connection').textContent='Disconnected · reconnecting';message('Connection lost. Playback will realign when you reconnect.');timer=setTimeout(connect,Math.min(30000,1000*2**reconnect++)+Math.random()*500);};
  socket.onerror=()=>socket.close();
}
function renderPeople(people){$('count').textContent=people.length;$('participants').replaceChildren(...people.map((p,i)=>{const li=document.createElement('li'),status=document.createElement('span');li.append(document.createTextNode(p.id===selfId?'You':`Viewer ${i+1}`));status.textContent=p.buffering?'Buffering…':p.ready?'Ready':'Choosing a video';li.append(status);return li;}));const durations=people.filter(p=>p.ready).map(p=>p.duration);$('mismatch').hidden=durations.length<2||Math.max(...durations)-Math.min(...durations)<1;}
function target(){return Math.max(0,Math.min(video.duration||Infinity,state.positionSeconds+(state.playing?(Date.now()+offset-state.updatedAtServerMs)/1000:0)));}
async function align(force=false){
  if(!state||!ready||!joined||video.seeking||applying)return;
  applying++;settlingUntil=performance.now()+700;
  try{
    const drift=target()-video.currentTime;
    if(Math.abs(drift)>.5 || (force&&Math.abs(drift)>.12))video.currentTime=target();
    video.playbackRate=state.playing&&Math.abs(drift)>.15&&Math.abs(drift)<=.5?(drift>0?1.03:.97):1;
    if(state.playing&&video.currentTime<video.duration-.1){try{await video.play();$('enable').hidden=true;}catch{$('enable').hidden=false;message('Your browser needs a click to enable playback.');}}
    else if(!video.paused)video.pause();
  }finally{applying--;}
}
function control(action){if(applying||performance.now()<settlingUntil||!joined||!ready||!state)return;send({type:'control',action,positionSeconds:video.currentTime,clientEventId:`${selfId}-${++eventCounter}`,baseRevision:state.revision});}
function reportReady(buffering=false){if(joined)send({type:'ready',duration:ready?video.duration:null,buffering});}
$('create').onclick=()=>send({type:'create'});
$('join-form').onsubmit=e=>{e.preventDefault();try{const url=new URL($('invite').value);if(url.origin!==location.origin||!/^\/watch\/?$/.test(url.pathname))throw Error();const params=new URLSearchParams(url.hash.slice(1));if(!/^[a-f0-9]{32}$/.test(params.get('room'))||!/^[A-Za-z0-9_-]{43}$/.test(params.get('token')))throw Error();location.hash=params.toString();invite={room:params.get('room'),token:params.get('token')};send({type:'join',...invite});}catch{message('Paste a complete Watch Together invitation from this website.');}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('copy').textContent='Invitation copied ✓';setTimeout(()=>$('copy').textContent='Copy invitation ↗',2000);}catch{message('Copy the invitation from your browser’s address bar.');}};
$('enable').onclick=async()=>{try{applying++;await video.play();$('enable').hidden=true;message('');}catch{message('Unable to play this file. Try an MP4 with H.264 video and AAC audio.');}finally{applying--;align(true);}};
function load(file){if(!file)return;clearLocalSubtitles();ready=false;applying++;settlingUntil=performance.now()+1000;video.pause();if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(file);video.src=objectURL;video.load();applying--;$('file-name').textContent=file.name;$('dropzone').hidden=true;message('');reportReady();}
$('file').onchange=e=>load(e.target.files[0]);
$('dropzone').ondragover=e=>e.preventDefault();$('dropzone').ondrop=e=>{e.preventDefault();load(e.dataTransfer.files[0]);};
video.onloadedmetadata=()=>{if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>604800){message('This video has an unsupported duration.');return;}ready=true;reportReady();refreshSubtitles();align(true);};
video.onerror=()=>{ready=false;reportReady();$('dropzone').hidden=false;message('Unable to load this video. Try an MP4 with H.264 video and AAC audio.');};
video.onplay=()=>control('play');video.onpause=()=>{if(!video.ended)control('pause');};video.onseeked=()=>control('seek');video.onended=()=>control('pause');
video.onwaiting=()=>reportReady(true);video.onstalled=()=>reportReady(true);video.onplaying=()=>reportReady(false);video.oncanplay=()=>{reportReady(false);align(true);};
setInterval(()=>{ping();align();},3000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){ping();align(true);}});
window.addEventListener('pagehide',()=>{if(objectURL)URL.revokeObjectURL(objectURL);clearLocalSubtitles();socket?.close();});
let subtitleURL, subtitleElement, subtitleGeneration=0;
function subtitleTracks(){return Array.from(video.textTracks).filter(t=>t.kind==='subtitles'||t.kind==='captions');}
function refreshSubtitles(){
  const tracks=subtitleTracks();
  const options=[new Option('Off','off'),...tracks.map((t,i)=>new Option(t.label||t.language||`Track ${i+1}`,String(i)))];
  $('subtitles').replaceChildren(...options);
  const showing=tracks.findIndex(t=>t.mode==='showing');
  $('subtitles').value=showing<0?'off':String(showing);
  $('subtitle-status').textContent=tracks.length?'Select a subtitle track or Off. Your choice stays on this device.':ready?'No embedded subtitle tracks are exposed by this browser. Try Safari or add a local .vtt / .srt file.':'Choose a video to look for embedded subtitles. Subtitle choices are yours only.';
}
$('subtitles').onchange=()=>{const selected=$('subtitles').value;subtitleTracks().forEach((t,i)=>t.mode=String(i)===selected?'showing':'disabled');};
for(const event of ['addtrack','removetrack','change'])video.textTracks.addEventListener(event,refreshSubtitles);
function clearLocalSubtitles(){
  subtitleGeneration++;
  if(subtitleElement){subtitleElement.remove();subtitleElement=null;}
  if(subtitleURL){URL.revokeObjectURL(subtitleURL);subtitleURL=null;}
  $('subtitle-file').value='';
}
function subtitleVtt(text){
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if(/^WEBVTT(?:[ \t]|\n|$)/.test(text))return text;
  let cues=0;
  const converted=text.replace(/^(\d{2,}:\d{2}:\d{2}),(\d{3})[ \t]+-->[ \t]+(\d{2,}:\d{2}:\d{2}),(\d{3})([^\n]*)$/gm,(_,a,b,c,d,settings)=>{cues++;return `${a}.${b} --> ${c}.${d}${settings}`;});
  if(!cues)throw Error('Choose a valid WebVTT (.vtt) or SubRip (.srt) subtitle file.');
  return 'WEBVTT\n\n'+converted;
}
$('subtitle-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  if(!ready){$('subtitle-status').textContent='Choose a playable video first.';e.target.value='';return;}
  if(file.size>5*1024*1024){$('subtitle-status').textContent='Choose a subtitle file smaller than 5 MB.';e.target.value='';return;}
  const generation=++subtitleGeneration;
  try{
    const text=subtitleVtt(await file.text());
    if(generation!==subtitleGeneration)return;
    clearLocalSubtitles();
    subtitleURL=URL.createObjectURL(new Blob([text],{type:'text/vtt'}));
    const element=document.createElement('track');subtitleElement=element;
    element.kind='subtitles';element.label=file.name;element.src=subtitleURL;
    element.onload=()=>{if(subtitleElement!==element)return;subtitleTracks().forEach(t=>t.mode=t===element.track?'showing':'disabled');refreshSubtitles();if(!element.track.cues?.length)$('subtitle-status').textContent='No subtitle cues could be read. Check the file format and UTF-8 encoding.';};
    element.onerror=()=>{if(subtitleElement===element)$('subtitle-status').textContent='Unable to read these subtitles. Check the WebVTT/SRT format and UTF-8 encoding.';};
    $('subtitle-status').textContent='Loading local subtitles…';
    video.append(element);element.track.mode='hidden';
  }catch(error){if(generation===subtitleGeneration)$('subtitle-status').textContent=error.message;}
};
connect();
