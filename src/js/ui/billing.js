(function () {
  'use strict';

  var BILLING_STATUSES = ['Not Billed', 'Invoiced', 'Paid'];

  function renderBilling(state) {
    var body = document.getElementById('billing-body');
    body.innerHTML = '';

    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var deliverables = state.project.tasks.filter(function (t) { return t.deliverable; });

    if (!deliverables.length) {
      body.textContent = 'No deliverable tasks yet — billing only applies to tasks flagged as deliverables.';
      return;
    }

    var table = document.createElement('table');
    table.className = 'billing-table';
    var headerRow = document.createElement('tr');
    ['WBS', 'Task', 'Owner', 'PIC', 'Billing Amount', 'Billing Status'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    deliverables.forEach(function (task) {
      var computed = state.calc.computed.get(task.id);
      var tr = document.createElement('tr');
      tr.dataset.id = task.id;

      var wbsTd = document.createElement('td');
      wbsTd.textContent = computed ? computed.wbs : '';
      tr.appendChild(wbsTd);

      var nameTd = document.createElement('td');
      nameTd.textContent = task.name;
      tr.appendChild(nameTd);

      var ownerTd = document.createElement('td');
      ownerTd.textContent = task.owner || '';
      tr.appendChild(ownerTd);

      var picTd = document.createElement('td');
      picTd.textContent = task.pic || '';
      tr.appendChild(picTd);

      var amountTd = document.createElement('td');
      var amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.min = '0';
      amountInput.value = task.billingAmount != null ? task.billingAmount : '';
      amountInput.dataset.field = 'billingAmount';
      amountTd.appendChild(amountInput);
      tr.appendChild(amountTd);

      var statusTd = document.createElement('td');
      var statusSelect = document.createElement('select');
      statusSelect.dataset.field = 'billingStatus';
      BILLING_STATUSES.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (task.billingStatus === opt) option.selected = true;
        statusSelect.appendChild(option);
      });
      statusTd.appendChild(statusSelect);
      tr.appendChild(statusTd);

      table.appendChild(tr);
    });

    body.appendChild(table);
  }

  function wireBilling(state, onChanged) {
    document.getElementById('billing-body').addEventListener('change', function (e) {
      var field = e.target.dataset.field;
      if (!field) return;
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var id = tr.dataset.id;
      var value = e.target.value;
      if (field === 'billingAmount') {
        value = value === '' ? null : Number(value);
      }
      var patch = {};
      patch[field] = value;
      state.project.updateTask(id, patch, state.currentUser);
      onChanged();
    });
  }

  window.PP = window.PP || {};
  window.PP.renderBilling = renderBilling;
  window.PP.wireBilling = wireBilling;
})();
