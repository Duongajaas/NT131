import type { Request, Response } from 'express';
import * as parkingStatusService from '../services/parking-status.service.ts';

export const overview = async (req: Request, res: Response) => {
	const data = await parkingStatusService.getOverview();
	return res.status(200).json({
		message: 'Parking overview retrieved successfully',
		data
	});
};

export const slots = async (req: Request, res: Response) => {
	const { level, slot_type, is_occupied } = req.query;
	const data = await parkingStatusService.getSlots({
		level: typeof level === 'string' ? Number(level) : undefined,
		slot_type:
			slot_type === 'regular' || slot_type === 'motorbike' || slot_type === 'handicap'
				? slot_type
				: undefined,
		is_occupied:
			typeof is_occupied === 'string'
				? is_occupied === 'true'
					? true
					: is_occupied === 'false'
						? false
						: undefined
				: undefined
	});

	return res.status(200).json({
		message: 'Parking status slots retrieved successfully',
		data
	});
};

export const gates = async (req: Request, res: Response) => {
	const data = await parkingStatusService.getGateStatus();
	return res.status(200).json({
		message: 'Gate status retrieved successfully',
		data
	});
};

export const gateCommands = async (req: Request, res: Response) => {
	const { limit } = req.query;
	const data = await parkingStatusService.getGateCommandLogs(
		typeof limit === 'string' ? Number(limit) : undefined
	);

	return res.status(200).json({
		message: 'Gate command logs retrieved successfully',
		data
	});
};

export const revenueReport = async (req: Request, res: Response) => {
	const { from_date, to_date, limit } = req.query;

	const parsedFromDate =
		typeof from_date === 'string' && !Number.isNaN(Date.parse(from_date))
			? new Date(from_date)
			: undefined;
	const parsedToDate =
		typeof to_date === 'string' && !Number.isNaN(Date.parse(to_date))
			? new Date(to_date)
			: undefined;

	const data = await parkingStatusService.getRevenueReport({
		from_date: parsedFromDate,
		to_date: parsedToDate,
		limit: typeof limit === 'string' ? Number(limit) : undefined
	});

	return res.status(200).json({
		message: 'Revenue report retrieved successfully',
		data
	});
};
