import { useEffect } from 'react';
import {
	getParkingOverview,
	listParkingSessions
} from '../api/parking.api';
import {
	connectSocket,
	disconnectSocket,
	joinOperatorRoom,
	subscribeRealtime
} from '../lib/socket';
import { useOperatorStore } from '../store/operator-store';
import type { OverviewData, RealtimeEnvelope } from '../types/contracts';

const isGateState = (value: unknown): value is OverviewData['gate_status']['entry_gate'] => {
	return (
		typeof value === 'string' &&
		['opening', 'open', 'closing', 'closed', 'error', 'offline'].includes(value)
	);
};

export const useOperatorRealtime = (token: string) => {
	const setConnected = useOperatorStore((state) => state.setConnected);
	const setError = useOperatorStore((state) => state.setError);
	const setSessions = useOperatorStore((state) => state.setSessions);
	const setGateStates = useOperatorStore((state) => state.setGateStates);
	const pushEvent = useOperatorStore((state) => state.pushEvent);

	useEffect(() => {
		if (!token) {
			setConnected(false);
			setError(undefined);
			return;
		}

		const hydrate = async () => {
			try {
				const [sessionsRes, overviewRes] = await Promise.all([
					listParkingSessions({ token }),
					getParkingOverview({ token })
				]);
				setSessions(sessionsRes);
				setGateStates(
					overviewRes.gate_status.entry_gate,
					overviewRes.gate_status.exit_gate
				);
				setError(undefined);
			} catch (error) {
				setError(error instanceof Error ? error.message : 'Hydration failed');
			}
		};

		const socket = connectSocket(token);
		const onConnect = async () => {
			try {
				await joinOperatorRoom(socket);
				setConnected(true);
				void hydrate();
			} catch (error) {
				setError(error instanceof Error ? error.message : 'Room join failed');
			}
		};

		const onDisconnect = () => {
			setConnected(false);
		};

		const unsubscribeRealtime = subscribeRealtime(socket, (event: RealtimeEnvelope) => {
			pushEvent(event);
			if (event.eventName === 'gate.state.changed') {
				const gateId = event.payload?.gateId;
				const gateState = event.payload?.state;
				if (gateId === 'entry-gate' && isGateState(gateState)) {
					setGateStates(gateState, useOperatorStore.getState().exitGateState);
				}
				if (gateId === 'exit-gate' && isGateState(gateState)) {
					setGateStates(useOperatorStore.getState().entryGateState, gateState);
				}
			}
		});

		socket.on('connect', onConnect);
		socket.on('disconnect', onDisconnect);
		socket.on('connect_error', (error) => {
			setError(error.message);
		});

		if (socket.connected) {
			void onConnect();
		}

		return () => {
			unsubscribeRealtime();
			socket.off('connect', onConnect);
			socket.off('disconnect', onDisconnect);
			disconnectSocket();
		};
	}, [
		token,
		pushEvent,
		setConnected,
		setError,
		setGateStates,
		setSessions
	]);
};
