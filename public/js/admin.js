/**
 * Ruqyah Support & Cupping Center - Administrator Dashboard Portal Engine
 */

let currentAdmin = null;
let currentTab = 'dashboard';
let cachedServices = [];
let allPatientsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Check Authentication
  const isAuth = await checkAuth();
  if (!isAuth) return;

  // Initialize UI & Event Listeners
  setupNavigation();
  setupModals();
  loadDashboardData();
  loadServicesCache();

  // Handle Hash Routing if any
  const hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById(`tab-${hash}`)) {
    switchTab(hash);
  }

  // Listen for language changes and refresh current tab
  window.addEventListener('languageChanged', () => {
    if (typeof applyTranslations === 'function') applyTranslations();
    if (currentTab === 'dashboard') loadDashboardData();
    if (currentTab === 'appointments') loadAppointmentsList();
    if (currentTab === 'patients') loadPatientsList();
    if (currentTab === 'sessions') loadSessionsList();
    if (currentTab === 'followups') loadFollowupsList();
    if (currentTab === 'pricing') loadPricingList();
    if (currentTab === 'diagnosis') loadDiagnosisManagement();
    if (currentTab === 'articles') loadArticlesList();
  });
});

/**
 * Authentication Check
 */
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.success || !data.admin) {
      window.location.href = '/admin/login';
      return false;
    }
    currentAdmin = data.admin;
    const adminNameEl = document.getElementById('adminNameDisplay');
    if (adminNameEl) adminNameEl.textContent = currentAdmin.name || currentAdmin.username;
    return true;
  } catch (err) {
    window.location.href = '/admin/login';
    return false;
  }
}

/**
 * Navigation & Tab Switching
 */
function setupNavigation() {
  const navItems = document.querySelectorAll('.admin-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = item.getAttribute('data-tab');
      if (tabName) switchTab(tabName);
    });
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        showToast('Logged out successfully.', 'info');
        setTimeout(() => window.location.href = '/admin/login', 500);
      } catch (err) {
        window.location.href = '/admin/login';
      }
    });
  }

  // Mobile sidebar toggle
  const sidebarToggle = document.getElementById('adminSidebarToggle');
  const sidebar = document.querySelector('.admin-sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  window.location.hash = tabName;

  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
  });

  document.querySelectorAll('.admin-tab-content').forEach(pane => {
    pane.style.display = 'none';
  });

  const targetPane = document.getElementById(`tab-${tabName}`);
  if (targetPane) {
    targetPane.style.display = 'block';
  }

  // Close mobile sidebar if open
  document.querySelector('.admin-sidebar')?.classList.remove('open');

  // Load specific tab data
  if (tabName === 'dashboard') loadDashboardData();
  if (tabName === 'appointments') loadAppointmentsList();
  if (tabName === 'calendar') loadCalendarView();
  if (tabName === 'availability') loadAvailabilityOverview();
  if (tabName === 'patients') loadPatientsList();
  if (tabName === 'sessions') loadSessionsList();
  if (tabName === 'followups') loadFollowupsList();
  if (tabName === 'pricing') loadPricingList();
  if (tabName === 'reports') loadReportsList();
  if (tabName === 'diagnosis') loadDiagnosisManagement();
  if (tabName === 'articles') loadArticlesList();
  if (tabName === 'commerce') loadCommerceData();
  if (tabName === 'hijama-mgr') loadHijamaMgrData();
  if (tabName === 'ruqyah-mgr') loadRuqyahMgrData();
  if (tabName === 'courses-mgr') loadCoursesMgrData();
  if (tabName === 'lifestyle-mgr') loadLifestyleMgrData();
  if (tabName === 'ads-mgr') loadAdsMgrData();
  if (tabName === 'settings') loadClinicSettings();
}

/**
 * Helper: Load services cache
 */
async function loadServicesCache() {
  try {
    const res = await fetch('/api/public/services');
    const data = await res.json();
    if (data.success) cachedServices = data.data;
  } catch (err) {
    console.error(err);
  }
}

// ==========================================================================
// 1. DASHBOARD OVERVIEW
// ==========================================================================
async function loadDashboardData() {
  try {
    const res = await fetch('/api/admin/settings/dashboard-metrics');
    const data = await res.json();
    if (!data.success) return;

    const m = data.data;
    document.getElementById('metricTotalPatients').textContent = m.totalPatients || 0;
    document.getElementById('metricTodayAppointments').textContent = m.todayAppointments || 0;
    document.getElementById('metricUpcomingAppointments').textContent = m.upcomingAppointments || 0;
    document.getElementById('metricPendingAppointments').textContent = m.pendingAppointments || 0;
    document.getElementById('metricCompletedAppointments').textContent = m.completedAppointments || 0;
    document.getElementById('metricCancelledAppointments').textContent = m.cancelledAppointments || 0;
    document.getElementById('metricRuqyahSessions').textContent = m.totalRuqyahSessions || 0;
    document.getElementById('metricHijamaSessions').textContent = m.totalHijamaSessions || 0;

    // Render Today's Schedule Table
    renderTodaySchedule(m.todayList || []);

    // Render Upcoming Follow-up Reminders
    renderFollowupReminders(m.upcomingFollowups || []);
  } catch (err) {
    console.error('Failed to load dashboard metrics:', err);
  }
}

function renderTodaySchedule(list) {
  const container = document.getElementById('todayScheduleContainer');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          No appointments scheduled for today.
        </td>
      </tr>
    `;
    return;
  }

  const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;
  let html = '';
  list.forEach(a => {
    const badgeHtml = typeof formatStatusBadge === 'function' ? formatStatusBadge(a.status) : `<span class="badge ${getBadgeClassForStatus(a.status)}">${a.status}</span>`;
    html += `
      <tr>
        <td style="font-weight: 700; color: var(--primary);">${a.time_slot}</td>
        <td>
          <strong>${a.patient_name}</strong>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${a.patient_phone}</div>
        </td>
        <td>${a.service_name}</td>
        <td>${badgeHtml}</td>
        <td>${a.additional_notes || '-'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openAppointmentModal('${a.id}')">${isBn ? 'পরিচালনা' : 'Manage'}</button>
        </td>
      </tr>
    `;
  });
  container.innerHTML = html;
}

function renderFollowupReminders(list) {
  const container = document.getElementById('followupRemindersContainer');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">No urgent follow-up reminders pending.</p>`;
    return;
  }

  let html = '';
  list.forEach(f => {
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--border-light);">
        <div>
          <strong style="color: var(--text-main);">${f.patient_name}</strong> (${f.patient_phone})
          <div style="font-size: 0.8rem; color: var(--primary);">Due: ${f.followup_date} ${f.scheduled_time || ''}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${f.treatment_progress_summary || ''}</div>
        </div>
        <div>
          <button class="btn btn-outline-primary btn-sm" onclick="openFollowupModal('${f.id}')">Review</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// ==========================================================================
// 2. APPOINTMENTS MANAGEMENT
// ==========================================================================
async function loadAppointmentsList() {
  const search = document.getElementById('aptSearchInput')?.value || '';
  const date = document.getElementById('aptDateFilter')?.value || '';
  const status = document.getElementById('aptStatusFilter')?.value || '';

  const tbody = document.getElementById('appointmentsTableBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading appointments...</td></tr>`;

  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (date) params.append('date', date);
    if (status) params.append('status', status);

    const res = await fetch(`/api/admin/appointments?${params.toString()}`);
    const data = await res.json();

    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;
    if (!data.success || !data.data || data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">${isBn ? 'কোনো অ্যাপয়েন্টমেন্টের তথ্য পাওয়া যায়নি।' : 'No matching appointments found.'}</td></tr>`;
      return;
    }

    let html = '';
    data.data.forEach(a => {
      const badgeHtml = typeof formatStatusBadge === 'function' ? formatStatusBadge(a.status) : `<span class="badge ${getBadgeClassForStatus(a.status)}">${a.status}</span>`;
      const isHijama = a.service_type === 'hijama' || (a.service_name && a.service_name.includes('হিজামা'));
      const isFamily = a.package_type === 'family' || (a.service_name && a.service_name.includes('ফ্যামিলি'));

      let feeHtml = '';
      if (isHijama) {
        feeHtml = `<span class="badge" style="background: #FEF3C7; color: #92400E; font-size: 0.78rem; font-weight: 600;">${isBn ? 'পরামর্শ ভিত্তিক ফি' : 'Consultation fee'}</span>`;
      } else {
        const feeAmount = a.service_price !== null && a.service_price !== undefined ? a.service_price : (isFamily ? 6000 : 2050);
        const overrideBadge = a.is_price_overridden ? `<span class="badge" style="background: #EFF6FF; color: #1D4ED8; font-size: 0.7rem; margin-left: 4px;" title="Price Adjusted by Admin">সমন্বিত</span>` : '';
        const packBadge = isFamily ? `<span class="badge badge-gold" style="font-size: 0.7rem; margin-right: 4px;">Family</span>` : '';
        feeHtml = `<div>${packBadge}<strong style="color: var(--primary); font-size: 0.95rem;">${feeAmount.toLocaleString('en-US')} BDT</strong>${overrideBadge}</div>`;
      }

      html += `
        <tr>
          <td>
            <strong style="color: var(--primary); font-size: 0.85rem;">${a.appointment_id}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${a.patient_id || ''}</div>
          </td>
          <td>
            <strong>${a.patient_name}</strong>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${a.patient_phone}</div>
          </td>
          <td>
            <strong>${a.appointment_date}</strong>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${a.time_slot}</div>
          </td>
          <td>
            <span style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">${a.service_name}</span>
            ${a.number_of_patients > 1 ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${a.number_of_patients} Patients</div>` : ''}
          </td>
          <td>
            ${feeHtml}
          </td>
          <td>${badgeHtml}</td>
          <td>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              <button class="btn btn-secondary btn-sm" onclick="openAppointmentModal('${a.id}')">${isBn ? 'পরিচালনা' : 'Manage'}</button>
              <button class="btn btn-outline-primary btn-sm" onclick="openPriceOverrideModal('${a.id}', '${a.appointment_id}', '${a.patient_name}', ${a.service_price || 0})" title="Adjust Fee / Concession">৳ ফি</button>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Failed to load appointments.</td></tr>`;
  }
}

async function openAppointmentModal(appointmentId) {
  try {
    const res = await fetch(`/api/admin/appointments/${appointmentId}`);
    const data = await res.json();
    if (!data.success) {
      showToast('Could not load appointment details.', 'error');
      return;
    }

    const a = data.data;
    const modalContent = document.getElementById('aptDetailModalContent');
    if (!modalContent) return;

    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;
    const waText = encodeURIComponent(`Assalamu Alaikum ${a.patient_name}. Regarding your appointment ${a.appointment_id} on ${a.appointment_date} at ${a.time_slot} for ${a.service_name} at Ruqyah Support & Cupping Center, Feni.`);
    const waLink = `https://wa.me/88${a.patient_phone.replace(/^(\+88|0)/, '880')}?text=${waText}`;

    modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
        <div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">${isBn ? 'অ্যাপয়েন্টমেন্ট আইডি' : 'APPOINTMENT ID'}</span>
          <h3 style="color: var(--primary); margin: 0;">${a.appointment_id}</h3>
        </div>
        <div>
          ${formatStatusBadge(a.status)}
        </div>
      </div>

      <div style="background-color: var(--bg-page); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${isBn ? 'রোগীর বিবরণ:' : 'Patient Name:'}</div>
          <strong>${a.patient_name}</strong> (${a.patient_gender ? (isBn ? (a.patient_gender === 'Female' ? 'মহিলা' : 'পুরুষ') : a.patient_gender) : (isBn ? 'অনির্ধারিত' : 'Unspecified')}, ${a.patient_age || 'N/A'} ${isBn ? 'বছর' : 'yrs'})
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">📞 ${a.patient_phone}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">📍 ${a.patient_address}</div>
        </div>
        <div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${isBn ? 'তারিখ ও নির্ধারিত সময়:' : 'Date & Dedicated Time:'}</div>
          <strong style="color: var(--primary);">${a.appointment_date}</strong>
          <div>${a.time_slot}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">${isBn ? 'সেবা:' : 'Service:'} <strong>${a.service_name}</strong></div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">${isBn ? 'নির্ধারিত ফি:' : 'Fee:'} <strong style="color: var(--primary);">${(a.service_type === 'hijama' || (a.service_name && a.service_name.includes('হিজামা'))) ? (isBn ? 'পরামর্শের মাধ্যমে নির্ধারণ করা হবে' : 'Determined after consultation') : (isBn ? '২,০৫০ টাকা' : '2,050 BDT')}</strong></div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">${isBn ? 'রোগীর প্রাথমিক নোটস / উপসর্গ:' : 'Patient Initial Notes / Symptoms:'}</label>
        <p style="background: #FFF; border: 1px solid var(--border-light); padding: 0.65rem 0.85rem; border-radius: var(--radius-md); font-size: 0.85rem;">
          ${a.additional_notes || (isBn ? 'রোগী কোনো অতিরিক্ত নোট প্রদান করেননি।' : 'No additional notes provided by patient.')}
        </p>
      </div>

      <div class="form-group">
        <label class="form-label">${isBn ? 'অ্যাপয়েন্টমেন্টের বর্তমান স্ট্যাটাস পরিবর্তন:' : 'Update Appointment Status:'}</label>
        <select id="modalAptStatusSelect" class="form-control">
          <option value="Pending" ${a.status === 'Pending' ? 'selected' : ''}>${isBn ? 'অপেক্ষমান (Pending)' : 'Pending'}</option>
          <option value="Confirmed" ${a.status === 'Confirmed' ? 'selected' : ''}>${isBn ? 'নিশ্চিতকৃত (Confirmed)' : 'Confirmed'}</option>
          <option value="Completed" ${a.status === 'Completed' ? 'selected' : ''}>${isBn ? 'সম্পন্ন (Completed)' : 'Completed'}</option>
          <option value="Cancelled" ${a.status === 'Cancelled' ? 'selected' : ''}>${isBn ? 'বাতিল (Cancelled)' : 'Cancelled (Releases slot)'}</option>
          <option value="Rescheduled" ${a.status === 'Rescheduled' ? 'selected' : ''}>${isBn ? 'পুনঃনির্ধারিত (Rescheduled)' : 'Rescheduled'}</option>
          <option value="No Show" ${a.status === 'No Show' ? 'selected' : ''}>${isBn ? 'অনুপস্থিত (No Show)' : 'No Show'}</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">${isBn ? 'প্রশাসনিক / অফিসিয়াল মন্তব্য যোগ করুন:' : 'Add Administrative Private Notes:'}</label>
        <textarea id="modalAptAdminNotes" class="form-control" placeholder="${isBn ? 'গোপনীয় ক্লিনিক্যাল বা অভ্যর্থনা মন্তব্য লিখুন...' : 'Add confidential clinical or reception notes...'}">${a.admin_notes || ''}</textarea>
      </div>

      <div style="display: flex; gap: 0.5rem; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-top: 1.5rem; border-top: 1px solid var(--border-light); padding-top: 1rem;">
        <div>
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm">
            ${isBn ? 'হোয়াটসঅ্যাপ বার্তা' : 'WhatsApp Patient'}
          </a>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openRescheduleModal('${a.id}', '${a.appointment_date}', '${a.time_slot}')">
            ${isBn ? 'সময় পরিবর্তন করুন' : 'Reschedule Slot'}
          </button>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          ${a.patient_id ? `<button type="button" class="btn btn-outline-primary btn-sm" onclick="viewPatientProfile('${a.patient_id}')">${isBn ? 'রোগীর CRM ফাইল' : 'Open Patient CRM'}</button>` : ''}
          <button type="button" class="btn btn-primary btn-sm" onclick="saveAppointmentStatus('${a.id}')">${isBn ? 'সংরক্ষণ করুন' : 'Save Changes'}</button>
        </div>
      </div>
    `;

    openModal('aptDetailModal');
  } catch (err) {
    showToast('Failed to open appointment details.', 'error');
  }
}

async function saveAppointmentStatus(appointmentId) {
  const status = document.getElementById('modalAptStatusSelect')?.value;
  const adminNotes = document.getElementById('modalAptAdminNotes')?.value;

  try {
    const res = await fetch(`/api/admin/appointments/${appointmentId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, admin_notes: adminNotes })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('aptDetailModal');
      loadAppointmentsList();
      loadDashboardData();
    } else {
      showToast(data.error || 'Failed to update status.', 'error');
    }
  } catch (err) {
    showToast('Error updating status.', 'error');
  }
}

function openRescheduleModal(aptId, currentDate, currentSlot) {
  const modalContent = document.getElementById('rescheduleModalContent');
  if (!modalContent) return;

  modalContent.innerHTML = `
    <p style="margin-bottom: 1rem;">Currently scheduled for: <strong>${currentDate}</strong> at <strong>${currentSlot}</strong></p>
    <div class="form-group">
      <label class="form-label">New Appointment Date:</label>
      <input type="date" id="rescheduleDateInput" class="form-control" value="${currentDate}">
    </div>
    <div class="form-group">
      <label class="form-label">Select Available Time Slot on New Date:</label>
      <div id="rescheduleSlotsArea" style="min-height: 80px; padding: 0.5rem; background: var(--bg-page); border-radius: var(--radius-md);">
        Select date to view available slots...
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Reason for Rescheduling:</label>
      <input type="text" id="rescheduleReasonInput" class="form-control" placeholder="e.g. Patient requested morning slot">
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
      <button type="button" class="btn btn-secondary" onclick="closeModal('rescheduleModal')">Cancel</button>
      <button type="button" class="btn btn-primary" onclick="submitReschedule('${aptId}')">Confirm Reschedule</button>
    </div>
  `;

  openModal('rescheduleModal');

  const dateInput = document.getElementById('rescheduleDateInput');
  if (dateInput) {
    dateInput.addEventListener('change', () => loadRescheduleSlots(dateInput.value));
    loadRescheduleSlots(dateInput.value);
  }
}

let selectedRescheduleSlot = null;
async function loadRescheduleSlots(dateStr) {
  const area = document.getElementById('rescheduleSlotsArea');
  if (!area) return;
  area.innerHTML = 'Loading available slots...';
  selectedRescheduleSlot = null;

  try {
    const res = await fetch(`/api/public/availability?date=${dateStr}`);
    const data = await res.json();
    if (!data.success || data.isClosedDay || data.isWeeklyHoliday || !data.availableSlots || data.availableSlots.length === 0) {
      area.innerHTML = `<span style="color: #991B1B;">⚠️ ${data.reason || 'No available slots on this date.'}</span>`;
      return;
    }

    let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">';
    data.availableSlots.forEach(s => {
      html += `
        <button type="button" class="slot-btn" onclick="selectRescheduleSlot('${s.label}', this)">
          ${s.label}
        </button>
      `;
    });
    html += '</div>';
    area.innerHTML = html;
  } catch (err) {
    area.innerHTML = 'Failed to load slots.';
  }
}

function selectRescheduleSlot(slotLabel, btnEl) {
  document.querySelectorAll('#rescheduleSlotsArea .slot-btn').forEach(b => b.classList.remove('selected'));
  btnEl.classList.add('selected');
  selectedRescheduleSlot = slotLabel;
}

async function submitReschedule(aptId) {
  const newDate = document.getElementById('rescheduleDateInput')?.value;
  const reason = document.getElementById('rescheduleReasonInput')?.value;

  if (!newDate || !selectedRescheduleSlot) {
    showToast('Please select a target date and an available slot.', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/admin/appointments/${aptId}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_date: newDate,
        new_time_slot: selectedRescheduleSlot,
        reason
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('rescheduleModal');
      closeModal('aptDetailModal');
      loadAppointmentsList();
      loadDashboardData();
    } else {
      showToast(data.error || 'Failed to reschedule appointment.', 'error');
    }
  } catch (err) {
    showToast('Reschedule request failed.', 'error');
  }
}

// ==========================================================================
// 3. CALENDAR MANAGEMENT (Visual Daily / Weekly View)
// ==========================================================================
let calendarCurrentDate = new Date();

function loadCalendarView() {
  renderCalendarDays();
}

async function renderCalendarDays() {
  const calendarGrid = document.getElementById('calendarDaysGrid');
  const monthTitle = document.getElementById('calendarMonthTitle');
  if (!calendarGrid) return;

  const y = calendarCurrentDate.getFullYear();
  const m = calendarCurrentDate.getMonth();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  if (monthTitle) monthTitle.textContent = `${monthNames[m]} ${y}`;

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  calendarGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 1rem;">Loading month calendar...</div>';

  try {
    const res = await fetch('/api/admin/availability/overview');
    const availData = await res.json();
    const closedDatesMap = {};
    if (availData.success && availData.data?.closedDates) {
      availData.data.closedDates.forEach(c => closedDatesMap[c.closed_date] = c.reason || 'Closed');
    }

    let html = '';
    // Days of week header
    const daysHeader = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    daysHeader.forEach(d => {
      html += `<div style="text-align: center; font-weight: 700; font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem 0;">${d}</div>`;
    });

    // Blank cells before month start
    for (let i = 0; i < firstDay; i++) {
      html += `<div style="background-color: #F8FAFC; border: 1px solid var(--border-light); border-radius: var(--radius-sm); min-height: 80px; opacity: 0.4;"></div>`;
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(y, m, day).getDay();
      const isFriday = dayOfWeek === 5;
      const isClosed = closedDatesMap[dateStr];

      let badgeInfo = '';
      if (isClosed) {
        badgeInfo = `<span class="badge badge-status-cancelled" style="font-size: 0.7rem; margin-top: 4px;">Closed Day</span>`;
      } else if (isFriday) {
        badgeInfo = `<span class="badge badge-gold" style="font-size: 0.7rem; margin-top: 4px;">Friday (Holiday)</span>`;
      }

      html += `
        <div style="background-color: #FFFFFF; border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 0.5rem; min-height: 85px; cursor: pointer; transition: all 0.15s;" 
             onclick="openCalendarDayView('${dateStr}')" 
             onmouseover="this.style.borderColor='var(--primary-light)'" 
             onmouseout="this.style.borderColor='var(--border-light)'">
          <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.85rem;">
            <span>${day}</span>
          </div>
          <div>${badgeInfo}</div>
        </div>
      `;
    }

    calendarGrid.innerHTML = html;
  } catch (err) {
    calendarGrid.innerHTML = '<div style="color: red; padding: 1rem;">Failed to render calendar.</div>';
  }
}

function prevCalendarMonth() {
  calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
  renderCalendarDays();
}

function nextCalendarMonth() {
  calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
  renderCalendarDays();
}

async function openCalendarDayView(dateStr) {
  try {
    const res = await fetch(`/api/admin/availability/check?date=${dateStr}`);
    const data = await res.json();
    if (!data.success) {
      showToast('Could not inspect date.', 'error');
      return;
    }

    const modalContent = document.getElementById('calendarDayModalContent');
    if (!modalContent) return;

    let slotsHtml = '';
    data.slots.forEach(slot => {
      let statusBadge = '<span class="badge badge-primary">Available</span>';
      let actionBtn = `<button class="btn btn-secondary btn-sm" onclick="blockSpecificSlot('${dateStr}', '${slot.label}')">Block Slot</button>`;

      if (slot.status === 'booked') {
        const p = slot.bookedDetails;
        statusBadge = `<span class="badge badge-status-confirmed">Booked: ${p ? p.patient_name : 'Patient'}</span>`;
        actionBtn = `<button class="btn btn-secondary btn-sm" onclick="closeModal('calendarDayModal'); openAppointmentModal('${p.appointment_id}')">View</button>`;
      } else if (slot.status === 'blocked') {
        statusBadge = `<span class="badge badge-status-cancelled">Blocked: ${slot.reason}</span>`;
        actionBtn = `<button class="btn btn-outline-primary btn-sm" onclick="unblockSpecificSlot('${dateStr}', '${slot.label}')">Unblock</button>`;
      }

      slotsHtml += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0; border-bottom: 1px solid var(--border-light);">
          <div>
            <strong>${slot.label}</strong>
            <div style="margin-top: 2px;">${statusBadge}</div>
          </div>
          <div>${actionBtn}</div>
        </div>
      `;
    });

    const isClosed = data.isClosedDay;
    modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="color: var(--primary); margin: 0;">Schedule for ${dateStr}</h3>
        <div>
          ${isClosed 
            ? `<button class="btn btn-primary btn-sm" onclick="reopenSpecificDate('${dateStr}')">Reopen This Date</button>`
            : `<button class="btn btn-secondary btn-sm" style="color: #991B1B;" onclick="closeSpecificDatePrompt('${dateStr}')">Close Entire Day</button>`
          }
        </div>
      </div>
      ${isClosed ? `<div class="badge badge-status-cancelled" style="margin-bottom: 1rem; width: 100%; justify-content: center; padding: 0.5rem;">⚠️ Date is Closed: ${data.reason}</div>` : ''}
      <div>${slotsHtml}</div>
    `;

    openModal('calendarDayModal');
  } catch (err) {
    showToast('Failed to load day schedule.', 'error');
  }
}

// ==========================================================================
// 4. MANAGE CLINIC AVAILABILITY
// ==========================================================================
async function loadAvailabilityOverview() {
  try {
    const res = await fetch('/api/admin/availability/overview');
    const data = await res.json();
    if (!data.success) return;

    const { closedDates, blockedSlots, settings } = data.data;

    // Render Closed Dates Table
    const closedTbody = document.getElementById('closedDatesTableBody');
    if (closedTbody) {
      if (closedDates.length === 0) {
        closedTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No closed dates currently registered.</td></tr>`;
      } else {
        let html = '';
        closedDates.forEach(c => {
          html += `
            <tr>
              <td><strong style="color: var(--primary);">${c.closed_date}</strong></td>
              <td>${c.reason || 'Closed by Clinic'}</td>
              <td>${c.created_by || 'Admin'}</td>
              <td>
                <button class="btn btn-outline-primary btn-sm" onclick="reopenSpecificDate('${c.closed_date}')">Reopen Date</button>
              </td>
            </tr>
          `;
        });
        closedTbody.innerHTML = html;
      }
    }

    // Render Blocked Slots Table
    const blockedTbody = document.getElementById('blockedSlotsTableBody');
    if (blockedTbody) {
      if (blockedSlots.length === 0) {
        blockedTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No individually blocked time slots.</td></tr>`;
      } else {
        let html = '';
        blockedSlots.forEach(b => {
          html += `
            <tr>
              <td><strong>${b.slot_date}</strong></td>
              <td><strong style="color: var(--primary);">${b.time_slot}</strong></td>
              <td>${b.reason || 'Staff/Clinic reserved'}</td>
              <td>${b.created_by || 'Admin'}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="unblockSpecificSlot('${b.slot_date}', '${b.time_slot}')">Unblock</button>
              </td>
            </tr>
          `;
        });
        blockedTbody.innerHTML = html;
      }
    }

    // Weekly holiday setting
    const holidayDaySelect = document.getElementById('weeklyHolidaySelect');
    if (holidayDaySelect && settings) {
      if (settings.weekly_holiday_enabled === 0 || settings.weekly_holiday_day === -1) {
        holidayDaySelect.value = '-1';
      } else {
        holidayDaySelect.value = String(settings.weekly_holiday_day);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function closeSpecificDatePrompt(dateStr) {
  const reason = prompt(`Enter reason for closing ${dateStr}:`, 'Public Holiday / Maintenance');
  if (reason === null) return;

  try {
    const res = await fetch('/api/admin/availability/close-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('calendarDayModal');
      loadAvailabilityOverview();
      renderCalendarDays();
    } else {
      showToast(data.error || 'Failed to close date.', 'error');
    }
  } catch (err) {
    showToast('Failed to close date.', 'error');
  }
}

async function reopenSpecificDate(dateStr) {
  if (!confirm(`Are you sure you want to reopen ${dateStr} for public bookings?`)) return;

  try {
    const res = await fetch('/api/admin/availability/reopen-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('calendarDayModal');
      loadAvailabilityOverview();
      renderCalendarDays();
    } else {
      showToast(data.error || 'Failed to reopen date.', 'error');
    }
  } catch (err) {
    showToast('Failed to reopen date.', 'error');
  }
}

async function blockSpecificSlot(dateStr, timeSlot) {
  const reason = prompt(`Reason for blocking ${timeSlot} on ${dateStr}:`, 'Staff Meeting / Facility Disinfection');
  if (reason === null) return;

  try {
    const res = await fetch('/api/admin/availability/block-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, time_slot: timeSlot, reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      openCalendarDayView(dateStr);
      loadAvailabilityOverview();
    } else {
      showToast(data.error || 'Failed to block slot.', 'error');
    }
  } catch (err) {
    showToast('Failed to block slot.', 'error');
  }
}

async function unblockSpecificSlot(dateStr, timeSlot) {
  try {
    const res = await fetch('/api/admin/availability/unblock-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, time_slot: timeSlot })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      if (document.getElementById('calendarDayModal')?.classList.contains('open')) {
        openCalendarDayView(dateStr);
      }
      loadAvailabilityOverview();
    } else {
      showToast(data.error || 'Failed to unblock slot.', 'error');
    }
  } catch (err) {
    showToast('Failed to unblock slot.', 'error');
  }
}

// Form to close day directly from availability tab
document.getElementById('closeDayForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = document.getElementById('closeDateInput')?.value;
  const reason = document.getElementById('closeReasonInput')?.value;

  if (!date) {
    showToast('Please select a date.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/availability/close-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('closeDayForm')?.reset();
      loadAvailabilityOverview();
    } else {
      showToast(data.error || 'Failed to close date.', 'error');
    }
  } catch (err) {
    showToast('Failed to close date.', 'error');
  }
});

// Form to block specific slot from availability tab
document.getElementById('blockSlotForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = document.getElementById('blockSlotDateInput')?.value;
  const slot = document.getElementById('blockSlotSelect')?.value;
  const reason = document.getElementById('blockSlotReasonInput')?.value;

  if (!date || !slot) {
    showToast('Please select date and slot.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/availability/block-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, time_slot: slot, reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('blockSlotForm')?.reset();
      loadAvailabilityOverview();
    } else {
      showToast(data.error || 'Failed to block slot.', 'error');
    }
  } catch (err) {
    showToast('Failed to block slot.', 'error');
  }
});

// Save weekly holiday settings
document.getElementById('saveHolidaySettingsBtn')?.addEventListener('click', async () => {
  const day = document.getElementById('weeklyHolidaySelect')?.value;
  const dayVal = parseInt(day, 10);
  const enabledVal = dayVal === -1 ? 0 : 1;

  try {
    const res = await fetch('/api/admin/availability/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekly_holiday_day: dayVal,
        weekly_holiday_enabled: enabledVal
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Weekly holiday setting updated.', 'success');
    } else {
      showToast(data.error || 'Failed to update weekly holiday.', 'error');
    }
  } catch (err) {
    showToast('Failed to update weekly holiday.', 'error');
  }
});

// ==========================================================================
// 5. PATIENT MANAGEMENT SYSTEM (CRM)
// ==========================================================================
async function loadPatientsList() {
  const search = document.getElementById('patientSearchInput')?.value || '';
  const gender = document.getElementById('patientGenderFilter')?.value || '';

  const tbody = document.getElementById('patientsTableBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading patients...</td></tr>`;

  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (gender) params.append('gender', gender);

    const res = await fetch(`/api/admin/patients?${params.toString()}`);
    const data = await res.json();

    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;
    if (!data.success || !data.data || data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">${isBn ? 'কোনো রোগীর তথ্য পাওয়া যায়নি।' : 'No patients found.'}</td></tr>`;
      return;
    }

    allPatientsCache = data.data;

    let html = '';
    data.data.forEach(p => {
      const historyBadge = p.has_history
        ? `<span class="badge badge-primary">${isBn ? 'হিস্ট্রি সংরক্ষিত' : 'History Saved'}</span>`
        : `<span class="badge badge-gold">${isBn ? 'হিস্ট্রি ফর্ম খালি' : 'No History Form'}</span>`;
      const sessionCountText = isBn ? `${p.total_sessions} টি সেশন` : `${p.total_sessions} Session(s)`;
      const aptCountText = isBn ? `${p.total_appointments} টি অ্যাপয়েন্টমেন্ট` : `${p.total_appointments} Apt(s)`;

      html += `
        <tr>
          <td><strong style="color: var(--primary); font-size: 0.9rem;">${p.patient_id}</strong></td>
          <td>
            <strong>${p.full_name}</strong>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${p.gender === 'Female' ? (isBn ? 'মহিলা' : 'Female') : (isBn ? 'পুরুষ' : 'Male')}, ${p.age} ${isBn ? 'বছর' : 'yrs'}</div>
          </td>
          <td>${p.phone}</td>
          <td>${p.address}</td>
          <td>
            ${historyBadge}
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
              ${sessionCountText} | ${aptCountText}
            </div>
          </td>
          <td>${p.registration_date?.slice(0, 10)}</td>
          <td>
            <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
              <button class="btn btn-primary btn-xs" onclick="viewPatientProfile('${p.patient_id}')">${isBn ? 'রোগীর ফাইল' : 'Dossier'}</button>
              <a href="/api/admin/reports/patient/${p.patient_id}/pdf?lang=bn" class="btn btn-primary btn-xs" download title="বাংলা PDF ডাউনলোড">বাংলা PDF ডাউনলোড</a>
              <a href="/api/admin/reports/patient/${p.patient_id}/pdf?lang=en" class="btn btn-secondary btn-xs" download title="English PDF Download">English PDF Download</a>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Failed to load patients.</td></tr>`;
  }
}

// Register New Patient Form
document.getElementById('registerPatientForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById('regPatientName')?.value?.trim(),
    phone: document.getElementById('regPatientPhone')?.value?.trim(),
    age: parseInt(document.getElementById('regPatientAge')?.value, 10),
    gender: document.getElementById('regPatientGender')?.value,
    marital_status: document.getElementById('regPatientMarital')?.value,
    address: document.getElementById('regPatientAddress')?.value?.trim(),
    emergency_contact: document.getElementById('regPatientEmergency')?.value?.trim(),
    notes: document.getElementById('regPatientNotes')?.value?.trim()
  };

  try {
    const res = await fetch('/api/admin/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('registerPatientModal');
      document.getElementById('registerPatientForm')?.reset();
      loadPatientsList();
      if (data.data?.patient_id) {
        viewPatientProfile(data.data.patient_id);
      }
    } else {
      showToast(data.error || 'Failed to register patient.', 'error');
    }
  } catch (err) {
    showToast('Failed to register patient.', 'error');
  }
});

let currentDossierLang = 'bn';

function toggleDossierLang(patientId, lang) {
  currentDossierLang = lang;
  viewPatientProfile(patientId, lang);
}

// View Full Patient Profile Dossier
async function viewPatientProfile(patientId, forcedLang = null) {
  if (forcedLang) currentDossierLang = forcedLang;
  const activeLang = currentDossierLang || (typeof getCurrentLang === 'function' ? getCurrentLang() : 'bn');
  const isBn = activeLang === 'bn';
  try {
    const res = await fetch(`/api/admin/patients/${patientId}`);
    const data = await res.json();
    if (!data.success) {
      showToast('Could not load patient profile.', 'error');
      return;
    }

    const { patient, history, appointments, sessions, followups, diagnosis } = data.data;

    // Fetch active categories and all 10 symptoms each
    let categories = [];
    try {
      const catRes = await fetch('/api/admin/diagnosis/categories');
      const catData = await catRes.json();
      if (catData.success) {
        categories = catData.data || [];
      }
    } catch (e) {
      console.error('Failed to load categories', e);
    }

    // Saved symptoms IDs
    let savedSymptomIds = [];
    if (diagnosis) {
      try {
        savedSymptomIds = JSON.parse(diagnosis.selected_symptom_ids || '[]');
      } catch (e) { savedSymptomIds = []; }
    }

    // Compute initial counts
    let initialCount = savedSymptomIds.length;
    let initialCatCount = 0;
    if (diagnosis && diagnosis.category_ids) {
      try {
        initialCatCount = JSON.parse(diagnosis.category_ids).length;
      } catch (e) { initialCatCount = 0; }
    }
    const modalContent = document.getElementById('patientProfileModalContent');
    if (!modalContent) return;

    // Parse list helper
    const parseList = (str) => {
      if (!str) return [];
      try {
        const p = JSON.parse(str);
        return Array.isArray(p) ? p : [String(str)];
      } catch {
        return [String(str)];
      }
    };

    const mainSyms = parseList(history?.main_symptoms);
    const physSyms = parseList(history?.physical_symptoms);
    const sleepSyms = parseList(history?.sleep_problems);
    const dreamSyms = parseList(history?.dream_problems);
    const worshipSyms = parseList(history?.worship_problems);

    modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--primary-border); padding-bottom: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700;">OFFICIAL PATIENT DOSSIER</span>
          <h2 style="color: var(--primary); margin: 0;">${patient.full_name}</h2>
          <div style="font-size: 0.9rem; color: var(--text-muted);">
            ID: <strong>${patient.patient_id}</strong> | Phone: ${patient.phone} | Age: ${patient.age} | Gender: ${patient.gender} | ${patient.marital_status || 'Married'}
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <a href="/api/admin/reports/patient/${patient.patient_id}/pdf?lang=bn" class="btn btn-primary btn-sm" download>
            📥 বাংলা PDF ডাউনলোড
          </a>
          <a href="/api/admin/reports/patient/${patient.patient_id}/pdf?lang=en" class="btn btn-secondary btn-sm" download>
            📥 English PDF Download
          </a>
          <a href="/reports/view/patient/${patient.patient_id}" target="_blank" class="btn btn-outline-secondary btn-sm">
            🖨 Print Report
          </a>
          <button class="btn btn-outline-primary btn-sm" onclick="openNewSessionForPatient('${patient.patient_id}')">
            + New Ruqyah Session
          </button>
        </div>
      </div>

      <!-- Tab Buttons for Dossier -->
      <div style="display: flex; gap: 0.5rem; border-bottom: 2px solid var(--border-light); margin-bottom: 1.25rem; flex-wrap: wrap;">
        <button type="button" class="btn btn-sm btn-secondary dossier-tab-btn active" onclick="switchDossierTab('diagnosis', this)">🩺 ১০টি ক্যাটাগরির বিস্তারিত ডায়াগনোসিস</button>
        <button type="button" class="btn btn-sm btn-secondary dossier-tab-btn" onclick="switchDossierTab('history', this)">📋 সার্বিক স্বাস্থ্য ইতিহাস</button>
        <button type="button" class="btn btn-sm btn-secondary dossier-tab-btn" onclick="switchDossierTab('sessions', this)">📖 রুকইয়াহ সেশনসমূহ (${sessions.length})</button>
        <button type="button" class="btn btn-sm btn-secondary dossier-tab-btn" onclick="switchDossierTab('followups', this)">🔄 ফলো-আপ (${followups.length})</button>
        <button type="button" class="btn btn-sm btn-secondary dossier-tab-btn" onclick="switchDossierTab('appointments', this)">🗓 অ্যাপয়েন্টমেন্ট (${appointments.length})</button>
      </div>

      <!-- DOSSIER PANE 1: 9-CATEGORY DIAGNOSIS FORM (NO 5-SYMPTOM LIMIT, 10 PER CATEGORY = 90 TOTAL) -->
      <div id="dossierPane-diagnosis" class="dossier-pane" style="display: block;">
        
        <!-- Pre-Diagnosis Form Header & Language Toggle Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: #F8FAF9; padding: 0.85rem 1.25rem; border-radius: var(--radius-md); border: 1.5px solid #A7F3D0; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <h3 style="color: #064E3B; margin: 0; font-size: 1.15rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>🩺</span> ${isBn ? '১০টি ক্যাটাগরির বিস্তারিত প্রাক-ডায়াগনোসিস ফরম' : '9-Category Clinical Pre-Diagnosis Assessment'}
            </h3>
            <div style="font-size: 0.82rem; color: #047857; margin-top: 2px;">
              ${isBn ? 'রোগীর পরিলক্ষিত লক্ষণসমূহ সংশ্লিষ্ট ক্যাটাগরি থেকে টিক দিন (ডিফল্ট ভাষা: বাংলা)' : 'Select observed clinical symptoms across all 10 categories (English Translation View)'}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; background: #FFFFFF; padding: 4px 8px; border-radius: 6px; border: 1px solid #CBD5E1;">
            <span style="font-size: 0.8rem; font-weight: 700; color: #475569;">ভাষা / Language:</span>
            <button type="button" class="btn btn-xs ${isBn ? 'btn-primary' : 'btn-secondary'}" onclick="toggleDossierLang('${patient.patient_id}', 'bn')" style="font-size: 0.75rem; padding: 3px 8px; font-weight: 600;">
              🇧🇩 বাংলা
            </button>
            <button type="button" class="btn btn-xs ${!isBn ? 'btn-primary' : 'btn-secondary'}" onclick="toggleDossierLang('${patient.patient_id}', 'en')" style="font-size: 0.75rem; padding: 3px 8px; font-weight: 600;">
              🇬🇧 English
            </button>
          </div>
        </div>

        <!-- Clinical Ethical Guidance Notice -->
        <div class="alert" style="background: #F0FDF4; border: 1.5px solid #86EFAC; color: #166534; padding: 1rem 1.25rem; border-radius: var(--radius-md); margin-bottom: 1.25rem;">
          <div style="font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <span>⚖️</span> ক্লিনিক্যাল ইতিহাস গ্রহণ ও মূল্যায়ন সংক্রান্ত নির্দেশনা (Clinical & Ethical Guidelines)
          </div>
          <div style="font-size: 0.85rem; line-height: 1.5; color: #14532D;">
            এই প্রাক-ডায়াগনোসিস ফরমটি রোগীর শারীরিক, মানসিক ও আধ্যাত্মিক চিকিৎসার সার্বিক ইতিহাস গ্রহণের জন্য প্রস্তুতকৃত। কোনো নির্দিষ্ট উপসর্গকে সরাসরি জ্বিন, জাদু বা অলৌকিক কোনো বিষয়ের চূড়ান্ত প্রমাণ দাবি করা যাবে না। শারীরিক ও মানসিক সমস্যার জন্য আধুনিক চিকিৎসা গ্রহণ অপরিহার্য। এই মূল্যায়ন রেজিস্টার্ড চিকিৎসকের চিকিৎসা পরামর্শের বিকল্প নয়।
          </div>
        </div>

        <!-- High-Priority Suicide / Self-Harm Clinical Safety Alert -->
        <div id="suicideSafetyAlert" style="display: ${diagnosis?.suicidal_ideation_flag ? 'block' : 'none'}; background: #FEF2F2; border: 2px solid #EF4444; border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);">
          <div style="display: flex; align-items: center; gap: 0.75rem; color: #991B1B; font-weight: 800; font-size: 1.05rem;">
            <span style="font-size: 1.4rem;">🚨</span>
            <span>জরুরি সতর্কতা: আত্মহত্যার চিন্তা বা নিজেকে আঘাতের প্রবণতা চিহ্নিত হয়েছে</span>
          </div>
          <p style="margin: 0.5rem 0 0.5rem 0; font-size: 0.88rem; color: #7F1D1D; line-height: 1.5;">
            রোগীর মধ্যে আত্মহত্যার ইচ্ছা বা নিজেকে ক্ষতি করার প্রবণতা সনাক্ত হয়েছে। রুকইয়াহ বা আধ্যাত্মিক মূল্যায়ন কোনো অবস্থাতেই জরুরি সাইকিয়াট্রিক বা ক্লিনিক্যাল সাইকোলজিকাল চিকিৎসার বিকল্প নয়। রোগীকে অনতিবিলম্বে একজন <strong>রেজিস্টার্ড মানসিক রোগ বিশেষজ্ঞ (Psychiatrist / Mental Health Professional)</strong> এর শরণাপন্ন হওয়ার পরামর্শ দিন।
          </p>
          <div style="font-size: 0.8rem; color: #B91C1C; font-weight: 600;">
            জরুরি মানসিক স্বাস্থ্য সহায়তা হটলাইন: কান পেতে রই (Kaan Pete Roi) অথবা জাতীয় জরুরি সেবা ৯৯৯
          </div>
        </div>

        <!-- Live Diagnosis Summary Box -->
        <div class="card" style="background: #ECFDF5; border: 1.5px solid #A7F3D0; margin-bottom: 1.5rem; padding: 1.25rem; border-radius: var(--radius-md);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
            <h4 style="color: #064E3B; margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: 1.05rem;">
              <span>📋</span> রোগীর নির্বাচিত উপসর্গ ও ডায়াগনোসিস সারসংক্ষেপ
            </h4>
            <span class="badge badge-primary" id="liveDiagBadge" style="font-size: 0.85rem; padding: 0.4rem 0.8rem; background: #065F46;">
              নির্বাচিত উপসর্গ: ${initialCount} টি (ক্যাটাগরি: ${initialCatCount} টি)
            </span>
          </div>
          <div id="liveDiagSummaryText" style="font-size: 0.95rem; color: #065F46; line-height: 1.6;">
            ${diagnosis && diagnosis.summary_bn ? `<strong>রোগীর নির্বাচিত উপসর্গ:</strong> ${diagnosis.summary_bn}` : '<span style="color: var(--text-muted); font-style: italic;">কোনো উপসর্গ এখনও নির্বাচিত হয়নি। নিচের ক্যাটাগরিগুলো থেকে রোগীর মধ্যে দৃশ্যমান লক্ষণসমূহ নির্বাচন করুন।</span>'}
          </div>
        </div>

        <!-- The 10 Diagnosis Categories (Category 1: Free-text Main Symptoms, Categories 2-10: Selectable Symptoms) -->
        <div style="display: flex; flex-direction: column; gap: 1.25rem;">
          ${categories.map((cat, catIdx) => {
            const syms = cat.symptoms || [];
            const isBnCat = (currentDossierLang || (typeof getCurrentLang === 'function' ? getCurrentLang() : 'bn')) === 'bn';
            const primaryCatName = isBnCat ? cat.name_bn : (cat.name_en || cat.name_bn);
            const secondaryCatName = isBnCat ? cat.name_en : cat.name_bn;
            const catDesc = isBnCat ? (cat.description_bn || cat.description_en || '') : (cat.description_en || cat.description_bn || '');

            // REQUIREMENT 7: Category 1 (রোগীর প্রধান উপসর্গসমূহ / Patient's Main Symptoms)
            // Must contain ONLY: A category heading and ONE empty textarea for manually writing patient's main symptoms.
            // No checkboxes, no subcategories, no extra fields.
            if (cat.code === 'patient_main_symptoms' || catIdx === 0) {
              return `
                <div class="card" style="border-left: 4px solid var(--primary); padding: 1.25rem; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); background: #FFFFFF;">
                  <div style="margin-bottom: 0.75rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.5rem;">
                    <h4 style="color: var(--primary); margin: 0 0 0.2rem 0; font-size: 1.1rem;">
                      ${catIdx + 1}. ${primaryCatName}
                    </h4>
                    <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">
                      ${secondaryCatName}
                    </div>
                  </div>
                  <div>
                    <textarea id="diagMainComplaintsText" class="form-control" rows="4" placeholder="${isBnCat ? 'রোগীর প্রধান প্রধান উপসর্গ ও লক্ষণসমূহ এখানে লিখুন...' : 'Enter patient\'s main symptoms and chief complaints here...'}" style="width: 100%; border: 1.5px solid var(--primary-border); border-radius: 6px; padding: 0.75rem; font-size: 0.92rem;">${diagnosis?.main_complaints_text || ''}</textarea>
                  </div>
                </div>
              `;
            }

            // Categories 2 to 10: Standard Selectable Symptom Grids
            return `
              <div class="card" style="border-left: 4px solid var(--primary); padding: 1.25rem; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); background: #FFFFFF;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                  <div>
                    <h4 style="color: var(--primary); margin: 0 0 0.2rem 0; font-size: 1.1rem;">
                      ${catIdx + 1}. ${primaryCatName}
                    </h4>
                    <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">
                      ${secondaryCatName}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-main); margin-top: 0.25rem;">
                      ${catDesc}
                    </div>
                  </div>
                  <div style="display: flex; gap: 0.35rem;">
                    <button type="button" class="btn btn-xs btn-outline-primary" onclick="toggleCategoryAll(${cat.id}, true)" style="font-size: 0.75rem;">
                      ✓ ${isBn ? 'সব নির্বাচন' : 'Select All'}
                    </button>
                    <button type="button" class="btn btn-xs btn-secondary" onclick="toggleCategoryAll(${cat.id}, false)" style="font-size: 0.75rem;">
                      ✕ ${isBn ? 'সব বাতিল' : 'Clear All'}
                    </button>
                  </div>
                </div>

                <!-- Checkboxes Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0.6rem;">
                  ${syms.map((s, sIdx) => {
                    const isChecked = savedSymptomIds.includes(s.id);
                    const isSuicide = (s.symptom_bn && s.symptom_bn.includes('আত্মহত্যা')) || (s.symptom_en && s.symptom_en.toLowerCase().includes('suicid'));
                    const primarySym = isBnCat ? s.symptom_bn : (s.symptom_en || s.symptom_bn);
                    const secondarySym = isBnCat ? s.symptom_en : s.symptom_bn;
                    return `
                      <label style="display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem 0.75rem; border: ${isSuicide ? '1.5px solid #FCA5A5' : '1px solid var(--border-light)'}; border-radius: 6px; background: ${isChecked ? (isSuicide ? '#FEF2F2' : '#F0FDF4') : '#FAFAFA'}; cursor: pointer; transition: all 0.15s ease;">
                        <input type="checkbox" class="diag-symptom-cb" 
                          data-cat-id="${cat.id}" 
                          data-cat-name-bn="${cat.name_bn}" 
                          data-cat-name-en="${cat.name_en}"
                          data-sym-bn="${s.symptom_bn}" 
                          data-sym-en="${s.symptom_en}"
                          data-is-suicide="${isSuicide ? '1' : '0'}"
                          value="${s.id}" 
                          ${isChecked ? 'checked' : ''} 
                          onchange="onDiagnosisCheckboxChange(this)" 
                          style="margin-top: 3px; accent-color: ${isSuicide ? '#DC2626' : 'var(--primary)'}; width: 17px; height: 17px; cursor: pointer;">
                        <div style="flex: 1;">
                          <div style="font-size: 0.85rem; font-weight: 600; color: ${isSuicide ? '#991B1B' : 'var(--text-main)'}; line-height: 1.4;">
                            ${sIdx + 1}. ${primarySym}
                            ${isSuicide ? '<span class="badge badge-danger" style="font-size: 0.7rem; margin-left: 4px; vertical-align: middle;">⚠️ জরুরি বিবেচনা</span>' : ''}
                          </div>
                          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                            ${secondarySym}
                          </div>
                        </div>
                      </label>
                    `;
                  }).join('')}
                </div>

                ${cat.code === 'onset_history' ? `
                  <!-- Problem Onset History Notes -->
                  <div style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-light);">
                    <label style="font-size: 0.85rem; font-weight: 700; color: #064E3B; display: block; margin-bottom: 0.35rem;">
                      📝 সমস্যা শুরুর সময় ও পটভূমির বিবরণ (ঐচ্ছিক নোটস):
                    </label>
                    <textarea id="diagOnsetHistoryNotes" class="form-control" rows="2" placeholder="সমস্যা কবে কীভাবে শুরু হয়েছিল... ">${diagnosis?.onset_history_notes || ''}</textarea>
                  </div>
                ` : ''}

                ${cat.code === 'family_social' ? `
                  <!-- Family & Social History Notes -->
                  <div style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-light);">
                    <label style="font-size: 0.85rem; font-weight: 700; color: #064E3B; display: block; margin-bottom: 0.35rem;">
                      👨‍👩‍👧‍👦 পারিবারিক ও সামাজিক পটভূমির বিবরণ (ঐচ্ছিক নোটস):
                    </label>
                    <textarea id="diagFamilySocialNotes" class="form-control" rows="2" placeholder="পারিবারিক কোনো বিশেষ সমস্যা বা সামাজিক পরিবেশের বিবরণ... ">${diagnosis?.family_social_notes || ''}</textarea>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Raqi Notes & Diagnosis Metadata -->
        <div class="card" style="margin-top: 1.5rem; background: #F8FAF9; border: 1px solid var(--border-light);">
          <h4 style="color: var(--primary); margin-bottom: 0.75rem;">
            📝 রাক্বীর ক্লিনিক্যাল পর্যবেক্ষণ ও কেস নোটস
          </h4>
          <div class="form-group">
            <label class="form-label">রাক্বীর বিশেষ পর্যবেক্ষণ ও পরামর্শ:</label>
            <textarea id="patientDiagNotes" class="form-control" rows="3" placeholder="রোগীর ডায়াগনোসিস সম্পর্কে রাক্বীর নিজস্ব মতামত, সুরক্ষামূলক আমল ও বিশেষ নির্দেশনা লিখুন...">${diagnosis?.notes || ''}</textarea>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">চিকিৎসক / প্রধান রাক্বীর নাম:</label>
              <input type="text" id="patientDiagRaqi" class="form-control" value="${diagnosis?.raqi_name || 'মুহাম্মদুল্লাহ মিয়াহ'}">
            </div>
            <div class="form-group">
              <label class="form-label">ডায়াগনোসিসের তারিখ:</label>
              <input type="date" id="patientDiagDate" class="form-control" value="${diagnosis?.diagnosis_date ? diagnosis.diagnosis_date.slice(0, 10) : new Date().toISOString().split('T')[0]}">
            </div>
          </div>

          <button type="button" id="btnSavePatientDiag" class="btn btn-primary btn-lg" onclick="savePatientDiagnosis('${patient.patient_id}')" style="width: 100%; margin-top: 1rem; font-size: 1rem; padding: 0.85rem; font-weight: 700;">
            💾 ডায়াগনোসিস রেকর্ড সংরক্ষণ ও আপডেট করুন
          </button>
        </div>
      </div>

      <!-- DOSSIER PANE 2: 10-CATEGORY STRUCTURED HISTORY FORM -->
      <div id="dossierPane-history" class="dossier-pane" style="display: none;">
        <form id="patientHistoryForm" onsubmit="savePatientHistory(event, '${patient.patient_id}')">
          
          <div class="card" style="margin-bottom: 1.25rem; border-left: 4px solid var(--primary-light);">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">১. প্রধান সমস্যা ও প্রাথমিক অভিযোগসমূহ (Main Symptoms & Complaints)</h4>
            <div class="chip-group">
              ${renderCheckboxChip('main_symptoms', 'বুকে চাপ ও দম বন্ধ হওয়ার অনুভূতি', mainSyms)}
              ${renderCheckboxChip('main_symptoms', 'হঠাৎ অহেতুক তীব্র রাগ ও ক্ষোভ', mainSyms)}
              ${renderCheckboxChip('main_symptoms', 'সার্বক্ষণিক অব্যক্ত ক্লান্তি ও দুর্বলতা', mainSyms)}
              ${renderCheckboxChip('main_symptoms', 'পরিবার ও আত্মীয়দের প্রতি হঠাৎ অনীহা', mainSyms)}
              ${renderCheckboxChip('main_symptoms', 'সামাজিক মেলামেশায় তীব্র অনীহা ও একাকিত্ব', mainSyms)}
              ${renderCheckboxChip('main_symptoms', 'অকারণে বারবার কান্না পাওয়া', mainSyms)}
              ${renderCheckboxChip('main_symptoms', 'স্মৃতিভ্রম ও মনোযোগের অভাব', mainSyms)}
            </div>
          </div>

          <div class="card" style="margin-bottom: 1.25rem; border-left: 4px solid var(--primary-light);">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">২. শারীরিক উপসর্গ ও ব্যাধি (Physical Symptoms)</h4>
            <div class="chip-group">
              ${renderCheckboxChip('physical_symptoms', 'পেটে জ্বালাপোড়া বা সূঁচ ফোটানোর অনুভূতি', physSyms)}
              ${renderCheckboxChip('physical_symptoms', 'পিঠের উপরিভাগ ও ঘাড়-কাঁধে প্রচণ্ড ভার', physSyms)}
              ${renderCheckboxChip('physical_symptoms', 'ওষুধে না কমা দীর্ঘস্থায়ী মাথাব্যথা', physSyms)}
              ${renderCheckboxChip('physical_symptoms', 'হাত-পায়ে অবশ বা ঝিঁঝিঁ লাগা', physSyms)}
              ${renderCheckboxChip('physical_symptoms', 'হঠাৎ শরীরে তীব্র ঠান্ডা বা গরম লাগা', physSyms)}
              ${renderCheckboxChip('physical_symptoms', 'পেট ফাঁপা ও দীর্ঘস্থায়ী বদহজম', physSyms)}
            </div>
          </div>

          <div class="card" style="margin-bottom: 1.25rem; border-left: 4px solid var(--primary-light);">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">৩. ঘুমের সমস্যা (Sleep Problems)</h4>
            <div class="chip-group">
              ${renderCheckboxChip('sleep_problems', 'তীব্র অনিদ্রা ও ঘুমাতে দীর্ঘ সময় লাগা', sleepSyms)}
              ${renderCheckboxChip('sleep_problems', 'বোবা ধরা / স্লিপ প্যারালাইসিস', sleepSyms)}
              ${renderCheckboxChip('sleep_problems', 'ভয়ে বারবার ঘুম ভেঙে যাওয়া', sleepSyms)}
              ${renderCheckboxChip('sleep_problems', 'ঘুমের মধ্যে দাঁত কিড়মিড় করা', sleepSyms)}
              ${renderCheckboxChip('sleep_problems', 'অতিরিক্ত তন্দ্রাভাব ও ফজর পড়তে কষ্ট', sleepSyms)}
            </div>
          </div>

          <div class="card" style="margin-bottom: 1.25rem; border-left: 4px solid var(--primary-light);">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">৪. স্বপ্নকেন্দ্রিক ভীতিকর অভিজ্ঞতা (Dream-Related Problems)</h4>
            <div class="chip-group">
              ${renderCheckboxChip('dream_problems', 'কালো কুকুর, বিড়াল বা হিংস্র প্রাণীর আক্রমণ', dreamSyms)}
              ${renderCheckboxChip('dream_problems', 'সাপ বা বিচ্ছুর তাড়া করা', dreamSyms)}
              ${renderCheckboxChip('dream_problems', 'উঁচু স্থান থেকে নিচে পড়ে যাওয়া', dreamSyms)}
              ${renderCheckboxChip('dream_problems', 'কবরস্থান বা নোংরা স্থানে ঘুরে বেড়ানো', dreamSyms)}
              ${renderCheckboxChip('dream_problems', 'ভয়ংকর ছায়ামূর্তি দেখা', dreamSyms)}
              ${renderCheckboxChip('dream_problems', 'ঘোলা পানিতে ডুবে যাওয়া', dreamSyms)}
            </div>
          </div>

          <div class="card" style="margin-bottom: 1.25rem; border-left: 4px solid var(--primary-light);">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">৫. ইবাদত ও দ্বীনি আমলের অবস্থা (Worship & Religious Activity)</h4>
            <div class="chip-group">
              ${renderCheckboxChip('worship_problems', 'আযান বা কুরআন তিলাওয়াত শুনতে অস্বস্তি', worshipSyms)}
              ${renderCheckboxChip('worship_problems', 'অজু বা সালাতে তীব্র ওয়াসওয়াসা ও সন্দেহ', worshipSyms)}
              ${renderCheckboxChip('worship_problems', 'তিলাওয়াতের সময় অতিরিক্ত হাই ও ঘুম আসা', worshipSyms)}
              ${renderCheckboxChip('worship_problems', 'সূরা বাক্বারাহ শুনলে বুক ধড়ফড় করা', worshipSyms)}
              ${renderCheckboxChip('worship_problems', 'নিয়মিত সালাত ও যিকিরে অনীহা', worshipSyms)}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
            <div class="form-group">
              <label class="form-label">৬. রিজিক ও পারিবারিক পরিস্থিতি:</label>
              <textarea id="histFinancial" class="form-control" rows="2" placeholder="ব্যবসায় হঠাৎ অচলাবস্থা, কর্মক্ষেত্রে অস্বাভাবিক বাধা, পারিবারিক অশান্তি...">${history?.rizq_family_situation || history?.financial_family_situation || ''}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">৭. বংশগত ইতিহাস ও পারিবারিক প্রেক্ষাপট:</label>
              <textarea id="histFamilyHistory" class="form-control" rows="2" placeholder="পরিবারে অন্য কারো সমস্যা, পূর্বপুরুষের প্রেক্ষাপট, শত্রুতা...">${history?.genetic_history || history?.family_history || ''}</textarea>
            </div>
          </div>

          <!-- PRD 7.A: সমস্যা কত দিন ধরে? -->
          <div class="card" style="margin-bottom: 1.25rem; border-left: 4px solid var(--primary); background: #FAFDFB;">
            <label class="form-label" style="font-weight: 700; color: var(--primary); font-size: 1rem; margin-bottom: 0.25rem;">
              ৮. সমস্যা কত দিন ধরে? *
            </label>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">
              রোগী কত দিন ধরে এই সমস্যা অনুভব করছেন তা তালিকা থেকে নির্বাচন করুন অথবা নির্দিষ্ট বিবরণ লিখুন:
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; align-items: start;">
              <div>
                <select id="histDurationSelect" class="form-control" onchange="if(this.value) document.getElementById('histDurationCustom').value = this.value;">
                  <option value="">-- সময়কাল নির্বাচন করুন --</option>
                  <option value="কয়েক দিন" ${(history?.problem_duration === 'কয়েক দিন' || history?.duration_of_problems === 'কয়েক দিন') ? 'selected' : ''}>কয়েক দিন</option>
                  <option value="কয়েক সপ্তাহ" ${(history?.problem_duration === 'কয়েক সপ্তাহ' || history?.duration_of_problems === 'কয়েক সপ্তাহ') ? 'selected' : ''}>কয়েক সপ্তাহ</option>
                  <option value="কয়েক মাস" ${(history?.problem_duration === 'কয়েক মাস' || history?.duration_of_problems === 'কয়েক মাস') ? 'selected' : ''}>কয়েক মাস</option>
                  <option value="৬ মাস" ${(history?.problem_duration === '৬ মাস' || history?.duration_of_problems === '৬ মাস') ? 'selected' : ''}>৬ মাস</option>
                  <option value="১ বছর" ${(history?.problem_duration === '১ বছর' || history?.duration_of_problems === '১ বছর') ? 'selected' : ''}>১ বছর</option>
                  <option value="২ বছর" ${(history?.problem_duration === '২ বছর' || history?.duration_of_problems === '২ বছর') ? 'selected' : ''}>২ বছর</option>
                  <option value="৩ বছর" ${(history?.problem_duration === '৩ বছর' || history?.duration_of_problems === '৩ বছর') ? 'selected' : ''}>৩ বছর</option>
                  <option value="৪ বছর" ${(history?.problem_duration === '৪ বছর' || history?.duration_of_problems === '৪ বছর') ? 'selected' : ''}>৪ বছর</option>
                  <option value="৫ বছর" ${(history?.problem_duration === '৫ বছর' || history?.duration_of_problems === '৫ বছর') ? 'selected' : ''}>৫ বছর</option>
                  <option value="৫ বছরের বেশি" ${(history?.problem_duration === '৫ বছরের বেশি' || history?.duration_of_problems === '৫ বছরের বেশি') ? 'selected' : ''}>৫ বছরের বেশি</option>
                </select>
                <!-- Quick preset chips -->
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
                  ${['কয়েক দিন', 'কয়েক সপ্তাহ', 'কয়েক মাস', '৬ মাস', '১ বছর', '২ বছর', '৩ বছর', '৫ বছরের বেশি'].map(tag => `
                    <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 1px 6px; border-radius: 3px;" onclick="document.getElementById('histDurationSelect').value='${tag}'; document.getElementById('histDurationCustom').value='${tag}';">${tag}</button>
                  `).join('')}
                </div>
              </div>
              <div>
                <input type="text" id="histDurationCustom" class="form-control" placeholder="বা নির্দিষ্ট বিবরণ লিখুন (যেমন: ১ বছর ৪ মাস ধরে)..." value="${(history?.problem_duration || history?.duration_of_problems || '').replace(/"/g, '&quot;')}">
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 3px;">কাস্টম বিবরণ লিখলে স্বয়ংক্রিয়ভাবে তা প্রাধান্য পাবে।</div>
              </div>
            </div>
          </div>

          <!-- PRD 7.B: কী কী প্রক্রিয়ায় চিকিৎসা নিয়েছেন? -->
          <div class="card" style="margin-bottom: 1.25rem; border-left: 4px solid var(--primary); background: #FAFDFB;">
            <label class="form-label" style="font-weight: 700; color: var(--primary); font-size: 1rem; margin-bottom: 0.25rem;">
              ৯. কী কী প্রক্রিয়ায় চিকিৎসা নিয়েছেন? *
            </label>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">
              পূর্বে নেওয়া সকল চিকিৎসার বিস্তারিত ইতিহাস (কবিরাজ, এলোপ্যাথিক, হোমিওপ্যাথিক, পূর্বের রুকইয়াহ বা অন্য কোনো চিকিৎসা):
            </p>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 0.5rem;">
              <span style="font-size: 0.8rem; color: var(--text-muted); align-self: center;">কুইক ট্যাগ যোগ করুন:</span>
              <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 2px 8px;" onclick="appendTreatmentTag('কবিরাজ')">+ কবিরাজ</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 2px 8px;" onclick="appendTreatmentTag('এলোপ্যাথিক')">+ এলোপ্যাথিক</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 2px 8px;" onclick="appendTreatmentTag('হোমিওপ্যাথিক')">+ হোমিওপ্যাথিক</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 2px 8px;" onclick="appendTreatmentTag('পূর্বের রুকইয়াহ')">+ পূর্বের রুকইয়াহ</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 2px 8px;" onclick="appendTreatmentTag('অন্যান্য চিকিৎসা')">+ অন্যান্য চিকিৎসা</button>
              <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 2px 8px;" onclick="appendTreatmentTag('কোনো চিকিৎসা নেননি')">+ কোনো চিকিৎসা নেননি</button>
            </div>
            <textarea id="histPreviousTreatments" class="form-control" rows="3" placeholder="রোগী পূর্বে কোথায় কোথায় চিকিৎসা নিয়েছেন, কী ধরনের ওষুধ বা তাবিয-কবচ ব্যবহার করেছেন, কী ফল পেয়েছেন বিস্তারিত লিখুন...">${history?.previous_treatment_history || history?.previous_medical_history || ''}</textarea>
          </div>

          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label class="form-label">১০. অতিরিক্ত তথ্য ও রাক্বীর পর্যবেক্ষণ:</label>
            <textarea id="histAdditional" class="form-control" rows="3" placeholder="পূর্ববর্তী কোনো তাবিয ধ্বংস করা হয়েছে কিনা, বিশেষ কোনো লক্ষণ বা রাক্বীর পর্যবেক্ষণ...">${history?.additional_information || ''}</textarea>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
            <button type="submit" class="btn btn-primary">Save Patient History / ইতিহাস সংরক্ষণ</button>
          </div>
        </form>
      </div>

      <!-- DOSSIER PANE 2: RUQYAH SESSIONS -->
      <div id="dossierPane-sessions" class="dossier-pane" style="display: none;">
        ${renderDossierSessions(sessions, patient)}
      </div>

      <!-- DOSSIER PANE 3: FOLLOW-UPS -->
      <div id="dossierPane-followups" class="dossier-pane" style="display: none;">
        ${renderDossierFollowups(followups, patient)}
      </div>

      <!-- DOSSIER PANE 4: APPOINTMENTS -->
      <div id="dossierPane-appointments" class="dossier-pane" style="display: none;">
        ${renderDossierAppointments(appointments)}
      </div>
    `;

    openModal('patientProfileModal');
  } catch (err) {
    showToast('Failed to open patient dossier.', 'error');
  }
}

function renderCheckboxChip(name, label, currentList) {
  const isChecked = currentList.includes(label);
  return `
    <label class="chip-label">
      <input type="checkbox" name="${name}" value="${label}" ${isChecked ? 'checked' : ''}>
      <span>${label}</span>
    </label>
  `;
}

function switchDossierTab(paneName, btnEl) {
  document.querySelectorAll('.dossier-tab-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
  document.querySelectorAll('.dossier-pane').forEach(p => p.style.display = 'none');
  const target = document.getElementById(`dossierPane-${paneName}`);
  if (target) target.style.display = 'block';
}

function renderDossierSessions(sessions, patient) {
  if (sessions.length === 0) {
    return `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No Ruqyah sessions recorded yet for this patient.</div>`;
  }

  let html = '';
  sessions.forEach(s => {
    html += `
      <div class="card" style="margin-bottom: 1.25rem; border-left: 4px solid var(--primary-light);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap;">
          <div>
            <strong style="color: var(--primary); font-size: 1.1rem;">Session #${s.session_number} (${s.session_id})</strong>
            <span style="margin-left: 0.75rem; color: var(--text-muted); font-size: 0.85rem;">Date: ${s.session_date}</span>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <a href="/api/admin/reports/session/${s.session_id}/pdf?lang=bn" class="btn btn-primary btn-sm" download>
              📥 বাংলা PDF ডাউনলোড
            </a>
            <a href="/api/admin/reports/session/${s.session_id}/pdf?lang=en" class="btn btn-secondary btn-sm" download>
              📥 English PDF Download
            </a>
            <button type="button" class="btn btn-outline-primary btn-sm" onclick="openSessionModal('${s.session_id}')">
              ✏️ ${(typeof getCurrentLang === 'function' && getCurrentLang() === 'bn') ? 'এডিট / খুলুন' : 'Edit / Details'}
            </button>
            <a href="/reports/view/session/${s.session_id}" target="_blank" class="btn btn-outline-secondary btn-sm">
              Print
            </a>
          </div>
        </div>
        <div style="margin-bottom: 0.5rem;">
          <span class="badge badge-primary">Assessment: ${s.assessment_category}</span>
          <span style="font-size: 0.85rem; color: var(--text-muted); margin-left: 0.5rem;">Raqi: ${s.raqi_name || 'Muhammadullah Miah'}</span>
        </div>
        <p style="font-size: 0.9rem; margin-bottom: 0.5rem;"><strong>Raqi Assessment:</strong> ${s.professional_assessment || 'N/A'}</p>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;"><strong>Recommendations:</strong> ${s.recommendations || 'Maintain morning and evening Adhkar.'}</p>
      </div>
    `;
  });
  return html;
}

function renderDossierFollowups(followups, patient) {
  if (followups.length === 0) {
    return `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No follow-ups recorded yet.</div>`;
  }
  let html = '';
  followups.forEach(f => {
    html += `
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div>
            <strong style="color: var(--primary);">${f.followup_date}</strong> (${f.scheduled_time || 'General'})
            <span class="badge ${f.status === 'Completed' ? 'badge-status-completed' : 'badge-status-pending'}" style="margin-left: 0.5rem;">${f.status}</span>
          </div>
          <div>
            <span class="badge badge-primary">Progression: ${f.symptom_progression || 'Unchanged'}</span>
          </div>
        </div>
        <div style="font-size: 0.9rem;">${f.treatment_progress_summary || f.symptom_changes_notes || 'No progression notes recorded.'}</div>
      </div>
    `;
  });
  return html;
}

function renderDossierAppointments(appointments) {
  if (appointments.length === 0) {
    return `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No appointment records found.</div>`;
  }
  let html = '';
  appointments.forEach(a => {
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0; border-bottom: 1px solid var(--border-light);">
        <div>
          <strong>${a.appointment_date}</strong> - ${a.time_slot}
          <div style="font-size: 0.85rem; color: var(--text-muted);">${a.service_name} (${a.appointment_id})</div>
        </div>
        <div>
          <span class="badge ${getBadgeClassForStatus(a.status)}">${a.status}</span>
        </div>
      </div>
    `;
  });
  return html;
}

window.appendTreatmentTag = function(tag) {
  const el = document.getElementById('histPreviousTreatments');
  if (!el) return;
  if (!el.value) {
    el.value = tag + ': ';
  } else {
    el.value = el.value.trim() + '\n' + tag + ': ';
  }
  el.focus();
};

async function savePatientHistory(event, patientId) {
  event.preventDefault();

  const getCheckedValues = (name) => {
    const checked = document.querySelectorAll(`input[name="${name}"]:checked`);
    return Array.from(checked).map(c => c.value);
  };

  const customDuration = document.getElementById('histDurationCustom')?.value?.trim();
  const selectDuration = document.getElementById('histDurationSelect')?.value;
  const durationValue = customDuration || selectDuration || document.getElementById('histDuration')?.value || '';

  const previousTreatments = document.getElementById('histPreviousTreatments')?.value?.trim() || 
                             document.getElementById('histMedical')?.value?.trim() || '';

  const payload = {
    main_symptoms: getCheckedValues('main_symptoms'),
    physical_symptoms: getCheckedValues('physical_symptoms'),
    sleep_problems: getCheckedValues('sleep_problems'),
    dream_problems: getCheckedValues('dream_problems'),
    worship_problems: getCheckedValues('worship_problems'),
    family_history: document.getElementById('histFamilyHistory')?.value?.trim(),
    genetic_history: document.getElementById('histFamilyHistory')?.value?.trim(),
    financial_family_situation: document.getElementById('histFinancial')?.value?.trim(),
    rizq_family_situation: document.getElementById('histFinancial')?.value?.trim(),
    previous_medical_history: previousTreatments,
    previous_treatment_history: previousTreatments,
    duration_of_problems: durationValue,
    problem_duration: durationValue,
    additional_information: document.getElementById('histAdditional')?.value?.trim()
  };

  try {
    const res = await fetch(`/api/admin/patients/${patientId}/history`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadPatientsList();
    } else {
      showToast(data.error || 'Failed to save history.', 'error');
    }
  } catch (err) {
    showToast('Failed to save patient history.', 'error');
  }
}

// ==========================================================================
// 6. RUQYAH DIAGNOSIS & SESSION MANAGEMENT
// ==========================================================================
async function loadSessionsList() {
  const tbody = document.getElementById('sessionsTableBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading Ruqyah sessions...</td></tr>`;

  try {
    const res = await fetch('/api/admin/sessions');
    const data = await res.json();
    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;
    if (!data.success || !data.data || data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">${isBn ? 'কোনো রুকইয়াহ সেশন পাওয়া যায়নি।' : 'No Ruqyah sessions found.'}</td></tr>`;
      return;
    }

    let html = '';
    data.data.forEach(s => {
      html += `
        <tr>
          <td><strong style="color: var(--primary);">${s.session_id}</strong></td>
          <td>
            <strong>${s.patient_name}</strong>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${s.patient_id}</div>
          </td>
          <td>${s.session_date} (${isBn ? `সেশন #${s.session_number}` : `Session #${s.session_number}`})</td>
          <td>
            <span class="badge badge-primary">${s.assessment_category}</span>
          </td>
          <td>${s.next_followup_date || '-'}</td>
          <td>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <a href="/api/admin/reports/session/${s.session_id}/pdf?lang=bn" class="btn btn-primary btn-xs" download title="বাংলা PDF ডাউনলোড">
                বাংলা PDF ডাউনলোড
              </a>
              <a href="/api/admin/reports/session/${s.session_id}/pdf?lang=en" class="btn btn-secondary btn-xs" download title="English PDF Download">
                English PDF Download
              </a>
              <button type="button" class="btn btn-outline-primary btn-xs" onclick="openSessionModal('${s.session_id}')">
                ${isBn ? 'এডিট / বিবরণী' : 'Edit / Details'}
              </button>
              <a href="/reports/view/session/${s.session_id}" target="_blank" class="btn btn-outline-secondary btn-xs">
                ${isBn ? 'প্রিন্ট' : 'Print'}
              </a>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">Failed to load sessions.</td></tr>`;
  }
}

// Reopen / Edit Session in Modal
async function openSessionModal(sessionId) {
  try {
    const res = await fetch(`/api/admin/sessions/${sessionId}`);
    const data = await res.json();
    if (!data.success || !data.data) {
      showToast('Could not load session details.', 'error');
      return;
    }
    const s = data.data;

    // Set Patient in select
    const patientSelect = document.getElementById('newSessionPatientSelect');
    if (patientSelect) {
      patientSelect.innerHTML = '<option value="">-- Choose Patient --</option>';
      allPatientsCache.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.patient_id;
        opt.textContent = `${p.full_name} (${p.patient_id})`;
        if (p.patient_id === s.patient_id) opt.selected = true;
        patientSelect.appendChild(opt);
      });
      patientSelect.value = s.patient_id;
    }

    document.getElementById('editingSessionId').value = s.session_id || s.id;
    document.getElementById('newSessionDate').value = s.session_date;
    document.getElementById('newSessionRaqiName').value = s.raqi_name || 'মুহাম্মদুল্লাহ মিয়া';
    document.getElementById('newSessionMedicalHistory').value = s.medical_history_checked || '';
    document.getElementById('newSessionMainSymptoms').value = s.patient_main_symptoms || s.reported_symptoms || '';
    document.getElementById('newSessionPhysicalObservations').value = s.physical_observations || s.raqi_observations || '';
    document.getElementById('newSessionPrescribedAmal').value = s.prescribed_amal || (typeof s.prescribed_remedies === 'string' && !s.prescribed_remedies.startsWith('[') ? s.prescribed_remedies : '') || '';
    document.getElementById('newSessionRaqiComments').value = s.raqi_comments || s.professional_assessment || '';
    document.getElementById('newSessionSpecialAdvice').value = s.special_advice || s.recommendations || '';
    document.getElementById('newSessionFollowupDate').value = s.next_followup_date || '';

    // Observed Reactions Checkboxes
    let reactions = [];
    try {
      reactions = JSON.parse(s.observed_reactions || '[]');
    } catch {
      reactions = s.observed_reactions ? [s.observed_reactions] : [];
    }
    document.querySelectorAll('#newSessionModal input[name="observed_reactions"]').forEach(cb => {
      cb.checked = reactions.includes(cb.value);
    });

    // Manual Diagnosis Checkboxes
    let diags = [];
    try {
      diags = JSON.parse(s.manual_diagnosis || '[]');
    } catch {
      diags = s.manual_diagnosis ? [s.manual_diagnosis] : (s.assessment_category ? s.assessment_category.split(',').map(d => d.trim()) : []);
    }
    document.querySelectorAll('#newSessionModal input[name="manual_diagnosis"]').forEach(cb => {
      cb.checked = diags.includes(cb.value) || (s.assessment_category && s.assessment_category.includes(cb.value));
    });

    openModal('newSessionModal');
  } catch (err) {
    showToast('Failed to open session for editing.', 'error');
  }
}

function openNewSessionForPatient(patientId = '') {
  document.getElementById('newSessionForm')?.reset();
  const editingIdInput = document.getElementById('editingSessionId');
  if (editingIdInput) editingIdInput.value = '';

  document.querySelectorAll('#newSessionModal input[type="checkbox"]').forEach(cb => cb.checked = false);

  const patientSelect = document.getElementById('newSessionPatientSelect');
  if (patientSelect) {
    patientSelect.innerHTML = '<option value="">-- Choose Patient --</option>';
    allPatientsCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.patient_id;
      opt.textContent = `${p.full_name} (${p.patient_id})`;
      if (p.patient_id === patientId) opt.selected = true;
      patientSelect.appendChild(opt);
    });
    if (patientId) patientSelect.value = patientId;
  }

  const sessionDateInput = document.getElementById('newSessionDate');
  if (sessionDateInput) {
    sessionDateInput.value = new Date().toISOString().split('T')[0];
  }

  openModal('newSessionModal');
}

// Handle Record Session Form Submit
document.getElementById('newSessionForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const getCheckedValues = (name) => {
    const checked = document.querySelectorAll(`input[name="${name}"]:checked`);
    return Array.from(checked).map(c => c.value);
  };

  const editingId = document.getElementById('editingSessionId')?.value;
  const manualDiagnosisList = getCheckedValues('manual_diagnosis');

  const mainSymptomsText = document.getElementById('newSessionMainSymptoms')?.value?.trim() || '';
  const physicalObsText = document.getElementById('newSessionPhysicalObservations')?.value?.trim() || '';
  const prescribedAmalText = document.getElementById('newSessionPrescribedAmal')?.value?.trim() || '';
  const raqiCommentsText = document.getElementById('newSessionRaqiComments')?.value?.trim() || '';
  const specialAdviceText = document.getElementById('newSessionSpecialAdvice')?.value?.trim() || '';

  const payload = {
    patient_id: document.getElementById('newSessionPatientSelect')?.value,
    session_date: document.getElementById('newSessionDate')?.value,
    raqi_name: document.getElementById('newSessionRaqiName')?.value || 'মুহাম্মদুল্লাহ মিয়া',
    medical_history_checked: document.getElementById('newSessionMedicalHistory')?.value?.trim(),
    patient_main_symptoms: mainSymptomsText,
    reported_symptoms: mainSymptomsText,
    observed_reactions: getCheckedValues('observed_reactions'),
    physical_observations: physicalObsText,
    raqi_observations: physicalObsText,
    manual_diagnosis: manualDiagnosisList,
    assessment_category: manualDiagnosisList.length > 0 ? manualDiagnosisList.join(', ') : 'Spiritual Affliction Evaluated',
    prescribed_amal: prescribedAmalText,
    prescribed_remedies: prescribedAmalText,
    raqi_comments: raqiCommentsText,
    professional_assessment: raqiCommentsText,
    special_advice: specialAdviceText,
    recommendations: specialAdviceText,
    next_followup_date: document.getElementById('newSessionFollowupDate')?.value || null
  };

  if (!payload.patient_id || !payload.session_date) {
    showToast('Please select Patient and Session Date.', 'error');
    return;
  }

  if (manualDiagnosisList.length === 0) {
    showToast('অনুগ্রহ করে রাকির প্রাথমিক ডায়াগনোসিস থেকে অন্তত একটি অপশন নির্বাচন করুন।', 'error');
    return;
  }

  try {
    const url = editingId ? `/api/admin/sessions/${editingId}` : '/api/admin/sessions';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'সেশন সফলভাবে সংরক্ষিত হয়েছে।', 'success');
      closeModal('newSessionModal');
      document.getElementById('newSessionForm')?.reset();
      const editingIdInput = document.getElementById('editingSessionId');
      if (editingIdInput) editingIdInput.value = '';
      loadSessionsList();
      loadDashboardData();
    } else {
      showToast(data.error || 'সেশন সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('Failed to save session.', 'error');
  }
});

// ==========================================================================
// 7. FOLLOW-UP MANAGEMENT
// ==========================================================================
async function loadFollowupsList() {
  const tbody = document.getElementById('followupsTableBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading follow-ups...</td></tr>`;

  try {
    const res = await fetch('/api/admin/followups');
    const data = await res.json();
    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;
    if (!data.success || !data.data || data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">${isBn ? 'কোনো জরুরি ফলো-আপ রিমাইন্ডার নেই।' : 'No follow-ups recorded.'}</td></tr>`;
      return;
    }

    let html = '';
    data.data.forEach(f => {
      const badgeHtml = typeof formatStatusBadge === 'function' ? formatStatusBadge(f.status) : `<span class="badge ${f.status === 'Completed' ? 'badge-status-completed' : 'badge-status-pending'}">${f.status}</span>`;
      html += `
        <tr>
          <td><strong style="color: var(--primary);">${f.followup_date}</strong></td>
          <td>
            <strong>${f.patient_name}</strong>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${f.patient_phone}</div>
          </td>
          <td>
            <span class="badge badge-primary">${f.symptom_progression || 'Unchanged'}</span>
          </td>
          <td style="font-size: 0.85rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${f.treatment_progress_summary || f.symptom_changes_notes || '-'}
          </td>
          <td>
            ${badgeHtml}
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openFollowupModal('${f.id}')">${isBn ? 'হালনাগাদ' : 'Update'}</button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">Failed to load follow-ups.</td></tr>`;
  }
}

async function openFollowupModal(followupId) {
  try {
    const res = await fetch('/api/admin/followups');
    const data = await res.json();
    const f = data.data?.find(item => String(item.id) === String(followupId));
    if (!f) return;

    const modalContent = document.getElementById('followupModalContent');
    if (!modalContent) return;

    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;
    modalContent.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <span style="font-size: 0.8rem; color: var(--text-muted);">${isBn ? 'রোগীর ফলো-আপ মূল্যায়ন' : 'PATIENT FOLLOW-UP EVALUATION'}</span>
        <h3 style="color: var(--primary); margin: 0;">${f.patient_name}</h3>
        <div style="font-size: 0.85rem; color: var(--text-muted);">${isBn ? 'তারিখ:' : 'Date:'} ${f.followup_date} | ${isBn ? 'ফোন:' : 'Phone:'} ${f.patient_phone}</div>
      </div>

      <div class="form-group">
        <label class="form-label">${isBn ? 'উপসর্গের পরিবর্তন ও অগ্রগতি:' : 'Symptom Progression / Changes:'}</label>
        <select id="modalFollowupProgression" class="form-control">
          <option value="Significantly Improved" ${f.symptom_progression === 'Significantly Improved' ? 'selected' : ''}>${isBn ? 'উল্লেখযোগ্য উন্নতি (Significantly Improved)' : 'Significantly Improved'}</option>
          <option value="Mildly Improved" ${f.symptom_progression === 'Mildly Improved' ? 'selected' : ''}>${isBn ? 'সামান্য উন্নতি (Mildly Improved)' : 'Mildly Improved'}</option>
          <option value="Unchanged" ${f.symptom_progression === 'Unchanged' ? 'selected' : ''}>${isBn ? 'অপরিবর্তিত (Unchanged)' : 'Unchanged'}</option>
          <option value="Worsened" ${f.symptom_progression === 'Worsened' ? 'selected' : ''}>${isBn ? 'অবনতি (Worsened)' : 'Worsened'}</option>
          <option value="New Symptoms Appeared" ${f.symptom_progression === 'New Symptoms Appeared' ? 'selected' : ''}>${isBn ? 'নতুন উপসর্গ দেখা দিয়েছে (New Symptoms)' : 'New Symptoms Appeared'}</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">${isBn ? 'উপসর্গের পরিবর্তন ও রোগীর অনুভূতি:' : 'Symptom Changes & Patient Feedback:'}</label>
        <textarea id="modalFollowupNotes" class="form-control" rows="3" placeholder="${isBn ? 'খারাপ স্বপ্ন কমেছে কিনা, মাথাব্যথার উপশম, বরই পাতার পানিতে গোসলের প্রতিক্রিয়া...' : 'Describe reduction in nightmares, headache relief, reaction to Sidr bath...'}">${f.symptom_changes_notes || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">${isBn ? 'নতুন পর্যবেক্ষণ ও পরামর্শ:' : 'New Clinical Observations:'}</label>
        <textarea id="modalFollowupObs" class="form-control" rows="2" placeholder="${isBn ? 'শারীরিক অবস্থা, মানসিক প্রশান্তি, সালাতের একাগ্রতা...' : 'Posture, calmness, prayer diligence...'}">${f.new_observations || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">${isBn ? 'ফলো-আপ স্ট্যাটাস:' : 'Follow-up Status:'}</label>
        <select id="modalFollowupStatus" class="form-control">
          <option value="Scheduled" ${f.status === 'Scheduled' ? 'selected' : ''}>${isBn ? 'নির্ধারিত (Scheduled)' : 'Scheduled'}</option>
          <option value="Completed" ${f.status === 'Completed' ? 'selected' : ''}>${isBn ? 'সম্পন্ন (Completed)' : 'Completed'}</option>
          <option value="Cancelled" ${f.status === 'Cancelled' ? 'selected' : ''}>${isBn ? 'বাতিল (Cancelled)' : 'Cancelled'}</option>
          <option value="Overdue" ${f.status === 'Overdue' ? 'selected' : ''}>${isBn ? 'বিলম্বে চলমান (Overdue)' : 'Overdue'}</option>
        </select>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
        <button type="button" class="btn btn-secondary" onclick="closeModal('followupModal')">${isBn ? 'বাতিল' : 'Cancel'}</button>
        <button type="button" class="btn btn-primary" onclick="saveFollowupChanges('${f.id}')">${isBn ? 'সংরক্ষণ করুন' : 'Save Progression'}</button>
      </div>
    `;

    openModal('followupModal');
  } catch (err) {
    showToast('Failed to open follow-up.', 'error');
  }
}

async function saveFollowupChanges(followupId) {
  const payload = {
    symptom_progression: document.getElementById('modalFollowupProgression')?.value,
    symptom_changes_notes: document.getElementById('modalFollowupNotes')?.value?.trim(),
    new_observations: document.getElementById('modalFollowupObs')?.value?.trim(),
    treatment_progress_summary: document.getElementById('modalFollowupNotes')?.value?.trim(),
    status: document.getElementById('modalFollowupStatus')?.value
  };

  try {
    const res = await fetch(`/api/admin/followups/${followupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('followupModal');
      loadFollowupsList();
      loadDashboardData();
    } else {
      showToast(data.error || 'Failed to update follow-up.', 'error');
    }
  } catch (err) {
    showToast('Failed to save follow-up.', 'error');
  }
}

// ==========================================================================
// 8. PRICING & SERVICES MANAGEMENT
// ==========================================================================
async function loadPricingList() {
  const tbody = document.getElementById('pricingTableBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading pricing...</td></tr>`;

  try {
    const res = await fetch('/api/admin/pricing');
    const data = await res.json();
    if (!data.success || !data.data) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Failed to load services.</td></tr>`;
      return;
    }

    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;
    let html = '';
    data.data.forEach(s => {
      html += `
        <tr>
          <td><strong style="color: var(--primary);">${s.name}</strong></td>
          <td><span class="badge badge-primary">${s.category}</span></td>
          <td>${s.duration_minutes} ${isBn ? 'মিনিট' : 'min'}</td>
          <td><strong>৳${s.price}</strong></td>
          <td>${s.discount_price ? `<span style="color: #059669; font-weight: 700;">৳${s.discount_price}</span>` : '-'}</td>
          <td>
            <button class="btn ${s.is_active ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="toggleServiceActive('${s.id}')">
              ${s.is_active ? (isBn ? 'সক্রিয়' : 'Active') : (isBn ? 'নিষ্ক্রিয়' : 'Inactive')}
            </button>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openEditServiceModal('${s.id}')">${isBn ? 'সম্পাদনা' : 'Edit'}</button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Failed to load services.</td></tr>`;
  }
}

async function toggleServiceActive(serviceId) {
  try {
    const res = await fetch(`/api/admin/pricing/${serviceId}/toggle`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadPricingList();
      loadServicesCache();
    }
  } catch (err) {
    showToast('Failed to toggle status.', 'error');
  }
}

// Add New Service Form Submit
document.getElementById('addServiceForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('addServiceName')?.value?.trim(),
    category: document.getElementById('addServiceCategory')?.value,
    duration_minutes: parseInt(document.getElementById('addServiceDuration')?.value, 10),
    price: parseFloat(document.getElementById('addServicePrice')?.value),
    discount_price: document.getElementById('addServiceDiscount')?.value ? parseFloat(document.getElementById('addServiceDiscount').value) : null,
    description: document.getElementById('addServiceDesc')?.value?.trim()
  };

  try {
    const res = await fetch('/api/admin/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('addServiceModal');
      document.getElementById('addServiceForm')?.reset();
      loadPricingList();
      loadServicesCache();
    } else {
      showToast(data.error || 'Failed to add service.', 'error');
    }
  } catch (err) {
    showToast('Failed to add service.', 'error');
  }
});

// Edit Service Modal
async function openEditServiceModal(serviceId) {
  try {
    const res = await fetch('/api/admin/pricing');
    const data = await res.json();
    const s = data.data?.find(item => String(item.id) === String(serviceId));
    if (!s) return;

    const modalContent = document.getElementById('editServiceModalContent');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="form-group">
        <label class="form-label">Service Name:</label>
        <input type="text" id="editServiceName" class="form-control" value="${s.name}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Category:</label>
        <select id="editServiceCategory" class="form-control">
          <option value="ruqyah" ${s.category === 'ruqyah' ? 'selected' : ''}>Ruqyah Shariah</option>
          <option value="hijama" ${s.category === 'hijama' ? 'selected' : ''}>Sunnah Hijama</option>
          <option value="consultation" ${s.category === 'consultation' ? 'selected' : ''}>Consultation</option>
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Regular Price (৳):</label>
          <input type="number" id="editServicePrice" class="form-control" value="${s.price}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Discount Price (৳):</label>
          <input type="number" id="editServiceDiscount" class="form-control" value="${s.discount_price || ''}" placeholder="Optional">
        </div>
        <div class="form-group">
          <label class="form-label">Duration (Min):</label>
          <input type="number" id="editServiceDuration" class="form-control" value="${s.duration_minutes}" required>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Public Description:</label>
        <textarea id="editServiceDesc" class="form-control" rows="2">${s.description || ''}</textarea>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
        <button type="button" class="btn btn-secondary" onclick="closeModal('editServiceModal')">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="saveEditedService('${s.id}')">Save Changes</button>
      </div>
    `;

    openModal('editServiceModal');
  } catch (err) {
    showToast('Failed to open service edit.', 'error');
  }
}

async function saveEditedService(serviceId) {
  const payload = {
    name: document.getElementById('editServiceName')?.value?.trim(),
    category: document.getElementById('editServiceCategory')?.value,
    price: parseFloat(document.getElementById('editServicePrice')?.value),
    discount_price: document.getElementById('editServiceDiscount')?.value ? parseFloat(document.getElementById('editServiceDiscount').value) : null,
    duration_minutes: parseInt(document.getElementById('editServiceDuration')?.value, 10),
    description: document.getElementById('editServiceDesc')?.value?.trim()
  };

  try {
    const res = await fetch(`/api/admin/pricing/${serviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('editServiceModal');
      loadPricingList();
      loadServicesCache();
    } else {
      showToast(data.error || 'Failed to update service.', 'error');
    }
  } catch (err) {
    showToast('Failed to save service.', 'error');
  }
}

// ==========================================================================
// 9. REPORTS HUB
// ==========================================================================
async function loadReportsList() {
  const tbody = document.getElementById('reportsTableBody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading reports...</td></tr>`;
  }

  // Populate Quick Downloader Selectors in PDF Reports Hub
  try {
    const patSelect = document.getElementById('hubPatientSelect');
    if (patSelect && patSelect.options.length <= 1) {
      const pRes = await fetch('/api/admin/patients');
      const pData = await pRes.json();
      if (pData.success && pData.data) {
        pData.data.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.patient_id;
          opt.textContent = `${p.full_name} (${p.patient_id}) - ${p.phone}`;
          patSelect.appendChild(opt);
        });
        patSelect.addEventListener('change', () => {
          const pid = patSelect.value;
          const bnBtn = document.getElementById('hubPatientDownloadBn');
          const enBtn = document.getElementById('hubPatientDownloadEn');
          if (pid) {
            if (bnBtn) {
              bnBtn.href = `/api/admin/reports/patient/${pid}/pdf?lang=bn`;
              bnBtn.style.display = 'inline-block';
            }
            if (enBtn) {
              enBtn.href = `/api/admin/reports/patient/${pid}/pdf?lang=en`;
              enBtn.style.display = 'inline-block';
            }
          } else {
            if (bnBtn) bnBtn.style.display = 'none';
            if (enBtn) enBtn.style.display = 'none';
          }
        });
      }
    }

    const sessSelect = document.getElementById('hubSessionSelect');
    if (sessSelect && sessSelect.options.length <= 1) {
      const sRes = await fetch('/api/admin/sessions');
      const sData = await sRes.json();
      if (sData.success && sData.data) {
        sData.data.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.session_id;
          opt.textContent = `Session #${s.session_number} (${s.session_id}) - ${s.patient_name}`;
          sessSelect.appendChild(opt);
        });
        sessSelect.addEventListener('change', () => {
          const sid = sessSelect.value;
          const bnBtn = document.getElementById('hubSessionDownloadBn');
          const enBtn = document.getElementById('hubSessionDownloadEn');
          if (sid) {
            if (bnBtn) {
              bnBtn.href = `/api/admin/reports/session/${sid}/pdf?lang=bn`;
              bnBtn.style.display = 'inline-block';
            }
            if (enBtn) {
              enBtn.href = `/api/admin/reports/session/${sid}/pdf?lang=en`;
              enBtn.style.display = 'inline-block';
            }
          } else {
            if (bnBtn) bnBtn.style.display = 'none';
            if (enBtn) enBtn.style.display = 'none';
          }
        });
      }
    }
  } catch (err) {
    console.error('Error populating reports hub selectors:', err);
  }

  try {
    const res = await fetch('/api/admin/reports/list');
    const data = await res.json();
    if (!data.success || !data.data || data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No archived reports found.</td></tr>`;
      return;
    }

    let html = '';
    data.data.forEach(r => {
      const isHistory = r.report_type === 'patient_history';
      const downloadUrl = isHistory 
        ? `/api/admin/reports/patient/${r.patient_id}/pdf` 
        : `/api/admin/reports/session/${r.session_id}/pdf`;
      const viewUrl = isHistory
        ? `/reports/view/patient/${r.patient_id}`
        : `/reports/view/session/${r.session_id}`;

      html += `
        <tr>
          <td><strong style="color: var(--primary);">${r.report_id}</strong></td>
          <td>
            <span class="badge ${isHistory ? 'badge-primary' : 'badge-gold'}">
              ${isHistory ? 'Patient History Report' : 'Ruqyah Session Report'}
            </span>
          </td>
          <td>${r.patient_name} (${r.patient_id})</td>
          <td>${r.created_at?.slice(0, 16)} by ${r.generated_by || 'Admin'}</td>
          <td>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <a href="${downloadUrl}?lang=bn" class="btn btn-primary btn-xs" download title="বাংলা PDF ডাউনলোড">বাংলা PDF ডাউনলোড</a>
              <a href="${downloadUrl}?lang=en" class="btn btn-secondary btn-xs" download title="English PDF Download">English PDF Download</a>
              <a href="${viewUrl}" target="_blank" class="btn btn-outline-secondary btn-xs">Print</a>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Failed to load reports.</td></tr>`;
  }
}

// ==========================================================================
// 10. CLINIC SETTINGS & AUDIT LOGS
// ==========================================================================
async function loadClinicSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if (data.success && data.data) {
      const s = data.data;
      if (document.getElementById('settingsBusinessName')) document.getElementById('settingsBusinessName').value = s.business_name || '';
      if (document.getElementById('settingsBranchName')) document.getElementById('settingsBranchName').value = s.branch_name || '';
      if (document.getElementById('settingsRaqiName')) document.getElementById('settingsRaqiName').value = s.raqi_name || '';
      if (document.getElementById('settingsPhone')) document.getElementById('settingsPhone').value = s.phone || '';
      if (document.getElementById('settingsWhatsapp')) document.getElementById('settingsWhatsapp').value = s.whatsapp || '';
      if (document.getElementById('settingsAddress')) document.getElementById('settingsAddress').value = s.address || '';
      if (document.getElementById('settingsEmail')) document.getElementById('settingsEmail').value = s.email || '';
      if (document.getElementById('settingsHours')) document.getElementById('settingsHours').value = s.hours || '';
      if (document.getElementById('settingsLogoPreview') && s.logo_url) {
        document.getElementById('settingsLogoPreview').src = s.logo_url;
      }
    }

    // Load Audit Logs
    loadAuditLogs();
    // Load Homepage Notice in Admin
    loadAdminNotice();
  } catch (err) {
    console.error(err);
  }
}

async function loadAdminNotice() {
  try {
    const res = await fetch('/api/admin/settings/notice');
    const data = await res.json();
    if (data.success && data.data) {
      const n = data.data;
      if (document.getElementById('noticeContentBn')) document.getElementById('noticeContentBn').value = n.content_bn || '';
      if (document.getElementById('noticeContentEn')) document.getElementById('noticeContentEn').value = n.content_en || '';
      const badge = document.getElementById('noticeStatusBadge');
      const btn = document.getElementById('toggleNoticeBtn');
      if (badge) {
        badge.textContent = n.is_active ? 'Published (সক্রিয়)' : 'Unpublished (নিষ্ক্রিয়)';
        badge.className = n.is_active ? 'badge badge-success' : 'badge badge-secondary';
      }
      if (btn) {
        btn.textContent = n.is_active ? 'Unpublish Notice' : 'Publish Notice';
      }
    }
  } catch (err) {
    console.error('Failed to load admin notice:', err);
  }
}

document.getElementById('announcementNoticeForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const contentBn = document.getElementById('noticeContentBn')?.value?.trim();
  const contentEn = document.getElementById('noticeContentEn')?.value?.trim();

  try {
    const res = await fetch('/api/admin/settings/notice', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title_bn: 'জরুরি বিজ্ঞপ্তি',
        title_en: 'Important Notice',
        content_bn: contentBn,
        content_en: contentEn,
        is_active: 1
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Notice updated and published successfully!', 'success');
      loadAdminNotice();
    } else {
      showToast(data.error || 'Failed to update notice.', 'error');
    }
  } catch (err) {
    showToast('Failed to save notice.', 'error');
  }
});

document.getElementById('toggleNoticeBtn')?.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/admin/settings/notice/toggle', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadAdminNotice();
    } else {
      showToast(data.error || 'Failed to toggle notice.', 'error');
    }
  } catch (err) {
    showToast('Failed to toggle notice.', 'error');
  }
});

// Price Override Modal System
function openPriceOverrideModal(id, aptId, patientName, currentFee) {
  const modal = document.getElementById('priceOverrideModal');
  const idInput = document.getElementById('overrideAptId');
  const info = document.getElementById('overridePatientInfo');
  const feeInfo = document.getElementById('overrideCurrentFee');
  const priceInput = document.getElementById('overridePriceInput');

  if (idInput) idInput.value = id;
  if (info) info.textContent = `Patient: ${patientName} (${aptId})`;
  if (feeInfo) feeInfo.textContent = `Current Fee: ${currentFee || 0} BDT`;
  if (priceInput) priceInput.value = currentFee || 0;

  if (modal) modal.style.display = 'flex';
}

function closePriceOverrideModal() {
  const modal = document.getElementById('priceOverrideModal');
  if (modal) modal.style.display = 'none';
}

document.getElementById('priceOverrideForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('overrideAptId')?.value;
  const price = document.getElementById('overridePriceInput')?.value;
  const reason = document.getElementById('overrideReasonInput')?.value?.trim();

  try {
    const res = await fetch(`/api/admin/appointments/${id}/override-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adjusted_price: parseFloat(price),
        reason: reason || 'Financial relief concession'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Fee adjusted successfully!', 'success');
      closePriceOverrideModal();
      loadAppointmentsList();
    } else {
      showToast(data.error || 'Failed to adjust fee.', 'error');
    }
  } catch (err) {
    showToast('Failed to adjust fee.', 'error');
  }
});

document.getElementById('clinicSettingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    business_name: document.getElementById('settingsBusinessName')?.value?.trim(),
    branch_name: document.getElementById('settingsBranchName')?.value?.trim(),
    raqi_name: document.getElementById('settingsRaqiName')?.value?.trim(),
    phone: document.getElementById('settingsPhone')?.value?.trim(),
    whatsapp: document.getElementById('settingsWhatsapp')?.value?.trim(),
    address: document.getElementById('settingsAddress')?.value?.trim(),
    email: document.getElementById('settingsEmail')?.value?.trim(),
    hours: document.getElementById('settingsHours')?.value?.trim()
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
    } else {
      showToast(data.error || 'Failed to update settings.', 'error');
    }
  } catch (err) {
    showToast('Failed to update settings.', 'error');
  }
});

// Change Password Form
document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const cur = document.getElementById('currentPasswordInput')?.value;
  const newP = document.getElementById('newPasswordInput')?.value;
  const conf = document.getElementById('confirmPasswordInput')?.value;

  if (newP !== conf) {
    showToast('New passwords do not match.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: cur, new_password: newP })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('changePasswordForm')?.reset();
    } else {
      showToast(data.error || 'Password change failed.', 'error');
    }
  } catch (err) {
    showToast('Failed to change password.', 'error');
  }
});

async function loadAuditLogs() {
  const container = document.getElementById('auditLogsContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/settings/audit-logs');
    const data = await res.json();
    if (!data.success || !data.data || data.data.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">No audit records.</p>`;
      return;
    }

    let html = '<div style="font-family: monospace; font-size: 0.8rem; line-height: 1.5;">';
    data.data.slice(0, 30).forEach(log => {
      html += `
        <div style="padding: 0.35rem 0; border-bottom: 1px solid var(--border-light);">
          <span style="color: var(--text-muted);">${log.created_at?.slice(0, 19)}</span> | 
          <strong style="color: var(--primary);">${log.admin_username}</strong> | 
          <span style="font-weight: 600;">${log.action}</span> - 
          <span>${log.details || ''}</span>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = 'Failed to load logs.';
  }
}

// ==========================================================================
// MODAL CONTROLS
// ==========================================================================
function setupModals() {
  document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        el.closest('.modal-overlay')?.classList.remove('open');
      }
    });
  });
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

function getBadgeClassForStatus(status) {
  if (status === 'Confirmed') return 'badge-status-confirmed';
  if (status === 'Completed') return 'badge-status-completed';
  if (status === 'Cancelled') return 'badge-status-cancelled';
  if (status === 'Rescheduled') return 'badge-status-rescheduled';
  return 'badge-status-pending';
}

function formatStatusBadge(status) {
  const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;
  const badgeClass = getBadgeClassForStatus(status);
  let label = status;
  if (isBn) {
    if (status === 'Pending') label = 'অপেক্ষমান (Pending)';
    else if (status === 'Confirmed') label = 'নিশ্চিতকৃত (Confirmed)';
    else if (status === 'Completed') label = 'সম্পন্ন (Completed)';
    else if (status === 'Cancelled') label = 'বাতিল (Cancelled)';
    else if (status === 'Rescheduled') label = 'পুনঃনির্ধারিত (Rescheduled)';
  }
  return `<span class="badge ${badgeClass}">${label}</span>`;
}

// ==========================================================================
// 9-CATEGORY DIAGNOSIS ENGINE & INTERACTIVE FUNCTIONS
// ==========================================================================

function onDiagnosisCheckboxChange(cb) {
  if (cb) {
    const isSuicide = cb.getAttribute('data-is-suicide') === '1';
    const parentLabel = cb.closest('label');
    if (parentLabel) {
      if (cb.checked) {
        parentLabel.style.backgroundColor = isSuicide ? '#FEF2F2' : '#F0FDF4';
      } else {
        parentLabel.style.backgroundColor = '#FAFAFA';
      }
    }
  }

  const checkedBoxes = Array.from(document.querySelectorAll('.diag-symptom-cb:checked'));
  const totalCount = checkedBoxes.length;

  const catMap = new Map();
  let hasSuicide = false;

  checkedBoxes.forEach(box => {
    const catId = box.getAttribute('data-cat-id');
    const catNameBn = box.getAttribute('data-cat-name-bn') || 'ক্যাটাগরি';
    const catNameEn = box.getAttribute('data-cat-name-en') || 'Category';
    const symBn = box.getAttribute('data-sym-bn') || '';
    const symEn = box.getAttribute('data-sym-en') || '';
    const isSuic = box.getAttribute('data-is-suicide') === '1' || symBn.includes('আত্মহত্যা') || symEn.toLowerCase().includes('suicid');

    if (isSuic) {
      hasSuicide = true;
    }

    if (!catMap.has(catId)) {
      catMap.set(catId, { nameBn: catNameBn, nameEn: catNameEn, symptoms: [] });
    }
    catMap.get(catId).symptoms.push({ bn: symBn, en: symEn });
  });

  const catCount = catMap.size;
  const badgeEl = document.getElementById('liveDiagBadge');
  const summaryTextEl = document.getElementById('liveDiagSummaryText');
  const alertEl = document.getElementById('suicideSafetyAlert');

  if (alertEl) {
    alertEl.style.display = hasSuicide ? 'block' : 'none';
  }

  const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;

  if (badgeEl) {
    if (hasSuicide) {
      badgeEl.innerHTML = (isBn ? `নির্বাচিত উপসর্গ: ${totalCount} টি (ক্যাটাগরি: ${catCount} টি)` : `Selected: ${totalCount} (Categories: ${catCount})`) + ' <span class="badge badge-danger" style="margin-left: 6px; background: #DC2626;">🚨 জরুরি অ্যালার্ট</span>';
    } else {
      badgeEl.textContent = isBn ? `নির্বাচিত উপসর্গ: ${totalCount} টি (ক্যাটাগরি: ${catCount} টি)` : `Selected Symptoms: ${totalCount} (Categories: ${catCount})`;
    }
  }

  if (summaryTextEl) {
    if (totalCount === 0) {
      summaryTextEl.innerHTML = isBn
        ? '<span style="color: var(--text-muted); font-style: italic;">কোনো উপসর্গ এখনও নির্বাচিত হয়নি। নিচের ক্যাটাগরিগুলো থেকে রোগীর মধ্যে দৃশ্যমান লক্ষণসমূহ নির্বাচন করুন।</span>'
        : '<span style="color: var(--text-muted); font-style: italic;">No symptoms selected yet. Please check observed symptoms from the categories below.</span>';
    } else {
      let groupHtml = `<div style="margin-bottom: 0.6rem; font-weight: 700; color: #064E3B; font-size: 0.95rem;">` +
        (isBn
          ? `মোট ৯টি ক্যাটাগরির মধ্যে ${catCount}টি ক্যাটাগরিতে রোগীর মোট ${totalCount}টি উপসর্গ ও ইতিহাস চিহ্নিত করা হয়েছে:`
          : `Documented ${totalCount} active symptoms across ${catCount} of 9 clinical categories:`) +
        `</div>`;

      if (hasSuicide) {
        groupHtml += `
          <div style="background: #FEF2F2; border-left: 4px solid #DC2626; color: #991B1B; padding: 0.6rem 0.85rem; border-radius: 4px; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.6rem; line-height: 1.4;">
            🚨 ${isBn ? 'সতর্কতা: আত্মহত্যার চিন্তা বা সেলফ-হার্মের উপসর্গ চিহ্নিত হয়েছে। অনতিবিলম্বে রেজিস্টার্ড মানসিক রোগ বিশেষজ্ঞের পরামর্শ গ্রহণ নিশ্চিত করুন।' : 'Urgent Alert: Suicidal ideation or self-harm tendency reported. Immediate referral to a certified mental health professional is strongly recommended.'}
          </div>
        `;
      }

      groupHtml += `<div style="display: flex; flex-direction: column; gap: 0.5rem; background: #FFFFFF; padding: 0.75rem; border-radius: 6px; border: 1px solid #A7F3D0;">`;
      catMap.forEach((val) => {
        const catTitle = isBn ? val.nameBn : val.nameEn;
        const symList = val.symptoms.map(s => isBn ? s.bn : (s.en || s.bn)).join(' • ');
        groupHtml += `
          <div style="font-size: 0.86rem; line-height: 1.5;">
            <strong style="color: #065F46; display: block;">❖ ${catTitle} (${val.symptoms.length}টি):</strong>
            <span style="color: #334155; padding-left: 1rem; display: block;">${symList}</span>
          </div>
        `;
      });
      groupHtml += `</div>`;

      summaryTextEl.innerHTML = groupHtml;
    }
  }
}

function toggleCategoryAll(catId, selectAll) {
  const checkboxes = document.querySelectorAll(`.diag-symptom-cb[data-cat-id="${catId}"]`);
  checkboxes.forEach(cb => {
    cb.checked = selectAll;
    const parentLabel = cb.closest('label');
    if (parentLabel) {
      const isSuicide = cb.getAttribute('data-is-suicide') === '1';
      parentLabel.style.backgroundColor = selectAll ? (isSuicide ? '#FEF2F2' : '#F0FDF4') : '#FAFAFA';
    }
  });
  onDiagnosisCheckboxChange();
}

async function savePatientDiagnosis(patientId) {
  try {
    const checkedBoxes = Array.from(document.querySelectorAll('.diag-symptom-cb:checked'));
    const selectedSymptomIds = checkedBoxes.map(cb => parseInt(cb.value, 10)).filter(Boolean);
    const mainComplaintsText = document.getElementById('diagMainComplaintsText')?.value?.trim() || '';
    const onsetHistoryNotes = document.getElementById('diagOnsetHistoryNotes')?.value?.trim() || '';
    const familySocialNotes = document.getElementById('diagFamilySocialNotes')?.value?.trim() || '';
    const notes = document.getElementById('patientDiagNotes')?.value?.trim() || '';
    const raqiName = document.getElementById('patientDiagRaqi')?.value?.trim() || 'মুহাম্মদুল্লাহ মিয়াহ';
    const diagDate = document.getElementById('patientDiagDate')?.value || new Date().toISOString().split('T')[0];

    const saveBtn = document.getElementById('btnSavePatientDiag');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = 'সংরক্ষণ করা হচ্ছে...';
    }

    const res = await fetch(`/api/admin/diagnosis/patient/${patientId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selected_symptom_ids: selectedSymptomIds,
        main_complaints_text: mainComplaintsText,
        onset_history_notes: onsetHistoryNotes,
        family_social_notes: familySocialNotes,
        notes: notes,
        raqi_name: raqiName,
        diagnosis_date: diagDate
      })
    });

    const data = await res.json();
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
    }

    if (data.success) {
      showToast('রোগীর ডায়াগনোসিস রেকর্ড সফলভাবে সংরক্ষিত হয়েছে।', 'success');
      onDiagnosisCheckboxChange();
      if (data.data?.suicidal_ideation_flag) {
        showToast('🚨 জরুরি সতর্কতা: আত্মহত্যার উপসর্গ চিহ্নিত থাকায় মানসিক স্বাস্থ্য রেফারেল নিশ্চিত করুন।', 'warning');
      }
    } else {
      showToast(data.error || 'ডায়াগনোসিস সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('ডায়াগনোসিস সংরক্ষণ সার্ভার ত্রুটি।', 'error');
  }
}

// ==========================================================================
// ADMIN DIAGNOSIS MANAGEMENT SECTION (9 CATEGORIES & 90 SYMPTOMS)
// ==========================================================================

async function loadDiagnosisManagement() {
  const container = document.getElementById('diagnosisCategoriesContainer');
  if (!container) return;

  container.innerHTML = '<div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">ডায়াগনোসিস ক্যাটাগরি ও উপসর্গ লোড হচ্ছে...</div>';

  try {
    const res = await fetch('/api/admin/diagnosis/management');
    const data = await res.json();
    if (!data.success) {
      container.innerHTML = '<div class="alert alert-error">ক্যাটাগরি লোড করা সম্ভব হয়নি।</div>';
      return;
    }

    const categories = data.data || [];
    
    // Update stats
    const totalCats = categories.length;
    let totalActiveSyms = 0;
    categories.forEach(c => {
      totalActiveSyms += (c.symptoms || []).filter(s => s.status === 'active').length;
    });

    const statCatsEl = document.getElementById('diagStatCatsCount');
    if (statCatsEl) statCatsEl.textContent = totalCats;
    const statSymsEl = document.getElementById('diagStatSymsCount');
    if (statSymsEl) statSymsEl.textContent = totalActiveSyms;

    if (categories.length === 0) {
      container.innerHTML = '<div class="empty-state">কোনো ডায়াগনোসিস ক্যাটাগরি পাওয়া যায়নি।</div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 1.5rem;">';

    categories.forEach((cat, idx) => {
      const activeSymsCount = (cat.symptoms || []).filter(s => s.status === 'active').length;
      const totalSymsCount = (cat.symptoms || []).length;

      html += `
        <div class="card" style="border-left: 4px solid var(--primary); padding: 1.5rem; box-shadow: var(--shadow-sm); background: #FFFFFF;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.75rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span class="badge badge-primary" style="font-size: 0.8rem;">ক্যাটাগরি #${idx + 1} [${cat.code}]</span>
                <span class="badge ${cat.status === 'active' ? 'badge-success' : 'badge-danger'}" style="font-size: 0.75rem;">
                  ${cat.status === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                </span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">ক্রম: ${cat.sort_order}</span>
              </div>
              <h3 style="color: var(--primary); margin: 0.4rem 0 0.2rem 0; font-size: 1.25rem;">
                ${cat.name_bn}
              </h3>
              <div style="font-size: 0.9rem; color: var(--text-muted); font-weight: 500;">
                ${cat.name_en}
              </div>
              <p style="font-size: 0.85rem; color: var(--text-main); margin: 0.5rem 0 0 0; line-height: 1.5;">
                ${cat.description_bn || cat.description_en || 'কোনো বিবরণ নেই'}
              </p>
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-primary btn-sm" onclick="openAddSymptomModal(${cat.id})" style="font-size: 0.82rem;">
                + নতুন উপসর্গ যোগ করুন
              </button>
              <button class="btn btn-outline-primary btn-sm" onclick="openEditCategoryModal(${cat.id})" style="font-size: 0.82rem;">
                ✏️ ক্যাটাগরি সম্পাদনা
              </button>
            </div>
          </div>

          <div style="margin-top: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <h5 style="margin: 0; color: var(--primary); font-size: 0.95rem;">
                এই ক্যাটাগরির উপসর্গসমূহ (${activeSymsCount}/${totalSymsCount}টি সক্রিয়):
              </h5>
            </div>

            <div style="overflow-x: auto;">
              <table class="data-table" style="font-size: 0.85rem; width: 100%;">
                <thead>
                  <tr style="background: #F8FAF9;">
                    <th style="width: 45px; text-align: center;">#</th>
                    <th style="min-width: 240px;">উপসর্গ (বাংলা)</th>
                    <th style="min-width: 240px;">Symptom (English)</th>
                    <th style="width: 70px; text-align: center;">ক্রম</th>
                    <th style="width: 95px; text-align: center;">স্ট্যাটাস</th>
                    <th style="width: 125px; text-align: right;">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody>
                  ${(cat.symptoms || []).map((s, sIdx) => `
                    <tr>
                      <td style="text-align: center; font-weight: 600; color: var(--text-muted);">${sIdx + 1}</td>
                      <td style="font-weight: 500; color: var(--text-main);">${s.symptom_bn}</td>
                      <td style="color: var(--text-muted);">${s.symptom_en || '-'}</td>
                      <td style="text-align: center; font-weight: 600;">${s.sort_order}</td>
                      <td style="text-align: center;">
                        <button class="btn btn-xs ${s.status === 'active' ? 'btn-outline-success' : 'btn-outline-secondary'}" onclick="toggleSymptomStatus(${s.id})" title="ক্লিক করে সক্রিয়/নিষ্ক্রিয় করুন" style="font-size: 0.72rem; padding: 2px 7px;">
                          ${s.status === 'active' ? '✓ সক্রিয়' : '✕ নিষ্ক্রিয়'}
                        </button>
                      </td>
                      <td style="text-align: right;">
                        <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end;">
                          <button class="btn btn-secondary btn-xs" onclick="openEditSymptomModal(${s.id})" title="সম্পাদনা">
                            ✏️ সম্পাদনা
                          </button>
                          <button class="btn btn-xs" onclick="deleteSymptom(${s.id}, '${escapeJs(s.symptom_bn)}')" title="মুছে ফেলুন" style="background: #FEE2E2; color: #DC2626; border: 1px solid #FCA5A5;">
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;

  } catch (err) {
    container.innerHTML = '<div class="alert alert-error">ডায়াগনোসিস তথ্য লোড করার সময় সার্ভার সংযোগে সমস্যা হয়েছে।</div>';
  }
}

async function openEditCategoryModal(catId) {
  try {
    const res = await fetch('/api/admin/diagnosis/management');
    const data = await res.json();
    if (!data.success) return;
    const cat = data.data.find(c => c.id === catId);
    if (!cat) return;

    document.getElementById('editCatId').value = cat.id;
    document.getElementById('editCatNameBn').value = cat.name_bn || '';
    document.getElementById('editCatNameEn').value = cat.name_en || '';
    document.getElementById('editCatDescBn').value = cat.description_bn || '';
    document.getElementById('editCatDescEn').value = cat.description_en || '';
    document.getElementById('editCatSort').value = cat.sort_order || 1;
    document.getElementById('editCatStatus').value = cat.status || 'active';

    openModal('editCategoryModal');
  } catch (err) {
    showToast('ক্যাটাগরি তথ্য লোড করা যায়নি।', 'error');
  }
}

async function saveCategoryEdit(e) {
  e.preventDefault();
  const catId = document.getElementById('editCatId').value;
  const payload = {
    name_bn: document.getElementById('editCatNameBn').value.trim(),
    name_en: document.getElementById('editCatNameEn').value.trim(),
    description_bn: document.getElementById('editCatDescBn').value.trim(),
    description_en: document.getElementById('editCatDescEn').value.trim(),
    sort_order: parseInt(document.getElementById('editCatSort').value, 10) || 1,
    status: document.getElementById('editCatStatus').value
  };

  try {
    const res = await fetch(`/api/admin/diagnosis/categories/${catId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('ক্যাটাগরি সফলভাবে আপডেট করা হয়েছে।', 'success');
      closeModal('editCategoryModal');
      loadDiagnosisManagement();
    } else {
      showToast(data.error || 'আপডেট ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('সার্ভার সংযোগে ত্রুটি।', 'error');
  }
}

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

async function openAddSymptomModal(preSelectedCatId = null) {
  try {
    const res = await fetch('/api/admin/diagnosis/management');
    const data = await res.json();
    if (!data.success) {
      showToast('ক্যাটাগরি তালিকা লোড করা যায়নি।', 'error');
      return;
    }

    const categories = data.data || [];
    const catSelect = document.getElementById('addSymCategory');
    if (catSelect) {
      catSelect.innerHTML = categories.map(c => `
        <option value="${c.id}" ${preSelectedCatId && c.id === preSelectedCatId ? 'selected' : ''}>
          ${c.name_bn} (${c.name_en})
        </option>
      `).join('');
    }

    // Auto calculate next sort order
    let nextOrder = 10;
    if (preSelectedCatId) {
      const selectedCat = categories.find(c => c.id === preSelectedCatId);
      if (selectedCat && selectedCat.symptoms) {
        nextOrder = selectedCat.symptoms.length + 1;
      }
    } else if (categories.length > 0 && categories[0].symptoms) {
      nextOrder = categories[0].symptoms.length + 1;
    }
    const sortEl = document.getElementById('addSymSort');
    if (sortEl) sortEl.value = nextOrder;

    document.getElementById('addSymBn').value = '';
    document.getElementById('addSymEn').value = '';
    document.getElementById('addSymStatus').value = 'active';

    openModal('addSymptomModal');
  } catch (err) {
    showToast('ক্যাটাগরি তথ্য লোড করা যায়নি।', 'error');
  }
}

async function saveNewSymptom(e) {
  e.preventDefault();
  const catId = parseInt(document.getElementById('addSymCategory').value, 10);
  const symBn = document.getElementById('addSymBn').value.trim();
  const symEn = document.getElementById('addSymEn').value.trim();
  const sortOrder = parseInt(document.getElementById('addSymSort').value, 10) || 1;
  const status = document.getElementById('addSymStatus').value;

  if (!catId || !symBn) {
    showToast('ক্যাটাগরি ও উপসর্গের বাংলা নাম পূরণ করা বাধ্যতামূলক।', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/diagnosis/symptoms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: catId,
        symptom_bn: symBn,
        symptom_en: symEn,
        sort_order: sortOrder,
        status: status
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('নতুন উপসর্গ সফলভাবে যোগ করা হয়েছে!', 'success');
      closeModal('addSymptomModal');
      document.getElementById('addSymptomForm')?.reset();
      loadDiagnosisManagement();
    } else {
      showToast(data.error || 'উপসর্গ যোগ ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('সার্ভার সংযোগে ত্রুটি।', 'error');
  }
}

async function openEditSymptomModal(symId) {
  try {
    const res = await fetch('/api/admin/diagnosis/management');
    const data = await res.json();
    if (!data.success) return;

    let foundSym = null;
    let foundCatId = null;
    for (const cat of (data.data || [])) {
      const s = (cat.symptoms || []).find(sym => sym.id === symId);
      if (s) {
        foundSym = s;
        foundCatId = cat.id;
        break;
      }
    }
    if (!foundSym) return;

    // Populate category dropdown
    const catSelect = document.getElementById('editSymCategory');
    if (catSelect) {
      catSelect.innerHTML = (data.data || []).map(c => `
        <option value="${c.id}" ${c.id === (foundSym.category_id || foundCatId) ? 'selected' : ''}>
          ${c.name_bn} (${c.name_en})
        </option>
      `).join('');
    }

    document.getElementById('editSymId').value = foundSym.id;
    document.getElementById('editSymBn').value = foundSym.symptom_bn || '';
    document.getElementById('editSymEn').value = foundSym.symptom_en || '';
    document.getElementById('editSymSort').value = foundSym.sort_order || 1;
    document.getElementById('editSymStatus').value = foundSym.status || 'active';

    openModal('editSymptomModal');
  } catch (err) {
    showToast('উপসর্গ তথ্য লোড করা সম্ভব হয়নি।', 'error');
  }
}

async function saveSymptomEdit(e) {
  e.preventDefault();
  const symId = document.getElementById('editSymId').value;
  const catId = parseInt(document.getElementById('editSymCategory')?.value, 10);
  const payload = {
    category_id: catId,
    symptom_bn: document.getElementById('editSymBn').value.trim(),
    symptom_en: document.getElementById('editSymEn').value.trim(),
    sort_order: parseInt(document.getElementById('editSymSort').value, 10) || 1,
    status: document.getElementById('editSymStatus').value
  };

  try {
    const res = await fetch(`/api/admin/diagnosis/symptoms/${symId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('উপসর্গ সফলভাবে আপডেট করা হয়েছে।', 'success');
      closeModal('editSymptomModal');
      loadDiagnosisManagement();
    } else {
      showToast(data.error || 'আপডেট ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('সার্ভার সংযোগে ত্রুটি।', 'error');
  }
}

async function deleteSymptom(symId, symName) {
  if (!confirm(`আপনি কি নিশ্চিত যে "${symName}" উপসর্গটি মুছে ফেলতে চান?\n(Are you sure you want to delete this symptom?)`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/diagnosis/symptoms/${symId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast('উপসর্গটি সফলভাবে মুছে ফেলা হয়েছে।', 'success');
      loadDiagnosisManagement();
    } else {
      showToast(data.error || 'উপসর্গ মুছে ফেলা ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('সার্ভার সংযোগে ত্রুটি।', 'error');
  }
}

async function toggleSymptomStatus(symId) {
  try {
    const res = await fetch(`/api/admin/diagnosis/symptoms/${symId}/toggle`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'স্ট্যাটাস পরিবর্তিত হয়েছে।', 'success');
      loadDiagnosisManagement();
    } else {
      showToast(data.error || 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('সার্ভার সংযোগে ত্রুটি।', 'error');
  }
}

// ==========================================================================
// 12. CLINIC LOGO & BRANDING MANAGEMENT
// ==========================================================================
async function uploadClinicLogo() {
  const fileInput = document.getElementById('settingsLogoInput');
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast('অনুগ্রহ করে একটি লোগো ছবি নির্বাচন করুন (Please select an image file).', 'error');
    return;
  }
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('logo', file);

  try {
    const res = await fetch('/api/admin/settings/logo', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('ক্লিনিক লোগো সফলভাবে আপডেট হয়েছে! (Logo updated successfully)', 'success');
      const updatedUrl = `${data.logo_url}?t=${Date.now()}`;
      if (document.getElementById('settingsLogoPreview')) {
        document.getElementById('settingsLogoPreview').src = updatedUrl;
      }
      document.querySelectorAll('img[src*="logo"]').forEach(img => {
        img.src = updatedUrl;
      });
      fileInput.value = '';
    } else {
      showToast(data.error || 'লোগো আপডেট ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

// ==========================================================================
// 13. CASE STUDIES & ARTICLES MANAGEMENT
// ==========================================================================
let cachedArticlesList = [];

async function loadArticlesList() {
  const tbody = document.getElementById('articlesTableBody');
  if (!tbody) return;

  const statusFilter = document.getElementById('articleStatusFilter')?.value || 'all';
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">লোড হচ্ছে...</td></tr>`;

  try {
    const res = await fetch(`/api/admin/articles?status=${statusFilter}`);
    const data = await res.json();
    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">আর্টিকেল লোড ব্যর্থ হয়েছে।</td></tr>`;
      return;
    }

    cachedArticlesList = data.data || [];

    // Update counters
    const totalCount = cachedArticlesList.length;
    const publishedCount = cachedArticlesList.filter(a => a.status === 'published').length;
    if (document.getElementById('statArticlesTotal')) {
      document.getElementById('statArticlesTotal').textContent = totalCount;
    }
    if (document.getElementById('statArticlesPublished')) {
      document.getElementById('statArticlesPublished').textContent = publishedCount;
    }

    renderArticlesTable(cachedArticlesList);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">সার্ভার সংযোগে সমস্যা।</td></tr>`;
  }
}

function renderArticlesTable(articles) {
  const tbody = document.getElementById('articlesTableBody');
  if (!tbody) return;

  if (articles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">কোনো কেস হিস্ট্রি বা আর্টিকেল পাওয়া যায়নি।</td></tr>`;
    return;
  }

  let html = '';
  articles.forEach((a, idx) => {
    const isPublished = a.status === 'published';
    const statusBadge = isPublished
      ? `<span class="badge" style="background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0;">✓ প্রকাশিত</span>`
      : `<span class="badge" style="background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D;">⏳ ড্রাফট</span>`;

    html += `
      <tr>
        <td style="font-weight: 600; color: var(--text-muted);">${idx + 1}</td>
        <td>
          <img src="${a.featured_image || '/images/articles/default-case.jpg'}" alt="Thumb" style="width: 50px; height: 35px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-light);" onerror="this.src='/images/logo.png'">
        </td>
        <td>
          <strong style="color: var(--primary); display: block; font-size: 0.95rem;">${a.title_bn}</strong>
          <small style="color: var(--text-muted); display: block; margin-top: 2px;">${a.title_en || ''}</small>
        </td>
        <td>
          <span style="font-size: 0.85rem; color: var(--text-main); font-weight: 500;">${a.category_bn || a.category_en}</span>
        </td>
        <td>${statusBadge}</td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${a.published_at ? a.published_at.slice(0, 10) : '-'}</td>
        <td style="text-align: right;">
          <div style="display: flex; justify-content: flex-end; gap: 0.35rem; flex-wrap: wrap;">
            <a href="/articles/${a.slug_bn}" target="_blank" class="btn btn-outline-primary btn-xs" title="পাবলিক পেজ দেখুন">
              👁️ দেখুন
            </a>
            <button type="button" class="btn btn-secondary btn-xs" onclick="openArticleModal(${a.id})" title="সম্পাদনা">
              ✏️ এডিট
            </button>
            <button type="button" class="btn ${isPublished ? 'btn-outline-secondary' : 'btn-primary'} btn-xs" onclick="toggleArticleStatus(${a.id}, '${a.status}')" title="স্ট্যাটাস পরিবর্তন">
              ${isPublished ? 'ড্রাফট করুন' : 'প্রকাশ করুন'}
            </button>
            <button type="button" class="btn btn-danger btn-xs" onclick="deleteArticle(${a.id})" title="মুছুন">
              🗑
            </button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function filterArticlesList() {
  const q = document.getElementById('articleSearchInput')?.value?.toLowerCase()?.trim() || '';
  if (!q) {
    renderArticlesTable(cachedArticlesList);
    return;
  }
  const filtered = cachedArticlesList.filter(a => {
    return (a.title_bn && a.title_bn.toLowerCase().includes(q)) ||
           (a.title_en && a.title_en.toLowerCase().includes(q)) ||
           (a.excerpt_bn && a.excerpt_bn.toLowerCase().includes(q)) ||
           (a.excerpt_en && a.excerpt_en.toLowerCase().includes(q));
  });
  renderArticlesTable(filtered);
}

async function openArticleModal(articleId = null) {
  document.getElementById('articleForm').reset();
  document.getElementById('articleId').value = '';

  if (articleId) {
    document.getElementById('articleModalTitle').textContent = 'কেস হিস্ট্রি / আর্টিকেল সম্পাদনা';
    try {
      const res = await fetch(`/api/admin/articles/${articleId}`);
      const data = await res.json();
      if (!data.success) {
        showToast('আর্টিকেল লোড ব্যর্থ হয়েছে।', 'error');
        return;
      }
      const a = data.data;
      document.getElementById('articleId').value = a.id;
      document.getElementById('articleTitleBn').value = a.title_bn || '';
      document.getElementById('articleTitleEn').value = a.title_en || '';
      document.getElementById('articleSlugBn').value = a.slug_bn || '';
      document.getElementById('articleSlugEn').value = a.slug_en || '';
      document.getElementById('articleCategoryBn').value = a.category_bn || '';
      document.getElementById('articleCategoryEn').value = a.category_en || '';
      document.getElementById('articleStatus').value = a.status || 'published';
      document.getElementById('articleAuthor').value = a.author_name || '';
      document.getElementById('articleFeaturedImage').value = a.featured_image || '/images/articles/default-case.jpg';
      document.getElementById('articleExcerptBn').value = a.excerpt_bn || '';
      document.getElementById('articleExcerptEn').value = a.excerpt_en || '';
      document.getElementById('articleContentBn').value = a.content_bn || '';
      document.getElementById('articleContentEn').value = a.content_en || '';
    } catch (err) {
      showToast('ত্রুটি: ' + err.message, 'error');
      return;
    }
  } else {
    document.getElementById('articleModalTitle').textContent = 'নতুন কেস হিস্ট্রি / আর্টিকেল তৈরি করুন';
    document.getElementById('articleStatus').value = 'published';
    document.getElementById('articleCategoryBn').value = 'সিহর ও রুকইয়াহ চিকিৎসা';
    document.getElementById('articleCategoryEn').value = 'Sihr & Ruqyah Treatment';
    document.getElementById('articleAuthor').value = 'মুহাম্মদুল্লাহ মিয়াহ (Muhammadullah Miah)';
    document.getElementById('articleFeaturedImage').value = '/images/articles/default-case.jpg';
  }

  openModal('articleModal');
}

async function saveArticle(e) {
  e.preventDefault();

  const articleId = document.getElementById('articleId').value;
  const titleBn = document.getElementById('articleTitleBn').value.trim();
  const titleEn = document.getElementById('articleTitleEn').value.trim();
  const contentBn = document.getElementById('articleContentBn').value.trim();
  const contentEn = document.getElementById('articleContentEn').value.trim();

  // Client-side Privacy Check: Phone numbers
  const combined = `${titleBn} ${titleEn} ${contentBn} ${contentEn}`;
  const phoneCheck = /(?:\+88|88)?01[3-9]\d{8}/;
  if (phoneCheck.test(combined)) {
    showToast('গোপনীয়তা লঙ্ঘন: কেস বিবরণীতে মোবাইল নম্বর অন্তর্ভুক্ত করা যাবে না। অনুগ্রহ করে রোগীর পরিচয় গোপন রাখুন।', 'error');
    return;
  }

  const payload = {
    title_bn: titleBn,
    title_en: titleEn,
    slug_bn: document.getElementById('articleSlugBn').value.trim(),
    slug_en: document.getElementById('articleSlugEn').value.trim(),
    category_bn: document.getElementById('articleCategoryBn').value.trim(),
    category_en: document.getElementById('articleCategoryEn').value.trim(),
    status: document.getElementById('articleStatus').value,
    author_name: document.getElementById('articleAuthor').value.trim(),
    featured_image: document.getElementById('articleFeaturedImage').value.trim() || '/images/articles/default-case.jpg',
    excerpt_bn: document.getElementById('articleExcerptBn').value.trim(),
    excerpt_en: document.getElementById('articleExcerptEn').value.trim(),
    content_bn: contentBn,
    content_en: contentEn
  };

  const isEdit = Boolean(articleId);
  const url = isEdit ? `/api/admin/articles/${articleId}` : '/api/admin/articles';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(isEdit ? 'আর্টিকেল সফলভাবে আপডেট হয়েছে।' : 'আর্টিকেল সফলভাবে প্রকাশিত হয়েছে।', 'success');
      closeModal('articleModal');
      loadArticlesList();
    } else {
      showToast(data.error || 'সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

async function toggleArticleStatus(articleId, currentStatus) {
  const newStatus = currentStatus === 'published' ? 'draft' : 'published';
  try {
    const res = await fetch(`/api/admin/articles/${articleId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`আর্টিকেল এখন ${newStatus === 'published' ? 'প্রকাশিত' : 'ড্রাফট'} অবস্থায় রয়েছে।`, 'success');
      loadArticlesList();
    } else {
      showToast(data.error || 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('সার্ভার সমস্যা।', 'error');
  }
}

async function deleteArticle(articleId) {
  if (!confirm('আপনি কি নিশ্চিত যে এই কেস হিস্ট্রি / আর্টিকেলটি মুছে ফেলতে চান?')) return;

  try {
    const res = await fetch(`/api/admin/articles/${articleId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('আর্টিকেল সফলভাবে মুছে ফেলা হয়েছে।', 'success');
      loadArticlesList();
    } else {
      showToast(data.error || 'মুছে ফেলা ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('সার্ভার সমস্যা।', 'error');
  }
}

async function uploadArticleImage(event) {
  const input = event.target;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch('/api/admin/articles/upload-image', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('ছবি আপলোড সফল হয়েছে!', 'success');
      document.getElementById('articleFeaturedImage').value = data.url;
    } else {
      showToast(data.error || 'ছবি আপলোড ব্যর্থ হয়েছে।', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

// ==========================================================================
// 13. ENTERPRISE MODULES MANAGEMENT
// ==========================================================================

function switchCommerceSubtab(sub) {
  const ordersBtn = document.getElementById('commSubtabOrdersBtn');
  const prodsBtn = document.getElementById('commSubtabProductsBtn');
  const ordersPane = document.getElementById('commOrdersPane');
  const prodsPane = document.getElementById('commProductsPane');

  if (sub === 'orders') {
    ordersBtn.classList.add('active');
    prodsBtn.classList.remove('active');
    ordersPane.style.display = 'block';
    prodsPane.style.display = 'none';
  } else {
    prodsBtn.classList.add('active');
    ordersBtn.classList.remove('active');
    prodsPane.style.display = 'block';
    ordersPane.style.display = 'none';
  }
}

let currentActiveOrderId = null;

async function loadCommerceData() {
  // Load Orders
  try {
    const oRes = await fetch('/api/admin/commerce/orders');
    const oData = await oRes.json();
    const oTbody = document.getElementById('adminOrdersTbody');
    if (oData.success && oData.orders) {
      if (oData.orders.length === 0) {
        oTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem;">কোনো অর্ডার পাওয়া যায়নি।</td></tr>';
      } else {
        oTbody.innerHTML = oData.orders.map(o => {
          const itemsSummary = (o.items && o.items.length > 0)
            ? o.items.map(it => `<span style="display:inline-block; background:#F1F5F9; color:#0F172A; border:1px solid #CBD5E1; padding:2px 6px; border-radius:4px; font-size:0.78rem; margin:1px 2px;">${it.product_name} <strong>× ${it.quantity}</strong></span>`).join(' ')
            : '<span style="color:var(--text-muted); font-size:0.8rem;">কোনো পণ্য রেকর্ড নেই</span>';

          const dateStr = o.created_at ? o.created_at.split(' ')[0].split('T')[0] : '';
          return `
            <tr>
              <td><strong style="color:var(--primary);">${o.order_number}</strong></td>
              <td><small>${dateStr}</small></td>
              <td><strong>${o.customer_name}</strong><br><small style="color:var(--text-muted);"><a href="tel:${o.customer_phone}">${o.customer_phone}</a></small></td>
              <td><small style="max-width:200px; display:inline-block; word-break:break-word;">${o.shipping_address}</small></td>
              <td>${itemsSummary}</td>
              <td><strong>৳${o.total_amount}</strong></td>
              <td>
                <select onchange="updateOrderStatus(${o.id}, this.value)" class="form-control" style="padding: 2px 6px; font-size: 0.8rem;">
                  <option value="Order Received" ${o.status === 'Order Received' ? 'selected' : ''}>Order Received</option>
                  <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
                  <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                  <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                  <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </td>
              <td>
                <button class="btn btn-xs btn-outline-primary" onclick="viewOrderDetails(${o.id})" title="সম্পূর্ণ অর্ডার ও পণ্য বিবরণ দেখুন">📦 বিবরণ</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load orders:', e);
  }

  // Load Products
  try {
    const pRes = await fetch('/api/admin/commerce/products');
    const pData = await pRes.json();
    const pTbody = document.getElementById('adminProductsTbody');
    if (pData.success && pData.products) {
      if (pData.products.length === 0) {
        pTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem;">কোনো পণ্য পাওয়া যায়নি।</td></tr>';
      } else {
        pTbody.innerHTML = pData.products.map(p => `
          <tr>
            <td>
              <img src="${p.image_url || '/images/products/honey.jpg'}" alt="${p.name_bn}" style="width:45px; height:45px; object-fit:cover; border-radius:6px; border:1px solid #CBD5E1; background:#F8FAFC;">
            </td>
            <td><strong>${p.name_bn}</strong><br><small style="color:var(--text-muted);">${p.name_en || ''}</small></td>
            <td><span class="badge badge-secondary">${p.category_name || 'সাধারণ'}</span></td>
            <td><strong>৳${p.price}</strong></td>
            <td>${p.discount_price ? '৳' + p.discount_price : '—'}</td>
            <td><span style="font-weight:600; color:${p.stock_quantity > 10 ? '#059669' : '#DC2626'}">${p.stock_quantity} টি</span></td>
            <td><span class="badge ${p.is_active ? 'badge-success' : 'badge-danger'}">${p.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}</span></td>
            <td style="white-space:nowrap;">
              <button class="btn btn-xs btn-primary" onclick="openEditProductModal(${p.id})">✏️ সম্পাদনা</button>
              <button class="btn btn-xs ${p.is_active ? 'btn-danger' : 'btn-success'}" onclick="toggleProductStatus(${p.id})">${p.is_active ? 'হাইড' : 'পাবলিশ'}</button>
              <button class="btn btn-xs btn-secondary" onclick="deleteProduct(${p.id})">🗑️</button>
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load products:', e);
  }
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/admin/commerce/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast('অর্ডার স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে!', 'success');
      loadCommerceData();
    } else {
      showToast(data.error || 'স্ট্যাটাস আপডেট করা যায়নি', 'error');
    }
  } catch (e) {
    showToast('ত্রুটি: ' + e.message, 'error');
  }
}

async function viewOrderDetails(orderId) {
  try {
    const res = await fetch(`/api/admin/commerce/orders/${orderId}`);
    const data = await res.json();
    if (!data.success || !data.order) {
      showToast(data.error || 'অর্ডার লোড করা যায়নি', 'error');
      return;
    }

    const order = data.order;
    const items = data.items || [];
    currentActiveOrderId = order.id;

    document.getElementById('ordDetNumber').textContent = order.order_number;
    document.getElementById('ordDetDate').textContent = order.created_at || '';
    
    // Status Badge
    const badgeColors = {
      'Order Received': '#0284C7',
      'Processing': '#D97706',
      'Shipped': '#7C3AED',
      'Delivered': '#059669',
      'Cancelled': '#DC2626'
    };
    const sBadge = document.getElementById('ordDetStatusBadge');
    sBadge.textContent = order.status;
    sBadge.style.background = badgeColors[order.status] || '#64748B';
    sBadge.style.color = '#FFFFFF';
    sBadge.style.padding = '2px 8px';
    sBadge.style.borderRadius = '4px';
    sBadge.style.fontSize = '0.8rem';
    sBadge.style.fontWeight = '600';

    // Customer details
    document.getElementById('ordDetCustomerName').textContent = order.customer_name;
    const phoneEl = document.getElementById('ordDetCustomerPhone');
    phoneEl.textContent = order.customer_phone;
    phoneEl.href = `tel:${order.customer_phone}`;
    document.getElementById('ordDetCustomerAddress').textContent = order.shipping_address;

    // Customer notes
    const notesWrap = document.getElementById('ordDetNotesWrap');
    if (order.customer_notes && order.customer_notes.trim()) {
      document.getElementById('ordDetCustomerNotes').textContent = order.customer_notes;
      notesWrap.style.display = 'block';
    } else {
      notesWrap.style.display = 'none';
    }

    // Status select and admin notes
    document.getElementById('ordDetStatusSelect').value = order.status;
    document.getElementById('ordDetAdminNotes').value = order.internal_admin_notes || '';

    // Items table
    const itemsTbody = document.getElementById('ordDetItemsTbody');
    if (items.length === 0) {
      itemsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:#64748B;">কোনো পণ্য আইটেম পাওয়া যায়নি।</td></tr>';
    } else {
      itemsTbody.innerHTML = items.map(it => `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 8px 12px; vertical-align: middle;">
            <img src="${it.image_url || '/images/products/honey.jpg'}" alt="${it.product_name}" style="width: 42px; height: 42px; object-fit: cover; border-radius: 6px; border: 1px solid #CBD5E1;">
          </td>
          <td style="padding: 8px 12px; vertical-align: middle;">
            <strong style="color: #1E293B;">${it.product_name}</strong>
            ${it.name_en ? `<div style="font-size: 0.78rem; color: #64748B;">${it.name_en}</div>` : ''}
          </td>
          <td style="padding: 8px 12px; vertical-align: middle; text-align: right;">৳${it.unit_price}</td>
          <td style="padding: 8px 12px; vertical-align: middle; text-align: center;"><strong>× ${it.quantity}</strong></td>
          <td style="padding: 8px 12px; vertical-align: middle; text-align: right;"><strong style="color: #0F172A;">৳${it.total_price}</strong></td>
        </tr>
      `).join('');
    }

    // Financial totals
    document.getElementById('ordDetSubtotal').textContent = order.subtotal_amount || 0;
    document.getElementById('ordDetShipping').textContent = order.shipping_charge || 0;
    document.getElementById('ordDetTotal').textContent = order.total_amount || 0;

    openModal('orderDetailsModal');
  } catch (err) {
    showToast('অর্ডার বিবরণ লোড করা যায়নি: ' + err.message, 'error');
  }
}

async function saveOrderDetailsStatus() {
  if (!currentActiveOrderId) return;
  const newStatus = document.getElementById('ordDetStatusSelect').value;
  try {
    const res = await fetch(`/api/admin/commerce/orders/${currentActiveOrderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast('অর্ডার স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে!', 'success');
      viewOrderDetails(currentActiveOrderId);
      loadCommerceData();
    } else {
      showToast(data.error || 'স্ট্যাটাস আপডেট করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

async function saveOrderDetailsNotes() {
  if (!currentActiveOrderId) return;
  const notes = document.getElementById('ordDetAdminNotes').value.trim();
  try {
    const res = await fetch(`/api/admin/commerce/orders/${currentActiveOrderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internal_admin_notes: notes })
    });
    const data = await res.json();
    if (data.success) {
      showToast('অ্যাডমিন নোট সংরক্ষণ করা হয়েছে!', 'success');
    } else {
      showToast(data.error || 'নোট সংরক্ষণ করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

function printOrderPackingSlip() {
  const ordNumber = document.getElementById('ordDetNumber').textContent;
  const ordDate = document.getElementById('ordDetDate').textContent;
  const custName = document.getElementById('ordDetCustomerName').textContent;
  const custPhone = document.getElementById('ordDetCustomerPhone').textContent;
  const custAddress = document.getElementById('ordDetCustomerAddress').textContent;
  const subtotal = document.getElementById('ordDetSubtotal').textContent;
  const shipping = document.getElementById('ordDetShipping').textContent;
  const total = document.getElementById('ordDetTotal').textContent;
  const itemsHtml = document.getElementById('ordDetItemsTbody').innerHTML;

  const printWindow = window.open('', '_blank', 'width=800,height=900');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="bn">
    <head>
      <meta charset="UTF-8">
      <title>Order Invoice - ${ordNumber}</title>
      <style>
        body { font-family: 'SolaimanLipi', Arial, sans-serif; padding: 2rem; color: #1E293B; line-height: 1.5; }
        .header { text-align: center; border-bottom: 2px solid #065F46; padding-bottom: 1rem; margin-bottom: 1.5rem; }
        .title { color: #065F46; font-size: 1.5rem; font-weight: bold; margin: 0; }
        .sub { color: #64748B; font-size: 0.9rem; }
        .meta-grid { display: flex; justify-content: space-between; margin-bottom: 1.5rem; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
        th, td { border: 1px solid #CBD5E1; padding: 8px 12px; }
        th { background: #F1F5F9; font-weight: bold; }
        .totals { float: right; width: 260px; margin-bottom: 2rem; }
        .footer { clear: both; text-align: center; border-top: 1px solid #CBD5E1; padding-top: 1rem; font-size: 0.85rem; color: #64748B; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">রুকইয়াহ সাপোর্ট অ্যান্ড হিজামা সেন্টার (ফেনী শাখা)</div>
        <div class="sub">সুন্নাহ সাপ্লিমেন্টস অর্ডার ডেলিভারি চালান / ইনভয়েস</div>
      </div>
      <div class="meta-grid">
        <div>
          <strong>গ্রাহকের তথ্য:</strong><br>
          নাম: ${custName}<br>
          মোবাইল: ${custPhone}<br>
          ঠিকানা: ${custAddress}
        </div>
        <div style="text-align: right;">
          <strong>অর্ডার নং:</strong> ${ordNumber}<br>
          তারিখ: ${ordDate}<br>
          পেমেন্ট: ক্যাশ অন ডেলিভারি (COD)
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>ছবি</th>
            <th>পণ্য</th>
            <th style="text-align: right;">একক মূল্য</th>
            <th style="text-align: center;">পরিমাণ</th>
            <th style="text-align: right;">মোট</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <div class="totals">
        <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>সাবটোটাল:</span> <strong>৳${subtotal}</strong></div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #CBD5E1;"><span>ডেলিভারি চার্জ:</span> <strong>৳${shipping}</strong></div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 1.1rem; color: #065F46;"><span>সর্বমোট প্রদেয়:</span> <strong>৳${total}</strong></div>
      </div>
      <div class="footer">
        রাসূলুল্লাহ ﷺ বলেছেন: "তোমরা অবশ্যই সুন্নাহ চিকিৎসায় নিজেকে আরোগ্য দান করো।"<br>
        যোগাযোগ: ০১৮১১-২২৩৩৪৪ | ওয়েবসাইট: https://ruqyahhelpfeni.com
      </div>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

async function toggleProductStatus(id) {
  try {
    const res = await fetch(`/api/admin/commerce/products/${id}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('পণ্যের স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে!', 'success');
      loadCommerceData();
    }
  } catch (e) {
    showToast('ত্রুটি: ' + e.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('আপনি কি নিশ্চিতভাবে এই পণ্যটি মুছে ফেলতে চান?')) return;
  try {
    const res = await fetch(`/api/admin/commerce/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('পণ্য সফলভাবে মুছে ফেলা হয়েছে!', 'success');
      loadCommerceData();
    } else {
      showToast(data.error || 'পণ্য মোছা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

async function loadHijamaMgrData() {
  try {
    const res = await fetch('/api/admin/commerce/hijama-packages');
    const data = await res.json();
    const tbody = document.getElementById('adminHijamaPackagesTbody');
    if (data.success && data.packages) {
      tbody.innerHTML = data.packages.map(pkg => `
        <tr>
          <td><strong>${pkg.title_bn}</strong><br><small style="color:var(--text-muted);">${pkg.title_en || ''}</small></td>
          <td><span class="badge badge-primary">${pkg.point_count} টি পয়েন্ট</span></td>
          <td><strong style="color:var(--primary);">৳${pkg.price}</strong></td>
          <td><small>${pkg.included_services || '—'}</small></td>
          <td><span class="badge ${pkg.is_active ? 'badge-success' : 'badge-danger'}">${pkg.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}</span></td>
          <td>
            <button class="btn btn-xs btn-secondary" onclick="promptEditPackagePrice(${pkg.id}, ${pkg.price})">ফি পরিবর্তন</button>
            <button class="btn btn-xs ${pkg.is_active ? 'btn-danger' : 'btn-success'}" onclick="toggleHijamaPackageStatus(${pkg.id})">${pkg.is_active ? 'হাইড করুন' : 'পাবলিশ করুন'}</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error(e);
  }
}

async function toggleHijamaPackageStatus(id) {
  try {
    const res = await fetch(`/api/admin/commerce/hijama-packages/${id}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('হিজামা প্যাকেজ স্ট্যাটাস আপডেট সফল হয়েছে!', 'success');
      loadHijamaMgrData();
    }
  } catch (e) {
    showToast('ত্রুটি: ' + e.message, 'error');
  }
}

async function promptEditPackagePrice(pkgId, currentPrice) {
  const newPrice = prompt('নতুন প্যাকেজ মূল্য নির্ধারণ করুন (BDT):', currentPrice);
  if (newPrice !== null && !isNaN(parseFloat(newPrice))) {
    try {
      const res = await fetch(`/api/admin/commerce/hijama-packages/${pkgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: parseFloat(newPrice) })
      });
      const data = await res.json();
      if (data.success) {
        showToast('হিজামা প্যাকেজ ফি আপডেট সফল হয়েছে!', 'success');
        loadHijamaMgrData();
      }
    } catch (e) {
      showToast('ত্রুটি: ' + e.message, 'error');
    }
  }
}

async function loadRuqyahMgrData() {
  try {
    const res = await fetch('/api/admin/commerce/ruqyah-audios');
    const data = await res.json();
    const tbody = document.getElementById('adminRuqyahAudiosTbody');
    if (data.success && data.items) {
      if (data.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem;">কোনো অডিও রিসোর্স পাওয়া যায়নি।</td></tr>';
      } else {
        tbody.innerHTML = data.items.map(i => {
          const audioFileName = i.audio_url ? i.audio_url.split('/').pop() : 'Audio';
          return `
            <tr>
              <td>
                <strong>${i.title_bn}</strong>
                ${i.title_ar ? `<br><small style="direction:rtl; font-size:1.05rem; color:#065F46;">${i.title_ar}</small>` : ''}
              </td>
              <td><span class="badge badge-secondary">${i.category}</span></td>
              <td>${i.duration || '২৫ মিনিট'}</td>
              <td>
                <a href="${i.audio_url}" target="_blank" style="font-size:0.82rem; color:var(--primary); font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
                  ▶ শুনুন (${audioFileName})
                </a>
              </td>
              <td><span class="badge ${i.is_active ? 'badge-success' : 'badge-danger'}">${i.is_active ? 'প্রকাশিত' : 'লুকানো'}</span></td>
              <td style="white-space:nowrap;">
                <button class="btn btn-xs btn-primary" onclick="openEditRuqyahAudioModal(${i.id})">✏️ সম্পাদনা</button>
                <button class="btn btn-xs ${i.is_active ? 'btn-danger' : 'btn-success'}" onclick="toggleRuqyahAudioStatus(${i.id})">${i.is_active ? 'হাইড' : 'পাবলিশ'}</button>
                <button class="btn btn-xs btn-secondary" onclick="deleteRuqyahAudio(${i.id})">🗑️</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load audios in admin:', e);
  }
}

async function toggleRuqyahAudioStatus(id) {
  try {
    const res = await fetch(`/api/admin/commerce/ruqyah-audios/${id}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('অডিও স্ট্যাটাস আপডেট সফল হয়েছে!', 'success');
      loadRuqyahMgrData();
    } else {
      showToast(data.error || 'স্ট্যাটাস আপডেট করা যায়নি', 'error');
    }
  } catch (e) {
    showToast('ত্রুটি: ' + e.message, 'error');
  }
}

async function deleteRuqyahAudio(id) {
  if (!confirm('আপনি কি নিশ্চিতভাবে এই রুকইয়াহ অডিওটি মুছে ফেলতে চান?')) return;
  try {
    const res = await fetch(`/api/admin/commerce/ruqyah-audios/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('অডিওটি সফলভাবে মুছে ফেলা হয়েছে!', 'success');
      loadRuqyahMgrData();
    } else {
      showToast(data.error || 'অডিও মোছা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

async function loadCoursesMgrData() {
  try {
    const res = await fetch('/api/admin/commerce/courses');
    const data = await res.json();
    const tbody = document.getElementById('adminCoursesTbody');
    if (data.success && data.courses) {
      tbody.innerHTML = data.courses.map(c => `
        <tr>
          <td><strong>${c.title_bn}</strong><br><small style="color:var(--text-muted);">${c.title_en || ''}</small></td>
          <td><strong>${c.fee === 0 ? 'ফ্রি' : '৳' + c.fee}</strong></td>
          <td>${c.duration || '৪ সপ্তাহ'}</td>
          <td><span class="badge ${c.is_active ? 'badge-success' : 'badge-danger'}">${c.is_active ? 'প্রকাশিত' : 'লুকানো'}</span></td>
          <td>
            <button class="btn btn-xs ${c.is_active ? 'btn-danger' : 'btn-success'}" onclick="toggleCourseStatus(${c.id})">${c.is_active ? 'হাইড করুন' : 'পাবলিশ করুন'}</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error(e);
  }
}

async function toggleCourseStatus(id) {
  try {
    const res = await fetch(`/api/admin/commerce/courses/${id}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('কোর্স স্ট্যাটাস আপডেট সফল হয়েছে!', 'success');
      loadCoursesMgrData();
    }
  } catch (e) {
    showToast('ত্রুটি: ' + e.message, 'error');
  }
}

let adminParticipantsList = [];
let adminAmalCategoriesList = [];

let currentAdminParticipantId = null;

async function loadLifestyleMgrData() {
  await Promise.all([
    loadAdminPinnedWinner(),
    loadAdminAmalCategories(),
    loadAdminParticipants(),
    loadAdminAmalAnalytics()
  ]);
}

// ==============================================================
// 1. ADMIN AMAL ANALYTICS & DAILY REPORTING (Requirement 4)
// ==============================================================
async function loadAdminAmalAnalytics() {
  const dateInput = document.getElementById('adminAnalyticsDateInput');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

  try {
    const res = await fetch(`/api/lifestyle/admin/analytics?date=${date}`);
    const data = await res.json();
    if (!data.success) return;

    if (document.getElementById('admMetricTotalUsers')) document.getElementById('admMetricTotalUsers').innerText = data.total_participants || 0;
    if (document.getElementById('admMetricSubmitted')) document.getElementById('admMetricSubmitted').innerText = data.submitted_count || 0;
    if (document.getElementById('admMetricMissed')) document.getElementById('admMetricMissed').innerText = data.not_submitted_count || 0;
    if (document.getElementById('admMetricRate')) document.getElementById('admMetricRate').innerText = (data.submission_rate || 0) + '%';
    
    if (document.getElementById('admMetricTopScorer')) {
      if (data.top_scorers_on_date && data.top_scorers_on_date.length > 0) {
        const top = data.top_scorers_on_date[0];
        document.getElementById('admMetricTopScorer').innerText = `${top.full_name} (${top.points} পয়েন্ট)`;
      } else {
        document.getElementById('admMetricTopScorer').innerText = 'কেউ নেই';
      }
    }

    // Most and Least performed amals
    const mostContainer = document.getElementById('admMostPerformedAmals');
    const leastContainer = document.getElementById('admLeastPerformedAmals');

    if (mostContainer) {
      if (data.most_frequent_amals_on_date && data.most_frequent_amals_on_date.length > 0) {
        mostContainer.innerHTML = data.most_frequent_amals_on_date.slice(0, 3).map(a => `
          <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
            <span>${a.title_bn}</span>
            <strong style="color:#065F46;">${a.completion_rate}% (${a.completed_count} জন)</strong>
          </div>
        `).join('');
      } else {
        mostContainer.innerText = 'এই তারিখে কোনো তথ্য নেই';
      }
    }

    if (leastContainer) {
      if (data.least_frequent_amals_on_date && data.least_frequent_amals_on_date.length > 0) {
        leastContainer.innerHTML = data.least_frequent_amals_on_date.slice(0, 3).map(a => `
          <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
            <span>${a.title_bn}</span>
            <strong style="color:#B45309;">${a.completion_rate}% (${a.completed_count} জন)</strong>
          </div>
        `).join('');
      } else {
        leastContainer.innerText = 'এই তারিখে কোনো তথ্য নেই';
      }
    }
  } catch (err) {
    console.error('Error loading admin analytics:', err);
  }
}

// ==============================================================
// 2. SEARCH & PARTICIPANT MANAGEMENT (Requirement 3 & 4)
// ==============================================================
async function loadAdminParticipants() {
  await searchAdminParticipants();
}

async function searchAdminParticipants() {
  const query = document.getElementById('filterParticipantQuery')?.value.trim() || '';
  const date = document.getElementById('filterParticipantDate')?.value || '';
  const status = document.getElementById('filterParticipantStatus')?.value || 'all';
  const level = document.getElementById('filterParticipantLevel')?.value || '';
  const rankMin = document.getElementById('filterRankMin')?.value || '';
  const rankMax = document.getElementById('filterRankMax')?.value || '';

  const params = new URLSearchParams();
  if (query) params.append('query', query);
  if (date) params.append('date', date);
  if (status && status !== 'all') params.append('submission_status', status);
  if (level) params.append('level', level);
  if (rankMin) params.append('rank_min', rankMin);
  if (rankMax) params.append('rank_max', rankMax);

  try {
    const res = await fetch(`/api/lifestyle/admin/participants/search?${params.toString()}`);
    const data = await res.json();
    const tbody = document.getElementById('adminLifestyleTbody');
    const countBadge = document.getElementById('adminParticipantCountBadge');

    if (data.success && data.participants) {
      adminParticipantsList = data.participants;
      if (countBadge) countBadge.innerText = `মোট ${data.participants.length} জন প্রতিযোগী`;

      if (!adminParticipantsList.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">কোনো প্রতিযোগী পাওয়া যায়নি।</td></tr>';
        return;
      }

      tbody.innerHTML = adminParticipantsList.map(p => `
        <tr>
          <td><strong>#${p.rank}</strong></td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <img src="${p.profile_photo || '/images/default-avatar.svg'}" alt="${p.full_name}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid #10B981;">
              <div>
                <strong style="color:#0F172A;">${p.full_name}</strong>
                <div style="font-size: 0.75rem; color: #64748B;">আইডি: ${p.user_uuid || ('#' + p.id)}</div>
              </div>
            </div>
          </td>
          <td>
            <strong style="color: #065F46;">${p.phone || '-'}</strong>
          </td>
          <td>
            <span style="font-size: 0.85rem; color: #475569;">
              ${p.upazila ? p.upazila + ', ' : ''}${p.district || 'ফেনী'}
            </span>
          </td>
          <td>${p.completed_days || 0} / 40 দিন</td>
          <td><span class="badge badge-primary">${p.current_level || 'Improvement'}</span></td>
          <td><strong style="color:var(--primary); font-size: 1.05rem;">${p.total_points}</strong></td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
              <button class="btn btn-sm btn-primary" onclick="openAdminParticipantModal(${p.id})" style="padding: 3px 8px; font-size: 0.78rem;">
                👤 বিস্তারিত প্রোফাইল
              </button>
              <button class="btn btn-sm" onclick="openPinWinnerModal(${p.id})" style="background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; padding: 3px 8px; font-size: 0.78rem; font-weight: 700; border-radius: 4px; cursor: pointer;">
                👑 পিন
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error searching participants:', err);
  }
}

function resetAdminParticipantsFilter() {
  if (document.getElementById('filterParticipantQuery')) document.getElementById('filterParticipantQuery').value = '';
  if (document.getElementById('filterParticipantDate')) document.getElementById('filterParticipantDate').value = '';
  if (document.getElementById('filterParticipantStatus')) document.getElementById('filterParticipantStatus').value = 'all';
  if (document.getElementById('filterParticipantLevel')) document.getElementById('filterParticipantLevel').value = '';
  if (document.getElementById('filterRankMin')) document.getElementById('filterRankMin').value = '';
  if (document.getElementById('filterRankMax')) document.getElementById('filterRankMax').value = '';
  searchAdminParticipants();
}

// ==============================================================
// 3. DETAILED PARTICIPANT PROFILE MODAL (Requirement 3)
// ==============================================================
async function openAdminParticipantModal(userId) {
  currentAdminParticipantId = userId;
  const editBox = document.getElementById('admPartEditBox');
  if (editBox) editBox.style.display = 'none';

  try {
    const res = await fetch(`/api/lifestyle/admin/participants/${userId}`);
    const data = await res.json();
    if (!data.success || !data.participant) {
      return alert(data.error || 'প্রতিযোগীর তথ্য পাওয়া যায়নি');
    }

    const p = data.participant;
    document.getElementById('admModalSubtitle').innerText = `আইডি: ${p.user_uuid || ('#' + p.id)}`;
    document.getElementById('admPartName').innerText = p.full_name;
    document.getElementById('admPartPhoto').src = p.profile_photo || '/images/default-avatar.svg';
    document.getElementById('admPartPhone').innerText = `📞 মোবাইল: ${p.phone} (আনমাস্কড)`;
    document.getElementById('admPartEmail').innerText = `✉️ ইমেইল: ${p.email || 'দেওয়া হয়নি'}`;
    document.getElementById('admPartLevelBadge').innerText = p.current_level;
    document.getElementById('admPartTotalPoints').innerText = p.total_points;

    // Address Details
    document.getElementById('admPartAddressText').innerText = p.address || 'পূর্ণাঙ্গ ঠিকানা দেওয়া হয়নি';
    document.getElementById('admPartVillage').innerText = p.village || '-';
    document.getElementById('admPartUnion').innerText = p.union_name || '-';
    document.getElementById('admPartUpazila').innerText = p.upazila || '-';
    document.getElementById('admPartDistrict').innerText = p.district || 'Feni';
    document.getElementById('admPartRegDate').innerText = p.created_at ? p.created_at.split('T')[0] : '-';

    // Metrics & Streaks
    document.getElementById('admPartRank').innerText = `#${p.rank}`;
    document.getElementById('admPartStreak').innerText = `${p.current_streak || 0} দিন`;
    document.getElementById('admPartLongestStreak').innerText = `${p.longest_streak || 0} দিন`;
    document.getElementById('admPartTodayStatus').innerHTML = p.submitted_today 
      ? `<span style="color:#059669;">✓ জমা সম্পন্ন (+${p.today_points})</span>` 
      : `<span style="color:#DC2626;">✕ এখনো জমা দেয়নি</span>`;

    // Frequency Analysis
    const freq = data.frequency_analysis;
    const mostAmalsDiv = document.getElementById('admPartMostAmals');
    const leastAmalsDiv = document.getElementById('admPartLeastAmals');

    if (freq && freq.most_frequent && freq.most_frequent.length > 0) {
      mostAmalsDiv.innerHTML = freq.most_frequent.slice(0, 3).map(a => `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
          <span>${a.title_bn}</span>
          <strong style="color:#065F46;">${a.completion_rate}% (${a.completed_count} দিন)</strong>
        </div>
      `).join('');
    } else {
      mostAmalsDiv.innerText = 'কোনো তথ্য নেই';
    }

    if (freq && freq.least_frequent && freq.least_frequent.length > 0) {
      leastAmalsDiv.innerHTML = freq.least_frequent.slice(0, 3).map(a => `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
          <span>${a.title_bn}</span>
          <strong style="color:#B45309;">${a.completion_rate}% (${a.completed_count} দিন)</strong>
        </div>
      `).join('');
    } else {
      leastAmalsDiv.innerText = 'কোনো তথ্য নেই';
    }

    // Set inspection date default to today
    const dateInput = document.getElementById('admPartInspectDate');
    dateInput.value = new Date().toISOString().split('T')[0];
    loadAdminParticipantDayBreakdown();

    openModal('adminParticipantModal');
  } catch (err) {
    console.error('Error opening participant modal:', err);
    alert('প্রতিযোগীর তথ্য লোড করতে ব্যর্থ হয়েছে');
  }
}

function pinThisParticipantDirectly() {
  if (!currentAdminParticipantId) return;
  closeModal('adminParticipantModal');
  openPinWinnerModal(currentAdminParticipantId);
}

function toggleAdminEditParticipantForm() {
  const box = document.getElementById('admPartEditBox');
  if (box.style.display === 'none') {
    const user = adminParticipantsList.find(p => p.id === currentAdminParticipantId);
    if (user) {
      document.getElementById('editPartUserId').value = user.id;
      document.getElementById('editPartName').value = user.full_name || '';
      document.getElementById('editPartPhone').value = user.phone || '';
      document.getElementById('editPartEmail').value = user.email || '';
      document.getElementById('editPartVillage').value = user.village || '';
      document.getElementById('editPartUnion').value = user.union_name || '';
      document.getElementById('editPartUpazila').value = user.upazila || '';
      document.getElementById('editPartDistrict').value = user.district || 'Feni';
      document.getElementById('editPartAddress').value = user.address || '';
      document.getElementById('editPartPoints').value = user.total_points || 0;
    }
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
  }
}

async function saveAdminParticipantChanges(e) {
  e.preventDefault();
  const userId = document.getElementById('editPartUserId').value;
  const payload = {
    full_name: document.getElementById('editPartName').value.trim(),
    phone: document.getElementById('editPartPhone').value.trim(),
    email: document.getElementById('editPartEmail').value.trim(),
    village: document.getElementById('editPartVillage').value.trim(),
    union_name: document.getElementById('editPartUnion').value.trim(),
    upazila: document.getElementById('editPartUpazila').value.trim(),
    district: document.getElementById('editPartDistrict').value.trim(),
    address: document.getElementById('editPartAddress').value.trim(),
    total_points: parseInt(document.getElementById('editPartPoints').value, 10) || 0
  };

  try {
    const res = await fetch(`/api/lifestyle/admin/participants/${userId}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('প্রতিযোগীর তথ্য সফলভাবে আপডেট হয়েছে!');
      document.getElementById('admPartEditBox').style.display = 'none';
      openAdminParticipantModal(userId);
      loadAdminParticipants();
    } else {
      alert('ত্রুটি: ' + (data.error || 'আপডেট করা যায়নি'));
    }
  } catch (err) {
    alert('সার্ভার যোগাযোগে ত্রুটি');
  }
}

async function loadAdminParticipantDayBreakdown() {
  if (!currentAdminParticipantId) return;
  const date = document.getElementById('admPartInspectDate').value;
  if (!date) return;

  const container = document.getElementById('admPartDayBreakdownContainer');
  container.innerHTML = 'তথ্য লোড হচ্ছে...';

  try {
    const res = await fetch(`/api/lifestyle/admin/participants/${currentAdminParticipantId}/submissions?date=${date}`);
    const data = await res.json();
    if (!data.success) {
      container.innerHTML = `<span style="color:#DC2626;">ত্রুটি: ${data.error || 'তথ্য পাওয়া যায়নি'}</span>`;
      return;
    }

    if (!data.submitted) {
      container.innerHTML = `
        <div style="color: #64748B; padding: 0.5rem 0;">
          ⚠️ <strong>${date}</strong> তারিখে এই প্রতিযোগী কোনো আমল জমা দেননি।
        </div>
      `;
      return;
    }

    const sub = data.submission;
    const breakdown = data.breakdown || [];

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-bottom:1px solid #E2E8F0; padding-bottom:0.5rem;">
        <div>
          <strong style="color:#065F46;">${date} এর আমল সাবমিশন রিপোর্ট</strong>
          <span style="font-size:0.75rem; color:#059669; margin-left:0.5rem;">✓ সততার স্বীকৃতি প্রাপ্ত</span>
        </div>
        <span class="badge badge-success" style="font-size:0.9rem; padding: 3px 10px;">
          অর্জিত পয়েন্ট: ${sub.total_points_awarded} / ১০০
        </span>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.5rem;">
        ${breakdown.map(item => `
          <div style="background:#FFF; border:1px solid #E2E8F0; border-radius:6px; padding:0.5rem; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:600; font-size:0.85rem; color:#1E293B;">${item.title_bn}</div>
              <div style="font-size:0.75rem; color:${item.completed ? '#059669' : '#94A3B8'};">${item.status_text}</div>
            </div>
            <span style="background:${item.points_earned > 0 ? '#ECFDF5' : '#F1F5F9'}; color:${item.points_earned > 0 ? '#065F46' : '#94A3B8'}; font-weight:700; font-size:0.8rem; padding:2px 6px; border-radius:4px;">
              ${item.points_earned > 0 ? '+' + item.points_earned : '০'}
            </span>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<span style="color:#DC2626;">সার্ভার যোগাযোগে ত্রুটি</span>';
  }
}

function openPinWinnerModal(preselectedUserId) {
  const select = document.getElementById('pinWinnerUserIdSelect');
  select.innerHTML = '<option value="">-- প্রতিযোগী নির্বাচন করুন --</option>' +
    adminParticipantsList.map(p => `
      <option value="${p.id}" ${preselectedUserId && preselectedUserId === p.id ? 'selected' : ''}>
        #${p.rank} - ${p.full_name} (${p.phone || p.masked_phone}) - ${p.total_points} পয়েন্ট
      </option>
    `).join('');

  if (preselectedUserId) {
    const user = adminParticipantsList.find(p => p.id === preselectedUserId);
    if (user) {
      document.getElementById('pinWinnerPoints').value = user.total_points || 4000;
      document.getElementById('pinWinnerLevel').value = user.current_level || 'Diamond';
      if (document.getElementById('pinWinnerShortBio')) {
        document.getElementById('pinWinnerShortBio').value = `${user.full_name} নিয়মিত জামাতে সালাত ও সুন্নাহ রুটিনে অবিচল কৃতি আমলকারী।`;
      }
    }
  }

  document.getElementById('pinWinnerMonthTitle').value = 'গত মাসের বিজয়ী!';
  document.getElementById('pinWinnerBlessing').value = 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।';
  document.getElementById('pinWinnerIsActive').checked = true;

  openModal('pinWinnerModal');
}

function handlePinWinnerUserSelect(select) {
  const userId = parseInt(select.value, 10);
  const user = adminParticipantsList.find(p => p.id === userId);
  if (user) {
    document.getElementById('pinWinnerPoints').value = user.total_points || 4000;
    document.getElementById('pinWinnerLevel').value = user.current_level || 'Diamond';
    if (document.getElementById('pinWinnerShortBio')) {
      document.getElementById('pinWinnerShortBio').value = `${user.full_name} নিয়মিত জামাতে সালাত ও সুন্নাহ রুটিনে অবিচল কৃতি আমলকারী।`;
    }
  }
}

async function savePinnedWinner(e) {
  e.preventDefault();
  const userId = parseInt(document.getElementById('pinWinnerUserIdSelect').value, 10);
  if (!userId) return alert('অনুগ্রহ করে একজন প্রতিযোগী নির্বাচন করুন');

  const monthTitle = document.getElementById('pinWinnerMonthTitle').value.trim() || 'গত মাসের বিজয়ী!';
  const totalPoints = parseInt(document.getElementById('pinWinnerPoints').value, 10) || 4000;
  const level = document.getElementById('pinWinnerLevel').value.trim() || 'Diamond';
  const blessingMessage = document.getElementById('pinWinnerBlessing').value.trim() || 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।';
  const isActive = document.getElementById('pinWinnerIsActive').checked;
  const compName = document.getElementById('pinWinnerCompName')?.value.trim() || '৪০ দিনের আত্মশুদ্ধি আমল প্রতিযোগিতা (ব্যাচ-০১)';
  const position = document.getElementById('pinWinnerPosition')?.value.trim() || '১ম স্থান (বিজয়ী)';
  const shortBio = document.getElementById('pinWinnerShortBio')?.value.trim() || 'নিয়মিত জামাতে সালাত আদায়কারী, কুরআন তিলাওয়াত ও মাসনুন জিকিরে অবিচল কৃতি প্রতিযোগী।';
  const achievement = document.getElementById('pinWinnerAchievement')?.value.trim() || 'টানা ৪০ দিন ১০০% জামাতে সালাত, তাহাজ্জুদ ও পূর্ণাঙ্গ সুন্নাহ লাইফস্টাইল অনুসরণে সর্বোচ্চ পয়েন্ট অর্জন করেছেন।';

  try {
    const res = await fetch('/api/lifestyle/admin/pinned-winner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        month_title: monthTitle,
        total_points: totalPoints,
        level: level,
        blessing_message: blessingMessage,
        is_active: isActive,
        competition_name: compName,
        winning_position: position,
        short_bio: shortBio,
        achievement_details: achievement
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || 'গত মাসের বিজয়ী সফলভাবে পিন করা হয়েছে!');
      closeModal('pinWinnerModal');
      await loadAdminPinnedWinner();
    } else {
      alert('ত্রুটি: ' + (data.error || 'পিন করা যায়নি'));
    }
  } catch (err) {
    alert('সার্ভার যোগাযোগে সমস্যা হয়েছে');
  }
}

async function loadAdminPinnedWinner() {
  try {
    const res = await fetch('/api/lifestyle/pinned-winner');
    const data = await res.json();
    const display = document.getElementById('adminPinnedWinnerDisplay');
    const unpinBtn = document.getElementById('adminUnpinBtn');
    
    if (data.success && data.pinned_winner && data.pinned_winner.is_active) {
      const pw = data.pinned_winner;
      if (unpinBtn) unpinBtn.style.display = 'inline-block';
      display.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <img src="${pw.profile_photo || '/images/default-avatar.svg'}" alt="${pw.full_name}" style="width: 60px; height: 60px; border-radius: 50%; border: 3px solid #F59E0B; object-fit: cover;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="badge badge-warning" style="background:#FEF3C7; color:#92400E; font-weight:700;">${pw.month_title || 'গত মাসের বিজয়ী!'}</span>
                <span class="badge badge-success">সক্রিয়ভাবে পিন্ড</span>
              </div>
              <h4 style="margin: 0.25rem 0; font-size: 1.15rem; color: #1E293B;">${pw.full_name}</h4>
              <div style="font-size: 0.85rem; color: #64748B;">
                পয়েন্ট: <strong>${pw.total_points || 0}</strong> • স্তর: <strong>${pw.level || 'Diamond'}</strong>
              </div>
            </div>
          </div>
          <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 0.6rem 1rem; color: #065F46; font-size: 0.95rem; font-weight: 600;">
            ${pw.blessing_message || 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।'}
          </div>
        </div>
      `;
    } else {
      if (unpinBtn) unpinBtn.style.display = 'none';
      display.innerHTML = `
        <div style="text-align: center; color: #94A3B8; padding: 0.75rem;">
          বর্তমানে কোনো প্রতিযোগী 'গত মাসের বিজয়ী' হিসেবে পিন করা নেই। উপরের <strong>"👑 বিজয়ী পিন / পরিবর্তন করুন"</strong> বাটনে ক্লিক করে একজন প্রতিযোগীকে পিন করুন।
        </div>
      `;
    }
  } catch (err) {
    console.error('Failed to load pinned winner in admin:', err);
  }
}

async function loadAdminAmalCategories() {
  try {
    const res = await fetch('/api/lifestyle/admin/categories');
    const data = await res.json();
    const tbody = document.getElementById('adminAmalCategoriesTbody');
    if (data.success && data.categories) {
      adminAmalCategoriesList = data.categories;
      if (!adminAmalCategoriesList.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 1.5rem;">কোনো ক্যাটাগরি তৈরি করা হয়নি।</td></tr>';
        return;
      }
      tbody.innerHTML = adminAmalCategoriesList.map(cat => `
        <tr>
          <td><strong>#${cat.sort_order}</strong></td>
          <td style="font-size: 1.25rem;">${cat.icon || '📌'}</td>
          <td>
            <div style="font-weight: 700; color: #0F172A;">${cat.title_bn}</div>
            <div style="font-size: 0.78rem; color: #64748B;">${cat.title_en || ''}</div>
          </td>
          <td><code>${cat.slug}</code></td>
          <td><span class="badge badge-primary">${cat.max_points} পয়েন্ট</span></td>
          <td>${cat.activities ? cat.activities.length : 0} টি আমল</td>
          <td>
            <button class="badge ${cat.is_active ? 'badge-success' : 'badge-danger'}" onclick="toggleCategoryActive(${cat.id})" style="cursor: pointer; border: none;">
              ${cat.is_active ? '✓ সক্রিয়' : '✕ নিষ্ক্রিয়'}
            </button>
          </td>
          <td style="text-align: right;">
            <button class="btn btn-sm btn-secondary" onclick="editCategory(${cat.id})" style="padding: 2px 8px; font-size: 0.75rem; margin-right: 4px;">✏️ সম্পাদনা</button>
            <button class="btn btn-sm btn-danger" onclick="deleteCategory(${cat.id})" style="padding: 2px 8px; font-size: 0.75rem;">🗑️ মুছুন</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load admin categories:', err);
  }
}

async function loadAdminParticipants() {
  try {
    const res = await fetch('/api/lifestyle/leaderboard');
    const data = await res.json();
    const tbody = document.getElementById('adminLifestyleTbody');
    if (data.success && data.leaderboard) {
      adminParticipantsList = data.leaderboard;
      if (!adminParticipantsList.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">এখনো কোনো প্রতিযোগী নিবন্ধন করেনি।</td></tr>';
        return;
      }
      tbody.innerHTML = adminParticipantsList.map(p => `
        <tr>
          <td><strong>#${p.rank}</strong></td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <img src="${p.profile_photo || '/images/default-avatar.svg'}" alt="${p.full_name}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1px solid #CBD5E1;">
              <div>
                <strong>${p.full_name}</strong>
                <div style="font-size: 0.75rem; color: #64748B;">আইডি: #${p.id}</div>
              </div>
            </div>
          </td>
          <td>${p.masked_phone}</td>
          <td>${p.completed_days} / 40 দিন</td>
          <td><span class="badge badge-primary">${p.current_level}</span></td>
          <td><strong style="color:var(--primary); font-size: 1rem;">${p.total_points}</strong></td>
          <td style="text-align: right;">
            <button class="btn btn-sm" onclick="openPinWinnerModal(${p.id})" style="background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; padding: 3px 8px; font-size: 0.78rem; font-weight: 700; border-radius: 4px; cursor: pointer;">
              👑 বিজয়ী পিন করুন
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error(e);
  }
}

function openPinWinnerModal(preselectedUserId) {
  const select = document.getElementById('pinWinnerUserIdSelect');
  select.innerHTML = '<option value="">-- প্রতিযোগী নির্বাচন করুন --</option>' +
    adminParticipantsList.map(p => `
      <option value="${p.id}" ${preselectedUserId && preselectedUserId === p.id ? 'selected' : ''}>
        #${p.rank} - ${p.full_name} (${p.phone || p.masked_phone}) - ${p.total_points} পয়েন্ট
      </option>
    `).join('');

  if (preselectedUserId) {
    const user = adminParticipantsList.find(p => p.id === preselectedUserId);
    if (user) {
      document.getElementById('pinWinnerPoints').value = user.total_points || 4000;
      document.getElementById('pinWinnerLevel').value = user.current_level || 'Diamond';
    }
  }

  document.getElementById('pinWinnerMonthTitle').value = 'গত মাসের বিজয়ী!';
  document.getElementById('pinWinnerBlessing').value = 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।';
  document.getElementById('pinWinnerIsActive').checked = true;

  openModal('pinWinnerModal');
}

function handlePinWinnerUserSelect(select) {
  const userId = parseInt(select.value, 10);
  const user = adminParticipantsList.find(p => p.id === userId);
  if (user) {
    document.getElementById('pinWinnerPoints').value = user.total_points || 4000;
    document.getElementById('pinWinnerLevel').value = user.current_level || 'Diamond';
  }
}

async function savePinnedWinner(e) {
  e.preventDefault();
  const userId = parseInt(document.getElementById('pinWinnerUserIdSelect').value, 10);
  if (!userId) return alert('অনুগ্রহ করে একজন প্রতিযোগী নির্বাচন করুন');

  const monthTitle = document.getElementById('pinWinnerMonthTitle').value.trim() || 'গত মাসের বিজয়ী!';
  const totalPoints = parseInt(document.getElementById('pinWinnerPoints').value, 10) || 4000;
  const level = document.getElementById('pinWinnerLevel').value.trim() || 'Diamond';
  const blessingMessage = document.getElementById('pinWinnerBlessing').value.trim() || 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।';
  const isActive = document.getElementById('pinWinnerIsActive').checked;

  try {
    const res = await fetch('/api/lifestyle/admin/pinned-winner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        month_title: monthTitle,
        total_points: totalPoints,
        level: level,
        blessing_message: blessingMessage,
        is_active: isActive
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || 'গত মাসের বিজয়ী সফলভাবে পিন করা হয়েছে!');
      closeModal('pinWinnerModal');
      await loadAdminPinnedWinner();
    } else {
      alert('ত্রুটি: ' + (data.error || 'পিন করা যায়নি'));
    }
  } catch (err) {
    alert('সার্ভার যোগাযোগে সমস্যা হয়েছে');
  }
}

async function unpinMonthlyWinner() {
  if (!confirm('আপনি কি নিশ্চিত যে বর্তমান গত মাসের বিজয়ী পিন বাতিল করতে চান?')) return;
  try {
    const res = await fetch('/api/lifestyle/admin/pinned-winner', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert('বিজয়ী পিন সফলভাবে বাতিল করা হয়েছে');
      await loadAdminPinnedWinner();
    } else {
      alert(data.error || 'পিন বাতিল ব্যর্থ হয়েছে');
    }
  } catch (err) {
    alert('সার্ভার যোগাযোগে সমস্যা');
  }
}

function openAddCategoryModal() {
  document.getElementById('categoryForm').reset();
  document.getElementById('catId').value = '';
  document.getElementById('catIcon').value = '🌙';
  document.getElementById('catMaxPoints').value = '10';
  document.getElementById('catSortOrder').value = (adminAmalCategoriesList.length + 1);
  document.getElementById('catIsActive').checked = true;
  document.getElementById('categoryModalTitle').innerText = '+ নতুন আমল ক্যাটাগরি তৈরি';
  document.getElementById('catSubmitBtn').innerText = 'ক্যাটাগরি তৈরি করুন';
  openModal('categoryModal');
}

function editCategory(id) {
  const cat = adminAmalCategoriesList.find(c => c.id === id);
  if (!cat) return;
  document.getElementById('catId').value = cat.id;
  document.getElementById('catTitleBn').value = cat.title_bn;
  document.getElementById('catTitleEn').value = cat.title_en || '';
  document.getElementById('catSlug').value = cat.slug;
  document.getElementById('catIcon').value = cat.icon || '📌';
  document.getElementById('catMaxPoints').value = cat.max_points;
  document.getElementById('catSortOrder').value = cat.sort_order;
  document.getElementById('catIsActive').checked = !!cat.is_active;
  document.getElementById('categoryModalTitle').innerText = 'ক্যাটাগরি সম্পাদনা করুন';
  document.getElementById('catSubmitBtn').innerText = 'পরিবর্তন সংরক্ষণ করুন';
  openModal('categoryModal');
}

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('catId').value;
  const payload = {
    title_bn: document.getElementById('catTitleBn').value.trim(),
    title_en: document.getElementById('catTitleEn').value.trim(),
    slug: document.getElementById('catSlug').value.trim(),
    icon: document.getElementById('catIcon').value.trim() || '📌',
    max_points: parseInt(document.getElementById('catMaxPoints').value, 10) || 10,
    sort_order: parseInt(document.getElementById('catSortOrder').value, 10) || 1,
    is_active: document.getElementById('catIsActive').checked
  };

  try {
    const url = id ? `/api/lifestyle/admin/categories/${id}` : '/api/lifestyle/admin/categories';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || 'ক্যাটাগরি সংরক্ষিত হয়েছে');
      closeModal('categoryModal');
      await loadAdminAmalCategories();
    } else {
      alert('ত্রুটি: ' + (data.error || 'ক্যাটাগরি সংরক্ষণ ব্যর্থ'));
    }
  } catch (err) {
    alert('সার্ভার যোগাযোগে সমস্যা হয়েছে');
  }
}

async function toggleCategoryActive(id) {
  try {
    const res = await fetch(`/api/lifestyle/admin/categories/${id}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      await loadAdminAmalCategories();
    } else {
      alert(data.error || 'টগল ব্যর্থ হয়েছে');
    }
  } catch (err) {
    alert('সার্ভার যোগাযোগে সমস্যা');
  }
}

async function deleteCategory(id) {
  if (!confirm('আপনি কি এই আমল ক্যাটাগরি মুছে ফেলতে চান?')) return;
  try {
    const res = await fetch(`/api/lifestyle/admin/categories/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert('ক্যাটাগরি মুছে ফেলা হয়েছে');
      await loadAdminAmalCategories();
    } else {
      alert(data.error || 'ডিলিট ব্যর্থ হয়েছে');
    }
  } catch (err) {
    alert('সার্ভার যোগাযোগে সমস্যা');
  }
}

// ==================== ADVERTISEMENTS & BANNERS MANAGEMENT ====================
async function handleBannerUpload(input, targetUrlInputId, previewImgId) {
  const file = input.files && input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('banner', file);

  try {
    showToast('ব্যানার ছবি আপলোড হচ্ছে...', 'info');
    const res = await fetch('/api/admin/commerce/upload-banner', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success && data.image_url) {
      if (document.getElementById(targetUrlInputId)) {
        document.getElementById(targetUrlInputId).value = data.image_url;
      }
      if (document.getElementById(previewImgId)) {
        document.getElementById(previewImgId).src = data.image_url;
      }
      showToast('ব্যানার ছবি সফলভাবে আপলোড হয়েছে!', 'success');
    } else {
      showToast(data.error || 'ব্যানার আপলোড ব্যর্থ হয়েছে', 'error');
    }
  } catch (err) {
    showToast('আপলোড ত্রুটি: ' + err.message, 'error');
  }
}

async function loadAdsMgrData() {
  try {
    const res = await fetch('/api/admin/commerce/advertisements');
    const data = await res.json();
    const tbody = document.getElementById('adminAdsTbody');
    if (data.success && data.advertisements) {
      if (data.advertisements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem;">কোনো বিজ্ঞাপন বা ব্যানার যুক্ত করা নেই।</td></tr>';
      } else {
        tbody.innerHTML = data.advertisements.map(a => `
          <tr>
            <td>
              <img src="${a.image_url}" alt="${a.title}" style="width: 100px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid #CBD5E1; background: #F1F5F9;">
            </td>
            <td>
              <strong>${a.title}</strong>
              ${a.description ? `<br><small style="color:var(--text-muted);">${a.description}</small>` : ''}
            </td>
            <td><span class="badge badge-secondary">${a.placement || 'homepage'}</span></td>
            <td><small>${a.button_text || 'বিস্তারিত দেখুন'}</small></td>
            <td><a href="${a.target_url}" target="_blank" style="font-size:0.8rem; color:var(--primary);">${a.target_url || '#'}</a></td>
            <td><span class="badge ${a.is_active ? 'badge-success' : 'badge-danger'}">${a.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}</span></td>
            <td style="white-space:nowrap;">
              <button class="btn btn-xs btn-primary" onclick="openEditAdModal(${a.id})">✏️ সম্পাদনা</button>
              <button class="btn btn-xs ${a.is_active ? 'btn-danger' : 'btn-success'}" onclick="toggleAdStatus(${a.id})">${a.is_active ? 'হাইড' : 'পাবলিশ'}</button>
              <button class="btn btn-xs btn-secondary" onclick="deleteAd(${a.id})">🗑️</button>
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load ads in admin:', e);
  }
}

function openAddAdModal() {
  document.getElementById('addAdForm').reset();
  if (document.getElementById('addAdImagePreview')) {
    document.getElementById('addAdImagePreview').src = '/images/hero-banner.jpg';
  }
  openModal('addAdModal');
}

async function saveNewAd(e) {
  e.preventDefault();
  const title = document.getElementById('addAdTitle').value.trim();
  const description = document.getElementById('addAdDesc').value.trim();
  const imageUrl = document.getElementById('addAdImageUrl').value.trim();
  const placement = document.getElementById('addAdPlacement').value;
  const buttonText = document.getElementById('addAdButtonText').value.trim();
  const targetUrl = document.getElementById('addAdTargetUrl').value.trim();
  const isActive = document.getElementById('addAdActive').checked ? 1 : 0;

  try {
    const res = await fetch('/api/admin/commerce/advertisements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        image_url: imageUrl,
        placement,
        button_text: buttonText,
        target_url: targetUrl,
        is_active: isActive
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('নতুন ব্যানার বিজ্ঞাপন সফলভাবে যুক্ত করা হয়েছে!', 'success');
      closeModal('addAdModal');
      loadAdsMgrData();
    } else {
      showToast(data.error || 'বিজ্ঞাপন যুক্ত করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

async function openEditAdModal(id) {
  try {
    const res = await fetch(`/api/admin/commerce/advertisements/${id}`);
    const data = await res.json();
    if (!data.success || !data.advertisement) {
      showToast(data.error || 'বিজ্ঞাপনের তথ্য পাওয়া যায়নি', 'error');
      return;
    }
    const a = data.advertisement;
    document.getElementById('editAdId').value = a.id;
    document.getElementById('editAdTitle').value = a.title || '';
    document.getElementById('editAdDesc').value = a.description || '';
    document.getElementById('editAdImageUrl').value = a.image_url || '';
    document.getElementById('editAdImagePreview').src = a.image_url || '';
    document.getElementById('editAdPlacement').value = a.placement || 'homepage';
    document.getElementById('editAdButtonText').value = a.button_text || 'বিস্তারিত দেখুন';
    document.getElementById('editAdTargetUrl').value = a.target_url || '#';
    document.getElementById('editAdActive').checked = a.is_active === 1;

    openModal('editAdModal');
  } catch (err) {
    showToast('বিজ্ঞাপন লোড ত্রুটি: ' + err.message, 'error');
  }
}

async function saveEditAd(e) {
  e.preventDefault();
  const id = document.getElementById('editAdId').value;
  const title = document.getElementById('editAdTitle').value.trim();
  const description = document.getElementById('editAdDesc').value.trim();
  const imageUrl = document.getElementById('editAdImageUrl').value.trim();
  const placement = document.getElementById('editAdPlacement').value;
  const buttonText = document.getElementById('editAdButtonText').value.trim();
  const targetUrl = document.getElementById('editAdTargetUrl').value.trim();
  const isActive = document.getElementById('editAdActive').checked ? 1 : 0;

  try {
    const res = await fetch(`/api/admin/commerce/advertisements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        image_url: imageUrl,
        placement,
        button_text: buttonText,
        target_url: targetUrl,
        is_active: isActive
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('ব্যানার বিজ্ঞাপন সফলভাবে আপডেট করা হয়েছে!', 'success');
      closeModal('editAdModal');
      loadAdsMgrData();
    } else {
      showToast(data.error || 'বিজ্ঞাপন আপডেট করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

async function toggleAdStatus(id) {
  try {
    const res = await fetch(`/api/admin/commerce/advertisements/${id}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('বিজ্ঞাপন স্ট্যাটাস পরিবর্তন সফল হয়েছে!', 'success');
      loadAdsMgrData();
    } else {
      showToast(data.error || 'স্ট্যাটাস পরিবর্তন করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

async function deleteAd(id) {
  if (!confirm('আপনি কি নিশ্চিতভাবে এই ব্যানার বিজ্ঞাপনটি মুছে ফেলতে চান?')) return;
  try {
    const res = await fetch(`/api/admin/commerce/advertisements/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('ব্যানার বিজ্ঞাপন সফলভাবে মুছে ফেলা হয়েছে!', 'success');
      loadAdsMgrData();
    } else {
      showToast(data.error || 'বিজ্ঞাপন মোছা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

// ==================== PRODUCT IMAGE & MODAL MANAGEMENT ====================
async function handleProductImageUpload(input, targetUrlInputId, previewImgId) {
  const file = input.files && input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    showToast('পণ্যের ছবি আপলোড হচ্ছে...', 'info');
    const res = await fetch('/api/admin/commerce/upload-product-image', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success && data.image_url) {
      if (document.getElementById(targetUrlInputId)) {
        document.getElementById(targetUrlInputId).value = data.image_url;
      }
      if (document.getElementById(previewImgId)) {
        document.getElementById(previewImgId).src = data.image_url;
      }
      showToast('পণ্যের ছবি সফলভাবে আপলোড হয়েছে!', 'success');
    } else {
      showToast(data.error || 'ছবি আপলোড ব্যর্থ হয়েছে', 'error');
    }
  } catch (err) {
    showToast('আপলোড ত্রুটি: ' + err.message, 'error');
  }
}

function openAddProductModal() {
  document.getElementById('addProductForm').reset();
  if (document.getElementById('addProdImagePreview')) {
    document.getElementById('addProdImagePreview').src = '/images/products/honey.jpg';
  }
  openModal('addProductModal');
}

async function saveNewProduct(e) {
  e.preventDefault();
  const nameBn = document.getElementById('addProdNameBn').value.trim();
  const nameEn = document.getElementById('addProdNameEn').value.trim();
  const categoryId = document.getElementById('addProdCategory')?.value || null;
  const price = parseFloat(document.getElementById('addProdPrice').value);
  const discountPrice = parseFloat(document.getElementById('addProdDiscount').value) || null;
  const stockQuantity = parseInt(document.getElementById('addProdStock').value, 10) || 50;
  const imageUrl = document.getElementById('addProdImage').value.trim() || '/images/products/honey.jpg';
  const descriptionBn = document.getElementById('addProdDescBn').value.trim();

  try {
    const res = await fetch('/api/admin/commerce/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: categoryId,
        name_bn: nameBn,
        name_en: nameEn,
        price,
        discount_price: discountPrice,
        stock_quantity: stockQuantity,
        image_url: imageUrl,
        description_bn: descriptionBn
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('নতুন পণ্য সফলভাবে যুক্ত করা হয়েছে!', 'success');
      closeModal('addProductModal');
      loadCommerceData();
    } else {
      showToast(data.error || 'পণ্য যুক্ত করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

async function openEditProductModal(id) {
  try {
    const res = await fetch(`/api/admin/commerce/products/${id}`);
    const data = await res.json();
    if (!data.success || !data.product) {
      showToast(data.error || 'পণ্য তথ্য পাওয়া যায়নি', 'error');
      return;
    }
    const p = data.product;
    document.getElementById('editProdId').value = p.id;
    document.getElementById('editProdNameBn').value = p.name_bn || '';
    document.getElementById('editProdNameEn').value = p.name_en || '';
    if (document.getElementById('editProdCategory')) {
      document.getElementById('editProdCategory').value = p.category_id || '1';
    }
    document.getElementById('editProdPrice').value = p.price;
    document.getElementById('editProdDiscount').value = p.discount_price || '';
    document.getElementById('editProdStock').value = p.stock_quantity;
    document.getElementById('editProdImage').value = p.image_url || '';
    document.getElementById('editProdImagePreview').src = p.image_url || '/images/products/honey.jpg';
    document.getElementById('editProdDescBn').value = p.description_bn || '';
    document.getElementById('editProdActive').checked = p.is_active === 1;

    openModal('editProductModal');
  } catch (err) {
    showToast('পণ্য লোড ত্রুটি: ' + err.message, 'error');
  }
}

async function saveEditProduct(e) {
  e.preventDefault();
  const id = document.getElementById('editProdId').value;
  const nameBn = document.getElementById('editProdNameBn').value.trim();
  const nameEn = document.getElementById('editProdNameEn').value.trim();
  const categoryId = document.getElementById('editProdCategory').value;
  const price = parseFloat(document.getElementById('editProdPrice').value);
  const discountPrice = parseFloat(document.getElementById('editProdDiscount').value) || null;
  const stockQuantity = parseInt(document.getElementById('editProdStock').value, 10) || 0;
  const imageUrl = document.getElementById('editProdImage').value.trim();
  const descriptionBn = document.getElementById('editProdDescBn').value.trim();
  const isActive = document.getElementById('editProdActive').checked ? 1 : 0;

  try {
    const res = await fetch(`/api/admin/commerce/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: categoryId,
        name_bn: nameBn,
        name_en: nameEn,
        price,
        discount_price: discountPrice,
        stock_quantity: stockQuantity,
        image_url: imageUrl,
        description_bn: descriptionBn,
        is_active: isActive
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('পণ্য সফলভাবে আপডেট করা হয়েছে!', 'success');
      closeModal('editProductModal');
      loadCommerceData();
    } else {
      showToast(data.error || 'পণ্য আপডেট করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

// ==================== HIJAMA PACKAGES ====================
function openAddHijamaPackageModal() {
  document.getElementById('addHijamaPackageForm').reset();
  openModal('addHijamaPackageModal');
}

async function saveNewHijamaPackage(e) {
  e.preventDefault();
  const titleBn = document.getElementById('addPkgTitleBn').value.trim();
  const pointCount = parseInt(document.getElementById('addPkgPoints').value, 10);
  const price = parseFloat(document.getElementById('addPkgPrice').value);
  const descriptionBn = document.getElementById('addPkgDescBn').value.trim();

  try {
    const res = await fetch('/api/admin/commerce/hijama-packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title_bn: titleBn,
        point_count: pointCount,
        price,
        description_bn: descriptionBn
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('নতুন হিজামা প্যাকেজ সফলভাবে যুক্ত করা হয়েছে!', 'success');
      closeModal('addHijamaPackageModal');
      loadHijamaMgrData();
    } else {
      showToast(data.error || 'প্যাকেজ যুক্ত করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

// ==================== RUQYAH AUDIOS & UPLOAD MANAGEMENT ====================
async function handleAudioUpload(input, targetUrlInputId, statusDivId) {
  const file = input.files && input.files[0];
  if (!file) return;

  const statusEl = document.getElementById(statusDivId);
  if (statusEl) {
    statusEl.textContent = 'অডিও ফাইল আপলোড হচ্ছে... অনুগ্রহ করে অপেক্ষা করুন...';
    statusEl.style.color = '#0284C7';
  }

  const formData = new FormData();
  formData.append('audio', file);

  try {
    const res = await fetch('/api/admin/commerce/upload-audio', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success && data.audio_url) {
      if (document.getElementById(targetUrlInputId)) {
        document.getElementById(targetUrlInputId).value = data.audio_url;
      }
      if (statusEl) {
        statusEl.textContent = `✓ ফাইল আপলোড সম্পন্ন (${(data.size / (1024 * 1024)).toFixed(1)} MB)`;
        statusEl.style.color = '#059669';
      }
      showToast('রুকইয়াহ অডিও ফাইল সফলভাবে আপলোড হয়েছে!', 'success');
    } else {
      if (statusEl) {
        statusEl.textContent = '✕ আপলোড ব্যর্থ: ' + (data.error || 'অননুমোদিত ফরম্যাট');
        statusEl.style.color = '#DC2626';
      }
      showToast(data.error || 'অডিও ফাইল আপলোড ব্যর্থ হয়েছে', 'error');
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = '✕ ত্রুটি: ' + err.message;
      statusEl.style.color = '#DC2626';
    }
    showToast('আপলোড ত্রুটি: ' + err.message, 'error');
  }
}

function openAddRuqyahAudioModal() {
  document.getElementById('addRuqyahAudioForm').reset();
  if (document.getElementById('addAudioUploadStatus')) {
    document.getElementById('addAudioUploadStatus').textContent = '';
  }
  openModal('addRuqyahAudioModal');
}

async function saveNewRuqyahAudio(e) {
  e.preventDefault();
  const titleBn = document.getElementById('addAudioTitleBn').value.trim();
  const titleAr = document.getElementById('addAudioTitleAr').value.trim();
  const category = document.getElementById('addAudioCategory').value;
  const duration = document.getElementById('addAudioDuration').value.trim();
  const audioUrl = document.getElementById('addAudioUrl').value.trim();
  const textBn = document.getElementById('addAudioTextBn').value.trim();

  try {
    const res = await fetch('/api/admin/commerce/ruqyah-audios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title_bn: titleBn,
        title_ar: titleAr,
        category,
        duration,
        audio_url: audioUrl,
        text_bn: textBn
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('নতুন রুকইয়াহ অডিও সফলভাবে যুক্ত করা হয়েছে!', 'success');
      closeModal('addRuqyahAudioModal');
      loadRuqyahMgrData();
    } else {
      showToast(data.error || 'অডিও যুক্ত করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

async function openEditRuqyahAudioModal(id) {
  try {
    const res = await fetch(`/api/admin/commerce/ruqyah-audios/${id}`);
    const data = await res.json();
    if (!data.success || !data.audio) {
      showToast(data.error || 'অডিও রিসোর্স পাওয়া যায়নি', 'error');
      return;
    }
    const a = data.audio;
    document.getElementById('editAudioId').value = a.id;
    document.getElementById('editAudioTitleBn').value = a.title_bn || '';
    document.getElementById('editAudioTitleAr').value = a.title_ar || '';
    document.getElementById('editAudioCategory').value = a.category || 'general_ruqyah';
    document.getElementById('editAudioDuration').value = a.duration || '২৫ মিনিট';
    document.getElementById('editAudioUrl').value = a.audio_url || '';
    document.getElementById('editAudioTextBn').value = a.text_bn || '';
    document.getElementById('editAudioActive').checked = a.is_active === 1;
    if (document.getElementById('editAudioUploadStatus')) {
      document.getElementById('editAudioUploadStatus').textContent = '';
    }

    openModal('editRuqyahAudioModal');
  } catch (err) {
    showToast('অডিও লোড ত্রুটি: ' + err.message, 'error');
  }
}

async function saveEditRuqyahAudio(e) {
  e.preventDefault();
  const id = document.getElementById('editAudioId').value;
  const titleBn = document.getElementById('editAudioTitleBn').value.trim();
  const titleAr = document.getElementById('editAudioTitleAr').value.trim();
  const category = document.getElementById('editAudioCategory').value;
  const duration = document.getElementById('editAudioDuration').value.trim();
  const audioUrl = document.getElementById('editAudioUrl').value.trim();
  const textBn = document.getElementById('editAudioTextBn').value.trim();
  const isActive = document.getElementById('editAudioActive').checked ? 1 : 0;

  try {
    const res = await fetch(`/api/admin/commerce/ruqyah-audios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title_bn: titleBn,
        title_ar: titleAr,
        category,
        duration,
        audio_url: audioUrl,
        text_bn: textBn,
        is_active: isActive
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('রুকইয়াহ অডিও সফলভাবে আপডেট করা হয়েছে!', 'success');
      closeModal('editRuqyahAudioModal');
      loadRuqyahMgrData();
    } else {
      showToast(data.error || 'অডিও আপডেট করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}

// ==================== COURSES ====================
function openAddCourseModal() {
  document.getElementById('addCourseForm').reset();
  openModal('addCourseModal');
}

async function saveNewCourse(e) {
  e.preventDefault();
  const titleBn = document.getElementById('addCourseTitleBn').value.trim();
  const fee = parseFloat(document.getElementById('addCourseFee').value) || 0;
  const duration = document.getElementById('addCourseDuration').value.trim();
  const descriptionBn = document.getElementById('addCourseDescBn').value.trim();

  try {
    const res = await fetch('/api/admin/commerce/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title_bn: titleBn,
        fee,
        duration,
        description_bn: descriptionBn
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('নতুন কোর্স সফলভাবে যুক্ত করা হয়েছে!', 'success');
      closeModal('addCourseModal');
      loadCoursesMgrData();
    } else {
      showToast(data.error || 'কোর্স যুক্ত করা যায়নি', 'error');
    }
  } catch (err) {
    showToast('ত্রুটি: ' + err.message, 'error');
  }
}
