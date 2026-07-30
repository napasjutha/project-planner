(function() {
'use strict';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;'
    }[c];
  });
}

var POWERED_STAGE_TOLERANCE = 0.01;

function sumPoweredStages(ps) {
  var sum = 0;
  for (var key in ps) {
    if (ps.hasOwnProperty(key)) {
      sum += ps[key];
    }
  }
  return sum;
}

var paramsExpanded = false;
var summaryView = 'table';        // 'table' or 'chart'
var chartCategory = 'byFeature';  // 'byFeature', 'byStage', 'byRole',
                                  // 'bySolutionType', 'byActivity'
var summaryValueMode = 'days';    // 'days' or 'hours'
var highlevelTab = 'feature';     // 'feature' or 'moscow'

function renderHeader(state) {
  var estimator = state.project.estimator;
  var html = '<div class="estimator-header-content">' +
      '<div class="mode-toggle">' +
      '<label><input type="radio" name="estimator-mode" value="detailed"' +
      (estimator.mode === 'detailed' ? ' checked' : '') +
      '>Detailed Estimate</label>' +
      '<label><input type="radio" name="estimator-mode" value="highlevel"' +
      (estimator.mode === 'highlevel' ? ' checked' : '') +
      '>High Level Estimate</label>' +
      '</div>' +
      '<button id="toggle-params-btn" style="margin-left:auto">' +
      (paramsExpanded ? 'Hide' : 'Show') + ' Parameters</button>' +
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
  params.features.forEach(function(feature) {
    html += '<div class="chip" data-type="feature" data-value="' +
        escapeHtml(feature) + '">' +
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

  params.phases.forEach(function(phase) {
    html += '<div class="chip" data-type="phase" data-value="' +
        escapeHtml(phase) + '">' +
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
      '<div class="powered-stages-grid' + (psValid ? '' : ' invalid') + '">';

  var stages = params.stageOrder || Object.keys(params.poweredStages).sort();
  stages.forEach(function(stage, idx) {
    html += '<div class="param-field">' +
      '<label>' + escapeHtml(stage) + ':<span class="ps-reorder-btns">' +
      '<button class="ps-reorder-btn" data-stage="' + escapeHtml(stage) +
      '" data-direction="up"' + (idx === 0 ? ' disabled' : '') + '>◀</button>' +
      '<button class="ps-reorder-btn" data-stage="' + escapeHtml(stage) +
      '" data-direction="down"' + (idx === stages.length - 1 ? ' disabled' : '') + '>▶</button>' +
      '</span></label>' +
      '<input type="number" class="ps-input param-input" data-stage="' +
      escapeHtml(stage) + '" value="' + escapeHtml(params.poweredStages[stage]) +
      '" min="0" max="100">' +
      '<button class="ps-delete-btn" data-stage="' + escapeHtml(stage) +
      '"' + (stages.length === 1 ? ' disabled' : '') + '>&times;</button>' +
      '</div>';
  });

  html += '<div class="param-field ps-total">' +
      '<label>Total:</label>' +
      '<div class="ps-sum-value' + (psValid ? ' valid' : ' invalid') + '">' +
      psSum.toFixed(0) + '%' + (psValid ? ' ✓' : '') + '</div>' +
      '</div>' +
      '</div>' +
      '<button id="ps-add-stage-btn">+ Add Stage</button>' +
      '</div>';

  // Estimation Parameters section (grid layout)
  html += '<div class="param-section estimation-params-grid">' +
      '<div class="param-field">' +
      '<label>Contingency %</label>' +
      '<input type="number" class="param-input" data-param="contingencyPct" value="' +
      (params.contingencyPct * 100) + '" min="0" max="100" step="1">' +
      '</div>' +
      '<div class="param-field">' +
      '<label>Change Mgmt %</label>' +
      '<input type="number" class="param-input" data-param="changeManagementPct" value="' +
      (params.changeManagementPct * 100) + '" min="0" max="100" step="1">' +
      '</div>' +
      '<div class="param-field">' +
      '<label>Project Mgmt %</label>' +
      '<input type="number" class="param-input" data-param="projectManagementPct" value="' +
      (params.projectManagementPct * 100) + '" min="0" max="100" step="1">' +
      '</div>' +
      '<div class="param-field">' +
      '<label>Integrations Count</label>' +
      '<input type="number" class="param-input" data-param="integrationsCount" value="' +
      params.integrationsCount + '" min="0" step="1">' +
      '</div>' +
      '<div class="param-field">' +
      '<label>Migrations Count</label>' +
      '<input type="number" class="param-input" data-param="migrationsCount" value="' +
      params.migrationsCount + '" min="0" step="1">' +
      '</div>' +
      '</div>';

  html += '</div>';

  return html;
}

function wireHeader(state) {
  var modeRadios = document.querySelectorAll('input[name="estimator-mode"]');
  modeRadios.forEach(function(radio) {
    radio.addEventListener('change', function() {
      if (state.project.estimator.mode === radio.value) return;
      state.project._pushUndo();
      state.project.estimator.mode = radio.value;
      PP.refresh(true);
    });
  });

  // Toggle params visibility
  var toggleParamsBtn = document.getElementById('toggle-params-btn');
  if (toggleParamsBtn) {
    toggleParamsBtn.addEventListener('click', function() {
      paramsExpanded = !paramsExpanded;
      PP.refresh(true);
    });
  }

  // Wire add powered stage button
  var addStageBtn = document.getElementById('ps-add-stage-btn');
  if (addStageBtn) {
    addStageBtn.addEventListener('click', function() {
      var params = state.project.estimator.params;

      var stageName = prompt('Stage name:');
      if (!stageName || stageName.trim() === '') return;
      stageName = stageName.trim();

      if (params.poweredStages[stageName] !== undefined) {
        alert('Stage "' + stageName + '" already exists');
        return;
      }

      var pct = prompt('Initial percentage (0-100):', '0');
      var pctNum = parseFloat(pct);
      if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
        alert('Invalid percentage. Must be 0-100.');
        return;
      }

      state.project._pushUndo();
      params.poweredStages[stageName] = pctNum;
      if (!params.stageOrder) {
        params.stageOrder = Object.keys(params.poweredStages).sort();
      } else {
        params.stageOrder.push(stageName);
      }
      PP.refresh();
    });
  }

  // Wire reorder powered stage buttons
  var reorderBtns = document.querySelectorAll('.ps-reorder-btn');
  reorderBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var stage = btn.getAttribute('data-stage');
      var direction = btn.getAttribute('data-direction');
      var params = state.project.estimator.params;

      if (!params.stageOrder) {
        params.stageOrder = Object.keys(params.poweredStages).sort();
      }

      var idx = params.stageOrder.indexOf(stage);
      if (idx === -1) return;

      state.project._pushUndo();

      if (direction === 'up' && idx > 0) {
        var temp = params.stageOrder[idx - 1];
        params.stageOrder[idx - 1] = params.stageOrder[idx];
        params.stageOrder[idx] = temp;
      } else if (direction === 'down' && idx < params.stageOrder.length - 1) {
        var temp = params.stageOrder[idx + 1];
        params.stageOrder[idx + 1] = params.stageOrder[idx];
        params.stageOrder[idx] = temp;
      }

      PP.refresh();
    });
  });

  // Wire delete powered stage buttons
  var deleteStageButtons = document.querySelectorAll('.ps-delete-btn');
  deleteStageButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var stage = btn.getAttribute('data-stage');
      var params = state.project.estimator.params;
      var stages = Object.keys(params.poweredStages);

      if (stages.length === 1) {
        alert('Cannot delete the last stage');
        return;
      }

      state.project._pushUndo();
      redistributeStages(stage, params.poweredStages, params);
      state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
      PP.refresh();
    });
  });

  function redistributeStages(stageToDelete, poweredStages, params) {
    var deletedPct = poweredStages[stageToDelete];
    delete poweredStages[stageToDelete];

    if (params.stageOrder) {
      var idx = params.stageOrder.indexOf(stageToDelete);
      if (idx !== -1) {
        params.stageOrder.splice(idx, 1);
      }
    }

    var remaining = Object.keys(poweredStages);
    var remainingTotal = remaining.reduce(function(sum, key) {
      return sum + poweredStages[key];
    }, 0);

    if (remainingTotal === 0) {
      // Edge case: all stages were 0%, distribute evenly
      remaining.forEach(function(key) {
        poweredStages[key] = Math.round(100 / remaining.length * 100) / 100;
      });
      return;
    }

    // Proportional redistribution
    var scaleFactor = 100 / remainingTotal;
    remaining.forEach(function(key) {
      poweredStages[key] = Math.round(poweredStages[key] * scaleFactor * 100) / 100;
    });

    // Fix rounding errors by adjusting largest stage
    var newTotal = remaining.reduce(function(sum, key) {
      return sum + poweredStages[key];
    }, 0);
    if (Math.abs(newTotal - 100) > 0.01) {
      var largest = remaining.sort(function(a, b) {
        return poweredStages[b] - poweredStages[a];
      })[0];
      poweredStages[largest] += (100 - newTotal);
      poweredStages[largest] = Math.round(poweredStages[largest] * 100) / 100;
    }
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
  deleteButtons.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var chip = btn.closest('.chip');
      var type = chip.getAttribute('data-type');
      var value = chip.getAttribute('data-value');

      // Check if in use
      if (type === 'feature') {
        var inUse = state.project.estimator.requirements.some(function(r) {
          return r.feature === value;
        });
        if (inUse) {
          alert('Cannot delete - feature is used in requirements');
          return;
        }

        state.project._pushUndo();
        params.features = params.features.filter(function(f) {
          return f !== value;
        });

        // Remove from high-level
        if (state.project.estimator.highlevel.byFeature) {
          delete state.project.estimator.highlevel.byFeature[value];
        }
      } else if (type === 'phase') {
        var inUse = state.project.estimator.requirements.some(function(r) {
          return r.releasePhase === value;
        });
        if (inUse) {
          alert('Cannot delete - phase is used in requirements');
          return;
        }

        state.project._pushUndo();
        params.phases = params.phases.filter(function(p) {
          return p !== value;
        });
      }

      PP.refresh(true);
    });
  });

  // Wire add feature button
  var addFeatureBtn = document.getElementById('add-feature-btn');
  var addFeatureInput = document.getElementById('add-feature-input');
  if (addFeatureBtn && addFeatureInput) {
    var addFeature = function() {
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
      state.project.estimator.highlevel
          .byFeature[value] = {low: 0, medium: 0, high: 0};

      addFeatureInput.value = '';
      PP.refresh(true);
    };

    addFeatureBtn.addEventListener('click', addFeature);
    addFeatureInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') addFeature();
    });
  }

  // Wire add phase button
  var addPhaseBtn = document.getElementById('add-phase-btn');
  var addPhaseInput = document.getElementById('add-phase-input');
  if (addPhaseBtn && addPhaseInput) {
    var addPhase = function() {
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
    addPhaseInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') addPhase();
    });
  }

  // Wire powered stage inputs
  var psInputs = document.querySelectorAll('.ps-input');
  psInputs.forEach(function(input) {
    input.addEventListener('change', function() {
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
        state.project.estimator.summary =
            PP.recalcSummary(state.project.estimator);
      }

      PP.refresh(true);
    });
  });

  // Wire overhead inputs
  var paramInputs = document.querySelectorAll('.param-input');
  paramInputs.forEach(function(input) {
    input.addEventListener('change', function() {
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

      state.project.estimator.summary =
          PP.recalcSummary(state.project.estimator);
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
  reader.onload = function() {
    var rows = PP.parseCsvText(PP.stripBom(reader.result));
    if (rows.length < 2) {
      alert('CSV has no data rows.');
      return;
    }
    var result = PP.parseEstimatorCsv(rows);
    if (result.errors.length) {
      alert(
          'Cannot import — ' + result.errors.length + ' error(s):\n' +
          result.errors.join('\n'));
      return;
    }

    state.project._pushUndo();

    // Apply imported parameters if present
    if (result.params) {
      Object.assign(state.project.estimator.params, result.params);
    }

    result.requirements.forEach(function(req) {
      // Auto-add feature to params if not exists
      if (req.feature &&
          !state.project.estimator.params.features.includes(req.feature)) {
        state.project.estimator.params.features.push(req.feature);

        // Initialize in high-level
        if (!state.project.estimator.highlevel.byFeature) {
          state.project.estimator.highlevel.byFeature = {};
        }
        state.project.estimator.highlevel
            .byFeature[req.feature] = {low: 0, medium: 0, high: 0};
      }

      // Auto-add phase to params if not exists
      if (req.releasePhase &&
          !state.project.estimator.params.phases.includes(req.releasePhase)) {
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
  reader.onerror = function() {
    alert('Failed to read that file.');
  };
  reader.readAsText(file, 'UTF-8');
}

function renderSolutionTypeModal(req, state) {
  var types =
      ['OOTB', 'Configuration', 'Customization', 'Integration', 'Migration'];
  var selected = req.solutionTypes || [];

  var html = '<div class="modal-overlay" id="solution-type-modal">' +
      '<div class="modal-content">' +
      '<h3>Select Solution Types</h3>' +
      '<div class="solution-type-checkboxes">';

  types.forEach(function(type) {
    var checked = selected.includes(type);
    var isPrimary = selected[0] === type;
    html += '<label class="solution-type-option' +
        (isPrimary ? ' primary' : '') + '">' +
        '<input type="checkbox" class="st-checkbox" value="' + type + '"' +
        (checked ? ' checked' : '') + '>' +
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

  requirements.forEach(function(req, index) {
    var calc = PP.calculateRequirement(req, estimator.params);

    html += '<tr data-req-id="' + req.id + '">' +
        '<td>' + (index + 1) + '</td>' +
        '<td><input type="text" class="req-name" value="' +
        escapeHtml(req.name || '') + '" placeholder="Requirement name"></td>' +

        // Feature input with datalist
        '<td><input type="text" class="req-feature" list="features-list-' +
        req.id + '" value="' + escapeHtml(req.feature || '') +
        '" placeholder="Feature">' +
        '<datalist id="features-list-' + req.id + '">';

    estimator.params.features.forEach(function(feature) {
      html += '<option value="' + escapeHtml(feature) + '">';
    });

    html += '</datalist></td>' +

        // Solution Type multi-select cell
        '<td><div class="solution-types-cell" data-req-id="' + req.id + '">';

    if (req.solutionTypes && req.solutionTypes.length > 0) {
      html += '<div class="solution-type-primary">' +
          escapeHtml(req.solutionTypes[0]) + '</div>';
      if (req.solutionTypes.length > 1) {
        html += '<div class="solution-type-tags">+' +
            req.solutionTypes.slice(1).map(escapeHtml).join(', +') + '</div>';
      }
    } else {
      html += '<span class="placeholder">Select types...</span>';
    }

    html += '</div></td>' +

        // Complexity dropdown
        '<td><select class="req-complexity">' +
        '<option value="">-</option>' +
        '<option value="Low"' + (req.complexity === 'Low' ? ' selected' : '') +
        '>Low</option>' +
        '<option value="Medium"' +
        (req.complexity === 'Medium' ? ' selected' : '') + '>Medium</option>' +
        '<option value="High"' +
        (req.complexity === 'High' ? ' selected' : '') + '>High</option>' +
        '</select></td>' +

        // MoSCoW dropdown
        '<td><select class="req-moscow">' +
        '<option value="">-</option>' +
        '<option value="Must"' + (req.moscow === 'Must' ? ' selected' : '') +
        '>Must</option>' +
        '<option value="Should"' +
        (req.moscow === 'Should' ? ' selected' : '') + '>Should</option>' +
        '<option value="Could"' + (req.moscow === 'Could' ? ' selected' : '') +
        '>Could</option>' +
        '<option value="Wont"' + (req.moscow === 'Wont' ? ' selected' : '') +
        '>Won\'t</option>' +
        '</select></td>' +

        // Release Phase dropdown (from params)
        '<td><select class="req-phase">' +
        '<option value="">-</option>';

    estimator.params.phases.forEach(function(phase) {
      html += '<option value="' + escapeHtml(phase) + '"' +
          (req.releasePhase === phase ? ' selected' : '') + '>' +
          escapeHtml(phase) + '</option>';
    });

    html += '</select></td>' +

        '<td style="text-align:right">' + calc.totalDays.toFixed(2) + '</td>' +
        '<td><button class="delete-req-btn" data-req-id="' + req.id +
        '">Delete</button></td>' +
        '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

function wireDetailedGrid(state) {
  var estimator = state.project.estimator;

  var addBtn = document.getElementById('add-requirement-btn');
  if (addBtn) {
    addBtn.addEventListener('click', function() {
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
  deleteButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var reqId = btn.dataset.reqId;
      state.project._pushUndo();
      state.project.estimator.requirements =
          state.project.estimator.requirements.filter(function(r) {
            return r.id !== reqId;
          });
      state.project.estimator.summary =
          PP.recalcSummary(state.project.estimator);
      PP.refresh(true);
    });
  });

  // Wire solution type cells
  var solutionTypeCells = document.querySelectorAll('.solution-types-cell');
  solutionTypeCells.forEach(function(cell) {
    cell.addEventListener('click', function() {
      var reqId = cell.getAttribute('data-req-id');
      var req = estimator.requirements.find(function(r) {
        return r.id === reqId;
      });

      if (!req) return;

      // Show modal
      var modal = document.createElement('div');
      modal.innerHTML = renderSolutionTypeModal(req, state);
      document.body.appendChild(modal.firstChild);

      // Track selection order
      var selectionOrder = (req.solutionTypes || []).slice();

      // Wire checkbox changes to track order
      var checkboxes = document.querySelectorAll('.st-checkbox');
      checkboxes.forEach(function(cb) {
        cb.addEventListener('change', function() {
          if (cb.checked) {
            // Add to order if not already present
            if (!selectionOrder.includes(cb.value)) {
              selectionOrder.push(cb.value);
            }
          } else {
            // Remove from order
            selectionOrder = selectionOrder.filter(function(v) {
              return v !== cb.value;
            });
          }

          // Update visual primary indicator
          updatePrimaryLabels();
        });
      });

      function updatePrimaryLabels() {
        var labels = document.querySelectorAll('.solution-type-option');
        labels.forEach(function(label) {
          var checkbox = label.querySelector('.st-checkbox');
          var span = label.querySelector('span');
          var type = checkbox.value;
          var isPrimary = selectionOrder[0] === type;

          label.classList.toggle('primary', isPrimary);
          span.textContent = type + (isPrimary ? ' [Primary]' : '');
        });
      }

      // Wire save button
      document.getElementById('solution-type-save')
          .addEventListener('click', function() {
            if (selectionOrder.length === 0) {
              alert('Please select at least one solution type');
              return;
            }

            state.project._pushUndo();
            req.solutionTypes = selectionOrder.slice();
            state.project.estimator.summary =
                PP.recalcSummary(state.project.estimator);

            document.getElementById('solution-type-modal').remove();
            PP.refresh(true);
          });

      // Wire cancel button
      document.getElementById('solution-type-cancel')
          .addEventListener('click', function() {
            document.getElementById('solution-type-modal').remove();
          });
    });
  });

  var tbody = document.getElementById('requirements-tbody');
  if (!tbody) return;

  var rows = tbody.querySelectorAll('tr');
  rows.forEach(function(row, index) {
    var req = state.project.estimator.requirements[index];

    row.querySelector('.req-name').addEventListener('change', function(e) {
      state.project._pushUndo();
      req.name = e.target.value;
      PP.refresh(true);
    });

    row.querySelector('.req-feature').addEventListener('change', function(e) {
      var value = e.target.value;

      // If typing new feature (not in params.features), add it
      if (value && !estimator.params.features.includes(value)) {
        estimator.params.features.push(value);

        // Initialize in high-level
        if (!estimator.highlevel.byFeature) {
          estimator.highlevel.byFeature = {};
        }
        estimator.highlevel.byFeature[value] = {low: 0, medium: 0, high: 0};
      }

      state.project._pushUndo();
      req.feature = value;
      state.project.estimator.summary =
          PP.recalcSummary(state.project.estimator);
      PP.refresh(true);
    });

    row.querySelector('.req-complexity')
        .addEventListener('change', function(e) {
          state.project._pushUndo();
          req.complexity = e.target.value;
          state.project.estimator.summary =
              PP.recalcSummary(state.project.estimator);
          PP.refresh(true);
        });

    row.querySelector('.req-moscow').addEventListener('change', function(e) {
      state.project._pushUndo();
      req.moscow = e.target.value;
      PP.refresh(true);
    });

    row.querySelector('.req-phase').addEventListener('change', function(e) {
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
      '<button class="hl-tab' + (highlevelTab === 'feature' ? ' active' : '') +
      '" data-tab="feature">By Feature</button>' +
      '<button class="hl-tab' + (highlevelTab === 'moscow' ? ' active' : '') +
      '" data-tab="moscow">By MoSCoW</button>' +
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
  // Build pivot from requirements
  var pivot = {};

  estimator.requirements.forEach(function(req) {
    var feature = req.feature || 'Unassigned';

    if (!pivot[feature]) {
      pivot[feature] = {
        low: 0,
        medium: 0,
        high: 0,
        ootb: 0,
        configuration: 0,
        customization: 0,
        integration: 0,
        migration: 0,
        totalEffort: 0,
        phases: []
      };
    }

    // Count by complexity
    if (req.complexity === 'Low') pivot[feature].low++;
    if (req.complexity === 'Medium') pivot[feature].medium++;
    if (req.complexity === 'High') pivot[feature].high++;

    // Count by solution types (requirement can have multiple)
    var types = req.solutionTypes || [];
    for (var t = 0; t < types.length; t++) {
      var type = types[t].toLowerCase();
      if (pivot[feature][type] !== undefined) {
        pivot[feature][type]++;
      }
    }

    // Collect unique phases
    if (req.releasePhase && pivot[feature].phases.indexOf(req.releasePhase) === -1) {
      pivot[feature].phases.push(req.releasePhase);
    }

    // Sum effort
    if (req.solutionTypes && req.solutionTypes.length > 0 && req.complexity) {
      var calc = PP.calculateRequirement(req, estimator.params);
      pivot[feature].totalEffort += calc.totalDays;
    }
  });

  var html = '<table class="highlevel-table">' +
      '<thead>' +
      '<tr>' +
      '<th rowspan="2">Feature</th>' +
      '<th colspan="3" style="text-align:center;border-bottom:1px solid var(--border)">Complexity</th>' +
      '<th colspan="5" style="text-align:center;border-bottom:1px solid var(--border)">Solution Type</th>' +
      '<th rowspan="2" style="width:120px">Phases</th>' +
      '<th rowspan="2" style="width:140px">Total Effort (days)</th>' +
      '</tr>' +
      '<tr>' +
      '<th style="width:60px">Low</th>' +
      '<th style="width:60px">Med</th>' +
      '<th style="width:60px">High</th>' +
      '<th style="width:60px">OOTB</th>' +
      '<th style="width:80px">Config</th>' +
      '<th style="width:80px">Custom</th>' +
      '<th style="width:70px">Integ</th>' +
      '<th style="width:60px">Migr</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>';

  var features = Object.keys(pivot).sort();

  if (features.length === 0) {
    html += '<tr><td colspan="11" style="text-align:center;color:var(--text-secondary);padding:24px;">' +
        'No requirements yet. Switch to Detailed mode to add requirements.</td></tr>';
  } else {
    features.forEach(function(feature) {
      var data = pivot[feature];
      var phasesDisplay = data.phases.sort().join(', ');
      html += '<tr>' +
          '<td>' + escapeHtml(feature) + '</td>' +
          '<td style="text-align:center">' + data.low + '</td>' +
          '<td style="text-align:center">' + data.medium + '</td>' +
          '<td style="text-align:center">' + data.high + '</td>' +
          '<td style="text-align:center">' + data.ootb + '</td>' +
          '<td style="text-align:center">' + data.configuration + '</td>' +
          '<td style="text-align:center">' + data.customization + '</td>' +
          '<td style="text-align:center">' + data.integration + '</td>' +
          '<td style="text-align:center">' + data.migration + '</td>' +
          '<td>' + escapeHtml(phasesDisplay) + '</td>' +
          '<td style="text-align:right">' + data.totalEffort.toFixed(2) + '</td>' +
          '</tr>';
    });
  }

  html += '</tbody></table>';

  return html;
}

function renderMoscowMatrix(estimator) {
  var priorities = ['Must', 'Should', 'Could', "Won't"];
  var pivot = {};

  priorities.forEach(function(p) {
    pivot[p] = { low: 0, medium: 0, high: 0 };
  });

  estimator.requirements.forEach(function(req) {
    if (!req.moscow) return;

    var moscow = req.moscow;
    if (!pivot[moscow]) {
      pivot[moscow] = { low: 0, medium: 0, high: 0 };
    }

    if (req.complexity === 'Low') pivot[moscow].low++;
    if (req.complexity === 'Medium') pivot[moscow].medium++;
    if (req.complexity === 'High') pivot[moscow].high++;
  });

  var html = '<table class="highlevel-table">' +
      '<thead><tr>' +
      '<th>Priority</th>' +
      '<th style="width:120px">Low</th>' +
      '<th style="width:120px">Medium</th>' +
      '<th style="width:120px">High</th>' +
      '<th style="width:80px">Total</th>' +
      '</tr></thead>' +
      '<tbody>';

  priorities.forEach(function(priority) {
    var counts = pivot[priority];
    var totalCount = counts.low + counts.medium + counts.high;
    html += '<tr>' +
        '<td>' + priority + '</td>' +
        '<td style="text-align:center">' + counts.low + '</td>' +
        '<td style="text-align:center">' + counts.medium + '</td>' +
        '<td style="text-align:center">' + counts.high + '</td>' +
        '<td style="text-align:center">' + totalCount + '</td>' +
        '</tr>';
  });

  html += '</tbody></table>';

  return html;
}

function wireHighLevelGrid(state) {
  var estimator = state.project.estimator;

  // Wire tab buttons
  var tabButtons = document.querySelectorAll('.hl-tab');
  tabButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      highlevelTab = btn.getAttribute('data-tab');
      PP.refresh(true);
    });
  });
}

function renderSummary(state) {
  state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
  var summary = state.project.estimator.summary;

  function renderBreakdownTable(title, data) {
    if (Object.keys(data).length === 0) {
      return '<div class="estimator-card"><h3>' + title +
          '</h3><p style="color:var(--text-secondary);font-size:12px">No data</p></div>';
    }

    var html = '<div class="estimator-card">' +
        '<h3>' + title + '</h3>' +
        '<div class="summary-breakdown"><table>' +
        '<thead><tr>' +
        '<th>Item</th>' +
        '<th>' +
        '<select class="summary-value-mode-select" style="border:1px solid var(--border);background:var(--surface);padding:2px 4px;border-radius:var(--radius-sm);font-size:12px;cursor:pointer">' +
        '<option value="days"' +
        (summaryValueMode === 'days' ? ' selected' : '') + '>Days</option>' +
        '<option value="hours"' +
        (summaryValueMode === 'hours' ? ' selected' : '') + '>Hours</option>' +
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
        html +=
            '<tr><td>' + escapeHtml(key) + '</td><td>' + value + '</td></tr>';
      }
    }

    html += '</tbody></table></div></div>';
    return html;
  }

  function renderChartView() {
    var html = '<div class="estimator-card" style="grid-column: 1 / -1">' +
        '<div class="chart-legend">' +
        '<button class="legend-btn ' +
        (chartCategory === 'byFeature' ? 'active' : '') +
        '" data-category="byFeature">Feature</button>' +
        '<button class="legend-btn ' +
        (chartCategory === 'byStage' ? 'active' : '') +
        '" data-category="byStage">Powered Stage</button>' +
        '<button class="legend-btn ' +
        (chartCategory === 'byRole' ? 'active' : '') +
        '" data-category="byRole">Role</button>' +
        '<button class="legend-btn ' +
        (chartCategory === 'bySolutionType' ? 'active' : '') +
        '" data-category="bySolutionType">Solution Type</button>' +
        '<button class="legend-btn ' +
        (chartCategory === 'byActivity' ? 'active' : '') +
        '" data-category="byActivity">Activity</button>' +
        '</div>' +
        '<div class="chart-container">' +
        '<canvas id="summary-chart" width="1600" height="800"></canvas>' +
        '</div>' +
        '</div>';
    return html;
  }

  var html = '<div class="estimator-summary-section">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
      '<h3 style="margin:0;font-size:16px;font-weight:600">Estimation Summary</h3>' +
      '<div class="summary-view-toggle">' +
      '<button id="summary-table-btn" class="' +
      (summaryView === 'table' ? 'active' : '') + '">Table</button>' +
      '<button id="summary-chart-btn" class="' +
      (summaryView === 'chart' ? 'active' : '') + '">Chart</button>' +
      '</div>' +
      '</div>' +
      '<div class="estimator-summary-grid">' +
      '<div class="summary-total">' +
      '<div class="summary-total-label">Total Effort</div>' +
      '<div class="summary-total-value">' + summary.totalDays.toFixed(1) +
      '</div>' +
      '<div class="summary-total-label">' + (summary.totalDays * 8).toFixed(0) +
      ' hours</div>' +
      '</div>' +
      (summaryView === 'table' ?
           renderBreakdownTable('By Feature', summary.byFeature) +
               renderBreakdownTable('By Powered Stage', summary.byStage) +
               renderBreakdownTable('By Role', summary.byRole) +
               renderBreakdownTable(
                   'By Solution Type', summary.bySolutionType) +
               renderBreakdownTable('By Activity', summary.byActivity) :
           renderChartView()) +
      '</div>' +
      '</div>';

  return html;
}

function wireSummary(state) {
  var tableBtn = document.getElementById('summary-table-btn');
  var chartBtn = document.getElementById('summary-chart-btn');

  if (tableBtn) {
    tableBtn.addEventListener('click', function() {
      summaryView = 'table';
      PP.refresh(true);
    });
  }

  if (chartBtn) {
    chartBtn.addEventListener('click', function() {
      summaryView = 'chart';
      PP.refresh(true);
    });
  }

  // Wire up value mode dropdowns
  var valueModeSelects =
      document.querySelectorAll('.summary-value-mode-select');
  valueModeSelects.forEach(function(select) {
    select.addEventListener('change', function() {
      summaryValueMode = select.value;
      PP.refresh(true);
    });
  });

  if (summaryView === 'chart') {
    var legendBtns = document.querySelectorAll('.legend-btn');
    legendBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        chartCategory = btn.getAttribute('data-category');
        PP.refresh(true);
      });
    });

    drawChart(state);
    wireChartTooltip(state);
  }
}

function wireChartTooltip(state) {
  var canvas = document.getElementById('summary-chart');
  if (!canvas || chartCategory !== 'byRole') return;

  // Remove existing tooltip if any
  var existingTooltip = document.getElementById('chart-tooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }

  var tooltip = document.createElement('div');
  tooltip.id = 'chart-tooltip';
  tooltip.style.position = 'absolute';
  tooltip.style.display = 'none';
  tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
  tooltip.style.color = 'white';
  tooltip.style.padding = '8px 12px';
  tooltip.style.borderRadius = '4px';
  tooltip.style.fontSize = '14px';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.zIndex = '1000';
  document.body.appendChild(tooltip);

  canvas.addEventListener('mousemove', function(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var mouseX = (e.clientX - rect.left) * scaleX;
    var mouseY = (e.clientY - rect.top) * scaleY;

    var hoveredSegment = null;
    for (var i = 0; i < chartSegments.length; i++) {
      var seg = chartSegments[i];
      if (mouseX >= seg.x && mouseX <= seg.x + seg.width && mouseY >= seg.y &&
          mouseY <= seg.y + seg.height) {
        hoveredSegment = seg;
        break;
      }
    }

    if (hoveredSegment) {
      tooltip.innerHTML = '<strong>' + hoveredSegment.stage + '</strong><br>' +
          hoveredSegment.role + ': ' + hoveredSegment.value.toFixed(1) +
          ' days';
      tooltip.style.display = 'block';

      // Position tooltip right next to cursor
      tooltip.style.left = (e.clientX + 0.5) + 'px';
      tooltip.style.top = (e.clientY + 0.5) + 'px';
      canvas.style.cursor = 'pointer';
    } else {
      tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
    canvas.style.cursor = 'default';
  });
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
  var kpmgBlue =
      computedStyle.getPropertyValue('--kpmg-blue').trim() || '#00338d';
  var textColor = computedStyle.getPropertyValue('--text').trim() || '#000';

  // Stage colors - blue gradient palette
  var stageColors = {
    'Vision': '#00254D',     // Dark navy
    'Validate': '#003D73',   // Navy blue
    'Construct': '#0074B7',  // Medium blue
    'Deploy': '#7FAFCC',     // Light blue
    'Evolve': '#C5D9E6'      // Very light blue
  };

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Special handling for byRole - show stacked by stage
  if (chartCategory === 'byRole') {
    drawRoleByStageChart(ctx, state, width, height, textColor, stageColors);
    return;
  }

  // Prepare data for other categories
  var items = [];
  for (var key in data) {
    if (data.hasOwnProperty(key)) {
      items.push({label: key, value: data[key]});
    }
  }

  if (items.length === 0) return;

  // Sort by value descending
  items.sort(function(a, b) {
    return b.value - a.value;
  });

  var maxValue = Math.max.apply(null, items.map(function(item) {
    return item.value;
  }));
  var barHeight = 60;
  var barSpacing = 20;
  var leftMargin = 300;
  var rightMargin = 160;
  var topMargin = 40;
  var chartWidth = width - leftMargin - rightMargin;

  // Draw bars
  items.forEach(function(item, i) {
    var barWidth = (item.value / maxValue) * chartWidth;
    var y = topMargin + i * (barHeight + barSpacing);

    // Bar
    ctx.fillStyle = kpmgBlue;
    ctx.fillRect(leftMargin, y, barWidth, barHeight);

    // Label
    ctx.fillStyle = textColor;
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(item.label, leftMargin - 20, y + barHeight / 2 + 8);

    // Value
    ctx.textAlign = 'left';
    ctx.fillText(
        item.value.toFixed(1) + ' days', leftMargin + barWidth + 20,
        y + barHeight / 2 + 8);
  });
}

var chartSegments = [];  // Store segment coordinates for tooltip

function drawRoleByStageChart(
    ctx, state, width, height, textColor, stageColors) {
  var summary = state.project.estimator.summary;
  var stages = ['Vision', 'Validate', 'Construct', 'Deploy', 'Evolve'];

  // Calculate role breakdown by stage
  var roleBreakdown = {};
  for (var role in PP.ROLE_ALLOCATION_BY_STAGE) {
    if (PP.ROLE_ALLOCATION_BY_STAGE.hasOwnProperty(role)) {
      roleBreakdown[role] = {total: 0, byStage: {}};
      for (var i = 0; i < stages.length; i++) {
        var stage = stages[i];
        var stageTotal = summary.byStage[stage] || 0;
        var roleAllocation = PP.ROLE_ALLOCATION_BY_STAGE[role][stage] || 0;
        var roleStageEffort = stageTotal * roleAllocation;
        roleBreakdown[role].byStage[stage] = roleStageEffort;
        roleBreakdown[role].total += roleStageEffort;
      }
    }
  }

  // Convert to items and sort
  var items = [];
  for (var role in roleBreakdown) {
    if (roleBreakdown.hasOwnProperty(role)) {
      items.push({
        label: role,
        total: roleBreakdown[role].total,
        byStage: roleBreakdown[role].byStage
      });
    }
  }
  items.sort(function(a, b) {
    return b.total - a.total;
  });

  if (items.length === 0) return;

  var maxValue = Math.max.apply(null, items.map(function(item) {
    return item.total;
  }));
  var barHeight = 60;
  var barSpacing = 20;
  var leftMargin = 360;
  var rightMargin = 160;
  var topMargin = 120;  // Extra space for legend
  var bottomMargin = 40;
  var chartWidth = width - leftMargin - rightMargin;

  // Clear segments array
  chartSegments = [];

  // Draw legend at top
  var legendX = leftMargin;
  var legendY = 40;
  var legendItemWidth = 200;
  ctx.font = '22px sans-serif';

  for (var i = 0; i < stages.length; i++) {
    var stage = stages[i];
    var x = legendX + i * legendItemWidth;

    // Color box
    ctx.fillStyle = stageColors[stage];
    ctx.fillRect(x, legendY, 24, 24);

    // Label
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.fillText(stage, x + 32, legendY + 20);
  }

  // Draw stacked bars
  items.forEach(function(item, i) {
    var y = topMargin + i * (barHeight + barSpacing);
    var x = leftMargin;

    // Draw each stage segment
    for (var j = 0; j < stages.length; j++) {
      var stage = stages[j];
      var stageValue = item.byStage[stage] || 0;
      var segmentWidth = (stageValue / maxValue) * chartWidth;

      if (segmentWidth > 0) {
        ctx.fillStyle = stageColors[stage];
        ctx.fillRect(x, y, segmentWidth, barHeight);

        // Store segment coordinates for tooltip
        chartSegments.push({
          x: x,
          y: y,
          width: segmentWidth,
          height: barHeight,
          stage: stage,
          role: item.label,
          value: stageValue
        });

        // Show value if segment is wide enough
        if (segmentWidth > 60) {
          // Use dark text for light segments, white text for dark segments
          var useDarkText = (stage === 'Deploy' || stage === 'Evolve');
          ctx.fillStyle = useDarkText ? '#000000' : '#ffffff';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
              stageValue.toFixed(1), x + segmentWidth / 2,
              y + barHeight / 2 + 6);
        }

        x += segmentWidth;
      }
    }

    // Role label
    ctx.fillStyle = textColor;
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(item.label, leftMargin - 20, y + barHeight / 2 + 8);

    // Total value
    ctx.textAlign = 'left';
    ctx.fillText(
        item.total.toFixed(1) + ' days',
        leftMargin + (item.total / maxValue) * chartWidth + 20,
        y + barHeight / 2 + 8);
  });
}

function renderEstimator(state) {
  var container = document.getElementById('estimator-view');

  var html = '<div class="estimator-container">' +
      '<div class="estimator-header">' + renderHeader(state) + '</div>' +
      '<div class="estimator-body">' + renderSummary(state) +
      (state.project.estimator.mode === 'detailed' ?
           renderDetailedGrid(state) :
           renderHighLevelGrid(state)) +
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
