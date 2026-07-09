(function () {
  'use strict';

  var STORAGE_PREFIX = 'pp:';

  function storageKey(projectId) {
    return STORAGE_PREFIX + projectId;
  }

  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    state.lastUpdated = PP.computeLastUpdated(state.project);
    renderHeader(state);
    renderPicFilter(state);
    renderOwnerFilter(state);
    PP.renderTree(state);
    PP.renderGantt(state);
    PP.renderScurve(state);
    PP.renderScurveOverlaySelect(state);
    PP.renderDashboard(state);
    PP.renderSnapshots(state);
    PP.renderResources(state);
    PP.renderBilling(state);
    PP.renderSettings(state);
    PP.renderHolidays(state);
    PP.renderReport(state);
    if (markDirty) {
      state.dirty = true;
      document.getElementById('dirty-indicator').textContent = '● unsaved changes';
      state.project.meta.revision += 1;
    }
    localStorage.setItem(storageKey(state.project.meta.id), JSON.stringify(state.project.toJSON()));
  }

  function renderHeader(state) {
    document.getElementById('project-name').textContent = state.project.meta.name;
    var dateInput = document.getElementById('status-date-input');
    if (document.activeElement !== dateInput) dateInput.value = state.project.meta.statusDate;

    var kpis = state.calc.kpis;
    var pct = function (x) { return Math.round(x * 100) + '%'; };
    var cards = [
      ['Actual', pct(kpis.actualPct)],
      ['Plan', pct(kpis.plannedPct)],
      ['Variance', pct(kpis.variance)],
      ['Delayed', String(kpis.delayedCount)],
      ['Complete', kpis.completeCount + '/' + kpis.totalCount],
      ['Milestones', kpis.milestonesComplete + '/' + kpis.milestonesTotal],
      ['Remaining days', String(kpis.remainingWorkdays)],
    ];
    var row = document.getElementById('kpi-row');
    row.innerHTML = '';
    cards.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'kpi-card';
      card.innerHTML = '<div class="kpi-label">' + c[0] + '</div><div class="kpi-value">' + c[1] + '</div>';
      row.appendChild(card);
    });
  }

  function renderPicFilter(state) {
    var select = document.getElementById('pic-filter');
    var current = select.value;
    var picSet = new Set(state.project.picList || []);
    state.project.tasks.forEach(function (t) { if (t.pic) picSet.add(t.pic); });
    select.innerHTML = '';
    var allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All PICs';
    select.appendChild(allOption);
    Array.from(picSet).sort().forEach(function (pic) {
      var option = document.createElement('option');
      option.value = pic;
      option.textContent = pic;
      select.appendChild(option);
    });
    select.value = current;
  }

  function renderOwnerFilter(state) {
    var select = document.getElementById('owner-filter');
    var current = select.value;
    var ownerSet = new Set();
    state.project.tasks.forEach(function (t) { if (t.owner) ownerSet.add(t.owner); });
    select.innerHTML = '';
    var allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Owners';
    select.appendChild(allOption);
    Array.from(ownerSet).sort().forEach(function (owner) {
      var option = document.createElement('option');
      option.value = owner;
      option.textContent = owner;
      select.appendChild(option);
    });
    select.value = current;
  }

  function wireHeader(state) {
    document.getElementById('status-date-input').addEventListener('change', function (e) {
      state.project.meta.statusDate = e.target.value;
      refresh(state, true);
    });
    document.getElementById('save-button').addEventListener('click', function () {
      handleSave(state);
    });
    document.getElementById('load-project-button').addEventListener('click', function () {
      document.getElementById('load-project-input').click();
    });
    document.getElementById('load-project-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) handleLoadProject(state, file);
      e.target.value = '';
    });
  }

  function wireToolbar(state) {
    document.getElementById('add-task-button').addEventListener('click', function () {
      state.project.addTask({ parentId: null, name: 'New Task' });
      refresh(state, true);
    });
    function onFilterChange() {
      PP.renderTree(state);
    }
    document.getElementById('search-input').addEventListener('input', function (e) {
      state.filters.search = e.target.value;
      onFilterChange();
    });
    document.getElementById('status-filter').addEventListener('change', function (e) {
      state.filters.status = e.target.value;
      onFilterChange();
    });
    document.getElementById('only-delayed-filter').addEventListener('change', function (e) {
      state.filters.onlyDelayed = e.target.checked;
      onFilterChange();
    });
    document.getElementById('only-mine-filter').addEventListener('change', function (e) {
      state.filters.onlyMine = e.target.checked;
      onFilterChange();
    });
    document.getElementById('only-milestone-filter').addEventListener('change', function (e) {
      state.filters.onlyMilestone = e.target.checked;
      onFilterChange();
    });
    document.getElementById('owner-filter').addEventListener('change', function (e) {
      state.filters.owner = e.target.value;
      onFilterChange();
    });
    document.getElementById('pic-filter').addEventListener('change', function (e) {
      state.filters.pic = e.target.value;
      onFilterChange();
    });
  }

  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view', 'resources-view', 'billing-view', 'settings-view', 'holidays-view', 'reports-view'];

  function wireViewTabs(state) {
    var tabs = document.querySelectorAll('.view-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var view = tab.dataset.view;
        VIEW_IDS.forEach(function (viewId) {
          var el = document.getElementById(viewId);
          if (el) el.hidden = viewId !== view + '-view';
        });
      });
    });
  }

  function wireGanttZoom(state) {
    var buttons = document.querySelectorAll('.gantt-zoom-btn');
    function updateActive() {
      var zoom = state.project.settings.ganttZoom || 'week';
      buttons.forEach(function (b) { b.classList.toggle('active', b.dataset.zoom === zoom); });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        state.project.settings.ganttZoom = b.dataset.zoom;
        updateActive();
        refresh(state, true);
      });
    });
    updateActive();
  }

  function slugifyProjectName(name) {
    var slug = (name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'project';
  }

  function handleSave(state) {
    var missingDates = PP.findIncompleteTasks(state.project);
    var missingOwner = PP.findTasksMissingOwner(state.project);
    if (missingDates.length || missingOwner.length) {
      var msgs = [];
      if (missingDates.length) msgs.push('missing planned dates on: ' + missingDates.map(function (t) { return t.name; }).join(', '));
      if (missingOwner.length) msgs.push('missing Owner on: ' + missingOwner.map(function (t) { return t.name; }).join(', '));
      window.alert('Cannot save — ' + msgs.join('; '));
      return;
    }
    state.project.meta.savedBy = state.currentUser;
    state.project.meta.savedAt = new Date().toISOString();
    var json = state.project.serialize();

    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var dateStr = state.project.meta.savedAt.slice(0, 10);
    a.download = slugifyProjectName(state.project.meta.name) + '_rev' + state.project.meta.revision + '_' + dateStr + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    state.dirty = false;
    document.getElementById('dirty-indicator').textContent = '';
    localStorage.setItem(storageKey(state.project.meta.id), json);
  }

  function handleLoadProject(state, file) {
    if (state.dirty && !window.confirm('Unsaved changes will be lost — load anyway?')) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        window.alert('That file is not valid JSON.');
        return;
      }
      if (!parsed || !parsed.meta || !Array.isArray(parsed.tasks)) {
        window.alert('That file does not look like a ProjectPlanner project (missing meta/tasks).');
        return;
      }
      state.project = new PP.Project(parsed);
      state.dirty = false;
      state.scurveOverlaySnapshotId = null;
      state.snapshotCompareA = null;
      state.snapshotCompareB = null;
      state.holidaysViewYear = null;
      document.getElementById('dirty-indicator').textContent = '';
      refresh(state, false);
    };
    reader.onerror = function () {
      window.alert('Failed to read that file.');
    };
    reader.readAsText(file);
  }

  function handleDownloadCsvTemplate() {
    var blob = new Blob([PP.csvTemplateText()], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'project-planner-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportCsv(state, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var rows = PP.parseCsvText(PP.stripBom(reader.result));
      if (rows.length < 2) {
        window.alert('CSV has no data rows.');
        return;
      }
      var result = PP.validateCsvRows(rows);
      if (result.errors.length) {
        window.alert('Cannot import — ' + result.errors.length + ' error(s):\n' + result.errors.join('\n'));
        return;
      }
      var created = state.project.addTasks(result.tasks, state.currentUser);
      var rowToId = {};
      result.tasks.forEach(function (spec, i) { rowToId[spec._row] = created[i].id; });
      created.forEach(function (task) {
        task.predecessors = task.predecessors.map(function (rowNum) { return rowToId[rowNum]; });
      });
      window.alert('Imported ' + created.length + ' task(s).');
      refresh(state, true);
    };
    reader.onerror = function () {
      window.alert('Failed to read that file.');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function showApp(state) {
    document.getElementById('name-picker').hidden = true;
    document.getElementById('app').hidden = false;
    refresh(state, false);
    wireHeader(state);
    wireToolbar(state);
    wireViewTabs(state);
    wireGanttZoom(state);
    PP.wireTree(state, function () { refresh(state, true); });
    PP.wireGantt(state, function () { refresh(state, true); });
    PP.wireScurve(state, function () { PP.renderScurve(state); });
    PP.wireSnapshots(state, function () { refresh(state, true); });
    PP.wireSettings(state, function () { refresh(state, true); });
    PP.wireResources(state, function () { refresh(state, true); });
    PP.wireBilling(state, function () { refresh(state, true); });
    PP.wireHolidays(state, function () { refresh(state, true); });
    PP.wireReports(state, function () { PP.renderReport(state); });
    document.getElementById('csv-template-button').addEventListener('click', handleDownloadCsvTemplate);
    document.getElementById('import-csv-button').addEventListener('click', function () {
      document.getElementById('import-csv-input').click();
    });
    document.getElementById('import-csv-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) handleImportCsv(state, file);
      e.target.value = '';
    });
    window.addEventListener('beforeunload', function (e) {
      if (state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function showNamePicker(state) {
    var overlay = document.getElementById('name-picker');
    var input = document.getElementById('name-picker-input');
    var button = document.getElementById('name-picker-submit');
    overlay.hidden = false;

    function submit() {
      var name = input.value.trim();
      if (!name) return;
      localStorage.setItem('pp:currentUser', name);
      state.currentUser = name;
      showApp(state);
    }

    button.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submit();
    });
  }

  function boot() {
    var embedded = JSON.parse(document.getElementById('project-data').textContent);
    var project = new PP.Project(embedded);

    var stored = localStorage.getItem(storageKey(project.meta.id));
    if (stored) {
      var storedData = JSON.parse(stored);
      if (storedData.meta.revision > project.meta.revision) {
        var restore = window.confirm(
          'Unsaved local changes found (local revision ' + storedData.meta.revision +
          ' vs opened file revision ' + project.meta.revision + '). Restore them?'
        );
        if (restore) project = new PP.Project(storedData);
      }
    }

    var state = {
      project: project,
      currentUser: localStorage.getItem('pp:currentUser'),
      dirty: false,
      calc: null,
      filters: { search: '', owner: '', pic: '', status: '', onlyDelayed: false, onlyMine: false, onlyMilestone: false },
      scurveOverlaySnapshotId: null,
      snapshotCompareA: null,
      snapshotCompareB: null,
      holidaysViewYear: null,
    };

    if (state.currentUser) {
      showApp(state);
    } else {
      showNamePicker(state);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
