(() => {
  let installPrompt = null;
  const controls = document.querySelectorAll('[data-install], [data-install-separator]');
  const updateControls = () => {
    controls.forEach(control => { control.hidden = !installPrompt; });
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateControls();
  });

  document.querySelectorAll('[data-install]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!installPrompt) return;
      const prompt = installPrompt;
      installPrompt = null;
      updateControls();
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (error) {
        console.warn('無法開啟安裝視窗', error);
      }
    });
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    updateControls();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(error => {
        console.warn('離線功能暫時無法使用', error);
      });
    });
  }
})();
