export type RealtimeSource = 'backend' | 'simulator' | 'operator' | 'hardware-gateway';

export interface RealtimeEventEnvelope<TPayload = Record<string, unknown>> {
	eventId: string;
	eventName: string;
	occurredAt: string;
	source: RealtimeSource;
	correlationId: string;
	sessionId?: string;
	payload: TPayload;
}
