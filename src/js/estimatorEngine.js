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

  // Role allocation by Powered Stage (from Excel Mapping sheet rows 5-9, cols AY-BC)
  var ROLE_ALLOCATION_BY_STAGE = {
    'Engagement Management': { Vision: 0.10, Validate: 0.05, Construct: 0.05, Deploy: 0.05, Evolve: 0.05 },
    'Delivery Management': { Vision: 0.30, Validate: 0.20, Construct: 0.10, Deploy: 0.10, Evolve: 0.20 },
    'Solution Architect/Analyst': { Vision: 0.50, Validate: 0.25, Construct: 0.15, Deploy: 0.10, Evolve: 0.20 },
    'Developer': { Vision: 0.10, Validate: 0.30, Construct: 0.50, Deploy: 0.40, Evolve: 0.45 },
    'QA': { Vision: 0.00, Validate: 0.20, Construct: 0.20, Deploy: 0.35, Evolve: 0.10 }
  };

  function generateRequirementId() {
    return 'req_' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Calculate effort for a single requirement
   * @param {Object} req - Requirement object with solutionType and complexity
   * @param {Object} params - Optional params object with poweredStages override
   * @returns {Object} - { totalDays, byActivity, byStage, byRole }
   */
  function calculateRequirement(req, params) {
    // Use primary solution type (first in array) or fallback to solutionType
    var primaryType = req.solutionTypes ? req.solutionTypes[0] : req.solutionType;

    if (!primaryType || !req.complexity) {
      return { totalDays: 0, byActivity: {}, byStage: {}, byRole: {} };
    }

    var baseHours = BASE_HOURS[primaryType];
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

    // Distribute across Powered Stages using configurable percentages
    var byStage = {};
    var stageDistribution = params && params.poweredStages ? params.poweredStages : POWERED_STAGES;
    var isConfigurable = params && params.poweredStages; // True if using configurable percentages (0-100 scale)
    var stages = ['Vision', 'Validate', 'Construct', 'Deploy', 'Evolve'];
    for (var i = 0; i < stages.length; i++) {
      var stage = stages[i];
      var percentage = stageDistribution[stage] || POWERED_STAGES[stage];
      // Configurable params use 0-100 scale, default POWERED_STAGES use 0-1 scale
      var multiplier = isConfigurable ? (percentage / 100) : percentage;
      byStage[stage] = totalDays * multiplier;
    }

    // Allocate to roles from Powered Stages
    var byRole = {};
    for (var role in ROLE_ALLOCATION_BY_STAGE) {
      if (ROLE_ALLOCATION_BY_STAGE.hasOwnProperty(role)) {
        byRole[role] = 0;
        var roleAllocation = ROLE_ALLOCATION_BY_STAGE[role];
        for (var stage in byStage) {
          if (byStage.hasOwnProperty(stage) && roleAllocation.hasOwnProperty(stage)) {
            byRole[role] += byStage[stage] * roleAllocation[stage];
          }
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
   * Calculate high-level estimate from feature counts
   * @param {Object} counts - { low: N, medium: N, high: N }
   * @param {Object} params - Optional params object with poweredStages override
   * @returns {Object} - { totalDays, byActivity, byStage, byRole }
   */
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

  /**
   * Recalculate summary for entire estimator
   * @param {Object} estimator - Estimator data
   * @returns {Object} - Updated summary
   */
  function recalcSummary(estimator) {
    var summary = {
      totalDays: 0,
      byFeature: {},
      byStage: {},
      byRole: {},
      bySolutionType: {},
      byActivity: {}
    };

    if (estimator.mode === 'detailed') {
      // Detailed mode: iterate through requirements
      for (var i = 0; i < estimator.requirements.length; i++) {
        var req = estimator.requirements[i];
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

        // By Solution Type (all types - no primary distinction)
        var types = req.solutionTypes || (req.solutionType ? [req.solutionType] : []);
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
      }
    } else {
      // High-level mode: iterate through features
      if (estimator.highlevel && estimator.highlevel.byFeature) {
        for (var feature in estimator.highlevel.byFeature) {
          if (estimator.highlevel.byFeature.hasOwnProperty(feature)) {
            var counts = estimator.highlevel.byFeature[feature];
            var calc = calculateHighLevelFeature(counts, estimator.params);

            summary.totalDays += calc.totalDays;
            summary.byFeature[feature] = calc.totalDays;

            // Merge byStage
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
    }

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

      for (var activity in integrationCalc.byActivity) {
        if (integrationCalc.byActivity.hasOwnProperty(activity)) {
          summary.byActivity[activity] = (summary.byActivity[activity] || 0) + integrationCalc.byActivity[activity] * count;
        }
      }
      for (var stage in integrationCalc.byStage) {
        if (integrationCalc.byStage.hasOwnProperty(stage)) {
          summary.byStage[stage] = (summary.byStage[stage] || 0) + integrationCalc.byStage[stage] * count;
        }
      }
      for (var role in integrationCalc.byRole) {
        if (integrationCalc.byRole.hasOwnProperty(role)) {
          summary.byRole[role] = (summary.byRole[role] || 0) + integrationCalc.byRole[role] * count;
        }
      }
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

      for (var activity in migrationCalc.byActivity) {
        if (migrationCalc.byActivity.hasOwnProperty(activity)) {
          summary.byActivity[activity] = (summary.byActivity[activity] || 0) + migrationCalc.byActivity[activity] * count;
        }
      }
      for (var stage in migrationCalc.byStage) {
        if (migrationCalc.byStage.hasOwnProperty(stage)) {
          summary.byStage[stage] = (summary.byStage[stage] || 0) + migrationCalc.byStage[stage] * count;
        }
      }
      for (var role in migrationCalc.byRole) {
        if (migrationCalc.byRole.hasOwnProperty(role)) {
          summary.byRole[role] = (summary.byRole[role] || 0) + migrationCalc.byRole[role] * count;
        }
      }
    }

    // Apply overhead percentages multiplicatively (sequential) to match Excel calculation
    var overheadMultiplier = (1 + estimator.params.contingencyPct) *
                              (1 + estimator.params.projectManagementPct) *
                              (1 + estimator.params.changeManagementPct);

    summary.totalDays = summary.totalDays * overheadMultiplier;

    // Apply all overheads to stages, roles, and components
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
    for (var key in summary.bySolutionType) {
      if (summary.bySolutionType.hasOwnProperty(key)) {
        summary.bySolutionType[key] = summary.bySolutionType[key] * overheadMultiplier;
      }
    }

    // byFeature and byActivity remain as BASE values (no overheads applied)
    // This matches Excel where activities and feature totals are shown before overheads

    return summary;
  }

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
});
