/**
 * Tiny DOM builder — classic-script port of maxwellito/breaklock src/utils/dom.js
 */
(function (root) {
  'use strict';

  var SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  var SVG_ELEMENTS = ['svg', 'g', 'circle', 'line', 'path', 'use', 'rect', 'polyline', 'text'];

  var dom = {
    SVG_NAMESPACE: SVG_NAMESPACE,
    SVG_ELEMENTS: SVG_ELEMENTS,

    create: function (nodeName, props, content) {
      var node, propName, i;
      if (props == null) props = {};
      if (SVG_ELEMENTS.indexOf(nodeName) === -1) node = document.createElement(nodeName);
      else node = document.createElementNS(SVG_NAMESPACE, nodeName);

      if (typeof props === 'string') node.setAttribute('class', props);
      else for (propName in props) {
        if (Object.prototype.hasOwnProperty.call(props, propName)) {
          node.setAttribute(propName, props[propName]);
        }
      }

      if (content instanceof Array) {
        for (i = 0; i < content.length; i++) {
          if (content[i]) node.appendChild(content[i]);
        }
      } else if (content != null && content !== '') {
        node.textContent = content;
      }
      return node;
    },

    clear: function (element) {
      var i;
      for (i = element.childNodes.length - 1; i >= 0; i--) {
        element.childNodes[i].remove();
      }
    }
  };

  root.BreakLockDom = dom;
})(typeof globalThis !== 'undefined' ? globalThis : this);
