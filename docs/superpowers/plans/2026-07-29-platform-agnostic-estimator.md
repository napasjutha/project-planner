# Platform-Agnostic Estimator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Salesforce-specific estimator to be platform-agnostic with user-configurable features, phases, and powered stage distribution.

**Architecture:** Keep BASE_HOURS and COMPLEXITY_MULTIPLIER as universal constants. Make project-specific taxonomy (features, phases, powered stages) configurable in params. Auto-migrate existing Salesforce projects (Cloud→Feature). Multi-select solution types with primary-driven calculation.

**Tech Stack:** Vanilla JavaScript (ES5), UMD module pattern, no external dependencies

## Global Constraints

- Zero external dependencies (no npm packages, no CDN)
- Browser compatibility: ES5 syntax only (no arrow functions, const/let, template literals in production code)
- XSS safety: all user inputs escaped via `escapeHtml()` before `innerHTML`
- Build process: `python3 build.py` after every src/ change
- Test command: `node --test` (runs tests/ directory)
- All powered stage percentages must sum to 100%
- Solution types array: first element = primary for calculations
- Migration runs once on load, no backward compatibility code paths after migration

---

## Task 1: Data Model Schema & Migration Logic

**Files:**
- Modify: `src/js/store.js` (Project class schema and fromJSON)
- Test: Manual verification (no dedicated test file for store.js)

**Interfaces:**
- Consumes: None (foundation task)
- Produces:
  - `estimator.params.features` (array of strings)
  - `estimator.params.phases` (array of strings)
  - `estimator.params.poweredStages` (object: {Vision: number, Validate: number, ...})
  - `estimator.requirements[].feature` (string, from features array)
  - `estimator.requirements[].solutionTypes` (array, first = primary)
  - `estimator.highlevel.byFeature` (object: {featureName: {low, medium, high}})
  - `estimator.highlevel.byMoscow` (object: {Must/Should/Could/Won't: {low, medium, high}})
  - `migrateEstimatorToGeneric(estimator)` function

- [ ] **Step 1: Update Project.empty() with new schema**

In `src/js/store.js`, find the `Project.empty()` method where estimator is initialized. Replace the estimator initialization:

```javascript
estimator: {
  mode: 'detailed',
  params: {
    features: ['Field Service', 'Case Management', 'Reports & Dashboards'],
    phases: ['Phase-1', 'Phase-2', 'Phase-3', 'Phase-4', 'Deferred'],
    poweredStages: {
      Vision: 12,
      Validate: 34,
      Construct: 36,
      Deploy: 10,
      Evolve: 8
    },
    contingencyPct: 0.1,
    confidencePct: 1,
    changeManagementPct: 0.2,
    projectManagementPct: 0.2,
    integrationsCount: 0,
    migrationsCount: 0
  },
  requirements: [],
  highlevel: {
    byFeature: {},
    byMoscow: {
      Must: { low: 0, medium: 0, high: 0 },
      Should: { low: 0, medium: 0, high: 0 },
      Could: { low: 0, medium: 0, high: 0 },
      "Won't": { low: 0, medium: 0, high: 0 }
    }
  },
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

- [ ] **Step 2: Add migration function before Project class**

In `src/js/store.js`, add this function before the `Project` class definition:

```javascript
function migrateEstimatorToGeneric(estimator) {
  if (!estimator) return;

  var migrated = false;

  // Detect old schema: requirements have 'cloud' field
  if (estimator.requirements && estimator.requirements.some(function (r) { return r.cloud; })) {
    // Extract unique clouds → features
    var clouds = [];
    estimator.requirements.forEach(function (req) {
      if (req.cloud && clouds.indexOf(req.cloud) === -1) {
        clouds.push(req.cloud);
      }
    });

    // Set features from clouds or defaults
    if (!estimator.params) estimator.params = {};
    estimator.params.features = clouds.length > 0
      ? clouds
      : ['Field Service', 'Case Management', 'Reports & Dashboards'];

    // Map cloud → feature, solutionType → solutionTypes
    estimator.requirements.forEach(function (req) {
      if (req.cloud) {
        req.feature = req.cloud;
        delete req.cloud;
      }
      if (req.solutionType && !req.solutionTypes) {
        req.solutionTypes = [req.solutionType];
        delete req.solutionType;
      }
    });

    migrated = true;
  }

  // Set default phases if missing
  if (!estimator.params) estimator.params = {};
  if (!estimator.params.phases) {
    estimator.params.phases = ['Phase-1', 'Phase-2', 'Phase-3', 'Phase-4', 'Deferred'];
  }

  // Set default powered stages if missing
  if (!estimator.params.poweredStages) {
    estimator.params.poweredStages = {
      Vision: 12,
      Validate: 34,
      Construct: 36,
      Deploy: 10,
      Evolve: 8
    };
  }

  // Migrate high-level structure
  if (estimator.highlevel && !estimator.highlevel.byFeature) {
    estimator.highlevel.byFeature = {};

    // Convert old cloud-based counts to feature-based
    var validClouds = ['Sales', 'Service', 'Marketing', 'Community', 'Experience', 'CPQ', 'Integration', 'Migration'];
    validClouds.forEach(function (cloud) {
      if (estimator.highlevel[cloud]) {
        estimator.highlevel.byFeature[cloud] = estimator.highlevel[cloud];
        delete estimator.highlevel[cloud];
      }
    });

    // Initialize byMoscow if missing
    if (!estimator.highlevel.byMoscow) {
      estimator.highlevel.byMoscow = {
        Must: { low: 0, medium: 0, high: 0 },
        Should: { low: 0, medium: 0, high: 0 },
        Could: { low: 0, medium: 0, high: 0 },
        "Won't": { low: 0, medium: 0, high: 0 }
      };
    }

    migrated = true;
  }

  // Migrate summary if it has byCloud
  if (estimator.summary && estimator.summary.byCloud) {
    estimator.summary.byFeature = estimator.summary.byCloud;
    delete estimator.summary.byCloud;
  }
  if (estimator.summary && estimator.summary.byComponent) {
    estimator.summary.bySolutionType = estimator.summary.byComponent;
    delete estimator.summary.byComponent;
  }

  return migrated;
}
```

- [ ] **Step 3: Call migration in Project.fromJSON()**

In `src/js/store.js`, find the `Project.fromJSON()` method. After the line that assigns `project.estimator = json.estimator || ...`, add:

```javascript
// Migrate old Salesforce-specific schema to generic
if (project.estimator) {
  migrateEstimatorToGeneric(project.estimator);
}
```

- [ ] **Step 4: Test migration with old project data**

Create a test file `/tmp/old_estimator.json`:

```json
{
  "meta": {"name": "Test Migration", "savedBy": "Test", "savedAt": "2026-07-29T00:00:00Z"},
  "estimator": {
    "mode": "detailed",
    "params": {
      "contingencyPct": 0.1,
      "confidencePct": 1,
      "changeManagementPct": 0.2,
      "projectManagementPct": 0.2,
      "integrationsCount": 0,
      "migrationsCount": 0
    },
    "requirements": [
      {
        "id": "req_test1",
        "name": "Test requirement",
        "cloud": "Service",
        "feature": "Field Service",
        "solutionType": "Configuration",
        "complexity": "Medium",
        "moscow": "Must",
        "releasePhase": "Phase-1"
      }
    ],
    "highlevel": {
      "Sales": {"low": 1, "medium": 2, "high": 3},
      "Service": {"low": 0, "medium": 1, "high": 0}
    },
    "summary": {}
  },
  "tasks": [],
  "holidays": [],
  "picList": [],
  "billingMilestones": [],
  "snapshots": [],
  "issues": [],
  "auditLog": []
}
```

Run: Open browser DevTools console, paste:
```javascript
var oldData = /* paste JSON from above */;
var project = PP.Project.fromJSON(oldData);
console.log('Features:', project.estimator.params.features);
console.log('Phases:', project.estimator.params.phases);
console.log('Req feature:', project.estimator.requirements[0].feature);
console.log('Req solutionTypes:', project.estimator.requirements[0].solutionTypes);
console.log('High-level byFeature:', project.estimator.highlevel.byFeature);
console.log('High-level byMoscow:', project.estimator.highlevel.byMoscow);
```

Expected output:
```
Features: ["Service"]
Phases: ["Phase-1", "Phase-2", "Phase-3", "Phase-4", "Deferred"]
Req feature: "Service"
Req solutionTypes: ["Configuration"]
High-level byFeature: {Sales: {low: 1, medium: 2, high: 3}, Service: {low: 0, medium: 1, high: 0}}
High-level byMoscow: {Must: {low: 0, medium: 0, high: 0}, ...}
```

- [ ] **Step 5: Build and verify no errors**

Run: `python3 build.py`

Expected: "Built /Users/.../dist/ProjectPlanner.html" with no errors

- [ ] **Step 6: Commit**

```bash
git add src/js/store.js
git commit -m "feat(estimator): add generic schema and migration from Salesforce-specific data

- Add features, phases, poweredStages to params
- Change requirements.cloud → requirements.feature
- Change solutionType (string) → solutionTypes (array)
- Add highlevel.byFeature and byMoscow matrices
- Auto-migrate old projects on load (Cloud→Feature)
- Update summary: byCloud→byFeature, byComponent→bySolutionType"
```

---

## Task 2: Calculation Engine Refactor

**Files:**
- Modify: `src/js/estimatorEngine.js`
- Test: `tests/estimatorEngine.test.js`

**Interfaces:**
- Consumes:
  - `estimator.params.poweredStages` (object: {Vision: number, Validate: number, ...})
  - `estimator.requirements[].feature` (string)
  - `estimator.requirements[].solutionTypes` (array, first = primary)
  - `estimator.highlevel.byFeature` (object)
  - `estimator.highlevel.byMoscow` (object)
- Produces:
  - `calculateRequirement(req, params)` - updated signature
  - `recalcSummary(estimator)` - returns byFeature instead of byCloud

- [ ] **Step 1: Write failing test for configurable powered stages**

In `tests/estimatorEngine.test.js`, add at the end before the closing of the test suite:

```javascript
test('Uses configurable powered stages from params', function () {
  var estimator = {
    mode: 'detailed',
    requirements: [
      {
        solutionTypes: ['Configuration'],
        complexity: 'Medium',
        feature: 'Test Feature'
      }
    ],
    params: {
      poweredStages: { Vision: 20, Validate: 30, Construct: 30, Deploy: 15, Evolve: 5 },
      contingencyPct: 0.1,
      changeManagementPct: 0.2,
      projectManagementPct: 0.2,
      integrationsCount: 0,
      migrationsCount: 0
    }
  };

  var summary = PP.recalcSummary(estimator);
  var totalBase = summary.totalDays / 1.584; // Remove overheads

  // Verify custom distribution applied (20%, 30%, 30%, 15%, 5%)
  assert.ok(Math.abs((summary.byStage.Vision / 1.584) / totalBase - 0.20) < 0.01);
  assert.ok(Math.abs((summary.byStage.Validate / 1.584) / totalBase - 0.30) < 0.01);
  assert.ok(Math.abs((summary.byStage.Construct / 1.584) / totalBase - 0.30) < 0.01);
});
```

- [ ] **Step 2: Write failing test for multi-select solution types**

In `tests/estimatorEngine.test.js`, add:

```javascript
test('Uses primary solution type (first in array) for calculation', function () {
  var req = {
    solutionTypes: ['Configuration', 'Customization'],
    complexity: 'Medium',
    feature: 'Test Feature'
  };
  var params = {
    poweredStages: { Vision: 12, Validate: 34, Construct: 36, Deploy: 10, Evolve: 8 }
  };

  var calc = PP.calculateRequirement(req, params);

  // Should use Configuration base hours (57 * 1.21 / 8 = 8.62125), not Customization
  assert.ok(Math.abs(calc.totalDays - 8.62125) < 0.01);
});
```

- [ ] **Step 3: Write failing test for byFeature instead of byCloud**

In `tests/estimatorEngine.test.js`, add:

```javascript
test('Summary includes byFeature instead of byCloud', function () {
  var estimator = {
    mode: 'detailed',
    requirements: [
      { solutionTypes: ['Configuration'], complexity: 'Medium', feature: 'Field Service' },
      { solutionTypes: ['OOTB'], complexity: 'Low', feature: 'Reports' }
    ],
    params: {
      poweredStages: { Vision: 12, Validate: 34, Construct: 36, Deploy: 10, Evolve: 8 },
      contingencyPct: 0,
      changeManagementPct: 0,
      projectManagementPct: 0,
      integrationsCount: 0,
      migrationsCount: 0
    }
  };

  var summary = PP.recalcSummary(estimator);

  assert.ok(summary.byFeature);
  assert.ok(summary.byFeature['Field Service'] > 0);
  assert.ok(summary.byFeature['Reports'] > 0);
  assert.ok(!summary.byCloud); // Should not exist
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `node --test`

Expected: 3 new tests FAIL (powered stages, multi-select, byFeature)

- [ ] **Step 5: Update calculateRequirement signature**

In `src/js/estimatorEngine.js`, find the `calculateRequirement` function. Change signature from:

```javascript
function calculateRequirement(req) {
```

To:

```javascript
function calculateRequirement(req, params) {
```

- [ ] **Step 6: Use primary solution type from array**

In `calculateRequirement`, find the line:

```javascript
var baseHours = BASE_HOURS[req.solutionType];
```

Replace with:

```javascript
// Use primary solution type (first in array)
var primaryType = req.solutionTypes ? req.solutionTypes[0] : req.solutionType;
var baseHours = BASE_HOURS[primaryType];
```

- [ ] **Step 7: Use configurable powered stages**

In `calculateRequirement`, find the section that distributes across Powered Stages (around line 110):

```javascript
// Distribute across Powered Stages
var byStage = {};
var stages = ['Vision', 'Validate', 'Construct', 'Deploy', 'Evolve'];
for (var i = 0; i < stages.length; i++) {
  var stage = stages[i];
  byStage[stage] = totalDays * POWERED_STAGES[stage];
}
```

Replace with:

```javascript
// Distribute across Powered Stages using configurable percentages
var byStage = {};
var stageDistribution = params && params.poweredStages ? params.poweredStages : POWERED_STAGES;
var stages = ['Vision', 'Validate', 'Construct', 'Deploy', 'Evolve'];
for (var i = 0; i < stages.length; i++) {
  var stage = stages[i];
  var percentage = stageDistribution[stage] || POWERED_STAGES[stage];
  byStage[stage] = totalDays * (percentage / 100);
}
```

- [ ] **Step 8: Update recalcSummary to use byFeature**

In `src/js/estimatorEngine.js`, find the `recalcSummary` function. Find the section that builds byCloud:

```javascript
var summary = {
  totalDays: 0,
  byCloud: {},
  byStage: {},
  byRole: {},
  byComponent: {},
  byActivity: {}
};
```

Replace with:

```javascript
var summary = {
  totalDays: 0,
  byFeature: {},
  byStage: {},
  byRole: {},
  bySolutionType: {},
  byActivity: {}
};
```

- [ ] **Step 9: Update detailed mode to aggregate by feature**

In `recalcSummary`, find the detailed mode loop (around line 200):

```javascript
if (estimator.mode === 'detailed') {
  for (var i = 0; i < estimator.requirements.length; i++) {
    var req = estimator.requirements[i];
    var calc = calculateRequirement(req);
```

Change the call to:

```javascript
var calc = calculateRequirement(req, estimator.params);
```

Then find where it accumulates byCloud:

```javascript
// By Cloud
if (req.cloud) {
  summary.byCloud[req.cloud] = (summary.byCloud[req.cloud] || 0) + calc.totalDays;
}
```

Replace with:

```javascript
// By Feature
if (req.feature) {
  summary.byFeature[req.feature] = (summary.byFeature[req.feature] || 0) + calc.totalDays;
}
```

- [ ] **Step 10: Update high-level mode to use byFeature**

In `recalcSummary`, find the high-level mode section (around line 240). Replace the clouds array:

```javascript
var clouds = ['Sales', 'Service', 'Marketing', 'Community', 'Experience', 'CPQ', 'Integration', 'Migration'];
for (var i = 0; i < clouds.length; i++) {
  var cloud = clouds[i];
  var calc = calculateHighLevelCloud(estimator.highlevel, cloud);
```

With:

```javascript
// High-level by feature
if (estimator.highlevel.byFeature) {
  for (var feature in estimator.highlevel.byFeature) {
    if (estimator.highlevel.byFeature.hasOwnProperty(feature)) {
      var counts = estimator.highlevel.byFeature[feature];
      var calc = calculateHighLevelFeature(counts, estimator.params);

      summary.totalDays += calc.totalDays;
      summary.byFeature[feature] = calc.totalDays;

      // Merge byStage, byRole, byActivity, bySolutionType
      for (var stage in calc.byStage) {
        if (calc.byStage.hasOwnProperty(stage)) {
          summary.byStage[stage] = (summary.byStage[stage] || 0) + calc.byStage[stage];
        }
      }
      for (var role in calc.byRole) {
        if (calc.byRole.hasOwnProperty(role)) {
          summary.byRole[role] = (summary.byRole[role] || 0) + calc.byRole[role];
        }
      }
      for (var activity in calc.byActivity) {
        if (calc.byActivity.hasOwnProperty(activity)) {
          summary.byActivity[activity] = (summary.byActivity[activity] || 0) + calc.byActivity[activity];
        }
      }

      summary.bySolutionType.Configuration = (summary.bySolutionType.Configuration || 0) + calc.totalDays;
    }
  }
}
```

- [ ] **Step 11: Add calculateHighLevelFeature function**

In `src/js/estimatorEngine.js`, after the `calculateHighLevelCloud` function, add:

```javascript
function calculateHighLevelFeature(counts, params) {
  if (!counts) {
    return { totalDays: 0, byActivity: {}, byStage: {}, byRole: {} };
  }

  var result = { totalDays: 0, byActivity: {}, byStage: {}, byRole: {} };

  // Use Configuration as default solution type for high-level
  var complexities = ['Low', 'Medium', 'High'];
  for (var i = 0; i < complexities.length; i++) {
    var complexity = complexities[i];
    var count = counts[complexity.toLowerCase()] || 0;
    if (count === 0) continue;

    var calc = calculateRequirement(
      { solutionTypes: ['Configuration'], complexity: complexity, feature: 'HighLevel' },
      params
    );

    result.totalDays += calc.totalDays * count;

    // Merge byActivity
    for (var activity in calc.byActivity) {
      if (calc.byActivity.hasOwnProperty(activity)) {
        result.byActivity[activity] = (result.byActivity[activity] || 0) + calc.byActivity[activity] * count;
      }
    }

    // Merge byStage
    for (var stage in calc.byStage) {
      if (calc.byStage.hasOwnProperty(stage)) {
        result.byStage[stage] = (result.byStage[stage] || 0) + calc.byStage[stage] * count;
      }
    }

    // Merge byRole
    for (var role in calc.byRole) {
      if (calc.byRole.hasOwnProperty(role)) {
        result.byRole[role] = (result.byRole[role] || 0) + calc.byRole[role] * count;
      }
    }
  }

  return result;
}
```

- [ ] **Step 12: Update integrations and migrations to use params**

In `recalcSummary`, find the integrations section (around line 275):

```javascript
if (estimator.params.integrationsCount > 0) {
  var integrationCalc = calculateRequirement({ solutionType: 'Integration', complexity: 'Medium' });
```

Change to:

```javascript
if (estimator.params.integrationsCount > 0) {
  var integrationCalc = calculateRequirement(
    { solutionTypes: ['Integration'], complexity: 'Medium', feature: 'Integration' },
    estimator.params
  );
```

Do the same for migrations (around line 300):

```javascript
if (estimator.params.migrationsCount > 0) {
  var migrationCalc = calculateRequirement(
    { solutionTypes: ['Migration'], complexity: 'Medium', feature: 'Migration' },
    estimator.params
  );
```

- [ ] **Step 13: Rename byComponent to bySolutionType**

In `recalcSummary`, find all references to `byComponent` and replace with `bySolutionType`:

```javascript
// Change this
summary.byComponent.Integration = (summary.byComponent.Integration || 0) + integrationCalc.totalDays * count;

// To this
summary.bySolutionType.Integration = (summary.bySolutionType.Integration || 0) + integrationCalc.totalDays * count;
```

Do the same for migrations and the overhead application loop.

- [ ] **Step 14: Export new function**

At the bottom of `src/js/estimatorEngine.js`, find the return statement:

```javascript
return {
  COMPLEXITY_MULTIPLIER: COMPLEXITY_MULTIPLIER,
  BASE_HOURS: BASE_HOURS,
  POWERED_STAGES: POWERED_STAGES,
  ROLE_ALLOCATION_BY_STAGE: ROLE_ALLOCATION_BY_STAGE,
  generateRequirementId: generateRequirementId,
  calculateRequirement: calculateRequirement,
  calculateHighLevelCloud: calculateHighLevelCloud,
  recalcSummary: recalcSummary
};
```

Add `calculateHighLevelFeature`:

```javascript
return {
  COMPLEXITY_MULTIPLIER: COMPLEXITY_MULTIPLIER,
  BASE_HOURS: BASE_HOURS,
  POWERED_STAGES: POWERED_STAGES,
  ROLE_ALLOCATION_BY_STAGE: ROLE_ALLOCATION_BY_STAGE,
  generateRequirementId: generateRequirementId,
  calculateRequirement: calculateRequirement,
  calculateHighLevelCloud: calculateHighLevelCloud,
  calculateHighLevelFeature: calculateHighLevelFeature,
  recalcSummary: recalcSummary
};
```

- [ ] **Step 15: Run tests to verify they pass**

Run: `node --test`

Expected: All tests PASS (including 3 new tests)

- [ ] **Step 16: Build**

Run: `python3 build.py`

Expected: "Built /Users/.../dist/ProjectPlanner.html"

- [ ] **Step 17: Commit**

```bash
git add src/js/estimatorEngine.js tests/estimatorEngine.test.js
git commit -m "feat(estimator): use configurable powered stages and primary solution type

- calculateRequirement now accepts params for powered stage percentages
- Use first element of solutionTypes array as primary for BASE_HOURS lookup
- Replace byCloud with byFeature in summary
- Rename byComponent to bySolutionType
- Add calculateHighLevelFeature for feature-based high-level mode
- All tests passing"
```

---

## Task 3: Parameters UI Section

**Files:**
- Modify: `src/js/ui/estimator.js` (renderHeader, wireHeader functions)

**Interfaces:**
- Consumes:
  - `estimator.params.features` (array)
  - `estimator.params.phases` (array)
  - `estimator.params.poweredStages` (object)
- Produces:
  - Parameters section UI with features/phases chips and powered stage inputs
  - Add/delete feature/phase functionality
  - Powered stage validation (sum = 100%)

- [ ] **Step 1: Update renderHeader to show expandable parameters**

In `src/js/ui/estimator.js`, find the `renderHeader` function (around line 16). Replace the entire function with:

```javascript
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
```

- [ ] **Step 2: Add renderParams function**

In `src/js/ui/estimator.js`, after `renderHeader`, add:

```javascript
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
```

- [ ] **Step 3: Update wireHeader to handle parameters**

In `src/js/ui/estimator.js`, find the `wireHeader` function. Add at the end before the closing brace:

```javascript
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
```

- [ ] **Step 4: Add wireParams function**

In `src/js/ui/estimator.js`, after `wireHeader`, add:

```javascript
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
```

- [ ] **Step 5: Add CSS for parameters section**

In `src/css/theme.css`, add at the end:

```css
.estimator-header-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.estimator-params {
  margin-top: 16px;
  padding: 16px;
  background: var(--surface-alt);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.param-section {
  margin-bottom: 16px;
}

.param-section:last-child {
  margin-bottom: 0;
}

.param-section h4 {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.chip-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 12px;
}

.chip-delete {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0 2px;
  font-size: 16px;
  line-height: 1;
}

.chip-delete:hover {
  color: var(--danger);
}

.chip-add {
  padding: 4px 8px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
}

.powered-stages-inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.powered-stages-inputs.invalid {
  border: 1px solid var(--danger);
  padding: 8px;
  border-radius: var(--radius-md);
}

.ps-input {
  width: 60px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.ps-sum {
  margin-left: auto;
  font-weight: 600;
}

.ps-sum.valid {
  color: var(--success);
}

.ps-sum.invalid {
  color: var(--danger);
}

.param-input {
  width: 80px;
  padding: 4px;
  margin-left: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 6: Build and test parameters UI**

Run: `python3 build.py`

Expected: No errors

Manual test in browser:
1. Open estimator tab
2. Click "Show Parameters"
3. Add a feature → chip appears
4. Delete feature → prompts if in use
5. Adjust powered stage to make sum ≠ 100% → red border, invalid message
6. Adjust to sum = 100% → green checkmark

- [ ] **Step 7: Commit**

```bash
git add src/js/ui/estimator.js src/css/theme.css
git commit -m "feat(estimator): add configurable parameters UI section

- Expandable parameters section with Show/Hide toggle
- Features and phases management (chips with add/delete)
- Powered stage distribution inputs with validation (must sum to 100%)
- Overhead and context parameter inputs
- Live sync: deleting feature/phase checks if in use
- Visual feedback for powered stage validation"
```

---

## Task 4: Requirements Grid Updates

**Files:**
- Modify: `src/js/ui/estimator.js` (renderDetailedGrid, wireDetailedGrid functions)

**Interfaces:**
- Consumes:
  - `estimator.params.features` (array for dropdown)
  - `estimator.params.phases` (array for dropdown)
  - `estimator.requirements[].feature` (string)
  - `estimator.requirements[].solutionTypes` (array)
- Produces:
  - Updated requirements table (remove Cloud, add Feature dropdown, multi-select Solution Type)
  - Hybrid add for features (type new → auto-add to params)

- [ ] **Step 1: Update renderDetailedGrid columns**

In `src/js/ui/estimator.js`, find `renderDetailedGrid` function (around line 152). Replace the table header:

```javascript
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
```

- [ ] **Step 2: Update requirement row rendering**

In `renderDetailedGrid`, find the loop that builds requirement rows (around line 175). Replace each row with:

```javascript
requirements.forEach(function (req, index) {
  var calc = PP.calculateRequirement(req, estimator.params);

  html += '<tr data-req-id="' + req.id + '">' +
    '<td>' + (index + 1) + '</td>' +
    '<td><input type="text" class="req-name" value="' + escapeHtml(req.name || '') + '" placeholder="Requirement name"></td>' +

    // Feature dropdown (from params)
    '<td><select class="req-feature">' +
      '<option value="">-</option>';

  estimator.params.features.forEach(function (feature) {
    html += '<option value="' + escapeHtml(feature) + '"' + (req.feature === feature ? ' selected' : '') + '>' + escapeHtml(feature) + '</option>';
  });

  html += '</select></td>' +

    // Solution Type multi-select (show as text for now, will add multi-select in next step)
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
```

- [ ] **Step 3: Add solution type multi-select modal**

In `src/js/ui/estimator.js`, add this helper function before `renderDetailedGrid`:

```javascript
function renderSolutionTypeModal(req, state) {
  var types = ['OOTB', 'Configuration', 'Customization', 'Integration', 'Migration'];
  var selected = req.solutionTypes || [];

  var html = '<div class="modal-overlay" id="solution-type-modal">' +
    '<div class="modal-content">' +
      '<h3>Select Solution Types</h3>' +
      '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">First selected type is primary (used for calculations)</p>' +
      '<div class="solution-type-checkboxes">';

  types.forEach(function (type) {
    var checked = selected.includes(type);
    var isPrimary = selected[0] === type;
    html += '<label class="solution-type-option' + (isPrimary ? ' primary' : '') + '">' +
      '<input type="checkbox" value="' + type + '"' + (checked ? ' checked' : '') + '>' +
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
```

- [ ] **Step 4: Wire solution type cell clicks**

In `wireDetailedGrid`, after wiring other inputs, add:

```javascript
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

    // Wire save button
    document.getElementById('solution-type-save').addEventListener('click', function () {
      var checkboxes = document.querySelectorAll('.solution-type-checkboxes input[type="checkbox"]');
      var newTypes = [];
      checkboxes.forEach(function (cb) {
        if (cb.checked) {
          newTypes.push(cb.value);
        }
      });

      if (newTypes.length === 0) {
        alert('Please select at least one solution type');
        return;
      }

      state.project._pushUndo();
      req.solutionTypes = newTypes;
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
```

- [ ] **Step 5: Add hybrid feature input handling**

In `wireDetailedGrid`, find where feature dropdown is wired (or add if missing):

```javascript
// Wire feature dropdowns with hybrid add
tbody.addEventListener('change', function (e) {
  if (e.target.classList.contains('req-feature')) {
    var row = e.target.closest('tr');
    var reqId = row.getAttribute('data-req-id');
    var req = estimator.requirements.find(function (r) { return r.id === reqId; });

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
  }
});
```

- [ ] **Step 6: Add CSS for solution type modal**

In `src/css/theme.css`, add:

```css
.solution-types-cell {
  cursor: pointer;
  padding: 4px;
  min-height: 30px;
}

.solution-types-cell:hover {
  background: var(--surface-alt);
}

.solution-type-primary {
  font-weight: 600;
  margin-bottom: 2px;
}

.solution-type-tags {
  font-size: 11px;
  color: var(--text-secondary);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--surface);
  padding: 24px;
  border-radius: var(--radius-lg);
  min-width: 400px;
  max-width: 600px;
}

.modal-content h3 {
  margin: 0 0 8px 0;
}

.solution-type-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.solution-type-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.solution-type-option.primary {
  background: var(--primary-light);
  border-color: var(--primary);
}

.solution-type-option input {
  cursor: pointer;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.modal-actions button {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

#solution-type-save {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
```

- [ ] **Step 7: Build and test**

Run: `python3 build.py`

Manual test:
1. Add requirement
2. Select feature from dropdown → saves
3. Type new feature name in feature dropdown → auto-adds to params
4. Click solution type cell → modal opens
5. Select multiple types → first is marked [Primary]
6. Save → updates display

- [ ] **Step 8: Commit**

```bash
git add src/js/ui/estimator.js src/css/theme.css
git commit -m "feat(estimator): update requirements grid with feature and multi-select solution types

- Remove Cloud column
- Add Feature dropdown from params.features
- Hybrid add: typing new feature auto-adds to params
- Multi-select Solution Type with modal picker
- First selected type = primary (bold, [Primary] label)
- Phase dropdown from params.phases
- All dropdowns trigger recalc on change"
```

---

## Task 5: High-Level Mode Refactor

**Files:**
- Modify: `src/js/ui/estimator.js` (renderHighLevelGrid, wireHighLevelGrid functions)

**Interfaces:**
- Consumes:
  - `estimator.highlevel.byFeature` (object)
  - `estimator.highlevel.byMoscow` (object)
  - `estimator.params.features` (array)
- Produces:
  - Two-tab high-level UI (By Feature, By MoSCoW)
  - Dynamic feature rows with add/delete
  - Live sync with params.features

- [ ] **Step 1: Add high-level tab state variable**

In `src/js/ui/estimator.js`, at the top with other module variables (around line 10), add:

```javascript
var highlevelTab = 'feature'; // 'feature' or 'moscow'
```

- [ ] **Step 2: Rewrite renderHighLevelGrid with tabs**

In `src/js/ui/estimator.js`, replace the entire `renderHighLevelGrid` function:

```javascript
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
```

- [ ] **Step 3: Add renderFeatureMatrix function**

After `renderHighLevelGrid`, add:

```javascript
function renderFeatureMatrix(estimator) {
  var html = '<table class="highlevel-table">' +
    '<thead><tr>' +
      '<th>Feature</th>' +
      '<th style="width:100px">Low</th>' +
      '<th style="width:100px">Medium</th>' +
      '<th style="width:100px">High</th>' +
      '<th style="width:100px">Total</th>' +
      '<th style="width:60px"></th>' +
    '</tr></thead>' +
    '<tbody>';

  if (!estimator.highlevel.byFeature) {
    estimator.highlevel.byFeature = {};
  }

  var features = Object.keys(estimator.highlevel.byFeature);

  features.forEach(function (feature) {
    var counts = estimator.highlevel.byFeature[feature];
    var total = counts.low + counts.medium + counts.high;

    html += '<tr data-feature="' + escapeHtml(feature) + '">' +
      '<td>' + escapeHtml(feature) + '</td>' +
      '<td><input type="number" class="hl-input" data-feature="' + escapeHtml(feature) + '" data-complexity="low" value="' + counts.low + '" min="0"></td>' +
      '<td><input type="number" class="hl-input" data-feature="' + escapeHtml(feature) + '" data-complexity="medium" value="' + counts.medium + '" min="0"></td>' +
      '<td><input type="number" class="hl-input" data-feature="' + escapeHtml(feature) + '" data-complexity="high" value="' + counts.high + '" min="0"></td>' +
      '<td style="text-align:right">' + total + '</td>' +
      '<td><button class="hl-delete-feature" data-feature="' + escapeHtml(feature) + '">&times;</button></td>' +
    '</tr>';
  });

  html += '</tbody></table>' +
    '<button id="hl-add-feature-btn" style="margin-top:8px">+ Add Feature</button>';

  return html;
}
```

- [ ] **Step 4: Add renderMoscowMatrix function**

After `renderFeatureMatrix`, add:

```javascript
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
      '<th style="width:100px">Total</th>' +
    '</tr></thead>' +
    '<tbody>';

  var priorities = ['Must', 'Should', 'Could', "Won't"];

  priorities.forEach(function (priority) {
    var counts = estimator.highlevel.byMoscow[priority];
    var total = counts.low + counts.medium + counts.high;

    html += '<tr>' +
      '<td>' + priority + '</td>' +
      '<td><input type="number" class="hl-input-moscow" data-moscow="' + priority + '" data-complexity="low" value="' + counts.low + '" min="0"></td>' +
      '<td><input type="number" class="hl-input-moscow" data-moscow="' + priority + '" data-complexity="medium" value="' + counts.medium + '" min="0"></td>' +
      '<td><input type="number" class="hl-input-moscow" data-moscow="' + priority + '" data-complexity="high" value="' + counts.high + '" min="0"></td>' +
      '<td style="text-align:right">' + total + '</td>' +
    '</tr>';
  });

  html += '</tbody></table>';

  return html;
}
```

- [ ] **Step 5: Rewrite wireHighLevelGrid**

Replace the entire `wireHighLevelGrid` function:

```javascript
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
```

- [ ] **Step 6: Add CSS for high-level tabs**

In `src/css/theme.css`, add:

```css
.highlevel-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--border);
}

.hl-tab {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: -2px;
}

.hl-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 600;
}

.highlevel-table {
  width: 100%;
  border-collapse: collapse;
}

.highlevel-table th,
.highlevel-table td {
  padding: 8px;
  border: 1px solid var(--border);
}

.highlevel-table input {
  width: 100%;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.hl-delete-feature {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
}

.hl-delete-feature:hover {
  color: var(--danger);
}
```

- [ ] **Step 7: Build and test**

Run: `python3 build.py`

Manual test:
1. Switch to high-level mode
2. Click "By Feature" tab → shows feature matrix
3. Click "By MoSCoW" tab → shows priority matrix
4. Add feature → appears in matrix and params
5. Delete feature → prompts confirmation, removes from matrix
6. Enter counts → recalculates totals

- [ ] **Step 8: Commit**

```bash
git add src/js/ui/estimator.js src/css/theme.css
git commit -m "feat(estimator): refactor high-level mode with feature and MoSCoW tabs

- Replace single cloud matrix with two tabs: By Feature, By MoSCoW
- By Feature tab: dynamic rows from params.features, add/delete buttons
- By MoSCoW tab: fixed rows (Must/Should/Could/Won't)
- Live sync: adding feature in matrix adds to params
- Row totals calculated and displayed"
```

---

## Task 6: Summary Cards Update

**Files:**
- Modify: `src/js/ui/estimator.js` (renderSummary function)

**Interfaces:**
- Consumes:
  - `summary.byFeature` (object)
  - `summary.bySolutionType` (object, renamed from byComponent)
- Produces:
  - Updated summary cards: "By Feature" replaces "By Cloud", "By Solution Type" replaces "By Component Type"

- [ ] **Step 1: Update renderSummary card titles and data sources**

In `src/js/ui/estimator.js`, find the `renderSummary` function (around line 364). Find the section that renders breakdown tables:

```javascript
? renderBreakdownTable('By Cloud', summary.byCloud) +
  renderBreakdownTable('By Powered Stage', summary.byStage) +
  renderBreakdownTable('By Role', summary.byRole) +
  renderBreakdownTable('By Solution Type', summary.byComponent) +
  renderBreakdownTable('By Activity', summary.byActivity)
```

Replace with:

```javascript
? renderBreakdownTable('By Feature', summary.byFeature) +
  renderBreakdownTable('By Powered Stage', summary.byStage) +
  renderBreakdownTable('By Role', summary.byRole) +
  renderBreakdownTable('By Solution Type', summary.bySolutionType) +
  renderBreakdownTable('By Activity', summary.byActivity)
```

- [ ] **Step 2: Update chart view categories**

In `src/js/ui/estimator.js`, find the `renderChartView` function (around line 393). Update the legend buttons:

```javascript
'<div class="chart-legend" style="margin-bottom:16px">' +
  '<button class="legend-btn ' + (chartCategory === 'byFeature' ? 'active' : '') + '" data-category="byFeature">Feature</button>' +
  '<button class="legend-btn ' + (chartCategory === 'byStage' ? 'active' : '') + '" data-category="byStage">Powered Stage</button>' +
  '<button class="legend-btn ' + (chartCategory === 'byRole' ? 'active' : '') + '" data-category="byRole">Role</button>' +
  '<button class="legend-btn ' + (chartCategory === 'bySolutionType' ? 'active' : '') + '" data-category="bySolutionType">Solution Type</button>' +
  '<button class="legend-btn ' + (chartCategory === 'byActivity' ? 'active' : '') + '" data-category="byActivity">Activity</button>' +
'</div>' +
```

- [ ] **Step 3: Update default chart category**

At the top of `src/js/ui/estimator.js` with other module variables, find:

```javascript
var chartCategory = 'byCloud';
```

Change to:

```javascript
var chartCategory = 'byFeature';
```

- [ ] **Step 4: Build and test**

Run: `python3 build.py`

Manual test:
1. Open estimator tab with requirements
2. Check summary section
3. Verify "By Feature" card shows feature breakdown
4. Verify "By Solution Type" card shows solution type breakdown
5. Switch to chart view
6. Verify "Feature" button shows feature chart
7. Verify "Solution Type" button shows solution type chart

- [ ] **Step 5: Commit**

```bash
git add src/js/ui/estimator.js
git commit -m "feat(estimator): update summary cards with feature and solution type breakdowns

- Replace 'By Cloud' with 'By Feature' card
- Rename 'By Component Type' to 'By Solution Type'
- Update chart view categories to match new breakdowns
- Default chart category now byFeature instead of byCloud"
```

---

## Task 7: CSV Import/Export Update

**Files:**
- Modify: `src/js/ui/estimator.js` (handleCSVImport, exportCSV functions)

**Interfaces:**
- Consumes:
  - CSV with Feature, Solution Types (pipe-delimited), Phase columns
- Produces:
  - Updated CSV format with multi-select solution types
  - Auto-add features/phases on import

- [ ] **Step 1: Update CSV export format**

In `src/js/ui/estimator.js`, find the `exportCSV` function (around line 95). Update the header row:

```javascript
var csv = '# PARAMS: contingency=' + (params.contingencyPct * 100) + ',confidence=' + (params.confidencePct * 100) +
  ',changeManagement=' + (params.changeManagementPct * 100) + ',projectManagement=' + (params.projectManagementPct * 100) +
  ',integrations=' + params.integrationsCount + ',migrations=' + params.migrationsCount + '\n';

csv += 'Requirement,Feature,Solution Types,Complexity,MoSCoW,Release Phase\n';
```

- [ ] **Step 2: Update CSV export row data**

In the export loop, replace the row building:

```javascript
requirements.forEach(function (req) {
  var row = [
    req.name || '',
    req.feature || '',
    (req.solutionTypes || []).join('|'),  // Pipe-delimited
    req.complexity || '',
    req.moscow || '',
    req.releasePhase || ''
  ];
  csv += row.map(function (cell) {
    var str = String(cell);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }).join(',') + '\n';
});
```

- [ ] **Step 3: Update CSV import parsing**

In `handleCSVImport`, find the section that parses CSV rows (around line 120). Update the parsing logic:

```javascript
var headerRowIndex = -1;
for (var i = 0; i < rows.length; i++) {
  var cells = rows[i];
  if (cells[0] === 'Requirement' || cells[0] === 'requirement') {
    headerRowIndex = i;
    break;
  }
}

if (headerRowIndex === -1) {
  alert('Invalid CSV: missing header row (Requirement,Feature,Solution Types,...)');
  return;
}

var dataRows = rows.slice(headerRowIndex + 1);
var requirements = [];

dataRows.forEach(function (cells, idx) {
  if (cells.length < 2 || !cells[0]) return; // Skip empty rows

  // Parse solution types (pipe-delimited)
  var solutionTypesStr = cells[2] || '';
  var solutionTypes = solutionTypesStr.split('|').map(function (s) { return s.trim(); }).filter(Boolean);

  if (solutionTypes.length === 0) {
    solutionTypes = ['Configuration']; // Default
  }

  var req = {
    id: PP.generateRequirementId(),
    name: cells[0],
    feature: cells[1] || '',
    solutionTypes: solutionTypes,
    complexity: cells[3] || '',
    moscow: cells[4] || '',
    releasePhase: cells[5] || ''
  };

  // Auto-add feature to params if not exists
  if (req.feature && !estimator.params.features.includes(req.feature)) {
    estimator.params.features.push(req.feature);

    // Initialize in high-level
    if (!estimator.highlevel.byFeature) {
      estimator.highlevel.byFeature = {};
    }
    estimator.highlevel.byFeature[req.feature] = { low: 0, medium: 0, high: 0 };
  }

  // Auto-add phase to params if not exists
  if (req.releasePhase && !estimator.params.phases.includes(req.releasePhase)) {
    estimator.params.phases.push(req.releasePhase);
  }

  requirements.push(req);
});
```

- [ ] **Step 4: Create test CSV file**

Create `/tmp/test_import.csv`:

```csv
# PARAMS: contingency=10,confidence=100,changeManagement=20,projectManagement=20,integrations=0,migrations=0
Requirement,Feature,Solution Types,Complexity,MoSCoW,Release Phase
Territory setup,Field Service,Configuration|Customization,Medium,Must,Phase-1
User permissions,Security,OOTB,Low,Must,Phase-1
Custom reports,Reporting,Customization,High,Should,Phase-2
API integration,Integration,Integration,Medium,Must,Phase-1
```

- [ ] **Step 5: Test import**

Run: `python3 build.py`

Manual test:
1. Open estimator in browser
2. Click "Import CSV"
3. Select `/tmp/test_import.csv`
4. Verify 4 requirements imported
5. Check first requirement: solutionTypes = ['Configuration', 'Customization']
6. Check params.features includes: Field Service, Security, Reporting, Integration
7. Check params.phases includes: Phase-1, Phase-2

- [ ] **Step 6: Test export**

Manual test:
1. With imported requirements, click "Export CSV"
2. Open exported file
3. Verify header: `Requirement,Feature,Solution Types,Complexity,MoSCoW,Release Phase`
4. Verify first row: `Territory setup,Field Service,Configuration|Customization,Medium,Must,Phase-1`

- [ ] **Step 7: Commit**

```bash
git add src/js/ui/estimator.js
git commit -m "feat(estimator): update CSV import/export for new schema

- Export: Solution Types column is pipe-delimited (first = primary)
- Export: Feature column replaces Cloud
- Import: Parse pipe-delimited solution types into array
- Import: Auto-add features to params.features if not exists
- Import: Auto-add phases to params.phases if not exists
- Updated header format and parsing logic"
```

---

## Task 8: Integration Testing & Final Build

**Files:**
- Test: Manual end-to-end testing
- Build: `python3 build.py`

**Interfaces:**
- Consumes: All previous tasks
- Produces: Fully tested platform-agnostic estimator

- [ ] **Step 1: Test detailed mode end-to-end**

Manual test flow:
1. Open browser to estimator tab
2. Click "Show Parameters"
3. Add feature "Custom Feature" → verify chip appears
4. Add phase "Beta" → verify chip appears
5. Adjust Vision to 20% → verify invalid warning (sum ≠ 100)
6. Adjust other stages to sum to 100% → verify checkmark
7. Add requirement with:
   - Name: "Test requirement"
   - Feature: "Custom Feature" (from dropdown)
   - Solution Types: Configuration + Customization (multi-select modal)
   - Complexity: Medium
   - MoSCoW: Must
   - Phase: Beta
8. Verify effort calculated correctly
9. Check summary cards:
   - By Feature shows "Custom Feature"
   - By Solution Type shows Configuration
   - By Powered Stage uses custom percentages
10. Export CSV → verify format
11. Import CSV → verify data restored

Expected: All steps work without errors

- [ ] **Step 2: Test high-level mode end-to-end**

Manual test flow:
1. Switch to high-level mode
2. Click "By Feature" tab
3. Click "+ Add Feature" → add "Test Feature"
4. Enter counts: Low=1, Medium=2, High=1
5. Verify total shows 4
6. Click "By MoSCoW" tab
7. Enter Must: Low=2, Medium=1, High=0
8. Verify totals match
9. Check summary shows feature breakdown
10. Switch back to detailed mode → no errors

Expected: All steps work, calculations correct

- [ ] **Step 3: Test migration with old project**

Create `/tmp/old_project.json`:

```json
{
  "meta": {"name": "Old Salesforce Project", "savedBy": "Test", "savedAt": "2026-07-29T00:00:00Z"},
  "estimator": {
    "mode": "detailed",
    "params": {
      "contingencyPct": 0.1,
      "confidencePct": 1,
      "changeManagementPct": 0.2,
      "projectManagementPct": 0.2,
      "integrationsCount": 1,
      "migrationsCount": 0
    },
    "requirements": [
      {
        "id": "req_old1",
        "name": "Old requirement",
        "cloud": "Service",
        "feature": "Field Service",
        "solutionType": "Configuration",
        "complexity": "Medium",
        "moscow": "Must",
        "releasePhase": "Phase-1"
      }
    ],
    "highlevel": {
      "Sales": {"low": 1, "medium": 0, "high": 0},
      "Service": {"low": 0, "medium": 2, "high": 1}
    },
    "summary": {}
  },
  "tasks": [],
  "holidays": [],
  "picList": [],
  "billingMilestones": [],
  "snapshots": [],
  "issues": [],
  "auditLog": []
}
```

Manual test:
1. Open browser console
2. Paste JSON, run: `var proj = PP.Project.fromJSON(oldProjectJson);`
3. Check: `proj.estimator.params.features` includes "Service"
4. Check: `proj.estimator.requirements[0].feature === "Service"`
5. Check: `proj.estimator.requirements[0].solutionTypes === ["Configuration"]`
6. Check: `proj.estimator.highlevel.byFeature.Sales` exists
7. Check: `!proj.estimator.requirements[0].cloud` (removed)

Expected: Migration successful, old schema converted

- [ ] **Step 4: Test powered stage validation**

Manual test:
1. Show parameters
2. Set powered stages to: Vision=10, Validate=20, Construct=30, Deploy=20, Evolve=10 (sum=90)
3. Verify red border, invalid message
4. Add requirement → verify summary still calculates but shows warning
5. Fix to sum=100%
6. Verify green checkmark, calculations update

Expected: Validation prevents invalid configurations

- [ ] **Step 5: Build final version**

Run: `python3 build.py`

Expected: No errors, clean build

- [ ] **Step 6: Run automated tests**

Run: `node --test`

Expected: All tests PASS

- [ ] **Step 7: Final verification checklist**

Verify in browser:
- [ ] Parameters section: features chips, phases chips, powered stage inputs
- [ ] Detailed grid: feature dropdown, multi-select solution types, phase dropdown
- [ ] High-level: two tabs (feature/moscow), add/delete features
- [ ] Summary: By Feature card, By Solution Type card
- [ ] CSV export: pipe-delimited solution types, feature column
- [ ] CSV import: auto-adds features/phases
- [ ] Migration: old projects load without errors
- [ ] Powered stage validation: sum must equal 100%
- [ ] No console errors
- [ ] No XSS vulnerabilities (all inputs escaped)

- [ ] **Step 8: Commit final integration**

```bash
git add .
git commit -m "test: verify platform-agnostic estimator integration

- Tested detailed mode end-to-end
- Tested high-level mode with feature/MoSCoW tabs
- Verified migration from Salesforce-specific schema
- Validated powered stage sum enforcement
- All automated tests passing
- All manual test scenarios passing
- No console errors or XSS vulnerabilities"
```

- [ ] **Step 9: Push to PR branch**

Run: `git push`

Expected: Changes pushed to `fix/estimator-calculations` branch

---

## Completion Checklist

- [ ] Task 1: Data model schema & migration logic
- [ ] Task 2: Calculation engine refactor
- [ ] Task 3: Parameters UI section
- [ ] Task 4: Requirements grid updates
- [ ] Task 5: High-level mode refactor
- [ ] Task 6: Summary cards update
- [ ] Task 7: CSV import/export update
- [ ] Task 8: Integration testing & final build

All tests passing, no console errors, spec requirements met.
