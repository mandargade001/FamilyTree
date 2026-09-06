-- Marking a Storage bucket "Public" in the dashboard only affects the
-- direct object-download URL (storage/v1/object/public/...), which bypasses
-- RLS entirely. It does NOT grant permission to *list* a folder's contents —
-- that's a separate operation on storage.objects, gated by ordinary RLS,
-- and it's what the anon key uses from the browser to build each person's
-- photo gallery (uploads go through the Edge Function's service-role key,
-- which bypasses RLS, so uploading worked while browsing silently returned
-- nothing — listPhotos() treats any failure as "no photos yet" by design,
-- so this failure mode produces no visible error at all).
create policy "Public read access to photos bucket"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'photos');
