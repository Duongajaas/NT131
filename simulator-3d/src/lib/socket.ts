import { io, type Socket } from 'socket.io-client';
import type { RealtimeEnvelope } from '../types/contracts';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL?.trim() || 'http://localhost:3000';

let socket: Socket | null = null;

export const connectSocket = (token?: string) => {
	if (socket) {
		return socket;
	}

	socket = io(SOCKET_URL, {
		path: '/socket.io',
		autoConnect: true,
		reconnection: true,
		reconnectionAttempts: Infinity,
		auth: token ? { token } : {}
	});

	return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
	if (socket) {
		socket.disconnect();
		socket = null;
	}
};

export const joinOperatorRoom = (socketRef: Socket) => {
	return new Promise<void>((resolve, reject) => {
		socketRef.emit('operator.join', {}, (ack: { success: boolean; message?: string }) => {
			if (ack.success) {
				resolve();
				return;
			}

			reject(new Error(ack.message || 'Failed to join operator room'));
		});
	});
};

export const joinSimulatorRoom = (socketRef: Socket, apiKey?: string) => {
	return new Promise<void>((resolve, reject) => {
		socketRef.emit(
			'simulator.join',
			{ apiKey },
			(ack: { success: boolean; message?: string }) => {
				if (ack.success) {
					resolve();
					return;
				}

				reject(new Error(ack.message || 'Failed to join simulator room'));
			}
		);
	});
};

export interface SimulatorCheckpointPayload {
	plateNumber: string;
	checkpoint: 'entry_rfid' | 'exit_rfid';
	state?: 'arrived' | 'leaving';
	correlationId?: string;
	sessionId?: string;
}

export const emitSimulatorCheckpoint = (
	socketRef: Socket,
	payload: SimulatorCheckpointPayload
) => {
	return new Promise<{ correlationId?: string }>((resolve, reject) => {
		socketRef.emit(
			'simulator.vehicle.checkpoint',
			payload,
			(ack: { success: boolean; message?: string; correlationId?: string }) => {
				if (ack.success) {
					resolve({ correlationId: ack.correlationId });
					return;
				}

				reject(new Error(ack.message || 'Failed to emit simulator checkpoint'));
			}
		);
	});
};

export const subscribeRealtime = (
	socketRef: Socket,
	handler: (event: RealtimeEnvelope) => void
) => {
	socketRef.on('realtime.event', handler);
	return () => socketRef.off('realtime.event', handler);
};
