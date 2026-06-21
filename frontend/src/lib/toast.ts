import { toast } from 'react-hot-toast';

const buildToastId = (type: 'success' | 'error' | 'info', message: string) => `${type}:${message}`;

export const notifySuccess = (message: string) =>
	toast.success(message, {
		id: buildToastId('success', message),
		duration: 2600
	});

export const notifyError = (message: string) =>
	toast.error(message, {
		id: buildToastId('error', message),
		duration: 4600
	});

export const notifyInfo = (message: string) =>
	toast(message, {
		id: buildToastId('info', message),
		duration: 3200
	});
