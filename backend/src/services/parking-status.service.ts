import { countParkingSlots, listActiveSessions, listParkingSlots } from '../repositories/parking-slot.repository.ts';
import { listParkingSessions } from '../repositories/parking-session.repository.ts';
import hardwareGatewayMock from './hardware-gateway.mock.service.ts';

export const getOverview = async () => {
	const [
		totalSlots,
		occupiedSlots,
		activeStatuses,
		blockedSessions,
		activeSessions,
		entryGateState,
		exitGateState
	] =
		await Promise.all([
			countParkingSlots(),
			countParkingSlots(true),
			listActiveSessions(),
			listParkingSessions({ status: 'blocked' }),
			listParkingSessions({ status: 'parked' }),
			hardwareGatewayMock.getGateState('entry-gate'),
			hardwareGatewayMock.getGateState('exit-gate')
		]);

	return {
		total_slots: totalSlots,
		occupied_slots: occupiedSlots,
		available_slots: Math.max(0, totalSlots - occupiedSlots),
		active_session_count: activeStatuses.length,
		blocked_session_count: blockedSessions.length,
		parked_session_count: activeSessions.length,
		gate_status: {
			entry_gate: entryGateState,
			exit_gate: exitGateState
		}
	};
};

export const getSlots = async (input: {
	level?: number;
	slot_type?: 'regular' | 'motorbike' | 'handicap';
	is_occupied?: boolean;
}) => {
	return listParkingSlots(input);
};

export const getGateStatus = async () => {
	const [entryGate, exitGate, health] = await Promise.all([
		hardwareGatewayMock.getGateState('entry-gate'),
		hardwareGatewayMock.getGateState('exit-gate'),
		hardwareGatewayMock.ping()
	]);

	return {
		entry_gate: entryGate,
		exit_gate: exitGate,
		health
	};
};

export const getGateCommandLogs = async (limit?: number) => {
	return hardwareGatewayMock.listCommandLogs(limit);
};
