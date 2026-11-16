// ---------- Constants ----------
const TYPES = ['Incident', 'Work', 'Deployment', 'Test', 'Service Request'];
const STATUSES = ['Open', 'In Progress', 'Resolved'];

// ---------- Page state ----------
let tickets = [];
let activeType = 'All';
let statusFilter = 'All';
let searchText = '';

// ---------- Elements ----------
const tabsEl = document.getElementById('type-tabs');
const summaryEl = document.getElementById('summary');
const form = document.getElementById('ticket-form');
const typeInput = document.getElementById('f-type');
const titleInput = document.getElementById('f-title');
const priorityInput = document.getElementById('f-priority');
const statusInput = document.getElementById('f-status');
const assigneeInput = document.getElementById('f-assignee');
const searchInput = document.getElementById('search');
const statusFilterEl = document.getElementById('filter-status');
const tbody = document.getElementById('ticket-body');
const emptyMsg = document.getElementById('empty-msg');
const createdInput = document.getElementById('f-created');

// ---------- API calls ----------
async function loadTickets() {
  try {
    const res = await fetch('/api/tickets');
    if (!res.ok) throw new Error('Server responded with ' + res.status);
    tickets = await res.json();
    render();
  } catch (err) {
    console.error('Could not load tickets:', err);
    alert('Could not load tickets. Check that the server is running.');
  }
}

async function createTicket(data) {
  const res = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Create failed: ' + res.status);
  return res.json();
}

async function updateStatus(id, status) {
  const res = await fetch('/api/tickets/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: status })
  });
  if (!res.ok) throw new Error('Update failed: ' + res.status);
}

async function deleteTicket(id) {
  const res = await fetch('/api/tickets/' + id, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed: ' + res.status);
}

// ---------- Helpers ----------
function getVisibleTickets() {
  const query = searchText.toLowerCase();

  return tickets.filter(function (t) {
    const matchesType = activeType === 'All' || t.type === activeType;
    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    const matchesSearch =
      t.title.toLowerCase().includes(query) ||
      (t.assignee || '').toLowerCase().includes(query);

    return matchesType && matchesStatus && matchesSearch;
  });
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

// ---------- Rendering ----------
function renderTabs() {
  tabsEl.innerHTML = '';
  ['All', ...TYPES].forEach(function (name) {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.className = 'tab' + (name === activeType ? ' active' : '');
    btn.addEventListener('click', function () {
      activeType = name;
      render();
    });
    tabsEl.appendChild(btn);
  });
}

function renderSummary() {
  summaryEl.innerHTML = '';

  const scope = activeType === 'All'
    ? tickets
    : tickets.filter(t => t.type === activeType);

  const open = scope.filter(t => t.status !== 'Resolved').length;
  const critical = scope.filter(t => t.priority === 'Critical' && t.status !== 'Resolved').length;
  const resolved = scope.filter(t => t.status === 'Resolved').length;

  const cards = [
    { label: 'Total', value: scope.length, detail: 'All tickets in view' },
    { label: 'Open', value: open, detail: 'Not yet resolved' },
    { label: 'Critical', value: critical, detail: 'Unresolved critical' },
    { label: 'Resolved', value: resolved, detail: 'Completed' }
  ];

  cards.forEach(function (c) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="label">${c.label}</div>
      <div class="count">${c.value}</div>
      <div class="detail">${c.detail}</div>
    `;
    summaryEl.appendChild(card);
  });
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function setCreatedDate() {
  createdInput.value = todayISO();
  createdInput.max = todayISO(); // prevents picking a future date
}

function renderTable() {
  tbody.innerHTML = '';
  const visible = getVisibleTickets();
  emptyMsg.hidden = visible.length > 0;

  visible.forEach(function (t) {
    const row = document.createElement('tr');

    row.appendChild(cell(t.ticket_number || t.id));
    row.appendChild(cell(t.type));
    row.appendChild(cell(t.title));

    // Priority badge
    const priorityCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge priority-' + t.priority;
    badge.textContent = t.priority;
    priorityCell.appendChild(badge);
    row.appendChild(priorityCell);

    // Status dropdown
    const statusCell = document.createElement('td');
    const select = document.createElement('select');
    STATUSES.forEach(function (s) {
      const opt = document.createElement('option');
      opt.textContent = s;
      opt.value = s;
      opt.selected = s === t.status;
      select.appendChild(opt);
    });
    select.addEventListener('change', async function () {
      try {
        await updateStatus(t.id, select.value);
        await loadTickets();
      } catch (err) {
        console.error(err);
        alert('Could not update the status.');
      }
    });
    statusCell.appendChild(select);
    row.appendChild(statusCell);

    row.appendChild(cell(t.assignee || 'Unassigned'));
    row.appendChild(cell(formatDate(t.created_at)));

    // Delete button
    const actionCell = document.createElement('td');
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'delete-btn';
    del.addEventListener('click', async function () {
      try {
        await deleteTicket(t.id);
        await loadTickets();
      } catch (err) {
        console.error(err);
        alert('Could not delete the ticket.');
      }
    });
    actionCell.appendChild(del);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  });
}

function render() {
  renderTabs();
  renderSummary();
  renderTable();
}

// ---------- Events ----------
form.addEventListener('submit', async function (event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  if (title === '') return;

  if (!createdInput.value) {
    alert('Please choose a created date.');
    return;
  }

  try {
    await createTicket({
      type: typeInput.value,
      title: title,
      priority: priorityInput.value,
      status: statusInput.value,
      assignee: assigneeInput.value.trim() || null,
      created_at: createdInput.value
    });

    form.reset();
    priorityInput.value = 'Medium';
    statusInput.value = 'Open';
    setCreatedDate();
    await loadTickets();
  } catch (err) {
    console.error(err);
    alert('Could not create the ticket. Check the server terminal for details.');
  }
});

searchInput.addEventListener('input', function () {
  searchText = searchInput.value;
  renderTable();
});

statusFilterEl.addEventListener('change', function () {
  statusFilter = statusFilterEl.value;
  renderTable();
});

// Start the dashboard
setCreatedDate();
loadTickets();