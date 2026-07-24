(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  // Complexity multipliers (risk buffers)
  var COMPLEXITY_MULTIPLIER = {
    Low: 1.10,
    Medium: 1.21,
    High: 1.375
  };

  // Base hours by Solution Type and Complexity (from Excel Base Calculations sheet)
  // Activities: Discovery, Requirements, Design, Development, Testing, UAT, Deployment, Documentation
  var BASE_HOURS = {
    OOTB: {
      Low: { Discovery: 2, Requirements: 1, Design: 1, Development: 2, Testing: 1, UAT: 1, Deployment: 2, Documentation: 1 },
      Medium: { Discovery: 5, Requirements: 4, Design: 6, Development: 8, Testing: 2, UAT: 4, Deployment: 4, Documentation: 1 },
      High: { Discovery: 8, Requirements: 8, Design: 16, Development: 16, Testing: 8, UAT: 8, Deployment: 8, Documentation: 2 }
    },
    Configuration: {
      Low: { Discovery: 4, Requirements: 4, Design: 4, Development: 6, Testing: 2, UAT: 2, Deployment: 4, Documentation: 1 },
      Medium: { Discovery: 6, Requirements: 12, Design: 12, Development: 12, Testing: 4, UAT: 4, Deployment: 4, Documentation: 3 },
      High: { Discovery: 12, Requirements: 24, Design: 24, Development: 32, Testing: 16, UAT: 16, Deployment: 8, Documentation: 4 }
    },
    Customization: {
      Low: { Discovery: 5, Requirements: 10, Design: 4, Development: 8, Testing: 4, UAT: 4, Deployment: 4, Documentation: 1 },
      Medium: { Discovery: 8, Requirements: 16, Design: 24, Development: 32, Testing: 10, UAT: 10, Deployment: 8, Documentation: 4 },
      High: { Discovery: 24, Requirements: 40, Design: 32, Development: 56, Testing: 20, UAT: 20, Deployment: 8, Documentation: 4 }
    },
    Integration: {
      Low: { Discovery: 8, Requirements: 10, Design: 24, Development: 24, Testing: 8, UAT: 8, Deployment: 4, Documentation: 5 },
      Medium: { Discovery: 24, Requirements: 24, Design: 32, Development: 40, Testing: 32, UAT: 32, Deployment: 8, Documentation: 8 },
      High: { Discovery: 32, Requirements: 40, Design: 60, Development: 80, Testing: 40, UAT: 40, Deployment: 16, Documentation: 12 }
    },
    Migration: {
      Low: { Discovery: 16, Requirements: 16, Design: 24, Development: 18, Testing: 8, UAT: 8, Deployment: 8, Documentation: 10 },
      Medium: { Discovery: 32, Requirements: 24, Design: 32, Development: 80, Testing: 32, UAT: 32, Deployment: 16, Documentation: 17 },
      High: { Discovery: 40, Requirements: 40, Design: 60, Development: 120, Testing: 40, UAT: 32, Deployment: 24, Documentation: 28 }
    }
  };

  // Powered Stages distribution percentages (from Excel)
  var POWERED_STAGES = {
    Vision: 0.12,
    Validate: 0.34,
    Construct: 0.36,
    Deploy: 0.10,
    Evolve: 0.08
  };

  // Role allocation by activity
  var ROLE_ALLOCATION = {
    Discovery: { 'Solution Architect': 0.7, 'Developer': 0.3 },
    Requirements: { 'Solution Architect': 0.8, 'QA': 0.2 },
    Design: { 'Solution Architect': 0.6, 'Developer': 0.4 },
    Development: { 'Developer': 1.0 },
    Testing: { 'QA': 0.7, 'Developer': 0.3 },
    UAT: { 'QA': 0.5, 'Solution Architect': 0.3, 'Developer': 0.2 },
    Deployment: { 'Developer': 0.6, 'Solution Architect': 0.4 },
    Documentation: { 'Solution Architect': 0.5, 'Developer': 0.5 }
  };

  function generateRequirementId() {
    return 'req_' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Calculate effort for a single requirement
   * @param {Object} req - Requirement object with solutionType and complexity
   * @returns {Object} - { totalDays, byActivity, byStage, byRole }
   */
  function calculateRequirement(req) {
    if (!req.solutionType || !req.complexity) {
      return { totalDays: 0, byActivity: {}, byStage: {}, byRole: {} };
    }

    var baseHours = BASE_HOURS[req.solutionType];
    if (!baseHours) {
      return { totalDays: 0, byActivity: {}, byStage: {}, byRole: {} };
    }

    var complexityHours = baseHours[req.complexity];
    if (!complexityHours) {
      return { totalDays: 0, byActivity: {}, byStage: {}, byRole: {} };
    }

    // Calculate total base hours
    var totalBaseHours = 0;
    var activities = ['Discovery', 'Requirements', 'Design', 'Development', 'Testing', 'UAT', 'Deployment', 'Documentation'];
    for (var i = 0; i < activities.length; i++) {
      totalBaseHours += complexityHours[activities[i]];
    }

    // Apply complexity multiplier
    var multiplier = COMPLEXITY_MULTIPLIER[req.complexity];
    var adjustedHours = totalBaseHours * multiplier;
    var totalDays = adjustedHours / 8;

    // Calculate by activity (in days)
    var byActivity = {};
    for (var i = 0; i < activities.length; i++) {
      var activity = activities[i];
      byActivity[activity] = (complexityHours[activity] * multiplier) / 8;
    }

    // Distribute across Powered Stages
    var byStage = {};
    var stages = ['Vision', 'Validate', 'Construct', 'Deploy', 'Evolve'];
    for (var i = 0; i < stages.length; i++) {
      var stage = stages[i];
      byStage[stage] = totalDays * POWERED_STAGES[stage];
    }

    // Allocate to roles
    var byRole = {};
    for (var i = 0; i < activities.length; i++) {
      var activity = activities[i];
      var activityDays = byActivity[activity];
      var allocation = ROLE_ALLOCATION[activity];
      for (var role in allocation) {
        if (allocation.hasOwnProperty(role)) {
          byRole[role] = (byRole[role] || 0) + activityDays * allocation[role];
        }
      }
    }

    return { totalDays: totalDays, byActivity: byActivity, byStage: byStage, byRole: byRole };
  }

  /**
   * Calculate high-level estimate from component counts
   * @param {Object} highlevel - { Cloud: { low: N, medium: N, high: N }, ... }
   * @param {string} cloud - Cloud name (Sales, Service, etc.)
   * @returns {Object} - { totalDays, byActivity, byStage, byRole }
   */
  function calculateHighLevelCloud(highlevel, cloud) {
    var counts = highlevel[cloud];
    if (!counts) {
      return { totalDays: 0, byActivity: {}, byStage: {}, byRole: {} };
    }

    var result = { totalDays: 0, byActivity: {}, byStage: {}, byRole: {} };

    // For high-level, we use Configuration as the default solution type
    var complexities = ['Low', 'Medium', 'High'];
    for (var i = 0; i < complexities.length; i++) {
      var complexity = complexities[i];
      var count = counts[complexity.toLowerCase()] || 0;
      if (count === 0) continue;

      var calc = calculateRequirement({ solutionType: 'Configuration', complexity: complexity });

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

  /**
   * Recalculate summary for entire estimator
   * @param {Object} estimator - Estimator data
   * @returns {Object} - Updated summary
   */
  function recalcSummary(estimator) {
    var summary = {
      totalDays: 0,
      byCloud: {},
      byStage: {},
      byRole: {},
      byComponent: {},
      byActivity: {}
    };

    if (estimator.mode === 'detailed') {
      // Detailed mode: iterate through requirements
      for (var i = 0; i < estimator.requirements.length; i++) {
        var req = estimator.requirements[i];
        var calc = calculateRequirement(req);

        summary.totalDays += calc.totalDays;

        // By Cloud
        if (req.cloud) {
          summary.byCloud[req.cloud] = (summary.byCloud[req.cloud] || 0) + calc.totalDays;
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

        // By Component (Solution Type)
        if (req.solutionType) {
          summary.byComponent[req.solutionType] = (summary.byComponent[req.solutionType] || 0) + calc.totalDays;
        }

        // By Activity
        for (var activity in calc.byActivity) {
          if (calc.byActivity.hasOwnProperty(activity)) {
            summary.byActivity[activity] = (summary.byActivity[activity] || 0) + calc.byActivity[activity];
          }
        }
      }
    } else {
      // High-level mode: iterate through clouds
      var clouds = ['Sales', 'Service', 'Marketing', 'Community', 'Experience', 'CPQ', 'Integration', 'Migration'];
      for (var i = 0; i < clouds.length; i++) {
        var cloud = clouds[i];
        var calc = calculateHighLevelCloud(estimator.highlevel, cloud);

        summary.totalDays += calc.totalDays;
        summary.byCloud[cloud] = calc.totalDays;

        // Merge byStage
        for (var stage in calc.byStage) {
          if (calc.byStage.hasOwnProperty(stage)) {
            summary.byStage[stage] = (summary.byStage[stage] || 0) + calc.byStage[stage];
          }
        }

        // Merge byRole
        for (var role in calc.byRole) {
          if (calc.byRole.hasOwnProperty(role)) {
            summary.byRole[role] = (summary.byRole[role] || 0) + calc.byRole[role];
          }
        }

        // Merge byActivity
        for (var activity in calc.byActivity) {
          if (calc.byActivity.hasOwnProperty(activity)) {
            summary.byActivity[activity] = (summary.byActivity[activity] || 0) + calc.byActivity[activity];
          }
        }
      }
    }

    // Add integrations
    if (estimator.params.integrationsCount > 0) {
      var integrationBaseHours = 0;
      var integrationHours = BASE_HOURS.Integration.Medium;
      var activities = ['Discovery', 'Requirements', 'Design', 'Development', 'Testing', 'UAT', 'Deployment', 'Documentation'];
      for (var i = 0; i < activities.length; i++) {
        integrationBaseHours += integrationHours[activities[i]];
      }
      var integrationDays = estimator.params.integrationsCount * (integrationBaseHours / 8) * COMPLEXITY_MULTIPLIER.Medium;
      summary.totalDays += integrationDays;
      summary.byComponent.Integration = (summary.byComponent.Integration || 0) + integrationDays;
    }

    // Add migrations
    if (estimator.params.migrationsCount > 0) {
      var migrationBaseHours = 0;
      var migrationHours = BASE_HOURS.Migration.Medium;
      var activities = ['Discovery', 'Requirements', 'Design', 'Development', 'Testing', 'UAT', 'Deployment', 'Documentation'];
      for (var i = 0; i < activities.length; i++) {
        migrationBaseHours += migrationHours[activities[i]];
      }
      var migrationDays = estimator.params.migrationsCount * (migrationBaseHours / 8) * COMPLEXITY_MULTIPLIER.Medium;
      summary.totalDays += migrationDays;
      summary.byComponent.Migration = (summary.byComponent.Migration || 0) + migrationDays;
    }

    // Apply overhead percentages multiplicatively (sequential) to match Excel calculation
    var overheadMultiplier = (1 + estimator.params.contingencyPct) *
                              (1 + estimator.params.projectManagementPct) *
                              (1 + estimator.params.changeManagementPct);

    summary.totalDays = summary.totalDays * overheadMultiplier;

    // Apply same overhead multiplier to all breakdowns
    for (var key in summary.byStage) {
      if (summary.byStage.hasOwnProperty(key)) {
        summary.byStage[key] = summary.byStage[key] * overheadMultiplier;
      }
    }
    for (var key in summary.byRole) {
      if (summary.byRole.hasOwnProperty(key)) {
        summary.byRole[key] = summary.byRole[key] * overheadMultiplier;
      }
    }
    for (var key in summary.byActivity) {
      if (summary.byActivity.hasOwnProperty(key)) {
        summary.byActivity[key] = summary.byActivity[key] * overheadMultiplier;
      }
    }
    for (var key in summary.byCloud) {
      if (summary.byCloud.hasOwnProperty(key)) {
        summary.byCloud[key] = summary.byCloud[key] * overheadMultiplier;
      }
    }
    for (var key in summary.byComponent) {
      if (summary.byComponent.hasOwnProperty(key)) {
        summary.byComponent[key] = summary.byComponent[key] * overheadMultiplier;
      }
    }

    return summary;
  }

  return {
    COMPLEXITY_MULTIPLIER: COMPLEXITY_MULTIPLIER,
    BASE_HOURS: BASE_HOURS,
    POWERED_STAGES: POWERED_STAGES,
    ROLE_ALLOCATION: ROLE_ALLOCATION,
    generateRequirementId: generateRequirementId,
    calculateRequirement: calculateRequirement,
    calculateHighLevelCloud: calculateHighLevelCloud,
    recalcSummary: recalcSummary
  };
});
