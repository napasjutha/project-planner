(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var paramsExpanded = false;
  var summaryView = 'table'; // 'table' or 'chart'
  var chartCategory = 'byCloud'; // 'byCloud', 'byStage', 'byRole', 'byComponent', 'byActivity'

  function renderHeader(state) {
    var estimator = state.project.estimator;
    var params = estimator.params;

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<div class="estimator-mode-toggle">' +
        '<button id="mode-detailed-btn" class="' + (estimator.mode === 'detailed' ? 'active' : '') + '">Detailed Estimate</button>' +
        '<button id="mode-highlevel-btn" class="' + (estimator.mode === 'highlevel' ? 'active' : '') + '">High Level Estimate</button>' +
      '</div>' +
      '<div>' +
        '<button id="estimator-import-csv-btn" style="padding:6px 12px;font-size:12px;border:1px solid var(--border);background:var(--surface);border-radius:var(--radius-md);cursor:pointer">Import CSV</button>' +
        '<input type="file" id="estimator-import-csv-input" accept=".csv" style="display:none">' +
      '</div>' +
    '</div>' +
    '<div class="estimator-params-toggle" id="params-toggle">' +
      '<span>' + (paramsExpanded ? '▼' : '▶') + '</span> Estimation Parameters' +
    '</div>' +
    '<div class="estimator-params-content" id="params-content" ' + (paramsExpanded ? '' : 'style="display:none"') + '>' +
      '<label>Contingency %<input type="number" id="param-contingency" min="0" max="100" step="1" value="' + (params.contingencyPct * 100) + '"></label>' +
      '<label>Confidence %<input type="number" id="param-confidence" min="0" max="100" step="1" value="' + (params.confidencePct * 100) + '"></label>' +
      '<label>Change Mgmt %<input type="number" id="param-changeManagement" min="0" max="100" step="1" value="' + (params.changeManagementPct * 100) + '"></label>' +
      '<label>Project Mgmt %<input type="number" id="param-projectManagement" min="0" max="100" step="1" value="' + (params.projectManagementPct * 100) + '"></label>' +
      '<label>Testing %<input type="number" id="param-testing" min="0" max="100" step="1" value="' + (params.testingPct * 100) + '"></label>' +
      '<label>Documentation %<input type="number" id="param-documentation" min="0" max="100" step="1" value="' + (params.documentationPct * 100) + '"></label>' +
      '<label>UAT %<input type="number" id="param-uat" min="0" max="100" step="1" value="' + (params.uatPct * 100) + '"></label>' +
      '<label>Deployment %<input type="number" id="param-deployment" min="0" max="100" step="1" value="' + (params.deploymentPct * 100) + '"></label>' +
      '<label>Integrations Count<input type="number" id="param-integrations" min="0" step="1" value="' + params.integrationsCount + '"></label>' +
      '<label>Migrations Count<input type="number" id="param-migrations" min="0" step="1" value="' + params.migrationsCount + '"></label>' +
    '</div>';

    return html;
  }

  function wireHeader(state) {
    document.getElementById('mode-detailed-btn').addEventListener('click', function () {
      if (state.project.estimator.mode === 'detailed') return;
      state.project._pushUndo();
      state.project.estimator.mode = 'detailed';
      PP.refresh(true);
    });

    document.getElementById('mode-highlevel-btn').addEventListener('click', function () {
      if (state.project.estimator.mode === 'highlevel') return;
      state.project._pushUndo();
      state.project.estimator.mode = 'highlevel';
      PP.refresh(true);
    });

    document.getElementById('params-toggle').addEventListener('click', function () {
      paramsExpanded = !paramsExpanded;
      PP.refresh(true);
    });

    var paramIds = ['contingency', 'confidence', 'changeManagement', 'projectManagement',
                    'testing', 'documentation', 'uat', 'deployment', 'integrations', 'migrations'];

    paramIds.forEach(function (id) {
      var input = document.getElementById('param-' + id);
      input.addEventListener('change', function () {
        state.project._pushUndo();
        var value = parseFloat(input.value);
        var params = state.project.estimator.params;

        if (id === 'integrations') {
          params.integrationsCount = value;
        } else if (id === 'migrations') {
          params.migrationsCount = value;
        } else {
          params[id + 'Pct'] = value / 100;
        }

        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(true);
      });
    });

    document.getElementById('estimator-import-csv-btn').addEventListener('click', function () {
      document.getElementById('estimator-import-csv-input').click();
    });

    document.getElementById('estimator-import-csv-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) handleEstimatorImportCsv(state, file);
      e.target.value = '';
    });
  }

  function handleEstimatorImportCsv(state, file) {
    if (state.project.estimator.mode !== 'detailed') {
      alert('Switch to Detailed Estimate mode to import requirements.');
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      var rows = PP.parseCsvText(PP.stripBom(reader.result));
      if (rows.length < 2) {
        alert('CSV has no data rows.');
        return;
      }
      var result = PP.parseEstimatorCsv(rows);
      if (result.errors.length) {
        alert('Cannot import — ' + result.errors.length + ' error(s):\n' + result.errors.join('\n'));
        return;
      }

      state.project._pushUndo();

      result.requirements.forEach(function (req) {
        var requirement = {
          id: PP.generateRequirementId(),
          name: req.name,
          cloud: req.cloud,
          feature: req.feature,
          solutionType: req.solutionType,
          complexity: req.complexity,
          moscow: req.moscow,
          releasePhase: req.releasePhase
        };
        state.project.estimator.requirements.push(requirement);
      });

      state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
      alert('Imported ' + result.requirements.length + ' requirement(s).');
      PP.refresh(true);
    };
    reader.onerror = function () {
      alert('Failed to read that file.');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function renderDetailedGrid(state) {
    if (state.project.estimator.mode !== 'detailed') return '';

    var requirements = state.project.estimator.requirements;

    var html = '<div class="estimator-card">' +
      '<h3>Requirements</h3>' +
      '<button id="add-requirement-btn">+ Add Requirement</button>' +
      '<table class="estimator-table">' +
        '<thead><tr>' +
          '<th style="width:40px">#</th>' +
          '<th>Requirement</th>' +
          '<th style="width:120px">Cloud</th>' +
          '<th>Feature</th>' +
          '<th style="width:140px">Solution Type</th>' +
          '<th style="width:120px">Complexity</th>' +
          '<th style="width:100px">MoSCoW</th>' +
          '<th style="width:120px">Release Phase</th>' +
          '<th style="width:90px">Effort (days)</th>' +
          '<th style="width:80px">Actions</th>' +
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
        '<td style="text-align:right">' + calc.totalDays.toFixed(2) + '</td>' +
        '<td><button class="delete-req-btn" data-req-id="' + req.id + '">Delete</button></td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  function wireDetailedGrid(state) {
    var addBtn = document.getElementById('add-requirement-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        state.project._pushUndo();
        state.project.estimator.requirements.push({
          id: PP.generateRequirementId(),
          name: '',
          cloud: '',
          feature: '',
          solutionType: '',
          complexity: '',
          moscow: '',
          releasePhase: ''
        });
        PP.refresh(true);
      });
    }

    var deleteButtons = document.querySelectorAll('.delete-req-btn');
    deleteButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var reqId = btn.dataset.reqId;
        state.project._pushUndo();
        state.project.estimator.requirements = state.project.estimator.requirements.filter(function (r) {
          return r.id !== reqId;
        });
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(true);
      });
    });

    var tbody = document.getElementById('requirements-tbody');
    if (!tbody) return;

    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (row, index) {
      var req = state.project.estimator.requirements[index];

      row.querySelector('.req-name').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.name = e.target.value;
        PP.refresh(true);
      });

      row.querySelector('.req-cloud').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.cloud = e.target.value;
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(true);
      });

      row.querySelector('.req-feature').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.feature = e.target.value;
        PP.refresh(true);
      });

      row.querySelector('.req-solutionType').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.solutionType = e.target.value;
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(true);
      });

      row.querySelector('.req-complexity').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.complexity = e.target.value;
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(true);
      });

      row.querySelector('.req-moscow').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.moscow = e.target.value;
        PP.refresh(true);
      });

      row.querySelector('.req-phase').addEventListener('change', function (e) {
        state.project._pushUndo();
        req.releasePhase = e.target.value;
        PP.refresh(true);
      });
    });
  }

  function renderHighLevelGrid(state) {
    if (state.project.estimator.mode !== 'highlevel') return '';

    var highlevel = state.project.estimator.highlevel;
    var clouds = ['Sales', 'Service', 'Marketing', 'Community', 'Experience', 'CPQ', 'Integration', 'Migration'];

    var html = '<div class="estimator-card">' +
      '<h3>Component Counts by Cloud and Complexity</h3>' +
      '<table class="estimator-table highlevel-table">' +
        '<thead><tr>' +
          '<th>Cloud</th>' +
          '<th style="text-align:center">Low</th>' +
          '<th style="text-align:center">Medium</th>' +
          '<th style="text-align:center">High</th>' +
          '<th style="text-align:right">Total Effort (days)</th>' +
        '</tr></thead>' +
        '<tbody>';

    clouds.forEach(function (cloud) {
      var calc = PP.calculateHighLevelCloud(highlevel, cloud);
      html += '<tr>' +
        '<td>' + cloud + '</td>' +
        '<td style="text-align:center"><input type="number" class="hl-count" data-cloud="' + cloud + '" data-complexity="low" min="0" step="1" value="' + highlevel[cloud].low + '"></td>' +
        '<td style="text-align:center"><input type="number" class="hl-count" data-cloud="' + cloud + '" data-complexity="medium" min="0" step="1" value="' + highlevel[cloud].medium + '"></td>' +
        '<td style="text-align:center"><input type="number" class="hl-count" data-cloud="' + cloud + '" data-complexity="high" min="0" step="1" value="' + highlevel[cloud].high + '"></td>' +
        '<td style="text-align:right">' + calc.totalDays.toFixed(2) + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  function wireHighLevelGrid(state) {
    var inputs = document.querySelectorAll('.hl-count');
    inputs.forEach(function (input) {
      input.addEventListener('change', function () {
        var cloud = input.dataset.cloud;
        var complexity = input.dataset.complexity;
        var value = parseInt(input.value, 10) || 0;

        state.project._pushUndo();
        state.project.estimator.highlevel[cloud][complexity] = value;
        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(true);
      });
    });
  }

  function renderSummary(state) {
    state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
    var summary = state.project.estimator.summary;

    function renderBreakdownTable(title, data) {
      if (Object.keys(data).length === 0) {
        return '<div class="estimator-card"><h3>' + title + '</h3><p style="color:var(--text-secondary);font-size:12px">No data</p></div>';
      }

      var html = '<div class="estimator-card">' +
        '<h3>' + title + '</h3>' +
        '<div class="summary-breakdown"><table>' +
          '<thead><tr><th>Item</th><th>Days</th><th>%</th></tr></thead>' +
          '<tbody>';

      var total = summary.totalDays;
      for (var key in data) {
        if (data.hasOwnProperty(key)) {
          var days = data[key];
          var pct = total > 0 ? ((days / total) * 100).toFixed(1) : 0;
          html += '<tr><td>' + escapeHtml(key) + '</td><td>' + days.toFixed(2) + '</td><td>' + pct + '%</td></tr>';
        }
      }

      html += '</tbody></table></div></div>';
      return html;
    }

    function renderChartView() {
      var html = '<div class="estimator-card" style="grid-column: 1 / -1">' +
        '<div class="chart-legend">' +
          '<button class="legend-btn ' + (chartCategory === 'byCloud' ? 'active' : '') + '" data-category="byCloud">Cloud</button>' +
          '<button class="legend-btn ' + (chartCategory === 'byStage' ? 'active' : '') + '" data-category="byStage">Powered Stage</button>' +
          '<button class="legend-btn ' + (chartCategory === 'byRole' ? 'active' : '') + '" data-category="byRole">Role</button>' +
          '<button class="legend-btn ' + (chartCategory === 'byComponent' ? 'active' : '') + '" data-category="byComponent">Component Type</button>' +
          '<button class="legend-btn ' + (chartCategory === 'byActivity' ? 'active' : '') + '" data-category="byActivity">Activity</button>' +
        '</div>' +
        '<div class="chart-container">' +
          '<canvas id="summary-chart" width="800" height="400"></canvas>' +
        '</div>' +
      '</div>';
      return html;
    }

    var html = '<div class="estimator-summary-section">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<h3 style="margin:0;font-size:16px;font-weight:600">Estimation Summary</h3>' +
        '<div class="summary-view-toggle">' +
          '<button id="summary-table-btn" class="' + (summaryView === 'table' ? 'active' : '') + '">Table</button>' +
          '<button id="summary-chart-btn" class="' + (summaryView === 'chart' ? 'active' : '') + '">Chart</button>' +
        '</div>' +
      '</div>' +
      '<div class="estimator-summary-grid">' +
        '<div class="summary-total">' +
          '<div class="summary-total-label">Total Effort</div>' +
          '<div class="summary-total-value">' + summary.totalDays.toFixed(1) + '</div>' +
          '<div class="summary-total-label">' + (summary.totalDays * 8).toFixed(0) + ' hours</div>' +
        '</div>' +
        (summaryView === 'table'
          ? renderBreakdownTable('By Cloud', summary.byCloud) +
            renderBreakdownTable('By Powered Stage', summary.byStage) +
            renderBreakdownTable('By Role', summary.byRole) +
            renderBreakdownTable('By Component Type', summary.byComponent) +
            renderBreakdownTable('By Activity', summary.byActivity)
          : renderChartView()
        ) +
      '</div>' +
    '</div>';

    return html;
  }

  function wireSummary(state) {
    var tableBtn = document.getElementById('summary-table-btn');
    var chartBtn = document.getElementById('summary-chart-btn');

    if (tableBtn) {
      tableBtn.addEventListener('click', function () {
        summaryView = 'table';
        PP.refresh(true);
      });
    }

    if (chartBtn) {
      chartBtn.addEventListener('click', function () {
        summaryView = 'chart';
        PP.refresh(true);
      });
    }

    if (summaryView === 'chart') {
      var legendBtns = document.querySelectorAll('.legend-btn');
      legendBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          chartCategory = btn.getAttribute('data-category');
          PP.refresh(true);
        });
      });

      drawChart(state);
    }
  }

  function drawChart(state) {
    var canvas = document.getElementById('summary-chart');
    if (!canvas) return;

    var summary = state.project.estimator.summary;
    var data = summary[chartCategory];
    if (!data || Object.keys(data).length === 0) return;

    var ctx = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;

    // Get computed colors
    var computedStyle = getComputedStyle(document.documentElement);
    var kpmgBlue = computedStyle.getPropertyValue('--kpmg-blue').trim() || '#00338d';
    var textColor = computedStyle.getPropertyValue('--text').trim() || '#000';

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Prepare data
    var items = [];
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        items.push({ label: key, value: data[key] });
      }
    }

    if (items.length === 0) return;

    // Sort by value descending
    items.sort(function (a, b) { return b.value - a.value; });

    var maxValue = Math.max.apply(null, items.map(function (item) { return item.value; }));
    var barHeight = 30;
    var barSpacing = 10;
    var leftMargin = 150;
    var rightMargin = 80;
    var topMargin = 20;
    var chartWidth = width - leftMargin - rightMargin;

    // Draw bars
    items.forEach(function (item, i) {
      var barWidth = (item.value / maxValue) * chartWidth;
      var y = topMargin + i * (barHeight + barSpacing);

      // Bar
      ctx.fillStyle = kpmgBlue;
      ctx.fillRect(leftMargin, y, barWidth, barHeight);

      // Label
      ctx.fillStyle = textColor;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(item.label, leftMargin - 10, y + barHeight / 2 + 4);

      // Value
      ctx.textAlign = 'left';
      ctx.fillText(item.value.toFixed(1) + ' days', leftMargin + barWidth + 10, y + barHeight / 2 + 4);
    });
  }

  function renderPushActions(state) {
    var estimator = state.project.estimator;
    var hasData = estimator.mode === 'detailed'
      ? estimator.requirements.length > 0
      : Object.values(estimator.highlevel).some(function (cloud) {
          return cloud.low > 0 || cloud.medium > 0 || cloud.high > 0;
        });

    if (!hasData) return '';

    var html = '<div style="margin-top:24px;padding:20px;background:var(--surface-alt);border-radius:var(--radius-lg);border:1px solid var(--border)">' +
      '<p style="margin:0 0 12px 0;font-size:13px;color:var(--text-secondary)">Convert your estimates into tasks in the Plan view.</p>' +
      '<button id="push-to-plan-btn" class="primary-button">Push to Plan</button>' +
    '</div>';

    return html;
  }

  function wirePushActions(state) {
    var btn = document.getElementById('push-to-plan-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        pushToPlan(state);
      });
    }
  }

  function pushToPlan(state) {
    var estimator = state.project.estimator;

    var OWNER_MAP = {
      'OOTB': 'Solution Architect',
      'Configuration': 'Solution Architect',
      'Customization': 'Developer',
      'Integration': 'Integration Specialist',
      'Migration': 'Data Migration Specialist'
    };

    var tasksToCreate = [];

    if (estimator.mode === 'detailed') {
      estimator.requirements.forEach(function (req) {
        if (!req.name || !req.solutionType || !req.complexity) return;

        var calc = PP.calculateRequirement(req);
        var owner = OWNER_MAP[req.solutionType] || 'TBD';

        tasksToCreate.push({
          _level: 0,
          name: req.name,
          owner: owner,
          remarks: 'Cloud: ' + (req.cloud || 'N/A') +
                   ' | Feature: ' + (req.feature || 'N/A') +
                   ' | Type: ' + req.solutionType +
                   ' | Complexity: ' + req.complexity +
                   (req.moscow ? ' | MoSCoW: ' + req.moscow : '') +
                   (req.releasePhase ? ' | Phase: ' + req.releasePhase : '') +
                   ' | Estimated: ' + calc.totalDays.toFixed(2) + ' days',
          plannedStart: null,
          plannedFinish: null,
          deliverable: false,
          predecessors: []
        });
      });
    } else {
      var clouds = ['Sales', 'Service', 'Marketing', 'Community', 'Experience', 'CPQ', 'Integration', 'Migration'];
      var complexities = ['Low', 'Medium', 'High'];

      clouds.forEach(function (cloud) {
        var cloudData = estimator.highlevel[cloud];
        complexities.forEach(function (complexity) {
          var count = cloudData[complexity.toLowerCase()];
          if (count === 0) return;

          var calc = PP.calculateRequirement({ solutionType: 'Configuration', complexity: complexity });
          var totalDays = calc.totalDays * count;
          var owner = 'Solution Architect';

          tasksToCreate.push({
            _level: 0,
            name: cloud + ' - ' + complexity + ' Complexity (' + count + ' components)',
            owner: owner,
            remarks: 'High-level estimate | ' + count + ' components | ' + totalDays.toFixed(2) + ' days total',
            plannedStart: null,
            plannedFinish: null,
            deliverable: false,
            predecessors: []
          });
        });
      });
    }

    if (tasksToCreate.length === 0) {
      alert('No tasks to create. Add requirements or component counts first.');
      return;
    }

    var confirmed = confirm('This will create ' + tasksToCreate.length + ' task(s) in the Plan view. Continue?');
    if (!confirmed) return;

    state.project.addTasks(tasksToCreate, 'Estimator');
    PP.refresh(true);

    var planTab = document.querySelector('.view-tab[data-view="plan"]');
    if (planTab) planTab.click();

    alert('Successfully created ' + tasksToCreate.length + ' task(s) in the Plan view!');
  }

  function renderEstimator(state) {
    var container = document.getElementById('estimator-view');

    var html = '<div class="estimator-container">' +
      '<div class="estimator-header">' +
        renderHeader(state) +
      '</div>' +
      '<div class="estimator-body">' +
        renderSummary(state) +
        (state.project.estimator.mode === 'detailed' ? renderDetailedGrid(state) : renderHighLevelGrid(state)) +
        renderPushActions(state) +
      '</div>' +
    '</div>';

    container.innerHTML = html;

    wireHeader(state);
    wireSummary(state);
    if (state.project.estimator.mode === 'detailed') {
      wireDetailedGrid(state);
    } else {
      wireHighLevelGrid(state);
    }
    wirePushActions(state);
  }

  PP.renderEstimator = renderEstimator;
})();
