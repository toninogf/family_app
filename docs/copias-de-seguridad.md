# Copias de seguridad

Cada lunes a las 03:00 UTC, GitHub Actions hace una copia de la base de datos (esquemas `public`, `private` y `auth`),
la comprime, la **cifra con AES-256** usando tu frase secreta y la guarda 60 días como artefacto del workflow
"Copia de seguridad semanal". El repositorio es privado y la copia solo se puede abrir con la frase.

Las fotos de tickets (Supabase Storage) no van en la copia.

## Puesta en marcha (una vez)

1. **Contraseña de la base de datos**: Supabase → proyecto `family-app` → *Project Settings → Database* →
   *Reset database password*. Copia la nueva contraseña.
2. **Cadena de conexión**: botón **Connect** (arriba) → *Session pooler* → copia la URI y sustituye
   `[YOUR-PASSWORD]` por la contraseña del paso 1.
3. **Secretos en GitHub**: repositorio `family_app` → *Settings → Secrets and variables → Actions → New repository secret*:
   - `SUPABASE_DB_URL` = la URI del paso 2
   - `BACKUP_PASSPHRASE` = una frase larga que guardes en tu gestor de contraseñas
4. **Probar**: pestaña *Actions* → *Copia de seguridad semanal* → *Run workflow*. Al terminar verás la copia en
   *Artifacts*.

## Restaurar

```bash
gpg --decrypt family-app-AAAA-MM-DD.sql.gz.gpg | gunzip > copia.sql
psql "<cadena de conexión>" -f copia.sql
```

Restaurar sobrescribe datos: mejor hacerlo sobre un proyecto nuevo de Supabase y revisar antes.

## Pasar las copias a Cloudflare R2 (opcional)

Si activas R2 en Cloudflare (pide método de pago, pero hasta 10 GB es gratis), se puede añadir un paso al workflow
que suba el archivo cifrado a un bucket con `aws s3 cp --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
