// The Halo+ app's one screen (Loop 308): how to turn Halo+ on in Safari, and whether it is on.
// The app calls show(platform, enabled) once it knows; buttons ask the app to open Settings, Halo or haloplus.app.
function show(platform, enabled) {
  document.body.classList.add(`platform-${platform}`);
  const on = enabled === true;
  document.body.classList.toggle('is-on', on);
  document.querySelector('.status.on').hidden = !on;
  const first = document.querySelector('[data-step="on"]');
  if (first) first.classList.toggle('done', on);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-do]');
  if (b) webkit.messageHandlers.controller.postMessage(b.dataset.do);
});
