# Salesforce Estimator Tab Design

**Date:** 2026-07-23
**Status:** Approved

## Overview

Add a new "Estimator" tab to ProjectPlanner that replicates the Salesforce Field Service Excel estimator's calculation engine. Users can estimate project effort using either High Level (component counts) or Detailed (line-by-line requirements) modes, then push estimates as tasks into the Plan tab.

## Context

The Excel-based "Salesforce Estimator" workbook provides two estimation approaches:
- **High Level:** Quick estimates via component counts by complexity (Sales: 3 Low, 2 Medium, 1 High)
- **Detailed:** Granular requirements with Cloud/Feature/Solution Type/Complexity inputs

It calculates:
- Total project effort (days)
- Breakdown by Cloud (Sales, Service, Marketing, etc.)
- Breakdown by Powered Stages (Vision, Validate, Construct, Deploy, Evolve)
- Breakdown by Role (Developer, QA, Solution Architect, etc.)
- Overhead components (Project Management, Change Management, Contingency)

Users currently estimate in Excel, then manually recreate tasks in ProjectPlanner. This design integrates both tools.

## Goals

1. **Replicate Excel calculation engine** - Port Base Calculations matrices, complexity multipliers, phase distribution, role allocation
2. **Support both modes** - High Level and Detailed estimation paths with toggle
3. **Push to Plan** - One-click conversion of requirements → tasks
4. **Preserve estimates** - Keep estimator data as part of project for future adjustments
5. **Maintain zero dependencies** - Pure JavaScript, no external libraries

## Data Model

### Extension to `Project` Class

Add `estimator` field to existing project schema in `src/js/store.js`:

```javascript
{
  // ...existing fields (meta, tasks, holidays, picList, etc.)

  estimator: {
    mode: 'detailed',  // 'detailed' | 'highlevel'

    params: {
      // Project Overview inputs
      clientName: '',
      projectName: '',
      startDate: '',
      endDate: '',
      offering: 'SF Implementation',  // SF Implementation | SF Optimisation | SF Advisory

      // Calculation parameters
      contingencyPct: 0.1,           // 10% default
      confidencePct: 0.8,            // 80% default
      offshorePct: 0,                // 0% default (future: apply cost adjustment, not used in MVP)
      changeManagementPct: 0.2,      // 20% default
      projectManagementPct: 0.2,     // 20% default

      // Context parameters
      userCount: 0,
      locationCount: 0,
      integrationsCount: 0,
      migrationsCount: 0
    },

    // Detailed mode: requirement line items
    requirements: [
      {
        id: 'req_abc123',
        name: 'Set up territory',
        requirementType: '',        // optional
        cloud: 'Service',           // Sales | Service | Marketing | Experience | Commerce | ...
        feature: 'Field Service',   // free text
        solutionType: 'Configuration',  // OOTB | Configuration | Customization | Integration | Migration
        complexity: 'Medium',       // Low | Medium | High
        moscow: '',                 // optional (Must/Should/Could/Won't)
        scope: '',                  // optional
        releasePhase: '',           // Phase-1 | Phase-2 | Phase-3 | Phase-4 | Deferred
        assumptions: ''             // optional
      }
    ],

    // High level mode: component counts
    highlevel: {
      Sales: { low: 0, medium: 0, high: 0 },
      Service: { low: 0, medium: 0, high: 0 },
      Marketing: { low: 0, medium: 0, high: 0 },
      Experience: { low: 0, medium: 0, high: 0 },
      Commerce: { low: 0, medium: 0, high: 0 },
      Revenue: { low: 0, medium: 0, high: 0 },
      Einstein: { low: 0, medium: 0, high: 0 },
      HigherEducation: { low: 0, medium: 0, high: 0 },
      AppExchange: { low: 0, medium: 0, high: 0 },
      Tableau: { low: 0, medium: 0, high: 0 },
      Pardot: { low: 0, medium: 0, high: 0 },
      MuleSoft: { low: 0, medium: 0, high: 0 },
      FinancialServices: { low: 0, medium: 0, high: 0 },
      Health: { low: 0, medium: 0, high: 0 },
      NonProfit: { low: 0, medium: 0, high: 0 },
      MyTrailHead: { low: 0, medium: 0, high: 0 },
      Consumer: { low: 0, medium: 0, high: 0 },
      NetZeroCloud: { low: 0, medium: 0, high: 0 }
    },

    // Calculated output (recalculated on every change)
    summary: {
      totalDays: 0,
      totalDaysAtConfidence: 0,
      byCloud: { Sales: 0, Service: 0, Marketing: 0, ... },
      byComponent: {
        integrations: 0,
        migrations: 0,
        changeManagement: 0,
        projectManagement: 0,
        contingency: 0
      },
      byStage: {
        vision: 0,
        validate: 0,
        construct: 0,
        deploy: 0,
        evolve: 0
      },
      byRole: {
        engagementManagement: 0,
        deliveryManagement: 0,
        solutionArchitect: 0,
        developer: 0,
        qa: 0
      }
    }
  }
}
```

### Schema Migration

Add `estimator` initialization in `Project.empty()` and `Project.fromJSON()`:

```javascript
// Default empty estimator
estimator: {
  mode: 'detailed',
  params: {
    clientName: '',
    projectName: '',
    startDate: '',
    endDate: '',
    offering: 'SF Implementation',
    contingencyPct: 0.1,
    confidencePct: 0.8,
    offshorePct: 0,
    changeManagementPct: 0.2,
    projectManagementPct: 0.2,
    userCount: 0,
    locationCount: 0,
    integrationsCount: 0,
    migrationsCount: 0
  },
  requirements: [],
  highlevel: { /* all clouds with low:0, medium:0, high:0 */ },
  summary: {
    totalDays: 0,
    totalDaysAtConfidence: 0,
    byCloud: {},
    byComponent: {},
    byStage: {},
    byRole: {}
  }
}
```

## Calculation Engine

### Module: `src/js/estimatorEngine.js`

Pure calculation engine, UMD wrapper for Node testing. No DOM dependencies.

### Base Calculations Matrix

Port from Excel "Base Calculations" sheet:

```javascript
const BASE_HOURS = {
  'OOTB': {
    'Low':    { discovery: 2,  req: 1,  design: 1,  dev: 2,  test: 1,  uat: 1,  deploy: 2,  document: 1 },  // total: 11
    'Medium': { discovery: 5,  req: 4,  design: 6,  dev: 8,  test: 2,  uat: 4,  deploy: 4,  document: 1 },  // total: 34
    'High':   { discovery: 8,  req: 8,  design: 16, dev: 16, test: 8,  uat: 8,  deploy: 8,  document: 2 }   // total: 74
  },
  'Configuration': {
    'Low':    { discovery: 4,  req: 4,  design: 4,  dev: 6,  test: 2,  uat: 2,  deploy: 4,  document: 1 },  // total: 27
    'Medium': { discovery: 6,  req: 12, design: 12, dev: 12, test: 4,  uat: 4,  deploy: 4,  document: 3 },  // total: 57
    'High':   { discovery: 12, req: 24, design: 24, dev: 32, test: 16, uat: 16, deploy: 8,  document: 4 }   // total: 136
  },
  'Customization': {
    'Low':    { discovery: 5,  req: 10, design: 4,  dev: 8,  test: 4,  uat: 4,  deploy: 4,  document: 1 },   // total: 40
    'Medium': { discovery: 8,  req: 16, design: 24, dev: 32, test: 10, uat: 10, deploy: 8,  document: 4 },   // total: 112
    'High':   { discovery: 24, req: 40, design: 32, dev: 56, test: 20, uat: 20, deploy: 8,  document: 4 }    // total: 204
  },
  'Integration': {
    'Low':    { discovery: 8,  req: 10, design: 24, dev: 24, test: 8,  uat: 8,  deploy: 4,  document: 5 },   // total: 91
    'Medium': { discovery: 16, req: 24, design: 32, dev: 40, test: 16, uat: 16, deploy: 8,  document: 8 },   // total: 160
    'High':   { discovery: 24, req: 40, design: 40, dev: 64, test: 24, uat: 24, deploy: 12, document: 12 }   // total: 240
  },
  'Migration': {
    'Low':    { discovery: 8,  req: 8,  design: 16, dev: 16, test: 8,  uat: 8,  deploy: 8,  document: 4 },   // total: 76
    'Medium': { discovery: 16, req: 16, design: 24, dev: 32, test: 16, uat: 16, deploy: 12, document: 8 },   // total: 140
    'High':   { discovery: 24, req: 24, design: 40, dev: 56, test: 24, uat: 24, deploy: 16, document: 12 }   // total: 220
  }
};
```

### Complexity Risk Multipliers

Applied at requirement level (discovered from Excel reverse engineering):

```javascript
const COMPLEXITY_MULTIPLIER = {
  'Low': 1.10,      // 10% risk buffer
  'Medium': 1.21,   // 21% risk buffer
  'High': 1.375     // 37.5% risk buffer
};
```

### Phase Distribution (Powered Stages)

Each activity type distributes across Vision → Validate → Construct → Deploy → Evolve:

```javascript
const PHASE_DISTRIBUTION = {
  discovery:  { vision: 0.30, validate: 0.20, construct: 0.20, deploy: 0.20, evolve: 0.10 },
  req:        { vision: 0.30, validate: 0.20, construct: 0.20, deploy: 0.20, evolve: 0.10 },
  design:     { vision: 0.10, validate: 0.20, construct: 0.40, deploy: 0.20, evolve: 0.10 },
  dev:        { vision: 0.05, validate: 0.10, construct: 0.50, deploy: 0.25, evolve: 0.10 },
  test:       { vision: 0.05, validate: 0.10, construct: 0.50, deploy: 0.25, evolve: 0.10 },
  uat:        { vision: 0.05, validate: 0.10, construct: 0.50, deploy: 0.25, evolve: 0.10 },
  deploy:     { vision: 0.10, validate: 0.20, construct: 0.40, deploy: 0.20, evolve: 0.10 },
  document:   { vision: 0.10, validate: 0.20, construct: 0.40, deploy: 0.20, evolve: 0.10 }
};
```

### Role Allocation

Maps activity types to roles:

```javascript
const ROLE_ALLOCATION = {
  discovery:  { engagementManagement: 0.20, solutionArchitect: 0.50, deliveryManagement: 0.30 },
  req:        { solutionArchitect: 0.60, deliveryManagement: 0.40 },
  design:     { solutionArchitect: 0.70, developer: 0.30 },
  dev:        { developer: 1.0 },
  test:       { qa: 0.80, developer: 0.20 },
  uat:        { qa: 0.50, solutionArchitect: 0.30, deliveryManagement: 0.20 },
  deploy:     { developer: 0.60, deliveryManagement: 0.40 },
  document:   { solutionArchitect: 0.50, deliveryManagement: 0.50 }
};
```

### Calculation Flow

**Single Requirement:**

```javascript
function calculateRequirement(req) {
  // 1. Lookup base hours
  const base = BASE_HOURS[req.solutionType][req.complexity];
  const totalBaseHours = Object.values(base).reduce((sum, h) => sum + h, 0);

  // 2. Apply complexity multiplier
  const multiplier = COMPLEXITY_MULTIPLIER[req.complexity];
  const adjustedHours = totalBaseHours * multiplier;

  // 3. Convert to days (8 hours/day)
  const hoursPerDay = 8;
  const totalDays = adjustedHours / hoursPerDay;

  // 4. Calculate days per activity (with multiplier)
  const activityDays = {};
  Object.keys(base).forEach(activity => {
    activityDays[activity] = (base[activity] * multiplier) / hoursPerDay;
  });

  // 5. Distribute across Powered Stages
  const byStage = { vision: 0, validate: 0, construct: 0, deploy: 0, evolve: 0 };
  Object.keys(activityDays).forEach(activity => {
    const days = activityDays[activity];
    const dist = PHASE_DISTRIBUTION[activity];
    Object.keys(byStage).forEach(stage => {
      byStage[stage] += days * dist[stage];
    });
  });

  // 6. Distribute across roles
  const byRole = { engagementManagement: 0, deliveryManagement: 0, solutionArchitect: 0, developer: 0, qa: 0 };
  Object.keys(activityDays).forEach(activity => {
    const days = activityDays[activity];
    const allocation = ROLE_ALLOCATION[activity];
    if (allocation) {
      Object.keys(allocation).forEach(role => {
        byRole[role] = (byRole[role] || 0) + (days * allocation[role]);
      });
    }
  });

  return { totalDays, byStage, byRole, activityDays };
}
```

**Aggregate Summary:**

```javascript
function recalcSummary(estimator) {
  let totalBase = 0;
  const byCloud = {};
  const byStage = { vision: 0, validate: 0, construct: 0, deploy: 0, evolve: 0 };
  const byRole = { engagementManagement: 0, deliveryManagement: 0, solutionArchitect: 0, developer: 0, qa: 0 };

  // Sum all requirements (Detailed mode)
  if (estimator.mode === 'detailed') {
    estimator.requirements.forEach(req => {
      const calc = calculateRequirement(req);
      totalBase += calc.totalDays;

      byCloud[req.cloud] = (byCloud[req.cloud] || 0) + calc.totalDays;

      Object.keys(byStage).forEach(stage => {
        byStage[stage] += calc.byStage[stage];
      });

      Object.keys(byRole).forEach(role => {
        byRole[role] += calc.byRole[role];
      });
    });
  }

  // High Level mode: calculate from counts
  // (Similar logic using highlevel counts)

  // Add project management overhead
  const pmDays = totalBase * estimator.params.projectManagementPct;

  // Add change management overhead
  const cmDays = totalBase * estimator.params.changeManagementPct;

  // Add contingency
  const contingencyDays = totalBase * estimator.params.contingencyPct;

  // Calculate total
  const totalDays = totalBase + pmDays + cmDays + contingencyDays;

  // Apply confidence
  const totalDaysAtConfidence = totalDays * estimator.params.confidencePct;

  // Calculate integrations/migrations based on complexity assumptions
  // Use Medium complexity Integration/Migration as baseline
  const integrationBaseHours = Object.values(BASE_HOURS.Integration.Medium).reduce((sum, h) => sum + h, 0);
  const migrationBaseHours = Object.values(BASE_HOURS.Migration.Medium).reduce((sum, h) => sum + h, 0);
  const integrationDays = estimator.params.integrationsCount * (integrationBaseHours / 8) * COMPLEXITY_MULTIPLIER.Medium;
  const migrationDays = estimator.params.migrationsCount * (migrationBaseHours / 8) * COMPLEXITY_MULTIPLIER.Medium;

  return {
    totalDays,
    totalDaysAtConfidence,
    byCloud,
    byComponent: {
      integrations: integrationDays,
      migrations: migrationDays,
      changeManagement: cmDays,
      projectManagement: pmDays,
      contingency: contingencyDays
    },
    byStage,
    byRole
  };
}
```

**Export:**

```javascript
return {
  recalcSummary,
  calculateRequirement,
  BASE_HOURS,
  COMPLEXITY_MULTIPLIER,
  PHASE_DISTRIBUTION,
  ROLE_ALLOCATION
};
```

## UI Components

### Module: `src/js/ui/estimator.js`

Follows existing UI patterns (IIFE, attaches to `PP` namespace).

### Tab Integration

**HTML Changes:**

```html
<!-- Add to view tabs row -->
<button class="view-tab" data-view="estimator">Estimator</button>

<!-- Add view container -->
<div id="estimator-view" hidden>
  <!-- Content rendered by JS -->
</div>
```

**App.js Changes:**

```javascript
// Add to VIEW_IDS array
const VIEW_IDS = ['plan', 'gantt', 'scurve', 'dashboard', 'snapshots', 'resources', 'billing', 'settings', 'holidays', 'activities', 'reports', 'issues', 'estimator'];

// Add to refresh() function
function refresh(state, markDirty) {
  state.calc = PP.recalc(state.project);
  // ... existing renders
  PP.renderEstimator(state);  // Add this
  // ...
}
```

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ [Mode Toggle: ( ) High Level  (•) Detailed]              │
├──────────────────────────────────────────────────────────┤
│ ┌─ Project Parameters ──────────────────────────────┐   │
│ │ Client: [________]  Project: [________]           │   │
│ │ Dates: [____] to [____]  Offering: [SF Impl ▾]   │   │
│ │ Users: [20]  Locations: [1]  Integrations: [0]   │   │
│ │ Contingency: [10%]  Confidence: [80%]  CM: [20%]  │   │
│ │ PM: [20%]  Offshore: [0%]                         │   │
│ └────────────────────────────────────────────────────┘   │
│                                                           │
│ ┌─ Requirements (Detailed Mode) ──────────────────┐     │
│ │ [+ Add Requirement]                              │     │
│ │                                                   │     │
│ │ # │Req Name │Cloud│Feature│Type│Cmplx│Days│[×]   │     │
│ │ 1 │Set up...│Serv │Field..│Cfg │Med  │8.6 │[×]   │     │
│ │ 2 │Enable...│Serv │Field..│Cfg │Low  │3.7 │[×]   │     │
│ │ ...                                               │     │
│ └───────────────────────────────────────────────────┘     │
│                                                           │
│ ┌─ Summary ──────────────────────────────────────┐       │
│ │ Total: 222.4 days (at 100% confidence)         │       │
│ │                                                 │       │
│ │ By Cloud:    Service: 140.4 d | Sales: 0 d     │       │
│ │ By Stage:    Vision: 26.7 | Validate: 75.6 ... │       │
│ │ By Role:     Developer: 82.3 | QA: 40.7 ...    │       │
│ │ Components:  PM: 33.7 | CM: 28.1 | Cont: 20.2  │       │
│ │                                                 │       │
│ │ [Push to Plan Tab]                              │       │
│ └─────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────┘
```

### Component Details

**Mode Toggle:**
- Radio buttons, switches between `highlevel` and `detailed`
- Updates `estimator.mode`, triggers UI re-render
- Warning on switch if data exists: "Switching modes will clear current data. Continue?"

**Project Parameters:**
- Standard input fields
- On change: updates `estimator.params`, calls `PP.recalcEstimatorSummary(state)`, re-renders summary

**Requirements Grid (Detailed):**
- Inline editable table (similar to `tree.js` pattern)
- Columns: #, Name (text), Cloud (dropdown), Feature (text), Solution Type (dropdown), Complexity (dropdown), MoSCoW (text), Release Phase (dropdown), Days (read-only)
- Add button: `project.addEstimatorRequirement()`
- Delete button per row: `project.deleteEstimatorRequirement(id)`
- Dropdowns use `escapeHtml()` for XSS safety

**High Level Grid (High Level mode):**
- Matrix of number inputs: Cloud × (Low/Med/High)
- On change: updates `estimator.highlevel`, recalc, re-render

**Summary Section:**
- Six subsections with clear headings
- Read-only display, styled like dashboard cards
- Large total at top, breakdowns below

**Push Button:**
- Disabled if no requirements/counts
- On click: calls `PP.pushEstimatorToPlan(state)`, switches to Plan view

### Rendering Function

```javascript
PP.renderEstimator = function (state) {
  const view = document.getElementById('estimator-view');
  if (view.hidden) return;

  const estimator = state.project.estimator;

  // Recalc summary
  estimator.summary = PP.recalcEstimatorSummary(estimator);

  view.innerHTML = '';

  // Mode toggle
  const modeToggle = createModeToggle(estimator.mode, state);
  view.appendChild(modeToggle);

  // Params section
  const params = createParamsSection(estimator.params, state);
  view.appendChild(params);

  // Input section (mode-dependent)
  if (estimator.mode === 'detailed') {
    const reqGrid = createRequirementsGrid(estimator.requirements, state);
    view.appendChild(reqGrid);
  } else {
    const hlGrid = createHighLevelGrid(estimator.highlevel, state);
    view.appendChild(hlGrid);
  }

  // Summary
  const summary = createSummarySection(estimator.summary, state);
  view.appendChild(summary);
};
```

## Push to Plan Logic

### Function: `PP.pushEstimatorToPlan(state)`

Converts estimator data into Plan tab tasks.

### Detailed Mode Conversion

```javascript
function pushEstimatorToPlan(state) {
  const estimator = state.project.estimator;

  if (estimator.mode !== 'detailed' || estimator.requirements.length === 0) {
    alert('No requirements to push');
    return;
  }

  // Check for existing pushed tasks
  const existingPushed = state.project.tasks.filter(t => t._estimatorSource);
  if (existingPushed.length > 0) {
    const confirm = window.confirm(
      'Tasks from a previous push exist. Pushing again will create duplicates. Continue?'
    );
    if (!confirm) return;
  }

  const newTasks = [];

  estimator.requirements.forEach((req, index) => {
    const calc = PP.calculateRequirement(req);

    // Determine owner by solution type
    const ownerMap = {
      'OOTB': 'Solution Architect',
      'Configuration': 'Solution Architect',
      'Customization': 'Developer',
      'Integration': 'Integration Specialist',
      'Migration': 'Data Migration Specialist'
    };
    const owner = ownerMap[req.solutionType] || '';

    const task = {
      id: PP.generateId(),
      name: req.name,
      owner: owner,
      pic: '',
      parentId: null,  // Flat list (no phase hierarchy)
      order: index,
      plannedStart: null,  // User sets manually
      plannedFinish: null,
      actualStart: null,
      actualFinish: null,
      duration: Math.ceil(calc.totalDays),  // Round up to whole days
      weight: null,
      weightOverride: null,
      deliverable: false,
      predecessors: [],
      statusOverride: null,
      remarks: `${req.cloud} | ${req.feature} | ${req.solutionType} | ${req.complexity}`,
      billingMilestoneId: null,

      // Metadata for traceability
      _estimatorSource: {
        requirementId: req.id,
        cloud: req.cloud,
        solutionType: req.solutionType,
        complexity: req.complexity,
        pushedAt: new Date().toISOString()
      }
    };

    newTasks.push(task);
  });

  // Add tasks (uses existing addTask logic)
  state.project._pushUndo();
  newTasks.forEach(task => {
    state.project.tasks.push(task);
  });

  // Log audit entry
  state.project.auditLog.push({
    taskId: null,
    action: 'estimator_push',
    who: state.project.meta.savedBy || 'Unknown',
    when: new Date().toISOString(),
    details: `Pushed ${newTasks.length} requirements to Plan`
  });

  // Switch to Plan view
  PP.switchToView('plan', state);

  // Refresh
  PP.refresh(state, true);
}
```

### High Level Mode Conversion

Creates one summary task per cloud with counts > 0:

```javascript
// For each cloud
Object.keys(estimator.highlevel).forEach(cloud => {
  const counts = estimator.highlevel[cloud];
  const total = counts.low + counts.medium + counts.high;

  if (total > 0) {
    // Calculate days using average of complexity levels
    // Assume Configuration as default solution type for High Level
    const lowBase = BASE_HOURS.Configuration.Low;
    const medBase = BASE_HOURS.Configuration.Medium;
    const highBase = BASE_HOURS.Configuration.High;

    const lowHours = Object.values(lowBase).reduce((s, h) => s + h, 0) * COMPLEXITY_MULTIPLIER.Low;
    const medHours = Object.values(medBase).reduce((s, h) => s + h, 0) * COMPLEXITY_MULTIPLIER.Medium;
    const highHours = Object.values(highBase).reduce((s, h) => s + h, 0) * COMPLEXITY_MULTIPLIER.High;

    const totalHours = (counts.low * lowHours) + (counts.medium * medHours) + (counts.high * highHours);
    const avgDays = totalHours / 8;

    const task = {
      id: PP.generateId(),
      name: `${cloud} Implementation`,
      owner: 'Solution Architect',
      duration: Math.ceil(avgDays),
      remarks: `Low: ${counts.low}, Med: ${counts.medium}, High: ${counts.high}`,
      _estimatorSource: { cloud, mode: 'highlevel', pushedAt: new Date().toISOString() },
      // ... other fields
    };
    newTasks.push(task);
  }
});
```

### Edge Cases

**Empty requirements:** Button disabled, no-op

**Duplicate push:** Warning modal (shown above)

**Mode switch with data:** Warning before clearing

**Owner not in PIC list:** No blocking, user can change later

**Dates:** Left null, user assigns in Plan tab

**Duration rounding:** `Math.ceil()` to avoid 0-day tasks

## Testing Strategy

### Unit Tests (Node)

Test `estimatorEngine.js` calculation logic:

```javascript
// tests/estimatorEngine.test.js
const { calculateRequirement, recalcSummary } = require('../src/js/estimatorEngine.js');

test('Config Medium requirement calculates 8.62 days', () => {
  const req = {
    solutionType: 'Configuration',
    complexity: 'Medium',
    cloud: 'Service'
  };
  const result = calculateRequirement(req);
  expect(result.totalDays).toBeCloseTo(8.62125, 2);
});

test('Complexity multiplier applies correctly', () => {
  // Low: 1.10, Medium: 1.21, High: 1.375
  // Config Low base: 27 hours * 1.10 = 29.7 hours = 3.7125 days
  const req = { solutionType: 'Configuration', complexity: 'Low', cloud: 'Service' };
  const result = calculateRequirement(req);
  expect(result.totalDays).toBeCloseTo(3.7125, 2);
});

test('Summary aggregates multiple requirements', () => {
  const estimator = {
    mode: 'detailed',
    requirements: [
      { solutionType: 'Configuration', complexity: 'Medium', cloud: 'Service' },
      { solutionType: 'Configuration', complexity: 'Low', cloud: 'Service' }
    ],
    params: {
      contingencyPct: 0.1,
      confidencePct: 0.8,
      projectManagementPct: 0.2,
      changeManagementPct: 0.2
    }
  };
  const summary = recalcSummary(estimator);
  expect(summary.totalDays).toBeGreaterThan(0);
  expect(summary.byCloud.Service).toBeGreaterThan(0);
});
```

### Manual Browser Tests

- Add requirement, verify Days column updates
- Toggle modes, verify data clears with warning
- Change params, verify summary recalcs
- Push to Plan, verify tasks appear with correct owners/durations
- Delete requirement, verify summary updates

## Implementation Notes

### File Structure

```
src/
├── js/
│   ├── estimatorEngine.js    (NEW - calculation logic)
│   └── ui/
│       └── estimator.js       (NEW - UI rendering)
```

### Build Process

No changes to `build.py` - new files auto-detected and concatenated.

### XSS Safety

All user inputs (requirement names, params) escaped via `escapeHtml()` before `innerHTML`.

### LocalStorage

No size concerns - estimator data adds ~10-50KB per project (well under 5MB limit).

### Browser Compatibility

Uses only features in existing codebase (no new APIs).

## Future Enhancements (Out of Scope)

- Import from Excel estimator file
- Bi-directional sync (update estimate from Plan actuals)
- Powered Stage columns in Plan tab
- Phase-based WBS hierarchy on push
- Export estimate as PDF report
- Multiple estimates per project (scenarios)

## Success Criteria

1. User can create Detailed estimate with 10+ requirements, see correct totals matching Excel
2. User can toggle to High Level, enter counts, see totals
3. Push creates tasks in Plan tab with owners and durations
4. Summary shows all 6 breakdown sections (Cloud, Stage, Role, Components, Total, Confidence)
5. Estimator data persists across save/load
6. Undo/redo works for estimator changes
7. No console errors, no XSS vulnerabilities

## Approval

Design approved 2026-07-23. Ready for implementation planning.
