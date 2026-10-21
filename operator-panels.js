(function (root) {
  'use strict';
  // Inert HTML templates retain the existing control markup. Only a requested
  // panel enters the document and receives its input listeners.
  var records = new Map(), controls = new Map(), owners = new WeakMap();
  document.querySelectorAll('[data-operator-panel] > template[data-operator-controls]').forEach(function (template) {
    var panel = template.parentElement, record = { panel: panel, template: template, setup: [], mounted: false };
    records.set(panel, record);
    template.content.querySelectorAll('*').forEach(function (node) { owners.set(node, panel); if (node.id) controls.set(node.id, node); });
  });
  function owner(node) { return node && (node.closest('[data-operator-panel]') || owners.get(node)) || null; }
  function bind(node, setup) {
    var record = records.get(owner(node));
    if (record && !record.mounted) record.setup.push(setup);
    else setup();
  }
  function mount(panel) {
    var record = records.get(panel);
    if (!record || record.mounted) return false;
    panel.appendChild(record.template.content); record.template.remove(); record.mounted = true;
    var setup = record.setup; record.setup = []; setup.forEach(function (install) { install(); });
    return true;
  }
  function query(selector) {
    var result = [];
    records.forEach(function (record) { if (!record.mounted) result.push.apply(result, record.template.content.querySelectorAll(selector)); });
    return result;
  }
  root.TypeDeformerOperatorPanels = Object.freeze({
    control: function (id) { return document.getElementById(id) || controls.get(id) || null; },
    owner: owner, bind: bind, mount: mount, query: query,
    content: function (panel) { var record = records.get(panel); return record && !record.mounted ? record.template.content : panel; },
    stats: function () { var mounted = 0, queued = 0; records.forEach(function (record) { if (record.mounted) mounted++; queued += record.setup.length; });
      return { templates: records.size, mounted: mounted, deferredBindings: queued }; }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
