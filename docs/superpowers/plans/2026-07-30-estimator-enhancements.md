# Estimator Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dynamic powered stage management, enhanced table headers with Complexity/Solution Type labels and Phases column, and move Estimator tab to first position.

**Architecture:** Extend existing estimator UI with dynamic stage grid builder, proportional redistribution algorithm on delete, and two-row table headers. No data model changes - purely UI enhancements.

**Tech Stack:** Vanilla JavaScript (ES5), HTML, CSS

## Global Constraints

- ES5 syntax only (no arrow functions, let/const, template literals)
- All strings in `innerHTML` must use `escapeHtml()` helper
- Build with `python3 build.py` after every source change
- UMD wrapper for engine files (`module.exports` for Node, `globalThis.PP` for browser)
- Manual browser testing (no automated UI tests)

---

## File Structure

**Files Modified:**
- `src/css/theme.css` - Add styles for stage delete buttons and add stage button
- `src/js/ui/estimator.js:100-133` - Replace hardcoded stage grid with dynamic builder
- `src/js/ui/estimator.js:200-250` - Add stage add/delete event handlers
- `src/js/ui/estimator.js:772-855` - Update By Feature table with two-row header and phases column
- `src/index.html:52-66` - Reorder tabs (Estimator first)

**Files Not Changed:**
- `src/js/estimatorEngine.js` - No calculation logic changes
- `src/js/store.js` - `poweredStages` structure unchanged

---

### Task 1: Add CSS Styles for Stage Management Buttons

**Files:**
- Modify: `src/css/theme.css:491` (end of file)

**Interfaces:**
- Consumes: None
- Produces: CSS classes `.ps-delete-btn`, `#ps-add-stage-btn`

- [ ] **Step 1: Add delete button styles**

Open `src/css/theme.css`, add at end (after line 491):

```css
.ps-delete-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  padding: 0 4px;
  margin-left: 4px;
  line-height: 1;
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
  display: inline-block;
}

#ps-add-stage-btn:hover {
  opacity: 0.9;
}
```

- [ ] **Step 2: Build and verify**

```bash
python3 build.py
```

Expected: `Built /Users/napasjutha/Desktop/project_mnm/temp_repo/dist/ProjectPlanner.html`

- [ ] **Step 3: Commit**

```bash
git add src/css/theme.css
git commit -m "style(estimator): add styles for powered stage management buttons

Add delete button (×) and add stage button (+) styles for dynamic
powered stage grid.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Implement Dynamic Powered Stage Grid Rendering

**Files:**
- Modify: `src/js/ui/estimator.js:100-133`

**Interfaces:**
- Consumes: `params.poweredStages` (object), `escapeHtml(str)` (function)
- Produces: Dynamic HTML grid with delete buttons per stage, add stage button

- [ ] **Step 1: Replace hardcoded grid with dynamic builder**

Open `src/js/ui/estimator.js`, find lines 100-133 (the hardcoded 5-stage grid).

Replace entire section from line 100 `'<h4>Powered Stage Distribution</h4>'` through line 133 `'</div>';` with:

```javascript
  '<h4>Powered Stage Distribution</h4>' +
  '<div class="powered-stages-grid' + (psValid ? '' : ' invalid') + '">';

  var stages = Object.keys(params.poweredStages).sort();
  stages.forEach(function(stage) {
    html += '<div class="param-field">' +
      '<label>' + escapeHtml(stage) + ':</label>' +
      '<input type="number" class="ps-input param-input" data-stage="' +
      escapeHtml(stage) + '" value="' + params.poweredStages[stage] +
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
```

- [ ] **Step 2: Build**

```bash
python3 build.py
```

Expected: Success

- [ ] **Step 3: Manual browser test**

```bash
cd dist && python3 -m http.server 8001
```

Open `http://localhost:8001/ProjectPlanner.html`:
1. Go to Estimator tab
2. Expand Parameters
3. Verify 5 stages display with × buttons
4. Verify "+ Add Stage" button appears below grid
5. Verify inputs still editable
6. Verify total validation still works

- [ ] **Step 4: Commit**

```bash
git add src/js/ui/estimator.js
git commit -m "refactor(estimator): make powered stage grid dynamic

Replace hardcoded 5-stage grid with dynamic builder from
poweredStages object keys. Add delete button (×) per stage,
disabled if only 1 stage remains. Add '+ Add Stage' button.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Implement Add Stage Functionality

**Files:**
- Modify: `src/js/ui/estimator.js:200` (after existing wireHeader logic)

**Interfaces:**
- Consumes: `state.project.estimator.params.poweredStages` (object), `PP.refresh()` (function)
- Produces: Event handler for `#ps-add-stage-btn` that prompts and adds new stage

- [ ] **Step 1: Add event handler after existing wireHeader code**

Open `src/js/ui/estimator.js`, find `wireHeader` function around line 174. After the existing event handlers (after the mode toggle logic, around line 200), add:

```javascript
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
      PP.refresh();
    });
  }
```

- [ ] **Step 2: Build**

```bash
python3 build.py
```

Expected: Success

- [ ] **Step 3: Manual browser test**

Refresh browser:
1. Click "+ Add Stage"
2. Enter "Testing" as name
3. Enter "5" as percentage
4. Verify grid rebuilds with 6 stages
5. Verify "Testing" appears with value 5
6. Verify total shows 105% (invalid, red border)
7. Try to add "Testing" again - should show error
8. Try to add "" (empty name) - should do nothing
9. Try to add with percentage "abc" - should show error

- [ ] **Step 4: Commit**

```bash
git add src/js/ui/estimator.js
git commit -m "feat(estimator): add powered stage creation

Add event handler for '+ Add Stage' button. Prompts for stage name
and initial percentage (0-100). Validates uniqueness and numeric input.
Rebuilds grid dynamically.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Implement Delete Stage with Proportional Redistribution

**Files:**
- Modify: `src/js/ui/estimator.js:220` (after add stage handler)

**Interfaces:**
- Consumes: `state.project.estimator.params.poweredStages` (object), `PP.refresh()` (function), `PP.recalcSummary()` (function)
- Produces: Event handlers for `.ps-delete-btn`, `redistributeStages()` helper function

- [ ] **Step 1: Add redistributeStages helper function**

After the add stage handler (around line 220), add:

```javascript
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
      redistributeStages(stage, params.poweredStages);
      state.project.estimator.summary = PP.recalcSummary(state.project.estimator);
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
```

- [ ] **Step 2: Build**

```bash
python3 build.py
```

Expected: Success

- [ ] **Step 3: Manual browser test**

Refresh browser:
1. Verify default 5 stages (Vision 12, Validate 34, Construct 36, Deploy 10, Evolve 8)
2. Click × on "Evolve"
3. Verify stages redistribute:
   - Vision: 12 → 13.04%
   - Validate: 34 → 36.96%
   - Construct: 36 → 39.13%
   - Deploy: 10 → 10.87%
   - Total: 100% (green checkmark)
4. Add "Testing" at 0%
5. Delete "Testing" (should redistribute 100% across 4 stages = no change)
6. Try to delete when only 1 stage remains (should be disabled/alert)

- [ ] **Step 4: Test edge case - all zeros**

1. Set all stages to 0%
2. Delete one stage
3. Verify remaining stages get equal distribution (e.g., 4 stages → 25% each)

- [ ] **Step 5: Commit**

```bash
git add src/js/ui/estimator.js
git commit -m "feat(estimator): add powered stage deletion with proportional redistribution

Delete stage with × button. Redistribute percentage proportionally
across remaining stages to maintain relative weights. Always sums to
100% after redistribution. Handles edge cases: last stage (disabled),
all zeros (even distribution), rounding errors (adjust largest).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Update By Feature Table with Headers and Phases Column

**Files:**
- Modify: `src/js/ui/estimator.js:772-855`

**Interfaces:**
- Consumes: `estimator.requirements[]` (array), `PP.calculateRequirement()` (function), `escapeHtml()` (function)
- Produces: Updated `renderFeatureMatrix()` with two-row header and phases column

- [ ] **Step 1: Update pivot structure to include phases**

Open `src/js/ui/estimator.js`, find `renderFeatureMatrix` function (line 772).

Replace the pivot initialization section (around lines 779-791):

```javascript
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
```

- [ ] **Step 2: Update table header to two-row structure**

Replace the header section (around lines 814-826):

```javascript
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
```

- [ ] **Step 3: Update empty state colspan**

Find the empty state message (around line 832), update colspan:

```javascript
  if (features.length === 0) {
    html += '<tr><td colspan="11" style="text-align:center;color:var(--text-secondary);padding:24px;">' +
        'No requirements yet. Switch to Detailed mode to add requirements.</td></tr>';
```

- [ ] **Step 4: Update data row to include phases column**

Replace the feature row rendering (around lines 835-848):

```javascript
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
```

- [ ] **Step 5: Build**

```bash
python3 build.py
```

Expected: Success

- [ ] **Step 6: Manual browser test**

Refresh browser:
1. Switch to Detailed mode
2. Add requirement: Feature "Field Service", solutionTypes ["Configuration"], complexity "Medium", phase "Phase-1"
3. Add requirement: Feature "Field Service", solutionTypes ["Customization"], complexity "High", phase "Phase-3"
4. Add requirement: Feature "Case Mgmt", solutionTypes ["OOTB"], complexity "Low", phase "Phase-1"
5. Switch to High Level mode, By Feature tab
6. Verify two-row header:
   - Row 1: Feature | Complexity | Solution Type | Phases | Total Effort
   - Row 2: | Low Med High | OOTB Config Custom Integ Migr | |
7. Verify "Field Service" row shows:
   - Complexity: 0, 1, 1
   - Solution Type: 0, 1, 1, 0, 0
   - Phases: "Phase-1, Phase-3"
8. Verify "Case Mgmt" row shows:
   - Phases: "Phase-1"

- [ ] **Step 7: Commit**

```bash
git add src/js/ui/estimator.js
git commit -m "feat(estimator): add two-row headers and phases column to By Feature table

Add Complexity/Solution Type label row above column headers.
Add Phases column showing comma-separated unique release phases
per feature, sorted alphabetically.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Reorder Tabs (Estimator First)

**Files:**
- Modify: `src/index.html:52-66`

**Interfaces:**
- Consumes: None
- Produces: Estimator tab button in first position with `active` class

- [ ] **Step 1: Move Estimator tab to first position**

Open `src/index.html`, find tab buttons section (lines 52-66).

Move the Estimator button from last position to first:

```html
  <div id="view-tabs">
    <button class="view-tab active" data-view="estimator">Estimator</button>
    <button class="view-tab" data-view="plan">Plan</button>
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
  </div>
```

**Note:** Remove `active` class from Plan button (if present), add to Estimator button.

- [ ] **Step 2: Build**

```bash
python3 build.py
```

Expected: Success

- [ ] **Step 3: Manual browser test**

Refresh browser (force reload to clear localStorage if needed):
1. Verify Estimator tab appears first (leftmost)
2. Verify Estimator tab is active/selected by default
3. Verify clicking through tabs works correctly
4. Verify Plan tab is second

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "feat(estimator): move Estimator tab to first position

Reorder tabs to show Estimator first (before Plan). Makes Estimator
the default active tab on app load.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Final Integration Testing

**Files:**
- Test: All modified files in integrated browser environment

**Interfaces:**
- Consumes: Complete implementation from Tasks 1-6
- Produces: Verified working features

- [ ] **Step 1: Test dynamic stage management end-to-end**

1. Load app (Estimator tab default)
2. Expand Parameters
3. Verify 5 default stages with delete buttons
4. Add "UAT" stage at 10%
5. Manually adjust other stages to total 100%
6. Delete "Evolve" - verify proportional redistribution
7. Verify total = 100%
8. Try to delete when only 1 stage remains - verify disabled
9. Refresh page - verify stages persist

- [ ] **Step 2: Test table headers and phases**

1. Switch to Detailed mode
2. Add 5 requirements across 3 features with different phases
3. Switch to High Level, By Feature tab
4. Verify:
   - Two-row header displays correctly
   - "Complexity" and "Solution Type" labels clear
   - Phases column shows comma-separated values
   - Counts match detailed requirements
   - Total Effort calculated

- [ ] **Step 3: Test tab ordering**

1. Reload app
2. Verify Estimator tab first and active
3. Click Plan tab
4. Click Estimator tab again
5. Verify navigation smooth

- [ ] **Step 4: Test edge cases**

1. Empty state - verify "No requirements" message with correct colspan
2. Single feature with no phases - verify empty phase cell
3. Feature with single phase - verify no comma
4. Delete all stages except 1 - verify can't delete last
5. Add stage with duplicate name - verify error
6. Add stage with invalid percentage - verify error

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "test(estimator): verify all enhancements integrated

Manual testing confirms:
- Dynamic powered stage add/delete with redistribution
- Two-row table headers with Complexity/Solution Type labels
- Phases column showing comma-separated release phases
- Estimator tab first and default active
- All edge cases handled correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage check:**

1. ✓ Dynamic powered stage grid - Task 2
2. ✓ Add stage functionality - Task 3
3. ✓ Delete stage with proportional redistribution - Task 4
4. ✓ Two-row table headers with Complexity/Solution Type labels - Task 5
5. ✓ Phases column in By Feature table - Task 5
6. ✓ Estimator tab moved to first position - Task 6
7. ✓ CSS styles for new buttons - Task 1
8. ✓ Integration testing - Task 7

**Placeholder scan:** None found. All code samples complete.

**Type consistency:**
- `params.poweredStages` used consistently as object with stage names as keys
- `pivot[feature].phases` array used consistently
- `escapeHtml()` function called consistently
- `PP.refresh()` and `PP.recalcSummary()` signatures consistent

All spec requirements covered. Plan is complete.
