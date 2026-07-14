(function () {
  'use strict';

  var ISSUE_STATUSES = ['Open', 'Resolved'];
  var RISK_STATUSES = ['Open', 'Mitigated', 'Closed'];
  var RISK_LEVELS = ['Low', 'Medium', 'High'];
  var DECISION_STATUSES = ['Pending', 'Decided'];

  function headerRow(labels) {
    var tr = document.createElement('tr');
    labels.forEach(function (label) {
      var th = document.createElement('th');
      th.textContent = label;
      tr.appendChild(th);
    });
    return tr;
  }

  function textCell(field, value) {
    var span = document.createElement('span');
    span.className = 'cell';
    span.dataset.field = field;
    span.textContent = value || '';
    var td = document.createElement('td');
    td.appendChild(span);
    return td;
  }

  function conditionalTextCell(active, field, value) {
    var td = document.createElement('td');
    if (active) {
      var span = document.createElement('span');
      span.className = 'cell';
      span.dataset.field = field;
      span.textContent = value || '';
      td.appendChild(span);
    } else {
      var placeholder = document.createElement('span');
      placeholder.className = 'cell-inactive';
      placeholder.textContent = value || '—';
      td.appendChild(placeholder);
    }
    return td;
  }

  function selectCell(field, options, current) {
    var td = document.createElement('td');
    var select = document.createElement('select');
    select.dataset.field = field;
    options.forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (current === opt) option.selected = true;
      select.appendChild(option);
    });
    td.appendChild(select);
    return td;
  }

  function deleteCell() {
    var td = document.createElement('td');
    var btn = document.createElement('button');
    btn.className = 'row-delete-btn';
    btn.textContent = 'Delete';
    td.appendChild(btn);
    return td;
  }

  function renderIssuesTable(issues) {
    var body = document.getElementById('issues-body');
    body.innerHTML = '';
    if (!issues.length) {
      body.textContent = 'No issues logged yet.';
      return;
    }
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    table.appendChild(headerRow(['Title', 'Description', 'Owner', 'Status', 'Date Raised', 'Date Resolved', '']));
    issues.forEach(function (issue) {
      var tr = document.createElement('tr');
      tr.dataset.id = issue.id;
      tr.appendChild(textCell('title', issue.title));
      tr.appendChild(textCell('description', issue.description));
      tr.appendChild(textCell('owner', issue.owner));
      tr.appendChild(selectCell('status', ISSUE_STATUSES, issue.status));
      tr.appendChild(textCell('dateRaised', issue.dateRaised));
      tr.appendChild(conditionalTextCell(issue.status === 'Resolved', 'dateResolved', issue.dateResolved));
      tr.appendChild(deleteCell());
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderRisksTable(risks) {
    var body = document.getElementById('risks-body');
    body.innerHTML = '';
    if (!risks.length) {
      body.textContent = 'No risks logged yet.';
      return;
    }
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    table.appendChild(headerRow(['Title', 'Description', 'Likelihood', 'Impact', 'Mitigation', 'Owner', 'Status', 'Date Raised', '']));
    risks.forEach(function (risk) {
      var tr = document.createElement('tr');
      tr.dataset.id = risk.id;
      tr.appendChild(textCell('title', risk.title));
      tr.appendChild(textCell('description', risk.description));
      tr.appendChild(selectCell('likelihood', RISK_LEVELS, risk.likelihood));
      tr.appendChild(selectCell('impact', RISK_LEVELS, risk.impact));
      tr.appendChild(textCell('mitigation', risk.mitigation));
      tr.appendChild(textCell('owner', risk.owner));
      tr.appendChild(selectCell('status', RISK_STATUSES, risk.status));
      tr.appendChild(textCell('dateRaised', risk.dateRaised));
      tr.appendChild(deleteCell());
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderDecisionsTable(decisions) {
    var body = document.getElementById('decisions-body');
    body.innerHTML = '';
    if (!decisions.length) {
      body.textContent = 'No decisions logged yet.';
      return;
    }
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    table.appendChild(headerRow(['Title', 'Description', 'Decision Needed By', 'Owner', 'Status', 'Decision Made', '']));
    decisions.forEach(function (decision) {
      var tr = document.createElement('tr');
      tr.dataset.id = decision.id;
      tr.appendChild(textCell('title', decision.title));
      tr.appendChild(textCell('description', decision.description));
      tr.appendChild(textCell('decisionNeededBy', decision.decisionNeededBy));
      tr.appendChild(textCell('owner', decision.owner));
      tr.appendChild(selectCell('status', DECISION_STATUSES, decision.status));
      tr.appendChild(conditionalTextCell(decision.status === 'Decided', 'decisionMade', decision.decisionMade));
      tr.appendChild(deleteCell());
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderIssuesRisksDecisions(state) {
    renderIssuesTable(state.project.issues);
    renderRisksTable(state.project.risks);
    renderDecisionsTable(state.project.decisions);
  }

  function fieldInputType(field) {
    return (field === 'dateRaised' || field === 'dateResolved' || field === 'decisionNeededBy') ? 'date' : 'text';
  }

  function beginEditCell(cell, currentValue, inputType, onCommit, onCancel) {
    var el = document.createElement('input');
    el.className = 'cell-editor';
    el.type = inputType;
    el.value = currentValue || '';
    cell.innerHTML = '';
    cell.appendChild(el);
    el.focus();
    if (el.select) el.select();

    var settled = false;

    function commit() {
      if (settled) return;
      settled = true;
      var value = el.value;
      if (inputType === 'date' && value === '') value = null;
      onCommit(value);
    }

    function cancel() {
      if (settled) return;
      settled = true;
      onCancel();
    }

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
    el.addEventListener('blur', commit);
  }

  function wireCrudTable(containerId, getRecord, updateFn, deleteFn, who, onChanged, rerender) {
    var body = document.getElementById(containerId);

    body.addEventListener('dblclick', function (e) {
      var cell = e.target.closest('.cell');
      if (!cell) return;
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var id = tr.dataset.id;
      var field = cell.dataset.field;
      var record = getRecord(id);
      beginEditCell(cell, record[field], fieldInputType(field), function (value) {
        var patch = {};
        patch[field] = value;
        updateFn(id, patch, who);
        onChanged();
      }, function () {
        rerender();
      });
    });

    body.addEventListener('change', function (e) {
      var field = e.target.dataset.field;
      if (!field) return;
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var patch = {};
      patch[field] = e.target.value;
      updateFn(tr.dataset.id, patch, who);
      onChanged();
    });

    body.addEventListener('click', function (e) {
      if (!e.target.classList.contains('row-delete-btn')) return;
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      deleteFn(tr.dataset.id, who);
      onChanged();
    });
  }

  function wireIssuesRisksDecisions(state, onChanged) {
    document.getElementById('add-issue-button').addEventListener('click', function () {
      state.project.addIssue({});
      onChanged();
    });
    document.getElementById('add-risk-button').addEventListener('click', function () {
      state.project.addRisk({});
      onChanged();
    });
    document.getElementById('add-decision-button').addEventListener('click', function () {
      state.project.addDecision({});
      onChanged();
    });

    wireCrudTable(
      'issues-body',
      function (id) { return state.project.issues.find(function (i) { return i.id === id; }); },
      function (id, patch, who) { state.project.updateIssue(id, patch, who); },
      function (id, who) { state.project.deleteIssue(id, who); },
      state.currentUser,
      onChanged,
      function () { renderIssuesTable(state.project.issues); }
    );

    wireCrudTable(
      'risks-body',
      function (id) { return state.project.risks.find(function (r) { return r.id === id; }); },
      function (id, patch, who) { state.project.updateRisk(id, patch, who); },
      function (id, who) { state.project.deleteRisk(id, who); },
      state.currentUser,
      onChanged,
      function () { renderRisksTable(state.project.risks); }
    );

    wireCrudTable(
      'decisions-body',
      function (id) { return state.project.decisions.find(function (d) { return d.id === id; }); },
      function (id, patch, who) { state.project.updateDecision(id, patch, who); },
      function (id, who) { state.project.deleteDecision(id, who); },
      state.currentUser,
      onChanged,
      function () { renderDecisionsTable(state.project.decisions); }
    );
  }

  window.PP = window.PP || {};
  window.PP.renderIssuesRisksDecisions = renderIssuesRisksDecisions;
  window.PP.wireIssuesRisksDecisions = wireIssuesRisksDecisions;
})();
