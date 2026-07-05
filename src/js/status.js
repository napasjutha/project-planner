(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  const STATUS = {
    COMPLETE: 'Complete',
    NOT_START: 'Not Start',
    IN_PROGRESS: 'In Progress',
    DELAYED: 'Delayed',
    BLOCKED: 'Blocked',
    CANCELLED: 'Cancelled',
  };

  function deriveStatus({ actualPct, plannedStart, plannedFinish, statusDate, statusOverride }) {
    if (statusOverride === 'Blocked') return STATUS.BLOCKED;
    if (statusOverride === 'Cancelled') return STATUS.CANCELLED;
    if (actualPct >= 1) return STATUS.COMPLETE;
    if (!plannedStart || statusDate < plannedStart) return STATUS.NOT_START;
    if (plannedFinish && statusDate >= plannedStart && statusDate <= plannedFinish) return STATUS.IN_PROGRESS;
    return STATUS.DELAYED;
  }

  return { STATUS, deriveStatus };
});
