import { toast } from 'react-hot-toast';

export const notifySuccess = (message: string) => toast.success(message, { id: message });

export const notifyError = (message: string) => toast.error(message, { id: message });

export const notifyInfo = (message: string) => toast(message, { id: message });