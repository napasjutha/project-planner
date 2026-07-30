# Estimator Enhancements: Dynamic Stages, Table Headers & Tab Reordering

**Date:** 2026-07-30
**Status:** Draft

## Overview

Three independent UI enhancements to the Estimator tab:

1. **Dynamic Powered Stage Management** - Allow users to add/delete stages with automatic proportional redistribution
2. **Enhanced Table Headers** - Add Complexity/Solution Type labels and Release Phase column to By Feature pivot table
3. **Tab Reordering** - Move Estimator tab to first position (before Plan tab)

## 1. Dynamic Powered Stage Management

### Current Behavior

Powered Stage Distribution has 5 hardcoded stages (Vision, Validate, Construct, Deploy, Evolve) with fixed number inputs. Users can edit percentages but cannot add/remove stages.

### New Behavior

**UI Changes:**
- Replace hardcoded stage inputs with dynamically generated grid from `poweredStages` object
- Each stage shows: label, number input (0-100), delete button (×)
- Add "+ Add Stage" button below grid
- Keep existing total validation (red border if sum ≠ 100%)

**Add Stage Flow:**
1. User clicks "+ Add Stage"
2. Prompt for stage name (must be unique, non-empty)
3. Prompt for initial percentage (0-100, default: 0)
4. Insert into `params.poweredStages` object
5. Rebuild grid with new stage
6. Total likely invalid → user adjusts manually

**Delete Stage Flow:**
1. User clicks × button on stage
2. Calculate proportional redistribution:
   - Example: Delete "Evolve" at 8%
   - Remaining total: 92% (Vision 12 + Validate 34 + Construct 36 + Deploy 10)
   - Scale factor: 100 / 92 = 1.0870
   - Apply to each: Vision 12→13.04%, Validate 34→36.96%, Construct 36→39.13%, Deploy 10→10.87%
3. Round percentages to 2 decimals
4. Adjust largest stage if rounding error causes sum ≠ 100%
5. Remove stage from `poweredStages` object
6. Rebuild grid - total auto-valid (always 100% after redistribution)

**Proportional Redistribution Algorithm:**
```javascript
function redistributeStages(stageToDelete, poweredStages) {
  var deletedPct = poweredStages[stageToDelete];
  delete poweredStages[stageToDelete];

  var remaining = Object.keys(poweredStages);
  var remainingTotal = remaining.reduce(function(sum, key) {
    return sum + poweredStages[key];
  }, 0);

  var scaleFactor = 100 / remainingTotal;
  remaining.forEach(function(key) {
    poweredStages[key] = Math.round(poweredStages[key] * scaleFactor * 100) / 100;
  });

  // Fix rounding errors by adjusting largest stage
  var newTotal = remaining.reduce(function(sum, key) {
    return sum + poweredStages[key];
  }, 0);
  if (newTotal !== 100) {
    var largest = remaining.sort(function(a, b) {
      return poweredStages[b] - poweredStages[a];
    })[0];
    poweredStages[largest] += (100 - newTotal);
    poweredStages[largest] = Math.round(poweredStages[largest] * 100) / 100;
  }
}
```

**Data Model:**
- No change to structure: `params.poweredStages` remains object `{Vision: 12, Validate: 34, ...}`
- Keys are stage names (dynamic)
- Values are percentages (number 0-100)

**Edge Cases:**
- Cannot delete last remaining stage (disable delete button if only 1 stage)
- Stage name must be unique (validate on add)
- Stage name cannot be empty (validate on add)

## 2. Enhanced Table Headers & Phase Column

### Current By Feature Table

Single header row:
```
| Feature | Low | Med | High | OOTB | Config | Custom | Integ | Migr | Total Effort (days) |
```

No indication that Low/Med/High are complexity, OOTB/etc are solution types. No phase information.

### New By Feature Table

**Two-Row Header:**

Row 1 (Label row):
```
| Feature | Complexity | Solution Type | Phases | Total Effort (days) |
```

Row 2 (Column row):
```
| | Low | Med | High | OOTB | Config | Custom | Integ | Migr | | |
```

**HTML Structure:**
```html
<thead>
  <tr>
    <th rowspan="2">Feature</th>
    <th colspan="3" style="text-align:center;border-bottom:1px solid var(--border)">Complexity</th>
    <th colspan="5" style="text-align:center;border-bottom:1px solid var(--border)">Solution Type</th>
    <th rowspan="2">Phases</th>
    <th rowspan="2">Total Effort (days)</th>
  </tr>
  <tr>
    <th style="width:60px">Low</th>
    <th style="width:60px">Med</th>
    <th style="width:60px">High</th>
    <th style="width:60px">OOTB</th>
    <th style="width:80px">Config</th>
    <th style="width:80px">Custom</th>
    <th style="width:70px">Integ</th>
    <th style="width:60px">Migr</th>
  </tr>
</thead>
```

**Phase Column:**
- New column between Solution Type and Total Effort
- Shows comma-separated list of unique release phases for requirements in that feature
- Example: "Phase-1, Phase-3, Deferred"
- Phases sorted alphabetically
- Empty cell if no requirements have phase set

**Pivot Logic Update:**
```javascript
// In renderFeatureMatrix, extend pivot structure:
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
  phases: []  // NEW: collect unique phases
};

// During requirement iteration:
if (req.releasePhase && !pivot[feature].phases.includes(req.releasePhase)) {
  pivot[feature].phases.push(req.releasePhase);
}

// During rendering:
var phasesDisplay = data.phases.sort().join(', ');
html += '<td>' + escapeHtml(phasesDisplay) + '</td>';
```

**CSS Adjustments:**
- Label row cells get centered text alignment
- Light border between label row and column row for visual separation
- Phase column width: ~120px to accommodate multiple phases

## 3. Tab Reordering

### Current Tab Order

```html
<div id="view-tabs">
  <button class="view-tab active" data-view="plan">Plan</button>
  <button class="view-tab" data-view="gantt">Gantt</button>
  <button class="view-tab" data-view="scurve">S-Curve</button>
  <button class="view-tab" data-view="dashboard">Dashboard</button>
  <button class="view-tab" data-view="snapshots">Snapshots</button>
  <button class="view-tab" data-view="resources">Resources</button>
  <button class="view-tab" data-view="billing">Deliverable/Billing</button>
  <button class="view-tab" data-view="settings">Settings</button>
  <button class="view-tab" data-view="holidays">Holidays</button>
  <button class="view-tab" data-view="activities">Activities</button>
  <button class="view-tab" data-view="reports">Reports</button>
  <button class="view-tab" data-view="issues">Issues, Risks & Decisions</button>
  <button class="view-tab" data-view="estimator">Estimator</button>
</div>
```

### New Tab Order

Move Estimator to first position:

```html
<div id="view-tabs">
  <button class="view-tab active" data-view="estimator">Estimator</button>
  <button class="view-tab" data-view="plan">Plan</button>
  <button class="view-tab" data-view="gantt">Gantt</button>
  <!-- ... rest unchanged ... -->
</div>
```

**Implications:**
- Estimator becomes default active tab on app load
- Need to update initial view state in `app.js` if Plan is currently hardcoded as default

**File:** `src/index.html` - Lines 52-66

## Implementation Details

### Files Modified

**`src/index.html`**
- Move Estimator tab button to first position
- Remove `active` class from Plan tab, add to Estimator tab

**`src/js/ui/estimator.js`**

**Function: `renderParams()` - Lines 100-133**
- Replace hardcoded 5-stage grid with dynamic builder:
  ```javascript
  var stages = Object.keys(params.poweredStages).sort();
  stages.forEach(function(stage) {
    html += '<div class="param-field">' +
      '<label>' + escapeHtml(stage) + ':</label>' +
      '<input type="number" class="ps-input param-input" data-stage="' +
      escapeHtml(stage) + '" value="' + params.poweredStages[stage] +
      '" min="0" max="100">' +
      '<button class="ps-delete-btn" data-stage="' + escapeHtml(stage) +
      '"' + (stages.length === 1 ? ' disabled' : '') + '>×</button>' +
      '</div>';
  });
  html += '<button id="ps-add-stage-btn">+ Add Stage</button>';
  ```

**Function: `wireHeader()` - After line 200**
- Add "+ Add Stage" button handler:
  ```javascript
  var addStageBtn = document.getElementById('ps-add-stage-btn');
  if (addStageBtn) {
    addStageBtn.addEventListener('click', function() {
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
        alert('Invalid percentage');
        return;
      }

      state.project._pushUndo();
      params.poweredStages[stageName] = pctNum;
      PP.refresh();
    });
  }
  ```

- Add delete stage button handlers:
  ```javascript
  var deleteStageButtons = document.querySelectorAll('.ps-delete-btn');
  deleteStageButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var stage = btn.getAttribute('data-stage');
      var stages = Object.keys(params.poweredStages);

      if (stages.length === 1) {
        alert('Cannot delete the last stage');
        return;
      }

      state.project._pushUndo();
      redistributeStages(stage, params.poweredStages);
      estimator.summary = PP.recalcSummary(estimator);
      PP.refresh();
    });
  });

  function redistributeStages(stageToDelete, poweredStages) {
    var deletedPct = poweredStages[stageToDelete];
    delete poweredStages[stageToDelete];

    var remaining = Object.keys(poweredStages);
    var remainingTotal = remaining.reduce(function(sum, key) {
      return sum + poweredStages[key];
    }, 0);

    if (remainingTotal === 0) {
      // Edge case: all stages were 0%, distribute evenly
      remaining.forEach(function(key) {
        poweredStages[key] = Math.round(100 / remaining.length * 100) / 100;
      });
    } else {
      var scaleFactor = 100 / remainingTotal;
      remaining.forEach(function(key) {
        poweredStages[key] = Math.round(poweredStages[key] * scaleFactor * 100) / 100;
      });
    }

    // Fix rounding errors
    var newTotal = remaining.reduce(function(sum, key) {
      return sum + poweredStages[key];
    }, 0);
    if (newTotal !== 100) {
      var largest = remaining.sort(function(a, b) {
        return poweredStages[b] - poweredStages[a];
      })[0];
      poweredStages[largest] += (100 - newTotal);
      poweredStages[largest] = Math.round(poweredStages[largest] * 100) / 100;
    }
  }
  ```

**Function: `renderFeatureMatrix()` - Line 772**
- Update pivot structure to include phases array
- Update header to two-row structure
- Add phase column to data rows
- Update empty state colspan to match new column count

```javascript
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

    // Count by solution types
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
```

**`src/css/theme.css`**

Add styles for delete buttons:
```css
.ps-delete-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  padding: 0 4px;
  margin-left: 4px;
}

.ps-delete-btn:hover:not(:disabled) {
  color: var(--danger);
}

.ps-delete-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

#ps-add-stage-btn {
  padding: 6px 12px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  margin-top: 8px;
}

#ps-add-stage-btn:hover {
  opacity: 0.9;
}
```

**`src/js/ui/app.js`**
- If Plan view is hardcoded as initial view, update to Estimator
- Check initial view logic around app initialization

## Testing Strategy

**Manual Browser Testing:**

1. **Dynamic Stages:**
   - Load app, go to Estimator tab
   - Verify 5 default stages display with delete buttons
   - Click "+ Add Stage", add "Testing" at 5%
   - Verify grid rebuilds with 6 stages
   - Verify total shows invalid (105%)
   - Adjust percentages manually to 100%
   - Delete "Evolve" stage
   - Verify percentages redistribute proportionally, total = 100%
   - Try to delete last remaining stage - should be disabled/prevented

2. **Table Headers:**
   - Add requirements with different features and phases
   - Switch to High Level mode, By Feature tab
   - Verify two-row header structure displays correctly
   - Verify "Complexity" and "Solution Type" labels appear
   - Verify Phases column shows comma-separated unique phases per feature
   - Verify Total Effort column still displays

3. **Tab Order:**
   - Reload app
   - Verify Estimator tab is first and active by default
   - Verify Plan tab is second
   - Click through all tabs to ensure navigation works

**Edge Cases:**
- Add stage with duplicate name (should reject)
- Add stage with empty name (should reject)
- Add stage with invalid percentage (should reject)
- Delete stage when only 1 remains (should disable/prevent)
- Delete stage when all stages have 0% (even redistribution fallback)
- Phases column with empty phases (should show empty cell)
- Phases column with single phase (no comma)

## Data Migration

**No migration needed** - all changes are UI-only or backward compatible:
- `poweredStages` object structure unchanged
- New `phases` array built on-the-fly during rendering (not stored)
- Tab order change is purely HTML

Existing projects load without modification.

## Rollback Plan

All changes isolated to:
- `src/index.html` (tab order)
- `src/js/ui/estimator.js` (stage management, table headers)
- `src/css/theme.css` (button styles)

Rollback: revert these 3 files.

## Success Criteria

1. Users can add custom stages to Powered Stage Distribution
2. Users can delete stages, percentages redistribute automatically to 100%
3. By Feature table header clearly labels Complexity vs Solution Type columns
4. By Feature table displays comma-separated release phases per feature
5. Estimator tab appears first and is default active tab
6. No breaking changes to existing data or functionality
