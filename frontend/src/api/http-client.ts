import axios, { AxiosHeaders, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { clearStoredAuthSession, readStoredAuthSession } from '../lib/auth-session';
import { useAuthStore } from '../store/auth-store';
import type { AuthPayload, ApiEnvelope } from '../types/contracts';

const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL?.trim() || import.meta.env.VITE_API_URL?.trim() || 'http://localhost:5000/api/v1';

interface RequestOptions extends RequestInit {
	token?: string;
	skipAuthRefresh?: boolean;
}

export class ApiError extends Error {
	status: number;
	data?: unknown;

	constructor(message: string, status: number, data?: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.data = data;
	}
}

interface RefreshQueueItem {
	resolve: (token: string) => void;
	reject: (error: unknown) => void;
}

interface AuthenticatedRequestConfig {
	token?: string;
	skipAuthRefresh?: boolean;
}

const apiClient = axios.create({
	baseURL: API_BASE_URL,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json'
	}
});

const refreshClient = axios.create({
	baseURL: API_BASE_URL,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json'
	}
});

let isRefreshing = false;
let failedQueue: RefreshQueueItem[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
	failedQueue.forEach((item) => {
		if (error) {
			item.reject(error);
		} else if (token) {
			item.resolve(token);
		} else {
			item.reject(new Error('Missing refreshed token'));
		}
	});

	failedQueue = [];
};

const isAuthRoute = (url?: string) => {
	return Boolean(url && ['/auth/login', '/auth/register', '/auth/refresh-token'].some((route) => url.includes(route)));
};

const getErrorMessage = (data: unknown, fallback: string) => {
	if (typeof data === 'string' && data.trim()) {
		return data;
	}

	if (
		typeof data === 'object' &&
		data !== null &&
		'message' in data &&
		typeof (data as { message?: unknown }).message === 'string'
	) {
		return (data as { message: string }).message;
	}

	return fallback;
};

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
	const normalizedHeaders = new Headers(headers ?? {});
	return Object.fromEntries(normalizedHeaders.entries());
};

const readCurrentAuthToken = () => {
	const session = useAuthStore.getState();
	return session.token || readStoredAuthSession()?.token;
};

const readCurrentRefreshToken = () => {
	const session = useAuthStore.getState();
	return session.refreshToken || readStoredAuthSession()?.refreshToken;
};

apiClient.interceptors.request.use(
	(config) => {
		const requestConfig = config as InternalAxiosRequestConfig & AuthenticatedRequestConfig;
		const headers = AxiosHeaders.from(requestConfig.headers);

		if (!headers.has('Content-Type')) {
			headers.set('Content-Type', 'application/json');
		}

		if (!headers.has('Authorization') && !requestConfig.skipAuthRefresh) {
			const token = requestConfig.token || readCurrentAuthToken();
			if (token) {
				headers.set('Authorization', `Bearer ${token}`);
			}
		}

		requestConfig.headers = headers;
		return requestConfig;
	},
	(error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
	(response) => response,
	async (error) => {
		const originalRequest = error.config as (typeof error.config & AuthenticatedRequestConfig & { _retry?: boolean }) | undefined;

		if (!originalRequest || error.response?.status !== 401 || originalRequest._retry || isAuthRoute(originalRequest.url)) {
			return Promise.reject(error);
		}

		if (isRefreshing) {
			return new Promise((resolve, reject) => {
				failedQueue.push({ resolve, reject });
			}).then((token) => {
				const headers = (originalRequest.headers ?? {}) as Record<string, string>;
				headers.Authorization = `Bearer ${token}`;
				originalRequest.headers = headers;
				originalRequest._retry = true;
				return apiClient.request(originalRequest);
			});
		}

		const refreshToken = readCurrentRefreshToken();
		if (!refreshToken) {
			clearStoredAuthSession();
			useAuthStore.getState().logout();
			window.location.pathname !== '/login' && window.location.assign('/login');
			return Promise.reject(error);
		}

		originalRequest._retry = true;
		isRefreshing = true;

		try {
			const refreshResponse = await refreshClient.post<ApiEnvelope<AuthPayload>>('/auth/refresh-token', {
				refreshToken
			});
			const refreshedSession = refreshResponse.data.data;
			useAuthStore.getState().setSession(refreshedSession);
			processQueue(null, refreshedSession.token);

			const headers = (originalRequest.headers ?? {}) as Record<string, string>;
			headers.Authorization = `Bearer ${refreshedSession.token}`;
			originalRequest.headers = headers;

			return apiClient.request(originalRequest);
		} catch (refreshError) {
			processQueue(refreshError, null);
			clearStoredAuthSession();
			useAuthStore.getState().logout();
			window.location.pathname !== '/login' && window.location.assign('/login');
			return Promise.reject(refreshError);
		} finally {
			isRefreshing = false;
		}
	}
);

export const requestJson = async <T>(
	path: string,
	options: RequestOptions = {}
): Promise<T> => {
	const headers = normalizeHeaders(options.headers);
	if (!headers['Content-Type']) {
		headers['Content-Type'] = 'application/json';
	}

	if (options.token) {
		headers.Authorization = `Bearer ${options.token}`;
	}

	try {
		const requestConfig = {
			url: path,
			method: options.method ?? 'GET',
			data: options.body ?? undefined,
			headers,
			signal: options.signal ?? undefined,
			token: options.token,
			skipAuthRefresh: options.skipAuthRefresh
		} as AxiosRequestConfig & AuthenticatedRequestConfig;

		const response = await apiClient.request<T>(requestConfig);

		return response.data;
	} catch (error) {
		if (error instanceof ApiError) {
			throw error;
		}

		if (axios.isAxiosError(error)) {
			const responseData = error.response?.data;
			throw new ApiError(
				getErrorMessage(responseData, error.message || 'Request failed'),
				error.response?.status ?? 0,
				responseData
			);
		}

		throw new ApiError(error instanceof Error ? error.message : 'Request failed', 0);
	}
};
