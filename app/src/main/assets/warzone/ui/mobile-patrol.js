/* Shared, one-shot destination selection for native Patrol orders. */
(() => {
  'use strict';
  const path = '/tmp/warzone-mobile-patrol.json';
  function write(fs, request) {
    fs.writeFile(path + '.tmp', JSON.stringify(request), {encoding:'utf8'});
    fs.rename(path + '.tmp', path);
  }

  class MobilePatrolInput {
    armed = '';
    pending = null;
    status = '';
    serial = 0;

    toggle(context, force = !this.armed) {
      if (this.pending) return false;
      this.armed = force ? context || '' : '';
      this.status = this.armed ? 'Tap destination' : '';
      return Boolean(this.armed);
    }

    cancel() {
      const hadTool = Boolean(this.armed || this.pending);
      this.armed = '';
      this.clearPending();
      this.status = '';
      return hadTool;
    }

    clearPending() {
      const pending = this.pending;
      this.pending = null;
      if (!pending) return;
      clearTimeout(pending.timer);
      try {
        const request = JSON.parse(pending.fs.readFile(path, {encoding:'utf8'}));
        if (request.nonce === pending.nonce)
          write(pending.fs, {nonce: pending.nonce + '-cancel', context:''});
      } catch (_) { }
    }

    place(x, y, rect, fs, context) {
      if (!this.armed) return false;
      const targetContext = this.armed;
      this.armed = '';
      if (!context || context !== targetContext || !rect || !rect.width || !rect.height || !fs) {
        this.status = 'Patrol cancelled';
        return true;
      }
      const nonce = 'patrol-' + Date.now() + '-' + (++this.serial);
      try {
        write(fs, {nonce, context, x:(x - rect.left) / rect.width, y:(y - rect.top) / rect.height});
        this.status = 'Setting patrol…';
        const pending = {nonce, context, fs};
        pending.timer = setTimeout(() => {
          if (this.pending !== pending) return;
          this.clearPending();
          this.status = 'Patrol could not be confirmed';
        }, 1600);
        this.pending = pending;
      } catch (_) {
        this.status = 'Patrol unavailable';
      }
      return true;
    }

    observe(ack, context) {
      if (this.armed && this.armed !== context || this.pending && this.pending.context !== context)
        this.cancel();
      if (!this.pending || ack?.nonce !== this.pending.nonce || ack.context !== context) return;
      clearTimeout(this.pending.timer);
      this.pending = null;
      this.status = ack.count > 0 ? '' : ack.reason === 'select-combat' ? 'Select combat units first'
        : ack.reason === 'stale-world' ? 'Patrol cancelled'
        : 'No selected combat units can reach that spot';
    }
  }
  window.MobilePatrolInput = MobilePatrolInput;
})();
