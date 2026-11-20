(() => {
  'use strict';
  if (window.NativeBattleControls || !window.AndroidBattleControls) return;

  const selector = '#blocknight-combat-hud button, #lab-ops > button, #wt-field-centre button, #wt-field-toggle, #warzone-towers-next-wave';
  const menuSelector = [
    '#wt-command-pages', '#wt-build-sidebar', '#wt-build-status', '#wt-status-panel', '#blocknight-research-shell',
    '#wt-map-music-menu', '#warzone-towers-help', '#wt-intelligence-panel', '#mp-intelligence',
    '#wt-demolish-bar',
  ].map(id => id + ' button').concat(
    '#wt-wave-incoming > button', '#wt-native-back', '#wt-campaign-native-back', '#wt-players-native-back',
  ).join(', ');
  const buildMenu = '#wt-build-sidebar, #wt-command-pages[data-page="build"]';
  const generation = window.androidBattleGeneration;

  const ids = new WeakMap();
  const replaced = new Map();
  const observedDocuments = new WeakSet();
  let sequence = 0, candidates = new Map(), scrollers = new Map(), previous = '', sampleFrame = 0;
  let buildScroll = null, buildSettleTimer = 0;
  let steeringTarget = null, steeringSerial = 0;
  const steeringPath = '/tmp/warzone-mobile-steering.json';
  const steeringSession = 'steering-' + Date.now() + '-' + generation + '-';
  const n = value => parseFloat(value) || 0;
  const rect = (box, x = 0, y = 0) =>
    [box.left - x, box.top - y, box.right - x, box.bottom - y].map(v => Math.round(v * 100) / 100);
  const cssOf = (element, pseudo) => element.ownerDocument.defaultView.getComputedStyle(element, pseudo);

  function visible(button, box) {
    if (!(box.width > 0 && box.height > 0)) return false;
    const css = cssOf(button);
    return !button.closest('[hidden],[inert]') && css.visibility === 'visible' && Number(css.opacity) > 0;
  }

  function contextFor(doc, frame = null) {
    const window = doc.defaultView;
    const bounds = frame?.getBoundingClientRect();
    const x = frame ? bounds.left + frame.clientLeft : 0;
    const y = frame ? bounds.top + frame.clientTop : 0;
    const clip = [x, y, x + window.innerWidth, y + window.innerHeight];
    const context = {doc, x, y, frame, clip, cache:new WeakMap(), opacity:1};
    if (frame) {
      const parent = clipping(frame, topContext());
      clip[0] = Math.max(clip[0], parent.clip[0]); clip[1] = Math.max(clip[1], parent.clip[1]);
      clip[2] = Math.min(clip[2], parent.clip[2]); clip[3] = Math.min(clip[3], parent.clip[3]);
      context.opacity = parent.opacity * Number(cssOf(frame).opacity);
    }
    return context;
  }

  function topContext() { return contextFor(document); }

  function clipping(button, context) {
    const clip = [...context.clip];
    let scrollX = null, scrollY = null, opacity = context.opacity;
    for (let parent = button.parentElement; parent; parent = parent.parentElement) {
      let cached = context.cache.get(parent);
      if (!cached) {
        cached = {css:cssOf(parent), bounds:parent.getBoundingClientRect()};
        context.cache.set(parent, cached);
      }
      const {css, bounds} = cached;
      opacity *= Number(css.opacity);
      if (!['visible', 'unset'].includes(css.overflowX)) {
        const left = bounds.left + parent.clientLeft + context.x;
        clip[0] = Math.max(clip[0], left);
        clip[2] = Math.min(clip[2], left + parent.clientWidth);
        if (!scrollX && ['auto', 'scroll'].includes(css.overflowX) &&
            parent.scrollWidth > parent.clientWidth + 1) scrollX = parent;
      }
      if (!['visible', 'unset'].includes(css.overflowY)) {
        const top = bounds.top + parent.clientTop + context.y;
        clip[1] = Math.max(clip[1], top);
        clip[3] = Math.min(clip[3], top + parent.clientHeight);
        if (!scrollY && ['auto', 'scroll'].includes(css.overflowY) &&
            parent.scrollHeight > parent.clientHeight + 1) scrollY = parent;
      }
    }
    return {clip, opacity, scrollX, scrollY};
  }

  function exposed(button, box, clip, context) {
    const left = Math.max(box.left + context.x, clip[0]), top = Math.max(box.top + context.y, clip[1]);
    const right = Math.min(box.right + context.x, clip[2]), bottom = Math.min(box.bottom + context.y, clip[3]);
    if (right <= left || bottom <= top) return false;
    // Any covering sheet or dialog gets its normal WebView z-order and input.
    return [0.1, 0.5, 0.9].every(fraction => {
      const x = left + (right - left) * fraction;
      return [top + (bottom - top) * 0.1, top + (bottom - top) * 0.9].every(y =>
        (!context.frame || document.elementFromPoint(x, y) === context.frame) &&
        button.contains(context.doc.elementFromPoint(x - context.x, y - context.y)));
    });
  }

  function textParts(button, box, context, menu) {
    const parts = [], walker = context.doc.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    const range = context.doc.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const words = /\S(?:.*\S)?/.exec(node.textContent);
      if (!words) continue;
      const parent = node.parentElement;
      const css = cssOf(parent);
      if (css.visibility !== 'visible') continue;
      const start = words.index, end = start + words[0].length;
      range.setStart(node, start);
      range.setEnd(node, end);
      const lines = [...range.getClientRects()];
      if (!lines.length) continue;
      const add = (line, from, to) => {
        let text = node.textContent.slice(from, to).trim();
        if (css.textTransform === 'uppercase') text = text.toUpperCase();
        if (css.textTransform === 'lowercase') text = text.toLowerCase();
        if (!text || !line.width || !line.height) return;
        const part = {text, box:rect(line, box.left, box.top), color:css.color,
          size:n(css.fontSize), family:css.fontFamily, weight:n(css.fontWeight) || 400};
        if (parent.classList.contains('wt-incoming-arrow') && button.getAttribute('aria-expanded') === 'true')
          part.rotation = 180;
        if (menu && parent !== button && css.overflowX !== 'visible') {
          part.clip = rect(parent.getBoundingClientRect(), box.left, box.top);
          part.ellipsis = css.textOverflow === 'ellipsis';
        }
        parts.push(part);
      };
      if (lines.length === 1) {
        add(lines[0], start, end);
      } else {
        let first = start, top = lines[0].top;
        for (let index = start + 1; index < end; index++) {
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const letter = range.getBoundingClientRect();
          if (!letter.width || Math.abs(letter.top - top) < 0.5) continue;
          range.setStart(node, first);
          range.setEnd(node, index);
          add(range.getBoundingClientRect(), first, index);
          first = index;
          top = letter.top;
        }
        range.setStart(node, first);
        range.setEnd(node, end);
        add(range.getBoundingClientRect(), first, end);
      }
    }
    return parts;
  }

  function vectorPart(shape) {
    const style = cssOf(shape);
    const kind = shape.localName;
    let geometry;
    if (kind === 'circle') {
      geometry = [shape.cx.baseVal.value, shape.cy.baseVal.value, shape.r.baseVal.value];
    } else if (kind === 'rect') {
      const x = shape.x.baseVal.value, y = shape.y.baseVal.value;
      const width = shape.width.baseVal.value, height = shape.height.baseVal.value;
      const rx = shape.rx.baseVal.value, ry = shape.ry.baseVal.value;
      geometry = [x, y, x + width, y + height,
        Math.min(shape.hasAttribute('rx') ? rx : ry, width / 2),
        Math.min(shape.hasAttribute('ry') ? ry : rx, height / 2)];
    }
    return {kind, geometry, data:shape.getAttribute('d'), fill:style.fill, fillRule:style.fillRule,
      fillOpacity:Number(style.fillOpacity) * Number(style.opacity),
      stroke:style.stroke, strokeOpacity:Number(style.strokeOpacity) * Number(style.opacity),
      strokeWidth:n(style.strokeWidth), cap:style.strokeLinecap, join:style.strokeLinejoin,
      miter:n(style.strokeMiterlimit)};
  }

  function iconParts(button, box, menu) {
    return [...button.querySelectorAll('img, svg')].flatMap(icon => {
      const bounds = icon.getBoundingClientRect(), css = cssOf(icon);
      if (!bounds.width || !bounds.height || css.visibility !== 'visible') return [];
      const item = {box:rect(bounds, box.left, box.top), filter:css.filter, opacity:Number(css.opacity)};
      if (icon.localName === 'img') {
        if (!icon.complete || !icon.naturalWidth) return menu ? [null] : [];
        const src = new URL(icon.currentSrc || icon.src, location.href);
        if (src.origin !== location.origin ||
            !/^\/warzone\/(ui|build-icons|research-icons)\/.+\.(svg|png|webp|gif|jpe?g)$/i.test(src.pathname))
          return menu ? [null] : [];
        if (menu && ['contain', 'scale-down', 'cover'].includes(css.objectFit)) {
          const xRatio = bounds.width / icon.naturalWidth, yRatio = bounds.height / icon.naturalHeight;
          const scale = css.objectFit === 'cover' ? Math.max(xRatio, yRatio)
            : Math.min(xRatio, yRatio, css.objectFit === 'scale-down' ? 1 : Infinity);
          const width = icon.naturalWidth * scale, height = icon.naturalHeight * scale;
          const x = bounds.left - box.left + (bounds.width - width) / 2;
          const y = bounds.top - box.top + (bounds.height - height) / 2;
          item.clip = item.box;
          item.box = [x, y, x + width, y + height];
        }
        return [{...item, asset:src.pathname.slice(1)}];
      }
      const viewBox = icon.viewBox.baseVal;
      const shapes = [...icon.children];
      if (!viewBox.width || !viewBox.height || shapes.some(shape =>
        !['path', 'circle', 'rect', 'title', 'desc'].includes(shape.localName) ||
        shape.hasAttribute('transform'))) return menu ? [null] : [];
      return [{...item, viewBox:[viewBox.x, viewBox.y, viewBox.width, viewBox.height],
        paths:shapes.filter(shape => ['path', 'circle', 'rect'].includes(shape.localName) &&
          cssOf(shape).display !== 'none' && cssOf(shape).visibility === 'visible').map(vectorPart)}];
    });
  }

  function menuDetails(button, bounds, css, badges, texts) {
    // Unsupported paints retain the original control and its full behavior.
    if (css.backgroundImage !== 'none' && !/^linear-gradient\(rgb/.test(css.backgroundImage)) return false;
    for (const node of button.querySelectorAll('span, i, b, small, strong, div')) {
      if (node.matches('small, #wt-field-toggle-count')) continue;
      const style = cssOf(node), area = node.getBoundingClientRect();
      if (!area.width || !area.height || style.visibility !== 'visible') continue;
      if (style.backgroundImage !== 'none') return false;
      if (style.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
      badges.push({box:rect(area, bounds.left, bounds.top), color:style.backgroundColor,
        radius:n(style.borderTopLeftRadius)});
    }
    for (const pseudo of ['::before', '::after']) {
      const style = cssOf(button, pseudo);
      if (style.display === 'none' || ['none', 'normal'].includes(style.content)) continue;
      if (style.position !== 'absolute' || style.transform !== 'none' || style.top === 'auto') return false;
      const attr = /^attr\(([^)]+)\)$/.exec(style.content);
      const text = attr ? button.getAttribute(attr[1]) || '' : style.content.replace(/^['"]|['"]$/g, '');
      const size = n(style.fontSize), width = n(style.width) || size, height = n(style.height) || size;
      const x = style.left !== 'auto' ? n(style.left) : bounds.width - n(style.right) - width;
      const y = n(style.top);
      const box = [x, y, x + width, y + height];
      badges.push({box, color:style.backgroundColor,
        radius:style.borderTopLeftRadius.endsWith('%') ? Math.min(width, height) / 2 : n(style.borderTopLeftRadius)});
      if (text) texts.push({text, box, size, center:true, color:style.color,
        family:style.fontFamily, weight:n(style.fontWeight) || 400});
    }
    return true;
  }

  function sample() {
    const visibleButtons = [], next = new Map(), nextScrollers = new Map();
    const scrollId = node => {
      if (!node) return 0;
      let id = ids.get(node);
      if (!id) ids.set(node, id = ++sequence);
      nextScrollers.set(id, node);
      return id;
    };
    function collect(context, query, guide = false) {
      if (!guide && !observedDocuments.has(context.doc)) {
        observedDocuments.add(context.doc);
        context.doc.addEventListener('scroll', onBuildScroll, {capture:true, passive:true});
      }
      for (const button of context.doc.querySelectorAll(query)) {
        if (button.matches('[data-action="rename-design"]')) continue;
        const menu = guide || button.matches(menuSelector);
        const bounds = button.getBoundingClientRect();
        if (bounds.bottom + context.y <= context.clip[1] || bounds.top + context.y >= context.clip[3] ||
            bounds.right + context.x <= context.clip[0] || bounds.left + context.x >= context.clip[2]) continue;
        if (!visible(button, bounds)) continue;
        const {clip, opacity, scrollX, scrollY} = clipping(button, context);
        if (!opacity || !exposed(button, bounds, clip, context)) continue;
        const horizontal = scrollId(scrollX), vertical = scrollId(scrollY);
        if (buildScroll?.node.contains(button)) continue;
        let id = ids.get(button);
        if (!id) ids.set(button, id = ++sequence);
        const css = cssOf(button);
        const badges = [...button.querySelectorAll('small, #wt-field-toggle-count')].flatMap(node => {
          const area = node.getBoundingClientRect(), style = cssOf(node);
          if (node.hidden || !area.width || !area.height || style.visibility !== 'visible' || !node.textContent.trim()) return [];
          return [{box:rect(area, bounds.left, bounds.top), color:style.backgroundColor, radius:n(style.borderTopLeftRadius)}];
        });
        const icons = iconParts(button, bounds, menu);
        if (icons.includes(null)) continue;
        const texts = textParts(button, bounds, context, menu);
        if (menu && !menuDetails(button, bounds, css, badges, texts)) continue;
        if (!texts.length && !icons.length) continue;
        const label = button.getAttribute('aria-label') || button.textContent.trim() || button.title;
        const note = button.querySelector('.wt-menu-note:not([hidden])')?.textContent || '';
        const edge = css.getPropertyValue('--wt-button-edge').trim() || css.borderTopColor;
        const item = {id, box:rect(bounds, -context.x, -context.y), clip, label, note, icons, texts, badges,
          background:css.backgroundColor, gradient:css.backgroundImage, edge,
          radius:n(css.borderTopLeftRadius), border:n(css.borderTopWidth) || (css.boxShadow !== 'none' ? 1 : 0),
          opacity:opacity * Number(css.opacity),
          enabled:!button.disabled && button.getAttribute('aria-disabled') !== 'true',
          selected:button.matches('[aria-pressed="true"],[aria-expanded="true"],[aria-selected="true"],.active,.selected'),
          scrollX:horizontal, scrollY:vertical,
          browserBuildScroll:Boolean(scrollX?.closest(buildMenu) || scrollY?.closest(buildMenu))};
        next.set(id, {button, frame:context.frame});
        visibleButtons.push(item);
      }
    }
    if (!document.hidden && !new URLSearchParams(location.search).has('replay')) {
      collect(topContext(), selector + ', ' + menuSelector);
      const frame = document.getElementById('warzone-game-frame');
      if (frame && visible(frame, frame.getBoundingClientRect()) && frame.contentDocument?.body)
        collect(contextFor(frame.contentDocument, frame), menuSelector);
      const reader = document.querySelector('#warzone-towers-help iframe.wt-field-guide-reader');
      if (reader && visible(reader, reader.getBoundingClientRect()) &&
          reader.contentDocument?.location.pathname === '/assets/guide/index.html')
        collect(contextFor(reader.contentDocument, reader), 'button', true);
    }
    candidates = next;
    scrollers = nextScrollers;
    const scrollBounds = Array.from(scrollers, ([id, node]) => [
      id, node.scrollLeft, node.scrollWidth - node.clientWidth,
      node.scrollTop, node.scrollHeight - node.clientHeight,
    ]);
    const payload = JSON.stringify({generation, width:innerWidth, height:innerHeight,
      buttons:visibleButtons, scrollBounds, steering:steeringLayout()});
    if (payload === previous) return;
    previous = payload;
    AndroidBattleControls.postMessage(payload);
  }

  function apply(active) {
    const accepted = new Set(active);
    for (const [id, entry] of replaced) {
      if (accepted.has(id) && candidates.get(id)?.button === entry.button &&
          !buildScroll?.node.contains(entry.button)) continue;
      if (entry.filter) entry.button.style.setProperty('filter', entry.filter, entry.priority);
      else entry.button.style.removeProperty('filter');
      if (entry.aria === null) entry.button.removeAttribute('aria-hidden');
      else entry.button.setAttribute('aria-hidden', entry.aria);
      if (entry.tab === null) entry.button.removeAttribute('tabindex');
      else entry.button.setAttribute('tabindex', entry.tab);
      replaced.delete(id);
    }
    for (const id of accepted) {
      const button = candidates.get(id)?.button;
      if (!button || replaced.has(id) || buildScroll?.node.contains(button)) continue;
      replaced.set(id, {button, aria:button.getAttribute('aria-hidden'), tab:button.getAttribute('tabindex'),
        filter:button.style.getPropertyValue('filter'), priority:button.style.getPropertyPriority('filter')});
      button.style.setProperty('filter', 'opacity(0)', 'important');
      button.setAttribute('aria-hidden', 'true');
      button.tabIndex = -1;
    }
  }

  function scheduleSample() {
    if (sampleFrame) return;
    sampleFrame = requestAnimationFrame(() => {
      sampleFrame = 0;
      sample();
    });
  }

  function updateBuildScroll() {
    clearTimeout(buildSettleTimer);
    scheduleSample();
    // Draw scrolling rows in the same document as the moving list. Once the
    // WebView's touch or momentum scroll settles, native buttons take over again.
    if (!buildScroll.touching) {
      buildSettleTimer = setTimeout(() => {
        buildScroll = null;
        scheduleSample();
      }, 120);
    }
  }

  function onBuildScroll(event) {
    const node = event.target;
    if (!node.closest?.(buildMenu)) return;
    if (buildScroll?.node !== node) {
      buildScroll = {node, touching:false};
      apply(replaced.keys());
    }
    updateBuildScroll();
  }

  function beginBuildScroll(id) {
    const node = scrollers.get(id);
    if (!node?.isConnected || !node.closest(buildMenu)) return;
    buildScroll = {node, touching:true};
    apply(replaced.keys());
    updateBuildScroll();
  }

  function endBuildScroll() {
    if (!buildScroll) return;
    buildScroll.touching = false;
    updateBuildScroll();
  }

  function activate(id, pressOnly) {
    const item = candidates.get(id);
    const button = item?.button;
    if (!replaced.has(id) || !button?.isConnected) return;
    if (!pressOnly && (button.disabled || button.getAttribute('aria-disabled') === 'true')) return;
    const context = contextFor(button.ownerDocument, item.frame);
    const bounds = button.getBoundingClientRect();
    if (!visible(button, bounds) || !exposed(button, bounds, clipping(button, context).clip, context)) return;
    const game = document.getElementById('warzone-game-frame')?.contentWindow;
    if (game?.__warzoneCommands?.cancelDemolishForControl?.(button)) scheduleSample();
    if (pressOnly) return;
    const musicMenu = document.getElementById('wt-map-music-menu');
    if (musicMenu && !musicMenu.hidden && button.id !== 'blocknight-music' && !musicMenu.contains(button)) {
      (game?.WarzoneMapMusic || game?.WarzoneMusic)?.closeMenu?.(false);
    }
    button.click();
    scheduleSample();
  }

  function scroll(id, dx, dy) {
    const container = scrollers.get(id);
    if (!container?.isConnected || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    container.scrollBy({left:dx, top:dy, behavior:'instant'});
    scheduleSample();
  }

  function steeringState() {
    if (document.hidden || new URLSearchParams(location.search).has('replay')) return null;
    const frame = document.getElementById('warzone-game-frame');
    if (frame && !visible(frame, frame.getBoundingClientRect())) return null;
    const game = frame?.contentWindow || window;
    const state = game.__kalaWarzoneTouch?.armySteeringState?.();
    return state?.bounds ? {...state, frame} : null;
  }

  function steeringLayout() {
    const state = steeringState();
    if (steeringTarget && (steeringTarget.context !== state?.context || steeringTarget.fs !== state?.fs))
      stopSteering();
    if (!state) return null;
    const {left, top, right, bottom, radar} = state.bounds;
    const size = Math.round(Math.min(104, (bottom - top) * 0.22));
    if (size < 46) return null;
    const x = Math.min(right - size - 12, (radar?.left ?? right) - size - 12);
    const y = Math.min(bottom - size - 8, radar ? radar.bottom - size - 10 : bottom - size - 8);
    if (x < left || y < top) return null;
    const frame = state.frame;
    const frameBox = frame?.getBoundingClientRect();
    const ox = frame ? frameBox.left + frame.clientLeft : 0;
    const oy = frame ? frameBox.top + frame.clientTop : 0;
    return [x + ox, y + oy, x + ox + size, y + oy + size];
  }

  function writeSteering(state, x, y) {
    try {
      const nonce = steeringSession + (++steeringSerial);
      state.fs.writeFile(steeringPath + '.tmp', JSON.stringify({nonce, context:state.context, x, y}));
      state.fs.rename(steeringPath + '.tmp', steeringPath);
    } catch (_) { /* The engine expires the held input if delivery stops. */ }
  }

  function stopSteering() {
    if (!steeringTarget) return;
    writeSteering(steeringTarget, 0, 0);
    steeringTarget = null;
  }

  function steer(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const state = steeringState();
    if (!state) { stopSteering(); return; }
    if (steeringTarget && (steeringTarget.context !== state.context || steeringTarget.fs !== state.fs)) {
      stopSteering();
      return;
    }
    steeringTarget = state;
    writeSteering(state, x, y);
  }

  window.NativeBattleControls = {
    apply, press:id => activate(id, true), click:id => activate(id, false), scroll, beginBuildScroll, endBuildScroll,
    steer, stopSteering,
  };
  document.addEventListener('visibilitychange', sample);
  window.addEventListener('pagehide', stopSteering);
  window.addEventListener('resize', sample);
  setInterval(sample, 90);
  sample();
})();
