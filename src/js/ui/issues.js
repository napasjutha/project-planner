(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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
    var headerRow = document.createElement('tr');
    ['Title', 'Description', 'Owner', 'Status', 'Date Raised', 'Date Resolved'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    issues.forEach(function (issue) {
      var tr = document.createElement('tr');
      tr.dataset.id = issue.id;
      tr.innerHTML =
        '<td>' + escapeHtml(issue.title) + '</td>' +
        '<td>' + escapeHtml(issue.description) + '</td>' +
        '<td>' + escapeHtml(issue.owner) + '</td>' +
        '<td>' + escapeHtml(issue.status) + '</td>' +
        '<td>' + escapeHtml(issue.dateRaised || '') + '</td>' +
        '<td>' + escapeHtml(issue.dateResolved || '') + '</td>';
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
    var headerRow = document.createElement('tr');
    ['Title', 'Description', 'Likelihood', 'Impact', 'Mitigation', 'Owner', 'Status', 'Date Raised'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    risks.forEach(function (risk) {
      var tr = document.createElement('tr');
      tr.dataset.id = risk.id;
      tr.innerHTML =
        '<td>' + escapeHtml(risk.title) + '</td>' +
        '<td>' + escapeHtml(risk.description) + '</td>' +
        '<td>' + escapeHtml(risk.likelihood) + '</td>' +
        '<td>' + escapeHtml(risk.impact) + '</td>' +
        '<td>' + escapeHtml(risk.mitigation) + '</td>' +
        '<td>' + escapeHtml(risk.owner) + '</td>' +
        '<td>' + escapeHtml(risk.status) + '</td>' +
        '<td>' + escapeHtml(risk.dateRaised || '') + '</td>';
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
    var headerRow = document.createElement('tr');
    ['Title', 'Description', 'Decision Needed By', 'Owner', 'Status', 'Decision Made'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    decisions.forEach(function (decision) {
      var tr = document.createElement('tr');
      tr.dataset.id = decision.id;
      tr.innerHTML =
        '<td>' + escapeHtml(decision.title) + '</td>' +
        '<td>' + escapeHtml(decision.description) + '</td>' +
        '<td>' + escapeHtml(decision.decisionNeededBy || '') + '</td>' +
        '<td>' + escapeHtml(decision.owner) + '</td>' +
        '<td>' + escapeHtml(decision.status) + '</td>' +
        '<td>' + escapeHtml(decision.decisionMade) + '</td>';
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderIssuesRisksDecisions(state) {
    renderIssuesTable(state.project.issues);
    renderRisksTable(state.project.risks);
    renderDecisionsTable(state.project.decisions);
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
  }

  window.PP = window.PP || {};
  window.PP.renderIssuesRisksDecisions = renderIssuesRisksDecisions;
  window.PP.wireIssuesRisksDecisions = wireIssuesRisksDecisions;
})();
