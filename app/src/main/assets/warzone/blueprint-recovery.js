/* Recover saved engine templates from the local IDBFS configuration databases. */
(async () => {
  'use strict';
  const bridge = window.AndroidBlueprintRecovery;
  const maxBytes = 512 * 1024;
  const decoder = new TextDecoder('utf-8', {fatal:true});
  const warzoneDatabase = /^\/warzone2100(?:-[a-z0-9_][a-z0-9_.-]*)?$/i;

  function openExisting(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function recoverDatabase(name) {
    const db = await openExisting(name);
    try {
      if (!db.objectStoreNames.contains('FILE_DATA')) return;
      const prefix = name + '/userdata/';
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('FILE_DATA', 'readonly');
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
        const store = transaction.objectStore('FILE_DATA');
        const keys = store.openKeyCursor(range);
        keys.onsuccess = () => {
          const cursor = keys.result;
          if (!cursor) return;
          if (!/^[^/]+\/templates\.json$/.test(cursor.key.slice(prefix.length))) {
            cursor.continue();
            return;
          }
          const entry = store.get(cursor.key);
          entry.onsuccess = () => {
            const data = entry.result?.contents;
            if (data && data.byteLength <= maxBytes) {
              try { bridge.importNativeTemplates(decoder.decode(data)); }
              catch (_) { /* Keep unreadable source files as-is. */ }
            }
            cursor.continue();
          };
        };
      });
    } finally {
      db.close();
    }
  }

  let ok = true;
  try {
    try { ok = bridge.importLegacyDesigns(localStorage.getItem('wt-designs-v1') || ''); }
    catch (_) { ok = false; }
    if (typeof indexedDB.databases === 'function') {
      const databases = await indexedDB.databases();
      for (const {name} of databases) {
        if (!warzoneDatabase.test(name)) continue;
        try { await recoverDatabase(name); }
        catch (_) { /* The matching game can retry from its mounted filesystem. */ }
      }
    }
  } catch (_) {
    ok = false;
  } finally {
    bridge.complete(ok);
  }
})();
