type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
	[key: string]: unknown;
}

const ANSI = {
	reset: '\x1b[0m',
	dim: '\x1b[90m',
	debug: '\x1b[36m',
	info: '\x1b[32m',
	warn: '\x1b[33m',
	error: '\x1b[31m'
} as const;

const supportsColor =
	process.env.NO_COLOR !== '1' &&
	(process.env.FORCE_COLOR === '1' || Boolean(process.stdout.isTTY) || Boolean(process.stderr.isTTY));

const colorize = (text: string, color: string) => {
	if (!supportsColor) {
		return text;
	}

	return `${color}${text}${ANSI.reset}`;
};

const sanitizeLine = (value: string) => value.replace(/\r?\n|\r/g, ' ');

const jsonReplacer = (_key: string, value: unknown) => {
	if (value instanceof Error) {
		return {
			name: value.name,
			message: sanitizeLine(value.message),
			stack: value.stack ? sanitizeLine(value.stack) : undefined
		};
	}

	if (typeof value === 'string') {
		return sanitizeLine(value);
	}

	if (typeof value === 'bigint') {
		return value.toString();
	}

	return value;
};

const normalizeMeta = (meta?: LogMeta) => {
	if (!meta) {
		return undefined;
	}

	return Object.fromEntries(
		Object.entries(meta)
			.filter(([, value]) => value !== undefined)
			.map(([key, value]) => [key, value])
	);
};

const formatMeta = (meta?: LogMeta) => {
	const normalizedMeta = normalizeMeta(meta);
	if (!normalizedMeta) {
		return '';
	}

	try {
		const serialized = JSON.stringify(normalizedMeta, jsonReplacer);
		return serialized && serialized !== '{}'
			? ` ${colorize(serialized, ANSI.dim)}`
			: '';
	} catch {
		return '';
	}
};

const levelColor = (level: LogLevel) => {
	switch (level) {
		case 'debug':
			return ANSI.debug;
		case 'info':
			return ANSI.info;
		case 'warn':
			return ANSI.warn;
		case 'error':
			return ANSI.error;
	}
};

const write = (level: LogLevel, message: string, meta?: LogMeta) => {
	if (level === 'debug' && process.env.NODE_ENV === 'production') {
		return;
	}

	const timestamp = colorize(new Date().toISOString(), ANSI.dim);
	const levelLabel = colorize(`[${level.toUpperCase()}]`, levelColor(level));
	const messageLabel = colorize(sanitizeLine(message), levelColor(level));
	const line = `${timestamp} ${levelLabel} ${messageLabel}${formatMeta(meta)}`;
	const output = `${line}\n`;

	if (level === 'error') {
		process.stderr.write(output);
		return;
	}

	process.stdout.write(output);
};

export const logger = {
	debug: (message: string, meta?: LogMeta) => write('debug', message, meta),
	info: (message: string, meta?: LogMeta) => write('info', message, meta),
	warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
	error: (message: string, meta?: LogMeta) => write('error', message, meta)
};

export default logger;