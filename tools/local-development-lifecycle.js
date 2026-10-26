'use strict';

function watchForegroundParent(parentPid, runtime = process, schedule = setInterval) {
	if (!Number.isSafeInteger(parentPid) || parentPid <= 1 || parentPid === runtime.pid) {
		throw new Error('Invalid foreground startup parent.');
	}
	const timer = schedule(() => {
		try {
			runtime.kill(parentPid, 0);
		} catch (error) {
			if (error.code !== 'ESRCH') throw error;
			// Simulator/socket workers exit when their parent IPC channel disconnects.
			runtime.exit(0);
		}
	}, 500);
	timer.unref();
	return timer;
}

module.exports = { watchForegroundParent };
