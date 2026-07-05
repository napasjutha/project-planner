(function () {
  'use strict';

  function renderSnapshots(state) {
    var list = document.getElementById('snapshots-list');
    list.innerHTML = '';
    var snaps = state.project.snapshots;

    if (!snaps.length) {
      var empty = document.createElement('div');
      empty.textContent = 'No snapshots yet.';
      list.appendChild(empty);
    }

    snaps.slice().reverse().forEach(function (snap) {
      var row = document.createElement('div');
      row.className = 'snapshot-row';
      row.dataset.id = snap.id;

      var info = document.createElement('span');
      info.textContent = (snap.takenAt || '').slice(0, 10) + ' by ' + snap.takenBy +
        (snap.note ? ' — ' + snap.note : '') + ' (Actual ' + Math.round(snap.overall.actualPct * 100) + '%)';
      row.appendChild(info);

      var labelA = document.createElement('label');
      var checkboxA = document.createElement('input');
      checkboxA.type = 'radio';
      checkboxA.name = 'snapshot-a';
      checkboxA.value = snap.id;
      checkboxA.className = 'snapshot-select-a';
      checkboxA.checked = snap.id === state.snapshotCompareA;
      labelA.appendChild(checkboxA);
      labelA.appendChild(document.createTextNode('A'));
      row.appendChild(labelA);

      var labelB = document.createElement('label');
      var checkboxB = document.createElement('input');
      checkboxB.type = 'radio';
      checkboxB.name = 'snapshot-b';
      checkboxB.value = snap.id;
      checkboxB.className = 'snapshot-select-b';
      checkboxB.checked = snap.id === state.snapshotCompareB;
      labelB.appendChild(checkboxB);
      labelB.appendChild(document.createTextNode('B'));
      row.appendChild(labelB);

      var deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'snapshot-delete-btn';
      deleteBtn.dataset.id = snap.id;
      row.appendChild(deleteBtn);

      list.appendChild(row);
    });

    renderComparison(state);
  }

  function renderComparison(state) {
    var out = document.getElementById('snapshot-comparison');
    out.innerHTML = '';
    var a = state.project.snapshots.find(function (s) { return s.id === state.snapshotCompareA; });
    var b = state.project.snapshots.find(function (s) { return s.id === state.snapshotCompareB; });
    if (!a || !b) {
      out.textContent = 'Select A and B above to compare.';
      return;
    }
    var diff = PP.compareSnapshots(a, b);

    var summary = document.createElement('div');
    summary.textContent = 'Actual change: ' + Math.round(diff.overallDelta.actualPct * 100) +
      'pp, Plan change: ' + Math.round(diff.overallDelta.plannedPct * 100) + 'pp';
    out.appendChild(summary);

    var added = document.createElement('div');
    added.textContent = 'Added tasks: ' + diff.added.length;
    out.appendChild(added);

    var removed = document.createElement('div');
    removed.textContent = 'Removed tasks: ' + diff.removed.length;
    out.appendChild(removed);

    var slippedTitle = document.createElement('div');
    slippedTitle.textContent = 'Slipped tasks: ' + diff.slipped.length;
    out.appendChild(slippedTitle);
    if (diff.slipped.length) {
      var ul = document.createElement('ul');
      diff.slipped.forEach(function (s) {
        var li = document.createElement('li');
        var task = b.tasks.find(function (t) { return t.id === s.id; });
        li.textContent = (task ? task.name : s.id) + ': ' + s.from + ' -> ' + s.to;
        ul.appendChild(li);
      });
      out.appendChild(ul);
    }
  }

  function wireSnapshots(state, onChanged) {
    document.getElementById('take-snapshot-button').addEventListener('click', function () {
      var noteInput = document.getElementById('snapshot-note-input');
      PP.takeSnapshot(state.project, state.calc, noteInput.value, state.currentUser);
      noteInput.value = '';
      onChanged();
    });

    var list = document.getElementById('snapshots-list');
    list.addEventListener('click', function (e) {
      var deleteBtn = e.target.closest('.snapshot-delete-btn');
      if (!deleteBtn) return;
      var id = deleteBtn.dataset.id;
      state.project.snapshots = state.project.snapshots.filter(function (s) { return s.id !== id; });
      if (state.snapshotCompareA === id) state.snapshotCompareA = null;
      if (state.snapshotCompareB === id) state.snapshotCompareB = null;
      if (state.scurveOverlaySnapshotId === id) state.scurveOverlaySnapshotId = null;
      onChanged();
    });

    list.addEventListener('change', function (e) {
      if (e.target.classList.contains('snapshot-select-a')) {
        state.snapshotCompareA = e.target.value;
        renderComparison(state);
      } else if (e.target.classList.contains('snapshot-select-b')) {
        state.snapshotCompareB = e.target.value;
        renderComparison(state);
      }
    });
  }

  window.PP = window.PP || {};
  window.PP.renderSnapshots = renderSnapshots;
  window.PP.wireSnapshots = wireSnapshots;
})();
