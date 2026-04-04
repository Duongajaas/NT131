import express from 'express';
import authRouter from './auth.routes.ts';
import rfidCardRouter from './rfid-card.routes.ts';
import residentRouter from './resident.routes.ts';
import vehicleRouter from './vehicle.routes.ts';

const apiRouter = express.Router();

apiRouter.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the API!' });
});
apiRouter.use('/auth', authRouter);
apiRouter.use('/residents', residentRouter);
apiRouter.use('/rfid-cards', rfidCardRouter);
apiRouter.use('/vehicles', vehicleRouter);
// apiRouter.use('/users', );

export default apiRouter;