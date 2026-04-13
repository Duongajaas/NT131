export type GateCommandAction = 'open' | 'close';
export type GateState = 'opening' | 'open' | 'closing' | 'closed' | 'error' | 'offline';
export type GateCommandResult = 'ack' | 'nack' | 'timeout';

export interface GateCommand {
	commandId: string;
	sessionId?: string;
	correlationId?: string;
	requestedBy: 'backend' | 'operator' | 'simulator';
	timeoutMs: number;
	action: GateCommandAction;
}

export interface GateCommandLog extends GateCommand {
	gateId: string;
	createdAt: string;
	result: GateCommandResult;
	stateAfter: GateState;
	reason?: string;
}

export interface HardwareGatewayAdapter {
	openGate(gateId: string, command: GateCommand): Promise<GateCommandLog>;
	closeGate(gateId: string, command: GateCommand): Promise<GateCommandLog>;
	getGateState(gateId: string): Promise<GateState>;
	ping(): Promise<{ online: boolean; checkedAt: string }>;
	listCommandLogs(limit?: number): Promise<GateCommandLog[]>;
}
