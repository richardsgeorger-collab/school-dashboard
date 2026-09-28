// The build stamp a current Sync Halo bookmark carries, read off the served sync script (halo-sync.js) of whatever
// site a probe is pointed at. Probes that post synthetic Halo exports stamp them with this, so they are never held on
// the review screen as "an older copy of the bookmark" the day the build moves.
export async function currentBuild(base) {
  const text = await (await fetch(`${base}halo-sync.js?v=${Date.now()}`)).text();
  const build = text.match(/^\/\* Halo\+ sync script, build (\S+)\./)?.[1];
  if (!build) throw new Error(`no sync script at ${base}halo-sync.js; is the preview serving a current build?`);
  return build;
}
