(function () {
  const state = {
    course: null,
    images: null,
    facultyStats: [],
    faculty: [],
    toppers: [],
    reviews: [],
    orderBubbles: [],
    selectedClass: null,
    enrolled: false,
    otpSent: false,
    verifiedToken: null,
    phone: '',
    studentName: '',
    remainingTimeMs: 600000,
    countdownTimer: null,
    otpCooldown: 0,
    otpCooldownTimer: null,
    bubbleIdx: 0,
  };

  const els = {
    topBannerImg: document.getElementById('top-banner-img'),
    orderBubbleWrap: document.getElementById('order-bubble-wrap'),
    courseTitle: document.getElementById('course-title'),
    courseSchedule: document.getElementById('course-schedule'),
    choosePanel: document.getElementById('choose-panel'),
    classList: document.getElementById('class-list'),
    beStudentsCount: document.getElementById('be-students-count'),
    totalFee: document.getElementById('total-fee'),
    originalFee: document.getElementById('original-fee'),
    enrollBtn: document.getElementById('enroll-btn'),

    facultyStats: document.getElementById('faculty-stats'),
    facultyTrack: document.getElementById('faculty-track'),
    facultyPrev: document.getElementById('faculty-prev'),
    facultyNext: document.getElementById('faculty-next'),
    toppersGrid: document.getElementById('toppers-grid'),
    reviewsList: document.getElementById('reviews-list'),

    headerEnrollBtn: document.getElementById('header-enroll-btn'),
    mobileBarFee: document.getElementById('mobile-bar-fee'),
    mobileBarOrig: document.getElementById('mobile-bar-orig'),
    mobileBarSub: document.getElementById('mobile-bar-sub'),
    mobileEnrollBtn: document.getElementById('mobile-enroll-btn'),

    popup: document.getElementById('login-popup'),
    popupMask: document.getElementById('popup-mask'),
    popupCloseBtn: document.getElementById('popup-close-btn'),
    stepAuth: document.getElementById('step-auth'),
    stepConfirm: document.getElementById('step-confirm'),
    stepSuccess: document.getElementById('step-success'),

    popupSelectedClass: document.getElementById('popup-selected-class'),
    remainingSeats: document.getElementById('remaining-seats'),
    remainingTime: document.getElementById('remaining-time'),
    studentNameInput: document.getElementById('student-name-input'),
    phoneInput: document.getElementById('phone-input'),
    otpRow: document.getElementById('otp-row'),
    otpInput: document.getElementById('otp-input'),
    resendOtpBtn: document.getElementById('resend-otp-btn'),
    demoOtpHint: document.getElementById('demo-otp-hint'),
    loginError: document.getElementById('login-error'),
    popupActionBtn: document.getElementById('popup-action-btn'),

    confirmCourseTitle: document.getElementById('confirm-course-title'),
    confirmClassSchedule: document.getElementById('confirm-class-schedule'),
    confirmPhone: document.getElementById('confirm-phone'),
    confirmHighlights: document.getElementById('confirm-highlights'),
    confirmPrice: document.getElementById('confirm-price'),
    completeEnrollBtn: document.getElementById('complete-enroll-btn'),

    ticketOrderId: document.getElementById('ticket-order-id'),
    ticketStudent: document.getElementById('ticket-student'),
    ticketClass: document.getElementById('ticket-class'),
    ticketSchedule: document.getElementById('ticket-schedule'),
    doneBtn: document.getElementById('done-btn'),
    toast: document.getElementById('toast'),
  };

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      els.toast.classList.add('hidden');
    }, 2600);
  }

  function formatOrdinal(num) {
    const mod100 = num % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  function syncMobileBar() {
    if (!state.course) return;
    els.mobileBarFee.textContent = `₹${state.course.price}`;
    els.mobileBarOrig.textContent = `₹${state.course.originalPrice}`;
    if (state.enrolled) {
      els.mobileBarSub.textContent = `Enrolled in Class ${state.selectedClass}`;
      els.mobileEnrollBtn.textContent = 'Enrolled ✓';
      els.mobileEnrollBtn.disabled = true;
    } else if (state.selectedClass) {
      els.mobileBarSub.textContent = `Selected: Class ${state.selectedClass}`;
      els.mobileEnrollBtn.textContent = 'Enroll Now';
    } else {
      els.mobileBarSub.textContent = 'Select a class to join';
      els.mobileEnrollBtn.textContent = 'Choose Class';
    }
  }

  function renderCourse() {
    const { course, images } = state;
    if (!course) return;

    els.courseTitle.textContent = course.title;
    els.courseSchedule.textContent = course.schedule;
    els.totalFee.textContent = `₹${course.price}`;
    els.originalFee.textContent = `₹${course.originalPrice}`;
    els.headerEnrollBtn.textContent = `Enroll ₹${course.price}`;
    els.beStudentsCount.textContent = formatOrdinal(course.beStudents);
    els.remainingSeats.textContent = course.remainingSeats;
    state.remainingTimeMs = course.remainingTimeMs || 600000;

    if (images && els.topBannerImg) {
      els.topBannerImg.src = images.topBanner;
    }

    renderClasses();
    renderFaculty();
    renderToppersAndReviews();
    syncMobileBar();
  }

  function renderToppersAndReviews() {
    if (els.reviewsList) {
      els.reviewsList.innerHTML = '';
      (state.reviews || []).forEach((rev) => {
        const item = document.createElement('div');
        item.className = 'review-item';

        const top = document.createElement('div');
        top.className = 'review-top';

        const author = document.createElement('div');
        author.className = 'review-author';
        const avatar = document.createElement('img');
        avatar.src = rev.avatar;
        avatar.alt = rev.name;
        avatar.className = 'review-avatar';
        const meta = document.createElement('div');
        meta.innerHTML = `<div class="review-name"></div><div class="review-date"></div>`;
        meta.querySelector('.review-name').textContent = rev.name;
        meta.querySelector('.review-date').textContent = rev.date;
        author.appendChild(avatar);
        author.appendChild(meta);

        const stars = document.createElement('div');
        stars.className = 'review-stars';
        stars.textContent = '★★★★★';

        top.appendChild(author);
        top.appendChild(stars);

        const text = document.createElement('p');
        text.className = 'review-text';
        text.textContent = rev.text;

        item.appendChild(top);
        item.appendChild(text);
        els.reviewsList.appendChild(item);
      });
    }

    if (els.toppersGrid) {
      els.toppersGrid.innerHTML = '';
      (state.toppers || []).forEach((tp) => {
        const card = document.createElement('div');
        card.className = 'topper-item';

        const photo = document.createElement('img');
        photo.src = tp.photo;
        photo.alt = tp.name;
        photo.className = 'topper-photo';

        const body = document.createElement('div');
        body.innerHTML = `
          <div class="topper-name"></div>
          <div class="topper-grade"></div>
          <span class="topper-score"></span>
          <p class="topper-quote"></p>
        `;
        body.querySelector('.topper-name').textContent = tp.name;
        body.querySelector('.topper-grade').textContent = tp.grade;
        body.querySelector('.topper-score').textContent = tp.score;
        body.querySelector('.topper-quote').textContent = tp.quote;

        card.appendChild(photo);
        card.appendChild(body);
        els.toppersGrid.appendChild(card);
      });
    }
  }

  function renderFaculty() {
    if (els.facultyStats) {
      els.facultyStats.innerHTML = '';
      (state.facultyStats || []).forEach((stat) => {
        const card = document.createElement('div');
        card.className = 'faculty-stat-card';
        card.innerHTML = `<div class="faculty-stat-value"></div><div class="faculty-stat-label"></div>`;
        card.querySelector('.faculty-stat-value').textContent = stat.value;
        card.querySelector('.faculty-stat-label').textContent = stat.label;
        els.facultyStats.appendChild(card);
      });
    }

    if (els.facultyTrack) {
      els.facultyTrack.innerHTML = '';
      (state.faculty || []).forEach((t) => {
        const card = document.createElement('article');
        card.className = 'faculty-card';

        const badge = document.createElement('span');
        badge.className = 'faculty-badge';
        badge.textContent = t.badge;

        const photoWrap = document.createElement('div');
        photoWrap.className = 'faculty-photo-wrap';
        const img = document.createElement('img');
        img.src = t.photo;
        img.alt = `${t.name} - ${t.role}`;
        img.className = 'faculty-photo';
        photoWrap.appendChild(img);

        const name = document.createElement('h3');
        name.className = 'faculty-name';
        name.textContent = t.name;

        const role = document.createElement('p');
        role.className = 'faculty-role';
        role.textContent = t.role;

        const exp = document.createElement('p');
        exp.className = 'faculty-exp';
        exp.textContent = t.experience;

        const bio = document.createElement('p');
        bio.className = 'faculty-bio';
        bio.textContent = t.bio;

        card.appendChild(badge);
        card.appendChild(photoWrap);
        card.appendChild(name);
        card.appendChild(role);
        card.appendChild(exp);
        card.appendChild(bio);
        els.facultyTrack.appendChild(card);
      });
    }
  }

  function renderClasses() {
    const { classes, soldOutClasses } = state.course;
    els.classList.innerHTML = '';

    classes.forEach((cls) => {
      const isSoldOut = soldOutClasses.includes(cls);
      const li = document.createElement('li');
      li.className = 'class-item';
      if (isSoldOut) li.classList.add('soldOut');
      if (state.selectedClass === cls) li.classList.add('active');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'class-name';
      nameSpan.textContent = `Class ${cls}`;
      li.appendChild(nameSpan);

      if (isSoldOut) {
        const markSpan = document.createElement('span');
        markSpan.className = 'class-mark';
        markSpan.textContent = '(sold out)';
        li.appendChild(markSpan);
      }

      if (!isSoldOut) {
        li.addEventListener('click', () => {
          if (state.enrolled) return;
          state.selectedClass = cls;
          renderClasses();
          syncMobileBar();
        });
      }

      els.classList.appendChild(li);
    });
  }

  function startOrderBubbles() {
    function showNext() {
      if (!state.orderBubbles.length) return;
      const item = state.orderBubbles[state.bubbleIdx % state.orderBubbles.length];
      state.bubbleIdx += 1;

      const bubble = document.createElement('div');
      bubble.className = 'bubble';

      const avatar = document.createElement('img');
      avatar.src = item.avatar;
      avatar.alt = item.name;
      avatar.className = 'avatar';

      const msg = document.createElement('span');
      msg.className = 'msg';
      msg.textContent = `${item.name} (${item.city}) joined Class ${item.classNum}`;

      bubble.appendChild(avatar);
      bubble.appendChild(msg);
      els.orderBubbleWrap.innerHTML = '';
      els.orderBubbleWrap.appendChild(bubble);

      setTimeout(() => {
        bubble.classList.add('leaving');
      }, 2800);
    }

    showNext();
    setInterval(showNext, 3600);
  }

  function startPayCountdown() {
    clearInterval(state.countdownTimer);
    let msLeft = state.remainingTimeMs;

    function updateDisplay() {
      const totalSec = Math.floor(msLeft / 1000);
      const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const secs = String(totalSec % 60).padStart(2, '0');
      const tenths = Math.floor((msLeft % 1000) / 100);
      els.remainingTime.textContent = `${mins}:${secs}.${tenths}`;
    }

    updateDisplay();
    state.countdownTimer = setInterval(() => {
      msLeft = Math.max(0, msLeft - 100);
      state.remainingTimeMs = msLeft;
      updateDisplay();
      if (msLeft === 0) clearInterval(state.countdownTimer);
    }, 100);
  }

  function startOtpCooldown() {
    clearInterval(state.otpCooldownTimer);
    state.otpCooldown = 30;
    els.resendOtpBtn.disabled = true;
    els.resendOtpBtn.textContent = `Resend OTP (${state.otpCooldown}s)`;

    state.otpCooldownTimer = setInterval(() => {
      state.otpCooldown -= 1;
      if (state.otpCooldown <= 0) {
        clearInterval(state.otpCooldownTimer);
        els.resendOtpBtn.disabled = false;
        els.resendOtpBtn.textContent = 'Resend OTP';
      } else {
        els.resendOtpBtn.textContent = `Resend OTP (${state.otpCooldown}s)`;
      }
    }, 1000);
  }

  function triggerEnrollAttempt() {
    if (state.enrolled) return;
    if (!state.selectedClass) {
      els.choosePanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      els.choosePanel.classList.remove('shake');
      void els.choosePanel.offsetWidth;
      els.choosePanel.classList.add('shake');
      showToast('Please select a class first!');
      return;
    }
    openPopup();
  }

  function openPopup() {
    els.loginError.textContent = '';
    els.popupSelectedClass.textContent = `Selected: Class ${state.selectedClass}`;
    els.stepAuth.classList.remove('hidden');
    els.stepConfirm.classList.add('hidden');
    els.stepSuccess.classList.add('hidden');
    els.popup.classList.remove('hidden');
    startPayCountdown();
  }

  function closePopup() {
    els.popup.classList.add('hidden');
    clearInterval(state.countdownTimer);
  }

  async function handleSendOtp() {
    const rawPhone = els.phoneInput.value.replace(/\D/g, '');
    els.loginError.textContent = '';

    if (!/^[6-9]\d{9}$/.test(rawPhone)) {
      els.loginError.textContent = 'Enter a valid 10-digit mobile number starting with 6–9.';
      els.phoneInput.focus();
      return;
    }

    state.phone = rawPhone;
    state.studentName = els.studentNameInput.value.trim();
    els.popupActionBtn.disabled = true;

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: rawPhone }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        els.loginError.textContent = data.error || 'Could not send OTP.';
        return;
      }

      state.otpSent = true;
      els.otpRow.classList.remove('hidden');
      els.demoOtpHint.textContent = `Demo Mode OTP: ${data.demoOtp} (No SMS configured)`;
      els.demoOtpHint.classList.remove('hidden');
      els.popupActionBtn.textContent = 'Verify OTP & Continue';
      els.otpInput.focus();
      startOtpCooldown();
    } catch {
      els.loginError.textContent = 'Network error while sending OTP.';
    } finally {
      els.popupActionBtn.disabled = false;
    }
  }

  async function handleVerifyOtp() {
    const otp = els.otpInput.value.trim();
    els.loginError.textContent = '';

    if (!/^\d{4}$/.test(otp)) {
      els.loginError.textContent = 'Please enter the 4-digit OTP.';
      els.otpInput.focus();
      return;
    }

    els.popupActionBtn.disabled = true;
    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: state.phone, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        els.loginError.textContent = data.error || 'Invalid OTP.';
        return;
      }

      state.verifiedToken = data.token;
      showConfirmStep();
    } catch {
      els.loginError.textContent = 'Network error while verifying OTP.';
    } finally {
      els.popupActionBtn.disabled = false;
    }
  }

  function showConfirmStep() {
    const { course, selectedClass, phone } = state;
    els.confirmCourseTitle.textContent = course.title;
    els.confirmClassSchedule.textContent = `Class ${selectedClass} • ${course.schedule}`;
    els.confirmPhone.textContent = `+91 ${phone}`;
    els.confirmPrice.textContent = `₹${course.price}`;
    els.completeEnrollBtn.textContent = `Pay ₹${course.price} & Complete Enrollment`;

    els.confirmHighlights.innerHTML = '';
    (course.highlights || []).forEach((hl) => {
      const div = document.createElement('div');
      div.className = 'confirm-highlight-item';
      div.textContent = `✓ ${hl.title} — ${hl.desc}`;
      els.confirmHighlights.appendChild(div);
    });

    els.stepAuth.classList.add('hidden');
    els.stepConfirm.classList.remove('hidden');
  }

  async function handleCompleteEnroll() {
    els.completeEnrollBtn.disabled = true;
    try {
      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: state.phone,
          token: state.verifiedToken,
          classGrade: state.selectedClass,
          studentName: state.studentName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error || 'Enrollment failed.');
        return;
      }

      state.enrolled = true;
      els.beStudentsCount.textContent = formatOrdinal(data.beStudents);
      els.enrollBtn.textContent = 'Enrolled ✓';
      els.enrollBtn.disabled = true;
      els.headerEnrollBtn.textContent = 'Enrolled ✓';
      syncMobileBar();

      els.ticketOrderId.textContent = data.order.orderId;
      els.ticketStudent.textContent = data.order.studentName;
      els.ticketClass.textContent = `Class ${data.order.classGrade}`;
      els.ticketSchedule.textContent = data.order.schedule;

      els.stepConfirm.classList.add('hidden');
      els.stepSuccess.classList.remove('hidden');
    } catch {
      showToast('Network error during enrollment.');
    } finally {
      els.completeEnrollBtn.disabled = false;
    }
  }

  function bindEvents() {
    els.enrollBtn.addEventListener('click', triggerEnrollAttempt);
    els.headerEnrollBtn.addEventListener('click', triggerEnrollAttempt);
    els.mobileEnrollBtn.addEventListener('click', triggerEnrollAttempt);

    els.popupMask.addEventListener('click', closePopup);
    els.popupCloseBtn.addEventListener('click', closePopup);
    els.doneBtn.addEventListener('click', closePopup);

    els.popupActionBtn.addEventListener('click', () => {
      if (!state.otpSent) {
        handleSendOtp();
      } else {
        handleVerifyOtp();
      }
    });

    els.resendOtpBtn.addEventListener('click', handleSendOtp);
    els.completeEnrollBtn.addEventListener('click', handleCompleteEnroll);

    if (els.facultyPrev && els.facultyNext && els.facultyTrack) {
      els.facultyPrev.addEventListener('click', () => {
        els.facultyTrack.scrollBy({ left: -270, behavior: 'smooth' });
      });
      els.facultyNext.addEventListener('click', () => {
        els.facultyTrack.scrollBy({ left: 270, behavior: 'smooth' });
      });
    }

    els.phoneInput.addEventListener('input', () => {
      state.otpSent = false;
      state.verifiedToken = null;
      els.otpRow.classList.add('hidden');
      els.demoOtpHint.classList.add('hidden');
      els.popupActionBtn.textContent = 'Send OTP & Continue';
    });
  }

  const LAB_TABS = {
    day12: {
      title: 'Day 1–2: Speed Math & Vedic Number Tricks',
      desc: 'Students master 10x faster multiplication, instant squaring, and mental calculation shortcuts that save huge time in school & Olympiad exams.',
      chips: ['Vedic Shortcuts', 'Live Poll Races', 'Practice E-Book'],
    },
    day34: {
      title: 'Day 3–4: Visual Science & Logical Reasoning',
      desc: 'IIT/NIT Master Teachers break down tricky Physics, Chemistry & Science concepts using animated experiments and real-time doubt clearing.',
      chips: ['Visual Models', '1-on-1 Mentor Help', 'Concept Sheets'],
    },
    day56: {
      title: 'Day 5–6: All-India Mock Olympiad & Finale',
      desc: 'Full-length timed Olympiad mock challenge with live leaderboard rankings, personalized score analysis, and verified completion certificate.',
      chips: ['All-India Rank', 'Detailed Report', 'Verified Certificate'],
    },
  };

  function setupInteractivePreview() {
    const tabs = document.querySelectorAll('.lab-tab');
    const panel = document.getElementById('lab-panel-content');
    if (!tabs.length || !panel) return;

    function renderTab(key) {
      const item = LAB_TABS[key];
      if (!item) return;
      panel.innerHTML = `
        <h3 class="lab-panel-title"></h3>
        <p class="lab-panel-desc"></p>
        <div class="lab-chips"></div>
      `;
      panel.querySelector('.lab-panel-title').textContent = item.title;
      panel.querySelector('.lab-panel-desc').textContent = item.desc;
      const chipsEl = panel.querySelector('.lab-chips');
      item.chips.forEach((chipText) => {
        const span = document.createElement('span');
        span.className = 'lab-chip';
        span.textContent = `✓ ${chipText}`;
        chipsEl.appendChild(span);
      });
    }

    tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        renderTab(btn.dataset.tab);
      });
    });

    renderTab('day12');

    const quizBtns = document.querySelectorAll('.quiz-opt-btn');
    const quizFeedback = document.getElementById('mini-quiz-feedback');
    const quizScore = document.getElementById('mini-quiz-score');
    quizBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        quizBtns.forEach((b) => b.classList.remove('is-correct', 'is-wrong'));
        const isCorrect = btn.dataset.answer === 'correct';
        btn.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
        if (quizFeedback) {
          quizFeedback.classList.remove('hidden');
          quizFeedback.textContent = isCorrect
            ? '🎉 Correct! Trick: 5 × (5 + 1) = 30, append 25 → 3025 in 2 seconds!'
            : '💡 Almost! Vedic Trick: Multiply 5 × 6 = 30 and append 25 → 3025!';
        }
        if (quizScore) {
          quizScore.textContent = isCorrect ? '+50 Bonus Coins!' : 'Try B) 3025!';
        }
      });
    });
  }

  async function init() {
    bindEvents();
    setupInteractivePreview();

    try {
      const res = await fetch('/api/course');
      const data = await res.json();
      if (data.ok) {
        state.course = data.course;
        state.images = data.images;
        state.facultyStats = data.facultyStats || [];
        state.faculty = data.faculty || [];
        state.toppers = data.toppers || [];
        state.reviews = data.reviews || [];
        state.orderBubbles = data.orderBubbles || [];
        renderCourse();
        startOrderBubbles();
      }
    } catch {
      showToast('Failed to load course details.');
    }
  }

  init();
})();
