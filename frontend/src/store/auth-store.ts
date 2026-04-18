import { create } from 'zustand';
import type { AuthPayload, AuthUser, UserRole } from '../types/contracts';
import {
	clearStoredAuthSession,
	readStoredAuthSession,
	saveStoredAuthSession,
	type StoredAuthSession
} from '../lib/auth-session';

interface AuthState {
	isHydrated: boolean;
	token?: string;
	refreshToken?: string;
	user?: AuthUser;
	role?: UserRole;
	hydrate: () => void;
	setSession: (payload: AuthPayload) => void;
	updateToken: (token: string) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
	isHydrated: false,
	token: undefined,
	refreshToken: undefined,
	user: undefined,
	role: undefined,
	hydrate: () => {
		const session = readStoredAuthSession();
		if (!session) {
			set({
				isHydrated: true,
				token: undefined,
				refreshToken: undefined,
				user: undefined,
				role: undefined
			});
			return;
		}

		set({
			isHydrated: true,
			token: session.token,
			refreshToken: session.refreshToken,
			user: session.user,
			role: session.user.role
		});
	},
	setSession: (payload) => {
		saveStoredAuthSession({
			token: payload.token,
			refreshToken: payload.refreshToken,
			user: payload.user
		});
		set({
			token: payload.token,
			refreshToken: payload.refreshToken,
			user: payload.user,
			role: payload.user.role,
			isHydrated: true
		});
	},
	updateToken: (token) => {
		const session = readStoredAuthSession();
		if (!session) {
			set((state) => ({
				token,
				isHydrated: true,
				refreshToken: state.refreshToken,
				user: state.user,
				role: state.role
			}));
			return;
		}

		const nextSession: StoredAuthSession = {
			...session,
			token
		};

		saveStoredAuthSession(nextSession);
		set({
			token,
			refreshToken: session.refreshToken,
			user: session.user,
			role: session.user.role,
			isHydrated: true
		});
	},
	logout: () => {
		clearStoredAuthSession();
		set({
			token: undefined,
			refreshToken: undefined,
			user: undefined,
			role: undefined,
			isHydrated: true
		});
	}
}));
