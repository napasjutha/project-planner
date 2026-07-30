(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  function generateId() {
    return 't_' + Math.random().toString(36).slice(2, 10);
  }

  function generateBillingMilestoneId() {
    return 'bm_' + Math.random().toString(36).slice(2, 10);
  }

  function findIncompleteTasks(project) {
    var parentIds = new Set(project.tasks.map(function(t) { return t.parentId; }).filter(Boolean));
    return project.tasks.filter(function(t) {
      if (parentIds.has(t.id)) return false;
      return !t.plannedStart || !t.plannedFinish;
    });
  }

  function findTasksMissingOwner(project) {
    var parentIds = new Set(project.tasks.map(function(t) { return t.parentId; }).filter(Boolean));
    return project.tasks.filter(function(t) {
      if (parentIds.has(t.id)) return false;
      return !t.owner || !t.owner.trim();
    });
  }

  function computeLastUpdated(project) {
    var result = new Map();
    project.auditLog.forEach(function(entry) {
      result.set(entry.taskId, { who: entry.who, when: entry.when });
    });
    return result;
  }

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

  function Project(data) {
    this.meta = data.meta;
    this.tasks = data.tasks;
    this.holidays = data.holidays;
    this.picList = data.picList;
    this.snapshots = data.snapshots;
    this.issues = data.issues || [];
    this.risks = data.risks || [];
    this.decisions = data.decisions || [];
    this.auditLog = data.auditLog;
    this.settings = data.settings;
    this.activityGroups = data.activityGroups || [];
    this.activities = data.activities || [];
    this.billingMilestones = data.billingMilestones || [];
    this.estimator = data.estimator || {
      mode: 'detailed',
      params: {
        features: [],
        phases: ['Phase-1', 'Phase-2', 'Phase-3', 'Phase-4', 'Deferred'],
        poweredStages: {
          Vision: 12,
          Validate: 34,
          Construct: 36,
          Deploy: 10,
          Evolve: 8
        },
        stageOrder: ['Vision', 'Validate', 'Construct', 'Deploy', 'Evolve'],
        contingencyPct: 0.1,
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
    };
    this._undoStack = [];
    this._redoStack = [];
    var self = this;
    this.tasks.forEach(function(t) {
      if (t.owner === undefined) {
        t.owner = t.pic || '';
        t.pic = '';
      }
      if (t.milestone !== undefined) {
        t.deliverable = !!t.milestone;
        delete t.milestone;
      }
      if (t.billingAmount != null || t.billingStatus != null) {
        var bm = {
          id: generateBillingMilestoneId(), name: t.name,
          amount: t.billingAmount != null ? t.billingAmount : null,
          status: t.billingStatus || 'Not Billed',
        };
        self.billingMilestones.push(bm);
        t.billingMilestoneId = bm.id;
      } else if (t.billingMilestoneId === undefined) {
        t.billingMilestoneId = null;
      }
      delete t.billingAmount;
      delete t.billingStatus;
    });
  }

  Project.empty = function(name) {
    var now = new Date().toISOString();
    return new Project({
      meta: {
        id: generateId(), name: name, statusDate: now.slice(0, 10),
        revision: 0, savedBy: null, savedAt: null, createdAt: now,
        schemaVersion: 1,
      },
      tasks: [],
      holidays: [],
      picList: [],
      snapshots: [],
      issues: [],
      risks: [],
      decisions: [],
      auditLog: [],
      settings: { theme: 'kpmg-light', ganttZoom: 'week' },
      activityGroups: [],
      activities: [],
      billingMilestones: [],
      estimator: {
        mode: 'detailed',
        params: {
          features: [],
          phases: ['Phase-1', 'Phase-2', 'Phase-3', 'Phase-4', 'Deferred'],
          poweredStages: {
            Vision: 12,
            Validate: 34,
            Construct: 36,
            Deploy: 10,
            Evolve: 8
          },
          stageOrder: ['Vision', 'Validate', 'Construct', 'Deploy', 'Evolve'],
          contingencyPct: 0.1,
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
      },
    });
  };

  Project.fromJSON = function(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    var project = new Project(data);
    // Migrate old Salesforce-specific schema to generic
    if (project.estimator) {
      migrateEstimatorToGeneric(project.estimator);
    }
    return project;
  };

  Project.prototype.toJSON = function() {
    return {
      meta: this.meta,
      tasks: this.tasks,
      holidays: this.holidays,
      picList: this.picList,
      snapshots: this.snapshots,
      issues: this.issues,
      risks: this.risks,
      decisions: this.decisions,
      auditLog: this.auditLog,
      settings: this.settings,
      activityGroups: this.activityGroups,
      activities: this.activities,
      billingMilestones: this.billingMilestones,
      estimator: this.estimator,
    };
  };

  Project.prototype.serialize = function() {
    this.meta.revision += 1;
    return JSON.stringify(this.toJSON());
  };

  Project.prototype._snapshotState = function() {
    return JSON.parse(JSON.stringify(this.toJSON()));
  };

  Project.prototype._pushUndo = function() {
    this._undoStack.push(this._snapshotState());
    if (this._undoStack.length > 50) this._undoStack.shift();
    this._redoStack = [];
  };

  Project.prototype._applyState = function(state) {
    this.meta = state.meta;
    this.tasks = state.tasks;
    this.holidays = state.holidays;
    this.picList = state.picList;
    this.snapshots = state.snapshots;
    this.issues = state.issues;
    this.risks = state.risks;
    this.decisions = state.decisions;
    this.auditLog = state.auditLog;
    this.settings = state.settings;
    this.activityGroups = state.activityGroups;
    this.activities = state.activities;
    this.billingMilestones = state.billingMilestones;
    this.estimator = state.estimator;
  };

  Project.prototype.undo = function() {
    if (this._undoStack.length === 0) return false;
    this._redoStack.push(this._snapshotState());
    this._applyState(this._undoStack.pop());
    return true;
  };

  Project.prototype.redo = function() {
    if (this._redoStack.length === 0) return false;
    this._undoStack.push(this._snapshotState());
    this._applyState(this._redoStack.pop());
    return true;
  };

  Project.prototype._subtreeIds = function(id) {
    var ids = new Set([id]);
    var added = true;
    while (added) {
      added = false;
      for (var i = 0; i < this.tasks.length; i++) {
        var t = this.tasks[i];
        if (ids.has(t.parentId) && !ids.has(t.id)) {
          ids.add(t.id);
          added = true;
        }
      }
    }
    return ids;
  };

  Project.prototype._audit = function(who, taskId, field, oldValue, newValue) {
    this.auditLog.push({
      when: new Date().toISOString(), who: who || 'unknown',
      taskId: taskId, field: field, old: oldValue, new: newValue,
    });
    if (this.auditLog.length > 2000) this.auditLog.shift();
  };

  Project.prototype.addTask = function(options) {
    options = options || {};
    var parentId = options.parentId !== undefined ? options.parentId : null;
    var name = options.name !== undefined ? options.name : 'New Task';
    var owner = options.owner !== undefined ? options.owner : '';
    var pic = options.pic !== undefined ? options.pic : '';

    this._pushUndo();
    var siblings = this.tasks.filter(function(t) { return t.parentId === parentId; });
    var task = {
      id: generateId(), parentId: parentId, order: siblings.length, name: name, owner: owner, pic: pic,
      jira: '', remarks: '',
      plannedStart: null, plannedFinish: null,
      actualStart: null, actualFinish: null,
      actualPct: 0, weightOverride: null, deliverable: false,
      statusOverride: null, predecessors: [], collapsed: false,
      billingMilestoneId: null,
    };
    this.tasks.push(task);
    return task;
  };

  Project.prototype.addTasks = function(taskSpecs, who) {
    this._pushUndo();
    var created = [];
    var self = this;
    taskSpecs.forEach(function(spec) {
      var parentId = null;
      for (var i = created.length - 1; i >= 0; i--) {
        if (taskSpecs[i]._level < spec._level) {
          parentId = created[i].id;
          break;
        }
      }
      var siblings = self.tasks.filter(function(t) { return t.parentId === parentId; });
      var task = {
        id: generateId(), parentId: parentId, order: siblings.length,
        name: spec.name, owner: spec.owner || '', pic: spec.pic || '',
        jira: '', remarks: spec.remarks || '',
        plannedStart: spec.plannedStart || null, plannedFinish: spec.plannedFinish || null,
        actualStart: null, actualFinish: null,
        actualPct: 0, weightOverride: null, deliverable: !!spec.deliverable,
        statusOverride: null, predecessors: spec.predecessors ? spec.predecessors.slice() : [],
        collapsed: false,
        billingMilestoneId: null,
      };
      self.tasks.push(task);
      created.push(task);
    });
    this._audit(who, null, 'csvImport', null, created.length + ' task(s) imported');
    return created;
  };

  Project.prototype.updateTask = function(id, patch, who) {
    var task = this.tasks.find(function(t) { return t.id === id; });
    if (!task) throw new Error('Task not found: ' + id);
    this._pushUndo();
    var entries = Object.entries(patch);
    for (var i = 0; i < entries.length; i++) {
      var field = entries[i][0];
      var value = entries[i][1];
      var old = task[field];
      task[field] = value;
      this._audit(who, id, field, old, value);
    }
    return task;
  };

  Project.prototype.updateTasks = function(patches, who) {
    this._pushUndo();
    var self = this;
    patches.forEach(function (entry) {
      var task = self.tasks.find(function(t) { return t.id === entry.id; });
      if (!task) throw new Error('Task not found: ' + entry.id);
      var entries = Object.entries(entry.patch);
      for (var j = 0; j < entries.length; j++) {
        var field = entries[j][0];
        var value = entries[j][1];
        var old = task[field];
        task[field] = value;
        self._audit(who, entry.id, field, old, value);
      }
    });
  };

  Project.prototype.deleteTask = function(id, who) {
    if (!this.tasks.some(function(t) { return t.id === id; })) throw new Error('Task not found: ' + id);
    this._pushUndo();
    var toDelete = this._subtreeIds(id);
    this.tasks = this.tasks.filter(function(t) { return !toDelete.has(t.id); });
    this._audit(who, id, 'deleted', null, true);
  };

  Project.prototype.moveTask = function(id, newParentId, newOrder, who) {
    var task = this.tasks.find(function(t) { return t.id === id; });
    if (!task) throw new Error('Task not found: ' + id);
    if (newParentId != null && this._subtreeIds(id).has(newParentId)) {
      throw new Error('Cannot move a task into its own descendant');
    }
    this._pushUndo();
    var oldParentId = task.parentId;
    task.parentId = newParentId;
    var siblings = this.tasks
      .filter(function(t) { return t.parentId === newParentId && t.id !== id; })
      .sort(function(a, b) { return a.order - b.order; });
    siblings.splice(newOrder, 0, task);
    siblings.forEach(function(t, i) { t.order = i; });
    if (oldParentId !== newParentId) {
      var oldSiblings = this.tasks
        .filter(function(t) { return t.parentId === oldParentId; })
        .sort(function(a, b) { return a.order - b.order; });
      oldSiblings.forEach(function(t, i) { t.order = i; });
    }
    this._audit(who, id, 'parentId', oldParentId, newParentId);
  };

  Project.prototype.indent = function(id, who) {
    var task = this.tasks.find(function(t) { return t.id === id; });
    if (!task) throw new Error('Task not found: ' + id);
    var siblings = this.tasks
      .filter(function(t) { return t.parentId === task.parentId; })
      .sort(function(a, b) { return a.order - b.order; });
    var idx = siblings.findIndex(function(t) { return t.id === id; });
    if (idx <= 0) return false;
    var newParent = siblings[idx - 1];
    var newParentChildCount = this.tasks.filter(function(t) { return t.parentId === newParent.id; }).length;
    this.moveTask(id, newParent.id, newParentChildCount, who);
    return true;
  };

  Project.prototype.outdent = function(id, who) {
    var task = this.tasks.find(function(t) { return t.id === id; });
    if (!task) throw new Error('Task not found: ' + id);
    if (task.parentId === null) return false;
    var parent = this.tasks.find(function(t) { return t.id === task.parentId; });
    var grandParentId = parent ? parent.parentId : null;
    var newOrder = parent ? parent.order + 1 : 0;
    this.moveTask(id, grandParentId, newOrder, who);
    return true;
  };

  Project.prototype.toggleCollapse = function(id) {
    var task = this.tasks.find(function(t) { return t.id === id; });
    if (!task) throw new Error('Task not found: ' + id);
    task.collapsed = !task.collapsed;
  };

  Project.prototype.setAllCollapsed = function(collapsed) {
    var self = this;
    this.tasks.forEach(function(t) {
      if (self.tasks.some(function(c) { return c.parentId === t.id; })) t.collapsed = collapsed;
    });
  };

  Project.prototype.addBillingMilestone = function() {
    this._pushUndo();
    var bm = { id: generateBillingMilestoneId(), name: 'New Billing Milestone', amount: null, status: 'Not Billed' };
    this.billingMilestones.push(bm);
    return bm;
  };

  Project.prototype.updateBillingMilestone = function(id, patch, who) {
    var bm = this.billingMilestones.find(function(b) { return b.id === id; });
    if (!bm) throw new Error('Billing milestone not found: ' + id);
    this._pushUndo();
    var entries = Object.entries(patch);
    for (var i = 0; i < entries.length; i++) {
      var field = entries[i][0];
      var value = entries[i][1];
      var old = bm[field];
      bm[field] = value;
      this._audit(who, id, field, old, value);
    }
    return bm;
  };

  Project.prototype.deleteBillingMilestone = function(id, who) {
    if (!this.billingMilestones.some(function(b) { return b.id === id; })) throw new Error('Billing milestone not found: ' + id);
    this._pushUndo();
    this.billingMilestones = this.billingMilestones.filter(function(b) { return b.id !== id; });
    this.tasks.forEach(function(t) {
      if (t.billingMilestoneId === id) t.billingMilestoneId = null;
    });
    this._audit(who, id, 'deleted', null, true);
  };

  Project.prototype.assignDeliverablesToBillingMilestone = function(billingMilestoneId, taskIds, who) {
    this._pushUndo();
    var idSet = new Set(taskIds);
    this.tasks.forEach(function(t) {
      if (idSet.has(t.id)) {
        if (t.billingMilestoneId !== billingMilestoneId) {
          this._audit(who, t.id, 'billingMilestoneId', t.billingMilestoneId, billingMilestoneId);
          t.billingMilestoneId = billingMilestoneId;
        }
      } else if (t.billingMilestoneId === billingMilestoneId) {
        this._audit(who, t.id, 'billingMilestoneId', t.billingMilestoneId, null);
        t.billingMilestoneId = null;
      }
    }, this);
  };

  Project.prototype.addIssue = function(options) {
    options = options || {};
    this._pushUndo();
    var issue = {
      id: generateId(),
      title: options.title !== undefined ? options.title : 'New Issue',
      description: options.description !== undefined ? options.description : '',
      owner: options.owner !== undefined ? options.owner : '',
      status: options.status !== undefined ? options.status : 'Open',
      dateRaised: options.dateRaised !== undefined ? options.dateRaised : null,
      dateResolved: options.dateResolved !== undefined ? options.dateResolved : null
    };
    this.issues.push(issue);
    return issue;
  };

  Project.prototype.updateIssue = function(id, patch, who) {
    var issue = this.issues.find(function(i) { return i.id === id; });
    if (!issue) throw new Error('Issue not found: ' + id);
    this._pushUndo();
    var entries = Object.entries(patch);
    for (var i = 0; i < entries.length; i++) {
      var field = entries[i][0];
      var value = entries[i][1];
      var old = issue[field];
      issue[field] = value;
      this._audit(who, id, field, old, value);
    }
    return issue;
  };

  Project.prototype.deleteIssue = function(id, who) {
    if (!this.issues.some(function(i) { return i.id === id; })) throw new Error('Issue not found: ' + id);
    this._pushUndo();
    this.issues = this.issues.filter(function(i) { return i.id !== id; });
    this._audit(who, id, 'deleted', null, true);
  };

  Project.prototype.addRisk = function(options) {
    options = options || {};
    this._pushUndo();
    var risk = {
      id: generateId(),
      title: options.title !== undefined ? options.title : 'New Risk',
      description: options.description !== undefined ? options.description : '',
      likelihood: options.likelihood !== undefined ? options.likelihood : 'Low',
      impact: options.impact !== undefined ? options.impact : 'Low',
      mitigation: options.mitigation !== undefined ? options.mitigation : '',
      owner: options.owner !== undefined ? options.owner : '',
      status: options.status !== undefined ? options.status : 'Open',
      dateRaised: options.dateRaised !== undefined ? options.dateRaised : null
    };
    this.risks.push(risk);
    return risk;
  };

  Project.prototype.updateRisk = function(id, patch, who) {
    var risk = this.risks.find(function(r) { return r.id === id; });
    if (!risk) throw new Error('Risk not found: ' + id);
    this._pushUndo();
    var entries = Object.entries(patch);
    for (var i = 0; i < entries.length; i++) {
      var field = entries[i][0];
      var value = entries[i][1];
      var old = risk[field];
      risk[field] = value;
      this._audit(who, id, field, old, value);
    }
    return risk;
  };

  Project.prototype.deleteRisk = function(id, who) {
    if (!this.risks.some(function(r) { return r.id === id; })) throw new Error('Risk not found: ' + id);
    this._pushUndo();
    this.risks = this.risks.filter(function(r) { return r.id !== id; });
    this._audit(who, id, 'deleted', null, true);
  };

  Project.prototype.addDecision = function(options) {
    options = options || {};
    this._pushUndo();
    var decision = {
      id: generateId(),
      title: options.title !== undefined ? options.title : 'New Decision',
      description: options.description !== undefined ? options.description : '',
      decisionNeededBy: options.decisionNeededBy !== undefined ? options.decisionNeededBy : null,
      owner: options.owner !== undefined ? options.owner : '',
      status: options.status !== undefined ? options.status : 'Pending',
      decisionMade: options.decisionMade !== undefined ? options.decisionMade : '',
      dateDecided: options.dateDecided !== undefined ? options.dateDecided : null
    };
    this.decisions.push(decision);
    return decision;
  };

  Project.prototype.updateDecision = function(id, patch, who) {
    var decision = this.decisions.find(function(d) { return d.id === id; });
    if (!decision) throw new Error('Decision not found: ' + id);
    this._pushUndo();
    var entries = Object.entries(patch);
    for (var i = 0; i < entries.length; i++) {
      var field = entries[i][0];
      var value = entries[i][1];
      var old = decision[field];
      decision[field] = value;
      this._audit(who, id, field, old, value);
    }
    return decision;
  };

  Project.prototype.deleteDecision = function(id, who) {
    if (!this.decisions.some(function(d) { return d.id === id; })) throw new Error('Decision not found: ' + id);
    this._pushUndo();
    this.decisions = this.decisions.filter(function(d) { return d.id !== id; });
    this._audit(who, id, 'deleted', null, true);
  };

  Project.prototype.addActivityGroup = function(options) {
    options = options || {};
    this._pushUndo();
    var group = {
      id: generateId(),
      name: options.name !== undefined ? options.name : '',
      color: options.color !== undefined ? options.color : '#0b1f6b'
    };
    this.activityGroups.push(group);
    return group;
  };

  Project.prototype.updateActivityGroup = function(id, patch) {
    var group = this.activityGroups.find(function(g) { return g.id === id; });
    if (!group) throw new Error('Activity group not found: ' + id);
    this._pushUndo();
    Object.assign(group, patch);
    return group;
  };

  Project.prototype.deleteActivityGroup = function(id) {
    if (!this.activityGroups.some(function(g) { return g.id === id; })) throw new Error('Activity group not found: ' + id);
    this._pushUndo();
    this.activityGroups = this.activityGroups.filter(function(g) { return g.id !== id; });
    this.activities.forEach(function(a) {
      a.groupIds = a.groupIds.filter(function(gid) { return gid !== id; });
    });
  };

  Project.prototype.addActivity = function(options) {
    options = options || {};
    this._pushUndo();
    var activity = {
      id: generateId(),
      type: options.type !== undefined ? options.type : 'Meeting',
      name: options.name !== undefined ? options.name : '',
      dateStart: options.dateStart !== undefined ? options.dateStart : null,
      dateEnd: options.dateEnd ? options.dateEnd : (options.dateStart !== undefined ? options.dateStart : null),
      timeStart: options.timeStart !== undefined ? options.timeStart : null,
      timeEnd: options.timeEnd !== undefined ? options.timeEnd : null,
      groupIds: options.groupIds ? options.groupIds.slice() : [],
      keyDate: !!options.keyDate,
      remarks: options.remarks !== undefined ? options.remarks : '',
    };
    this.activities.push(activity);
    return activity;
  };

  Project.prototype.addActivities = function(specs) {
    this._pushUndo();
    var self = this;
    return specs.map(function(spec) {
      var activity = {
        id: generateId(), type: spec.type, name: spec.name,
        dateStart: spec.dateStart, dateEnd: spec.dateEnd || spec.dateStart,
        timeStart: spec.timeStart || null, timeEnd: spec.timeEnd || null,
        groupIds: (spec.groupIds || []).slice(), keyDate: !!spec.keyDate, remarks: spec.remarks || '',
      };
      self.activities.push(activity);
      return activity;
    });
  };

  Project.prototype.updateActivity = function(id, patch) {
    var activity = this.activities.find(function(a) { return a.id === id; });
    if (!activity) throw new Error('Activity not found: ' + id);
    this._pushUndo();
    Object.assign(activity, patch);
    return activity;
  };

  Project.prototype.deleteActivity = function(id) {
    if (!this.activities.some(function(a) { return a.id === id; })) throw new Error('Activity not found: ' + id);
    this._pushUndo();
    this.activities = this.activities.filter(function(a) { return a.id !== id; });
  };

  function describeChange(before, after) {
    var beforeById = new Map(before.tasks.map(function(t) { return [t.id, t]; }));
    var afterById = new Map(after.tasks.map(function(t) { return [t.id, t]; }));

    var added = after.tasks.filter(function(t) { return !beforeById.has(t.id); });
    var removed = before.tasks.filter(function(t) { return !afterById.has(t.id); });

    if (added.length === 1 && removed.length === 0) return 'Add \'' + added[0].name + '\'';
    if (added.length > 1 && removed.length === 0) return 'Add ' + added.length + ' tasks';
    if (removed.length === 1 && added.length === 0) return 'Delete \'' + removed[0].name + '\'';
    if (removed.length > 1 && added.length === 0) return 'Delete ' + removed.length + ' tasks';

    var changedTasks = [];
    beforeById.forEach(function(beforeTask, id) {
      var afterTask = afterById.get(id);
      if (!afterTask) return;
      var fields = Object.keys(afterTask).filter(function(k) { return JSON.stringify(afterTask[k]) !== JSON.stringify(beforeTask[k]); });
      if (fields.length) changedTasks.push({ task: afterTask, fields: fields });
    });

    if (changedTasks.length === 1 && changedTasks[0].fields.length === 1) {
      return 'Change ' + changedTasks[0].fields[0] + ' on \'' + changedTasks[0].task.name + '\'';
    }
    if (changedTasks.length === 1) {
      return 'Change ' + changedTasks[0].fields.length + ' fields on \'' + changedTasks[0].task.name + '\'';
    }
    if (changedTasks.length > 1) {
      return 'Change ' + changedTasks.length + ' tasks';
    }

    if (JSON.stringify(before.holidays) !== JSON.stringify(after.holidays)) return 'Change holidays';
    if (JSON.stringify(before.picList) !== JSON.stringify(after.picList)) return 'Change PIC list';
    if (JSON.stringify(before.snapshots) !== JSON.stringify(after.snapshots)) return 'Take snapshot';
    if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) return 'Change settings';

    return 'Change';
  }

  return { Project: Project, generateId: generateId, findIncompleteTasks: findIncompleteTasks, findTasksMissingOwner: findTasksMissingOwner, describeChange: describeChange, computeLastUpdated: computeLastUpdated, migrateEstimatorToGeneric: migrateEstimatorToGeneric };
});
