(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var POWERED_STAGE_TOLERANCE = 0.01;

  function sumPoweredStages(ps) {
    return ps.Vision + ps.Validate + ps.Construct + ps.Deploy + ps.Evolve;
  }

  var paramsExpanded = false;
  var summaryView = 'table'; // 'table' or 'chart'
  var chartCategory = 'byFeature'; // 'byFeature', 'byStage', 'byRole', 'bySolutionType', 'byActivity'
  var summaryValueMode = 'days'; // 'days' or 'hours'
  var highlevelTab = 'feature'; // 'feature' or 'moscow'

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

    html += '</div>' +
      '<div class="chip-add-input">' +
        '<input type="text" id="add-feature-input" placeholder="New feature name" />' +
        '<button id="add-feature-btn">Add</button>' +
      '</div>' +
      '</div>';

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

    html += '</div>' +
      '<div class="chip-add-input">' +
        '<input type="text" id="add-phase-input" placeholder="New phase name" />' +
        '<button id="add-phase-btn">Add</button>' +
      '</div>' +
      '</div>';

    // Powered Stages section
    var psSum = sumPoweredStages(params.poweredStages);
    var psValid = Math.abs(psSum - 100) < POWERED_STAGE_TOLERANCE;

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

    // Estimation Parameters section (grid layout)
    html += '<div class="param-section estimation-params-grid">' +
      '<div class="param-field">' +
        '<label>Contingency %</label>' +
        '<input type="number" class="param-input" data-param="contingencyPct" value="' + (params.contingencyPct * 100) + '" min="0" max="100" step="1">' +
      '</div>' +
      '<div class="param-field">' +
        '<label>Confidence %</label>' +
        '<input type="number" class="param-input" data-param="confidencePct" value="' + ((params.confidencePct || 1) * 100) + '" min="0" max="100" step="1">' +
      '</div>' +
      '<div class="param-field">' +
        '<label>Change Mgmt %</label>' +
        '<input type="number" class="param-input" data-param="changeManagementPct" value="' + (params.changeManagementPct * 100) + '" min="0" max="100" step="1">' +
      '</div>' +
      '<div class="param-field">' +
        '<label>Project Mgmt %</label>' +
        '<input type="number" class="param-input" data-param="projectManagementPct" value="' + (params.projectManagementPct * 100) + '" min="0" max="100" step="1">' +
      '</div>' +
      '<div class="param-field">' +
        '<label>Integrations Count</label>' +
        '<input type="number" class="param-input" data-param="integrationsCount" value="' + params.integrationsCount + '" min="0" step="1">' +
      '</div>' +
      '<div class="param-field">' +
        '<label>Migrations Count</label>' +
        '<input type="number" class="param-input" data-param="migrationsCount" value="' + params.migrationsCount + '" min="0" step="1">' +
      '</div>' +
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

    // Wire add feature button
    var addFeatureBtn = document.getElementById('add-feature-btn');
    var addFeatureInput = document.getElementById('add-feature-input');
    if (addFeatureBtn && addFeatureInput) {
      var addFeature = function () {
        var value = addFeatureInput.value.trim();
        if (!value) return;

        if (params.features.includes(value)) {
          alert('Feature already exists');
          return;
        }

        state.project._pushUndo();
        params.features.push(value);

        // Initialize in high-level
        if (!state.project.estimator.highlevel.byFeature) {
          state.project.estimator.highlevel.byFeature = {};
        }
        state.project.estimator.highlevel.byFeature[value] = { low: 0, medium: 0, high: 0 };

        addFeatureInput.value = '';
        PP.refresh(true);
      };

      addFeatureBtn.addEventListener('click', addFeature);
      addFeatureInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') addFeature();
      });
    }

    // Wire add phase button
    var addPhaseBtn = document.getElementById('add-phase-btn');
    var addPhaseInput = document.getElementById('add-phase-input');
    if (addPhaseBtn && addPhaseInput) {
      var addPhase = function () {
        var value = addPhaseInput.value.trim();
        if (!value) return;

        if (params.phases.includes(value)) {
          alert('Phase already exists');
          return;
        }

        state.project._pushUndo();
        params.phases.push(value);

        addPhaseInput.value = '';
        PP.refresh(true);
      };

      addPhaseBtn.addEventListener('click', addPhase);
      addPhaseInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') addPhase();
      });
    }

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
        var sum = sumPoweredStages(params.poweredStages);

        if (Math.abs(sum - 100) < POWERED_STAGE_TOLERANCE) {
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
        // Auto-add feature to params if not exists
        if (req.feature && !state.project.estimator.params.features.includes(req.feature)) {
          state.project.estimator.params.features.push(req.feature);

          // Initialize in high-level
          if (!state.project.estimator.highlevel.byFeature) {
            state.project.estimator.highlevel.byFeature = {};
          }
          state.project.estimator.highlevel.byFeature[req.feature] = { low: 0, medium: 0, high: 0 };
        }

        // Auto-add phase to params if not exists
        if (req.releasePhase && !state.project.estimator.params.phases.includes(req.releasePhase)) {
          state.project.estimator.params.phases.push(req.releasePhase);
        }

        var requirement = {
          id: PP.generateRequirementId(),
          name: req.name,
          feature: req.feature,
          solutionTypes: req.solutionTypes,
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

  function renderSolutionTypeModal(req, state) {
    var types = ['OOTB', 'Configuration', 'Customization', 'Integration', 'Migration'];
    var selected = req.solutionTypes || [];

    var html = '<div class="modal-overlay" id="solution-type-modal">' +
      '<div class="modal-content">' +
        '<h3>Select Solution Types</h3>' +
        '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">First selection is primary (used for effort calculations). Others are tags.</p>' +
        '<div class="solution-type-checkboxes">';

    types.forEach(function (type) {
      var checked = selected.includes(type);
      var isPrimary = selected[0] === type;
      html += '<label class="solution-type-option' + (isPrimary ? ' primary' : '') + '">' +
        '<input type="checkbox" class="st-checkbox" value="' + type + '"' + (checked ? ' checked' : '') + '>' +
        '<span>' + type + (isPrimary ? ' [Primary]' : '') + '</span>' +
      '</label>';
    });

    html += '</div>' +
      '<div class="modal-actions">' +
        '<button id="solution-type-save">Save</button>' +
        '<button id="solution-type-cancel">Cancel</button>' +
      '</div>' +
    '</div></div>';

    return html;
  }

  function renderDetailedGrid(state) {
    if (state.project.estimator.mode !== 'detailed') return '';

    var requirements = state.project.estimator.requirements;
    var estimator = state.project.estimator;

    var html = '<div class="estimator-card">' +
      '<h3>Requirements</h3>' +
      '<button id="add-requirement-btn">+ Add Requirement</button>' +
      '<table class="estimator-table">' +
        '<thead><tr>' +
          '<th style="width:40px">#</th>' +
          '<th>Requirement</th>' +
          '<th style="width:120px">Feature</th>' +
          '<th style="width:160px">Solution Type</th>' +
          '<th style="width:120px">Complexity</th>' +
          '<th style="width:100px">MoSCoW</th>' +
          '<th style="width:120px">Release Phase</th>' +
          '<th style="width:90px">Effort (days)</th>' +
          '<th style="width:80px">Actions</th>' +
        '</tr></thead>' +
        '<tbody id="requirements-tbody">';

    requirements.forEach(function (req, index) {
      var calc = PP.calculateRequirement(req, estimator.params);

      html += '<tr data-req-id="' + req.id + '">' +
        '<td>' + (index + 1) + '</td>' +
        '<td><input type="text" class="req-name" value="' + escapeHtml(req.name || '') + '" placeholder="Requirement name"></td>' +

        // Feature input with datalist
        '<td><input type="text" class="req-feature" list="features-list-' + req.id + '" value="' + escapeHtml(req.feature || '') + '" placeholder="Feature">' +
        '<datalist id="features-list-' + req.id + '">';

      estimator.params.features.forEach(function (feature) {
        html += '<option value="' + escapeHtml(feature) + '">';
      });

      html += '</datalist></td>' +

        // Solution Type multi-select cell
        '<td><div class="solution-types-cell" data-req-id="' + req.id + '">';

      if (req.solutionTypes && req.solutionTypes.length > 0) {
        html += '<div class="solution-type-primary">' + escapeHtml(req.solutionTypes[0]) + '</div>';
        if (req.solutionTypes.length > 1) {
          html += '<div class="solution-type-tags">+' + req.solutionTypes.slice(1).map(escapeHtml).join(', +') + '</div>';
        }
      } else {
        html += '<span class="placeholder">Select types...</span>';
      }

      html += '</div></td>' +

        // Complexity dropdown
        '<td><select class="req-complexity">' +
          '<option value="">-</option>' +
          '<option value="Low"' + (req.complexity === 'Low' ? ' selected' : '') + '>Low</option>' +
          '<option value="Medium"' + (req.complexity === 'Medium' ? ' selected' : '') + '>Medium</option>' +
          '<option value="High"' + (req.complexity === 'High' ? ' selected' : '') + '>High</option>' +
        '</select></td>' +

        // MoSCoW dropdown
        '<td><select class="req-moscow">' +
          '<option value="">-</option>' +
          '<option value="Must"' + (req.moscow === 'Must' ? ' selected' : '') + '>Must</option>' +
          '<option value="Should"' + (req.moscow === 'Should' ? ' selected' : '') + '>Should</option>' +
          '<option value="Could"' + (req.moscow === 'Could' ? ' selected' : '') + '>Could</option>' +
          '<option value="Wont"' + (req.moscow === 'Wont' ? ' selected' : '') + '>Won\'t</option>' +
        '</select></td>' +

        // Release Phase dropdown (from params)
        '<td><select class="req-phase">' +
          '<option value="">-</option>';

      estimator.params.phases.forEach(function (phase) {
        html += '<option value="' + escapeHtml(phase) + '"' + (req.releasePhase === phase ? ' selected' : '') + '>' + escapeHtml(phase) + '</option>';
      });

      html += '</select></td>' +

        '<td style="text-align:right">' + calc.totalDays.toFixed(2) + '</td>' +
        '<td><button class="delete-req-btn" data-req-id="' + req.id + '">Delete</button></td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  function wireDetailedGrid(state) {
    var estimator = state.project.estimator;

    var addBtn = document.getElementById('add-requirement-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        state.project._pushUndo();
        state.project.estimator.requirements.push({
          id: PP.generateRequirementId(),
          name: '',
          feature: '',
          solutionTypes: [],
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

    // Wire solution type cells
    var solutionTypeCells = document.querySelectorAll('.solution-types-cell');
    solutionTypeCells.forEach(function (cell) {
      cell.addEventListener('click', function () {
        var reqId = cell.getAttribute('data-req-id');
        var req = estimator.requirements.find(function (r) { return r.id === reqId; });

        if (!req) return;

        // Show modal
        var modal = document.createElement('div');
        modal.innerHTML = renderSolutionTypeModal(req, state);
        document.body.appendChild(modal.firstChild);

        // Track selection order
        var selectionOrder = (req.solutionTypes || []).slice();

        // Wire checkbox changes to track order
        var checkboxes = document.querySelectorAll('.st-checkbox');
        checkboxes.forEach(function (cb) {
          cb.addEventListener('change', function () {
            if (cb.checked) {
              // Add to order if not already present
              if (!selectionOrder.includes(cb.value)) {
                selectionOrder.push(cb.value);
              }
            } else {
              // Remove from order
              selectionOrder = selectionOrder.filter(function (v) { return v !== cb.value; });
            }

            // Update visual primary indicator
            updatePrimaryLabels();
          });
        });

        function updatePrimaryLabels() {
          var labels = document.querySelectorAll('.solution-type-option');
          labels.forEach(function (label) {
            var checkbox = label.querySelector('.st-checkbox');
            var span = label.querySelector('span');
            var type = checkbox.value;
            var isPrimary = selectionOrder[0] === type;

            label.classList.toggle('primary', isPrimary);
            span.textContent = type + (isPrimary ? ' [Primary]' : '');
          });
        }

        // Wire save button
        document.getElementById('solution-type-save').addEventListener('click', function () {
          if (selectionOrder.length === 0) {
            alert('Please select at least one solution type');
            return;
          }

          state.project._pushUndo();
          req.solutionTypes = selectionOrder.slice();
          state.project.estimator.summary = PP.recalcSummary(state.project.estimator);

          document.getElementById('solution-type-modal').remove();
          PP.refresh(true);
        });

        // Wire cancel button
        document.getElementById('solution-type-cancel').addEventListener('click', function () {
          document.getElementById('solution-type-modal').remove();
        });
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

      row.querySelector('.req-feature').addEventListener('change', function (e) {
        var value = e.target.value;

        // If typing new feature (not in params.features), add it
        if (value && !estimator.params.features.includes(value)) {
          estimator.params.features.push(value);

          // Initialize in high-level
          if (!estimator.highlevel.byFeature) {
            estimator.highlevel.byFeature = {};
          }
          estimator.highlevel.byFeature[value] = { low: 0, medium: 0, high: 0 };
        }

        state.project._pushUndo();
        req.feature = value;
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

    var estimator = state.project.estimator;

    var html = '<div class="estimator-card">' +
      '<h3>Component Counts</h3>' +
      '<div class="highlevel-tabs">' +
        '<button class="hl-tab' + (highlevelTab === 'feature' ? ' active' : '') + '" data-tab="feature">By Feature</button>' +
        '<button class="hl-tab' + (highlevelTab === 'moscow' ? ' active' : '') + '" data-tab="moscow">By MoSCoW</button>' +
      '</div>' +
      '<div class="highlevel-content">';

    if (highlevelTab === 'feature') {
      html += renderFeatureMatrix(estimator);
    } else {
      html += renderMoscowMatrix(estimator);
    }

    html += '</div></div>';

    return html;
  }

  function renderFeatureMatrix(estimator) {
    var html = '<table class="highlevel-table">' +
      '<thead><tr>' +
        '<th>Feature</th>' +
        '<th style="width:100px">Low</th>' +
        '<th style="width:100px">Medium</th>' +
        '<th style="width:100px">High</th>' +
        '<th style="width:140px">Total Effort (days)</th>' +
        '<th style="width:60px"></th>' +
      '</tr></thead>' +
      '<tbody>';

    if (!estimator.highlevel.byFeature) {
      estimator.highlevel.byFeature = {};
    }

    var features = Object.keys(estimator.highlevel.byFeature);

    features.forEach(function (feature) {
      var counts = estimator.highlevel.byFeature[feature];

      // Calculate effort for each complexity level
      var lowEffort = counts.low * PP.calculateRequirement({ feature: feature, solutionTypes: ['Configuration'], complexity: 'Low' }, estimator.params).totalDays;
      var mediumEffort = counts.medium * PP.calculateRequirement({ feature: feature, solutionTypes: ['Configuration'], complexity: 'Medium' }, estimator.params).totalDays;
      var highEffort = counts.high * PP.calculateRequirement({ feature: feature, solutionTypes: ['Configuration'], complexity: 'High' }, estimator.params).totalDays;
      var totalEffort = lowEffort + mediumEffort + highEffort;

      html += '<tr data-feature="' + escapeHtml(feature) + '">' +
        '<td>' + escapeHtml(feature) + '</td>' +
        '<td><input type="number" class="hl-input" data-feature="' + escapeHtml(feature) + '" data-complexity="low" value="' + counts.low + '" min="0"></td>' +
        '<td><input type="number" class="hl-input" data-feature="' + escapeHtml(feature) + '" data-complexity="medium" value="' + counts.medium + '" min="0"></td>' +
        '<td><input type="number" class="hl-input" data-feature="' + escapeHtml(feature) + '" data-complexity="high" value="' + counts.high + '" min="0"></td>' +
        '<td style="text-align:right">' + totalEffort.toFixed(1) + '</td>' +
        '<td><button class="hl-delete-feature" data-feature="' + escapeHtml(feature) + '">&times;</button></td>' +
      '</tr>';
    });

    html += '</tbody></table>' +
      '<button id="hl-add-feature-btn" style="margin-top:8px">+ Add Feature</button>';

    return html;
  }

  function renderMoscowMatrix(estimator) {
    if (!estimator.highlevel.byMoscow) {
      estimator.highlevel.byMoscow = {
        Must: { low: 0, medium: 0, high: 0 },
        Should: { low: 0, medium: 0, high: 0 },
        Could: { low: 0, medium: 0, high: 0 },
        "Won't": { low: 0, medium: 0, high: 0 }
      };
    }

    var html = '<table class="highlevel-table">' +
      '<thead><tr>' +
        '<th>Priority</th>' +
        '<th style="width:100px">Low</th>' +
        '<th style="width:100px">Medium</th>' +
        '<th style="width:100px">High</th>' +
        '<th style="width:140px">Total Effort (days)</th>' +
      '</tr></thead>' +
      '<tbody>';

    var priorities = ['Must', 'Should', 'Could', "Won't"];

    priorities.forEach(function (priority) {
      var counts = estimator.highlevel.byMoscow[priority];

      // Calculate effort for each complexity level
      var lowEffort = counts.low * PP.calculateRequirement({ moscow: priority, solutionTypes: ['Configuration'], complexity: 'Low' }, estimator.params).totalDays;
      var mediumEffort = counts.medium * PP.calculateRequirement({ moscow: priority, solutionTypes: ['Configuration'], complexity: 'Medium' }, estimator.params).totalDays;
      var highEffort = counts.high * PP.calculateRequirement({ moscow: priority, solutionTypes: ['Configuration'], complexity: 'High' }, estimator.params).totalDays;
      var totalEffort = lowEffort + mediumEffort + highEffort;

      html += '<tr>' +
        '<td>' + priority + '</td>' +
        '<td><input type="number" class="hl-input-moscow" data-moscow="' + priority + '" data-complexity="low" value="' + counts.low + '" min="0"></td>' +
        '<td><input type="number" class="hl-input-moscow" data-moscow="' + priority + '" data-complexity="medium" value="' + counts.medium + '" min="0"></td>' +
        '<td><input type="number" class="hl-input-moscow" data-moscow="' + priority + '" data-complexity="high" value="' + counts.high + '" min="0"></td>' +
        '<td style="text-align:right">' + totalEffort.toFixed(1) + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';

    return html;
  }

  function wireHighLevelGrid(state) {
    var estimator = state.project.estimator;

    // Wire tab buttons
    var tabButtons = document.querySelectorAll('.hl-tab');
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        highlevelTab = btn.getAttribute('data-tab');
        PP.refresh(true);
      });
    });

    // Wire feature matrix inputs
    var featureInputs = document.querySelectorAll('.hl-input');
    featureInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        var feature = input.getAttribute('data-feature');
        var complexity = input.getAttribute('data-complexity');
        var value = parseInt(input.value, 10);

        if (isNaN(value) || value < 0) {
          input.value = estimator.highlevel.byFeature[feature][complexity];
          return;
        }

        state.project._pushUndo();
        estimator.highlevel.byFeature[feature][complexity] = value;
        estimator.summary = PP.recalcSummary(estimator);
        PP.refresh(true);
      });
    });

    // Wire MoSCoW matrix inputs
    var moscowInputs = document.querySelectorAll('.hl-input-moscow');
    moscowInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        var moscow = input.getAttribute('data-moscow');
        var complexity = input.getAttribute('data-complexity');
        var value = parseInt(input.value, 10);

        if (isNaN(value) || value < 0) {
          input.value = estimator.highlevel.byMoscow[moscow][complexity];
          return;
        }

        state.project._pushUndo();
        estimator.highlevel.byMoscow[moscow][complexity] = value;
        estimator.summary = PP.recalcSummary(estimator);
        PP.refresh(true);
      });
    });

    // Wire add feature button
    var addFeatureBtn = document.getElementById('hl-add-feature-btn');
    if (addFeatureBtn) {
      addFeatureBtn.addEventListener('click', function () {
        var featureName = prompt('Enter feature name:');
        if (!featureName) return;

        state.project._pushUndo();

        // Add to params.features if not exists
        if (!estimator.params.features.includes(featureName)) {
          estimator.params.features.push(featureName);
        }

        // Add to highlevel.byFeature
        if (!estimator.highlevel.byFeature) {
          estimator.highlevel.byFeature = {};
        }
        estimator.highlevel.byFeature[featureName] = { low: 0, medium: 0, high: 0 };

        PP.refresh(true);
      });
    }

    // Wire delete feature buttons
    var deleteButtons = document.querySelectorAll('.hl-delete-feature');
    deleteButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var feature = btn.getAttribute('data-feature');

        var confirm = window.confirm('Delete feature "' + feature + '"?');
        if (!confirm) return;

        state.project._pushUndo();

        // Remove from highlevel
        delete estimator.highlevel.byFeature[feature];

        // Remove from params if not used in detailed requirements
        var inUse = estimator.requirements.some(function (r) {
          return r.feature === feature;
        });
        if (!inUse) {
          estimator.params.features = estimator.params.features.filter(function (f) {
            return f !== feature;
          });
        }

        estimator.summary = PP.recalcSummary(estimator);
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
          '<button class="legend-btn ' + (chartCategory === 'byFeature' ? 'active' : '') + '" data-category="byFeature">Feature</button>' +
          '<button class="legend-btn ' + (chartCategory === 'byStage' ? 'active' : '') + '" data-category="byStage">Powered Stage</button>' +
          '<button class="legend-btn ' + (chartCategory === 'byRole' ? 'active' : '') + '" data-category="byRole">Role</button>' +
          '<button class="legend-btn ' + (chartCategory === 'bySolutionType' ? 'active' : '') + '" data-category="bySolutionType">Solution Type</button>' +
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
          ? renderBreakdownTable('By Feature', summary.byFeature) +
            renderBreakdownTable('By Powered Stage', summary.byStage) +
            renderBreakdownTable('By Role', summary.byRole) +
            renderBreakdownTable('By Solution Type', summary.bySolutionType) +
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
