// The one place Chrome lets an extension ask for an optional permission: a page of its own, on a click (0.6.0).
const FILE_HOST = 'https://gce-lms-resource-prod.s3.us-west-2.amazonaws.com/*';
const status = document.getElementById('status');
const finish = async (granted) => {
  await chrome.runtime.sendMessage({ kind: 'kit-allowed', granted }).catch(() => undefined);
  status.textContent = granted ? 'Allowed. Back in Halo+, the kit carries on by itself; this tab closes.' : 'Not now. The kit lists the files as links instead; this tab closes.';
  if (granted) status.className = 'done';
  setTimeout(() => window.close(), 1600);
};
document.getElementById('allow').addEventListener('click', async () => {
  const granted = await chrome.permissions.request({ origins: [FILE_HOST] }).catch(() => false);
  await finish(!!granted);
});
document.getElementById('later').addEventListener('click', () => void finish(false));
