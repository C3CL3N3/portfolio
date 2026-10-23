// Theme
const toggle = document.getElementById('themeToggle');
const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
const saved = localStorage.getItem('theme');
const current = saved || preferred;
document.documentElement.setAttribute('data-theme', current);
const knob = toggle.querySelector('.knob');
knob.textContent = current === 'dark' ? '☽︎' : '☀︎';
toggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  knob.textContent = next === 'dark' ? '☽︎' : '☀︎';
});

// Hamburger menu
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');
hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileNav.classList.toggle('open');
});
mobileNav.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    hamburger.classList.remove('open');
    mobileNav.classList.remove('open');
  });
});

// Scroll reveal with stagger
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal, .reveal-left').forEach(el => {
  observer.observe(el);
});

// Apply stagger delay to grouped elements
['.lang-item', '.timeline-item', '.project-card', '.contact-card', '.cert-card'].forEach(sel => {
  document.querySelectorAll(sel).forEach((el, i) => {
    el.style.setProperty('--delay', `${i * 0.08}s`);
  });
});

// Education expand (GPA on click)
document.querySelectorAll('.timeline-item.education').forEach(item => {
  item.addEventListener('click', () => {
    item.classList.toggle('open');
  });
});

// Project modal
const overlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');

function openModal(card) {
  document.getElementById('modalTag').textContent = card.dataset.tag || '';
  document.getElementById('modalTitle').textContent = card.dataset.title || '';
  document.getElementById('modalDesc').textContent = card.dataset.desc || '';

  const pills = document.getElementById('modalPills');
  pills.innerHTML = '';
  if (card.dataset.tech) {
    card.dataset.tech.split(',').forEach(t => {
      const span = document.createElement('span');
      span.className = 'modal-pill';
      span.textContent = t.trim();
      pills.appendChild(span);
    });
  }

  const link = document.getElementById('modalLink');
  if (card.dataset.link) {
    link.href = card.dataset.link;
    link.textContent = (card.dataset.linkText || card.dataset.link) + ' →';
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

document.querySelectorAll('div.project-card').forEach(card => {
  card.addEventListener('click', () => openModal(card));
});

modalClose.addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Cursor star particles
(function () {
  const cv = document.createElement('canvas');
  cv.className = 'cursor-particles';
  document.body.appendChild(cv);
  const cx = cv.getContext('2d');

  function resize() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const pts = [];
  let lastT = 0;

  document.addEventListener('mousemove', e => {
    const now = performance.now();
    if (now - lastT < 38) return;
    lastT = now;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const n = 1 + (Math.random() < .4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 18;
      pts.push({
        x:  e.clientX + Math.cos(a) * r,
        y:  e.clientY + Math.sin(a) * r,
        vx: (Math.random() - .5) * .55,
        vy: -.35 - Math.random() * .55,
        sz: .9 + Math.random() * 2.1,
        op: .9 + Math.random() * .1,
        dc: .013 + Math.random() * .013,
        h:  dark ? 195 + Math.random() * 45 : 28 + Math.random() * 28,
        s:  dark ? 72 : 88,
        l:  dark ? 76 + Math.random() * 18 : 52 + Math.random() * 12,
      });
    }
  });

  function loop() {
    cx.clearRect(0, 0, cv.width, cv.height);
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      p.x += p.vx; p.y += p.vy; p.op -= p.dc;
      if (p.op <= 0) { pts.splice(i, 1); continue; }
      const col = `hsla(${p.h},${p.s}%,${p.l}%,${p.op})`;
      cx.save();
      cx.shadowBlur = 6 + p.sz * 3;
      cx.shadowColor = col;
      cx.fillStyle = col;
      cx.beginPath();
      cx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
      cx.fill();
      cx.restore();
    }
    requestAnimationFrame(loop);
  }
  loop();
})();
