import { create } from 'zustand';
import type { GateState, RealtimeEnvelope, SessionSummary } from '../types/contracts';

interface OperatorState {
	connected: boolean;
	error?: string;
	events: RealtimeEnvelope[];
	sessions: SessionSummary[];
	entryGateState: GateState;
	exitGateState: GateState;
	setConnected: (connected: boolean) => void;
	setError: (error?: string) => void;
	setSessions: (sessions: SessionSummary[]) => void;
	setGateStates: (entryState: GateState, exitState: GateState) => void;
	pushEvent: (event: RealtimeEnvelope) => void;
	upsertSession: (session: SessionSummary) => void;
}

const MAX_EVENTS = 200;

export const useOperatorStore = create<OperatorState>((set) => ({
	connected: false,
	events: [],
	sessions: [],
	entryGateState: 'offline',
	exitGateState: 'offline',
	setConnected: (connected) => set({ connected }),
	setError: (error) => set({ error }),
	setSessions: (sessions) => set({ sessions }),
	setGateStates: (entryGateState, exitGateState) => set({ entryGateState, exitGateState }),
	pushEvent: (event) =>
		set((state) => {
			if (state.events.find((item) => item.eventId === event.eventId)) {
				return state;
			}

			const nextEvents = [event, ...state.events].slice(0, MAX_EVENTS);
			return { events: nextEvents };
		}),
	upsertSession: (session) =>
		set((state) => {
			const existed = state.sessions.find((item) => item._id === session._id);
			if (!existed) {
				return { sessions: [session, ...state.sessions] };
			}

			return {
				sessions: state.sessions.map((item) => (item._id === session._id ? session : item))
			};
		})
}));
