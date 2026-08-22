import { Router, type IRouter } from "express";
import healthRouter from "./health";
import historicalRouter from "./historical";
import marketRouter from "./market";
import signalsRouter from "./signals";
import authRouter from "./auth";
import accountRouter from "./account";
import adminRouter from "./admin";
import paymentRequestsRouter from "./payment-requests";
import { requireProductAccess } from "../auth/session";
import { authRateLimit } from "../middlewares/security";
import { requireCommercialProductAvailability } from "../middlewares/commercial-product";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRateLimit, authRouter);
router.use(accountRouter);
router.use(paymentRequestsRouter);
router.use(adminRouter);
router.use(requireProductAccess(), requireCommercialProductAvailability, historicalRouter);
router.use(requireProductAccess(), requireCommercialProductAvailability, marketRouter);
router.use(requireProductAccess(), requireCommercialProductAvailability, signalsRouter);

export default router;
