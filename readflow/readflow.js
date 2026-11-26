'use strict';
Modules.Notebook=(()=>{
 const S=Modules.Storage,$=id=>document.getElementById(id),KEY='readflowNotebook',HISTORY='readflowHistory';let chain=Promise.resolve(),tab='saved',query='',selectedController,practice=[],practiceIndex=0;
 const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const key=t=>String(t).trim().toLowerCase().replace(/\s+/g,' ');
 function notify(t){$('rfNotice').textContent=t;$('rfNotice').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('rfNotice').hidden=true,7000);}
 function enqueue(fn){const p=chain.catch(()=>{}).then(fn);chain=p;return p;}
 async function records(){return await S.getSetting(KEY,[]);}
 async function save(result,action){
  let note=null;if(action==='Add Note'){note=prompt('Escribe una nota para esta selección:','');if(note===null)return;}
  return enqueue(async()=>{const all=await records(),id=key(result.text);let record=all.find(r=>r.id===id);
   if(!record){record={id,text:result.text,saved:false,favorite:false,flashcard:false,note:'',learned:false,createdAt:Date.now()};all.push(record);}
   record.result=result;record.context=window.ReadFlowApp?.context()||{};record.updatedAt=Date.now();record.saved=true;
   if(action==='Favorite')record.favorite=!record.favorite;
   if(action==='Create Flashcard')record.flashcard=true;
   if(note!==null)record.note=note.slice(0,10000);
   await S.saveSetting(KEY,all);notify(action==='Favorite'?(record.favorite?'Añadida a favoritos.':'Quitada de favoritos; sigue guardada.'):'Guardado en Palabras y tarjetas.');
  });
 }
 async function remember(result){if(!result.data?.translation&&!result.data?.dictionary)return;return enqueue(async()=>{const history=await S.getSetting(HISTORY,[]);const item={id:key(result.text),text:result.text,result,at:Date.now()};await S.saveSetting(HISTORY,[item,...history.filter(h=>h.id!==item.id)].slice(0,200));});}
 async function cached(text){const saved=(await records()).find(r=>r.id===key(text));if(saved?.result)return saved.result;return (await S.getSetting(HISTORY,[])).find(r=>r.id===key(text))?.result;}
 function show(title,html){$('rfDialogTitle').textContent=title;$('rfDialogBody').innerHTML=html;if(!$('rfDialog').open)$('rfDialog').showModal();document.getElementById('sidebar').classList.remove('is-open');}
 function translation(r){return r.result?.data?.translation?.translatedText||r.result?.fields?.spanishTranslation||r.result?.fields?.translation||'Sin traducción guardada';}
 async function notebook(){
  const all=tab==='history'?await S.getSetting(HISTORY,[]):await records();const filtered=all.filter(r=>(tab!=='favorites'||r.favorite)&&(tab!=='cards'||r.flashcard)&&(!query||`${r.text} ${translation(r)}`.toLowerCase().includes(query.toLowerCase())));
  show('Tu vocabulario',`<p>Palabras, expresiones y consultas guardadas en este dispositivo.</p><div class="rf-tabs">${[['saved','Guardadas'],['favorites','Favoritas'],['cards','Tarjetas'],['history','Historial']].map(([id,label])=>`<button data-tab="${id}" aria-pressed="${tab===id}">${label}</button>`).join('')}</div><label>Buscar<input id="rfSearch" value="${esc(query)}" placeholder="Palabra o significado"></label>${tab==='cards'?'<button id="rfPractice">Practicar tarjetas pendientes</button>':''}<p>${filtered.length} elementos${tab==='history'?' · últimas 200 consultas':''}</p><div class="rf-list">${filtered.map(r=>`<article><h3>${esc(r.text)} ${r.favorite?'★':''}</h3><p>${esc(translation(r))}</p>${r.result?.data?.dictionary?.ipa?`<small>${esc(r.result.data.dictionary.ipa)}</small>`:''}<p>${esc(r.result?.data?.dictionary?.definition||'')}</p>${r.context?.bookTitle?`<small>Libro: ${esc(r.context.bookTitle)}</small>`:''}${r.note?`<blockquote>${esc(r.note)}</blockquote>`:''}<div class="rf-actions"><button data-action="speak" data-id="${esc(r.id)}">Escuchar</button>${tab==='history'?`<button data-action="save" data-id="${esc(r.id)}">Guardar</button>`:`<button data-action="favorite" data-id="${esc(r.id)}">${r.favorite?'Quitar ★':'Favorito ★'}</button><button data-action="card" data-id="${esc(r.id)}">${r.flashcard?'Quitar tarjeta':'Crear tarjeta'}</button><button data-action="note" data-id="${esc(r.id)}">Nota</button>${r.flashcard?`<button data-action="learned" data-id="${esc(r.id)}">${r.learned?'Volver a repasar':'Marcar aprendida'}</button>`:''}<button data-action="delete" data-id="${esc(r.id)}">Eliminar</button>`}</div></article>`).join('')||'<p class="rf-empty">Todavía no hay elementos aquí. Selecciona texto en un libro y pulsa Save Word, Favorite o Create Flashcard.</p>'}</div>`);
  $('rfSearch').oninput=e=>{query=e.target.value;clearTimeout(notebook.timer);notebook.timer=setTimeout(async()=>{const pos=$('rfSearch')?.selectionStart;await notebook();$('rfSearch')?.focus();$('rfSearch')?.setSelectionRange(pos,pos);},250);};
  $('rfDialogBody').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;query='';notebook().catch(error);});
  $('rfDialogBody').querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.dataset.action,b.dataset.id).catch(error));
  if($('rfPractice'))$('rfPractice').onclick=async()=>{practice=(await records()).filter(r=>r.flashcard&&!r.learned);practiceIndex=0;renderPractice();};
 }
 function speak(text){if(!('speechSynthesis'in window)){notify('La voz no está disponible en este navegador.');return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=.9;speechSynthesis.speak(u);}
 async function act(action,id){
  if(action==='speak'){const all=tab==='history'?await S.getSetting(HISTORY,[]):await records();speak(all.find(r=>r.id===id)?.text||'');return;}
  if(action==='save'){const r=(await S.getSetting(HISTORY,[])).find(r=>r.id===id);if(r)await save(r.result,'Save Word');return;}
  await enqueue(async()=>{let all=await records();const r=all.find(r=>r.id===id);if(!r)return;if(action==='favorite')r.favorite=!r.favorite;if(action==='card')r.flashcard=!r.flashcard;if(action==='learned')r.learned=!r.learned;
   if(action==='note'){const n=prompt('Tu nota:',r.note||'');if(n===null)return;r.note=n.slice(0,10000);}
   if(action==='delete'){if(!confirm('¿Eliminar esta selección de guardadas, favoritos y tarjetas?'))return;all=all.filter(x=>x.id!==id);}
   r.updatedAt=Date.now();await S.saveSetting(KEY,all);
  });await notebook();
 }
 function renderPractice(){const r=practice[practiceIndex];if(!r){show('Repaso terminado','<p>No quedan tarjetas pendientes en esta sesión.</p><button id="rfPracticeBack">Volver a mis palabras</button>');$('rfPracticeBack').onclick=()=>notebook().catch(error);return;}
  show('Repaso de tarjetas',`<p>${practiceIndex+1} / ${practice.length}</p><div class="rf-study"><h2>${esc(r.text)}</h2><button id="rfListen">Escuchar</button><button id="rfReveal">Ver significado</button><div id="rfAnswer" hidden><h3>${esc(translation(r))}</h3><p>${esc(r.result?.data?.dictionary?.example||'')}</p><p>${esc(r.note||'')}</p><div class="rf-actions"><button id="rfKnown">Ya la sé</button><button id="rfAgain">Repasar después</button></div></div></div>`);
  $('rfListen').onclick=()=>speak(r.text);$('rfReveal').onclick=()=>{$('rfAnswer').hidden=false;$('rfReveal').hidden=true;};
  const next=async learned=>{try{await enqueue(async()=>{const all=await records();const item=all.find(x=>x.id===r.id);if(item){item.learned=learned;item.updatedAt=Date.now();await S.saveSetting(KEY,all);}});practiceIndex++;renderPractice();}catch(e){error(e);}};$('rfKnown').onclick=()=>next(true);$('rfAgain').onclick=()=>next(false);
 }
 function offerSelection(controller){const sel=window.getSelection(),text=sel?.toString().trim();if(!text||!controller.readerPage.contains(sel.anchorNode)||!controller.readerPage.contains(sel.focusNode)){$('rfAnalyzeSelection').hidden=true;return;}selectedController=controller;offerSelection.text=text;offerSelection.block=controller.getSelectionBlock(sel.anchorNode)?.textContent||'';$('rfAnalyzeSelection').hidden=false;}
 const error=e=>notify(e.message||'No se pudo completar.');
 function download(data,name){const blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
 function validateBackup(data){
  if(!data||data.app!=='ReadFlow'||data.schemaVersion!==1||!Array.isArray(data.books)||!Array.isArray(data.settings)||data.books.length>500)throw Error('No es un respaldo compatible de ReadFlow.');
  const string=(x,max=10000000)=>typeof x==='string'&&x.length<=max;
  const ratio=x=>Number.isFinite(x)&&x>=0&&x<=1;
  for(const b of data.books){if(!b||!string(b.id,500)||!string(b.title,2000)||!Array.isArray(b.chapters)||!b.chapters.length||b.chapters.length>10000||!b.chapters.every(c=>c&&string(c.title,2000)&&string(c.content)))throw Error('Un libro contiene datos no válidos.');
   if(b.author!=null&&!string(b.author,2000))throw Error('Autor no válido.');
   if(!Number.isFinite(b.wordCount)||b.wordCount<0)throw Error('Conteo de palabras no válido.');
   if(!b.progress||!Number.isInteger(b.progress.chapterIndex)||b.progress.chapterIndex<0||b.progress.chapterIndex>=b.chapters.length||!ratio(b.progress.scrollRatio))throw Error('Posición de lectura no válida.');
   if(!Array.isArray(b.toc)||!b.toc.every(t=>t&&string(t.label,2000)&&Number.isInteger(t.index)&&t.index>=0&&t.index<b.chapters.length))throw Error('Índice del libro no válido.');
   for(const k of ['bookmarks','highlights']){if(!Array.isArray(b[k])||b[k].length>50000)throw Error('Notas o marcadores no válidos.');for(const v of b[k]){if(!v||!string(v.id,500)||!Number.isInteger(v.chapterIndex)||v.chapterIndex<0||v.chapterIndex>=b.chapters.length||!ratio(v.scrollRatio))throw Error('Marcador no válido.');for(const field of ['text','note','title','label','name','chapterTitle'])if(v[field]!=null&&!string(v[field]))throw Error('Nota no válida.');if(k==='highlights'&&(!string(v.text)||!['yellow','green','blue','rose'].includes(v.color)))throw Error('Resaltado no válido.');}}
  }
  const allowed=new Set(['theme','readerSettings','lastOpenBookId',KEY,HISTORY]);
  for(const s of data.settings){if(!s||!allowed.has(s.key))throw Error('Preferencia desconocida.');
   if(s.key==='theme'&&!['light','dark','sepia','amoled'].includes(s.value))throw Error('Tema no válido.');
   if(s.key==='lastOpenBookId'&&!string(s.value,500))throw Error('Último libro no válido.');
   if(s.key==='readerSettings'){const v=s.value;if(!v||typeof v!=='object'||Array.isArray(v)||!['light','dark','sepia','amoled'].includes(v.readerTheme)||!string(v.fontFamily,100))throw Error('Ajustes de lectura no válidos.');for(const field of ['fontSize','fontWeight','lineSpacing','paragraphSpacing','pageWidth','margin'])if(!Number.isFinite(v[field])||v[field]<0||v[field]>3000)throw Error('Ajustes numéricos no válidos.');}
   if(s.key===KEY||s.key===HISTORY){if(!Array.isArray(s.value)||s.value.length>50000)throw Error('Vocabulario no válido.');for(const r of s.value){if(!r||!string(r.id,20000)||!string(r.text,20000)||!r.result||r.result.text!==r.text||!r.result.data||typeof r.result.data!=='object')throw Error('Consulta guardada no válida.');if(r.note!=null&&!string(r.note,10000))throw Error('Nota de vocabulario no válida.');}}
  }return data;
 }
 async function mergeBackup(current,incoming){
  const books=new Map(current.books.map(b=>[b.id,b]));for(const b of incoming.books)books.set(b.id,b);
  const settings=new Map(current.settings.map(s=>[s.key,s.value]));for(const s of incoming.settings){if(s.key===KEY||s.key===HISTORY){const rows=new Map((settings.get(s.key)||[]).map(r=>[r.id,r]));for(const r of s.value)rows.set(r.id,r);const values=[...rows.values()];settings.set(s.key,s.key===HISTORY?values.sort((a,b)=>b.at-a.at).slice(0,200):values);}else settings.set(s.key,s.value);}
  return {...incoming,books:[...books.values()],settings:[...settings].map(([key,value])=>({key,value}))};
 }
 async function backups(){show('Respaldos e instalación',`<h3>Tu biblioteca contigo</h3><p>Exporta aquí y luego importa el archivo en el otro navegador o teléfono. Incluye libros (texto), posición de lectura, notas, resaltados, marcadores, vocabulario, tarjetas, historial y ajustes.</p><div class="rf-actions"><button id="rfExport">Exportar todo</button><button id="rfImport">Importar respaldo</button></div><p>Los datos son locales: no se sincronizan automáticamente. El respaldo contiene el texto de tus libros; guárdalo en un lugar privado. No borres el navegador de origen hasta verificar la importación.</p><h3>Instala ReadFlow</h3><button id="rfInstall">Instalar / Instrucciones</button><p>Android: Chrome → ⋮ → Instalar aplicación o Agregar a pantalla principal.<br>iPhone: Safari → Compartir → Agregar a pantalla de inicio.</p><h3>Almacenamiento</h3><button id="rfPersist">Solicitar conservación de datos</button><p>El navegador decide si permite conservarlos. Mantén siempre un respaldo, incluso si acepta.</p><h3>Actualizaciones</h3><p>Versión actual: 2.1.1</p><button id="rfCheck">Buscar actualizaciones</button><button id="rfApply" hidden>Actualizar ReadFlow</button><p id="rfUpdateStatus" role="status"></p><p><a href="actualizar.html">Recuperar actualización</a> · <a href="instalar.html">Comprobar logo e instalación</a></p><p id="rfOffline">${esc(offlineMessage)}</p><p>Diccionario, traducción y revisión gramatical consultan servicios externos con el texto seleccionado y necesitan internet. El historial conserva hasta 200 consultas disponibles para revisar. La pronunciación depende de las voces de tu dispositivo. No incluye explicaciones generadas por IA.</p><p>ReadFlow 2.1.1 · Alojamiento independiente bajo tu control. Los datos se guardan en este navegador.</p>`);
  $('rfExport').onclick=async()=>{const button=$('rfExport');button.disabled=true;try{await window.ReadFlowApp?.flush();await chain;download(await S.exportAll(),'ReadFlow-respaldo-'+new Date().toISOString().slice(0,10)+'.json');notify('Respaldo generado. Comprueba que se descargó antes de cambiar de navegador.');}catch(e){error(e);}finally{button.disabled=false;}};
  $('rfImport').onclick=()=>$('rfBackupInput').click();$('rfInstall').onclick=install;$('rfCheck').onclick=()=>checkUpdates(true);$('rfApply').onclick=applyUpdate;updateNotice();
  $('rfPersist').onclick=async()=>{try{const ok=await navigator.storage?.persist?.();notify(ok?'El navegador aceptó conservar los datos. Mantén también un respaldo.':'El navegador no concedió almacenamiento persistente. Exporta respaldos con frecuencia.');}catch(e){error(e);}};
 }
 const APP_VERSION='2.1.1';let availableVersion=null,checking=false,updateMessage='Las novedades se comprueban al abrir la app.';
 let installPrompt,registration,offlineMessage='Preparando disponibilidad sin conexión…';
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
 async function install(){if(installPrompt){await installPrompt.prompt();installPrompt=null;}else notify('Android: Chrome → ⋮ → Instalar. iPhone: Safari → Compartir → Agregar a pantalla de inicio.');}
 function setUpdateMessage(text){updateMessage=text;if($('rfUpdateStatus'))$('rfUpdateStatus').textContent=text;}
 function updateNotice(){
  if($('rfUpdateStatus'))$('rfUpdateStatus').textContent=updateMessage;
  if(registration?.waiting||availableVersion){$('rfUpdate').hidden=false;$('rfUpdate').textContent='Actualizar ReadFlow'+(availableVersion?' · '+availableVersion:'');if($('rfApply'))$('rfApply').hidden=false;}
 }
 async function checkUpdates(manual=false){
  if(checking)return;checking=true;if($('rfCheck'))$('rfCheck').disabled=true;setUpdateMessage('Buscando una versión nueva…');
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),12000);
  try{
   const response=await fetch('./version.json?check='+Date.now(),{credentials:'same-origin',cache:'no-store',signal:abort.signal});
   if(!response.ok)throw Error('El servidor respondió '+response.status);
   if(!(response.headers.get('content-type')||'').includes('json')){setUpdateMessage('El alojamiento devolvió una página en lugar de la versión. Abre ReadFlow en Chrome y comprueba la dirección del alojamiento.');return;}
   const latest=await response.json();if(typeof latest.version!=='string')throw Error('Versión no válida');
   if(latest.version!==APP_VERSION){availableVersion=latest.version;setUpdateMessage('Nueva versión '+latest.version+' disponible. Pulsa Actualizar ReadFlow.');updateNotice();if(manual)notify('Nueva versión disponible en el menú Actualizaciones.');}
   else{setUpdateMessage('Ya tienes la versión actual: '+APP_VERSION);if(manual)notify('ReadFlow está actualizada ('+APP_VERSION+').');}
   registration?.update().then(updateNotice).catch(()=>{});
  }catch(e){setUpdateMessage(e.name==='AbortError'?'El servidor tardó demasiado. Reintenta o usa Recuperar actualización.':'No se recibió una respuesta del servidor. Puede ser el alojamiento o el servicio; no necesariamente tu conexión.');}
  finally{clearTimeout(timer);checking=false;if($('rfCheck'))$('rfCheck').disabled=false;}
 }
 async function refreshApplication(){
  await window.ReadFlowApp?.flush();await chain;
  if('serviceWorker'in navigator){const current=await navigator.serviceWorker.getRegistration('./');if(current)await current.unregister();}
  if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('readflow-shell-')).map(k=>caches.delete(k)));}
  // User books and settings remain in IndexedDB; only application files are refreshed.
  window.ReadFlowApp?.suspendWrites();location.replace('./?updated='+Date.now());
 }
 async function applyUpdate(){try{$('rfUpdate').disabled=true;if($('rfApply'))$('rfApply').disabled=true;await refreshApplication();}catch(e){$('rfUpdate').disabled=false;if($('rfApply'))$('rfApply').disabled=false;setUpdateMessage('No se pudo aplicar la actualización: '+e.message+'. Usa Recuperar actualización.');}}
 async function updates(){show('Actualizaciones de ReadFlow',`<p>Versión actual: ${APP_VERSION}</p><p>Cuando publiquemos novedades, esta misma instalación podrá cargarlas. Se conservan los libros, el progreso, las notas y las palabras guardadas en este navegador.</p><button id="rfCheck">Buscar actualizaciones</button><button id="rfApply" hidden>Actualizar ReadFlow</button><p id="rfUpdateStatus" role="status"></p><p><a href="actualizar.html">Recuperar actualización</a></p><p><a href="instalar.html">Comprobar logo e instalación</a></p>`);$('rfCheck').onclick=()=>checkUpdates(true);$('rfApply').onclick=applyUpdate;updateNotice();}
 async function initialize(){
  $('rfUpdates').onclick=()=>updates().catch(error);$('rfNotebook').onclick=()=>notebook().catch(error);$('rfBackups').onclick=()=>backups().catch(error);$('rfClose').onclick=()=>$('rfDialog').close();
  $('rfAnalyzeSelection').onpointerdown=e=>e.preventDefault();$('rfAnalyzeSelection').onclick=event=>{event.stopPropagation();const text=offerSelection.text;if(text&&selectedController){$('rfAnalyzeSelection').hidden=true;selectedController.openAnalysis(text,{blockText:offerSelection.block}).catch(error);}};
  $('rfBackupInput').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>150*1024*1024)throw Error('El respaldo supera 150 MB.');const incoming=validateBackup(JSON.parse(await file.text()));if(!confirm(`¿Importar ${incoming.books.length} libros y combinar los datos? En coincidencias del mismo libro o palabra prevalece el respaldo. Los elementos exclusivos de este navegador se conservan.`))return;
   await window.ReadFlowApp?.flush();await chain;
   await enqueue(async()=>{const current=await S.exportAll();const merged=await mergeBackup(current,incoming);await S.importAll(merged);});
   // Prevent stale book progress from overwriting the imported position during page exit.
   window.ReadFlowApp.suspendWrites();location.reload();
  }catch(e){error(e);}finally{e.target.value='';}};
  if('serviceWorker'in navigator&&location.protocol==='https:'){
   navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{registration=r;updateNotice();r.addEventListener('updatefound',()=>{const w=r.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed')updateNotice();});});navigator.serviceWorker.ready.then(()=>{offlineMessage='La app y los libros importados están guardados para abrir sin conexión en este navegador.';if($('rfOffline'))$('rfOffline').textContent=offlineMessage;});}).catch(()=>{offlineMessage='Modo en línea activo. La búsqueda de actualizaciones sigue disponible.';if($('rfOffline'))$('rfOffline').textContent=offlineMessage;});
  }else offlineMessage='Abre el enlace HTTPS de ReadFlow para instalar y actualizar.';
  $('rfUpdate').onclick=applyUpdate;
  window.addEventListener('online',()=>checkUpdates(false));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkUpdates(false);});
  if(location.protocol==='https:')checkUpdates(false);
 }
 document.addEventListener('DOMContentLoaded',()=>initialize().catch(error));
 return {save,remember,cached,notify,offerSelection,validateBackup,mergeBackup};
})();
