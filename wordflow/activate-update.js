'use strict';

window.activateWordFlowUpdate = async function () {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('./');
  if (!registration) return;
  if (!registration.waiting && !registration.installing) await registration.update();
  const candidate = registration.waiting || registration.installing;
  if (!candidate) return;

  await new Promise((resolve, reject) => {
    let requestedActivation = false;
    const timer = setTimeout(() => finish(Error('La actualización tardó demasiado. Intenta abrir WordFlow de nuevo.')), 25000);

    function finish(error) {
      clearTimeout(timer);
      candidate.removeEventListener('statechange', onStateChange);
      if (error) reject(error);
      else resolve();
    }

    function onStateChange() {
      if (candidate.state === 'activated') finish();
      else if (candidate.state === 'redundant') finish(Error('El navegador no pudo preparar la actualización.'));
      else if (candidate.state === 'installed' && !requestedActivation) {
        requestedActivation = true;
        candidate.postMessage({ type: 'SKIP_WAITING' });
      }
    }

    candidate.addEventListener('statechange', onStateChange);
    onStateChange();
  });
};
