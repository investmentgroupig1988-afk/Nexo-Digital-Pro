import { Router, type IRouter } from "express";
import healthRouter from "./health";
import historicalRouter from "./historical";
import marketRouter from "./market";
import signalRouter from "./signal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(historicalRouter);
router.use(marketRouter);
router.use(signalRouter);

export default router;
