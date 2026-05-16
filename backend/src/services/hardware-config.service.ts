interface HardwareBootstrapConfig {
	socketHost: string;
	socketPort: number;
	socketPath: string;
	simulatorApiKey?: string;
	reconnectIntervalMs: number;
}

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
	if (!value) {
		return fallback;
	}

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
};

export const getHardwareBootstrapConfig = (requestHost?: string): HardwareBootstrapConfig => {
	const socketHost =
		process.env.HARDWARE_SOCKET_HOST?.trim() ||
		requestHost?.trim() ||
		'localhost';

	const socketPort = parsePositiveInteger(
		process.env.HARDWARE_SOCKET_PORT,
		parsePositiveInteger(process.env.PORT, 5000)
	);

	const configuredPath = process.env.HARDWARE_SOCKET_PATH?.trim();
	const socketPath = configuredPath && configuredPath.length > 0 ? configuredPath : '/socket.io';

	const reconnectIntervalMs = parsePositiveInteger(
		process.env.HARDWARE_SOCKET_RECONNECT_INTERVAL_MS,
		5000
	);

	const simulatorApiKey = process.env.SIMULATOR_API_KEY?.trim();

	return {
		socketHost,
		socketPort,
		socketPath,
		simulatorApiKey: simulatorApiKey && simulatorApiKey.length > 0 ? simulatorApiKey : undefined,
		reconnectIntervalMs
	};
};