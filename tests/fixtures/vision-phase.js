function leaf(id, name, pic, plannedStart, plannedFinish, actualPct) {
  return {
    id, parentId: 'phase-1', order: Number(id.split('-')[1]),
    name, pic, jira: '', remarks: '',
    plannedStart, plannedFinish, actualStart: plannedStart, actualFinish: plannedFinish,
    actualPct, weightOverride: null, deliverable: false, statusOverride: null,
    predecessors: [], collapsed: false,
  };
}

const phase = {
  id: 'phase-1', parentId: null, order: 0,
  name: 'Vision & Validate', pic: '', jira: '', remarks: '',
  plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null,
  actualPct: 0, weightOverride: null, deliverable: false, statusOverride: null,
  predecessors: [], collapsed: false,
};

const tasks = [
  phase,
  leaf('t-1', 'Task 1', 'Consultant A', '2024-01-15', '2024-01-16', 1),
  leaf('t-2', 'Task 2', 'Consultant A', '2024-01-16', '2024-01-26', 1),
  leaf('t-3', 'Task 3', 'Consultant A', '2024-01-22', '2024-01-26', 1),
  leaf('t-4', 'Task 4', 'Consultant A', '2024-02-21', '2024-02-21', 1),
  leaf('t-5', 'Task 5', 'Consultant A', '2024-01-25', '2024-01-25', 1),
  leaf('t-6', 'Task 6', 'Project Manager', '2024-01-29', '2024-01-31', 1),
  leaf('t-7', 'Task 7', 'Consultant A', '2024-02-15', '2024-02-23', 1),
  leaf('t-8', 'Task 8', 'Consultant A', '2024-01-29', '2024-01-31', 1),
  leaf('t-9', 'Task 9', 'Consultant A', '2024-02-02', '2024-02-02', 1),
  leaf('t-10', 'Task 10', 'Consultant A', '2024-02-23', '2024-03-04', 1),
  leaf('t-11', 'Task 11', 'Consultant A', '2024-02-27', '2024-03-04', 1),
  leaf('t-12', 'Task 12', 'Consultant A', '2024-03-04', '2024-03-04', 1),
];

// Synthetic dates chosen to exercise NETWORKDAYS across multiple 2024 holiday
// scenarios (single-day spans, multi-week spans, spans crossing holidays).
// Expected durations below are the known-correct NETWORKDAYS result for each
// span, used as a truth-table to verify the engine: 2, 9, 5, 1, 1, 3, 7, 3, 1, 6, 5, 1 -- sum = 44.
const EXPECTED_DURATIONS = { 't-1': 2, 't-2': 9, 't-3': 5, 't-4': 1, 't-5': 1, 't-6': 3, 't-7': 7, 't-8': 3, 't-9': 1, 't-10': 6, 't-11': 5, 't-12': 1 };
const TOTAL_DURATION = 44;

module.exports = { tasks, phase, EXPECTED_DURATIONS, TOTAL_DURATION };
