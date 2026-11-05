/* Wrapper sizing is managed by the host; native display-scale tips are redundant. */
(() => {
  'use strict';
  window.WarzoneNativeNotifications = {
    prepare(module, configDir) {
      const path = configDir + '/notifications.json';
      let prefs;
      try { prefs = JSON.parse(module.FS.readFile(path, { encoding: 'utf8' })); } catch (_) {}
      const object = value => value && typeof value === 'object' && !Array.isArray(value);
      if (!object(prefs)) prefs = {};
      if (!object(prefs.notifications)) prefs.notifications = {};
      const notices = prefs.notifications;
      const prompt = 'displayscale::prompt_increase', tip = 'displayscale::tip';
      notices[prompt] = { ...(object(notices[prompt]) ? notices[prompt] : {}), skip: true };
      notices[tip] = { ...(object(notices[tip]) ? notices[tip] : {}), seen: Math.max(1, Number(notices[tip]?.seen) || 0) };
      module.FS.writeFile(path, JSON.stringify(prefs), { encoding: 'utf8' });
    }
  };
})();
