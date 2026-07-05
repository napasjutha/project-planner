(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtPct(x) {
    return Math.round(x * 100) + '%';
  }

  function renderTree(state) {
    var body = document.getElementById('tree-body');
    body.innerHTML = '';
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var children = state.calc.children;
    var visible = PP.visibleIds(state.project, state.calc.computed, state.calc.order, state.filters, state.currentUser);
    var suppressed = new Set();

    state.calc.order.forEach(function (id) {
      var task = byId.get(id);
      var parentSuppressed = task.parentId != null && suppressed.has(task.parentId);
      if (parentSuppressed || !visible.has(id)) {
        suppressed.add(id);
        return;
      }

      var computed = state.calc.computed.get(id);
      var hasChildren = (children.get(id) || []).length > 0;
      var toggleChar = hasChildren ? (task.collapsed ? '▸' : '▾') : '';

      var row = document.createElement('div');
      row.className = 'tree-row';
      row.dataset.id = id;
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + escapeHtml(task.name) +
        '</span>' +
        '<span class="cell col-pic" data-field="pic">' + escapeHtml(task.pic || '') + '</span>' +
        '<span class="cell col-start" data-field="plannedStart">' + escapeHtml(task.plannedStart || '') + '</span>' +
        '<span class="cell col-finish" data-field="plannedFinish">' + escapeHtml(task.plannedFinish || '') + '</span>' +
        '<span class="col-duration">' + computed.duration + '</span>' +
        '<span class="col-weight">' + fmtPct(computed.weight) + '</span>' +
        '<span class="col-plan">' + fmtPct(computed.plannedPctToDate) + '</span>' +
        '<span class="cell col-actual" data-field="actualPct">' + fmtPct(computed.actualPct) + '</span>' +
        '<span class="col-status status-' + computed.status.replace(/\s+/g, '') + '">' + escapeHtml(computed.status) + '</span>';
      body.appendChild(row);

      if (task.collapsed) suppressed.add(id);
    });
  }

  function buildPatch(field, value) {
    var patch = {};
    patch[field] = value;
    return patch;
  }

  function beginEdit(state, cell, id, field, onCommitted) {
    var task = state.project.tasks.find(function (t) { return t.id === id; });
    var raw = task[field];
    var input = document.createElement('input');
    input.className = 'cell-editor';

    if (field === 'plannedStart' || field === 'plannedFinish') {
      input.type = 'date';
      input.value = raw || '';
    } else if (field === 'actualPct') {
      input.type = 'number';
      input.min = '0';
      input.max = '100';
      input.value = Math.round((raw || 0) * 100);
    } else {
      input.type = 'text';
      input.value = raw || '';
    }

    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    var settled = false;

    function commit() {
      if (settled) return;
      settled = true;
      var value = input.value;
      if (field === 'actualPct') {
        value = Math.max(0, Math.min(100, Number(value) || 0)) / 100;
      }
      state.project.updateTask(id, buildPatch(field, value), state.currentUser);
      onCommitted();
    }

    function cancel() {
      if (settled) return;
      settled = true;
      renderTree(state);
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
    input.addEventListener('blur', commit);
  }

  function showContextMenu(state, id, x, y, onChanged) {
    var menu = document.getElementById('context-menu');
    menu.innerHTML = '';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.hidden = false;

    var task = state.project.tasks.find(function (t) { return t.id === id; });
    var actions = [
      ['New Task', function () { state.project.addTask({ parentId: task.parentId, name: 'New Task' }); }],
      ['New Child', function () { state.project.addTask({ parentId: id, name: 'New Task' }); }],
      ['Duplicate', function () {
        var copy = state.project.addTask({ parentId: task.parentId, name: task.name + ' (copy)', pic: task.pic });
        state.project.updateTask(copy.id, {
          plannedStart: task.plannedStart, plannedFinish: task.plannedFinish,
          deliverable: task.deliverable, remarks: task.remarks,
        }, state.currentUser);
      }],
      ['Delete', function () { state.project.deleteTask(id, state.currentUser); }],
      ['Indent', function () { state.project.indent(id, state.currentUser); }],
      ['Outdent', function () { state.project.outdent(id, state.currentUser); }],
      ['Toggle Milestone', function () { state.project.updateTask(id, { milestone: !task.milestone }, state.currentUser); }],
    ];

    actions.forEach(function (a) {
      var item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = a[0];
      item.addEventListener('click', function () {
        a[1]();
        menu.hidden = true;
        onChanged();
      });
      menu.appendChild(item);
    });
  }

  function wireTree(state, onChanged) {
    var body = document.getElementById('tree-body');

    body.addEventListener('click', function (e) {
      var toggle = e.target.closest('.toggle');
      if (!toggle || !toggle.textContent) return;
      var row = e.target.closest('.tree-row');
      state.project.toggleCollapse(row.dataset.id);
      onChanged();
    });

    body.addEventListener('dblclick', function (e) {
      var cell = e.target.closest('.cell');
      if (!cell) return;
      var row = e.target.closest('.tree-row');
      beginEdit(state, cell, row.dataset.id, cell.dataset.field, onChanged);
    });

    body.addEventListener('contextmenu', function (e) {
      var row = e.target.closest('.tree-row');
      if (!row) return;
      e.preventDefault();
      showContextMenu(state, row.dataset.id, e.clientX, e.clientY, onChanged);
    });

    document.addEventListener('click', function (e) {
      var menu = document.getElementById('context-menu');
      if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.tree-row')) menu.hidden = true;
    });
  }

  window.PP = window.PP || {};
  window.PP.renderTree = renderTree;
  window.PP.wireTree = wireTree;
})();
