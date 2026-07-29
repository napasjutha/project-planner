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
  var summaryValueMode = 'days'; // 'days' or 'hours'

  function renderHeader(state) {
    var estimator = state.project.estimator;
    var html = '<div class="estimator-header-content">' +
      '<div class="mode-toggle">' +
        '<label><input type="radio" name="estimator-mode" value="detailed"' + (estimator.mode === 'detailed' ? ' checked' : '') + '> Detailed</label>' +
        '<label><input type="radio" name="estimator-mode" value="highlevel"' + (estimator.mode === 'highlevel' ? ' checked' : '') + '> High Level</label>' +
      '</div>' +
      '<button id="toggle-params-btn" style="margin-left:auto">' + (paramsExpanded ? 'Hide' : 'Show') + ' Parameters</button>' +
    '</div>';

    if (paramsExpanded) {
      html += renderParams(state);
    }

    return html;
  }

  function renderParams(state) {
    var params = state.project.estimator.params;

    var html = '<div class="estimator-params">' +
      '<div class="param-section">' +
        '<h4>Features</h4>' +
        '<div class="chip-container">';

    // Features chips
    params.features.forEach(function (feature) {
      html += '<div class="chip" data-type="feature" data-value="' + escapeHtml(feature) + '">' +
        '<span>' + escapeHtml(feature) + '</span>' +
        '<button class="chip-delete">&times;</button>' +
      '</div>';
    });

    html += '<button class="chip-add" data-type="feature">+ Add Feature</button>' +
      '</div></div>';

    // Phases section
    html += '<div class="param-section">' +
      '<h4>Release Phases</h4>' +
      '<div class="chip-container">';

    params.phases.forEach(function (phase) {
      html += '<div class="chip" data-type="phase" data-value="' + escapeHtml(phase) + '">' +
        '<span>' + escapeHtml(phase) + '</span>' +
        '<button class="chip-delete">&times;</button>' +
      '</div>';
    });

    html += '<button class="chip-add" data-type="phase">+ Add Phase</button>' +
      '</div></div>';

    // Powered Stages section
    var psSum = params.poweredStages.Vision + params.poweredStages.Validate +
                params.poweredStages.Construct + params.poweredStages.Deploy +
                params.poweredStages.Evolve;
    var psValid = Math.abs(psSum - 100) < 0.01;

    html += '<div class="param-section">' +
      '<h4>Powered Stage Distribution</h4>' +
      '<div class="powered-stages-inputs' + (psValid ? '' : ' invalid') + '">' +
        '<label>Vision: <input type="number" class="ps-input" data-stage="Vision" value="' + params.poweredStages.Vision + '" min="0" max="100">%</label>' +
        '<label>Validate: <input type="number" class="ps-input" data-stage="Validate" value="' + params.poweredStages.Validate + '" min="0" max="100">%</label>' +
        '<label>Construct: <input type="number" class="ps-input" data-stage="Construct" value="' + params.poweredStages.Construct + '" min="0" max="100">%</label>' +
        '<label>Deploy: <input type="number" class="ps-input" data-stage="Deploy" value="' + params.poweredStages.Deploy + '" min="0" max="100">%</label>' +
        '<label>Evolve: <input type="number" class="ps-input" data-stage="Evolve" value="' + params.poweredStages.Evolve + '" min="0" max="100">%</label>' +
        '<span class="ps-sum' + (psValid ? ' valid' : ' invalid') + '">Total: ' + psSum.toFixed(0) + '%' + (psValid ? ' ✓' : ' (must equal 100%)') + '</span>' +
      '</div>' +
    '</div>';

    // Overheads section
    html += '<div class="param-section">' +
      '<h4>Overheads</h4>' +
      '<label>Contingency: <input type="number" class="param-input" data-param="contingencyPct" value="' + (params.contingencyPct * 100) + '" min="0" max="100" step="1">%</label>' +
      '<label>Change Management: <input type="number" class="param-input" data-param="changeManagementPct" value="' + (params.changeManagementPct * 100) + '" min="0" max="100" step="1">%</label>' +
      '<label>Project Management: <input type="number" class="param-input" data-param="projectManagementPct" value="' + (params.projectManagementPct * 100) + '" min="0" max="100" step="1">%</label>' +
    '</div>';

    // Context section
    html += '<div class="param-section">' +
      '<h4>Context</h4>' +
      '<label>Integrations: <input type="number" class="param-input" data-param="integrationsCount" value="' + params.integrationsCount + '" min="0" step="1"></label>' +
      '<label>Migrations: <input type="number" class="param-input" data-param="migrationsCount" value="' + params.migrationsCount + '" min="0" step="1"></label>' +
    '</div>';

    html += '</div>';

    return html;
  }

  function wireHeader(state) {
    var modeRadios = document.querySelectorAll('input[name="estimator-mode"]');
    modeRadios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (state.project.estimator.mode === radio.value) return;
        state.project._pushUndo();
        state.project.estimator.mode = radio.value;
        PP.refresh(true);
      });
    });

    // Toggle params visibility
    var toggleParamsBtn = document.getElementById('toggle-params-btn');
    if (toggleParamsBtn) {
      toggleParamsBtn.addEventListener('click', function () {
        paramsExpanded = !paramsExpanded;
        PP.refresh(true);
      });
    }

    // Wire params if expanded
    if (paramsExpanded) {
      wireParams(state);
    }
  }

  function wireParams(state) {
    var params = state.project.estimator.params;

    // Wire chip delete buttons
    var deleteButtons = document.querySelectorAll('.chip-delete');
    deleteButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var chip = btn.closest('.chip');
        var type = chip.getAttribute('data-type');
        var value = chip.getAttribute('data-value');

        // Check if in use
        if (type === 'feature') {
          var inUse = state.project.estimator.requirements.some(function (r) {
            return r.feature === value;
          });
          if (inUse) {
            alert('Cannot delete - feature is used in requirements');
            return;
          }

          state.project._pushUndo();
          params.features = params.features.filter(function (f) { return f !== value; });

          // Remove from high-level
          if (state.project.estimator.highlevel.byFeature) {
            delete state.project.estimator.highlevel.byFeature[value];
          }
        } else if (type === 'phase') {
          var inUse = state.project.estimator.requirements.some(function (r) {
            return r.releasePhase === value;
          });
          if (inUse) {
            alert('Cannot delete - phase is used in requirements');
            return;
          }

          state.project._pushUndo();
          params.phases = params.phases.filter(function (p) { return p !== value; });
        }

        PP.refresh(true);
      });
    });

    // Wire chip add buttons
    var addButtons = document.querySelectorAll('.chip-add');
    addButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-type');
        var value = prompt('Enter new ' + type + ' name:');

        if (!value) return;

        state.project._pushUndo();

        if (type === 'feature') {
          if (!params.features.includes(value)) {
            params.features.push(value);

            // Initialize in high-level
            if (!state.project.estimator.highlevel.byFeature) {
              state.project.estimator.highlevel.byFeature = {};
            }
            state.project.estimator.highlevel.byFeature[value] = { low: 0, medium: 0, high: 0 };
          }
        } else if (type === 'phase') {
          if (!params.phases.includes(value)) {
            params.phases.push(value);
          }
        }

        PP.refresh(true);
      });
    });

    // Wire powered stage inputs
    var psInputs = document.querySelectorAll('.ps-input');
    psInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        var stage = input.getAttribute('data-stage');
        var value = parseInt(input.value, 10);

        if (isNaN(value) || value < 0 || value > 100) {
          alert('Value must be between 0 and 100');
          input.value = params.poweredStages[stage];
          return;
        }

        state.project._pushUndo();
        params.poweredStages[stage] = value;

        // Validate sum
        var sum = params.poweredStages.Vision + params.poweredStages.Validate +
                  params.poweredStages.Construct + params.poweredStages.Deploy +
                  params.poweredStages.Evolve;

        if (Math.abs(sum - 100) < 0.01) {
          // Valid - recalc
          state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        }

        PP.refresh(true);
      });
    });

    // Wire overhead inputs
    var paramInputs = document.querySelectorAll('.param-input');
    paramInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        var param = input.getAttribute('data-param');
        var value = parseFloat(input.value);

        if (isNaN(value) || value < 0) {
          alert('Value must be >= 0');
          return;
        }

        state.project._pushUndo();

        // Convert percentage inputs back to decimals
        if (param.endsWith('Pct')) {
          params[param] = value / 100;
        } else {
          params[param] = parseInt(value, 10);
        }

        state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
        PP.refresh(true);
      });
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

      // Apply imported parameters if present
      if (result.params) {
        Object.assign(state.project.estimator.params, result.params);
      }

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
      var msg = 'Imported ' + result.requirements.length + ' requirement(s).';
      if (result.params) {
        msg += '\nParameters updated.';
      }
      alert(msg);
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
          '<thead><tr>' +
            '<th>Item</th>' +
            '<th>' +
              '<select class="summary-value-mode-select" style="border:1px solid var(--border);background:var(--surface);padding:2px 4px;border-radius:var(--radius-sm);font-size:12px;cursor:pointer">' +
                '<option value="days"' + (summaryValueMode === 'days' ? ' selected' : '') + '>Days</option>' +
                '<option value="hours"' + (summaryValueMode === 'hours' ? ' selected' : '') + '>Hours</option>' +
              '</select>' +
            '</th>' +
          '</tr></thead>' +
          '<tbody>';

      var total = summary.totalDays;
      for (var key in data) {
        if (data.hasOwnProperty(key)) {
          var days = data[key];
          var hours = (days * 8).toFixed(1);
          var value = summaryValueMode === 'days' ? days.toFixed(2) : hours;
          html += '<tr><td>' + escapeHtml(key) + '</td><td>' + value + '</td></tr>';
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
          '<button class="legend-btn ' + (chartCategory === 'byComponent' ? 'active' : '') + '" data-category="byComponent">Solution Type</button>' +
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
            renderBreakdownTable('By Solution Type', summary.byComponent) +
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

    // Wire up value mode dropdowns
    var valueModeSelects = document.querySelectorAll('.summary-value-mode-select');
    valueModeSelects.forEach(function (select) {
      select.addEventListener('change', function () {
        summaryValueMode = select.value;
        PP.refresh(true);
      });
    });

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

  function renderEstimator(state) {
    var container = document.getElementById('estimator-view');

    var html = '<div class="estimator-container">' +
      '<div class="estimator-header">' +
        renderHeader(state) +
      '</div>' +
      '<div class="estimator-body">' +
        renderSummary(state) +
        (state.project.estimator.mode === 'detailed' ? renderDetailedGrid(state) : renderHighLevelGrid(state)) +
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
  }

  PP.renderEstimator = renderEstimator;
})();
