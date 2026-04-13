import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { findUserById } from '../repositories/user.repository.ts';
import { verifyToken, type JwtPayload } from '../utills/password.ts';
import { onRealtimeEvent, publishRealtimeEvent } from './realtime-event-bus.service.ts';

interface CommandRequestPayload {
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

type JoinedRoom = 'operator' | 'simulator';

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
		ioServer.to('operator').emit(event.eventName, event);
		ioServer.to('simulator').emit(event.eventName, event);
	});
};

export const initializeSocketServer = (httpServer: HttpServer) => {
	if (ioServer) {
		return ioServer;
	}

	const corsOrigin = process.env.SOCKET_CORS_ORIGIN ?? '*';
	ioServer = new Server(httpServer, {
		path: '/socket.io',
		cors: {
			origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((item) => item.trim()),
			credentials: true
		}
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
				return next(new Error('Unauthorized socket user'));
			}

			socket.data.user = {
				userId: user._id.toString(),
				username: user.username,
				role: user.role
			};
			return next();
		} catch {
			return next(new Error('Invalid socket token'));
		}
	});

	ioServer.on('connection', (socket) => {
		socket.on('operator.join', (_payload, ack?: (value: unknown) => void) => {
			if (!socket.data.user) {
				ack?.({ success: false, message: 'Authentication required' });
				return;
			}

			if (!['admin', 'operator'].includes(socket.data.user.role)) {
				ack?.({ success: false, message: 'Forbidden role' });
				return;
			}

			socket.join('operator');
			ack?.({ success: true, room: 'operator' as JoinedRoom });
		});

		socket.on(
			'simulator.join',
			(payload: { apiKey?: string } | undefined, ack?: (value: unknown) => void) => {
				if (!validateSimulatorKey(payload?.apiKey)) {
					ack?.({ success: false, message: 'Invalid simulator key' });
					return;
				}

				socket.join('simulator');
				ack?.({ success: true, room: 'simulator' as JoinedRoom });
			}
		);

		socket.on(
			'operator.gate.command.request',
			(payload: CommandRequestPayload, ack?: (value: unknown) => void) => {
				if (!socket.data.user || !['admin', 'operator'].includes(socket.data.user.role)) {
					ack?.({ success: false, message: 'Forbidden' });
					return;
				}

				if (!payload?.gateId || !payload?.command) {
					ack?.({ success: false, message: 'gateId and command are required' });
					return;
				}

				const correlationId = payload.correlationId ?? randomUUID();
				publishRealtimeEvent({
					eventName: 'gate.command.sent',
					source: 'operator',
					correlationId,
					sessionId: payload.sessionId,
					payload: {
						gateId: payload.gateId,
						command: payload.command,
						reason: 'operator_manual_command'
					}
				});

				ack?.({ success: true, correlationId });
			}
		);

		socket.on(
			'simulator.vehicle.checkpoint',
			(payload: SimulatorCheckpointPayload, ack?: (value: unknown) => void) => {
				if (!socket.rooms.has('simulator')) {
					ack?.({ success: false, message: 'Simulator room is required' });
					return;
				}

				if (!payload?.plateNumber || !payload?.checkpoint) {
					ack?.({ success: false, message: 'plateNumber and checkpoint are required' });
					return;
				}

				const normalizedCheckpoint = payload.checkpoint;
				if (!['entry_rfid', 'exit_rfid'].includes(normalizedCheckpoint)) {
					ack?.({ success: false, message: 'Invalid checkpoint value' });
					return;
				}

				const correlationId = payload.correlationId ?? randomUUID();
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
		await ioServer.close();
		ioServer = null;
	}
};
