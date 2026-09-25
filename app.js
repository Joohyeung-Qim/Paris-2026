'use strict';
(() => {
 const D=window.PARIS_DATA, KEY='paris-plans-20261017-v1', $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 const fresh=()=>({version:1,completed:{},notes:{},bookings:{},bookingNotes:{},packing:{},overrides:{},custom:[],deleted:[],expenses:[]});
 const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const timeOK=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
 const str=(x,n)=>typeof x==='string'&&x.length<=n;
 const safeKey=k=>/^[a-zA-Z0-9_-]{1,90}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k);
 function validate(s){
  if(!plain(s)||s.version!==1)throw Error('지원하지 않는 백업 형식입니다.');
  const n=fresh();
  for(const key of ['completed','packing']){if(!plain(s[key]))throw Error('체크 목록 형식 오류');for(const [k,v] of Object.entries(s[key])){if(!safeKey(k)||typeof v!=='boolean')throw Error('체크 목록 값 오류');n[key][k]=v;}}
  for(const key of ['notes','bookingNotes']){if(!plain(s[key]))throw Error('메모 형식 오류');for(const [k,v] of Object.entries(s[key])){if(!safeKey(k)||!str(v,4000))throw Error('메모 값 오류');n[key][k]=v;}}
  if(!plain(s.bookings)||!plain(s.overrides))throw Error('예약·일정 형식 오류');
  for(const [k,v] of Object.entries(s.bookings)){if(!D.bookings.some(b=>b.id===k)||!['pending','done'].includes(v))throw Error('예약 값 오류');n.bookings[k]=v;}
  for(const [k,v] of Object.entries(s.overrides)){if(!D.days.some(d=>d.items.some(e=>e.id===k)))throw Error('수정 일정 ID 오류');n.overrides[k]=validateEvent(v,false);}
  if(!Array.isArray(s.custom)||s.custom.length>200||!Array.isArray(s.deleted)||s.deleted.length>300||!Array.isArray(s.expenses)||s.expenses.length>1000)throw Error('목록 크기 또는 형식 오류');
  n.custom=s.custom.map(x=>validateEvent(x,true));if(new Set(n.custom.map(x=>x.id)).size!==n.custom.length)throw Error('중복 일정 ID');
  if(s.deleted.some(x=>!safeKey(x)))throw Error('삭제 목록 오류');n.deleted=[...new Set(s.deleted)];
  n.expenses=s.expenses.map(e=>{if(!plain(e)||!safeKey(e.id)||!str(e.label,60)||!Number.isSafeInteger(e.cents)||e.cents<1||e.cents>9999900)throw Error('지출 값 오류');return {id:e.id,label:e.label,cents:e.cents};});
  return n;
 }
 function validateEvent(e,custom){
  if(!plain(e)||!timeOK(e.start)||!(e.end===''||timeOK(e.end))||(e.end&&e.end<=e.start)||![17,18,19,20].includes(e.day)||!str(e.title,100)||!e.title.trim()||!str(e.note,2000)||!str(e.address,240)||typeof e.key!=='boolean')throw Error('일정 입력 값 오류');
  if(custom&&(!safeKey(e.id)||!e.id.startsWith('custom-')))throw Error('추가 일정 ID 오류');
  return { ...(custom?{id:e.id}:{}),day:e.day,start:e.start,end:e.end,title:e.title,note:e.note,address:e.address,key:e.key};
 }
 let state=fresh(),storageOK=true;
 try{const raw=localStorage.getItem(KEY);if(raw)state=validate(JSON.parse(raw));}catch(e){storageOK=false;$('#storage-warning').hidden=false;}
 let selected=17,view='schedule',filter='all',map=null,mapLayers=null,tileLayer=null,geoLayer=null,toastTimer=null,undoAction=null,editing=null,pendingImport=null;
 const routeAnchors=new Set(['d17-0','d17-3','d17-4','d17-6','d17-8','d17-10','d17-12','d17-14','d17-15','d18-2','d18-7','d18-9','d18-12','d19-2','d19-4','d19-7','d19-9','d19-11','d20-1','d20-2','d20-3','d20-5','d20-7','d20-9']);
 const day=n=>D.days.find(d=>d.day===Number(n));
 const baseEvents=D.days.flatMap(d=>d.items);
 const el=(t,c,text)=>{const n=document.createElement(t);if(c)n.className=c;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,cls,fn)=>{const b=el('button',cls,text);b.type='button';if(fn)b.addEventListener('click',fn);return b;};
 const link=(text,url,cls='secondary')=>{const a=el('a',cls,text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
 const money=c=>'€'+(c/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 function save(){try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;$('#storage-warning').hidden=true;}catch{storageOK=false;$('#storage-warning').hidden=false;}return storageOK;}
 function toast(message,undo=null){clearTimeout(toastTimer);$('#toast span').textContent=message;$('#toast').hidden=false;undoAction=undo;$('#undo-button').hidden=!undo;toastTimer=setTimeout(()=>{$('#toast').hidden=true;undoAction=null;},undo?16000:5500);}
 $('#undo-button').addEventListener('click',()=>{if(undoAction){undoAction();save();renderAll();}$('#toast').hidden=true;undoAction=null;});
 function google(query){return 'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query});}
 function directions(origin,destination,mode=''){const p=new URLSearchParams({api:'1',destination});if(origin)p.set('origin',origin);if(mode)p.set('travelmode',mode);return 'https://www.google.com/maps/dir/?'+p;}
 function eventPlace(e){
  const p=D.places[e.place];
  if(e.address!==undefined && e.address!==(p?.address||'')){return {name:e.title,address:e.address,query:e.address||e.title+' Paris',latlng:null,url:''};}
  return p||{name:e.title,address:e.address||'',query:e.address||e.title+' Paris',latlng:null,url:''};
 }
 function events(n){return [...baseEvents.map(e=>({...e,...state.overrides[e.id]})),...state.custom.map(e=>({...e,custom:true,place:'',transit:false,fixed:false,optional:false,booking:''}))].filter(e=>e.day===Number(n)&&!state.deleted.includes(e.id)).sort((a,b)=>a.start.localeCompare(b.start)||baseEvents.findIndex(e=>e.id===a.id)-baseEvents.findIndex(e=>e.id===b.id));}
 function checkCurrent(e){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));const hm=v.hour+':'+v.minute;return v.year==='2026'&&v.month==='10'&&Number(v.day)===e.day&&hm>=e.start&&!!e.end&&hm<e.end;}
 function scrollToDates(){const rail=$('.trip-head');window.scrollTo({top:rail.getBoundingClientRect().bottom+window.scrollY,behavior:'instant'});}
 function selectDay(n){selected=n;renderDates();renderSchedule();if(view==='map')renderMap();scrollToDates();}
 function renderDates(){
  const tabs=$('#date-tabs');tabs.replaceChildren();
  D.days.forEach(d=>{
   const t=button('','date',()=>selectDay(d.day));
   t.append(el('strong','',`10.${d.day}`),el('span','',`${d.weekday}요일`));
   t.setAttribute('aria-pressed',String(d.day===selected));t.setAttribute('aria-label',`10월 ${d.day}일 ${d.weekday}요일`);tabs.append(t);
  });
 }
 function updateProgress(){
  const all=events(selected),done=all.filter(e=>state.completed[e.id]).length;
  $('#day-progress').textContent=`완료 ${done} / ${all.length} · 남은 일정 ${all.length-done}개`;
  $('#completion-progress').max=all.length||1;$('#completion-progress').value=done;
 }
 function renderSchedule(){
  const d=day(selected);$('#day-number').textContent=`10월 ${selected}일 · ${d.weekday}요일`;$('#day-title').textContent=d.title;$('#day-region').textContent=d.region;
  const imp=$('#day-important');imp.replaceChildren(el('strong','',d.important),el('span','',d.brief));imp.classList.toggle('urgent',selected===20);
  const all=events(selected),visible=filter==='key'?all.filter(e=>e.key):filter==='remaining'?all.filter(e=>!state.completed[e.id]):all;updateProgress();$('#empty-state').hidden=visible.length>0;$('#empty-state').textContent=filter==='remaining'&&all.length?'이날의 일정을 모두 완료했습니다.':'표시할 일정이 없습니다. 전체 보기를 선택하거나 일정을 추가하세요.';
  const list=$('#timeline');list.replaceChildren();visible.forEach(e=>list.append(eventCard(e)));
  $$('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
 }
 function eventCard(e){
  const li=el('li','event'+(e.transit?' transit':'')+(state.completed[e.id]?' completed':'')+(checkCurrent(e)?' current':''));li.id='event-'+e.id;
  const rail=el('div','event-rail'),time=el('time','event-time',e.start);time.dateTime=`2026-10-${e.day}T${e.start}:00+02:00`;rail.append(time);
  if(e.end)rail.append(el('span','event-end',e.end));else if(e.after)rail.append(el('span','event-end event-after','이후'));
  const label=el('label','complete-control'),check=document.createElement('input');check.type='checkbox';check.checked=!!state.completed[e.id];check.setAttribute('aria-label',e.title+' 완료');check.addEventListener('change',()=>{state.completed[e.id]=check.checked;save();li.classList.toggle('completed',check.checked);updateProgress();if(filter==='remaining'){renderSchedule();toast('완료했습니다.',()=>{state.completed[e.id]=false;});}});label.append(check,el('span','','완료'));rail.append(label);
  const content=el('div','event-content'),p=eventPlace(e),badges=el('div','event-badges');
  if(e.optional)badges.append(el('span','badge gray','선택'));
  if(e.booking)badges.append(el('span',state.bookings[e.booking]==='done'?'badge':'badge red',state.bookings[e.booking]==='done'?'확인 완료':'예약·확인 필요'));
  if(state.overrides[e.id])badges.append(el('span','badge gray','수정됨'));
  if(checkCurrent(e))badges.append(el('span','badge','현재 일정'));
  if(badges.childNodes.length)content.append(badges);
  content.append(el('h3','event-title',e.title));
  // Keep the main list short. Full addresses, itinerary notes and editing live in details.
  const categories={partisan:'카페',pompidou:'전시 · 무료',mesures:'음악 바',large:'미술관 · Moteur Imaginaire',flv:'미술관 · Mohammad Alfaraj',babylone:'아트북 · 레코드',nanna:'선상 독서공간 · 바',orangerie:'미술관 · Monet, peindre le temps',grand:'점심',pinault:'미술관 · 10월 신전시 · Irving Penn / Depardon',shin:'카페',bouillon:'점심'};
  if(categories[e.place]&&e.title===p.name)content.append(el('p','event-caption',categories[e.place]));
  const links=el('div','event-links');links.append(link('Google 지도 ↗',google(p.query),''),link('길찾기 ↗',directions('',p.query),''));content.append(links);
  const details=document.createElement('details'),summary=el('summary','',state.notes[e.id]?'메모 있음':'상세·수정');details.append(summary);
  const detailBody=el('div','event-detail-body');if(p.address)detailBody.append(el('p','event-address',p.address));if(e.note)detailBody.append(el('p','event-note',e.note));if(e.fixed)detailBody.append(el('p','small muted','전달받은 예약 정보 기준'));
  if(p.url)detailBody.append(link(e.booking?'예약·안내 ↗':'장소 안내 ↗',p.url,'detail-link'));
  const note=document.createElement('textarea');note.rows=2;note.maxLength=4000;note.placeholder='메모를 남겨두세요';note.value=state.notes[e.id]||'';note.setAttribute('aria-label',e.title+' 개인 메모');note.addEventListener('input',()=>{state.notes[e.id]=note.value;save();summary.textContent=note.value?'메모 있음':'상세·수정';});detailBody.append(note);
  const actions=el('div','edit-actions');actions.append(button('수정','',()=>openEditor(e)),button('일정에서 제외','danger',()=>{state.deleted.push(e.id);save();renderSchedule();toast('일정에서 제외했습니다.',()=>{state.deleted=state.deleted.filter(id=>id!==e.id);});}));if(state.overrides[e.id])actions.prepend(button('원안 복원','',()=>{const old=state.overrides[e.id];delete state.overrides[e.id];save();renderSchedule();toast('원안으로 복원했습니다.',()=>state.overrides[e.id]=old);}));detailBody.append(actions);details.append(detailBody);content.append(details);li.append(rail,content);return li;
 }
 function setView(next){view=next;$$('.view').forEach(v=>v.hidden=v.id!=='view-'+view);$$('[data-view]').forEach(b=>{if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(view==='map')renderMap();if(view==='bookings')renderBookings();if(view==='more')renderMore();scrollToDates();}
 $$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
 $$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;renderSchedule();}));
 $('#route-shortcut').addEventListener('click',()=>setView('map'));
 $('#open-search').addEventListener('click',()=>{setView('more');$('#place-finder').open=true;$('#place-search').focus();$('#place-finder').scrollIntoView({block:'start',behavior:'instant'});});
 function copy(text){if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(()=>toast('복사했습니다.')).catch(()=>fallbackCopy(text));}else fallbackCopy(text);}
 function fallbackCopy(text){const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.top='-999px';document.body.append(t);t.select();let ok=false;try{ok=document.execCommand('copy');}catch{}t.remove();toast(ok?'복사했습니다.':'복사할 수 없습니다. 주소를 길게 눌러 복사하세요.');}
 function renderBookings(){
  $('#booking-progress').textContent=D.bookings.filter(b=>state.bookings[b.id]==='done').length+' / '+D.bookings.length;
  const host=$('#bookings-list');host.replaceChildren();host.className='bookings-grid';D.bookings.forEach(b=>{
   const card=el('section','panel');card.append(el('h3','booking-title',b.title),el('p','booking-time',b.when),el('p','booking-note',b.note));
   const links=el('div','event-links');if(b.url)links.append(link('공식 예약·안내',b.url,''));links.append(link('Google 지도',google(D.places[b.place].query),'outline'));card.append(links);
   const controls=el('div','booking-controls'),label=el('label','','상태'),select=document.createElement('select');select.setAttribute('aria-label',b.title+' 상태');for(const [value,text] of [['pending','미확인'],['done',b.type==='check'?'확인 완료':'예약 완료']]){const o=el('option','',text);o.value=value;select.append(o);}select.value=state.bookings[b.id]||'pending';select.addEventListener('change',()=>{state.bookings[b.id]=select.value;save();$('#booking-progress').textContent=D.bookings.filter(b=>state.bookings[b.id]==='done').length+' / '+D.bookings.length;renderSchedule();});label.append(select);
   const noteLabel=el('label','','예약 메모'),input=document.createElement('textarea');input.rows=2;input.maxLength=4000;input.value=state.bookingNotes[b.id]||'';input.placeholder='예약 번호·확정 시간 등';input.setAttribute('aria-label',b.title+' 예약 메모');input.addEventListener('input',()=>{state.bookingNotes[b.id]=input.value;save();});noteLabel.append(input);controls.append(label,noteLabel);card.append(controls);host.append(card);
  });
 }
 function renderPlaces(){const q=$('#place-search').value.trim().toLocaleLowerCase();const host=$('#places-list');host.replaceChildren();const places=Object.values(D.places).filter(p=>(p.name+' '+p.address+' '+p.query).toLocaleLowerCase().includes(q));if(!places.length)host.append(el('p','muted small','검색 결과가 없습니다.'));places.forEach(p=>{const row=el('div','place-result');row.append(el('strong','',p.name),el('p','',p.address));const links=el('div','event-links');links.append(link('Google 지도',google(p.query),''));if(p.url)links.append(link('안내',p.url,'outline'));row.append(links);host.append(row);});}
 function renderMore(){
  const home=$('#home-links');home.replaceChildren(link('Google 지도',google(D.places.home.query)),button('주소 복사','secondary',()=>copy(D.places.home.address)),link('숙소로 길찾기',directions('',D.places.home.query)));renderPlaces();
  const alt=$('#alternatives');alt.replaceChildren();D.alternatives.forEach(a=>{const p=D.places[a.place],row=el('div','place-result');row.append(el('strong','',a.title),el('p','',a.note));const links=el('div','event-links');links.append(link('Google 지도',google(p.query),''),link('방문 조건 확인',p.url,'outline'));row.append(links);alt.append(row);});
  const packing=$('#packing-list');packing.replaceChildren();D.packing.forEach((text,i)=>{const l=el('label','check-label'),input=document.createElement('input');input.type='checkbox';input.checked=!!state.packing['p'+i];input.addEventListener('change',()=>{state.packing['p'+i]=input.checked;save();});l.append(input,el('span','',text));packing.append(l);});renderExpenses();
 }
 $('#place-search').addEventListener('input',renderPlaces);
 function renderExpenses(){const host=$('#expenses');host.replaceChildren();state.expenses.forEach(e=>{const row=el('div','expense-row');row.append(el('span','',e.label),el('strong','',money(e.cents)),button('삭제','',()=>{const index=state.expenses.findIndex(x=>x.id===e.id);state.expenses.splice(index,1);save();renderExpenses();toast('지출을 삭제했습니다.',()=>state.expenses.splice(index,0,e));}));host.append(row);});$('#expense-total').textContent=money(state.expenses.reduce((a,e)=>a+e.cents,0));}
 $('#expense-form').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget,label=f.elements.label.value.trim(),cents=Math.round(Number(f.elements.amount.value)*100);if(!label||!Number.isSafeInteger(cents)||cents<1||cents>9999900){toast('내용과 금액을 확인하세요.');return;}state.expenses.push({id:'expense-'+uid(),label,cents});save();renderExpenses();f.reset();});
 function uid(){return globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
 function openEditor(e=null){editing=e;const f=$('#edit-form');f.reset();$('#edit-title').textContent=e?'일정 수정':'일정 추가';f.elements.day.value=e?e.day:selected;f.elements.start.value=e?e.start:'10:00';f.elements.end.value=e?e.end:'';f.elements.title.value=e?e.title:'';f.elements.address.value=e?eventPlace(e).address:'';f.elements.note.value=e?e.note:'';f.elements.key.checked=e?!!e.key:true;$('#edit-warning').textContent=e?.fixed?'항공·열차·숙소의 예약 정보 시간입니다. 실제 예약 변경 여부를 확인하세요.':'';$('#edit-dialog').showModal();}
 $('#add-item').addEventListener('click',()=>openEditor());
 $$('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close).close()));
 $('#edit-form').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;let v={day:Number(f.elements.day.value),start:f.elements.start.value,end:f.elements.end.value,title:f.elements.title.value.trim(),address:f.elements.address.value.trim(),note:f.elements.note.value.trim(),key:f.elements.key.checked};try{v=validateEvent(v,false);}catch{toast('이름과 시간을 확인하세요. 종료는 시작보다 늦어야 합니다.');return;}
  if(editing?.custom){const i=state.custom.findIndex(x=>x.id===editing.id);state.custom[i]={...v,id:editing.id};}else if(editing){state.overrides[editing.id]=v;}else{state.custom.push({...v,id:'custom-'+uid()});}
  selected=v.day;save();$('#edit-dialog').close();renderDates();renderSchedule();if(view==='map')renderMap();toast(storageOK?'일정을 저장했습니다.':'일정은 반영됐지만 기기 저장에 실패했습니다.');});
 function route(){
  const d=day(selected),items=events(selected).filter(e=>routeAnchors.has(e.id)||e.custom);
  const result=items.map(e=>({id:e.id,place:e.place,p:eventPlace(e),time:e.start,optional:e.optional}));
  if([18,19].includes(selected))result.unshift({id:'start-home',place:'home',p:D.places.home,time:'출발'});
  return result.filter((r,i)=>i===0||r.p.query!==result[i-1].p.query).map((r,i)=>({...r,num:i+1}));
 }
 function modeFor(a,b){const d=day(selected);const i=d.route.findIndex((p,i)=>p===a.place&&d.route[i+1]===b.place);return i>=0?d.modes[i]:'';}
 function renderMap(){
  $('#map-region').textContent='10월 '+selected+'일 · '+day(selected).title;
  const r=route(),cityOnly=$('#city-only').checked,shown=r.filter(x=>x.p.latlng&&(!cityOnly||!['cdg','ams'].includes(x.place)));
  const legs=$('#route-list');legs.replaceChildren();for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i],mode=modeFor(a,b);const row=el('div','route-leg');row.append(el('p','leg-title',a.num+'. '+a.p.name+' → '+b.num+'. '+b.p.name),el('p','leg-mode',(mode==='walking'?'도보':mode==='transit'?'대중교통':'이동수단 선택')+(b.optional?' · 선택 일정':'')),link('이 구간 길찾기',directions(a.p.query,b.p.query,mode)));legs.append(row);}
  if(r.some(x=>!x.p.latlng))legs.append(el('p','small muted','추가·수정한 주소와 넓은 지역은 지도 핀이 없을 수 있습니다. Google 지도에서 위치를 확인하세요.'));
  if(!window.L){$('#map-fallback').hidden=false;return;}
  if(!map){map=L.map('map',{scrollWheelZoom:false,zoomControl:true}).setView(D.places.home.latlng,13);map.attributionControl.setPrefix(false);mapLayers=L.layerGroup().addTo(map);
   if(location.protocol==='http:'||location.protocol==='https:'){tileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',updateWhenIdle:true,keepBuffer:1}).addTo(map);tileLayer.on('tileerror',()=>{$('#map-fallback').hidden=false;});tileLayer.on('load',()=>{if(navigator.onLine)$('#map-fallback').hidden=true;});}else{$('#map-fallback').hidden=false;$('#map-fallback').textContent='지도 바탕은 웹사이트 주소에서 표시됩니다. 방문 순서와 Google 지도 링크를 이용하세요.';}
  }
  mapLayers.clearLayers();$('#map-selection').hidden=true;
  // Break at unknown/excluded coordinates; never connect across an omitted destination.
  for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i];if(shown.includes(a)&&shown.includes(b))L.polyline([a.p.latlng,b.p.latlng],{color:b.place==='ams'?'#ed2939':'#002395',weight:3,opacity:.55,dashArray:'6 8',interactive:false}).addTo(mapLayers);}
  const unique=new Map();shown.forEach(x=>{const key=x.p.latlng.join(',');if(!unique.has(key))unique.set(key,[]);unique.get(key).push(x);});
  unique.forEach(group=>{const first=group[0],nums=group.map(x=>x.num).join('·');const icon=L.divIcon({className:'',html:'<span class="map-pin'+(first.place==='home'?' home':'')+'">'+first.num+'</span>',iconSize:[34,34],iconAnchor:[17,17]});const marker=L.marker(first.p.latlng,{icon,title:nums+' '+first.p.name,alt:nums+' '+first.p.name,keyboard:true}).addTo(mapLayers);const tip=el('span','',nums+' '+first.p.name);marker.bindTooltip(tip,{direction:'top'});marker.on('click',()=>{const host=$('#map-selection');host.hidden=false;host.replaceChildren(el('strong','',nums+'. '+first.p.name),el('p','small muted',first.p.address));if(first.p.detail)host.append(el('p','small muted',first.p.detail));const links=el('div','event-links');links.append(link('Google 지도',google(first.p.query),''),link('길찾기',directions('',first.p.query),''));host.append(links);});});
  map.invalidateSize();if(shown.length)map.fitBounds(L.latLngBounds(shown.map(x=>x.p.latlng)),{padding:[35,35],maxZoom:15,animate:false});
 }
 $('#city-only').addEventListener('change',renderMap);$('#fit-map').addEventListener('click',renderMap);
 $('#locate-me').addEventListener('click',()=>{if(!navigator.geolocation){toast('현재 위치를 지원하지 않는 브라우저입니다.');return;}navigator.geolocation.getCurrentPosition(pos=>{if(!map)return;if(geoLayer)map.removeLayer(geoLayer);geoLayer=L.circleMarker([pos.coords.latitude,pos.coords.longitude],{radius:8,color:'#fff',weight:3,fillColor:'#0071e3',fillOpacity:1}).addTo(map).bindTooltip('내 위치');map.setView([pos.coords.latitude,pos.coords.longitude],15);},()=>toast('위치를 확인할 수 없습니다. 위치 권한을 확인하세요.'),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});});
 function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
 function icsStamp(day,time){const [h,m]=time.split(':').map(Number);return new Date(Date.UTC(2026,9,day,h-2,m)).toISOString().replace(/[-:]/g,'').replace('.000','');} // Paris and Amsterdam are UTC+2 on 17–20 Oct 2026.
 function fold(line){const lines=[];let part='',size=0;for(const char of line){const len=new TextEncoder().encode(char).length;if(size+len>74){lines.push(part);part=' '+char;size=1+len;}else{part+=char;size+=len;}}lines.push(part);return lines.join('\r\n');}
 function calendar(days){const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Paris2026Plans//Trip//KO','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:파리 여행'];const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');days.flatMap(events).forEach(e=>{const p=eventPlace(e);lines.push('BEGIN:VEVENT','UID:'+e.id+'@paris2026plans','DTSTAMP:'+stamp,'DTSTART:'+icsStamp(e.day,e.start));if(e.end)lines.push('DTEND:'+icsStamp(e.day,e.end));lines.push('SUMMARY:'+icsEscape(e.title+(e.optional?' (선택)':'')),'LOCATION:'+icsEscape(p.address||p.query),'DESCRIPTION:'+icsEscape(e.note+(state.notes[e.id]?'\n메모: '+state.notes[e.id]:'')+'\n'+google(p.query)+(e.fixed?'':'\n관광 계획 시간 · 예약 확정 여부 별도 확인')),'END:VEVENT');});lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';}
 function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 $('#calendar-day').addEventListener('click',()=>{download('paris-2026-10-'+selected+'.ics',calendar([selected]),'text/calendar;charset=utf-8');toast('캘린더 파일을 내려받습니다.');});
 $('#calendar-all').addEventListener('click',()=>{download('paris-2026.ics',calendar([17,18,19,20]),'text/calendar;charset=utf-8');toast('전체 캘린더 파일을 내려받습니다.');});
 $('#backup-export').addEventListener('click',()=>download('paris-2026-backup.json',JSON.stringify({app:'paris-2026-plans',version:1,exportedAt:new Date().toISOString(),state},null,2),'application/json'));
 $('#backup-import').addEventListener('click',()=>$('#import-file').click());
 $('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('백업 파일이 너무 큽니다.');const data=JSON.parse(await file.text());if(data.app!=='paris-2026-plans')throw Error('이 앱의 백업 파일이 아닙니다.');pendingImport=validate(data.state);$('#confirm-dialog').showModal();}catch(err){toast(err.message||'백업을 읽을 수 없습니다.');}finally{e.target.value='';}});
 $('#confirm-import').addEventListener('click',()=>{if(!pendingImport)return;const previous=state;state=pendingImport;pendingImport=null;save();$('#confirm-dialog').close();renderAll();toast('백업을 불러왔습니다.',()=>{state=previous;});});
 $('#print-plan').addEventListener('click',()=>{let root=$('.print-only');if(root)root.remove();root=el('div','print-only');D.days.forEach(d=>{const section=el('section','print-day');section.append(el('h2','',`10/${d.day} (${d.weekday}) · ${d.title}`));events(d.day).forEach(e=>{const p=eventPlace(e),row=el('div','print-item');row.append(el('strong','',`${e.start}${e.end?'–'+e.end:''} ${e.title}`),el('p','',p.address),el('p','',e.note));if(state.notes[e.id])row.append(el('p','','메모: '+state.notes[e.id]));section.append(row);});root.append(section);});$('#main').append(root);window.print();});
 function updateClock(){const now=new Date();$('#paris-clock').textContent='현지 '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const diff=Math.ceil((Date.UTC(2026,9,17)-Date.parse(date+'T00:00:00Z'))/86400000);$('#countdown').textContent=diff>0?'D−'+diff:date<='2026-10-20'?'여행 중':'여행 종료';}
 function connection(){const offline=!navigator.onLine;$('#offline-banner').hidden=!offline;}
 function renderAll(){renderDates();renderSchedule();renderBookings();renderMore();if(view==='map')renderMap();}
 try{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(today>='2026-10-17'&&today<='2026-10-20')selected=Number(today.slice(-2));}catch{}
 renderAll();updateClock();setInterval(updateClock,60000);connection();window.addEventListener('online',connection);window.addEventListener('offline',connection);
 if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{$('#offline-status').textContent='오프라인 일정 저장 완료 · 지도는 인터넷 연결 필요';}).catch(()=>{$('#offline-status').textContent='오프라인 저장 실패 · 인터넷 연결 상태에서 이용하세요.';});
 }
 // Narrow, explicit hooks for deterministic file-format tests; no browser state mutation API.
 window.ParisFormats=Object.freeze({calendar,validate,google,directions});
})();
