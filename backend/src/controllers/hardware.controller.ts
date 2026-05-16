import type { Request, Response } from 'express';
import AppError from '../utills/app-error.ts';
import { getHardwareBootstrapConfig } from '../services/hardware-config.service.ts';

export const bootstrap = async (req: Request, res: Response) => {
	const requiredKey = process.env.HARDWARE_BOOTSTRAP_KEY?.trim();
	const providedKey = req.header('x-hardware-key')?.trim();

	if (requiredKey && requiredKey !== providedKey) {
		throw new AppError('Unauthorized hardware bootstrap request', 401);
	}

	const data = getHardwareBootstrapConfig(req.hostname);

	return res.status(200).json({
		message: 'Hardware bootstrap config retrieved successfully',
		data
	});
};