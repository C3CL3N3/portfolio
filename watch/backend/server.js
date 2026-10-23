import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const hash = token => createHash('sha256').update(token).digest();
export function createApp(options = {}) {
  const origin = options.origin ?? process.env.ORIGIN ?? 'http://localhost:3000';
  const ttl = options.ttl ?? Number(process.env.ROOM_TTL_MS ?? 1800000);
  const rooms = new Map(), connections = new Map();
  const maxRooms = Number(process.env.MAX_ROOMS ?? 100);
  const maxClients = Number(process.env.MAX_CLIENTS ?? 8);
  const headers = {'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; media-src blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'", 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
  const server = http.createServer(async (req,res) => {
    const files = {'/watch/':['index.html','text/html; charset=utf-8'],'/watch/app.js':['app.js','text/javascript; charset=utf-8'],'/watch/style.css':['style.css','text/css; charset=utf-8']};
    if(req.url === '/watch' && req.method === 'GET') { res.writeHead(308,{...headers,Location:'/watch/'}); return res.end(); }
    const file = files[req.url];
    if(req.method !== 'GET' || !file) { res.writeHead(404,headers); return res.end(); }
    try { const body = await readFile(new URL(`../${file[0]}`,import.meta.url)); res.writeHead(200,{...headers,'Content-Type':file[1]}); res.end(body); }
    catch {res.writeHead(500,headers);res.end('Unable to load page');}
  });
  const wss = new WebSocketServer({noServer:true,maxPayload:2048});
  server.on('upgrade',(req,socket,head)=>{
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    const bucket = connections.get(ip) ?? {start:now,count:0};
    if(now-bucket.start>60000){bucket.start=now;bucket.count=0;}
    bucket.count++; connections.set(ip,bucket);
    if(req.url !== '/watch/ws' || req.headers.origin !== origin || bucket.count>30 || wss.clients.size>=maxRooms*maxClients){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  const send = (ws,data) => { if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const participants = room => [...room.clients].map(c=>({id:c.id,ready:c.ready,duration:c.duration,buffering:c.buffering}));
  const snapshot = room => ({state:room.state,participants:participants(room),serverNowMs:Date.now()});
  const broadcast = (room,type) => { const payload={type,...snapshot(room)}; for(const c of room.clients)send(c,payload); };
  function leave(ws){ if(!ws.room)return; const room=ws.room;room.clients.delete(ws);room.lastActive=Date.now();ws.room=null;broadcast(room,'presence'); }
  wss.on('connection',ws=>{
    ws.id=randomBytes(8).toString('hex');ws.ready=false;ws.duration=null;ws.buffering=false;ws.alive=true;ws.events=new Set();ws.windowStart=Date.now();ws.count=0;
    ws.on('pong',()=>ws.alive=true);
    const fail=code=>send(ws,{type:'error',code});
    ws.on('message',(raw,isBinary)=>{
      if(isBinary)return ws.close(1003,'Text only');
      if(Date.now()-ws.windowStart>10000){ws.windowStart=Date.now();ws.count=0;}
      if(++ws.count>100)return ws.close(1008,'Rate limit');
      let m;try{m=JSON.parse(raw.toString());}catch{return fail('invalid_message');}
      if(!m || typeof m!=='object' || Array.isArray(m))return fail('invalid_message');
      const keys={create:['type'],join:['type','room','token'],ping:['type','nonce'],ready:['type','duration','buffering'],control:['type','action','positionSeconds','clientEventId','baseRevision']};
      if(!keys[m.type] || Object.keys(m).some(k=>!keys[m.type].includes(k)))return fail('invalid_message');
      if(m.type==='ping'){if(!Number.isFinite(m.nonce))return fail('invalid_message');return send(ws,{type:'pong',nonce:m.nonce,serverNowMs:Date.now()});}
      if(m.type==='create'){
        if(ws.room)return fail('already_joined');
        if(rooms.size>=maxRooms)return fail('room_limit');
        const id=randomBytes(16).toString('hex'),token=randomBytes(32).toString('base64url');
        const room={id,tokenHash:hash(token),clients:new Set(),lastActive:Date.now(),state:{playing:false,positionSeconds:0,playbackRate:1,updatedAtServerMs:Date.now(),revision:0}};
        rooms.set(id,room);ws.room=room;room.clients.add(ws);send(ws,{type:'created',room:id,token,selfId:ws.id,...snapshot(room)});return;
      }
      if(m.type==='join'){
        if(ws.room)return fail('already_joined');
        if(typeof m.room!=='string'||!/^[a-f0-9]{32}$/.test(m.room)||typeof m.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(m.token))return fail('invalid_invite');
        const room=rooms.get(m.room);
        if(!room || !timingSafeEqual(hash(m.token),room.tokenHash))return fail('invalid_invite');
        if(room.clients.size>=maxClients)return fail('room_full');
        ws.room=room;room.clients.add(ws);room.lastActive=Date.now();send(ws,{type:'joined',selfId:ws.id,...snapshot(room)});broadcast(room,'presence');return;
      }
      const room=ws.room;if(!room || !room.clients.has(ws))return fail('unauthorized');
      room.lastActive=Date.now();
      if(m.type==='ready'){
        if(!(m.duration===null || (Number.isFinite(m.duration)&&m.duration>0&&m.duration<=604800))||typeof m.buffering!=='boolean')return fail('invalid_metadata');
        ws.ready=m.duration!==null;ws.duration=m.duration;ws.buffering=m.buffering;broadcast(room,'presence');return;
      }
      if(m.type==='control'){
        if(!ws.ready)return fail('not_ready');
        if(!['play','pause','seek'].includes(m.action)||!Number.isFinite(m.positionSeconds)||m.positionSeconds<0||m.positionSeconds>ws.duration+1||typeof m.clientEventId!=='string'||!/^[\w-]{1,80}$/.test(m.clientEventId)||!Number.isSafeInteger(m.baseRevision)||m.baseRevision<0)return fail('invalid_control');
        if(ws.events.has(m.clientEventId))return send(ws,{type:'snapshot',...snapshot(room)});
        if(m.baseRevision!==room.state.revision){send(ws,{type:'snapshot',...snapshot(room)});return fail('stale_revision');}
        ws.events.add(m.clientEventId);if(ws.events.size>200)ws.events.delete(ws.events.values().next().value);
        room.state={playing:m.action==='seek'?room.state.playing:m.action==='play',positionSeconds:Math.min(m.positionSeconds,ws.duration),playbackRate:1,updatedAtServerMs:Date.now(),revision:room.state.revision+1};
        broadcast(room,'state');
      }
    });
    ws.on('close',()=>leave(ws));ws.on('error',()=>{});
  });
  const timer=setInterval(()=>{
    const now=Date.now();for(const [id,room] of rooms)if(!room.clients.size&&now-room.lastActive>ttl)rooms.delete(id);
    for(const [ip,bucket] of connections)if(now-bucket.start>60000)connections.delete(ip);
    for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();if(ws.room)send(ws,{type:'snapshot',...snapshot(ws.room)});}
  },15000);timer.unref();
  return {server,rooms,close:()=>new Promise(resolve=>{clearInterval(timer);for(const ws of wss.clients)ws.terminate();wss.close();server.close(resolve);})};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  if(process.env.NODE_ENV==='production' && !process.env.ORIGIN?.startsWith('https://'))throw new Error('Production requires an HTTPS ORIGIN');
  const app=createApp();app.server.listen(Number(process.env.PORT??3000),'127.0.0.1',()=>console.log('Watch Together listening on localhost'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
