'use strict';
const CUSTOM_KEY='wordflow_custom_v1';
let customCards=[];
function message(t){$('notice').textContent=t;$('notice').hidden=false;}
function cleanCards(data){
 if(!Array.isArray(data)||data.length>20000)throw Error('Lista de palabras no válida.');
 return data.map(c=>{if(!c||typeof c.w!=='string'||!c.w.trim()||c.w.length>160||typeof c.es!=='string'||!c.es.trim()||c.es.length>400)throw Error('Cada tarjeta necesita palabra y significado.');const out={};for(const [k,max] of [['w',160],['es',400],['ipa',160],['ex',900]]){if(c[k]!=null&&typeof c[k]!=='string')throw Error('Formato de tarjeta no válido.');out[k]=(c[k]||'').trim();if(out[k].length>max)throw Error('Una tarjeta es demasiado larga.');}return out;});
}
function rebuild(){PACKS.splice(0,PACKS.length,...BASE_PACKS.map(p=>p.slice()));for(let i=0;i<customCards.length;i+=20)PACKS.push(customCards.slice(i,i+20));backToPacks();}
try{customCards=cleanCards(JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]'));rebuild();}catch(e){message('No se pudieron cargar las palabras personales. No se ha borrado su copia guardada.');}
$('settingsBtn').onclick=()=>$('settings').showModal();$('closeSettings').onclick=()=>$('settings').close();
$('addForm').onsubmit=e=>{e.preventDefault();try{const card=cleanCards([Object.fromEntries(new FormData(e.target))])[0];if(allWordsFlat().some(c=>c.w.toLowerCase()===card.w.toLowerCase()))throw Error('Esa palabra ya está en tu colección. Búscala en los paquetes.');const next=[...customCards,card];localStorage.setItem(CUSTOM_KEY,JSON.stringify(next));customCards=next;rebuild();e.target.reset();$('settings').close();message('Palabra guardada. La encontrarás en los últimos paquetes.');}catch(err){alert(err.message);}};
$('exportBtn').onclick=async()=>{
 const button=$('exportBtn');button.disabled=true;
 try{
  const backup={app:'WordFlow',schemaVersion:1,exportedAt:new Date().toISOString(),customCards,progress};
  try{backup.streak=await window.WordFlowStreak.exportBackup();}
  catch{message('Se guardó el respaldo de palabras y progreso. El historial de racha no estaba disponible.');}
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download='WordFlow-respaldo-'+backup.exportedAt.slice(0,10)+'.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
 }finally{button.disabled=false;}
};
$('importBtn').onclick=()=>$('backupFile').click();
$('backupFile').onchange=async e=>{
 try{
  const file=e.target.files[0];if(!file)return;
  if(file.size>10*1024*1024)throw Error('El respaldo supera 10 MB.');
  const data=JSON.parse(await file.text());
  if(data.app!=='WordFlow'||data.schemaVersion!==1)throw Error('Selecciona un respaldo de WordFlow versión 1.');
  const incoming=cleanCards(data.customCards);
  const streak=window.WordFlowStreak.validateBackup(data.streak);
  if(!data.progress||Array.isArray(data.progress)||typeof data.progress!=='object')throw Error('Progreso no válido.');
  const entries=Object.entries(data.progress);
  if(entries.some(([k,v])=>k.length>160||!['known','review'].includes(v)))throw Error('El progreso contiene valores no válidos.');
  if(!confirm('¿Combinar el respaldo? Las tarjetas repetidas se conservan y el historial de racha se combina por fecha.'))return;
  const seen=new Set(allWordsFlat().map(c=>c.w.toLowerCase()));
  const next=[...customCards];
  for(const c of incoming){if(!seen.has(c.w.toLowerCase())){next.push(c);seen.add(c.w.toLowerCase());}}
  const merged=Object.assign(Object.create(null),progress,Object.fromEntries(entries));
  const originals=[CUSTOM_KEY,STORAGE_KEY].map(key=>[key,localStorage.getItem(key)]);
  try{
   localStorage.setItem(CUSTOM_KEY,JSON.stringify(next));
   localStorage.setItem(STORAGE_KEY,JSON.stringify(merged));
   await window.WordFlowStreak.importBackup(streak);
  }catch(err){
   for(const [key,value] of originals){
    if(value===null)localStorage.removeItem(key);
    else localStorage.setItem(key,value);
   }
   throw err;
  }
  customCards=next;progress=merged;rebuild();$('settings').close();
  message('Respaldo importado y combinado correctamente.');
 }catch(err){alert('No se importó el archivo. '+err.message);}
 finally{e.target.value='';}
};
let installPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
$('installBtn').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else alert('Android: abre WordFlow en Chrome, menú ⋮ → Instalar aplicación / Agregar a pantalla principal.\n\niPhone: Safari → Compartir → Agregar a pantalla de inicio.');};
const APP_VERSION='1.2.0';
let registration,availableVersion=null;
function showUpdate(){
 if(registration?.waiting||availableVersion){$('updateBtn').hidden=false;$('updateBtn').textContent='Actualizar WordFlow'+(availableVersion?' · '+availableVersion:'');$('menuUpdate').hidden=false;}
}
async function refreshApplication(){
 saveProgress();
 await window.activateWordFlowUpdate();
 location.replace('./?updated='+Date.now());
}
async function applyUpdate(){
 $('updateBtn').disabled=true;$('menuUpdate').disabled=true;
 try{await refreshApplication();}catch(error){$('updateBtn').disabled=false;$('menuUpdate').disabled=false;message('No se pudo aplicar la actualización: '+error.message+'. Usa Recuperar actualización en el menú.');}
}
$('updateBtn').onclick=applyUpdate;$('menuUpdate').onclick=applyUpdate;
$('appVersion').textContent='Versión actual: '+APP_VERSION;
async function checkUpdates(manual=false){
 const button=$('checkUpdate');if(button.disabled)return;button.disabled=true;
 $('updateStatus').textContent='Buscando una versión nueva…';
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),12000);
 try{
  const response=await fetch('./version.json?check='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:abort.signal});
  if(!response.ok)throw Error('El servidor respondió '+response.status);
  if(!(response.headers.get('content-type')||'').includes('json')){ $('updateStatus').textContent='El alojamiento devolvió una página en lugar de la versión. Abre WordFlow en Chrome y comprueba la dirección del alojamiento.';return; }
  const latest=await response.json();if(typeof latest.version!=='string')throw Error('Respuesta de versión no válida');
  if(latest.version!==APP_VERSION){availableVersion=latest.version;showUpdate();$('updateStatus').textContent='Nueva versión '+latest.version+' disponible. Pulsa Actualizar WordFlow.';if(manual)message('Nueva versión disponible. Puedes actualizar desde ☰.');}
  else{$('updateStatus').textContent='Ya tienes la versión actual: '+APP_VERSION;if(manual)message('WordFlow está actualizada ('+APP_VERSION+').');}
  // Worker refresh is optional: its failure must not invalidate a successful version check.
  registration?.update().then(showUpdate).catch(()=>{});
 }catch(error){$('updateStatus').textContent=error.name==='AbortError'?'El servidor tardó demasiado. Puedes reintentar o usar Recuperar actualización.':'No se recibió una respuesta del servidor. Puede ser el alojamiento o el servicio; no necesariamente tu conexión. Usa Recuperar actualización si persiste.';}
 finally{clearTimeout(timer);button.disabled=false;}
}
if('serviceWorker'in navigator&&location.protocol==='https:'){
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{
  registration=r;showUpdate();r.addEventListener('updatefound',()=>{const w=r.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed')showUpdate();});});
  navigator.serviceWorker.ready.then(()=>{$('offlineStatus').textContent='Tarjetas disponibles sin conexión en este navegador.';});
 }).catch(()=>{$('offlineStatus').textContent='Modo en línea activo. La búsqueda de actualizaciones sigue disponible.';});
}else $('offlineStatus').textContent='Abre el enlace HTTPS para instalar y actualizar WordFlow.';
$('checkUpdate').onclick=()=>checkUpdates(true);
window.addEventListener('online',()=>checkUpdates(false));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkUpdates(false);});
if(location.protocol==='https:')checkUpdates(false);
