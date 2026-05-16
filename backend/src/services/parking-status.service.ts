import { countParkingSlots, listActiveSessions, listParkingSlots } from '../repositories/parking-slot.repository.ts';
import { listParkingSessions } from '../repositories/parking-session.repository.ts';
import {
	getRevenueSummary,
	listTransactions
} from '../repositories/transaction.repository.ts';
import hardwareGateway from './hardware-gateway.service.ts';

interface RevenueReportInput {
	from_date?: Date;
	to_date?: Date;
	limit?: number;
}

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
			hardwareGateway.getGateState('entry-gate'),
			hardwareGateway.getGateState('exit-gate')
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
		hardwareGateway.getGateState('entry-gate'),
		hardwareGateway.getGateState('exit-gate'),
		hardwareGateway.ping()
	]);

	return {
		entry_gate: entryGate,
		exit_gate: exitGate,
		health
	};
};

export const getGateCommandLogs = async (limit?: number) => {
	return hardwareGateway.listCommandLogs(limit);
};

export const getRevenueReport = async (input: RevenueReportInput) => {
	const [summary, transactions] = await Promise.all([
		getRevenueSummary({
			from_date: input.from_date,
			to_date: input.to_date
		}),
		listTransactions(
			{
				from_date: input.from_date,
				to_date: input.to_date
			},
			input.limit
		)
	]);

	return {
		summary,
		transactions
	};
};
