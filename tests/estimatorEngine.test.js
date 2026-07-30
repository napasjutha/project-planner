const test = require('node:test');
const assert = require('node:assert');
const engine = require('../src/js/estimatorEngine.js');

test('calculateRequirement - Configuration Medium', () => {
  const req = { solutionType: 'Configuration', complexity: 'Medium' };
  const result = engine.calculateRequirement(req);

  // Base hours for Configuration Medium = 6+12+12+12+4+4+4+3 = 57h
  // Multiplier = 1.21, so 57 * 1.21 = 68.97h = 8.62 days
  assert.ok(Math.abs(result.totalDays - 8.62125) < 0.001, 'Total days should be ~8.62');
  assert.ok(result.byActivity.Discovery > 0, 'Should have Discovery activity');
  assert.ok(result.byStage.Vision > 0, 'Should have Vision stage');
  assert.ok(result.byRole.Developer > 0, 'Should have Developer role');
});

test('calculateRequirement - Customization High', () => {
  const req = { solutionType: 'Customization', complexity: 'High' };
  const result = engine.calculateRequirement(req);

  // Base hours for Customization High = 16+32+32+64+16+16+16+8 = 200h
  // Multiplier = 1.375, so 200 * 1.375 = 275h = 34.375 days
  assert.ok(Math.abs(result.totalDays - 34.375) < 0.001, 'Total days should be 34.375');
  assert.ok(result.byRole.Developer > 0, 'Should have Developer role');
  assert.ok(result.byRole['Solution Architect'] > 0, 'Should have Solution Architect role');
  assert.ok(result.byRole.QA > 0, 'Should have QA role');
});

test('calculateRequirement - OOTB Low', () => {
  const req = { solutionType: 'OOTB', complexity: 'Low' };
  const result = engine.calculateRequirement(req);

  // Base hours for OOTB Low = 2+4+4+0+2+2+2+1 = 17h
  // Multiplier = 1.10, so 17 * 1.10 = 18.7h = 2.3375 days
  assert.ok(Math.abs(result.totalDays - 2.3375) < 0.001, 'Total days should be 2.3375');
  assert.strictEqual(result.byActivity.Development, 0, 'OOTB should have no development');
});

test('calculateRequirement - invalid inputs', () => {
  const req = { solutionType: 'InvalidType', complexity: 'Medium' };
  const result = engine.calculateRequirement(req);

  assert.strictEqual(result.totalDays, 0, 'Invalid solution type should return 0');
});

test('recalcSummary - detailed mode with two requirements', () => {
  const estimator = {
    mode: 'detailed',
    params: {
      contingencyPct: 0.1,
      confidencePct: 0.8,
      changeManagementPct: 0.2,
      projectManagementPct: 0.2,
      testingPct: 0.15,
      documentationPct: 0.1,
      uatPct: 0.05,
      deploymentPct: 0.05,
      integrationsCount: 0,
      migrationsCount: 0
    },
    requirements: [
      { cloud: 'Sales', solutionType: 'Configuration', complexity: 'Medium' },
      { cloud: 'Service', solutionType: 'Customization', complexity: 'Low' }
    ],
    highlevel: {}
  };

  const summary = engine.recalcSummary(estimator);

  // Config Medium = 8.62 days, Custom Low = 6.88 days
  // Base total = 15.50 days
  // Overhead: 0.1 + 0.2 + 0.2 = 0.5 (50%)
  // Total with overhead = 15.50 * 1.5 = 23.24 days
  assert.ok(summary.totalDays > 23 && summary.totalDays < 24, 'Total should be ~23.2 days');
  assert.ok(summary.byCloud.Sales > 0, 'Should have Sales cloud effort');
  assert.ok(summary.byCloud.Service > 0, 'Should have Service cloud effort');
  assert.ok(summary.byComponent.Configuration > 0, 'Should have Configuration component');
  assert.ok(summary.byComponent.Customization > 0, 'Should have Customization component');
});

test('recalcSummary - high-level mode', () => {
  const estimator = {
    mode: 'highlevel',
    params: {
      contingencyPct: 0.0,
      confidencePct: 0.8,
      changeManagementPct: 0.0,
      projectManagementPct: 0.0,
      testingPct: 0.15,
      documentationPct: 0.1,
      uatPct: 0.05,
      deploymentPct: 0.05,
      integrationsCount: 0,
      migrationsCount: 0
    },
    requirements: [],
    highlevel: {
      Sales: { low: 1, medium: 0, high: 0 },
      Service: { low: 0, medium: 1, high: 0 }
    }
  };

  const summary = engine.recalcSummary(estimator);

  // Sales Low (Config): 3.92 days
  // Service Medium (Config): 8.62 days
  // Total = 12.54 days (no overhead)
  assert.ok(summary.totalDays > 12 && summary.totalDays < 13, 'Total should be ~12.5 days');
  assert.ok(summary.byCloud.Sales > 0, 'Should have Sales');
  assert.ok(summary.byCloud.Service > 0, 'Should have Service');
});

test('recalcSummary - with integrations and migrations', () => {
  const estimator = {
    mode: 'detailed',
    params: {
      contingencyPct: 0.0,
      confidencePct: 0.8,
      changeManagementPct: 0.0,
      projectManagementPct: 0.0,
      testingPct: 0.15,
      documentationPct: 0.1,
      uatPct: 0.05,
      deploymentPct: 0.05,
      integrationsCount: 2,
      migrationsCount: 1
    },
    requirements: [],
    highlevel: {}
  };

  const summary = engine.recalcSummary(estimator);

  // Integration Medium: 112h * 1.21 / 8 = 16.94 days * 2 = 33.88 days
  // Migration Medium: 116h * 1.21 / 8 = 17.545 days * 1 = 17.545 days
  // Total = 51.425 days
  assert.ok(summary.totalDays > 51 && summary.totalDays < 52, 'Total should be ~51.4 days');
  assert.ok(summary.byComponent.Integration > 0, 'Should have Integration effort');
  assert.ok(summary.byComponent.Migration > 0, 'Should have Migration effort');
});

test('POWERED_STAGES distribution sums to 1.0', () => {
  const sum = Object.values(engine.POWERED_STAGES).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, 1.0, 'Powered stages should sum to 100%');
});

test('ROLE_ALLOCATION distributions sum to 1.0', () => {
  for (const activity in engine.ROLE_ALLOCATION) {
    const sum = Object.values(engine.ROLE_ALLOCATION[activity]).reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, 1.0, `${activity} role allocation should sum to 100%`);
  }
});

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

  var summary = engine.recalcSummary(estimator);
  var totalBase = summary.totalDays / 1.584; // Remove overheads

  // Verify custom distribution applied (20%, 30%, 30%, 15%, 5%)
  assert.ok(Math.abs((summary.byStage.Vision / 1.584) / totalBase - 0.20) < 0.01);
  assert.ok(Math.abs((summary.byStage.Validate / 1.584) / totalBase - 0.30) < 0.01);
  assert.ok(Math.abs((summary.byStage.Construct / 1.584) / totalBase - 0.30) < 0.01);
});

test('Uses primary solution type (first in array) for calculation', function () {
  var req = {
    solutionTypes: ['Configuration', 'Customization'],
    complexity: 'Medium',
    feature: 'Test Feature'
  };
  var params = {
    poweredStages: { Vision: 12, Validate: 34, Construct: 36, Deploy: 10, Evolve: 8 }
  };

  var calc = engine.calculateRequirement(req, params);

  // Should use Configuration base hours (57 * 1.21 / 8 = 8.62125), not Customization
  assert.ok(Math.abs(calc.totalDays - 8.62125) < 0.01);
});

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

  var summary = engine.recalcSummary(estimator);

  assert.ok(summary.byFeature);
  assert.ok(summary.byFeature['Field Service'] > 0);
  assert.ok(summary.byFeature['Reports'] > 0);
  assert.ok(!summary.byCloud); // Should not exist
});
