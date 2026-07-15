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
    const parentIds = new Set(project.tasks.map(t => t.parentId).filter(Boolean));
    return project.tasks.filter(t => {
      if (parentIds.has(t.id)) return false;
      return !t.plannedStart || !t.plannedFinish;
    });
  }

  function findTasksMissingOwner(project) {
    const parentIds = new Set(project.tasks.map(t => t.parentId).filter(Boolean));
    return project.tasks.filter(t => {
      if (parentIds.has(t.id)) return false;
      return !t.owner || !t.owner.trim();
    });
  }

  function computeLastUpdated(project) {
    const result = new Map();
    project.auditLog.forEach(entry => {
      result.set(entry.taskId, { who: entry.who, when: entry.when });
    });
    return result;
  }

  class Project {
    constructor(data) {
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
      this._undoStack = [];
      this._redoStack = [];
      this.tasks.forEach(t => {
        if (t.owner === undefined) {
          t.owner = t.pic || '';
          t.pic = '';
        }
        if (t.milestone !== undefined) {
          t.deliverable = !!t.milestone;
          delete t.milestone;
        }
        if (t.billingAmount != null || t.billingStatus != null) {
          const bm = {
            id: generateBillingMilestoneId(), name: t.name,
            amount: t.billingAmount != null ? t.billingAmount : null,
            status: t.billingStatus || 'Not Billed',
          };
          this.billingMilestones.push(bm);
          t.billingMilestoneId = bm.id;
        } else if (t.billingMilestoneId === undefined) {
          t.billingMilestoneId = null;
        }
        delete t.billingAmount;
        delete t.billingStatus;
      });
    }

    static empty(name) {
      const now = new Date().toISOString();
      return new Project({
        meta: {
          id: generateId(), name, statusDate: now.slice(0, 10),
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
      });
    }

    static fromJSON(json) {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      return new Project(data);
    }

    toJSON() {
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
      };
    }

    serialize() {
      this.meta.revision += 1;
      return JSON.stringify(this.toJSON());
    }

    _snapshotState() {
      return JSON.parse(JSON.stringify(this.toJSON()));
    }

    _pushUndo() {
      this._undoStack.push(this._snapshotState());
      if (this._undoStack.length > 50) this._undoStack.shift();
      this._redoStack = [];
    }

    _applyState(state) {
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
    }

    undo() {
      if (this._undoStack.length === 0) return false;
      this._redoStack.push(this._snapshotState());
      this._applyState(this._undoStack.pop());
      return true;
    }

    redo() {
      if (this._redoStack.length === 0) return false;
      this._undoStack.push(this._snapshotState());
      this._applyState(this._redoStack.pop());
      return true;
    }

    _subtreeIds(id) {
      const ids = new Set([id]);
      let added = true;
      while (added) {
        added = false;
        for (const t of this.tasks) {
          if (ids.has(t.parentId) && !ids.has(t.id)) {
            ids.add(t.id);
            added = true;
          }
        }
      }
      return ids;
    }

    _audit(who, taskId, field, oldValue, newValue) {
      this.auditLog.push({
        when: new Date().toISOString(), who: who || 'unknown',
        taskId, field, old: oldValue, new: newValue,
      });
      if (this.auditLog.length > 2000) this.auditLog.shift();
    }

    addTask({ parentId = null, name = 'New Task', owner = '', pic = '' }) {
      this._pushUndo();
      const siblings = this.tasks.filter(t => t.parentId === parentId);
      const task = {
        id: generateId(), parentId, order: siblings.length, name, owner, pic,
        jira: '', remarks: '',
        plannedStart: null, plannedFinish: null,
        actualStart: null, actualFinish: null,
        actualPct: 0, weightOverride: null, deliverable: false,
        statusOverride: null, predecessors: [], collapsed: false,
        billingMilestoneId: null,
      };
      this.tasks.push(task);
      return task;
    }

    addTasks(taskSpecs, who) {
      this._pushUndo();
      const created = [];
      taskSpecs.forEach(spec => {
        let parentId = null;
        for (let i = created.length - 1; i >= 0; i--) {
          if (taskSpecs[i]._level < spec._level) {
            parentId = created[i].id;
            break;
          }
        }
        const siblings = this.tasks.filter(t => t.parentId === parentId);
        const task = {
          id: generateId(), parentId, order: siblings.length,
          name: spec.name, owner: spec.owner || '', pic: spec.pic || '',
          jira: '', remarks: spec.remarks || '',
          plannedStart: spec.plannedStart || null, plannedFinish: spec.plannedFinish || null,
          actualStart: null, actualFinish: null,
          actualPct: 0, weightOverride: null, deliverable: !!spec.deliverable,
          statusOverride: null, predecessors: spec.predecessors ? spec.predecessors.slice() : [],
          collapsed: false,
          billingMilestoneId: null,
        };
        this.tasks.push(task);
        created.push(task);
      });
      this._audit(who, null, 'csvImport', null, created.length + ' task(s) imported');
      return created;
    }

    updateTask(id, patch, who) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      this._pushUndo();
      for (const [field, value] of Object.entries(patch)) {
        const old = task[field];
        task[field] = value;
        this._audit(who, id, field, old, value);
      }
      return task;
    }

    updateTasks(patches, who) {
      this._pushUndo();
      patches.forEach(function (entry) {
        const task = this.tasks.find(t => t.id === entry.id);
        if (!task) throw new Error(`Task not found: ${entry.id}`);
        for (const [field, value] of Object.entries(entry.patch)) {
          const old = task[field];
          task[field] = value;
          this._audit(who, entry.id, field, old, value);
        }
      }, this);
    }

    deleteTask(id, who) {
      if (!this.tasks.some(t => t.id === id)) throw new Error(`Task not found: ${id}`);
      this._pushUndo();
      const toDelete = this._subtreeIds(id);
      this.tasks = this.tasks.filter(t => !toDelete.has(t.id));
      this._audit(who, id, 'deleted', null, true);
    }

    moveTask(id, newParentId, newOrder, who) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      if (newParentId != null && this._subtreeIds(id).has(newParentId)) {
        throw new Error('Cannot move a task into its own descendant');
      }
      this._pushUndo();
      const oldParentId = task.parentId;
      task.parentId = newParentId;
      const siblings = this.tasks
        .filter(t => t.parentId === newParentId && t.id !== id)
        .sort((a, b) => a.order - b.order);
      siblings.splice(newOrder, 0, task);
      siblings.forEach((t, i) => { t.order = i; });
      if (oldParentId !== newParentId) {
        const oldSiblings = this.tasks
          .filter(t => t.parentId === oldParentId)
          .sort((a, b) => a.order - b.order);
        oldSiblings.forEach((t, i) => { t.order = i; });
      }
      this._audit(who, id, 'parentId', oldParentId, newParentId);
    }

    indent(id, who) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      const siblings = this.tasks
        .filter(t => t.parentId === task.parentId)
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex(t => t.id === id);
      if (idx <= 0) return false;
      const newParent = siblings[idx - 1];
      const newParentChildCount = this.tasks.filter(t => t.parentId === newParent.id).length;
      this.moveTask(id, newParent.id, newParentChildCount, who);
      return true;
    }

    outdent(id, who) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      if (task.parentId === null) return false;
      const parent = this.tasks.find(t => t.id === task.parentId);
      const grandParentId = parent ? parent.parentId : null;
      const newOrder = parent ? parent.order + 1 : 0;
      this.moveTask(id, grandParentId, newOrder, who);
      return true;
    }

    toggleCollapse(id) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.collapsed = !task.collapsed;
    }

    setAllCollapsed(collapsed) {
      this.tasks.forEach(t => {
        if (this.tasks.some(c => c.parentId === t.id)) t.collapsed = collapsed;
      });
    }

    addBillingMilestone() {
      this._pushUndo();
      const bm = { id: generateBillingMilestoneId(), name: 'New Billing Milestone', amount: null, status: 'Not Billed' };
      this.billingMilestones.push(bm);
      return bm;
    }

    updateBillingMilestone(id, patch, who) {
      const bm = this.billingMilestones.find(b => b.id === id);
      if (!bm) throw new Error(`Billing milestone not found: ${id}`);
      this._pushUndo();
      for (const [field, value] of Object.entries(patch)) {
        const old = bm[field];
        bm[field] = value;
        this._audit(who, id, field, old, value);
      }
      return bm;
    }

    deleteBillingMilestone(id, who) {
      if (!this.billingMilestones.some(b => b.id === id)) throw new Error(`Billing milestone not found: ${id}`);
      this._pushUndo();
      this.billingMilestones = this.billingMilestones.filter(b => b.id !== id);
      this.tasks.forEach(t => {
        if (t.billingMilestoneId === id) t.billingMilestoneId = null;
      });
      this._audit(who, id, 'deleted', null, true);
    }

    assignDeliverablesToBillingMilestone(billingMilestoneId, taskIds, who) {
      this._pushUndo();
      const idSet = new Set(taskIds);
      this.tasks.forEach(t => {
        if (idSet.has(t.id)) {
          if (t.billingMilestoneId !== billingMilestoneId) {
            this._audit(who, t.id, 'billingMilestoneId', t.billingMilestoneId, billingMilestoneId);
            t.billingMilestoneId = billingMilestoneId;
          }
        } else if (t.billingMilestoneId === billingMilestoneId) {
          this._audit(who, t.id, 'billingMilestoneId', t.billingMilestoneId, null);
          t.billingMilestoneId = null;
        }
      });
    }

    addIssue({ title = 'New Issue', description = '', owner = '', status = 'Open', dateRaised = null, dateResolved = null } = {}) {
      this._pushUndo();
      const issue = { id: generateId(), title, description, owner, status, dateRaised, dateResolved };
      this.issues.push(issue);
      return issue;
    }

    updateIssue(id, patch, who) {
      const issue = this.issues.find(i => i.id === id);
      if (!issue) throw new Error(`Issue not found: ${id}`);
      this._pushUndo();
      for (const [field, value] of Object.entries(patch)) {
        const old = issue[field];
        issue[field] = value;
        this._audit(who, id, field, old, value);
      }
      return issue;
    }

    deleteIssue(id, who) {
      if (!this.issues.some(i => i.id === id)) throw new Error(`Issue not found: ${id}`);
      this._pushUndo();
      this.issues = this.issues.filter(i => i.id !== id);
      this._audit(who, id, 'deleted', null, true);
    }

    addRisk({ title = 'New Risk', description = '', likelihood = 'Low', impact = 'Low', mitigation = '', owner = '', status = 'Open', dateRaised = null } = {}) {
      this._pushUndo();
      const risk = { id: generateId(), title, description, likelihood, impact, mitigation, owner, status, dateRaised };
      this.risks.push(risk);
      return risk;
    }

    updateRisk(id, patch, who) {
      const risk = this.risks.find(r => r.id === id);
      if (!risk) throw new Error(`Risk not found: ${id}`);
      this._pushUndo();
      for (const [field, value] of Object.entries(patch)) {
        const old = risk[field];
        risk[field] = value;
        this._audit(who, id, field, old, value);
      }
      return risk;
    }

    deleteRisk(id, who) {
      if (!this.risks.some(r => r.id === id)) throw new Error(`Risk not found: ${id}`);
      this._pushUndo();
      this.risks = this.risks.filter(r => r.id !== id);
      this._audit(who, id, 'deleted', null, true);
    }

    addDecision({ title = 'New Decision', description = '', decisionNeededBy = null, owner = '', status = 'Pending', decisionMade = '', dateDecided = null } = {}) {
      this._pushUndo();
      const decision = { id: generateId(), title, description, decisionNeededBy, owner, status, decisionMade, dateDecided };
      this.decisions.push(decision);
      return decision;
    }

    updateDecision(id, patch, who) {
      const decision = this.decisions.find(d => d.id === id);
      if (!decision) throw new Error(`Decision not found: ${id}`);
      this._pushUndo();
      for (const [field, value] of Object.entries(patch)) {
        const old = decision[field];
        decision[field] = value;
        this._audit(who, id, field, old, value);
      }
      return decision;
    }

    deleteDecision(id, who) {
      if (!this.decisions.some(d => d.id === id)) throw new Error(`Decision not found: ${id}`);
      this._pushUndo();
      this.decisions = this.decisions.filter(d => d.id !== id);
      this._audit(who, id, 'deleted', null, true);
    }

    addActivityGroup({ name = '', color = '#0b1f6b' } = {}) {
      this._pushUndo();
      const group = { id: generateId(), name, color };
      this.activityGroups.push(group);
      return group;
    }

    updateActivityGroup(id, patch) {
      const group = this.activityGroups.find(g => g.id === id);
      if (!group) throw new Error(`Activity group not found: ${id}`);
      this._pushUndo();
      Object.assign(group, patch);
      return group;
    }

    deleteActivityGroup(id) {
      if (!this.activityGroups.some(g => g.id === id)) throw new Error(`Activity group not found: ${id}`);
      this._pushUndo();
      this.activityGroups = this.activityGroups.filter(g => g.id !== id);
      this.activities.forEach(a => {
        a.groupIds = a.groupIds.filter(gid => gid !== id);
      });
    }

    addActivity({ type = 'Meeting', name = '', dateStart = null, dateEnd = null, timeStart = null, timeEnd = null, groupIds = [], keyDate = false, remarks = '' } = {}) {
      this._pushUndo();
      const activity = {
        id: generateId(), type, name,
        dateStart, dateEnd: dateEnd || dateStart,
        timeStart: timeStart || null, timeEnd: timeEnd || null,
        groupIds: groupIds.slice(), keyDate: !!keyDate, remarks,
      };
      this.activities.push(activity);
      return activity;
    }

    addActivities(specs) {
      this._pushUndo();
      return specs.map(spec => {
        const activity = {
          id: generateId(), type: spec.type, name: spec.name,
          dateStart: spec.dateStart, dateEnd: spec.dateEnd || spec.dateStart,
          timeStart: spec.timeStart || null, timeEnd: spec.timeEnd || null,
          groupIds: (spec.groupIds || []).slice(), keyDate: !!spec.keyDate, remarks: spec.remarks || '',
        };
        this.activities.push(activity);
        return activity;
      });
    }

    updateActivity(id, patch) {
      const activity = this.activities.find(a => a.id === id);
      if (!activity) throw new Error(`Activity not found: ${id}`);
      this._pushUndo();
      Object.assign(activity, patch);
      return activity;
    }

    deleteActivity(id) {
      if (!this.activities.some(a => a.id === id)) throw new Error(`Activity not found: ${id}`);
      this._pushUndo();
      this.activities = this.activities.filter(a => a.id !== id);
    }
  }

  function describeChange(before, after) {
    const beforeById = new Map(before.tasks.map(t => [t.id, t]));
    const afterById = new Map(after.tasks.map(t => [t.id, t]));

    const added = after.tasks.filter(t => !beforeById.has(t.id));
    const removed = before.tasks.filter(t => !afterById.has(t.id));

    if (added.length === 1 && removed.length === 0) return `Add '${added[0].name}'`;
    if (added.length > 1 && removed.length === 0) return `Add ${added.length} tasks`;
    if (removed.length === 1 && added.length === 0) return `Delete '${removed[0].name}'`;
    if (removed.length > 1 && added.length === 0) return `Delete ${removed.length} tasks`;

    const changedTasks = [];
    for (const [id, afterTask] of afterById) {
      const beforeTask = beforeById.get(id);
      if (!beforeTask) continue;
      const fields = Object.keys(afterTask).filter(k => JSON.stringify(afterTask[k]) !== JSON.stringify(beforeTask[k]));
      if (fields.length) changedTasks.push({ task: afterTask, fields });
    }

    if (changedTasks.length === 1 && changedTasks[0].fields.length === 1) {
      return `Change ${changedTasks[0].fields[0]} on '${changedTasks[0].task.name}'`;
    }
    if (changedTasks.length === 1) {
      return `Change ${changedTasks[0].fields.length} fields on '${changedTasks[0].task.name}'`;
    }
    if (changedTasks.length > 1) {
      return `Change ${changedTasks.length} tasks`;
    }

    if (JSON.stringify(before.holidays) !== JSON.stringify(after.holidays)) return 'Change holidays';
    if (JSON.stringify(before.picList) !== JSON.stringify(after.picList)) return 'Change PIC list';
    if (JSON.stringify(before.snapshots) !== JSON.stringify(after.snapshots)) return 'Take snapshot';
    if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) return 'Change settings';

    return 'Change';
  }

  return { Project, generateId, findIncompleteTasks, findTasksMissingOwner, describeChange, computeLastUpdated };
});
