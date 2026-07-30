# Platform-Agnostic Estimator Design

**Date:** 2026-07-29
**Status:** Draft

## Overview

Refactor the Salesforce-specific Estimator to be platform-agnostic by making project taxonomy (Features, Phases, Powered Stages) user-configurable while keeping universal estimation constants (BASE_HOURS, COMPLEXITY_MULTIPLIER) hardcoded.

## Context

Current estimator is Salesforce-specific:
- Hardcoded Cloud field (Sales, Service, Marketing, etc.)
- Fixed Release Phases (Phase-1/2/3/4, Deferred)
- Fixed Powered Stage distribution (Vision 12%, Validate 34%, etc.)
- Single-select Solution Type

Users need estimator for non-Salesforce projects (general software, infrastructure, data migration, etc.), requiring:
- Custom feature taxonomy
- Custom phase names
- Adjustable Powered Stage ratios
- Multi-select solution types

## Goals

1. **Platform-agnostic taxonomy** - Features, Phases configurable per project
2. **Flexible Powered Stages** - User-adjustable distribution percentages
3. **Multi-select solution types** - Tag multiple types, primary drives calculation
4. **Seamless migration** - Auto-convert existing Salesforce projects
5. **Keep estimation science stable** - BASE_HOURS and multipliers remain universal constants

## Non-Goals

- Customizing BASE_HOURS matrices (these are industry-standard benchmarks)
- Customizing complexity levels (Low/Medium/High is universal)
- Customizing activity types (Discovery/Requirements/Design/etc.)
- Customizing role allocation formulas

## Architecture Decision: Hybrid Configurability

**Configurable (project-specific):**
- Features list (was: Cloud)
- Release Phases list
- Powered Stage distribution percentages

**Hardcoded (universal estimation constants):**
- BASE_HOURS matrices (OOTB, Configuration, Customization, Integration, Migration)
- COMPLEXITY_MULTIPLIER (Low: 1.10, Medium: 1.21, High: 1.375)
- ROLE_ALLOCATION_BY_STAGE formulas

**Rationale:** Features/Phases/Stage distribution vary by organization and methodology. BASE_HOURS are empirical industry benchmarks that apply universally.

## Data Model Changes

### Updated `estimator` Schema

```javascript
{
  mode: 'detailed',  // 'detailed' | 'highlevel'

  params: {
    // User-configurable lists
    features: ['Field Service', 'Case Management', 'Reports & Dashboards'],
    phases: ['Phase-1', 'Phase-2', 'Phase-3', 'Phase-4', 'Deferred'],

    // Powered Stage distribution (must sum to 100%)
    poweredStages: {
      Vision: 12,
      Validate: 34,
      Construct: 36,
      Deploy: 10,
      Evolve: 8
    },

    // Overhead percentages
    contingencyPct: 0.1,
    confidencePct: 1.0,
    changeManagementPct: 0.2,
    projectManagementPct: 0.2,

    // Context counts
    integrationsCount: 0,
    migrationsCount: 0
  },

  requirements: [
    {
      id: 'req_abc123',
      name: 'Set up territory',
      feature: 'Field Service',              // from params.features (was: cloud)
      solutionTypes: ['Configuration'],      // multi-select, first = primary
      complexity: 'Medium',
      moscow: 'Must',                        // Must/Should/Could/Won't
      releasePhase: 'Phase-1'                // from params.phases
    }
  ],

  highlevel: {
    byFeature: {
      'Field Service': { low: 0, medium: 0, high: 0 },
      'Case Management': { low: 0, medium: 0, high: 0 }
      // dynamically generated from params.features
    },
    byMoscow: {
      'Must': { low: 0, medium: 0, high: 0 },
      'Should': { low: 0, medium: 0, high: 0 },
      'Could': { low: 0, medium: 0, high: 0 },
      "Won't": { low: 0, medium: 0, high: 0 }
    }
  },

  summary: {
    totalDays: 0,
    byFeature: {},           // replaces byCloud
    byStage: {},
    byRole: {},
    bySolutionType: {},      // renamed from byComponent
    byActivity: {}
  }
}
```

### Schema Changes Summary

**Removed:**
- `cloud` field from requirements
- `highlevel` cloud-based structure (Sales, Service, Marketing, etc.)
- `summary.byCloud`

**Added:**
- `params.features` - user-defined feature list
- `params.phases` - user-defined phase list
- `params.poweredStages` - configurable percentages
- `requirements[].feature` - dropdown from features
- `requirements[].solutionTypes` - array (multi-select)
- `highlevel.byFeature` - matrix by feature × complexity
- `highlevel.byMoscow` - matrix by MoSCoW × complexity
- `summary.byFeature` - effort breakdown by feature

**Modified:**
- `requirements[].solutionType` (string) → `solutionTypes` (array)
- `requirements[].releasePhase` - now from params.phases
- `summary.byComponent` → `bySolutionType` (renamed for clarity)

## Calculation Engine Changes

### Modified `estimatorEngine.js`

**Function signature change:**
```javascript
// Before
function calculateRequirement(req)

// After
function calculateRequirement(req, params)
```

**Key changes:**

1. **Multi-select solution type handling:**
```javascript
// Use primary solution type (first in array) for BASE_HOURS lookup
const primaryType = req.solutionTypes[0];
const base = BASE_HOURS[primaryType][req.complexity];

// Additional types stored but not used in calculation
// (displayed as tags in UI)
```

2. **Configurable Powered Stage distribution:**
```javascript
// Before: hardcoded POWERED_STAGES constant
const byStage = {};
Object.keys(POWERED_STAGES).forEach(stage => {
  byStage[stage] = totalDays * POWERED_STAGES[stage];
});

// After: from params
const byStage = {};
const stageDistribution = params.poweredStages;
Object.keys(stageDistribution).forEach(stage => {
  byStage[stage] = totalDays * (stageDistribution[stage] / 100);
});
```

3. **Feature-based aggregation:**
```javascript
// In recalcSummary()
const byFeature = {};
estimator.requirements.forEach(req => {
  const calc = calculateRequirement(req, estimator.params);
  byFeature[req.feature] = (byFeature[req.feature] || 0) + calc.totalDays;
});
```

4. **High-level by feature:**
```javascript
if (estimator.mode === 'highlevel') {
  Object.keys(estimator.highlevel.byFeature).forEach(feature => {
    const counts = estimator.highlevel.byFeature[feature];
    const totalDays = calculateHighLevelFeature(counts);
    summary.byFeature[feature] = totalDays;
  });
}
```

**Note on multi-select solution types:**
Only the first element in `solutionTypes` array is used for BASE_HOURS lookup. Additional types are preserved as metadata/tags for documentation purposes but do not affect effort calculation. This prevents over-estimation (summing multiple matrices would unrealistically inflate estimates).

## UI Changes

### 1. Parameters Section (Expandable)

```
┌─ Estimation Parameters ────────────────────────────────┐
│ [▼] Show/Hide                                          │
│                                                         │
│ Features (used in requirements):                       │
│ [Field Service] [×] [Case Management] [×] [+ Add]     │
│                                                         │
│ Release Phases:                                         │
│ [Phase-1] [×] [Phase-2] [×] [Phase-3] [×] [+ Add]     │
│                                                         │
│ Powered Stage Distribution (must sum to 100%):         │
│ Vision: [12]% Validate: [34]% Construct: [36]%        │
│ Deploy: [10]% Evolve: [8]%  Total: 100% ✓             │
│                                                         │
│ Overheads:                                              │
│ Contingency: [10]% Change Mgmt: [20]% Proj Mgmt: [20]%│
│                                                         │
│ Context:                                                │
│ Integrations: [0] Migrations: [0]                      │
└─────────────────────────────────────────────────────────┘
```

**Features Management:**
- Chip display with × delete button
- [+ Add] button opens inline text input, adds to list on Enter
- Hybrid add: typing new feature in requirement auto-adds here

**Phases Management:**
- Same pattern as features
- Pre-define in parameters, then select in requirements dropdown

**Powered Stage Distribution:**
- 5 percentage inputs (Vision, Validate, Construct, Deploy, Evolve)
- Live sum validation: must equal 100%
- Red border + warning if ≠ 100%
- Prevents calculation until valid

### 2. Requirements Grid (Detailed Mode)

**Updated columns:**

```
# | Requirement | Feature  | Solution Type    | Complexity | MoSCoW  | Phase    | Effort | Actions
--|-------------|----------|------------------|------------|---------|----------|--------|--------
1 | Territory   |[Field..▾]|[Configuration ▼] | [Medium ▾] |[Must ▾] |[Phase-1▾]| 8.6 d  | [×]
  | setup       |          | +Customization   |            |         |          |        |
--|-------------|----------|------------------|------------|---------|----------|--------|--------
2 | Enable      |[Case.. ▾]|[OOTB ▼]         | [Low ▾]    |[Should▾]|[Phase-2▾]| 3.7 d  | [×]
  | permissions |          |                  |            |         |          |        |
```

**Removed:** Cloud column

**Added/Modified:**
- **Feature** - dropdown from params.features, hybrid add (type new value → auto-adds to params)
- **Solution Type** - multi-select dropdown with primary indicator:
  - Click opens dropdown with checkboxes (OOTB, Configuration, Customization, Integration, Migration)
  - First selected = primary (bold or "[Primary]" visual indicator)
  - Display: "Configuration" on first line, "+ Customization" on second (stacked tags)
  - Hover tooltip: "Primary type determines effort calculation. Additional types are for documentation."
- **Phase** - dropdown from params.phases (pre-defined in parameters)

### 3. High-Level Mode (Tab-Based Matrices)

```
┌─ Component Counts ──────────────────────────────────────┐
│ [By Feature] [By MoSCoW]                                │
│                                                          │
│ Tab 1: By Feature                                        │
│                    Low    Medium    High    Total        │
│ Field Service      [ 2 ]  [ 5 ]    [ 1 ]   = 8          │
│ Case Management    [ 0 ]  [ 3 ]    [ 0 ]   = 3          │
│ Reports            [ 1 ]  [ 0 ]    [ 0 ]   = 1          │
│ [+ Add Feature]                                          │
│                                                          │
│ Tab 2: By MoSCoW                                         │
│                    Low    Medium    High    Total        │
│ Must               [ 3 ]  [ 6 ]    [ 1 ]   = 10         │
│ Should             [ 0 ]  [ 2 ]    [ 0 ]   = 2          │
│ Could              [ 0 ]  [ 0 ]    [ 0 ]   = 0          │
│ Won't              [ 0 ]  [ 0 ]    [ 0 ]   = 0          │
└──────────────────────────────────────────────────────────┘
```

**Replaces:** Single cloud-based matrix (Sales, Service, Marketing, etc.)

**By Feature Tab:**
- Rows dynamically generated from params.features
- [+ Add Feature] button adds new row, prompts for feature name, syncs to params.features
- [×] delete button per row (removes feature from params if not used in detailed requirements)
- Number inputs for Low/Med/High counts
- Row totals calculated on right

**By MoSCoW Tab:**
- Fixed 4 rows (Must/Should/Could/Won't)
- Same column structure as By Feature
- Cannot add/remove rows (MoSCoW is standard prioritization framework)

**Live sync:**
- Adding feature in matrix → adds to params.features → appears in detailed mode dropdown
- Adding feature in detailed mode → appears in high-level matrix

**Calculation:**
- Each count uses Configuration solution type at respective complexity
- Tab 1 total = Tab 2 total (same project data, different grouping dimension)

### 4. Summary Cards

**Updated 6 cards:**

```
┌─ Summary ──────────────────────────────────────────────┐
│ ┌─ Total Effort ─────┐  ┌─ By Feature ────────┐      │
│ │ 222.4 days          │  │ Field Service: 140d │      │
│ │ (100% confidence)   │  │ Case Mgmt: 82d      │      │
│ └─────────────────────┘  │ Reports: 0d         │      │
│                          └─────────────────────┘      │
│                                                         │
│ ┌─ By Powered Stage ─┐  ┌─ By Role ──────────┐      │
│ │ Vision: 26.7d       │  │ Eng Mgmt: 12.5d    │      │
│ │ Validate: 75.6d     │  │ Del Mgmt: 36.9d    │      │
│ │ Construct: 80.1d    │  │ Sol Arch: 50.0d    │      │
│ │ Deploy: 22.2d       │  │ Developer: 82.3d   │      │
│ │ Evolve: 17.8d       │  │ QA: 40.7d          │      │
│ └─────────────────────┘  └─────────────────────┘      │
│                                                         │
│ ┌─ By Solution Type ─┐  ┌─ By Activity ──────┐      │
│ │ Configuration: 180d │  │ Discovery: 28.1d   │      │
│ │ Customization: 42d  │  │ Requirements: 52d  │      │
│ │ Integration: 0d     │  │ Design: 45.3d      │      │
│ │ Migration: 0d       │  │ Development: 62d   │      │
│ │ OOTB: 0d            │  │ Testing: 18.5d     │      │
│ └─────────────────────┘  │ UAT: 21.0d         │      │
│                          │ Deployment: 12.3d  │      │
│                          │ Documentation: 8d   │      │
│                          └─────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

**Changes:**
- Replace "By Cloud" → "By Feature"
- Rename "By Component Type" → "By Solution Type"
- Keep: Total Effort, By Powered Stage, By Role, By Activity
- Days/Hours dropdown still available in each card header

**By Feature Card:**
- Dynamically generated from params.features
- Only shows features with effort > 0
- Sorted by effort descending

## Migration Strategy

### Auto-Migration on Project Load

**Detection in `store.js`:**
```javascript
// In Project.fromJSON()
if (json.estimator && json.estimator.requirements.some(r => r.cloud)) {
  migrateEstimatorToGeneric(json.estimator);
}
```

**Migration Steps:**

1. **Extract clouds → features**
```javascript
const clouds = [...new Set(requirements.map(r => r.cloud).filter(Boolean))];
estimator.params.features = clouds.length > 0
  ? clouds
  : ['Field Service', 'Case Management', 'Reports & Dashboards'];
```

2. **Map requirement.cloud → requirement.feature**
```javascript
requirements.forEach(req => {
  if (req.cloud) {
    req.feature = req.cloud;  // Preserve value
    delete req.cloud;         // Remove old field
  }

  // Convert solutionType (string) → solutionTypes (array)
  if (req.solutionType && !req.solutionTypes) {
    req.solutionTypes = [req.solutionType];
    delete req.solutionType;
  }
});
```

3. **Set default phases**
```javascript
if (!estimator.params.phases) {
  estimator.params.phases = ['Phase-1', 'Phase-2', 'Phase-3', 'Phase-4', 'Deferred'];
}
```

4. **Set default Powered Stages**
```javascript
if (!estimator.params.poweredStages) {
  estimator.params.poweredStages = {
    Vision: 12,
    Validate: 34,
    Construct: 36,
    Deploy: 10,
    Evolve: 8
  };
}
```

5. **Migrate high-level structure**
```javascript
if (estimator.highlevel && !estimator.highlevel.byFeature) {
  estimator.highlevel.byFeature = {};

  // Convert old cloud-based counts to feature-based
  Object.keys(estimator.highlevel).forEach(cloud => {
    if (cloud !== 'byFeature' && cloud !== 'byMoscow') {
      estimator.highlevel.byFeature[cloud] = estimator.highlevel[cloud];
      delete estimator.highlevel[cloud];
    }
  });

  // Initialize byMoscow
  if (!estimator.highlevel.byMoscow) {
    estimator.highlevel.byMoscow = {
      Must: { low: 0, medium: 0, high: 0 },
      Should: { low: 0, medium: 0, high: 0 },
      Could: { low: 0, medium: 0, high: 0 },
      "Won't": { low: 0, medium: 0, high: 0 }
    };
  }
}
```

**Migration Characteristics:**
- One-time, automatic on load
- No user intervention required
- No data loss (cloud values preserved as features)
- Backward compatible (old projects work immediately)
- After migration, no legacy code paths remain

## Implementation Notes

### Feature/Phase Management Pattern

**Hybrid add approach:**
1. Pre-define in parameters section (explicit management)
2. Auto-add when typing new value in requirement (implicit discovery)
3. Live sync between parameters and requirement dropdowns

**Implementation:**
```javascript
// On feature input blur/enter in requirement grid
function onFeatureInput(value) {
  if (!params.features.includes(value)) {
    params.features.push(value);
    project._pushUndo();
    PP.refresh(true);
  }
}

// Delete feature from parameters
function deleteFeature(feature) {
  // Check if used in requirements
  const inUse = requirements.some(r => r.feature === feature);
  if (inUse) {
    alert('Cannot delete - feature is used in requirements');
    return;
  }

  params.features = params.features.filter(f => f !== feature);
  delete highlevel.byFeature[feature];
  project._pushUndo();
  PP.refresh(true);
}
```

### Powered Stage Validation

**Real-time sum validation:**
```javascript
function validatePoweredStages() {
  const sum = Object.values(params.poweredStages).reduce((a, b) => a + b, 0);

  if (Math.abs(sum - 100) > 0.01) {
    showError('Powered Stages must sum to 100%');
    return false;
  }

  return true;
}

// On any powered stage input change
function onPoweredStageChange() {
  if (validatePoweredStages()) {
    project._pushUndo();
    estimator.summary = PP.recalcSummary(estimator);
    PP.refresh(true);
  }
}
```

### Multi-Select Solution Type UI

**Component structure:**
```html
<div class="solution-type-cell">
  <div class="solution-type-primary">Configuration</div>
  <div class="solution-type-tags">+ Customization</div>
</div>
```

**Dropdown behavior:**
- Click cell → open dropdown with checkboxes
- Check/uncheck → reorder to put checked items first
- First item automatically becomes primary (bold styling)
- Click outside or press Esc → close dropdown

**Visual indicator:**
- Primary type: bold font or "[Primary]" label
- Additional types: lighter color, smaller font, "+" prefix

### CSV Import/Export Changes

**Export format:**
```csv
Requirement,Feature,Solution Types,Complexity,MoSCoW,Release Phase
Set up territory,Field Service,Configuration|Customization,Medium,Must,Phase-1
Enable permissions,Case Management,OOTB,Low,Should,Phase-2
```

**Import handling:**
- Solution Types column: pipe-delimited (first = primary)
- Feature/Phase auto-add to params if not exists
- Validation: warn if Powered Stages ≠ 100%

## Testing Strategy

### Unit Tests (Node)

**Test powered stage configuration:**
```javascript
test('Uses configurable powered stages from params', () => {
  const estimator = {
    mode: 'detailed',
    requirements: [
      { solutionTypes: ['Configuration'], complexity: 'Medium', feature: 'Test' }
    ],
    params: {
      poweredStages: { Vision: 20, Validate: 30, Construct: 30, Deploy: 15, Evolve: 5 },
      contingencyPct: 0.1,
      changeManagementPct: 0.2,
      projectManagementPct: 0.2
    }
  };

  const summary = PP.recalcSummary(estimator);

  // Verify custom distribution applied
  expect(summary.byStage.Vision / summary.totalDays).toBeCloseTo(0.20, 2);
  expect(summary.byStage.Validate / summary.totalDays).toBeCloseTo(0.30, 2);
});
```

**Test multi-select solution type:**
```javascript
test('Uses primary solution type for calculation', () => {
  const req = {
    solutionTypes: ['Configuration', 'Customization'],  // Primary: Configuration
    complexity: 'Medium',
    feature: 'Test'
  };

  const params = { poweredStages: { Vision: 12, Validate: 34, Construct: 36, Deploy: 10, Evolve: 8 } };
  const calc = PP.calculateRequirement(req, params);

  // Should use Configuration base hours, not Customization
  expect(calc.totalDays).toBeCloseTo(8.62, 2);
});
```

**Test migration:**
```javascript
test('Migrates cloud to feature', () => {
  const oldData = {
    requirements: [
      { cloud: 'Service', solutionType: 'Configuration', complexity: 'Medium' }
    ],
    highlevel: {
      Sales: { low: 1, medium: 2, high: 3 }
    }
  };

  const migrated = migrateEstimatorToGeneric(oldData);

  expect(migrated.requirements[0].feature).toBe('Service');
  expect(migrated.requirements[0].cloud).toBeUndefined();
  expect(migrated.params.features).toContain('Service');
  expect(migrated.highlevel.byFeature.Sales).toEqual({ low: 1, medium: 2, high: 3 });
});
```

### Manual Browser Tests

- Add feature in parameters → appears in requirement dropdown
- Add feature in requirement → appears in parameters chips
- Delete unused feature → removed from both
- Delete used feature → shows error
- Adjust powered stages to not sum to 100% → validation error
- Multi-select solution types → primary indicator shows
- Switch high-level tabs → both matrices show correct totals
- Import CSV with new features → auto-adds to params
- Load old Salesforce project → migrates automatically

## Edge Cases

**Empty features list:**
- Default to empty array, show empty dropdown with "Add feature" placeholder

**Powered stages validation:**
- Block calculation if sum ≠ 100%
- Show red border + tooltip on inputs
- Disable summary rendering until valid

**Delete feature with references:**
- Prevent deletion, show alert: "Cannot delete - feature is used in N requirements"

**Multi-select with no selection:**
- Treat as empty, show validation error in requirement row

**Migration of empty project:**
- Initialize with default features/phases
- No errors on empty requirements array

**High-level feature sync:**
- Adding row in high-level → adds to params.features
- Deleting feature from params → removes row from high-level matrix

## Success Criteria

1. User can define custom features (not limited to Salesforce clouds)
2. User can define custom phase names (not limited to Phase-1/2/3/4)
3. User can adjust Powered Stage distribution percentages
4. Multi-select solution types works, primary drives calculation
5. High-level mode has two tabs (by Feature, by MoSCoW)
6. Summary shows "By Feature" breakdown instead of "By Cloud"
7. Old Salesforce projects migrate automatically without errors
8. CSV import/export works with new schema
9. No XSS vulnerabilities in feature/phase inputs
10. Powered stage validation prevents invalid configurations

## Future Enhancements (Out of Scope)

- Customize BASE_HOURS matrices per project
- Customize complexity levels (e.g., add "Very High" tier)
- Customize activity types (e.g., add "Security Review" activity)
- Import estimation templates from library
- Multi-project comparison dashboard
- Powered stage timeline visualization

## Approval

Design approved 2026-07-29. Ready for implementation planning.
