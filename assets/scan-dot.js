/* Scanner dot cursor: a blue dot that inverts what is under it
   (yellow on white, blue on black). Matches the dot on the Cargo pages. */
(function () {
  if (window.__scanDot || !matchMedia('(pointer: fine)').matches) return;
  window.__scanDot = true;
  function start() {
    var css = document.createElement('style');
    css.textContent = 'html.has-scan-dot, html.has-scan-dot * { cursor: none !important; }';
    document.head.appendChild(css);
    var d = document.createElement('div');
    d.id = 'scan-dot';
    d.style.cssText = 'position:fixed;top:0;left:0;width:48px;height:48px;margin:-24px 0 0 -24px;' +
      'border-radius:50%;background:#0000ff;mix-blend-mode:difference;pointer-events:none;' +
      'z-index:2147483647;transform:translate(-100px,-100px);';
    document.body.appendChild(d);
    document.documentElement.classList.add('has-scan-dot');
    document.addEventListener('mousemove', function (e) {
      d.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
      d.style.display = '';
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { d.style.display = 'none'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
