import type { Request, Response } from 'express';
import * as vehicleService from '../services/vehicle.service.ts';

export const create = async (req: Request, res: Response) => {
	const { resident_id, vehicle_type, plate_number } = req.body;

	const data = await vehicleService.create({
		resident_id,
		vehicle_type,
		plate_number
	});

	return res.status(201).json({
		message: 'Vehicle created successfully',
		data
	});
};

export const list = async (req: Request, res: Response) => {
	const { search, vehicle_type, resident_id } = req.query;

	const data = await vehicleService.list({
		search: typeof search === 'string' ? search : undefined,
		vehicle_type:
			vehicle_type === 'motorbike' || vehicle_type === 'car' ? vehicle_type : undefined,
		resident_id: typeof resident_id === 'string' ? resident_id : undefined
	});

	return res.status(200).json({
		message: 'Vehicles retrieved successfully',
		data
	});
};

export const getById = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const data = await vehicleService.getById(id);

	return res.status(200).json({
		message: 'Vehicle retrieved successfully',
		data
	});
};

export const update = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const { resident_id, vehicle_type, plate_number } = req.body;

	const data = await vehicleService.update(id, {
		resident_id,
		vehicle_type,
		plate_number
	});

	return res.status(200).json({
		message: 'Vehicle updated successfully',
		data
	});
};

export const remove = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	await vehicleService.remove(id);

	return res.status(200).json({
		message: 'Vehicle deleted successfully'
	});
};