const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000/api/v1';

interface RequestOptions extends RequestInit {
	token?: string;
}

export const apiRequest = async <T>(
	path: string,
	options: RequestOptions = {}
): Promise<T> => {
	const headers = new Headers(options.headers || {});
	headers.set('Content-Type', 'application/json');

	if (options.token) {
		headers.set('Authorization', `Bearer ${options.token}`);
	}

	const response = await fetch(`${API_BASE_URL}${path}`, {
		...options,
		headers
	});

	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.message || 'Request failed');
	}

	return payload as T;
};
