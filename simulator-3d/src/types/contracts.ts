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

export interface VehicleRecord {
	_id: string;
	resident_id?: string;
	vehicle_type: 'motorbike' | 'car';
	plate_number: string;
	created_at: string;
}

export interface RfidCardRecord {
	_id: string;
	uid: string;
	vehicle_id: string;
	card_type: 'monthly' | 'guest';
	is_active: boolean;
	monthly_fee?: number;
	monthly_started_at?: string;
	monthly_expires_at?: string;
	issued_at: string;
}

export interface ParkingSlotRecord {
	_id: string;
	slot_code: string;
	level: number;
	slot_type: 'regular' | 'motorbike' | 'handicap';
	is_occupied: boolean;
	current_session_id?: string;
	created_at: string;
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
