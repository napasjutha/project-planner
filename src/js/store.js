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

  function findIncompleteTasks(project) {
    const parentIds = new Set(project.tasks.map(t => t.parentId).filter(Boolean));
    return project.tasks.filter(t => {
      if (parentIds.has(t.id)) return false;
      return !t.plannedStart || !t.plannedFinish;
    });
  }

  function findTasksMissingOwner(project) {
    return project.tasks.filter(t => !t.owner || !t.owner.trim());
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
      this.auditLog = data.auditLog;
      this.settings = data.settings;
      this._undoStack = [];
      this._redoStack = [];
      this.tasks.forEach(t => {
        if (t.owner === undefined) {
          t.owner = t.pic || '';
          t.pic = '';
        }
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
        auditLog: [],
        settings: { theme: 'kpmg-light', ganttZoom: 'week' },
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
        auditLog: this.auditLog,
        settings: this.settings,
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
      this.auditLog = state.auditLog;
      this.settings = state.settings;
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
        deliverable: '', jira: '', remarks: '',
        plannedStart: null, plannedFinish: null,
        actualStart: null, actualFinish: null,
        actualPct: 0, weightOverride: null, milestone: false,
        statusOverride: null, predecessors: [], collapsed: false,
        billingAmount: null, billingStatus: null,
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
          deliverable: '', jira: '', remarks: spec.remarks || '',
          plannedStart: spec.plannedStart || null, plannedFinish: spec.plannedFinish || null,
          actualStart: null, actualFinish: null,
          actualPct: 0, weightOverride: null, milestone: !!spec.milestone,
          statusOverride: null, predecessors: spec.predecessors ? spec.predecessors.slice() : [],
          collapsed: false,
          billingAmount: spec.billingAmount != null ? spec.billingAmount : null,
          billingStatus: spec.billingStatus || null,
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
  }

  return { Project, generateId, findIncompleteTasks, findTasksMissingOwner, computeLastUpdated };
});
