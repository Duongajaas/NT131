import express from 'express';
import authRouter from './auth.routes.ts';

const apiRouter = express.Router();

apiRouter.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the API!' });
});
apiRouter.use('/auth', authRouter);
// apiRouter.use('/users', );

export default apiRouter;