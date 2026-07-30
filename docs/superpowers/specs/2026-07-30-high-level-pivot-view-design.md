# High-Level Mode as Read-Only Pivot Table

**Date:** 2026-07-30
**Status:** Draft

## Overview

Convert high-level mode from an independent data entry system to a read-only pivot table that summarizes detailed requirements. This eliminates dual sources of truth and clarifies that detailed requirements are the primary data entry point.

## Context

Current implementation has two independent estimation workflows:

**Detailed Mode:**
- Line-by-line requirement entry
- Each requirement: feature, solution type, complexity, MoSCoW, phase
- Calculates effort from BASE_HOURS matrices

**High-Level Mode:**
- Separate count-based input (`highlevel.byFeature`, `highlevel.byMoscow`)
- User enters component counts manually
- Uses Configuration solution type for all calculations
- Creates second source of truth that can conflict with detailed data

**Problems:**
1. Two sources of truth for project estimates
2. MoSCoW tab exists but doesn't affect calculations (dead code)
3. Unclear which mode to use for data entry
4. Data sync issues when switching between modes
5. `highlevel.byFeature` input is redundant with detailed requirements

## Goals

1. **Single source of truth** - Detailed requirements are the only data entry point
2. **High-level as summary** - Display computed statistics from requirements
3. **Remove dead code** - Eliminate non-functional MoSCoW calculations
4. **Clear UX** - Read-only tables signal "this is a view, not input"
5. **Preserve pivot tables** - Keep By Feature and By MoSCoW tabs for different grouping views

## Non-Goals

- Preserve high-level count-based estimation workflow (explicitly removed)
- Support quick estimation without detailed requirements
- Maintain backward compatibility with `highlevel.byFeature` data

## Design

### Data Model Changes

**Remove from schema:**

```javascript
// DELETE these properties entirely
estimator.highlevel.byFeature = {}
estimator.highlevel.byMoscow = {}
```

**Updated schema:**

```javascript
estimator: {
  mode: 'detailed',  // Still toggles UI display between detailed grid and pivot tables

  params: {
    features: ['Field Service', 'Case Management'],
    phases: ['Phase-1', 'Phase-2'],
    poweredStages: { Vision: 12, Validate: 34, Construct: 36, Deploy: 10, Evolve: 8 },
    contingencyPct: 0.1,
    confidencePct: 1.0,
    changeManagementPct: 0.2,
    projectManagementPct: 0.2,
    integrationsCount: 0,
    migrationsCount: 0
  },

  requirements: [
    {
      id: 'req_abc123',
      name: 'Set up territory management',
      feature: 'Field Service',
      solutionTypes: ['Configuration', 'Customization'],
      complexity: 'Medium',
      moscow: 'Must',
      releasePhase: 'Phase-1'
    }
    // ... more requirements (single source of truth)
  ],

  highlevel: {},  // Keep as empty object or remove entirely

  summary: {
    totalDays: 0,
    byFeature: {},
    byStage: {},
    byRole: {},
    bySolutionType: {},
    byActivity: {}
  }
}
```

### UI Changes

#### By Feature Tab (Read-Only Pivot)

**Before:**
```
Feature          | Low | Medium | High | Total  | Actions
-----------------|-----|--------|------|--------|--------
Field Service    | [2] |  [3]   | [1]  | 6      | [×]
[+ Add Feature]
```

**After:**
```
Feature          | Low | Med | High | OOTB | Config | Custom | Integ | Migr | Total Effort (days)
-----------------|-----|-----|------|------|--------|--------|-------|------|--------------------
Field Service    |  2  |  3  |  1   |  0   |   4    |   2    |   0   |  0   |  145.2
Case Management  |  0  |  5  |  0   |  1   |   3    |   1    |   0   |  0   |   98.4
Integration      |  0  |  2  |  0   |  0   |   0    |   0    |   2   |  0   |   60.6
```

**Changes:**
- All cells are static text (no `<input>` elements)
- Added solution type breakdown columns (OOTB, Config, Custom, Integ, Migr)
- Removed "+ Add Feature" button
- Removed delete buttons
- Total Effort shows sum of calculated effort for all requirements with that feature

**Column Definitions:**

| Column | Calculation |
|--------|-------------|
| Feature | `requirements[].feature` (unique values) |
| Low | Count where `feature = X` AND `complexity = 'Low'` |
| Med | Count where `feature = X` AND `complexity = 'Medium'` |
| High | Count where `feature = X` AND `complexity = 'High'` |
| OOTB | Count where `feature = X` AND `solutionTypes` includes 'OOTB' |
| Config | Count where `feature = X` AND `solutionTypes` includes 'Configuration' |
| Custom | Count where `feature = X` AND `solutionTypes` includes 'Customization' |
| Integ | Count where `feature = X` AND `solutionTypes` includes 'Integration' |
| Migr | Count where `feature = X` AND `solutionTypes` includes 'Migration' |
| Total Effort | `Σ calculateRequirement(req)` where `req.feature = X` |

**Note:** Solution type counts can exceed complexity counts because a single requirement can have multiple solution types (e.g., Configuration + Customization = 2 types, 1 complexity).

#### By MoSCoW Tab (Read-Only Pivot)

**Before:**
```
Priority | Low | Medium | High | Total Effort (days) |
---------|-----|--------|------|---------------------|
Must     | [5] |  [8]   | [2]  | 245.6               |
```

**After:**
```
Priority | Low | Med | High |
---------|-----|-----|------|
Must     |  5  |  8  |  2   |
Should   |  2  |  3  |  0   |
Could    |  0  |  1  |  0   |
Won't    |  0  |  0  |  0   |
```

**Changes:**
- All cells are static text (no `<input>` elements)
- Removed "Total Effort (days)" column (MoSCoW doesn't affect effort calculation)
- Fixed 4 rows (standard MoSCoW framework)

**Column Definitions:**

| Column | Calculation |
|--------|-------------|
| Priority | Must / Should / Could / Won't (fixed rows) |
| Low | Count where `moscow = X` AND `complexity = 'Low'` |
| Med | Count where `moscow = X` AND `complexity = 'Medium'` |
| High | Count where `moscow = X` AND `complexity = 'High'` |

**Rationale for removing Total Effort:** MoSCoW priority is a prioritization dimension only. It does not affect BASE_HOURS lookup or multipliers. Showing effort by priority implies it matters for calculation, which is false.

### Calculation Engine Changes

**Remove from `estimatorEngine.js`:**

```javascript
// DELETE these functions
function calculateHighLevelCloud(highlevel, cloud) { ... }
function calculateHighLevelFeature(counts, params) { ... }
```

**Update `recalcSummary()`:**

Remove the `if (mode === 'highlevel')` branch entirely. Always calculate from `requirements[]` array.

**Before:**

```javascript
function recalcSummary(estimator) {
  if (estimator.mode === 'detailed') {
    // Calculate from requirements
  } else {
    // Calculate from highlevel.byFeature (REMOVE THIS)
  }
}
```

**After:**

```javascript
function recalcSummary(estimator) {
  var summary = {
    totalDays: 0,
    byFeature: {},
    byStage: {},
    byRole: {},
    bySolutionType: {},
    byActivity: {}
  };

  // ALWAYS iterate through detailed requirements
  // Mode toggle only affects UI display now
  estimator.requirements.forEach(function(req) {
    if (!req.solutionTypes || req.solutionTypes.length === 0 || !req.complexity) {
      return; // Skip incomplete requirements
    }

    var calc = calculateRequirement(req, estimator.params);

    summary.totalDays += calc.totalDays;

    // By Feature
    if (req.feature) {
      summary.byFeature[req.feature] = (summary.byFeature[req.feature] || 0) + calc.totalDays;
    }

    // By Stage
    for (var stage in calc.byStage) {
      if (calc.byStage.hasOwnProperty(stage)) {
        summary.byStage[stage] = (summary.byStage[stage] || 0) + calc.byStage[stage];
      }
    }

    // By Role
    for (var role in calc.byRole) {
      if (calc.byRole.hasOwnProperty(role)) {
        summary.byRole[role] = (summary.byRole[role] || 0) + calc.byRole[role];
      }
    }

    // By Solution Type (all types, not just primary)
    var types = req.solutionTypes || [];
    for (var t = 0; t < types.length; t++) {
      var type = types[t];
      if (type) {
        summary.bySolutionType[type] = (summary.bySolutionType[type] || 0) + calc.totalDays;
      }
    }

    // By Activity
    for (var activity in calc.byActivity) {
      if (calc.byActivity.hasOwnProperty(activity)) {
        summary.byActivity[activity] = (summary.byActivity[activity] || 0) + calc.byActivity[activity];
      }
    }
  });

  // Add integrations
  if (estimator.params.integrationsCount > 0) {
    var integrationCalc = calculateRequirement(
      { solutionTypes: ['Integration'], complexity: 'Medium', feature: 'Integration' },
      estimator.params
    );
    var count = estimator.params.integrationsCount;
    summary.totalDays += integrationCalc.totalDays * count;
    summary.byFeature.Integration = (summary.byFeature.Integration || 0) + integrationCalc.totalDays * count;
    summary.bySolutionType.Integration = (summary.bySolutionType.Integration || 0) + integrationCalc.totalDays * count;
    // ... (merge byActivity, byStage, byRole)
  }

  // Add migrations
  if (estimator.params.migrationsCount > 0) {
    var migrationCalc = calculateRequirement(
      { solutionTypes: ['Migration'], complexity: 'Medium', feature: 'Migration' },
      estimator.params
    );
    var count = estimator.params.migrationsCount;
    summary.totalDays += migrationCalc.totalDays * count;
    summary.byFeature.Migration = (summary.byFeature.Migration || 0) + migrationCalc.totalDays * count;
    summary.bySolutionType.Migration = (summary.bySolutionType.Migration || 0) + migrationCalc.totalDays * count;
    // ... (merge byActivity, byStage, byRole)
  }

  // Apply overheads (multiplicative)
  var overheadMultiplier = (1 + estimator.params.contingencyPct)
                         * (1 + estimator.params.projectManagementPct)
                         * (1 + estimator.params.changeManagementPct);

  summary.totalDays *= overheadMultiplier;

  for (var key in summary.byStage) {
    if (summary.byStage.hasOwnProperty(key)) {
      summary.byStage[key] *= overheadMultiplier;
    }
  }
  for (var key in summary.byRole) {
    if (summary.byRole.hasOwnProperty(key)) {
      summary.byRole[key] *= overheadMultiplier;
    }
  }
  for (var key in summary.bySolutionType) {
    if (summary.bySolutionType.hasOwnProperty(key)) {
      summary.bySolutionType[key] *= overheadMultiplier;
    }
  }

  // byFeature and byActivity remain base values (no overheads)

  return summary;
}
```

**Key change:** Removed conditional logic. Single calculation path regardless of mode.

### UI Implementation

#### renderFeatureMatrix()

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
        totalEffort: 0
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

    // Sum effort
    if (req.solutionTypes && req.solutionTypes.length > 0 && req.complexity) {
      var calc = PP.calculateRequirement(req, estimator.params);
      pivot[feature].totalEffort += calc.totalDays;
    }
  });

  var html = '<table class="highlevel-table">' +
      '<thead><tr>' +
      '<th>Feature</th>' +
      '<th style="width:60px">Low</th>' +
      '<th style="width:60px">Med</th>' +
      '<th style="width:60px">High</th>' +
      '<th style="width:60px">OOTB</th>' +
      '<th style="width:80px">Config</th>' +
      '<th style="width:80px">Custom</th>' +
      '<th style="width:70px">Integ</th>' +
      '<th style="width:60px">Migr</th>' +
      '<th style="width:140px">Total Effort (days)</th>' +
      '</tr></thead>' +
      '<tbody>';

  var features = Object.keys(pivot).sort();

  if (features.length === 0) {
    html += '<tr><td colspan="10" style="text-align:center;color:var(--text-secondary);">' +
        'No requirements yet. Switch to Detailed mode to add requirements.</td></tr>';
  } else {
    features.forEach(function(feature) {
      var data = pivot[feature];
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
          '<td style="text-align:right">' + data.totalEffort.toFixed(2) + '</td>' +
          '</tr>';
    });
  }

  html += '</tbody></table>';

  return html;
}
```

#### renderMoscowMatrix()

```javascript
function renderMoscowMatrix(estimator) {
  var priorities = ['Must', 'Should', 'Could', "Won't"];
  var pivot = {};

  priorities.forEach(function(p) {
    pivot[p] = { low: 0, medium: 0, high: 0 };
  });

  estimator.requirements.forEach(function(req) {
    var moscow = req.moscow || 'Must';
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
      '</tr></thead>' +
      '<tbody>';

  priorities.forEach(function(priority) {
    var counts = pivot[priority];
    html += '<tr>' +
        '<td>' + priority + '</td>' +
        '<td style="text-align:center">' + counts.low + '</td>' +
        '<td style="text-align:center">' + counts.medium + '</td>' +
        '<td style="text-align:center">' + counts.high + '</td>' +
        '</tr>';
  });

  html += '</tbody></table>';

  return html;
}
```

#### wireHighLevelGrid()

```javascript
function wireHighLevelGrid(state) {
  // Wire tab buttons (unchanged)
  var tabButtons = document.querySelectorAll('.hl-tab');
  tabButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      highlevelTab = btn.getAttribute('data-tab');
      PP.refresh();
    });
  });

  // REMOVE all input event listeners
  // No more:
  // - .hl-input change listeners
  // - .hl-input-moscow change listeners
  // - #hl-add-feature-btn click listener
  // - .hl-delete-feature click listeners
}
```

### Migration Strategy

**Existing projects with `highlevel.byFeature` data:**

No migration needed. Data is discarded.

**Rationale:**
- High-level counts were temporary inputs, not saved work
- Users can recreate requirements in detailed mode
- Pivot tables auto-generate from detailed data
- Migration complexity not justified for throwaway input data

**On project load:**

```javascript
// In Project.fromJSON()
if (json.estimator && json.estimator.highlevel) {
  // Clean up old structure
  delete json.estimator.highlevel.byFeature;
  delete json.estimator.highlevel.byMoscow;
}
```

### Summary Card Changes

**No changes to summary cards.** They already consume `summary.byFeature`, `summary.byStage`, etc., which are still calculated the same way (from detailed requirements).

Cards that display data in high-level mode:
1. ✓ Total Effort - works (from summary.totalDays)
2. ✓ By Feature - works (from summary.byFeature)
3. ✓ By Powered Stage - works (from summary.byStage)
4. ✓ By Role - works (from summary.byRole)
5. ✗ By Solution Type - correctly shows "No data" (bySolutionType empty in high-level)
6. ✓ By Activity - works (from summary.byActivity)

**Note:** "By Solution Type" showing "No data" is a separate issue (see commit 58635c3). Could be fixed by populating `summary.bySolutionType` from requirements in the updated `recalcSummary()`, but that's out of scope for this design.

## Testing Strategy

### Manual Browser Tests

1. **Empty project in high-level mode:**
   - Shows "No requirements yet" message
   - Both tabs display properly

2. **Switch to detailed, add requirements:**
   - Add 3 requirements with different features
   - Add 2 requirements with same feature, different complexity
   - Add 1 requirement with multiple solution types

3. **Switch back to high-level:**
   - By Feature tab shows correct counts
   - Complexity columns sum correctly
   - Solution type columns show multi-select counts
   - Total Effort matches summary card
   - By MoSCoW tab shows correct counts

4. **Verify read-only:**
   - No input fields visible
   - No "+ Add Feature" button
   - No delete buttons
   - Cannot edit any values

5. **Summary cards:**
   - Total Effort shows same in both modes
   - By Feature card matches Feature tab totals
   - Other breakdowns work correctly

### Edge Cases

**No requirements:**
- High-level mode shows empty state message
- Summary cards show 0 values

**Requirements without feature:**
- Show as "Unassigned" row in By Feature tab
- Use `req.feature || 'Unassigned'` in pivot logic
- Included in totals

**Requirements without MoSCoW:**
- Default to "Must" for counting in pivot
- Use `req.moscow || 'Must'` in pivot logic
- Keeps MoSCoW tab simple (4 fixed rows)

**Multiple solution types per requirement:**
- Solution type columns can sum higher than complexity columns
- Example: 1 requirement with [Config, Custom] = 1 complexity count, 2 solution type counts

**Integration/Migration params:**
- Show as separate features in By Feature tab
- Counted same as manual requirements

## Success Criteria

1. High-level mode displays read-only pivot tables (no inputs)
2. By Feature tab shows complexity + solution type breakdown
3. By MoSCoW tab shows complexity breakdown only (no effort)
4. Counts match detailed requirements exactly
5. Total Effort column sums correctly
6. No "+ Add Feature" button or delete buttons
7. Mode toggle still works (switches between detailed grid and pivot tables)
8. Summary cards work in both modes
9. No errors when loading old projects with `highlevel.byFeature` data
10. No `calculateHighLevelCloud` or `calculateHighLevelFeature` function calls remain

## Future Enhancements (Out of Scope)

- Click feature row to filter detailed requirements by that feature
- Export pivot table to CSV
- Add "Total" row at bottom of pivot tables
- Color-code cells by count thresholds
- Fix "By Solution Type" summary card to show data in high-level mode
- Add phase breakdown column to By Feature tab

## Approval

Design approved 2026-07-30. Ready for implementation planning.
