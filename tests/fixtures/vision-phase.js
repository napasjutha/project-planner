function leaf(id, name, pic, plannedStart, plannedFinish, actualPct) {
  return {
    id, parentId: 'phase-1', order: Number(id.split('-')[1]),
    name, pic, deliverable: '', jira: '', remarks: '',
    plannedStart, plannedFinish, actualStart: plannedStart, actualFinish: plannedFinish,
    actualPct, weightOverride: null, milestone: false, statusOverride: null,
    predecessors: [], collapsed: false,
  };
}

const phase = {
  id: 'phase-1', parentId: null, order: 0,
  name: 'Vision & Validate', pic: '', deliverable: '', jira: '', remarks: '',
  plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null,
  actualPct: 0, weightOverride: null, milestone: false, statusOverride: null,
  predecessors: [], collapsed: false,
};

const tasks = [
  phase,
  leaf('t-1', 'Request related BP document', 'KPMG_BA', '2024-01-15', '2024-01-16', 1),
  leaf('t-2', 'Review As-Is BP document from SAP', 'KPMG_BA', '2024-01-16', '2024-01-26', 1),
  leaf('t-3', 'Prepare project plan and organization', 'KPMG_BA', '2024-01-22', '2024-01-26', 1),
  leaf('t-4', 'Project plan approval and signoff', 'KPMG_BA', '2024-02-21', '2024-02-21', 1),
  leaf('t-5', 'Field service design thinking workshop', 'KPMG_BA', '2024-01-25', '2024-01-25', 1),
  leaf('t-6', 'Finalize Kick-off deck', 'KPMG_PM', '2024-01-29', '2024-01-31', 1),
  leaf('t-7', 'Initial 1st draft customer journey', 'KPMG_BA', '2024-02-15', '2024-02-23', 1),
  leaf('t-8', 'Confirm kick-off agenda', 'KPMG_BA', '2024-01-29', '2024-01-31', 1),
  leaf('t-9', 'Conduct kick-off meeting', 'KPMG_BA', '2024-02-02', '2024-02-02', 1),
  leaf('t-10', 'Review customer journey workshop', 'KPMG_BA', '2024-02-23', '2024-03-04', 1),
  leaf('t-11', 'Confirm customer journey', 'KPMG_BA', '2024-02-27', '2024-03-04', 1),
  leaf('t-12', 'Confirm customer journey document submission', 'KPMG_BA', '2024-03-04', '2024-03-04', 1),
];

// Durations verified against the workbook's computed column I (NETWORKDAYS with
// 2024 holidays applied): 2, 9, 5, 1, 1, 3, 7, 3, 1, 6, 5, 1 -- sum = 44.
const EXPECTED_DURATIONS = { 't-1': 2, 't-2': 9, 't-3': 5, 't-4': 1, 't-5': 1, 't-6': 3, 't-7': 7, 't-8': 3, 't-9': 1, 't-10': 6, 't-11': 5, 't-12': 1 };
const TOTAL_DURATION = 44;

module.exports = { tasks, phase, EXPECTED_DURATIONS, TOTAL_DURATION };
