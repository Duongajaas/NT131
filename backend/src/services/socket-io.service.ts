import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { findUserById } from '../repositories/user.repository.ts';
import { verifyToken, type JwtPayload } from '../utills/password.ts';
import logger from '../utills/logger.ts';
import { onRealtimeEvent, publishRealtimeEvent } from './realtime-event-bus.service.ts';
import hardwareGateway from './hardware-gateway.service.ts';
import type { GateCommand, GateCommandLog } from '../types/hardware-gateway.ts';

interface GateCommandRequestPayload {
	gateId: string;
	command: 'open' | 'close';
	sessionId?: string;
	correlationId?: string;
}

interface SimulatorCheckpointPayload {
	plateNumber: string;
	checkpoint: 'entry_rfid' | 'exit_rfid';
	state?: 'arrived' | 'leaving';
	correlationId?: string;
	sessionId?: string;
}

interface SimulatorStagePayload {
	stage: string;
	plateNumber?: string;
	checkpoint?: 'entry_rfid' | 'exit_rfid';
	correlationId?: string;
	sessionId?: string;
}

interface HardwareRfidScanPayload {
	uid: string;
	checkpoint?: 'entry_rfid' | 'exit_rfid';
	correlationId?: string;
	sessionId?: string;
}

type JoinedRoom = 'operator' | 'simulator' | 'hardware';
type GateCommandSource = Exclude<GateCommand['requestedBy'], 'backend'>;

const SUPPORTED_GATE_IDS = ['entry-gate', 'exit-gate'] as const;
const SUPPORTED_GATE_COMMANDS = ['open', 'close'] as const;

let ioServer: Server | null = null;
let unsubscribeRealtimeBridge: (() => void) | null = null;

const parseBearerToken = (authorization?: string): string | null => {
	if (!authorization) {
		return null;
	}

	const [scheme, token] = authorization.split(' ');
	if (scheme !== 'Bearer' || !token) {
		return null;
	}

	return token;
};

const getSocketToken = (socket: {
	handshake: {
		auth: { token?: string };
		headers: { authorization?: string };
	};
}) => {
	const authToken = socket.handshake.auth?.token;
	if (typeof authToken === 'string' && authToken.length > 0) {
		return authToken;
	}

	return parseBearerToken(socket.handshake.headers.authorization);
};

const validateSimulatorKey = (key?: string) => {
	const expected = process.env.SIMULATOR_API_KEY;
	if (!expected) {
		return true;
	}

	return key === expected;
};

const isHardwareHandshake = (socket: Socket) => {
	const clientType = socket.handshake.auth?.clientType ?? socket.handshake.query?.clientType;
	const headerClientType = socket.handshake.headers['x-client-type'];
	return clientType === 'hardware' || clientType === 'esp32' || headerClientType === 'hardware' || headerClientType === 'esp32';
};

const isSupportedGateId = (gateId: string): gateId is (typeof SUPPORTED_GATE_IDS)[number] => {
	return SUPPORTED_GATE_IDS.includes(gateId as (typeof SUPPORTED_GATE_IDS)[number]);
};

const isSupportedGateCommand = (
	command: string
): command is (typeof SUPPORTED_GATE_COMMANDS)[number] => {
	return SUPPORTED_GATE_COMMANDS.includes(command as (typeof SUPPORTED_GATE_COMMANDS)[number]);
};

const buildGateCommand = (
	source: GateCommandSource,
	payload: GateCommandRequestPayload
): GateCommand => ({
	commandId: randomUUID(),
	sessionId: payload.sessionId,
	correlationId: payload.correlationId,
	requestedBy: source,
	timeoutMs: 5000,
	action: payload.command
});

const publishGateCommandEvents = (
	source: GateCommandSource,
	payload: GateCommandRequestPayload,
	gateLog: GateCommandLog
) => {
	publishRealtimeEvent({
		eventName: 'gate.command.sent',
		source,
		correlationId: payload.correlationId,
		sessionId: payload.sessionId,
		payload: {
			gateId: payload.gateId,
			command: payload.command,
			result: gateLog.result,
			state: gateLog.stateAfter,
			commandId: gateLog.commandId,
			reason: source === 'operator' ? 'operator_manual_command' : 'simulator_manual_override'
		}
	});

	publishRealtimeEvent({
		eventName: 'gate.state.changed',
		source: 'hardware-gateway',
		correlationId: payload.correlationId,
		sessionId: payload.sessionId,
		payload: {
			gateId: payload.gateId,
			state: gateLog.stateAfter
		}
	});
};

const executeGateCommand = async ({
	socket,
	payload,
	source,
	actorName,
	ack
}: {
	socket: Socket;
	payload: GateCommandRequestPayload;
	source: GateCommandSource;
	actorName: string;
	ack?: (value: unknown) => void;
}) => {
	if (!payload?.gateId || !payload?.command) {
		ack?.({ success: false, message: 'gateId and command are required' });
		return;
	}

	if (!isSupportedGateId(payload.gateId)) {
		ack?.({ success: false, message: 'Unsupported gateId' });
		return;
	}

	if (!isSupportedGateCommand(payload.command)) {
		ack?.({ success: false, message: 'Unsupported command' });
		return;
	}

	const correlationId = payload.correlationId ?? randomUUID();
	logger.info('Gate command received', {
		socketId: socket.id,
		actorName,
		source,
		gateId: payload.gateId,
		command: payload.command,
		sessionId: payload.sessionId,
		correlationId
	});

	const gateCommand = buildGateCommand(source, {
		...payload,
		correlationId
	});

	try {
		const gateLog =
			payload.command === 'open'
				? await hardwareGateway.openGate(payload.gateId, gateCommand)
				: await hardwareGateway.closeGate(payload.gateId, gateCommand);

		publishGateCommandEvents(source, { ...payload, correlationId }, gateLog);

		logger.info('Gate command completed', {
			socketId: socket.id,
			actorName,
			source,
			gateId: payload.gateId,
			command: payload.command,
			result: gateLog.result,
			state: gateLog.stateAfter,
			correlationId
		});

		ack?.({
			success: true,
			correlationId,
			result: gateLog.result,
			state: gateLog.stateAfter
		});
	} catch (error) {
		logger.error('Gate command failed', {
			socketId: socket.id,
			actorName,
			source,
			gateId: payload.gateId,
			command: payload.command,
			correlationId,
			error
		});

		ack?.({
			success: false,
			message: error instanceof Error ? error.message : 'Gate command failed'
		});
	}
};

const bridgeRealtimeEventToRooms = () => {
	if (!ioServer) {
		return;
	}

	unsubscribeRealtimeBridge = onRealtimeEvent('realtime.event', (event) => {
		if (!ioServer) {
			return;
		}

		ioServer.to('operator').emit('realtime.event', event);
		ioServer.to('simulator').emit('realtime.event', event);
		ioServer.to('hardware').emit('realtime.event', event);
		ioServer.to('operator').emit(event.eventName, event);
		ioServer.to('simulator').emit(event.eventName, event);
		ioServer.to('hardware').emit(event.eventName, event);
	});
};

export const initializeSocketServer = (httpServer: HttpServer) => {
	if (ioServer) {
		return ioServer;
	}

	const corsOrigin = process.env.SOCKET_CORS_ORIGIN ?? '*';
	ioServer = new Server(httpServer, {
		path: '/socket.io',
		allowEIO3: true,
		transports: ['websocket', 'polling'],
		cors: {
			origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((item) => item.trim()),
			credentials: true
		}
	});

	logger.info('Socket.IO server initialized', {
		path: '/socket.io/',
		corsOrigin
	});

	ioServer.engine.on('connection_error', (err) => {
		logger.error('Socket.IO engine connection error', {
			code: err.code,
			message: err.message,
			context: err.context,
			transport: err.req?.headers?.upgrade ?? null,
			url: err.req?.url ?? null
		});
	});

	ioServer.use(async (socket, next) => {
		const token = getSocketToken(socket);
		if (!token) {
			return next();
		}

		try {
			const decoded = verifyToken(token) as JwtPayload;
			const user = await findUserById(decoded.userId);
			if (!user || !user.is_active) {
				logger.warn('Socket authentication rejected', {
					socketId: socket.id,
					reason: 'Unauthorized socket user'
				});
				return next(new Error('Unauthorized socket user'));
			}

			socket.data.user = {
				userId: user._id.toString(),
				username: user.username,
				role: user.role
			};
			return next();
		} catch {
			logger.warn('Socket authentication rejected', {
				socketId: socket.id,
				reason: 'Invalid socket token'
			});
			return next(new Error('Invalid socket token'));
		}
	});

	ioServer.on('connection', (socket) => {
		logger.info('Socket connected', {
			socketId: socket.id,
			authenticated: Boolean(socket.data.user),
			transport: socket.conn.transport.name
		});

		// Debug handshake details to verify clientType query/header
		logger.debug('Socket handshake details', {
			socketId: socket.id,
			query: socket.handshake.query,
			headers: {
				origin: socket.handshake.headers.origin,
				referer: socket.handshake.headers.referer,
				'x-client-type': socket.handshake.headers['x-client-type'] || null
			}
		});

		if (isHardwareHandshake(socket)) {
			socket.join('hardware');
			hardwareGateway.markHardwareConnected(socket.id);

			logger.info('Hardware socket connected', {
				socketId: socket.id,
				transport: socket.conn.transport.name
			});
		}

		// Debug: Log all events
		socket.onAny((event, ...args) => {
			logger.debug(`[DEBUG] Socket event: ${event}`, {
				socketId: socket.id,
				event,
				argsCount: args.length,
				firstArgType: args[0] ? typeof args[0] : 'undefined'
			});
		});

		// Debug: Log errors
		socket.on('error', (err) => {
			logger.error('Socket error', {
				socketId: socket.id,
				error: err instanceof Error ? err.message : String(err)
			});
		});

		socket.on('error', (err) => {
			logger.error('Socket error during event processing', {
				socketId: socket.id,
				error: err instanceof Error ? err.message : String(err)
			});
		});

		socket.on('disconnect', (reason) => {
			if (socket.rooms.has('simulator') || socket.rooms.has('hardware')) {
				hardwareGateway.markHardwareDisconnected(socket.id);
			}

			logger.info('Socket disconnected', {
				socketId: socket.id,
				reason,
				rooms: Array.from(socket.rooms),
				user: socket.data.user ?? null,
				transport: socket.conn.transport.name
			});
		});


		socket.on('operator.join', (_payload, ack?: (value: unknown) => void) => {
			if (!socket.data.user) {
				logger.warn('Operator room join rejected', {
					socketId: socket.id,
					reason: 'Authentication required'
				});
				ack?.({ success: false, message: 'Authentication required' });
				return;
			}

			if (!['admin', 'operator'].includes(socket.data.user.role)) {
				logger.warn('Operator room join rejected', {
					socketId: socket.id,
					username: socket.data.user.username,
					reason: 'Forbidden role'
				});
				ack?.({ success: false, message: 'Forbidden role' });
				return;
			}

			socket.join('operator');
			logger.debug('Operator room joined', {
				socketId: socket.id,
				username: socket.data.user.username,
				role: socket.data.user.role
			});
			ack?.({ success: true, room: 'operator' as JoinedRoom });
		});

		socket.on(
			'simulator.join',
			(payload: { apiKey?: string } | undefined, ack?: (value: unknown) => void) => {
				try {
					logger.debug('Simulator join payload received', {
						socketId: socket.id,
						payload
					});

					if (!validateSimulatorKey(payload?.apiKey)) {
						logger.warn('Simulator room join rejected', {
							socketId: socket.id,
							reason: 'Invalid simulator key',
							providedApiKey: payload?.apiKey
						});
						ack?.({ success: false, message: 'Invalid simulator key' });
						return;
					}

					socket.join('simulator');
					hardwareGateway.markHardwareConnected(socket.id);
					logger.debug('Simulator room joined', {
						socketId: socket.id,
						apiKeyProvided: Boolean(payload?.apiKey)
					});
					ack?.({ success: true, room: 'simulator' as JoinedRoom });
				} catch (err) {
					logger.error('Error in simulator.join handler', { socketId: socket.id, error: err });
					ack?.({ success: false, message: 'Internal error' });
				}
			}
		);

		socket.on('hardware.join', (payload: any, ack?: (value: unknown) => void) => {
			try {
				logger.debug('Hardware.join received', {
					socketId: socket.id,
					payloadType: typeof payload,
					payload: payload ? JSON.stringify(payload) : 'undefined'
				});

				socket.join('hardware');
				hardwareGateway.markHardwareConnected(socket.id);

				logger.debug('Hardware room joined', {
					socketId: socket.id
				});
				ack?.({ success: true, room: 'hardware' as JoinedRoom });
			} catch (err) {
				logger.error('Error in hardware.join handler', { socketId: socket.id, error: err });
				ack?.({ success: false, message: 'Internal error' });
			}
		});

		socket.on(
			'hardware.rfid.scan',
			(payload: HardwareRfidScanPayload, ack?: (value: unknown) => void) => {
				if (!socket.rooms.has('hardware')) {
					logger.warn('Hardware RFID scan rejected', {
						socketId: socket.id,
						reason: 'Hardware room is required'
					});
					ack?.({ success: false, message: 'Hardware room is required' });
					return;
				}

				if (!payload?.uid || payload.uid.trim().length === 0) {
					logger.warn('Hardware RFID scan rejected', {
						socketId: socket.id,
						reason: 'uid is required'
					});
					ack?.({ success: false, message: 'uid is required' });
					return;
				}

				const normalizedUid = payload.uid.trim().toUpperCase();
				const checkpoint = payload.checkpoint === 'exit_rfid' ? 'exit_rfid' : 'entry_rfid';
				const correlationId = payload.correlationId ?? randomUUID();

				logger.info('Hardware RFID scan received', {
					socketId: socket.id,
					uid: normalizedUid,
					checkpoint,
					sessionId: payload.sessionId,
					correlationId
				});

				publishRealtimeEvent({
					eventName: 'rfid.scan.requested',
					source: 'hardware-gateway',
					correlationId,
					sessionId: payload.sessionId,
					payload: {
						uid: normalizedUid,
						checkpoint,
						status: 'requested'
					}
				});

				ack?.({ success: true, correlationId });
			}
		);

		socket.on(
			'operator.gate.command.request',
			async (payload: GateCommandRequestPayload, ack?: (value: unknown) => void) => {
				if (!socket.data.user || !['admin', 'operator'].includes(socket.data.user.role)) {
					logger.warn('Manual gate command rejected', {
						socketId: socket.id,
						reason: 'Forbidden'
					});
					ack?.({ success: false, message: 'Forbidden' });
					return;
				}

				void executeGateCommand({
					socket,
					payload,
					source: 'operator',
					actorName: socket.data.user.username,
					ack
				});
			}
		);

		socket.on(
			'simulator.gate.command.request',
			async (payload: GateCommandRequestPayload, ack?: (value: unknown) => void) => {
				if (!socket.rooms.has('simulator')) {
					logger.warn('Simulator gate command rejected', {
						socketId: socket.id,
						reason: 'Simulator room is required'
					});
					ack?.({ success: false, message: 'Simulator room is required' });
					return;
				}

				void executeGateCommand({
					socket,
					payload,
					source: 'simulator',
					actorName: 'simulator-3d',
					ack
				});
			}
		);

		socket.on(
			'simulator.vehicle.checkpoint',
			(payload: SimulatorCheckpointPayload, ack?: (value: unknown) => void) => {
				if (!socket.rooms.has('simulator')) {
					logger.warn('Simulator checkpoint rejected', {
						socketId: socket.id,
						reason: 'Simulator room is required'
					});
					ack?.({ success: false, message: 'Simulator room is required' });
					return;
				}

				if (!payload?.plateNumber || !payload?.checkpoint) {
					logger.warn('Simulator checkpoint rejected', {
						socketId: socket.id,
						reason: 'plateNumber and checkpoint are required'
					});
					ack?.({ success: false, message: 'plateNumber and checkpoint are required' });
					return;
				}

				const normalizedCheckpoint = payload.checkpoint;
				if (!['entry_rfid', 'exit_rfid'].includes(normalizedCheckpoint)) {
					logger.warn('Simulator checkpoint rejected', {
						socketId: socket.id,
						reason: 'Invalid checkpoint value'
					});
					ack?.({ success: false, message: 'Invalid checkpoint value' });
					return;
				}

				const correlationId = payload.correlationId ?? randomUUID();
				logger.info('Simulator checkpoint received', {
					socketId: socket.id,
					checkpoint: normalizedCheckpoint,
					plateNumber: payload.plateNumber.trim().toUpperCase(),
					state: payload.state ?? 'arrived',
					sessionId: payload.sessionId,
					correlationId
				});

				publishRealtimeEvent({
					eventName: 'vehicle.state.changed',
					source: 'simulator',
					correlationId,
					sessionId: payload.sessionId,
					payload: {
						checkpoint: normalizedCheckpoint,
						plateNumber: payload.plateNumber.trim().toUpperCase(),
						state: payload.state ?? 'arrived',
						status: payload.state ?? 'arrived'
					}
				});

				ack?.({ success: true, correlationId });
			}
		);

		socket.on(
			'simulator.stage.changed',
			(payload: SimulatorStagePayload, ack?: (value: unknown) => void) => {
				if (!socket.rooms.has('simulator')) {
					logger.warn('Simulator stage event rejected', {
						socketId: socket.id,
						reason: 'Simulator room is required'
					});
					ack?.({ success: false, message: 'Simulator room is required' });
					return;
				}

				if (!payload?.stage || payload.stage.trim().length === 0) {
					logger.warn('Simulator stage event rejected', {
						socketId: socket.id,
						reason: 'stage is required'
					});
					ack?.({ success: false, message: 'stage is required' });
					return;
				}

				const normalizedStage = payload.stage.trim();
				const correlationId = payload.correlationId ?? randomUUID();

				publishRealtimeEvent({
					eventName: 'simulator.stage.changed',
					source: 'simulator',
					correlationId,
					sessionId: payload.sessionId,
					payload: {
						stage: normalizedStage,
						plateNumber: payload.plateNumber?.trim().toUpperCase(),
						checkpoint: payload.checkpoint
					}
				});

				ack?.({ success: true, correlationId });
			}
		);
	});

	bridgeRealtimeEventToRooms();

	return ioServer;
};

export const getSocketServer = () => ioServer;

export const shutdownSocketServer = async () => {
	if (unsubscribeRealtimeBridge) {
		unsubscribeRealtimeBridge();
		unsubscribeRealtimeBridge = null;
	}

	if (ioServer) {
		await new Promise<void>((resolve) => {
			ioServer?.close(() => resolve());
		});
		ioServer = null;
	}
};
