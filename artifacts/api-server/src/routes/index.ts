import { Router, type IRouter } from "express";
import healthRouter from "./health";
import historicalRouter from "./historical";
import marketRouter from "./market";
import signalRouter from "./signal";
import authRouter from "./auth";
import accountRouter from "./account";
import adminRouter from "./admin";
import { requireProductAccess } from "../auth/session";
import { authRateLimit } from "../middlewares/security";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRateLimit, authRouter);
router.use(accountRouter);
router.use(adminRouter);
router.use(requireProductAccess(), historicalRouter);
router.use(requireProductAccess(), marketRouter);
router.use(signalRouter);

export default router;
