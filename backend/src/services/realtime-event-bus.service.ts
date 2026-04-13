import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { RealtimeEventEnvelope, RealtimeSource } from '../types/realtime-events.ts';

const eventEmitter = new EventEmitter();

interface PublishInput<TPayload = Record<string, unknown>> {
	eventName: string;
	source?: RealtimeSource;
	correlationId?: string;
	sessionId?: string;
	payload: TPayload;
}

export const publishRealtimeEvent = <TPayload = Record<string, unknown>>(
	input: PublishInput<TPayload>
): RealtimeEventEnvelope<TPayload> => {
	const envelope: RealtimeEventEnvelope<TPayload> = {
		eventId: randomUUID(),
		eventName: input.eventName,
		source: input.source ?? 'backend',
		occurredAt: new Date().toISOString(),
		correlationId: input.correlationId ?? randomUUID(),
		sessionId: input.sessionId,
		payload: input.payload
	};

	eventEmitter.emit(envelope.eventName, envelope);
	eventEmitter.emit('realtime.event', envelope);

	return envelope;
};

export const onRealtimeEvent = (
	eventName: string,
	handler: (event: RealtimeEventEnvelope) => void
) => {
	eventEmitter.on(eventName, handler);
	return () => eventEmitter.off(eventName, handler);
};
