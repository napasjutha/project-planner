(function () {
  'use strict';

  function closePicker() {
    var existing = document.querySelector('.deliverable-picker');
    if (existing) existing.remove();
  }

  function openDeliverablePicker(state, billingMilestoneId, anchorEl, onCommitted) {
    closePicker();

    var candidates = state.project.tasks.filter(function (t) { return t.deliverable === true; });
    var pending = new Set(candidates
      .filter(function (t) { return t.billingMilestoneId === billingMilestoneId; })
      .map(function (t) { return t.id; }));
    var initial = new Set(pending);

    var picker = document.createElement('div');
    picker.className = 'deliverable-picker';

    var search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Search deliverables...';
    picker.appendChild(search);

    var list = document.createElement('div');
    list.className = 'deliverable-picker-list';
    picker.appendChild(list);

    function renderList(filter) {
      list.innerHTML = '';
      var needle = (filter || '').toLowerCase();
      candidates.forEach(function (t) {
        var computed = state.calc.computed.get(t.id);
        var wbs = computed ? computed.wbs : '';
        var labelText = wbs + ' ' + t.name;
        if (needle && labelText.toLowerCase().indexOf(needle) === -1) return;
        var item = document.createElement('label');
        item.className = 'deliverable-picker-item';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = pending.has(t.id);
        cb.addEventListener('change', function () {
          if (cb.checked) pending.add(t.id); else pending.delete(t.id);
        });
        var span = document.createElement('span');
        span.textContent = labelText;
        item.appendChild(cb);
        item.appendChild(span);
        list.appendChild(item);
      });
    }
    renderList('');
    search.addEventListener('input', function () { renderList(search.value); });

    var rect = anchorEl.getBoundingClientRect();
    picker.style.left = rect.left + 'px';
    picker.style.top = rect.bottom + 4 + 'px';
    document.body.appendChild(picker);
    var prect = picker.getBoundingClientRect();
    picker.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - prect.width - 4)) + 'px';
    picker.style.top = Math.max(4, Math.min(rect.bottom + 4, window.innerHeight - prect.height - 4)) + 'px';
    search.focus();

    function commitAndClose() {
      document.removeEventListener('mousedown', onOutside, true);
      picker.remove();
      var changed = pending.size !== initial.size ||
        Array.from(pending).some(function (id) { return !initial.has(id); });
      if (changed) {
        state.project.assignDeliverablesToBillingMilestone(billingMilestoneId, Array.from(pending), state.currentUser);
        onCommitted();
      }
    }

    function onOutside(e) {
      if (!picker.contains(e.target)) commitAndClose();
    }
    document.addEventListener('mousedown', onOutside, true);
  }

  window.PP = window.PP || {};
  window.PP.openDeliverablePicker = openDeliverablePicker;
})();
