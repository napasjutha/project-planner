(function () {
  'use strict';

  var escapeHtml = PP.escapeHtml;

  function renderModeToggle(state) {
    var container = document.getElementById('estimator-mode-toggle');
    var estimator = state.project.estimator;

    container.innerHTML = '<div class="estimator-mode-selector">' +
      '<h2>Salesforce Field Service Estimator</h2>' +
      '<div class="button-group">' +
        '<button id="mode-detailed-btn" class="' + (estimator.mode === 'detailed' ? 'active' : '') + '">Detailed Estimate</button>' +
        '<button id="mode-highlevel-btn" class="' + (estimator.mode === 'highlevel' ? 'active' : '') + '">High Level Estimate</button>' +
      '</div>' +
    '</div>';

    var detailedBtn = document.getElementById('mode-detailed-btn');
    var highlevelBtn = document.getElementById('mode-highlevel-btn');

    detailedBtn.addEventListener('click', function () {
      if (estimator.mode === 'detailed') return;
      state.project._pushUndo();
      estimator.mode = 'detailed';
      PP.refresh(state, true);
    });

    highlevelBtn.addEventListener('click', function () {
      if (estimator.mode === 'highlevel') return;
      state.project._pushUndo();
      estimator.mode = 'highlevel';
      PP.refresh(state, true);
    });
  }

  function renderParams(state) {
    var container = document.getElementById('estimator-params');
    var params = state.project.estimator.params;

    var html = '<div class="settings-section">' +
      '<h3>Estimation Parameters</h3>' +
      '<div class="param-grid">' +
        '<label>Contingency %: <input type="number" id="param-contingency" min="0" max="100" step="1" value="' + (params.contingencyPct * 100) + '"></label>' +
        '<label>Confidence %: <input type="number" id="param-confidence" min="0" max="100" step="1" value="' + (params.confidencePct * 100) + '"></label>' +
        '<label>Change Management %: <input type="number" id="param-changeManagement" min="0" max="100" step="1" value="' + (params.changeManagementPct * 100) + '"></label>' +
        '<label>Project Management %: <input type="number" id="param-projectManagement" min="0" max="100" step="1" value="' + (params.projectManagementPct * 100) + '"></label>' +
        '<label>Testing %: <input type="number" id="param-testing" min="0" max="100" step="1" value="' + (params.testingPct * 100) + '"></label>' +
        '<label>Documentation %: <input type="number" id="param-documentation" min="0" max="100" step="1" value="' + (params.documentationPct * 100) + '"></label>' +
        '<label>UAT %: <input type="number" id="param-uat" min="0" max="100" step="1" value="' + (params.uatPct * 100) + '"></label>' +
        '<label>Deployment %: <input type="number" id="param-deployment" min="0" max="100" step="1" value="' + (params.deploymentPct * 100) + '"></label>' +
        '<label>Integrations Count: <input type="number" id="param-integrations" min="0" step="1" value="' + params.integrationsCount + '"></label>' +
        '<label>Migrations Count: <input type="number" id="param-migrations" min="0" step="1" value="' + params.migrationsCount + '"></label>' +
      '</div>' +
    '</div>';

    container.innerHTML = html;

    // Wire up change handlers
    var paramIds = ['contingency', 'confidence', 'changeManagement', 'projectManagement',
                    'testing', 'documentation', 'uat', 'deployment', 'integrations', 'migrations'];

    paramIds.forEach(function (id) {
      var input = document.getElementById('param-' + id);
      input.addEventListener('change', function () {
        state.project._pushUndo();
        var value = parseFloat(input.value);

        if (id === 'integrations') {
          params.integrationsCount = value;
        } else if (id === 'migrations') {
          params.migrationsCount = value;
        } else {
          params[id + 'Pct'] = value / 100;
        }

        // Recalculate summary
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(state, true);
      });
    });
  }

  function renderDetailedGrid(state) {
    var container = document.getElementById('estimator-detailed-grid');
    if (state.project.estimator.mode !== 'detailed') {
      container.innerHTML = '';
      return;
    }

    var requirements = state.project.estimator.requirements;

    var html = '<div class="settings-section settings-section-wide">' +
      '<h3>Requirements</h3>' +
      '<button id="add-requirement-btn">+ Add Requirement</button>' +
      '<table class="estimator-table">' +
        '<thead><tr>' +
          '<th>#</th>' +
          '<th>Requirement</th>' +
          '<th>Cloud</th>' +
          '<th>Feature</th>' +
          '<th>Solution Type</th>' +
          '<th>Complexity</th>' +
          '<th>MoSCoW</th>' +
          '<th>Release Phase</th>' +
          '<th>Effort (days)</th>' +
          '<th>Actions</th>' +
        '</tr></thead>' +
        '<tbody id="requirements-tbody">';

    requirements.forEach(function (req, index) {
      var calc = PP.calculateRequirement(req);
      html += '<tr data-req-id="' + req.id + '">' +
        '<td>' + (index + 1) + '</td>' +
        '<td><input type="text" class="req-name" value="' + escapeHtml(req.name || '') + '" placeholder="Requirement name"></td>' +
        '<td><select class="req-cloud">' +
          '<option value="">-</option>' +
          '<option value="Sales"' + (req.cloud === 'Sales' ? ' selected' : '') + '>Sales</option>' +
          '<option value="Service"' + (req.cloud === 'Service' ? ' selected' : '') + '>Service</option>' +
          '<option value="Marketing"' + (req.cloud === 'Marketing' ? ' selected' : '') + '>Marketing</option>' +
          '<option value="Community"' + (req.cloud === 'Community' ? ' selected' : '') + '>Community</option>' +
          '<option value="Experience"' + (req.cloud === 'Experience' ? ' selected' : '') + '>Experience</option>' +
          '<option value="CPQ"' + (req.cloud === 'CPQ' ? ' selected' : '') + '>CPQ</option>' +
        '</select></td>' +
        '<td><input type="text" class="req-feature" value="' + escapeHtml(req.feature || '') + '" placeholder="Feature"></td>' +
        '<td><select class="req-solutionType">' +
          '<option value="">-</option>' +
          '<option value="OOTB"' + (req.solutionType === 'OOTB' ? ' selected' : '') + '>OOTB</option>' +
          '<option value="Configuration"' + (req.solutionType === 'Configuration' ? ' selected' : '') + '>Configuration</option>' +
          '<option value="Customization"' + (req.solutionType === 'Customization' ? ' selected' : '') + '>Customization</option>' +
          '<option value="Integration"' + (req.solutionType === 'Integration' ? ' selected' : '') + '>Integration</option>' +
          '<option value="Migration"' + (req.solutionType === 'Migration' ? ' selected' : '') + '>Migration</option>' +
        '</select></td>' +
        '<td><select class="req-complexity">' +
          '<option value="">-</option>' +
          '<option value="Low"' + (req.complexity === 'Low' ? ' selected' : '') + '>Low</option>' +
          '<option value="Medium"' + (req.complexity === 'Medium' ? ' selected' : '') + '>Medium</option>' +
          '<option value="High"' + (req.complexity === 'High' ? ' selected' : '') + '>High</option>' +
        '</select></td>' +
        '<td><select class="req-moscow">' +
          '<option value="">-</option>' +
          '<option value="Must"' + (req.moscow === 'Must' ? ' selected' : '') + '>Must</option>' +
          '<option value="Should"' + (req.moscow === 'Should' ? ' selected' : '') + '>Should</option>' +
          '<option value="Could"' + (req.moscow === 'Could' ? ' selected' : '') + '>Could</option>' +
          '<option value="Wont"' + (req.moscow === 'Wont' ? ' selected' : '') + '>Won\'t</option>' +
        '</select></td>' +
        '<td><select class="req-phase">' +
          '<option value="">-</option>' +
          '<option value="Phase-1"' + (req.releasePhase === 'Phase-1' ? ' selected' : '') + '>Phase-1</option>' +
          '<option value="Phase-2"' + (req.releasePhase === 'Phase-2' ? ' selected' : '') + '>Phase-2</option>' +
          '<option value="Phase-3"' + (req.releasePhase === 'Phase-3' ? ' selected' : '') + '>Phase-3</option>' +
          '<option value="Phase-4"' + (req.releasePhase === 'Phase-4' ? ' selected' : '') + '>Phase-4</option>' +
          '<option value="Deferred"' + (req.releasePhase === 'Deferred' ? ' selected' : '') + '>Deferred</option>' +
        '</select></td>' +
        '<td>' + calc.totalDays.toFixed(2) + '</td>' +
        '<td><button class="delete-req-btn" data-req-id="' + req.id + '">Delete</button></td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Wire up Add Requirement button
    document.getElementById('add-requirement-btn').addEventListener('click', function () {
      state.project._pushUndo();
      var newReq = {
        id: PP.generateRequirementId(),
        name: '',
        cloud: '',
        feature: '',
        solutionType: '',
        complexity: '',
        moscow: '',
        releasePhase: ''
      };
      state.project.estimator.requirements.push(newReq);
      PP.refresh(state, true);
    });

    // Wire up delete buttons
    var deleteButtons = container.querySelectorAll('.delete-req-btn');
    deleteButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var reqId = btn.dataset.reqId;
        state.project._pushUndo();
        state.project.estimator.requirements = state.project.estimator.requirements.filter(function (r) {
          return r.id !== reqId;
        });
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(state, true);
      });
    });

    // Wire up input changes
    var tbody = document.getElementById('requirements-tbody');
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (row, index) {
      var req = requirements[index];

      row.querySelector('.req-name').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.name = e.target.value;
        PP.refresh(state, true);
      });

      row.querySelector('.req-cloud').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.cloud = e.target.value;
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(state, true);
      });

      row.querySelector('.req-feature').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.feature = e.target.value;
        PP.refresh(state, true);
      });

      row.querySelector('.req-solutionType').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.solutionType = e.target.value;
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(state, true);
      });

      row.querySelector('.req-complexity').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.complexity = e.target.value;
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(state, true);
      });

      row.querySelector('.req-moscow').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.moscow = e.target.value;
        PP.refresh(state, true);
      });

      row.querySelector('.req-phase').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.releasePhase = e.target.value;
        PP.refresh(state, true);
      });
    });
  }

  function renderHighLevelGrid(state) {
    var container = document.getElementById('estimator-highlevel-grid');
    if (state.project.estimator.mode !== 'highlevel') {
      container.innerHTML = '';
      return;
    }

    var highlevel = state.project.estimator.highlevel;
    var clouds = ['Sales', 'Service', 'Marketing', 'Community', 'Experience', 'CPQ', 'Integration', 'Migration'];

    var html = '<div class="settings-section settings-section-wide">' +
      '<h3>Component Counts by Cloud and Complexity</h3>' +
      '<table class="estimator-table highlevel-table">' +
        '<thead><tr>' +
          '<th>Cloud</th>' +
          '<th>Low</th>' +
          '<th>Medium</th>' +
          '<th>High</th>' +
          '<th>Total Effort (days)</th>' +
        '</tr></thead>' +
        '<tbody>';

    clouds.forEach(function (cloud) {
      var calc = PP.calculateHighLevelCloud(highlevel, cloud);
      html += '<tr>' +
        '<td><strong>' + cloud + '</strong></td>' +
        '<td><input type="number" class="hl-count" data-cloud="' + cloud + '" data-complexity="low" min="0" step="1" value="' + highlevel[cloud].low + '"></td>' +
        '<td><input type="number" class="hl-count" data-cloud="' + cloud + '" data-complexity="medium" min="0" step="1" value="' + highlevel[cloud].medium + '"></td>' +
        '<td><input type="number" class="hl-count" data-cloud="' + cloud + '" data-complexity="high" min="0" step="1" value="' + highlevel[cloud].high + '"></td>' +
        '<td>' + calc.totalDays.toFixed(2) + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Wire up change handlers
    var inputs = container.querySelectorAll('.hl-count');
    inputs.forEach(function (input) {
      input.addEventListener('change', function () {
        var cloud = input.dataset.cloud;
        var complexity = input.dataset.complexity;
        var value = parseInt(input.value, 10) || 0;

        state.project._pushUndo();
        highlevel[cloud][complexity] = value;
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(state, true);
      });
    });
  }

  function renderSummary(state) {
    var container = document.getElementById('estimator-summary');

    // Placeholder for Task 9
    container.innerHTML = '<div class="settings-section settings-section-wide">' +
      '<h3>Summary</h3>' +
      '<p>Summary display will be implemented in Task 9</p>' +
    '</div>';
  }

  function renderPushActions(state) {
    var container = document.getElementById('estimator-push-actions');

    // Placeholder for Task 10
    container.innerHTML = '<div class="settings-section">' +
      '<p>Push to Plan functionality will be implemented in Task 10</p>' +
    '</div>';
  }

  function renderEstimator(state) {
    renderModeToggle(state);
    renderParams(state);
    renderDetailedGrid(state);
    renderHighLevelGrid(state);
    renderSummary(state);
    renderPushActions(state);
  }

  PP.renderEstimator = renderEstimator;
})();
