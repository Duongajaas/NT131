export type FrontendRole = 'admin' | 'operator';

interface TokenPayload {
	role?: unknown;
}

const decodeBase64Url = (value: string) => {
	const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
	return window.atob(padded);
};

export const decodeRoleFromToken = (authToken: string): FrontendRole | undefined => {
	if (!authToken) {
		return undefined;
	}

	try {
		const payloadSegment = authToken.split('.')[1];
		if (!payloadSegment) {
			return undefined;
		}

		const payload = JSON.parse(decodeBase64Url(payloadSegment)) as TokenPayload;
		if (payload.role === 'admin' || payload.role === 'operator') {
			return payload.role;
		}
	} catch {
		return undefined;
	}

	return undefined;
};
