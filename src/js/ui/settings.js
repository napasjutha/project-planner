(function () {
  'use strict';

  function applyTheme(theme) {
    if (theme === 'kpmg-dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function renderSettings(state) {
    applyTheme(state.project.settings.theme);

    document.querySelectorAll('.theme-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.theme === (state.project.settings.theme || 'kpmg-light'));
    });

    var nameInput = document.getElementById('project-rename-input');
    if (document.activeElement !== nameInput) nameInput.value = state.project.meta.name;

    var picEditor = document.getElementById('pic-list-editor');
    picEditor.innerHTML = '';
    (state.project.picList || []).forEach(function (pic) {
      var row = document.createElement('div');
      row.className = 'pic-editor-row';
      var label = document.createElement('span');
      label.textContent = pic;
      var removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'pic-remove-btn';
      removeBtn.dataset.pic = pic;
      row.appendChild(label);
      row.appendChild(removeBtn);
      picEditor.appendChild(row);
    });

    var auditBody = document.getElementById('audit-log-body');
    auditBody.innerHTML = '';
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var thead = document.createElement('tr');
    ['When', 'Who', 'Task', 'Field', 'Old', 'New'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    state.project.auditLog.slice().reverse().slice(0, 200).forEach(function (entry) {
      var tr = document.createElement('tr');
      var taskName = byId.has(entry.taskId) ? byId.get(entry.taskId).name : entry.taskId;
      [entry.when, entry.who, taskName, entry.field, String(entry.old), String(entry.new)].forEach(function (val) {
        var td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    auditBody.appendChild(table);
  }

  function wireSettings(state, onChanged) {
    document.querySelectorAll('.theme-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.project.settings.theme = b.dataset.theme;
        onChanged();
      });
    });

    document.getElementById('project-rename-input').addEventListener('change', function (e) {
      state.project.meta.name = e.target.value;
      onChanged();
    });

    document.getElementById('add-pic-button').addEventListener('click', function () {
      var input = document.getElementById('new-pic-input');
      var name = input.value.trim();
      if (!name) return;
      state.project.picList = state.project.picList || [];
      if (state.project.picList.indexOf(name) === -1) state.project.picList.push(name);
      input.value = '';
      onChanged();
    });

    document.getElementById('pic-list-editor').addEventListener('click', function (e) {
      var btn = e.target.closest('.pic-remove-btn');
      if (!btn) return;
      state.project.picList = state.project.picList.filter(function (p) { return p !== btn.dataset.pic; });
      onChanged();
    });

    document.getElementById('new-project-button').addEventListener('click', function () {
      var confirmed = window.confirm('Start a new blank project? This replaces the currently open project in this browser tab (already-saved files on disk are unaffected).');
      if (!confirmed) return;
      var name = window.prompt('New project name:', 'New Project') || 'New Project';
      state.project = PP.Project.empty(name);
      state.dirty = false;
      state.scurveOverlaySnapshotId = null;
      state.snapshotCompareA = null;
      state.snapshotCompareB = null;
      onChanged();
    });
  }

  window.PP = window.PP || {};
  window.PP.renderSettings = renderSettings;
  window.PP.wireSettings = wireSettings;
  window.PP.applyTheme = applyTheme;
})();
