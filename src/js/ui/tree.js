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

  function dateCell(hasChildren, className, dataField, computedValue, rawValue) {
    return hasChildren
      ? '<span class="' + className + '">' + escapeHtml(computedValue || '') + '</span>'
      : '<span class="cell ' + className + '" data-field="' + dataField + '">' + escapeHtml(rawValue || '') + '</span>';
  }

  function renderTree(state) {
    var body = document.getElementById('tree-body');
    body.innerHTML = '';
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var children = state.calc.children;
    var rows = PP.computeVisibleRows(state.project, state.calc, state.filters, state.currentUser);

    rows.forEach(function (id) {
      var task = byId.get(id);
      var computed = state.calc.computed.get(id);
      var hasChildren = (children.get(id) || []).length > 0;
      var toggleChar = hasChildren ? (task.collapsed ? '▸' : '▾') : '';
      var lu = state.lastUpdated.get(id);

      var startCell = dateCell(hasChildren, 'col-start', 'plannedStart', computed.plannedStart, task.plannedStart);
      var finishCell = dateCell(hasChildren, 'col-finish', 'plannedFinish', computed.plannedFinish, task.plannedFinish);
      var actualStartCell = dateCell(hasChildren, 'col-astart', 'actualStart', computed.actualStart, task.actualStart);
      var actualFinishCell = dateCell(hasChildren, 'col-afinish', 'actualFinish', computed.actualFinish, task.actualFinish);
      var actualPctText = computed.actualStart ? fmtPct(computed.actualPct) : '';
      var billingAmountCell = task.milestone
        ? '<span class="cell col-billing-amount" data-field="billingAmount">' + (task.billingAmount != null ? escapeHtml(String(task.billingAmount)) : '') + '</span>'
        : '<span class="col-billing-amount"></span>';
      var billingStatusCell = task.milestone
        ? '<span class="cell col-billing-status" data-field="billingStatus">' + escapeHtml(task.billingStatus || '') + '</span>'
        : '<span class="col-billing-status"></span>';
      var predText = (task.predecessors || [])
        .map(function (pid) { var pc = state.calc.computed.get(pid); return pc ? pc.wbs : null; })
        .filter(Boolean)
        .join(', ');
      var predecessorsCell = hasChildren
        ? '<span class="col-predecessors"></span>'
        : '<span class="cell col-predecessors" data-field="__predecessors">' + escapeHtml(predText) + '</span>';

      var milestoneMarker = task.milestone ? '<span class="milestone-marker" title="Milestone">&#9670;</span>' : '';
      var row = document.createElement('div');
      row.className = 'tree-row' + (hasChildren ? ' is-parent' : '');
      row.dataset.id = id;
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + milestoneMarker + escapeHtml(task.name) +
        '</span>' +
        '<span class="cell col-owner" data-field="owner">' + escapeHtml(task.owner || '') + '</span>' +
        '<span class="cell col-pic" data-field="pic">' + escapeHtml(task.pic || '') + '</span>' +
        startCell +
        finishCell +
        actualStartCell +
        actualFinishCell +
        '<span class="col-duration">' + computed.duration + '</span>' +
        '<span class="col-weight">' + fmtPct(computed.weight) + '</span>' +
        '<span class="col-plan">' + fmtPct(computed.plannedPctToDate) + '</span>' +
        '<span class="col-actual">' + actualPctText + '</span>' +
        '<span class="col-status status-' + computed.status.replace(/\s+/g, '') + '">' + escapeHtml(computed.status) + '</span>' +
        '<span class="col-updated-by">' + (lu ? escapeHtml(lu.who) : '') + '</span>' +
        '<span class="col-updated-at">' + (lu ? escapeHtml(lu.when.slice(0, 16).replace('T', ' ')) : '') + '</span>' +
        '<span class="cell col-remarks" data-field="remarks">' + escapeHtml(task.remarks || '') + '</span>' +
        billingAmountCell +
        billingStatusCell +
        predecessorsCell;
      body.appendChild(row);
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
    var el;

    if (field === 'billingStatus') {
      el = document.createElement('select');
      el.className = 'cell-editor';
      ['Not Billed', 'Invoiced', 'Paid'].forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (raw === opt) option.selected = true;
        el.appendChild(option);
      });
    } else {
      el = document.createElement('input');
      el.className = 'cell-editor';
      if (field === 'plannedStart' || field === 'plannedFinish' || field === 'actualStart' || field === 'actualFinish') {
        el.type = 'date';
        el.value = raw || '';
      } else if (field === 'billingAmount') {
        el.type = 'number';
        el.min = '0';
        el.value = raw != null ? raw : '';
      } else {
        el.type = 'text';
        el.value = raw || '';
      }
    }

    cell.innerHTML = '';
    cell.appendChild(el);
    el.focus();
    if (el.select) el.select();

    var settled = false;

    function commit() {
      if (settled) return;
      settled = true;
      var value = el.value;
      if (field === 'billingAmount') {
        value = value === '' ? null : Number(value);
      } else if ((field === 'plannedStart' || field === 'plannedFinish' || field === 'actualStart' || field === 'actualFinish') && value === '') {
        value = null;
      }
      state.project.updateTask(id, buildPatch(field, value), state.currentUser);
      onCommitted();
    }

    function cancel() {
      if (settled) return;
      settled = true;
      renderTree(state);
    }

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
    el.addEventListener('blur', commit);
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
        var copy = state.project.addTask({ parentId: task.parentId, name: task.name + ' (copy)', owner: task.owner, pic: task.pic });
        state.project.updateTask(copy.id, {
          plannedStart: task.plannedStart, plannedFinish: task.plannedFinish,
          deliverable: task.deliverable, remarks: task.remarks,
        }, state.currentUser);
      }],
      ['Delete', function () { state.project.deleteTask(id, state.currentUser); }],
      ['Indent', function () { state.project.indent(id, state.currentUser); }],
      ['Outdent', function () { state.project.outdent(id, state.currentUser); }],
      [task.milestone ? '✓ Milestone (click to unset)' : 'Mark as Milestone', function () { state.project.updateTask(id, { milestone: !task.milestone }, state.currentUser); }],
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

    var rect = menu.getBoundingClientRect();
    var clampedX = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
    var clampedY = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
    menu.style.left = clampedX + 'px';
    menu.style.top = clampedY + 'px';
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
      if (cell.dataset.field === '__predecessors') {
        PP.openPredecessorPicker(state, row.dataset.id, cell, onChanged);
        return;
      }
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
