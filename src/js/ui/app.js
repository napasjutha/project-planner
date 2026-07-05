(function () {
  'use strict';

  var STORAGE_PREFIX = 'pp:';

  function storageKey(projectId) {
    return STORAGE_PREFIX + projectId;
  }

  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    renderHeader(state);
    PP.renderTree(state);
    if (markDirty) {
      state.dirty = true;
      document.getElementById('dirty-indicator').textContent = '● unsaved changes';
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

  function wireHeader(state) {
    document.getElementById('status-date-input').addEventListener('change', function (e) {
      state.project.meta.statusDate = e.target.value;
      refresh(state, true);
    });
    document.getElementById('save-button').addEventListener('click', function () {
      handleSave(state);
    });
  }

  function wireToolbar(state) {
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
    document.getElementById('pic-filter').addEventListener('change', function (e) {
      state.filters.pic = e.target.value;
      onFilterChange();
    });
  }

  function handleSave(state) {
    state.project.meta.savedBy = state.currentUser;
    state.project.meta.savedAt = new Date().toISOString();
    var json = state.project.serialize();

    var clone = document.documentElement.cloneNode(true);
    var dataScript = clone.querySelector('#project-data');
    dataScript.textContent = json;
    var html = '<!doctype html>\n' + clone.outerHTML;

    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ProjectPlanner.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    state.dirty = false;
    document.getElementById('dirty-indicator').textContent = '';
    localStorage.setItem(storageKey(state.project.meta.id), json);
  }

  function showApp(state) {
    document.getElementById('name-picker').hidden = true;
    document.getElementById('app').hidden = false;
    refresh(state, false);
    wireHeader(state);
    wireToolbar(state);
    PP.wireTree(state, function () { refresh(state, true); });
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
      filters: { search: '', pic: '', status: '', onlyDelayed: false, onlyMine: false },
    };

    if (state.currentUser) {
      showApp(state);
    } else {
      showNamePicker(state);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
