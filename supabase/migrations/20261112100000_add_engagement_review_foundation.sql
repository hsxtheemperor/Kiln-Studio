CREATE TABLE public.engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL UNIQUE REFERENCES public.inquiries(id) ON DELETE CASCADE,
  review_state text NOT NULL DEFAULT 'pending'
    CHECK (review_state IN ('pending', 'suitable', 'not_suitable', 'needs_info')),
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  deal_lead_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (review_notes IS NULL OR char_length(review_notes) <= 2000),
  CHECK (deal_lead_id IS NULL OR claimed_at IS NOT NULL)
);

CREATE INDEX engagements_queue_idx
  ON public.engagements (review_state, created_at DESC, id);

CREATE INDEX engagements_deal_lead_idx
  ON public.engagements (deal_lead_id, updated_at DESC)
  WHERE deal_lead_id IS NOT NULL;

CREATE TABLE public.engagement_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('created', 'reviewed', 'claimed', 'reassigned')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_state text,
  next_state text,
  previous_deal_lead_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  next_deal_lead_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX engagement_events_engagement_idx
  ON public.engagement_events (engagement_id, occurred_at DESC, id DESC);

ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.engagements, public.engagement_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.engagements, public.engagement_events TO authenticated;

CREATE OR REPLACE FUNCTION public.is_deal_lead_or_studio_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND auth.jwt() -> 'app_metadata' ->> 'access_level'
      IN ('deal_lead', 'studio_member');
$$;

REVOKE ALL ON FUNCTION public.is_deal_lead_or_studio_member()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_deal_lead_or_studio_member()
  TO authenticated;

CREATE POLICY engagements_read_for_deal_leads
  ON public.engagements
  FOR SELECT
  TO authenticated
  USING (public.is_deal_lead_or_studio_member());

CREATE POLICY engagement_events_read_for_deal_leads
  ON public.engagement_events
  FOR SELECT
  TO authenticated
  USING (public.is_deal_lead_or_studio_member());

CREATE OR REPLACE FUNCTION public.set_engagement_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_engagement_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER engagements_set_updated_at
  BEFORE UPDATE ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_engagement_updated_at();

CREATE OR REPLACE FUNCTION public.create_engagement_for_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_engagement_id uuid;
BEGIN
  INSERT INTO public.engagements (inquiry_id)
  VALUES (NEW.id)
  ON CONFLICT (inquiry_id) DO NOTHING
  RETURNING id INTO v_engagement_id;

  IF v_engagement_id IS NOT NULL THEN
    INSERT INTO public.engagement_events (engagement_id, event_type)
    VALUES (v_engagement_id, 'created');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_engagement_for_inquiry()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER inquiries_create_engagement
  AFTER INSERT ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.create_engagement_for_inquiry();

CREATE OR REPLACE FUNCTION public.require_claimed_suitable_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_review_state text;
  v_deal_lead_id uuid;
BEGIN
  IF NEW.status = 'accepted'
     AND (
       TG_OP = 'INSERT'
       OR CASE
         WHEN TG_OP = 'UPDATE' THEN OLD.status IS DISTINCT FROM NEW.status
         ELSE false
       END
     ) THEN
    SELECT engagements.review_state, engagements.deal_lead_id
    INTO v_review_state, v_deal_lead_id
    FROM public.engagements AS engagements
    WHERE engagements.inquiry_id = NEW.id
    FOR UPDATE;

    IF NOT FOUND
       OR v_review_state <> 'suitable'
       OR v_deal_lead_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'An inquiry must be marked suitable and assigned to a deal lead before acceptance.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_claimed_suitable_engagement()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER inquiries_require_engagement_before_acceptance_insert
  BEFORE INSERT ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.require_claimed_suitable_engagement();

CREATE TRIGGER inquiries_require_engagement_before_acceptance_update
  BEFORE UPDATE OF status ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.require_claimed_suitable_engagement();

INSERT INTO public.engagements (inquiry_id)
SELECT inquiries.id
FROM public.inquiries AS inquiries
WHERE inquiries.status IN ('new', 'contacted')
ON CONFLICT (inquiry_id) DO NOTHING;

INSERT INTO public.engagement_events (engagement_id, event_type)
SELECT engagements.id, 'created'
FROM public.engagements AS engagements
WHERE NOT EXISTS (
  SELECT 1
  FROM public.engagement_events AS events
  WHERE events.engagement_id = engagements.id
    AND events.event_type = 'created'
);

DROP POLICY IF EXISTS "Studio members can read inquiries" ON public.inquiries;
CREATE POLICY inquiries_select_for_studio_and_deal_lead
  ON public.inquiries
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level'
      IN ('studio_member', 'deal_lead')
  );

DROP POLICY IF EXISTS project_briefs_select_for_studio_or_assigned_designers
  ON public.inquiry_briefs;
CREATE POLICY inquiry_briefs_select_for_studio_deal_lead_or_assigned_designers
  ON public.inquiry_briefs
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level'
      IN ('studio_member', 'deal_lead')
    OR (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'designer'
      AND public.can_access_inquiry_project(inquiry_briefs.inquiry_id)
    )
  );

CREATE OR REPLACE FUNCTION public.review_engagement(
  p_inquiry_id uuid,
  p_review_state text,
  p_notes text DEFAULT NULL
)
RETURNS public.engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_access_level text := auth.jwt() -> 'app_metadata' ->> 'access_level';
  v_engagement public.engagements%ROWTYPE;
  v_updated public.engagements%ROWTYPE;
BEGIN
  IF v_actor IS NULL
     OR v_access_level IS DISTINCT FROM 'deal_lead'
        AND v_access_level IS DISTINCT FROM 'studio_member' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Deal-lead access is required.';
  END IF;
  IF p_review_state IS NULL
     OR p_review_state NOT IN ('suitable', 'not_suitable', 'needs_info')
     OR p_notes IS NOT NULL AND char_length(p_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid engagement review.';
  END IF;

  SELECT engagements.* INTO v_engagement
  FROM public.engagements AS engagements
  WHERE engagements.inquiry_id = p_inquiry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Engagement not found.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inquiries AS inquiries
    WHERE inquiries.id = p_inquiry_id
      AND inquiries.status IN ('new', 'contacted')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only open inquiries can be reviewed.';
  END IF;
  IF v_engagement.deal_lead_id IS NOT NULL
     AND v_engagement.deal_lead_id <> v_actor
     AND v_access_level <> 'studio_member' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the engagement owner can review this inquiry.';
  END IF;
  UPDATE public.engagements
  SET review_state = p_review_state,
      review_notes = NULLIF(pg_catalog.btrim(p_notes), ''),
      reviewed_by = v_actor,
      reviewed_at = pg_catalog.now()
  WHERE id = v_engagement.id
  RETURNING * INTO v_updated;

  INSERT INTO public.engagement_events (
    engagement_id, event_type, actor_user_id, previous_state, next_state,
    previous_deal_lead_id, next_deal_lead_id, notes
  )
  VALUES (
    v_updated.id, 'reviewed', v_actor, v_engagement.review_state,
    v_updated.review_state, v_engagement.deal_lead_id,
    v_updated.deal_lead_id, v_updated.review_notes
  );

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.review_engagement(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_engagement(uuid, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_engagement(p_inquiry_id uuid)
RETURNS public.engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_access_level text := auth.jwt() -> 'app_metadata' ->> 'access_level';
  v_engagement public.engagements%ROWTYPE;
  v_updated public.engagements%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_access_level IS DISTINCT FROM 'deal_lead' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Deal-lead access is required to claim an engagement.';
  END IF;

  SELECT engagements.* INTO v_engagement
  FROM public.engagements AS engagements
  WHERE engagements.inquiry_id = p_inquiry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Engagement not found.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inquiries AS inquiries
    WHERE inquiries.id = p_inquiry_id
      AND inquiries.status IN ('new', 'contacted')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only open inquiries can be claimed.';
  END IF;
  IF v_engagement.review_state <> 'suitable' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only suitable inquiries can be claimed.';
  END IF;
  IF v_engagement.deal_lead_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Engagement has already been claimed.';
  END IF;

  UPDATE public.engagements
  SET deal_lead_id = v_actor,
      claimed_at = pg_catalog.now()
  WHERE id = v_engagement.id
  RETURNING * INTO v_updated;

  INSERT INTO public.engagement_events (
    engagement_id, event_type, actor_user_id, previous_state, next_state,
    previous_deal_lead_id, next_deal_lead_id
  )
  VALUES (
    v_updated.id, 'claimed', v_actor, v_engagement.review_state,
    v_updated.review_state, NULL, v_actor
  );

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_engagement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_engagement(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reassign_engagement(
  p_inquiry_id uuid,
  p_deal_lead_id uuid
)
RETURNS public.engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_access_level text := auth.jwt() -> 'app_metadata' ->> 'access_level';
  v_engagement public.engagements%ROWTYPE;
  v_updated public.engagements%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_access_level IS DISTINCT FROM 'studio_member' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Studio-member access is required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS users
    WHERE users.id = p_deal_lead_id
      AND users.raw_app_meta_data ->> 'access_level' = 'deal_lead'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The assignee must be a deal lead.';
  END IF;

  SELECT engagements.* INTO v_engagement
  FROM public.engagements AS engagements
  WHERE engagements.inquiry_id = p_inquiry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Engagement not found.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inquiries AS inquiries
    WHERE inquiries.id = p_inquiry_id
      AND inquiries.status IN ('new', 'contacted')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only open inquiries can be assigned.';
  END IF;
  IF v_engagement.review_state <> 'suitable' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only suitable inquiries can be assigned.';
  END IF;

  UPDATE public.engagements
  SET deal_lead_id = p_deal_lead_id,
      claimed_at = COALESCE(claimed_at, pg_catalog.now())
  WHERE id = v_engagement.id
  RETURNING * INTO v_updated;

  INSERT INTO public.engagement_events (
    engagement_id, event_type, actor_user_id, previous_state, next_state,
    previous_deal_lead_id, next_deal_lead_id
  )
  VALUES (
    v_updated.id,
    'reassigned',
    v_actor, v_engagement.review_state, v_updated.review_state,
    v_engagement.deal_lead_id, v_updated.deal_lead_id
  );

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_engagement(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_engagement(uuid, uuid)
  TO authenticated;
