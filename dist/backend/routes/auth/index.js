import express from 'express';
import challengeRouter from './challenge.js';
import verifyRouter from './verify.js';
import meRouter from './me.js';
import logoutRouter from './logout.js';
import refreshRouter from './refresh.js';
import referralRouter from './referral.js';
const router = express.Router();
// Mount auth routes
router.use('/challenge', challengeRouter);
router.use('/verify', verifyRouter);
router.use('/me', meRouter);
router.use('/logout', logoutRouter);
router.use('/refresh', refreshRouter);
router.use('/referral', referralRouter);
export default router;
