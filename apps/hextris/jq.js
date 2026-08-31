/* Tiny jQuery-shaped shim. Hextris talks to the DOM through $; the sandbox
   does not need the 90 KB original. Fade is opacity + display, not jQuery FX. */
(function (root) {
  'use strict';

  function nodesOf(sel) {
    if (!sel) return [];
    if (sel === root || sel === document) return [sel];
    if (sel.nodeType) return [sel];
    if (typeof sel !== 'string') {
      if (sel.length != null && sel !== window) {
        return Array.prototype.slice.call(sel);
      }
      return [];
    }
    if (sel.charAt(0) === '<') {
      var d = document.createElement('div');
      d.innerHTML = sel;
      return Array.prototype.slice.call(d.childNodes);
    }
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }

  function Q(nodes) {
    this.length = nodes.length;
    for (var i = 0; i < nodes.length; i++) this[i] = nodes[i];
  }

  Q.prototype.each = function (fn) {
    for (var i = 0; i < this.length; i++) fn.call(this[i], i, this[i]);
    return this;
  };

  function eachEl(q, fn) {
    for (var i = 0; i < q.length; i++) {
      if (q[i] && q[i].nodeType === 1) fn(q[i]);
    }
  }

  Q.prototype.on = function (ev, fn) {
    var names = String(ev || '').split(/\s+/);
    this.each(function () {
      for (var i = 0; i < names.length; i++) {
        if (names[i]) this.addEventListener(names[i], fn, false);
      }
    });
    return this;
  };
  Q.prototype.bind = Q.prototype.on;
  Q.prototype.off = function (ev, fn) {
    var names = String(ev || '').split(/\s+/);
    this.each(function () {
      for (var i = 0; i < names.length; i++) {
        if (names[i]) this.removeEventListener(names[i], fn, false);
      }
    });
    return this;
  };

  Q.prototype.attr = function (name, val) {
    if (val === undefined) {
      var el = this[0];
      if (!el) return undefined;
      if (el === root) return undefined;
      return el.getAttribute ? el.getAttribute(name) : undefined;
    }
    eachEl(this, function (el) { el.setAttribute(name, val); });
    return this;
  };

  Q.prototype.css = function (name, val) {
    if (typeof name === 'object') {
      for (var k in name) if (Object.prototype.hasOwnProperty.call(name, k)) this.css(k, name[k]);
      return this;
    }
    if (val === undefined) {
      var el = this[0];
      if (!el || el === root) return undefined;
      return el.style[name] || (root.getComputedStyle ? getComputedStyle(el)[name] : '');
    }
    var v = val;
    if (typeof v === 'number' && !/opacity|z-index|font-weight/.test(name)) v = v + 'px';
    eachEl(this, function (el) { el.style[name] = v; });
    return this;
  };

  Q.prototype.text = function (val) {
    if (val === undefined) return this[0] ? (this[0].textContent || '') : '';
    eachEl(this, function (el) { el.textContent = val == null ? '' : String(val); });
    return this;
  };

  Q.prototype.html = function (val) {
    if (val === undefined) return this[0] ? (this[0].innerHTML || '') : '';
    eachEl(this, function (el) { el.innerHTML = val == null ? '' : String(val); });
    return this;
  };

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el === document.body || el === document.documentElement) return true;
    var st = el.style.display;
    if (st === 'none') return false;
    var cs = root.getComputedStyle ? getComputedStyle(el) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
  }

  Q.prototype.is = function (sel) {
    if (sel === ':visible') {
      for (var i = 0; i < this.length; i++) if (isVisible(this[i])) return true;
      return false;
    }
    if (sel === ':hidden') return !this.is(':visible');
    var el = this[0];
    if (!el || !el.matches) return false;
    return el.matches(sel);
  };

  Q.prototype.show = function () {
    eachEl(this, function (el) {
      el.style.display = '';
      el.style.opacity = '1';
      if (getComputedStyle(el).display === 'none') el.style.display = 'block';
    });
    return this;
  };
  Q.prototype.hide = function () {
    eachEl(this, function (el) { el.style.display = 'none'; });
    return this;
  };

  function fade(q, show, ms, cb) {
    ms = parseInt(ms, 10);
    if (isNaN(ms)) ms = 150;
    q.each(function () {
      var el = this;
      if (el.nodeType !== 1) return;
      el.style.transition = 'opacity ' + ms + 'ms linear';
      if (show) {
        if (el.style.display === 'none' || getComputedStyle(el).display === 'none') el.style.display = 'block';
        el.style.opacity = '0';
        void el.offsetWidth;
        el.style.opacity = '1';
      } else {
        el.style.opacity = '0';
      }
      setTimeout(function () {
        if (!show) el.style.display = 'none';
        if (typeof cb === 'function') cb.call(el);
      }, ms);
    });
    return q;
  }

  function fadeArgs(args, show, q) {
    var ms = 150, cb = null;
    for (var i = 0; i < args.length; i++) {
      if (typeof args[i] === 'function') cb = args[i];
      else if (typeof args[i] === 'number' || (typeof args[i] === 'string' && /^\d/.test(args[i]))) ms = parseInt(args[i], 10);
    }
    return fade(q, show, ms, cb);
  }

  Q.prototype.fadeIn = function () { return fadeArgs(arguments, true, this); };
  Q.prototype.fadeOut = function () { return fadeArgs(arguments, false, this); };
  Q.prototype.fadeToggle = function () {
    var vis = this.is(':visible');
    return fadeArgs(arguments, !vis, this);
  };
  Q.prototype.toggle = function () {
    return this.is(':visible') ? this.hide() : this.show();
  };

  Q.prototype.offset = function () {
    var el = this[0];
    if (!el || !el.getBoundingClientRect) return { top: 0, left: 0 };
    var r = el.getBoundingClientRect();
    return { top: r.top + (root.scrollY || 0), left: r.left + (root.scrollX || 0) };
  };
  Q.prototype.height = function () {
    var el = this[0];
    if (el === root) return root.innerHeight;
    if (el === document) return document.documentElement.clientHeight;
    return el ? el.offsetHeight : 0;
  };
  Q.prototype.width = function () {
    var el = this[0];
    if (el === root) return root.innerWidth;
    if (el === document) return document.documentElement.clientWidth;
    return el ? el.offsetWidth : 0;
  };

  Q.prototype.hasClass = function (c) {
    var el = this[0];
    return !!(el && el.classList && el.classList.contains(c));
  };
  Q.prototype.addClass = function (c) {
    eachEl(this, function (el) { el.classList.add(c); });
    return this;
  };
  Q.prototype.removeClass = function (c) {
    eachEl(this, function (el) { el.classList.remove(c); });
    return this;
  };
  Q.prototype.remove = function () {
    this.each(function () { if (this.parentNode) this.parentNode.removeChild(this); });
    return this;
  };
  Q.prototype.replace = function (re, rep) {
    var el = this[0];
    var s = (el && el.getAttribute && el.getAttribute('src')) || '';
    return s.replace(re, rep);
  };

  function $(sel) {
    if (typeof sel === 'function') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sel);
      else sel();
      return;
    }
    return new Q(nodesOf(sel));
  }

  function copy(deep, target, src) {
    if (!src || typeof src !== 'object') return target;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k];
      if (deep && v && typeof v === 'object') {
        var base = Array.isArray(v) ? [] : {};
        var cur = target[k];
        target[k] = copy(true, (cur && typeof cur === 'object') ? cur : base, v);
      } else {
        target[k] = v;
      }
    }
    return target;
  }

  $.extend = function () {
    var i = 0, deep = false, target = arguments[0];
    if (typeof target === 'boolean') { deep = target; target = arguments[1]; i = 2; }
    else i = 1;
    if (target == null) target = {};
    for (; i < arguments.length; i++) copy(deep, target, arguments[i]);
    return target;
  };
  $.get = function () { return { fail: function () {}, done: function () {} }; };
  $.parseHTML = function (s) {
    var d = document.createElement('div');
    d.innerHTML = s;
    return Array.prototype.slice.call(d.childNodes);
  };

  root.$ = root.jQuery = $;
  root.JSONfn = {
    parse: function (s) {
      try { return JSON.parse(s); } catch (e) { return {}; }
    },
    stringify: function (o) {
      try { return JSON.stringify(o); } catch (e) { return '{}'; }
    }
  };
  root.Cookies = { set: function () {}, get: function () { return undefined; } };
  root.hexHistory = root.hexHistory || {};
})(window);
