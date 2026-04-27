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
			<div className="session-table-wrap">
				<table className="session-table">
					<thead>
						<tr>
							<th>Event Name</th>
							<th>Source</th>
							<th>Time</th>
							<th>Correlation ID</th>
						</tr>
					</thead>
					<tbody>
						{events.length === 0 ? (
							<tr>
								<td colSpan={4} className="empty">No realtime events yet.</td>
							</tr>
						) : (
							events.map((event) => (
								<tr key={event.eventId}>
									<td>
										<span className="event-name">{event.eventName}</span>
									</td>
									<td>{event.source}</td>
									<td>{new Date(event.occurredAt).toLocaleTimeString()}</td>
									<td>
										<code className="event-corr">{event.correlationId}</code>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
};
