# Orba disaster recovery

Orba creates an encrypted off-site Supabase backup every day at 02:17 UTC.
The private GitHub Actions artifact is retained for 30 days. The workflow also
restores the application schema into an isolated PostgreSQL 17 database and
compares every table row count and structural object count before uploading it.

## Backup coverage

- `public`: complete schema and data, including policies, constraints, indexes,
  functions, and sequences.
- `auth` and `storage`: schema and database metadata archive.
- Storage files: every object is downloaded through the authenticated Storage
  API, hashed, and included with its original bucket/name manifest.
- Each plaintext file has a SHA-256 entry in the encrypted bundle.

Supabase Storage database backups contain object metadata but not the object
bytes, which is why the workflow exports Storage files separately.

## Encryption and recovery key

Backups are encrypted to this dedicated OpenPGP key:

`8E64028595F233A62435975F2D69FFA65D9ABD72`

The public key is committed at `.github/backup-recovery-public.asc`. The private
recovery key is intentionally outside the repository at:

`C:\Users\aeyon\.orba\backup-recovery-private.asc`

Copy the private key to a second secure offline location. Losing it makes the
off-site backups unrecoverable. Never commit or upload the private key.

To decrypt a downloaded artifact in WSL:

```bash
gpg --import /mnt/c/Users/aeyon/.orba/backup-recovery-private.asc
gpg --output orba-backup.tar.gz --decrypt orba-supabase-*.tar.gz.gpg
tar -xzf orba-backup.tar.gz
sha256sum --check payload/SHA256SUMS
```

## Required GitHub Actions secrets

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

The database connection uses `sslmode=verify-full` with the pinned Supabase CA.
The secret key is used only when Storage contains files; it is never written to
the backup or logs.

## Manual run

Open **Actions → Encrypted Supabase backup → Run workflow**. A successful run
must pass the isolated restore test before the encrypted artifact is uploaded.
