'use strict';

window.WordFlowStreak = (() => {
  const goal = 10;
  const byId = id => document.getElementById(id);
  const dateFormat = new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const dayMs = 86400000;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const optionsKey = 'wordflow_reminder_settings_v1';
  const app = byId('streakPanel');
  const week = Array.from(byId('streakWeek').children);
  const progressBar = byId('streakProgress');
  const reminderFields = byId('reminderHours');
  const reminderStatus = byId('reminderStatus');
  let database, displayedCard, completionTimer, syncTimer, syncRequested = false;
  let reminderConfig, requestQueue = Promise.resolve(), reminderBusy = false;
  let summary;
  let settings = { times: ['18:00', '20:00'], enabled: false, device: null };

  try {
    const saved = JSON.parse(localStorage.getItem(optionsKey) || 'null');
    if (saved && Array.isArray(saved.times)) {
      settings = {
        times: [...new Set(saved.times.filter(time => typeof time === 'string' && timePattern.test(time)))].sort(),
        enabled: saved.enabled === true,
        device: saved.device || null
      };
    }
  } catch {}

  function localDay(value = new Date()) {
    const part = number => String(number).padStart(2, '0');
    return value.getFullYear() + '-' + part(value.getMonth() + 1) + '-' + part(value.getDate());
  }

  function toDay(date) {
    return Date.parse(date + 'T00:00:00Z') / dayMs;
  }

  function dateKey(day) {
    return new Date(day * dayMs).toISOString().slice(0, 10);
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\d$/.test(value)) return false;
    const day = toDay(value);
    return Number.isFinite(day) && dateKey(day) === value;
  }

  function cardKey(card) {
    return JSON.stringify([card.w, card.es].map(text => text.trim().normalize('NFKC').toLowerCase()));
  }

  function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('wordflow-streak-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('progress');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      database = null;
      throw error;
    });
    return database;
  }

  async function accessHistory(change) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('progress', change ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('progress');
      const request = store.get('history');
      let history, result, failure;
      request.onsuccess = () => {
        history = request.result || {};
        try {
          if (change) {
            result = change(history);
            if (result !== false) store.put(history, 'history');
          }
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve({ history, result });
      transaction.onabort = () => reject(failure || transaction.error || Error('No se pudo guardar la racha.'));
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function summarize(history, date = localDay()) {
    const today = toDay(date);
    const days = Object.keys(history).filter(key => validDate(key) && key <= date).sort();
    const todayRecord = history[date];
    const completed = new Set(days.filter(day => history[day].cards.length >= goal).map(toDay));
    let record = 0;
    let series = 0;
    let previous = -Infinity;
    for (const day of completed) {
      series = day === previous + 1 ? series + 1 : 1;
      record = Math.max(record, series);
      previous = day;
    }
    let current = 0;
    for (let day = completed.has(today) ? today : today - 1; completed.has(day); day--) current++;
    const weekday = new Date(today * dayMs).getUTCDay();
    const monday = today - ((weekday + 6) % 7);
    return {
      date, today, monday, completed, record, current,
      count: todayRecord?.cards.length || 0,
      cards: todayRecord?.cards || [],
      lastPack: days.length ? history[days.at(-1)].pack : null,
      lastActive: days.filter(day => day < date).at(-1),
      hasHistory: days.length > 0
    };
  }

  function render(history) {
    summary = summarize(history);
    const { count, current, record, hasHistory, lastActive, today, monday, completed } = summary;
    const done = count >= goal;
    const returned = count === 0 && lastActive && today - toDay(lastActive) > 1;
    app.dataset.complete = String(done);
    byId('streakHeading').textContent = done ? '¡Racha asegurada por hoy!' :
      returned ? '¡Qué bueno que volviste!' : hasHistory ? '¡Qué gusto verte!' : '¡Bienvenido a WordFlow!';
    const left = goal - count;
    byId('streakCaption').textContent = done ? 'Cada día de práctica cuenta.' :
      returned ? 'Hoy puedes empezar otra racha. Tu récord sigue contigo.' :
      left === goal ? 'Abre 10 tarjetas distintas para completar el día.' :
      left === 1 ? 'Te falta abrir una tarjeta distinta.' : 'Te faltan ' + left + ' tarjetas distintas.';
    byId('streakCurrent').textContent = current + (current === 1 ? ' día' : ' días');
    byId('streakBest').textContent = 'Récord: ' + record + (record === 1 ? ' día' : ' días');
    byId('streakCount').textContent = count + '/' + goal;
    byId('studyStreakCount').textContent = done ? '¡Racha asegurada por hoy!' : 'Racha de hoy · ' + count + '/' + goal;
    byId('streakContinue').textContent = done ? 'Seguir practicando' : 'Continuar racha';
    progressBar.value = count;
    week.forEach((item, index) => {
      const day = monday + index;
      const date = new Date(day * dayMs);
      item.dataset.dayState = completed.has(day) ? 'complete' : day === today ? 'today' : 'empty';
      item.lastElementChild.textContent = completed.has(day) ? '✓' : '·';
      item.setAttribute('aria-label', dateFormat.format(date) +
        (completed.has(day) ? ', completado' : day === today ? ', hoy' : ''));
      if (day === today) item.setAttribute('aria-current', 'date');
      else item.removeAttribute('aria-current');
    });
    app.hidden = false;
  }

  function stopCelebration() {
    clearTimeout(completionTimer);
    const dialog = byId('streakCelebration');
    if (dialog.open) dialog.close();
  }

  function celebrate(current) {
    byId('streakToast').textContent = '¡Racha asegurada por hoy! ' + current + (current === 1 ? ' día.' : ' días seguidos.');
    byId('studyStreak').classList.remove('streak-earned');
    requestAnimationFrame(() => byId('studyStreak').classList.add('streak-earned'));
    if (current % 5 !== 0 || document.visibilityState !== 'visible') return;
    const dialog = byId('streakCelebration');
    dialog.dataset.gold = String(current === 30);
    byId('milestoneDays').textContent = current + ' días de racha';
    if (!dialog.open) dialog.showModal();
    completionTimer = setTimeout(stopCelebration, 2200);
  }

  const reportStorageError = () => {
    app.hidden = false;
    byId('streakCaption').textContent = 'No se pudo guardar la racha en este navegador.';
  };

  async function refresh() {
    try {
      const { history } = await accessHistory();
      render(history);
    } catch {
      reportStorageError();
    }
  }

  async function record(card, pack) {
    if (!card || document.visibilityState === 'hidden') return;
    const date = localDay();
    const key = cardKey(card);
    if (summary?.date === date && (summary.count >= goal || summary.cards.includes(key))) return;
    try {
      const { history, result: counted } = await accessHistory(history => {
        const entry = history[date] || { cards: [], pack };
        if (entry.cards.length >= goal || entry.cards.includes(key)) return false;
        entry.cards.push(key);
        entry.pack = pack;
        history[date] = entry;
        return true;
      });
      render(history);
      if (counted) {
        const completed = summary.date === date && summary.count === goal;
        scheduleSync(completed);
        if (completed) celebrate(summary.current);
      }
    } catch {
      reportStorageError();
    }
  }

  function shownCard(card, pack) {
    displayedCard = { card, pack };
    if (card) record(card, pack);
  }

  function resume() {
    const viewed = new Set(summary?.cards || []);
    const start = Number.isInteger(summary?.lastPack) && PACKS[summary.lastPack] ? summary.lastPack : 0;
    for (let offset = 0; offset < PACKS.length; offset++) {
      const pack = (start + offset) % PACKS.length;
      const position = PACKS[pack].findIndex(card => !viewed.has(cardKey(card)));
      if (position !== -1) {
        openPack(pack, position);
        window.scrollTo(0, 0);
        return;
      }
    }
  }

  function validateBackup(value) {
    if (value == null) return {};
    if (value.version !== 1 || !value.days || Array.isArray(value.days) || typeof value.days !== 'object') {
      throw Error('El historial de racha del respaldo no es válido.');
    }
    const days = Object.entries(value.days);
    if (days.length > 40000) throw Error('El historial de racha es demasiado grande.');
    for (const [date, entry] of days) {
      if (!validDate(date) || !entry || !Array.isArray(entry.cards) || entry.cards.length > goal ||
          entry.cards.some(card => typeof card !== 'string' || !card.length || card.length > 1200) ||
          !Number.isInteger(entry.pack) || entry.pack < 0 || entry.pack > 10000) {
        throw Error('El historial de racha contiene una fecha o tarjeta no válida.');
      }
    }
    return Object.fromEntries(days.map(([date, entry]) => [date, { cards: [...new Set(entry.cards)], pack: entry.pack }]));
  }

  async function importBackup(incoming) {
    if (!Object.keys(incoming).length) return;
    const { history } = await accessHistory(history => {
      for (const [date, entry] of Object.entries(incoming)) {
        const existing = history[date];
        history[date] = {
          cards: [...new Set([...(existing?.cards || []), ...entry.cards])].slice(0, goal),
          pack: existing?.pack ?? entry.pack
        };
      }
    });
    render(history);
    scheduleSync();
  }

  async function exportBackup() {
    const { history } = await accessHistory();
    return { version: 1, days: history };
  }

  function setReminderStatus(text) {
    reminderStatus.textContent = text;
  }

  function storeSettings() {
    localStorage.setItem(optionsKey, JSON.stringify(settings));
  }

  async function getConfig() {
    if (!reminderConfig) {
      const response = await fetch('./reminders.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const config = await response.json();
      if (!response.ok || !config.endpoint || !config.publicKey) {
        throw Error('El servicio de avisos del celular aún no está conectado.');
      }
      reminderConfig = config;
    }
    return reminderConfig;
  }

  function pushAvailable() {
    return 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
  }

  function base64Key(key) {
    return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)),
      character => character.charCodeAt(0));
  }

  function ensureDevice() {
    if (!settings.device) {
      const password = Array.from(crypto.getRandomValues(new Uint8Array(32)),
        byte => byte.toString(16).padStart(2, '0')).join('');
      settings.device = { id: crypto.randomUUID(), password };
      storeSettings();
    }
    return settings.device;
  }

  async function send(action, fields = {}) {
    const config = await getConfig();
    const device = ensureDevice();
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + device.password },
      body: JSON.stringify({ action, deviceId: device.id, ...fields }),
      signal: AbortSignal.timeout(12000),
      keepalive: action === 'progress',
      redirect: 'error'
    });
    if (!response.ok) {
      const error = Error(response.status === 429 ? 'Espera un momento antes de volver a probar.' :
        'No se pudo sincronizar el aviso. Vuelve a intentarlo con internet.');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function post(action, fields) {
    const request = requestQueue.then(() => send(action, fields));
    requestQueue = request.catch(() => {});
    return request;
  }

  function reminderProgress() {
    return {
      date: summary?.date || localDay(),
      count: summary?.count || 0,
      streak: summary?.current || 0,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    };
  }

  function scheduleSync(immediate = false) {
    if (!settings.enabled) return;
    syncRequested = true;
    clearTimeout(syncTimer);
    const sync = async () => {
      if (!settings.enabled || reminderBusy || !navigator.onLine || !syncRequested) return;
      syncRequested = false;
      try {
        await send('progress', reminderProgress());
      } catch (error) {
        syncRequested = true;
        if (error.status === 404) setReminderStatus('Vuelve a activar los avisos para conectar este teléfono.');
        else setReminderStatus('Tu avance se guardó. Los avisos se sincronizarán al volver a abrir WordFlow con internet.');
      }
    };
    if (immediate) sync();
    else syncTimer = setTimeout(sync, 380);
  }

  function makeTimeField(time, index) {
    const row = document.createElement('div');
    row.className = 'reminder-hour';
    const input = document.createElement('input');
    input.type = 'time';
    input.value = time;
    input.required = true;
    input.setAttribute('aria-label', 'Hora del aviso ' + (index + 1));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Quitar';
    remove.setAttribute('aria-label', 'Quitar aviso ' + (index + 1));
    remove.addEventListener('click', () => row.remove());
    row.append(input, remove);
    return row;
  }

  function readHours() {
    const times = [...new Set(Array.from(reminderFields.querySelectorAll('input'),
      input => input.value).filter(Boolean))].sort();
    if (!times.length) throw Error('Agrega por lo menos una hora.');
    if (times.length > 24) throw Error('Elige hasta 24 horas distintas.');
    if (times.some(time => !timePattern.test(time))) throw Error('Revisa las horas de tus avisos.');
    return times;
  }

  function renderReminders() {
    reminderFields.replaceChildren(...settings.times.map(makeTimeField));
    byId('reminderSubmit').textContent = settings.enabled ? 'Guardar horarios' : 'Activar avisos';
    byId('reminderTest').hidden = !settings.enabled;
    byId('reminderDisable').hidden = !settings.enabled;
  }

  async function reminderAction(action) {
    if (reminderBusy) return;
    reminderBusy = true;
    const controls = Array.from(byId('reminderForm').querySelectorAll('button, input'));
    controls.forEach(control => { control.disabled = true; });
    try {
      await action();
    } catch (error) {
      setReminderStatus(error.message);
    } finally {
      reminderBusy = false;
      controls.forEach(control => { control.disabled = false; });
      if (syncRequested) scheduleSync();
    }
  }

  byId('streakContinue').addEventListener('click', resume);
  byId('closeMilestone').addEventListener('click', stopCelebration);
  byId('streakCelebration').addEventListener('close', () => clearTimeout(completionTimer));
  byId('streakReminder').addEventListener('click', () => {
    renderReminders();
    byId('streakReminderDialog').showModal();
    if (!pushAvailable()) setReminderStatus('Abre WordFlow desde Chrome en Android para configurar avisos.');
    else if (settings.enabled && Notification.permission === 'granted') setReminderStatus('Avisos activos en este dispositivo.');
    else if (settings.enabled) setReminderStatus('Devuelve el permiso de notificaciones en Chrome para recibir avisos.');
    else getConfig().catch(error => setReminderStatus(error.message));
  });
  byId('closeReminders').addEventListener('click', () => byId('streakReminderDialog').close());
  byId('reminderAdd').addEventListener('click', () => {
    const row = makeTimeField('', reminderFields.children.length);
    reminderFields.append(row);
    row.querySelector('input').focus();
  });
  byId('reminderForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!pushAvailable()) {
      setReminderStatus('Este navegador no permite avisos de WordFlow.');
      return;
    }
    reminderAction(async () => {
      const times = readHours();
      if (!reminderConfig) {
        await getConfig();
        setReminderStatus('Toca Activar avisos para permitirlos en este dispositivo.');
        return;
      }
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw Error('Permite las notificaciones de WordFlow en Chrome para activar los avisos.');
      const serviceWorker = await navigator.serviceWorker.getRegistration('./');
      if (!serviceWorker?.active) throw Error('Vuelve a abrir WordFlow con internet para terminar la instalación.');
      let subscription = await serviceWorker.pushManager.getSubscription();
      if (!subscription) subscription = await serviceWorker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64Key(reminderConfig.publicKey)
      });
      await post('subscribe', { subscription: subscription.toJSON(), times, ...reminderProgress() });
      settings.times = times;
      settings.enabled = true;
      storeSettings();
      renderReminders();
      setReminderStatus('Avisos activos en este dispositivo a las ' + times.join(', ') + '.');
    });
  });
  byId('reminderTest').addEventListener('click', () => reminderAction(async () => {
    await post('test');
    setReminderStatus('Aviso de prueba enviado. Revisa las notificaciones de tu celular.');
  }));
  byId('reminderDisable').addEventListener('click', () => reminderAction(async () => {
    const serviceWorker = await navigator.serviceWorker.getRegistration('./');
    const subscription = await serviceWorker?.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    settings.enabled = false;
    storeSettings();
    renderReminders();
    setReminderStatus('Avisos desactivados en este dispositivo.');
    await post('disable').catch(() => {});
  }));

  async function refreshAndSync() {
    await refresh();
    if (displayedCard?.card) record(displayedCard.card, displayedCard.pack);
    scheduleSync();
  }

  window.addEventListener('online', refreshAndSync);
  window.addEventListener('focus', refreshAndSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAndSync();
  });
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'WORDFLOW_CONTINUE_STREAK') resume();
  });
  refresh().then(() => {
    if (new URL(location.href).searchParams.get('streak') === 'continue') resume();
    scheduleSync();
  });

  return { shownCard, validateBackup, importBackup, exportBackup };
})();
