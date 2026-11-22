/**
 * Ruqyah Support & Cupping Center - Main Client Application Script
 * Mobile Navigation Drawer, Accordions, Toasts, and UX Enhancements
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Mobile Navigation Drawer System ---
  const toggleBtn = document.querySelector('.mobile-toggle');
  const drawer = document.querySelector('.mobile-drawer');
  const backdrop = document.querySelector('.drawer-backdrop');
  const closeBtn = document.querySelector('.drawer-close-btn');

  function openDrawer() {
    if (drawer) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) {
      backdrop.classList.add('active');
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
    document.body.style.overflow = 'hidden'; // Prevent background scroll
  }

  function closeDrawer() {
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) {
      backdrop.classList.remove('active');
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
    document.body.style.overflow = '';
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (drawer && drawer.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeDrawer);
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeDrawer);
  }

  // Auto-close drawer when clicking on any navigation link inside it
  document.querySelectorAll('.drawer-nav-link, .drawer-actions a').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });

  // Close drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // --- Admin Sidebar Mobile Toggle ---
  const adminSidebarToggle = document.querySelector('.admin-sidebar-toggle');
  const adminSidebar = document.querySelector('.admin-sidebar');
  if (adminSidebarToggle && adminSidebar) {
    adminSidebarToggle.addEventListener('click', () => {
      adminSidebar.classList.toggle('open');
    });

    // Close admin sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 992 &&
          adminSidebar.classList.contains('open') &&
          !adminSidebar.contains(e.target) &&
          !adminSidebarToggle.contains(e.target)) {
        adminSidebar.classList.remove('open');
      }
    });
  }

  // --- FAQ Accordion ---
  const faqQuestions = document.querySelectorAll('.faq-question');
  faqQuestions.forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.faq-item');
      if (!parent) return;
      const wasActive = parent.classList.contains('active');
      
      // Close all other items
      document.querySelectorAll('.faq-item').forEach(item => item.classList.remove('active'));
      
      if (!wasActive) {
        parent.classList.add('active');
      }
    });
  });

  // --- Public Contact Form Submission ---
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'পাঠানো হচ্ছে...';

      const payload = {
        name: document.getElementById('contactName')?.value,
        phone: document.getElementById('contactPhone')?.value,
        subject: document.getElementById('contactSubject')?.value,
        message: document.getElementById('contactMessage')?.value
      };

      try {
        const res = await fetch('/api/public/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || 'আপনার বার্তা সফলভাবে গৃহীত হয়েছে।', 'success');
          contactForm.reset();
        } else {
          showToast(data.error || 'বার্তা পাঠানো সম্ভব হয়নি।', 'error');
        }
      } catch (err) {
        showToast('সংযোগ সমস্যা। সরাসরি হোয়াটসঅ্যাপে মেসেজ দিন।', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });
  }

  // --- Homepage Scrolling Notice Loader ---
  const marqueeContainer = document.getElementById('marqueeNoticeContainer');
  const marqueeText = document.getElementById('marqueeNoticeText');
  const marqueeTrack = document.getElementById('marqueeNoticeTrack');

  if (marqueeContainer && marqueeText) {
    fetch('/api/public/notice')
      .then(res => res.json())
      .then(json => {
        if (json.success && json.hasNotice && json.data) {
          const notice = json.data;
          const currentLang = localStorage.getItem('site_lang') || 'bn';
          const content = currentLang === 'en' ? (notice.content_en || notice.content_bn) : (notice.content_bn || notice.content_en);
          if (content && content.trim()) {
            marqueeText.textContent = content.trim();
            if (marqueeTrack) {
              const duplicate = document.createElement('span');
              duplicate.className = 'marquee-text';
              duplicate.style.marginLeft = '4rem';
              duplicate.textContent = content.trim();
              marqueeTrack.appendChild(duplicate);
            }
            marqueeContainer.style.display = 'block';
          }
        }
      })
      .catch(err => {
        console.warn('Notice fetch error:', err);
      });
  }
});

/**
 * Toast Notification System
 */
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '✕';

  toast.innerHTML = `
    <span style="font-weight: 700; font-size: 1.15rem; line-height: 1;">${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 350);
  }, 4000);
}

/**
 * Format Currency in BDT
 */
function formatBDT(amount) {
  if (amount === null || amount === undefined) return '';
  return `৳${Number(amount).toLocaleString('en-US')}`;
}
