import { randomUUID } from 'node:crypto';
import type {
	GateCommand,
	GateCommandLog,
	GateState,
	HardwareGatewayAdapter
} from '../types/hardware-gateway.ts';
import logger from '../utills/logger.ts';

class HardwareGatewayService implements HardwareGatewayAdapter {
	private gateStates = new Map<string, GateState>();
	private commandLogs: GateCommandLog[] = [];
	private hardwareSockets = new Set<string>();

	constructor() {
		this.gateStates.set('entry-gate', 'closed');
		this.gateStates.set('exit-gate', 'closed');
	}

	markHardwareConnected(socketId: string) {
		if (this.hardwareSockets.has(socketId)) {
			return;
		}

		this.hardwareSockets.add(socketId);
		logger.info('ESP32 hardware connected', {
			socketId,
			onlineHardwareCount: this.hardwareSockets.size
		});
	}

	markHardwareDisconnected(socketId: string) {
		if (!this.hardwareSockets.delete(socketId)) {
			return;
		}

		logger.info('ESP32 hardware disconnected', {
			socketId,
			onlineHardwareCount: this.hardwareSockets.size
		});
	}

	private isHardwareOnline() {
		return this.hardwareSockets.size > 0;
	}

	private createLog(
		gateId: string,
		command: GateCommand,
		stateAfter: GateState,
		result: 'ack' | 'nack' | 'timeout',
		reason?: string
	): GateCommandLog {
		const log: GateCommandLog = {
			...command,
			commandId: command.commandId || randomUUID(),
			gateId,
			createdAt: new Date().toISOString(),
			stateAfter,
			result,
			reason
		};

		this.commandLogs.unshift(log);
		this.commandLogs = this.commandLogs.slice(0, 500);
		return log;
	}

	async openGate(gateId: string, command: GateCommand): Promise<GateCommandLog> {
		if (command.timeoutMs <= 0) {
			const timeoutLog = this.createLog(gateId, command, 'error', 'timeout', 'invalid_timeout');
			this.gateStates.set(gateId, 'error');
			return timeoutLog;
		}

		if (!this.isHardwareOnline()) {
			const offlineLog = this.createLog(gateId, command, 'offline', 'timeout', 'hardware_offline');
			this.gateStates.set(gateId, 'offline');
			logger.warn('Gate command timed out because ESP32 is offline', {
				gateId,
				commandId: command.commandId,
				sessionId: command.sessionId,
				correlationId: command.correlationId
			});
			return offlineLog;
		}

		this.gateStates.set(gateId, 'opening');
		this.gateStates.set(gateId, 'open');
		return this.createLog(gateId, command, 'open', 'ack');
	}

	async closeGate(gateId: string, command: GateCommand): Promise<GateCommandLog> {
		if (command.timeoutMs <= 0) {
			const timeoutLog = this.createLog(gateId, command, 'error', 'timeout', 'invalid_timeout');
			this.gateStates.set(gateId, 'error');
			return timeoutLog;
		}

		if (!this.isHardwareOnline()) {
			const offlineLog = this.createLog(gateId, command, 'offline', 'timeout', 'hardware_offline');
			this.gateStates.set(gateId, 'offline');
			logger.warn('Gate command timed out because ESP32 is offline', {
				gateId,
				commandId: command.commandId,
				sessionId: command.sessionId,
				correlationId: command.correlationId
			});
			return offlineLog;
		}

		this.gateStates.set(gateId, 'closing');
		this.gateStates.set(gateId, 'closed');
		return this.createLog(gateId, command, 'closed', 'ack');
	}

	async getGateState(gateId: string): Promise<GateState> {
		return this.gateStates.get(gateId) ?? 'offline';
	}

	async ping(): Promise<{ online: boolean; checkedAt: string }> {
		return {
			online: this.isHardwareOnline(),
			checkedAt: new Date().toISOString()
		};
	}

	async listCommandLogs(limit: number = 50): Promise<GateCommandLog[]> {
		return this.commandLogs.slice(0, Math.max(1, Math.min(limit, 200)));
	}
}

const hardwareGateway = new HardwareGatewayService();

export default hardwareGateway;
