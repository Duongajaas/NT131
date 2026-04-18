import type { AuthUser } from '../types/contracts';

const AUTH_STORAGE_KEY = 'nt131.auth.session';

export interface StoredAuthSession {
	token: string;
	refreshToken: string;
	user: AuthUser;
}

export const readStoredAuthSession = (): StoredAuthSession | undefined => {
	try {
		const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
		if (!raw) {
			return undefined;
		}

		const parsed = JSON.parse(raw) as Partial<StoredAuthSession>;
		if (!parsed.token || !parsed.refreshToken || !parsed.user) {
			return undefined;
		}

		return {
			token: parsed.token,
			refreshToken: parsed.refreshToken,
			user: parsed.user
		};
	} catch {
		return undefined;
	}
};

export const saveStoredAuthSession = (session: StoredAuthSession) => {
	window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
};

export const clearStoredAuthSession = () => {
	window.localStorage.removeItem(AUTH_STORAGE_KEY);
};