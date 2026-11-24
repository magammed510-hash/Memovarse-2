// Сервери оддӣ (бе китобхонаи иловагӣ). Оғоз: node server.js  →  http://localhost:3000
// Логин ва рамзро тағйир додан: ADMIN_USER=... ADMIN_PASS=... node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=__dirname,DB=path.join(ROOT,'data','episodes.json'),PORT=process.env.PORT||3000;
const USER=process.env.ADMIN_USER||'Safar2010',PASS=process.env.ADMIN_PASS||'C.M.O';
const tokens=new Set(),fails={};
const ALLOW={'':['era'],era:['book'],miniarcs:['miniarc']};
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const DEF=[{id:'era1',title:'Era 1',type:'era',parent:''},{id:'book1',title:'Book 1',type:'book',parent:'era1'},{id:'miniarcs',title:'Mini-Arcs',type:'miniarcs',parent:'era1'},{id:'mini1',title:'Mini-Arc 1',type:'miniarc',parent:'miniarcs'},{id:'mini2',title:'Mini-Arc 2',type:'miniarc',parent:'miniarcs'}];
const load=()=>{let d=JSON.parse(fs.readFileSync(DB,'utf8'));if(Array.isArray(d))d={sections:DEF,episodes:d.map(e=>({sec:'book1',...e}))};d.sections=d.sections.map(z=>z.id==='miniarks'?{...z,title:'Mini-Arcs',type:'miniarcs'}:z);return d};
const save=d=>fs.writeFileSync(DB,JSON.stringify(d,null,1));
const send=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
const eq=(a,b)=>{const x=crypto.createHash('sha256').update(String(a)).digest(),y=crypto.createHash('sha256').update(String(b)).digest();return crypto.timingSafeEqual(x,y)};
const body=req=>new Promise((ok,no)=>{const b=[];let n=0;req.on('data',c=>{n+=c.length;if(n>80e6){no(new Error('big'));req.destroy()}else b.push(c)});req.on('end',()=>{try{ok(JSON.parse(Buffer.concat(b).toString()||'{}'))}catch(e){no(e)}})});
const authed=req=>tokens.has((req.headers.authorization||'').replace('Bearer ',''));
const img64=(d,base)=>{const m=/^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(d||'');if(!m)throw new Error('bad image');const ext=m[1]==='jpeg'?'jpg':m[1];fs.writeFileSync(base+'.'+ext,Buffer.from(m[2],'base64'));return ext};
http.createServer(async(req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  try{
    if(p==='/api/ping')return send(res,200,{ok:1});
    if(p==='/api/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress,f=fails[ip]||{n:0,t:0};
      if(f.n>=5&&Date.now()-f.t<6e5)return send(res,429,{error:'Хеле зиёд кӯшиш. 10 дақиқа сабр кунед.'});
      const b=await body(req);
      if(eq(b.name,USER)&&eq(b.password,PASS)){delete fails[ip];const t=crypto.randomBytes(24).toString('hex');tokens.add(t);return send(res,200,{token:t})}
      fails[ip]={n:f.n+1,t:Date.now()};return send(res,401,{error:'bad'});
    }
    if(p==='/api/episodes'&&req.method==='POST'){
      if(!authed(req))return send(res,401,{error:'auth'});
      const b=await body(req);
      if(!b.name||!Array.isArray(b.pages)||!b.pages.length||b.pages.length>80)return send(res,400,{error:'bad'});
      const D=load(),db=D.episodes,n=Math.max(0,...db.map(e=>e.n))+1,id='ep'+n,dir=path.join(ROOT,'images',id);
      fs.mkdirSync(dir,{recursive:true});
      const imgs=b.pages.map((d,i)=>`images/${id}/${i+1}.`+img64(d,path.join(dir,String(i+1))));
      const cover=b.cover?`images/${id}/cover.`+img64(b.cover,path.join(dir,'cover')):'';
      const ep={id,n,sec:D.sections.some(s=>s.id===b.sec)?b.sec:(D.sections[0]||{}).id,name:String(b.name).slice(0,120),desc:String(b.desc||'').slice(0,3000),status:'Давом дорад',tags:(b.tags||[]).slice(0,6).map(t=>String(t).slice(0,30)),cover,imgs};
      db.push(ep);save(D);return send(res,200,ep);
    }
    if(p==='/api/sections'&&req.method==='POST'){
      if(!authed(req))return send(res,401,{error:'auth'});
      const b=await body(req),D=load(),title=String(b.title||'').trim().slice(0,80),parent=String(b.parent||''),pt=parent?(D.sections.find(s=>s.id===parent)||{}).type:'';
      if(!title||pt===undefined||!(ALLOW[pt]||[]).includes(b.type))return send(res,400,{error:'bad'});
      const id='s'+Date.now().toString(36),sec={id,title,type:b.type,parent};
      if(b.cover){fs.mkdirSync(path.join(ROOT,'images',id),{recursive:true});sec.cover=`images/${id}/cover.`+img64(b.cover,path.join(ROOT,'images',id,'cover'))}
      D.sections.push(sec);if(b.type==='era')D.sections.push({id:id+'m',title:'Mini-Arcs',type:'miniarcs',parent:id});
      save(D);return send(res,200,sec);
    }
    const sm=/^\/api\/sections\/([\w-]+)$/.exec(p);
    if(sm&&req.method==='DELETE'){
      if(!authed(req))return send(res,401,{error:'auth'});
      const D=load();if(!D.sections.some(x=>x.id===sm[1]))return send(res,404,{error:'none'});
      const ids=[sm[1]];for(let i=0;i<ids.length;i++)D.sections.filter(x=>x.parent===ids[i]).forEach(x=>ids.push(x.id));
      if(D.episodes.some(e=>ids.includes(e.sec)))return send(res,409,{error:'not empty'});
      D.sections=D.sections.filter(x=>!ids.includes(x.id));save(D);
      ids.forEach(i=>fs.rmSync(path.join(ROOT,'images',i),{recursive:true,force:true}));return send(res,200,{ok:1});
    }
    const m=/^\/api\/episodes\/(ep\d+)$/.exec(p);
    if(m&&req.method==='PATCH'){
      if(!authed(req))return send(res,401,{error:'auth'});
      const b=await body(req),D=load(),e=D.episodes.find(x=>x.id===m[1]);
      if(!e||!D.sections.some(x=>x.id===b.sec))return send(res,400,{error:'bad'});
      e.sec=b.sec;save(D);return send(res,200,{ok:1});
    }
    if(m&&req.method==='DELETE'){
      if(!authed(req))return send(res,401,{error:'auth'});
      const D=load();D.episodes=D.episodes.filter(e=>e.id!==m[1]);save(D);fs.rmSync(path.join(ROOT,'images',m[1]),{recursive:true,force:true});return send(res,200,{ok:1});
    }
    const f=path.normalize(path.join(ROOT,p==='/'?'index.html':p));
    if(!f.startsWith(ROOT+path.sep)||/server\.js$|package\.json$/.test(f)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('404')}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(f).pipe(res);
  }catch(e){send(res,400,{error:'error'})}
}).listen(PORT,()=>console.log('Memoverse: http://localhost:'+PORT));
