import { Router, type IRouter } from "express";
import { getEffectiveAccess } from "../services/access";
import { currentAuthenticatedUser, requireAuthenticatedUser } from "../auth/session";
import { config } from "../config";

const router: IRouter = Router();

router.get("/me", requireAuthenticatedUser(), async (_req, res, next) => {
  try {
    const user = currentAuthenticatedUser(res);
    const access = await getEffectiveAccess(user.id);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.displayUsername,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      },
      access: serializeAccess(access),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/access/me", requireAuthenticatedUser(), async (_req, res, next) => {
  try {
    const user = currentAuthenticatedUser(res);
    res.json({ access: serializeAccess(await getEffectiveAccess(user.id)) });
  } catch (error) {
    next(error);
  }
});

export function serializeAccess(access: Awaited<ReturnType<typeof getEffectiveAccess>>) {
  return {
    hasAccess: access.hasAccess,
    plan: access.grant?.plan ?? null,
    accessType: access.grant?.accessType ?? null,
    status: access.grant?.status ?? null,
    grantedAt: access.grant?.grantedAt ?? null,
    expiresAt: access.grant?.expiresAt ?? null,
    communityUrl: access.hasAccess ? config.whatsappCommunityUrl ?? null : null,
  };
}

export default router;
