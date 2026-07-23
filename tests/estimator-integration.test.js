const test = require('node:test');
const assert = require('node:assert');
const PP = require('../src/js/store.js');
const engine = require('../src/js/estimatorEngine.js');

test('Integration: Estimator detailed mode end-to-end', () => {
  // 1. Create a new project
  const project = PP.Project.empty('Salesforce Field Service Implementation');

  // 2. Verify estimator field exists with defaults
  assert.ok(project.estimator, 'Project should have estimator field');
  assert.strictEqual(project.estimator.mode, 'detailed', 'Should default to detailed mode');
  assert.strictEqual(project.estimator.requirements.length, 0, 'Should start with no requirements');

  // 3. Add requirements
  project.estimator.requirements.push({
    id: engine.generateRequirementId(),
    name: 'Set up territory management',
    cloud: 'Service',
    feature: 'Territory',
    solutionType: 'Configuration',
    complexity: 'Medium',
    moscow: 'Must',
    releasePhase: 'Phase-1'
  });

  project.estimator.requirements.push({
    id: engine.generateRequirementId(),
    name: 'Custom field service mobile app',
    cloud: 'Service',
    feature: 'Mobile',
    solutionType: 'Customization',
    complexity: 'High',
    moscow: 'Must',
    releasePhase: 'Phase-2'
  });

  // 4. Calculate summary
  project.estimator.summary = engine.recalcSummary(project.estimator);

  // 5. Verify summary calculations
  assert.ok(project.estimator.summary.totalDays > 0, 'Total days should be calculated');
  assert.ok(project.estimator.summary.byCloud.Service > 0, 'Service cloud should have effort');
  assert.ok(project.estimator.summary.byComponent.Configuration > 0, 'Configuration should have effort');
  assert.ok(project.estimator.summary.byComponent.Customization > 0, 'Customization should have effort');
  assert.ok(project.estimator.summary.byRole.Developer > 0, 'Developer role should have effort');
  assert.ok(project.estimator.summary.byRole['Solution Architect'] > 0, 'Solution Architect role should have effort');

  // 6. Verify overhead calculations
  const baseEffort = project.estimator.requirements.reduce((sum, req) => {
    return sum + engine.calculateRequirement(req).totalDays;
  }, 0);
  const expectedTotal = baseEffort * (1 + 0.1 + 0.2 + 0.2); // contingency + changeManagement + projectManagement
  assert.ok(Math.abs(project.estimator.summary.totalDays - expectedTotal) < 0.01,
    'Total should include overhead percentages');

  console.log('✓ Estimator data model and calculations working correctly');
  console.log('  Total effort:', project.estimator.summary.totalDays.toFixed(2), 'days');
  console.log('  Requirements:', project.estimator.requirements.length);
});

test('Integration: Estimator high-level mode end-to-end', () => {
  // 1. Create a new project
  const project = PP.Project.empty('Salesforce CPQ Implementation');

  // 2. Switch to high-level mode
  project.estimator.mode = 'highlevel';

  // 3. Add component counts
  project.estimator.highlevel.Sales.low = 5;
  project.estimator.highlevel.Sales.medium = 3;
  project.estimator.highlevel.CPQ.high = 2;

  // 4. Calculate summary
  project.estimator.summary = engine.recalcSummary(project.estimator);

  // 5. Verify calculations
  assert.ok(project.estimator.summary.totalDays > 0, 'Total days should be calculated');
  assert.ok(project.estimator.summary.byCloud.Sales > 0, 'Sales cloud should have effort');
  assert.ok(project.estimator.summary.byCloud.CPQ > 0, 'CPQ cloud should have effort');

  // 6. Verify effort matches manual calculation (with overhead)
  const salesCalc = engine.calculateHighLevelCloud(project.estimator.highlevel, 'Sales');
  const cpqCalc = engine.calculateHighLevelCloud(project.estimator.highlevel, 'CPQ');
  const expectedBase = salesCalc.totalDays + cpqCalc.totalDays;
  const expectedWithOverhead = expectedBase * (1 + 0.1 + 0.2 + 0.2); // contingency + changeManagement + projectManagement

  assert.ok(Math.abs(project.estimator.summary.totalDays - expectedWithOverhead) < 0.01,
    'High-level summary should match component calculations with overhead');

  console.log('✓ High-level mode calculations working correctly');
  console.log('  Total effort:', project.estimator.summary.totalDays.toFixed(2), 'days');
  console.log('  Sales components:', project.estimator.highlevel.Sales.low + project.estimator.highlevel.Sales.medium);
  console.log('  CPQ components:', project.estimator.highlevel.CPQ.high);
});

test('Integration: Estimator serialization and persistence', () => {
  // 1. Create project with estimator data
  const project = PP.Project.empty('Test Project');
  project.estimator.requirements.push({
    id: 'req_test1',
    name: 'Test requirement',
    cloud: 'Sales',
    solutionType: 'Configuration',
    complexity: 'Low',
    moscow: 'Should',
    releasePhase: ''
  });
  project.estimator.summary = engine.recalcSummary(project.estimator);

  // 2. Serialize to JSON
  const json = project.toJSON();
  assert.ok(json.estimator, 'JSON should include estimator');
  assert.strictEqual(json.estimator.requirements.length, 1, 'Requirements should be serialized');

  // 3. Deserialize
  const restored = PP.Project.fromJSON(json);
  assert.ok(restored.estimator, 'Restored project should have estimator');
  assert.strictEqual(restored.estimator.requirements.length, 1, 'Requirements should be restored');
  assert.strictEqual(restored.estimator.requirements[0].name, 'Test requirement', 'Requirement data should match');

  // 4. Verify calculations still work
  restored.estimator.summary = engine.recalcSummary(restored.estimator);
  assert.ok(restored.estimator.summary.totalDays > 0, 'Calculations should work on restored project');

  console.log('✓ Estimator data persists through serialization');
});

test('Integration: Estimator with integrations and migrations', () => {
  const project = PP.Project.empty('Integration Test');

  // Set integration and migration counts
  project.estimator.params.integrationsCount = 2;
  project.estimator.params.migrationsCount = 1;

  // Calculate summary
  project.estimator.summary = engine.recalcSummary(project.estimator);

  // Verify integrations and migrations are included
  assert.ok(project.estimator.summary.byComponent.Integration > 0, 'Integration effort should be calculated');
  assert.ok(project.estimator.summary.byComponent.Migration > 0, 'Migration effort should be calculated');

  // Manual verification
  const integrationBase = Object.values(engine.BASE_HOURS.Integration.Medium).reduce((sum, h) => sum + h, 0);
  const integrationDays = 2 * (integrationBase / 8) * engine.COMPLEXITY_MULTIPLIER.Medium;

  const migrationBase = Object.values(engine.BASE_HOURS.Migration.Medium).reduce((sum, h) => sum + h, 0);
  const migrationDays = 1 * (migrationBase / 8) * engine.COMPLEXITY_MULTIPLIER.Medium;

  assert.ok(Math.abs(project.estimator.summary.byComponent.Integration - integrationDays) < 0.01,
    'Integration calculation should match expected');
  assert.ok(Math.abs(project.estimator.summary.byComponent.Migration - migrationDays) < 0.01,
    'Migration calculation should match expected');

  console.log('✓ Integration and migration counts working correctly');
  console.log('  Integration effort:', project.estimator.summary.byComponent.Integration.toFixed(2), 'days');
  console.log('  Migration effort:', project.estimator.summary.byComponent.Migration.toFixed(2), 'days');
});
