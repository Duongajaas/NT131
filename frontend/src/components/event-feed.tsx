import type { RealtimeEnvelope } from '../types/contracts';

interface EventFeedProps {
	events: RealtimeEnvelope[];
}

export const EventFeed = ({ events }: EventFeedProps) => {
	return (
		<section className="panel">
			<header className="panel-head">
				<h2>Realtime Events</h2>
				<p>{events.length} events in memory</p>
			</header>
			<div className="event-list">
				{events.length === 0 ? <p className="empty">No realtime events yet.</p> : null}
				{events.map((event) => (
					<article key={event.eventId} className="event-row">
						<div>
							<p className="event-name">{event.eventName}</p>
							<p className="event-meta">
								{event.source} · {new Date(event.occurredAt).toLocaleTimeString()}
							</p>
						</div>
						<p className="event-corr">{event.correlationId}</p>
					</article>
				))}
			</div>
		</section>
	);
};
