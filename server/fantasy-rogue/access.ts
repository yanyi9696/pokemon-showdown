import { toID } from '../../sim/dex';

/** Only the authentication layer sets registered. A display name is never a beta credential. */
export function rogueAccess(user: Pick<User, 'id' | 'named' | 'connected' | 'registered'>) {
	if (Config.fantasyrogue?.enabled === false) return false;
	// Local preview remains usable, but a production server cannot enable this bypass on a public bind.
	const local = Config.fantasyailocal && ['127.0.0.1', '::1', 'localhost'].includes(Config.bindaddress || '');
	if (!user.connected) return false;
	if (local) return true;
	return !!user.named && !!user.registered && (Config.fantasyrogue?.publicAccess === true ||
		(Config.fantasyrogue?.betaAccounts || []).some(name => toID(name) === user.id));
}
