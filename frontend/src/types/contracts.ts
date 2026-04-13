export type SessionStatus =
	| 'waiting_scan'
	| 'approved_entry'
	| 'active'
	| 'parked'
	| 'exit_pending'
	| 'completed'
	| 'blocked';

export type GateState = 'opening' | 'open' | 'closing' | 'closed' | 'error' | 'offline';

export interface RealtimeEnvelope<TPayload = Record<string, unknown>> {
	eventId: string;
	eventName: string;
	occurredAt: string;
	source: 'backend' | 'simulator' | 'operator' | 'hardware-gateway';
	correlationId: string;
	sessionId?: string;
	payload: TPayload;
}

export interface SessionSummary {
	_id: string;
	vehicle_id: string;
	rfid_card_id: string;
	status: SessionStatus;
	entry_plate_text?: string;
	exit_plate_text?: string;
	is_plate_mismatch: boolean;
	entry_time: string;
	exit_time?: string;
	duration_minutes?: number;
}

export interface OverviewData {
	total_slots: number;
	occupied_slots: number;
	available_slots: number;
	active_session_count: number;
	blocked_session_count: number;
	parked_session_count: number;
	gate_status: {
		entry_gate: GateState;
		exit_gate: GateState;
	};
}

export interface ApiEnvelope<TData> {
	message: string;
	data: TData;
}
