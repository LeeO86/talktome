const fs = require('node:fs');

function isRunningInContainer(env = process.env) {
  if (env.TALKTOME_RUNNING_IN_CONTAINER === '1') return true;
  if (fs.existsSync('/.dockerenv')) return true;

  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    return /docker|containerd|kubepods|podman/i.test(cgroup);
  } catch {
    return false;
  }
}

module.exports = { isRunningInContainer };
