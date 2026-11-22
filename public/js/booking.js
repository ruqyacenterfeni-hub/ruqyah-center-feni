/**
 * Ruqyah Support & Cupping Center - Dynamic Online Booking Engine
 * Strictly enforces:
 * 1. Only 2 active services: Ruqyah (2,050 BDT) & Hijama (Consultation based)
 * 2. Mandatory service selection card
 * 3. Bangla default with English switcher integration
 * 4. 1-hour dedicated slots (9 AM - 8 PM, 1 PM - 2 PM break)
 * 5. Automatic slot removal and concurrency control
 */

document.addEventListener('DOMContentLoaded', () => {
  const serviceSelect = document.getElementById('serviceSelect');
  const selectedServiceType = document.getElementById('selectedServiceType');
  const appointmentDateInput = document.getElementById('appointmentDate');
  const slotsContainer = document.getElementById('slotsContainer');
  const slotLoading = document.getElementById('slotLoading');
  const slotMessage = document.getElementById('slotMessage');
  const slotsGrid = document.getElementById('slotsGrid');
  const selectedSlotInput = document.getElementById('selectedTimeSlot');
  const bookingForm = document.getElementById('bookingForm');
  const confirmationCard = document.getElementById('confirmationCard');

  const cardRuqyah = document.getElementById('cardRuqyah');
  const cardFamily = document.getElementById('cardFamily');
  const cardHijama = document.getElementById('cardHijama');
  const radioRuqyah = document.getElementById('radioRuqyah');
  const radioFamily = document.getElementById('radioFamily');
  const radioHijama = document.getElementById('radioHijama');
  const packageTypeInput = document.getElementById('packageTypeInput');
  const numPatientsSelect = document.getElementById('numPatients');
  const pricingFormulaDetail = document.getElementById('pricingFormulaDetail');
  const pricingTotalAmount = document.getElementById('pricingTotalAmount');
  const pricingFormulaLabel = document.getElementById('pricingFormulaLabel');

  let activeServices = [];
  let selectedSlot = null;

  function toBnNumber(num) {
    if (num === null || num === undefined) return '';
    const enStr = Number(num).toLocaleString('en-IN');
    const bnDigits = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯', ',': ',' };
    return enStr.split('').map(c => bnDigits[c] || c).join('');
  }

  function updatePriceCalculation() {
    const sType = selectedServiceType ? selectedServiceType.value : 'ruqyah';
    const num = parseInt(numPatientsSelect ? numPatientsSelect.value : 1, 10) || 1;

    if (sType === 'family') {
      const familySvc = activeServices.find(s => s.code === 'family' || (s.name && s.name.includes('ফ্যামিলি')));
      const fee = familySvc ? (familySvc.discount_price || familySvc.price || 6000) : 6000;
      if (pricingFormulaDetail) pricingFormulaDetail.textContent = `ফ্যামিলি প্যাকেজ (${num} জন রোগী, সর্বোচ্চ ৬ জন)`;
      if (pricingTotalAmount) pricingTotalAmount.textContent = `${toBnNumber(fee)} টাকা`;
      if (pricingFormulaLabel) pricingFormulaLabel.textContent = 'নির্ধারিত প্যাকেজ ফি:';
    } else if (sType === 'ruqyah') {
      const ruqyahSvc = activeServices.find(s => s.code === 'ruqyah' || (s.name && s.name.includes('রুকইয়াহ') && s.code !== 'family'));
      const unitFee = ruqyahSvc ? (ruqyahSvc.discount_price || ruqyahSvc.price || 2050) : 2050;
      const totalFee = unitFee * num;
      if (pricingFormulaDetail) pricingFormulaDetail.textContent = `${num} জন রোগী × ${toBnNumber(unitFee)} টাকা`;
      if (pricingTotalAmount) pricingTotalAmount.textContent = `${toBnNumber(totalFee)} টাকা`;
      if (pricingFormulaLabel) pricingFormulaLabel.textContent = 'হিসাব বিবরণী:';
    } else if (sType === 'hijama') {
      if (pricingFormulaDetail) pricingFormulaDetail.textContent = `সুন্নাতী কাপিং থেরাপি (${num} জন রোগী)`;
      if (pricingTotalAmount) pricingTotalAmount.textContent = `পরামর্শ অনুযায়ী নির্ধারণ`;
      if (pricingFormulaLabel) pricingFormulaLabel.textContent = 'ফি বিবরণী:';
    }
  }

  // Set min date to today in local/BST
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const minDateStr = `${year}-${month}-${day}`;
  if (appointmentDateInput) {
    appointmentDateInput.min = minDateStr;
    // Default to tomorrow or today
    const tomorrow = new Date(Date.now() + 86400000);
    const tomStr = tomorrow.toISOString().split('T')[0];
    appointmentDateInput.value = tomStr;
  }

  // Load Services dynamically from database
  async function loadServices() {
    try {
      const res = await fetch('/api/public/services');
      const data = await res.json();
      if (data.success && data.data) {
        activeServices = data.data;

        // Dynamically update card prices from database
        const ruqyahSvc = activeServices.find(s => s.code === 'ruqyah' || (s.name && s.name.includes('রুকইয়াহ') && s.code !== 'family'));
        if (ruqyahSvc) {
          const uPrice = ruqyahSvc.discount_price || ruqyahSvc.price || 2050;
          const feeRuqyahBadge = document.getElementById('feeRuqyahBadge');
          const feeRuqyahAmount = document.getElementById('feeRuqyahAmount');
          if (feeRuqyahBadge) feeRuqyahBadge.textContent = `প্রতি রোগী: ${toBnNumber(uPrice)} টাকা`;
          if (feeRuqyahAmount) feeRuqyahAmount.textContent = `${toBnNumber(uPrice)} টাকা`;
        }

        const familySvc = activeServices.find(s => s.code === 'family' || (s.name && s.name.includes('ফ্যামিলি')));
        if (familySvc) {
          const fPrice = familySvc.discount_price || familySvc.price || 6000;
          const feeFamilyAmount = document.getElementById('feeFamilyAmount');
          if (feeFamilyAmount) feeFamilyAmount.textContent = `${toBnNumber(fPrice)} টাকা`;
        }

        // Check if URL has service query param
        const urlParams = new URLSearchParams(window.location.search);
        const serviceParam = urlParams.get('service');
        if (serviceParam) {
          const sp = serviceParam.toLowerCase();
          if (sp.includes('family') || sp.includes('ফ্যামিলি')) {
            selectService('family');
          } else if (sp.includes('hijama') || sp.includes('হিজামা')) {
            selectService('hijama');
          } else {
            selectService('ruqyah');
          }
        } else {
          selectService('ruqyah');
        }
      }
    } catch (err) {
      console.error('Failed to load services:', err);
    }
  }

  // Handle service card selection
  function selectService(type) {
    if (type === 'ruqyah') {
      if (radioRuqyah) radioRuqyah.checked = true;
      if (cardRuqyah) cardRuqyah.classList.add('selected');
      if (cardFamily) cardFamily.classList.remove('selected');
      if (cardHijama) cardHijama.classList.remove('selected');
      if (selectedServiceType) selectedServiceType.value = 'ruqyah';
      if (packageTypeInput) packageTypeInput.value = 'standard';

      const s = activeServices.find(x => x.code === 'ruqyah' || (x.name && x.name.includes('রুকইয়াহ') && x.code !== 'family'));
      if (s && serviceSelect) serviceSelect.value = s.id;
    } else if (type === 'family') {
      if (radioFamily) radioFamily.checked = true;
      if (cardFamily) cardFamily.classList.add('selected');
      if (cardRuqyah) cardRuqyah.classList.remove('selected');
      if (cardHijama) cardHijama.classList.remove('selected');
      if (selectedServiceType) selectedServiceType.value = 'family';
      if (packageTypeInput) packageTypeInput.value = 'family';

      const s = activeServices.find(x => x.code === 'family' || (x.name && x.name.includes('ফ্যামিলি')));
      if (s && serviceSelect) serviceSelect.value = s.id;
    } else if (type === 'hijama') {
      if (radioHijama) radioHijama.checked = true;
      if (cardHijama) cardHijama.classList.add('selected');
      if (cardRuqyah) cardRuqyah.classList.remove('selected');
      if (cardFamily) cardFamily.classList.remove('selected');
      if (selectedServiceType) selectedServiceType.value = 'hijama';
      if (packageTypeInput) packageTypeInput.value = 'standard';

      const s = activeServices.find(x => x.code === 'hijama' || (x.name && x.name.includes('হিজামা')));
      if (s && serviceSelect) serviceSelect.value = s.id;
    }

    updatePriceCalculation();
  }

  if (cardRuqyah) {
    cardRuqyah.addEventListener('click', () => selectService('ruqyah'));
  }
  if (cardFamily) {
    cardFamily.addEventListener('click', () => selectService('family'));
  }
  if (cardHijama) {
    cardHijama.addEventListener('click', () => selectService('hijama'));
  }
  if (radioRuqyah) {
    radioRuqyah.addEventListener('change', () => selectService('ruqyah'));
  }
  if (radioFamily) {
    radioFamily.addEventListener('change', () => selectService('family'));
  }
  if (radioHijama) {
    radioHijama.addEventListener('change', () => selectService('hijama'));
  }
  if (numPatientsSelect) {
    numPatientsSelect.addEventListener('change', updatePriceCalculation);
  }

  // Load Real-time Availability for Date
  async function checkAvailability(dateStr) {
    if (!dateStr) return;
    selectedSlot = null;
    if (selectedSlotInput) selectedSlotInput.value = '';

    if (slotLoading) slotLoading.style.display = 'block';
    if (slotMessage) slotMessage.style.display = 'none';
    if (slotsGrid) slotsGrid.innerHTML = '';

    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;

    try {
      const res = await fetch(`/api/public/availability?date=${dateStr}`);
      const data = await res.json();

      if (slotLoading) slotLoading.style.display = 'none';

      if (!data.success) {
        showSlotMessage(data.error || (isBn ? 'সময়সূচী দেখতে ব্যর্থ হয়েছে।' : 'Failed to check availability.'), 'error');
        return;
      }

      // Check if day is completely closed or weekly holiday
      if (data.isClosedDay || data.isWeeklyHoliday || data.isPast) {
        const msg = isBn 
          ? `⚠️ ${data.reason || (data.isWeeklyHoliday ? 'শুক্রবার সাধারণ রোগীদের বুকিং বন্ধ থাকে।' : 'এই তারিখে বুকিং বন্ধ।')}`
          : `⚠️ ${data.reason || 'This date is closed for appointments.'}`;
        showSlotMessage(msg, 'warning');
        return;
      }

      // If no available slots
      if (!data.availableSlots || data.availableSlots.length === 0) {
        const msg = isBn
          ? 'এই তারিখের সকল ১ ঘণ্টার স্লট ইতোমধ্যে বুকিং হয়ে গেছে। অনুগ্রহ করে অন্য তারিখ নির্বাচন করুন।'
          : 'All appointment slots on this date are fully booked. Please select another date.';
        showSlotMessage(msg, 'warning');
        return;
      }

      // Render ONLY available slots! Booked slots disappear!
      renderAvailableSlots(data.availableSlots, data.date);

    } catch (err) {
      if (slotLoading) slotLoading.style.display = 'none';
      const msg = isBn 
        ? 'সার্ভারের সাথে সংযোগ স্থাপন করা সম্ভব হয়নি। দয়া করে আপনার ইন্টারনেট চেক করুন।'
        : 'Unable to reach appointment server. Please check your internet connection.';
      showSlotMessage(msg, 'error');
    }
  }

  function showSlotMessage(text, type = 'info') {
    if (!slotMessage) return;
    slotMessage.style.display = 'block';
    
    let bg = '#FEF3C7';
    let color = '#B45309';
    let border = '#FDE68A';

    if (type === 'error') {
      bg = '#FEE2E2';
      color = '#991B1B';
      border = '#FECACA';
    } else if (type === 'success') {
      bg = '#D1FAE5';
      color = '#065F46';
      border = '#A7F3D0';
    }

    slotMessage.style.backgroundColor = bg;
    slotMessage.style.color = color;
    slotMessage.style.borderColor = border;
    slotMessage.innerHTML = `<div style="padding: 1rem; border-radius: var(--radius-md); border: 1px solid ${border}; font-weight: 500;">${text}</div>`;
  }

  function renderAvailableSlots(slots, dateStr) {
    if (!slotsGrid) return;
    slotsGrid.innerHTML = '';

    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;

    // Notice of live slots
    const infoHeader = document.createElement('div');
    infoHeader.style.gridColumn = '1 / -1';
    infoHeader.style.marginBottom = '0.5rem';
    infoHeader.style.fontSize = '0.9rem';
    infoHeader.style.color = 'var(--primary)';
    infoHeader.style.fontWeight = '600';
    infoHeader.innerHTML = isBn 
      ? `✓ ${slots.length} টি ১ ঘণ্টার খালি স্লট পাওয়া গেছে (${dateStr}):`
      : `✓ ${slots.length} available 1-hour slot(s) found for ${dateStr}:`;
    slotsGrid.appendChild(infoHeader);

    slots.forEach(slot => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.innerHTML = `
        <span style="font-size: 0.95rem; font-weight: 700;">${slot.label}</span>
        <span style="font-size: 0.75rem; color: var(--primary-light); margin-top: 2px;">● ${isBn ? 'খালি আছে (১ ঘণ্টা)' : 'Available (1 Hour)'}</span>
      `;

      btn.addEventListener('click', () => {
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSlot = slot.label;
        if (selectedSlotInput) selectedSlotInput.value = slot.label;

        // Auto scroll smoothly to patient details
        const detailsHeader = document.getElementById('patientDetailsHeader');
        if (detailsHeader) {
          detailsHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      slotsGrid.appendChild(btn);
    });
  }

  // Event listener for date change
  if (appointmentDateInput) {
    appointmentDateInput.addEventListener('change', (e) => {
      checkAvailability(e.target.value);
    });
  }

  // Handle Form Submission
  if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;

      const fullName = document.getElementById('fullName')?.value?.trim();
      const phone = document.getElementById('mobileNumber')?.value?.trim();
      const address = document.getElementById('fullAddress')?.value?.trim();
      const serviceType = selectedServiceType?.value;
      const serviceId = serviceSelect?.value;
      const numPatients = document.getElementById('numPatients')?.value || 1;
      const date = appointmentDateInput?.value;
      const timeSlot = selectedSlotInput?.value;
      const notes = document.getElementById('additionalNotes')?.value?.trim();

      // Client validation
      if (!serviceType && !serviceId) {
        const msg = isBn ? 'অনুগ্রহ করে কাঙ্ক্ষিত সেবাটি (রুকইয়াহ বা হিজামা) নির্বাচন করুন।' : 'Please choose either Ruqyah or Hijama service.';
        if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
        cardRuqyah?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (!fullName) {
        const msg = isBn ? 'অনুগ্রহ করে রোগীর পূর্ণ নাম লিখুন।' : 'Please enter patient full name.';
        if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
        document.getElementById('fullName')?.focus();
        return;
      }

      if (!phone || !/^(?:\+?88)?01[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, ''))) {
        const msg = isBn ? 'সঠিক ১১ ডিজিটের বাংলাদেশী মোবাইল নম্বর দিন (যেমন: 01712345678)।' : 'Please enter a valid 11-digit Bangladeshi mobile number.';
        if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
        document.getElementById('mobileNumber')?.focus();
        return;
      }

      if (!address) {
        const msg = isBn ? 'অনুগ্রহ করে পূর্ণ ঠিকানা (গ্রাম/এলাকা, থানা, জেলা) লিখুন।' : 'Please enter your full address.';
        if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
        document.getElementById('fullAddress')?.focus();
        return;
      }

      if (!date) {
        const msg = isBn ? 'অনুগ্রহ করে সাক্ষাতের তারিখ নির্বাচন করুন।' : 'Please select your preferred appointment date.';
        if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
        appointmentDateInput?.focus();
        return;
      }

      if (!timeSlot) {
        const msg = isBn ? 'অনুগ্রহ করে উপরের খালি সময়সূচী থেকে একটি ১ ঘণ্টার স্লট নির্বাচন করুন।' : 'Please select one of the available 1-hour time slots.';
        if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
        slotsGrid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (serviceType === 'family' && parseInt(numPatients, 10) > 6) {
        const msg = isBn ? 'ফ্যামিলি প্যাকেজে সর্বোচ্চ ৬ জন রোগীর জন্য বুকিং করা সম্ভব।' : 'Family package allows maximum 6 patients.';
        if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
        return;
      }

      const submitBtn = document.getElementById('submitBookingBtn');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg style="animation: spin 1s linear infinite; display: inline-block; width: 18px; height: 18px; vertical-align: middle; margin-right: 6px;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="4" stroke="currentColor" opacity="0.3"></circle>
          <path d="M4 12a8 8 0 018-8" stroke-width="4" stroke="currentColor"></path>
        </svg> ${isBn ? 'বুকিং নিশ্চিত করা হচ্ছে...' : 'Confirming Reservation...'}
      `;

      try {
        const payload = {
          full_name: fullName,
          phone: phone,
          address: address,
          service_type: serviceType,
          service_id: serviceId ? parseInt(serviceId, 10) : undefined,
          package_type: packageTypeInput ? packageTypeInput.value : (serviceType === 'family' ? 'family' : 'standard'),
          number_of_patients: parseInt(numPatients, 10),
          appointment_date: date,
          time_slot: timeSlot,
          additional_notes: notes
        };

        const res = await fetch('/api/public/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!data.success) {
          // If slot was taken concurrently
          if (typeof showToast === 'function') showToast(data.error || (isBn ? 'বুকিং সম্পন্ন করা যায়নি।' : 'Booking failed.'), 'error');
          // Refresh availability dynamically!
          checkAvailability(date);
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
          return;
        }

        // SUCCESS! Render Confirmation Card
        if (typeof showToast === 'function') {
          showToast(isBn ? 'আলহামদুলিল্লাহ, আপনার অ্যাপয়েন্টমেন্ট সফলভাবে বুক হয়েছে!' : 'Appointment successfully confirmed!', 'success');
        }
        renderConfirmation(data.data);

      } catch (err) {
        const msg = isBn ? 'নেটওয়ার্ক সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।' : 'A network error occurred. Please try again.';
        if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  function renderConfirmation(apt) {
    if (bookingForm) bookingForm.style.display = 'none';
    if (!confirmationCard) return;

    const isBn = typeof getCurrentLang === 'function' ? getCurrentLang() === 'bn' : true;

    const serviceDisplay = apt.service_name || (apt.service_type === 'hijama' ? (isBn ? 'হিজামা' : 'Hijama') : (isBn ? 'রুকইয়াহ' : 'Ruqyah'));
    const priceDisplay = apt.price_display || (
      apt.service_type === 'hijama' 
        ? (isBn ? 'খরচ পরামর্শের মাধ্যমে নির্ধারণ করা হবে।' : 'Determined after consultation') 
        : (isBn ? '২,০৫০ টাকা' : 'BDT 2,050')
    );

    confirmationCard.style.display = 'block';
    confirmationCard.innerHTML = `
      <div style="text-align: center; margin-bottom: 2rem;">
        <div style="width: 72px; height: 72px; background-color: var(--primary-subtle); color: var(--primary); border: 2px solid var(--primary-border); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.25rem; margin: 0 auto 1.25rem;">
          ✓
        </div>
        <span class="badge badge-primary" style="font-size: 0.9rem; padding: 0.35rem 1rem;">
          ${isBn ? 'বুকিং নিশ্চিত ও সংরক্ষিত' : 'BOOKING CONFIRMED & RESERVED'}
        </span>
        <h2 style="font-size: 2rem; color: var(--text-main); margin-top: 0.75rem;">
          ${isBn ? 'আলহামদুলিল্লাহ, আপনার অ্যাপয়েন্টমেন্ট বুকিং সম্পন্ন হয়েছে!' : 'Alhamdulillah, Your Appointment is Booked!'}
        </h2>
        <p style="color: var(--text-muted); max-width: 550px; margin: 0.5rem auto 0;">
          ${isBn ? 'আপনার জন্য ১ ঘণ্টার নির্ধারিত সময় বরাদ্দ রাখা হয়েছে। দয়া করে নির্ধারিত সময়ের ১০ মিনিট পূর্বে উপস্থিত হোন।' : 'A dedicated 1-hour appointment has been reserved for you. Please arrive 10 minutes prior to your scheduled time.'}
        </p>
      </div>

      <div style="background-color: #F8FAF9; border: 2px dashed var(--primary-border); border-radius: var(--radius-lg); padding: 1.75rem; margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-light); padding-bottom: 1rem; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">
              ${isBn ? 'অ্যাপয়েন্টমেন্ট রেফারেন্স আইডি' : 'Appointment Reference ID'}
            </div>
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary); letter-spacing: 0.5px;">${apt.appointment_id}</div>
          </div>
          <div>
            <span class="badge badge-status-confirmed" style="font-size: 0.85rem; padding: 0.4rem 0.85rem;">
              ${isBn ? 'স্ট্যাটাস: সংরক্ষিত / কনফার্মড' : 'Status: Reserved / Confirmed'}
            </span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem;">
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
              ${isBn ? 'রোগীর নাম' : 'Patient Name'}
            </div>
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-main);">${apt.patient_name}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
              ${isBn ? 'অ্যাপয়েন্টমেন্টের তারিখ' : 'Appointment Date'}
            </div>
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--primary);">${apt.appointment_date}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
              ${isBn ? 'নির্ধারিত সময়সূচী (১ ঘণ্টা)' : 'Scheduled Time Slot'}
            </div>
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--primary);">${apt.time_slot}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
              ${isBn ? 'নির্বাচিত সেবা' : 'Selected Service'}
            </div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-main);">${serviceDisplay}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
              ${isBn ? 'সেবা ফি / খরচ' : 'Service Fee'}
            </div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--primary);">${priceDisplay}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
              ${isBn ? 'যোগাযোগের মোবাইল' : 'Contact Phone'}
            </div>
            <div style="font-size: 1rem; font-weight: 600; color: var(--text-main);">${apt.patient_phone}</div>
          </div>
          <div style="grid-column: 1 / -1;">
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
              ${isBn ? 'ক্লিনিকের ঠিকানা' : 'Clinic Location'}
            </div>
            <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-main);">${apt.clinic_address || 'ভুঁইয়া ম্যানশন, আদর্শ হাউজিং সোসাইটি, মহিপাল, ফেনী।'}</div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-bottom: 2.5rem;">
        <a href="${apt.whatsapp_link}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-lg">
          <svg style="width: 22px; height: 22px;" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/>
          </svg>
          ${isBn ? 'হোয়াটসঅ্যাপে বুকিং বিবরণ পাঠান' : 'Send Booking Details to WhatsApp'}
        </a>
        <button type="button" onclick="window.print()" class="btn btn-secondary btn-lg">
          🖨 ${isBn ? 'বুকিং স্লিপ প্রিন্ট করুন' : 'Print Booking Slip'}
        </button>
      </div>

      <!-- Guidance Instructions -->
      <div class="card" style="background-color: #FFFFFF; border-left: 4px solid var(--accent-gold);">
        <h4 style="color: var(--accent-gold); margin-bottom: 0.75rem;">
          📋 ${isBn ? 'জরুরি রোগী প্রস্তুতি ও নির্দেশনা' : 'Important Patient Preparation Guidelines'}
        </h4>
        <ul style="padding-left: 1.25rem; font-size: 0.95rem; color: var(--text-body); line-height: 1.7;">
          <li><strong>${isBn ? 'অযু ও পবিত্রতা:' : 'Purity & Wudu:'}</strong> ${isBn ? 'সাক্ষাতে আসার পূর্বে অযু করে পবিত্র অবস্থায় আসুন।' : 'Please perform ablution (Wudu) before attending your session.'}</li>
          <li><strong>${isBn ? 'নারী রোগী:' : 'Female Patients:'}</strong> ${isBn ? 'নারী রোগীদের সাথে অবশ্যই প্রাপ্তবয়স্ক মাহরাম (স্বামী, পিতা, ভাই বা ছেলে) থাকতে হবে।' : 'Female patients MUST be accompanied by an adult Mahram.'}</li>
          <li><strong>${isBn ? 'হিজামা প্রস্তুতি:' : 'Hijama Preparation:'}</strong> ${isBn ? 'হিজামার ক্ষেত্রে ভারী খাবার পরিহার করে ২.৫ থেকে ৩ ঘণ্টা খালি পেটে বা হালকা নাস্তা করে আসুন।' : 'For cupping, avoid heavy meals 2.5–3 hours prior.'}</li>
          <li><strong>${isBn ? 'তাবিজ-কবচ অপসারণ:' : 'Destroy Amulets:'}</strong> ${isBn ? 'শরীরে বা কাপড়ে কোনো তাবিজ-কবচ থাকলে তা নিয়ে আসুন, সুন্নাহ অনুযায়ী ধ্বংস করা হবে।' : 'Bring any amulets to be neutralized according to Sunnah.'}</li>
          <li><strong>${isBn ? 'পূর্ববর্তী রিপোর্ট:' : 'Medical Documents:'}</strong> ${isBn ? 'পূর্বের কোনো ডাক্তারি বা প্যাথলজিক্যাল রিপোর্ট থাকলে সাথে আনবেন।' : 'Bring any prior hospital or clinical reports.'}</li>
        </ul>
      </div>

      <div style="text-align: center; margin-top: 2rem;">
        <a href="/lookup?q=${encodeURIComponent(apt.appointment_id)}" class="btn btn-outline-primary">
          ${isBn ? 'পরবর্তীতে বুকিং স্ট্যাটাস দেখুন' : 'Check Appointment Status Later'}
        </a>
        <a href="/" class="btn btn-secondary" style="margin-left: 0.5rem;">
          ${isBn ? 'হোমপেজে ফিরে যান' : 'Return to Homepage'}
        </a>
      </div>
    `;

    confirmationCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Initial load
  loadServices().then(() => {
    // Default select Ruqyah
    selectService('ruqyah');
    if (appointmentDateInput && appointmentDateInput.value) {
      checkAvailability(appointmentDateInput.value);
    }
  });
});
