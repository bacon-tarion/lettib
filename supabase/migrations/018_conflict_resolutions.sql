-- ─── Conflict resolutions: explicit user-chosen positions per disagreement ─
-- Stored as jsonb array of:
--   {
--     id: string,           -- stable conflict id (slug or uuid)
--     topic: string,        -- short name of the disputed point
--     positions: [          -- the choices presented to the user
--       { model: string, claim: string }
--     ],
--     chosen: string|null   -- slug of the model whose position the user picked,
--                           --   or null if not yet resolved
--   }

alter table public.syntheses
  add column if not exists conflict_resolutions jsonb default '[]'::jsonb;
