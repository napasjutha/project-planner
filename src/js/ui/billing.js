(function () {
  'use strict';

  var BILLING_STATUSES = ['Not Billed', 'Invoiced', 'Paid'];

  function renderBilling(state) {
    var body = document.getElementById('billing-body');
    body.innerHTML = '';

    var deliverables = state.project.tasks.filter(function (t) { return t.deliverable === true; });
    var linkedByMilestone = new Map();
    deliverables.forEach(function (t) {
      if (!t.billingMilestoneId) return;
      if (!linkedByMilestone.has(t.billingMilestoneId)) linkedByMilestone.set(t.billingMilestoneId, []);
      linkedByMilestone.get(t.billingMilestoneId).push(t);
    });

    var milestonesSection = document.createElement('div');
    milestonesSection.className = 'billing-section';
    var milestonesTitle = document.createElement('h3');
    milestonesTitle.textContent = 'Billing Milestones';
    milestonesSection.appendChild(milestonesTitle);

    if (!state.project.billingMilestones.length) {
      var emptyMsg = document.createElement('p');
      emptyMsg.textContent = 'No billing milestones yet — click "+ Add Billing Milestone" below to create one.';
      milestonesSection.appendChild(emptyMsg);
    }

    state.project.billingMilestones.forEach(function (bm) {
      var row = document.createElement('div');
      row.className = 'billing-milestone-row';
      row.dataset.id = bm.id;

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = bm.name;
      nameInput.dataset.field = 'name';
      row.appendChild(nameInput);

      var amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.min = '0';
      amountInput.value = bm.amount != null ? bm.amount : '';
      amountInput.dataset.field = 'amount';
      row.appendChild(amountInput);

      var statusSelect = document.createElement('select');
      statusSelect.dataset.field = 'status';
      BILLING_STATUSES.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (bm.status === opt) option.selected = true;
        statusSelect.appendChild(option);
      });
      row.appendChild(statusSelect);

      var assignButton = document.createElement('button');
      assignButton.type = 'button';
      assignButton.className = 'billing-assign-button';
      assignButton.textContent = 'Assign Deliverables';
      row.appendChild(assignButton);

      var deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'billing-delete-button';
      deleteButton.textContent = 'Delete';
      row.appendChild(deleteButton);

      var linked = linkedByMilestone.get(bm.id) || [];
      var linkedList = document.createElement('ul');
      linkedList.className = 'billing-linked-list';
      if (!linked.length) {
        var noneLi = document.createElement('li');
        noneLi.textContent = 'No deliverables linked yet.';
        linkedList.appendChild(noneLi);
      } else {
        linked.forEach(function (t) {
          var li = document.createElement('li');
          li.textContent = t.name;
          linkedList.appendChild(li);
        });
      }
      row.appendChild(linkedList);

      milestonesSection.appendChild(row);
    });

    var addButton = document.createElement('button');
    addButton.id = 'add-billing-milestone-button';
    addButton.type = 'button';
    addButton.textContent = '+ Add Billing Milestone';
    milestonesSection.appendChild(addButton);

    body.appendChild(milestonesSection);

    var unassignedSection = document.createElement('div');
    unassignedSection.className = 'billing-section';
    var unassignedTitle = document.createElement('h3');
    unassignedTitle.textContent = 'Unassigned Deliverables';
    unassignedSection.appendChild(unassignedTitle);

    var unassigned = deliverables.filter(function (t) { return !t.billingMilestoneId; });
    if (!deliverables.length) {
      var noDeliverablesMsg = document.createElement('p');
      noDeliverablesMsg.textContent = 'No deliverable tasks yet — billing only applies to tasks flagged as deliverables.';
      unassignedSection.appendChild(noDeliverablesMsg);
    } else if (!unassigned.length) {
      var allAssignedMsg = document.createElement('p');
      allAssignedMsg.textContent = 'Every deliverable is linked to a billing milestone.';
      unassignedSection.appendChild(allAssignedMsg);
    } else {
      var unassignedList = document.createElement('ul');
      unassignedList.className = 'billing-unassigned-list';
      unassigned.forEach(function (t) {
        var li = document.createElement('li');
        li.textContent = t.name;
        unassignedList.appendChild(li);
      });
      unassignedSection.appendChild(unassignedList);
    }
    body.appendChild(unassignedSection);
  }

  function wireBilling(state, onChanged) {
    var body = document.getElementById('billing-body');

    body.addEventListener('click', function (e) {
      if (e.target.id === 'add-billing-milestone-button') {
        state.project.addBillingMilestone();
        onChanged();
        return;
      }
      var row = e.target.closest('.billing-milestone-row');
      if (!row) return;
      var id = row.dataset.id;
      if (e.target.classList.contains('billing-assign-button')) {
        PP.openDeliverablePicker(state, id, e.target, onChanged);
        return;
      }
      if (e.target.classList.contains('billing-delete-button')) {
        state.project.deleteBillingMilestone(id, state.currentUser);
        onChanged();
        return;
      }
    });

    body.addEventListener('change', function (e) {
      var field = e.target.dataset.field;
      if (!field) return;
      var row = e.target.closest('.billing-milestone-row');
      if (!row) return;
      var id = row.dataset.id;
      var value = e.target.value;
      if (field === 'amount') {
        value = value === '' ? null : Number(value);
      }
      var patch = {};
      patch[field] = value;
      state.project.updateBillingMilestone(id, patch, state.currentUser);
      onChanged();
    });
  }

  window.PP = window.PP || {};
  window.PP.renderBilling = renderBilling;
  window.PP.wireBilling = wireBilling;
})();
