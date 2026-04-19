export type SessionStatus =
	| 'waiting_scan'
	| 'approved_entry'
	| 'active'
	| 'parked'
	| 'exit_pending'
	| 'completed'
	| 'blocked';

export type UserRole = 'admin' | 'operator';

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

export interface AuthUser {
	id: string;
	username: string;
	full_name?: string;
	role: UserRole;
	is_active: boolean;
}

export interface AuthPayload {
	user: AuthUser;
	token: string;
	refreshToken: string;
}

export interface ResidentRecord {
	_id: string;
	full_name: string;
	phone?: string;
	apartment_no: string;
	is_active: boolean;
	created_at: string;
}

export interface VehicleRecord {
	_id: string;
	resident_id?: string;
	vehicle_type: 'motorbike' | 'car';
	plate_number: string;
	created_at: string;
}

export interface PricingPolicyRecord {
	_id: string;
	vehicle_type: 'motorbike' | 'car';
	card_type: 'monthly' | 'guest';
	price_per_hour: number;
	free_minutes: number;
	is_active: boolean;
	effective_from: string;
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

export interface TransactionRecord {
	_id: string;
	session_id: string;
	vehicle_id: string;
	rfid_card_id: string;
	pricing_policy_id?: string;
	amount: number;
	final_amount: number;
	payment_status: 'pending' | 'paid' | 'failed' | 'waived';
	paid_at?: string;
	created_at: string;
}

export interface RevenueSummary {
	total_transactions: number;
	total_revenue: number;
	paid_transactions: number;
	pending_transactions: number;
	failed_transactions: number;
	waived_transactions: number;
}

export interface RevenueReport {
	summary: RevenueSummary;
	transactions: TransactionRecord[];
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
