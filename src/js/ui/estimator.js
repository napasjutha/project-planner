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

    // Placeholder for Task 7
    container.innerHTML = '<div class="settings-section settings-section-wide">' +
      '<h3>Requirements</h3>' +
      '<p>Detailed requirements grid will be implemented in Task 7</p>' +
    '</div>';
  }

  function renderHighLevelGrid(state) {
    var container = document.getElementById('estimator-highlevel-grid');
    if (state.project.estimator.mode !== 'highlevel') {
      container.innerHTML = '';
      return;
    }

    // Placeholder for Task 8
    container.innerHTML = '<div class="settings-section settings-section-wide">' +
      '<h3>Component Counts</h3>' +
      '<p>High-level component grid will be implemented in Task 8</p>' +
    '</div>';
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
