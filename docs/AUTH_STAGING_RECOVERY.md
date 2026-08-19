# Recuperación segura de registros incompletos de autenticación

Esta guía sirve para investigar registros creados por una versión anterior de la API que dejó una fila en `user` sin la identidad de contraseña correspondiente. No borra ni modifica nada por sí sola.

## Diagnóstico de solo lectura

Primero desplegar la versión que contiene la migración `0001_colorful_stryfe` y ejecutar las migraciones. En una shell del servicio API de Railway, con `DATABASE_URL` ya configurada por Railway, ejecutar:

```sh
AUTH_DIAGNOSTIC_EMAILS="<primer-email>,<segundo-email>" corepack pnpm run auth:diagnose
```

En PowerShell local con acceso seguro a una copia de staging:

```powershell
$env:AUTH_DIAGNOSTIC_EMAILS = "<primer-email>,<segundo-email>"
corepack pnpm run auth:diagnose
```

El resultado no incluye contraseñas, hashes, cookies ni tokens. Para cada email informa la fila `user`, las cuentas sin el campo secreto `password`, si existe la cuenta credential esperada (`providerId=credential`, `issuer=local:credential`, `accountId=user.id`), el número de sesiones, grants y eventos de auditoría.

Un registro queda confirmado como incompleto únicamente si existe `user` y `credentialAccountPresent` es `false`. Una cuenta que tenga `credentialAccountPresent: true` es válida para este propósito y no debe eliminarse mediante este procedimiento.

## Limpieza manual, revisable y acotada

No existe ningún comando de borrado automático. Para cada cuenta de prueba que el diagnóstico haya confirmado incompleta, usar el editor SQL de Railway contra **staging** y sustituir exactamente los dos marcadores siguientes por los valores obtenidos del diagnóstico: `<USER_ID>` y `<EMAIL>`.

Primero ejecutar siempre con `ROLLBACK`:

```sql
BEGIN;

-- Debe devolver exactamente una fila y `credential_account_present` debe ser false.
SELECT
  u.id,
  u.email,
  EXISTS (
    SELECT 1 FROM "account" a
    WHERE a.user_id = u.id
      AND a.provider_id = 'credential'
      AND a.issuer = 'local:credential'
      AND a.account_id = u.id
  ) AS credential_account_present,
  (SELECT count(*) FROM "session" s WHERE s.user_id = u.id) AS session_count,
  (SELECT count(*) FROM "access_grants" g WHERE g.user_id = u.id) AS access_grant_count
FROM "user" u
WHERE u.id = '<USER_ID>' AND u.email = '<EMAIL>'
FOR UPDATE;

-- Sólo se elimina si sigue sin cuenta, sin sesión ni grant. Los eventos de
-- auditoría conservan el historial mediante sus claves foráneas SET NULL.
DELETE FROM "user" u
WHERE u.id = '<USER_ID>'
  AND u.email = '<EMAIL>'
  AND NOT EXISTS (SELECT 1 FROM "account" a WHERE a.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM "session" s WHERE s.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM "access_grants" g WHERE g.user_id = u.id)
RETURNING u.id, u.email;

ROLLBACK;
```

Revisar que el `SELECT` devolvió sólo la cuenta prevista y que el `DELETE ... RETURNING` devolvería exactamente una fila. Sólo entonces repetir el mismo bloque, sin cambiar condiciones, sustituyendo `ROLLBACK` por `COMMIT`. Si el `DELETE` no devuelve una fila, detenerse: no se borró nada y la cuenta requiere revisión manual.

Después, repetir el diagnóstico y registrar de nuevo la cuenta. No limpiar cuentas con access grants, sesiones o una credential válida; no ejecutar este procedimiento en producción sin una copia de seguridad y revisión explícita.

## Por qué esta recuperación es necesaria una sola vez

La versión corregida usa una transacción PostgreSQL para las escrituras que Better Auth realiza durante sign-up (`user`, `account` y `session`). La tabla `account` también incluye el campo `issuer` requerido por Better Auth 1.7. Si el alta de credential falla, PostgreSQL revierte el usuario y la sesión, por lo que el email no queda reservado por una cuenta incompleta.
