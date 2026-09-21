/* =========================================================
   Toppers Classroom — home page interactions
   ========================================================= */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- sticky header ---------- */
  var header = $('#siteHeader');
  var toTop = $('#toTop');
  var onScroll = function () {
    var y = window.pageYOffset;
    header.classList.toggle('is-stuck', y > 20);
    toTop.classList.toggle('show', y > 600);
  };
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });
  onScroll();

  /* ---------- mobile menu ---------- */
  var burger = $('#burger');
  var nav = $('#mainNav');
  var scrim = $('#navScrim');

  var setMenu = function (open) {
    nav.classList.toggle('open', open);
    burger.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('show', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('no-scroll', open);
    if (!open) nav.scrollTop = 0;
  };

  burger.addEventListener('click', function () {
    setMenu(!nav.classList.contains('open'));
  });

  var closeMenu = function () { setMenu(false); };
  if (scrim) scrim.addEventListener('click', closeMenu);

  // a drawer left open across the desktop breakpoint would lock body scroll
  window.addEventListener('resize', function () {
    if (window.innerWidth > 1024 && nav.classList.contains('open')) closeMenu();
  });

  /* ---------- dropdowns (click on touch / mobile) ---------- */
  $$('.has-drop > .drop-toggle').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (window.innerWidth > 1024) return;
      e.preventDefault();
      var li = btn.parentElement;
      var open = li.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  /* ---------- smooth anchor scroll + active link ---------- */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  });

  /* ---------- scroll reveal ---------- */
  var revealables = $$('[data-reveal]');
  if (!('IntersectionObserver' in window) || reduced) {
    revealables.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.style.transitionDelay = (el.dataset.revealDelay || 0) + 'ms';
        el.classList.add('in');
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------- animated counters ---------- */
  var counters = $$('.counter');
  var fmt = function (n) { return n.toLocaleString('en-US'); };
  var runCounter = function (el) {
    var end = parseInt(el.dataset.count, 10) || 0;
    if (reduced) { el.textContent = fmt(end); return; }
    var dur = 1800, start = null;
    var step = function (ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);           // easeOutCubic
      el.textContent = fmt(Math.round(end * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (!('IntersectionObserver' in window)) {
    counters.forEach(runCounter);
  } else {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        runCounter(en.target);
        cio.unobserve(en.target);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- hero parallax ----------
     Uses the `translate` property (not `transform`) so it composes with the
     float keyframes, and never puts a transform on an ancestor of the
     screen-blended founder photo (a transform would isolate the blend). */
  var hero = $('.hero');
  var layers = [
    { el: $('.arc'),        d: 6  },
    { el: $('.arc-ring'),   d: 10 },
    { el: $('.books'),      d: 16 },
    { el: $('.laptop'),     d: 22 },
    { el: $('.mug'),        d: 26 },
    { el: $('.path-badge'), d: 30 }
  ].filter(function (l) { return l.el; });

  if (hero && layers.length && !reduced && window.matchMedia('(pointer:fine)').matches) {
    var raf = null, mx = 0, my = 0;
    var paint = function () {
      layers.forEach(function (l) {
        l.el.style.translate = (mx * l.d) + 'px ' + (my * l.d * 0.7) + 'px';
      });
      raf = null;
    };
    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * -1;
      my = ((e.clientY - r.top) / r.height - 0.5) * -1;
      if (!raf) raf = requestAnimationFrame(paint);
    });
    hero.addEventListener('mouseleave', function () {
      mx = my = 0;
      if (!raf) raf = requestAnimationFrame(paint);
    });
  }

  /* ---------- video modal ---------- */
  var modal = $('#videoModal');
  var frame = $('#vmFrame');
  var lastFocus = null;

  /* Normal share/watch URLs (facebook.com/reel/…, youtube.com/watch?v=…) are
     ordinary web pages, and those providers send X-Frame-Options / CSP
     frame-ancestors that forbid framing them — the browser then shows
     "refused to connect". Each provider has a separate embed endpoint that
     IS allowed to be framed, so map the pasted URL onto it. */
  var toEmbed = function (raw) {
    var url = String(raw || '').trim();
    var m;

    // already an embed endpoint - leave it alone
    if (/\/(embed|plugins\/video\.php|player)/.test(url)) return { src: url, portrait: false };

    // direct video file
    if (/\.(mp4|webm|ogv)(\?|$)/i.test(url)) return { src: url, file: true, portrait: false };

    // YouTube: watch?v= / youtu.be / shorts
    m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/);
    if (m) {
      return {
        src: 'https://www.youtube-nocookie.com/embed/' + m[1] + '?autoplay=1&rel=0',
        portrait: /shorts\//.test(url)
      };
    }

    // Vimeo
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return { src: 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1', portrait: false };

    // Facebook reels / videos / watch -> official video plugin
    if (/facebook\.com|fb\.watch/.test(url)) {
      return {
        src: 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(url) +
             '&show_text=false&autoplay=true',
        fb: true,
        portrait: /\/reel\//.test(url)
      };
    }

    return { src: url, portrait: false };
  };

  var openVideo = function (raw) {
    var v = toEmbed(raw);
    lastFocus = document.activeElement;

    // reels/shorts are vertical - a 16:9 frame would pillarbox them badly
    modal.classList.toggle('is-portrait', !!v.portrait);

    // Show first so the frame has a measured width. Facebook's plugin renders
    // at a FIXED pixel width and does not scale to its iframe, so without an
    // explicit &width it overflows on phones - the video gets clipped on the
    // right and spills past the bottom.
    modal.hidden = false;
    document.body.classList.add('no-scroll');

    var src = v.src;
    if (v.fb) {
      var w = Math.round(frame.clientWidth) || 500;
      src += '&width=' + Math.min(1920, Math.max(220, w));
    }

    frame.innerHTML = v.file
      ? '<video src="' + src + '" controls autoplay playsinline ' +
        'title="Toppers Classroom promotional video"></video>'
      : '<iframe src="' + src +
        '" title="Toppers Classroom promotional video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';

    $('.vm-close', modal).focus();
  };

  var closeVideo = function () {
    modal.hidden = true;
    frame.innerHTML = '';
    document.body.classList.remove('no-scroll');
    if (lastFocus) lastFocus.focus();
  };

  $$('.js-play').forEach(function (btn) {
    btn.addEventListener('click', function () { openVideo(btn.dataset.video); });
  });
  $$('[data-close]', modal).forEach(function (el) {
    el.addEventListener('click', closeVideo);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) closeVideo();
    else if (nav.classList.contains('open')) closeMenu();
  });

  /* ---------- back to top ---------- */
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });

  /* ---------- scroll spy ----------
     Picks the section nearest the top of the viewport rather than trusting
     observer callback order — with a short page (or a tall window) several
     sections intersect at once and the last one would wrongly win. */
  var spyTargets = $$('main section[id]').filter(function (s) {
    return $('.nav-link[href="#' + s.id + '"]');
  });
  if (spyTargets.length) {
    var syncSpy = function () {
      var best = null, bestDist = Infinity;
      spyTargets.forEach(function (s) {
        var top = s.getBoundingClientRect().top - 120;
        var dist = top <= 0 ? -top : top * 3;   // prefer sections already passed
        if (dist < bestDist) { bestDist = dist; best = s; }
      });
      if (!best) return;
      $$('.nav-link').forEach(function (l) { l.classList.remove('is-active'); });
      $('.nav-link[href="#' + best.id + '"]').classList.add('is-active');
    };
    window.addEventListener('scroll', function () {
      if (!spyTick) { spyTick = true; requestAnimationFrame(function () { syncSpy(); spyTick = false; }); }
    }, { passive: true });
    var spyTick = false;
    syncSpy();
  }

  /* ---------- contact form ----------
     Validates in the browser, then POSTs the fields to the Cloudflare Worker
     declared on the <form data-endpoint> attribute (see
     /cloudflare-worker/contact-worker.js), which relays the message to the
     team inbox through Resend. If that request fails the visitor is offered
     a mailto: fallback so the message is never lost. */
  var cForm = $('#contactForm');
  if (cForm) {
    var CONTACT_TO = 'romancebcc1573@gmail.com';
    var ENDPOINT   = cForm.getAttribute('data-endpoint') || '';
    var cStatus    = $('#cfStatus');
    var cBtn       = $('#cfSubmit');
    var cBtnLabel  = $('.cf-btn-label', cForm);
    var sending    = false;

    var setError = function (input, msg) {
      var field = input.closest('.cf-field');
      field.classList.toggle('invalid', !!msg);
      var slot = $('.cf-error', field);
      if (slot) slot.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    };

    var validate = function () {
      var name = $('#cf-name'), phone = $('#cf-phone'),
          email = $('#cf-email'), msg = $('#cf-message');
      var ok = true;

      ok = setError(name, name.value.trim().length < 2 ? 'Please enter your name.' : '') && ok;

      // BD mobile numbers are 11 digits; allow +880 and separators
      var digits = phone.value.replace(/\D/g, '');
      ok = setError(phone, digits.length < 10 ? 'Please enter a valid phone number.' : '') && ok;

      ok = setError(email, email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
             ? 'Please enter a valid email address.' : '') && ok;

      ok = setError(msg, msg.value.trim().length < 10 ? 'Please write at least a short message.' : '') && ok;
      return ok;
    };

    $$('input, select, textarea', cForm).forEach(function (el) {
      if (el.type === 'hidden' || el.name === 'honey') return;
      el.addEventListener('blur', validate);
      el.addEventListener('input', function () {
        var f = el.closest('.cf-field');
        if (f && f.classList.contains('invalid')) validate();
      });
    });

    var say = function (text, kind) {
      cStatus.innerHTML = text;
      cStatus.className = 'cf-status show ' + kind;
    };

    var busy = function (on) {
      sending = on;
      if (cBtn) { cBtn.disabled = on; cBtn.classList.toggle('is-sending', on); }
      if (cBtnLabel) cBtnLabel.textContent = on ? 'Sending…' : 'Send Message';
    };

    // Everything the team needs, in the order it should read in the inbox.
    var payload = function () {
      return {
        name:    $('#cf-name').value.trim(),
        phone:   $('#cf-phone').value.trim(),
        email:   $('#cf-email').value.trim(),
        topic:   $('#cf-topic').value,
        message: $('#cf-message').value.trim(),
        honey:   cForm.querySelector('[name="honey"]').value
      };
    };

    var mailtoLink = function (d) {
      var subject = '[Website] ' + d.topic + ' — ' + d.name;
      var body = [
        'Name: ' + d.name,
        'Phone: ' + d.phone,
        'Email: ' + (d.email || '(not given)'),
        'Topic: ' + d.topic,
        '',
        d.message
      ].join('\n');
      return 'mailto:' + CONTACT_TO +
             '?subject=' + encodeURIComponent(subject) +
             '&body=' + encodeURIComponent(body);
    };

    cForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;

      if (!validate()) {
        say('Please correct the highlighted fields.', 'err');
        var bad = $('.cf-field.invalid input, .cf-field.invalid textarea', cForm);
        if (bad) bad.focus();
        return;
      }

      // honeypot filled = bot; pretend it worked and drop it
      var honey = cForm.querySelector('[name="honey"]');
      if (honey && honey.value) { say('Thank you! Your message has been sent.', 'ok'); cForm.reset(); return; }

      var data = payload();

      if (!ENDPOINT || !window.fetch) {           // very old browser, or no endpoint set
        window.location.href = mailtoLink(data);
        say('Opening your email app… if nothing happens, please call 01919-311573.', 'ok');
        return;
      }

      busy(true);
      say('Sending your message…', '');

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || !body.ok) throw new Error(body.message || ('HTTP ' + res.status));
          return body;
        });
      })
      .then(function () {
        busy(false);
        cForm.reset();
        $$('.cf-field.invalid', cForm).forEach(function (f) { f.classList.remove('invalid'); });
        say('Thank you! Your message has been sent — our team will reply shortly.', 'ok');
      })
      .catch(function () {
        busy(false);
        say('Sorry, the message could not be sent. ' +
            '<a href="' + mailtoLink(data) + '">Send it by email instead</a> ' +
            'or call <a href="tel:+8801919311573">01919-311573</a>.', 'err');
      });
    });
  }

  /* ---------- reading progress (blog details page only) ---------- */
  var progress = $("#readProgress span");
  if (progress) {
    var syncProgress = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      progress.style.width = (max > 0 ? (window.pageYOffset / max) * 100 : 0) + "%";
    };
    var pTick = false;
    window.addEventListener("scroll", function () {
      if (pTick) return;
      pTick = true;
      requestAnimationFrame(function () { syncProgress(); pTick = false; });
    }, { passive: true });
    window.addEventListener("resize", syncProgress);
    syncProgress();
  }

  /* ---------- course category tabs (mobile) ---------- */
  var courseTabs = $$('.course-tabs .course-tab');
  if (courseTabs.length) {
    var courseCards = $$('#courses .c-card');
    var applyFilter = function (tab) {
      courseTabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');

      var filter = tab.getAttribute('data-filter');
      courseCards.forEach(function (card) {
        card.hidden = card.getAttribute('data-category') !== filter;
      });
    };
    courseTabs.forEach(function (tab) {
      tab.addEventListener('click', function () { applyFilter(tab); });
    });
    applyFilter($('.course-tabs .course-tab.is-active') || courseTabs[0]);
  }

  /* ---------- testimonial slider (autoplay loop) ---------- */
  var testiTrack = $('#testiTrack');
  if (testiTrack) {
    var testiCards = $$('.testi-card', testiTrack);
    var testiPrev = $('#testiPrev');
    var testiNext = $('#testiNext');
    var testiDotsWrap = $('#testiDots');
    var testiActive = 0;
    var testiTimer = null;

    testiCards.forEach(function (_, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
      dot.addEventListener('click', function () { goTesti(i); restartAutoplay(); });
      testiDotsWrap.appendChild(dot);
    });
    var testiDots = $$('button', testiDotsWrap);

    var goTesti = function (i) {
      var card = testiCards[(i + testiCards.length) % testiCards.length];
      testiTrack.scrollTo({ left: card.offsetLeft - testiTrack.offsetLeft, behavior: reduced ? 'auto' : 'smooth' });
    };

    var syncTesti = function () {
      var best = Infinity;
      testiCards.forEach(function (card, i) {
        var d = Math.abs((card.offsetLeft - testiTrack.offsetLeft) - testiTrack.scrollLeft);
        if (d < best) { best = d; testiActive = i; }
      });
      testiDots.forEach(function (d, i) { d.classList.toggle('is-active', i === testiActive); });
    };

    // loops past either end instead of stopping, so autoplay never has to halt
    var stepTesti = function (dir) { goTesti(testiActive + dir); };

    var startAutoplay = function () {
      if (reduced || testiCards.length < 2) return;
      stopAutoplay();
      testiTimer = setInterval(function () { stepTesti(1); }, 4500);
    };
    var stopAutoplay = function () { if (testiTimer) { clearInterval(testiTimer); testiTimer = null; } };
    var restartAutoplay = function () { stopAutoplay(); startAutoplay(); };

    testiPrev.addEventListener('click', function () { stepTesti(-1); restartAutoplay(); });
    testiNext.addEventListener('click', function () { stepTesti(1); restartAutoplay(); });

    testiTrack.addEventListener('mouseenter', stopAutoplay);
    testiTrack.addEventListener('mouseleave', startAutoplay);
    testiTrack.addEventListener('touchstart', stopAutoplay, { passive: true });
    testiTrack.addEventListener('touchend', startAutoplay, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopAutoplay(); else startAutoplay();
    });

    var testiTick = false;
    testiTrack.addEventListener('scroll', function () {
      if (testiTick) return;
      testiTick = true;
      requestAnimationFrame(function () { syncTesti(); testiTick = false; });
    }, { passive: true });
    window.addEventListener('resize', syncTesti);
    syncTesti();
    startAutoplay();
  }

  /* ---------- FAQ accordion ---------- */
  var faqItems = $$('.faq-item');
  if (faqItems.length) {
    var closeFaq = function (item) {
      var btn = $('.faq-q', item), panel = $('.faq-a', item);
      item.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (panel) panel.style.height = '0px';
    };

    faqItems.forEach(function (item) {
      var btn = $('.faq-q', item);
      var panel = $('.faq-a', item);
      if (!btn || !panel) return;

      btn.addEventListener('click', function () {
        var isOpen = item.classList.contains('open');
        // one answer at a time, as in the design
        faqItems.forEach(function (other) { if (other !== item) closeFaq(other); });

        if (isOpen) { closeFaq(item); return; }
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        // an explicit px height is what makes the CSS transition animate;
        // 'auto' would jump straight to the end with no tween
        panel.style.height = reduced ? 'auto' : panel.scrollHeight + 'px';
      });
    });

    // a panel left open across a resize keeps a stale pixel height and clips
    window.addEventListener('resize', function () {
      faqItems.forEach(function (item) {
        if (!item.classList.contains('open')) return;
        var panel = $('.faq-a', item);
        if (panel) panel.style.height = panel.scrollHeight + 'px';
      });
    });
  }

  /* ---------- footer year ---------- */
  $('#year').textContent = new Date().getFullYear();
})();
