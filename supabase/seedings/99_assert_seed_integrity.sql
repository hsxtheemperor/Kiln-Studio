DO $$
DECLARE
  inquiry_count bigint;
  engagement_count bigint;
  project_count bigint;
  v_report_id uuid;
BEGIN
  SELECT count(*) INTO inquiry_count
  FROM public.inquiries
  WHERE id::text LIKE 'f3000000-%';

  SELECT count(*) INTO engagement_count
  FROM public.engagements
  JOIN public.inquiries ON inquiries.id = engagements.inquiry_id
  WHERE inquiries.id::text LIKE 'f3000000-%';

  IF inquiry_count <> 100 OR engagement_count <> inquiry_count THEN
    RAISE EXCEPTION 'Seed integrity failed: expected 100 inquiries with one engagement each; found % inquiries and % engagements.',
      inquiry_count, engagement_count;
  END IF;

  IF (
    SELECT count(*)
    FROM public.engagement_events
    JOIN public.engagements ON engagements.id = engagement_events.engagement_id
    JOIN public.inquiries ON inquiries.id = engagements.inquiry_id
    WHERE inquiries.id::text LIKE 'f3000000-%'
      AND engagement_events.event_type = 'created'
  ) <> inquiry_count THEN
    RAISE EXCEPTION 'Seed integrity failed: every seeded engagement must have its creation event.';
  END IF;

  SELECT count(*) INTO project_count
  FROM public.projects
  WHERE inquiry_id::text LIKE 'f3000000-%';

  IF project_count <> 31 THEN
    RAISE EXCEPTION 'Seed integrity failed: expected 31 accepted-inquiry projects; found %.', project_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.projects
    LEFT JOIN public.project_channels ON project_channels.project_id = projects.id
    WHERE projects.inquiry_id::text LIKE 'f3000000-%'
      AND project_channels.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Seed integrity failed: every seeded project must have its generated project channel.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_members
    JOIN public.projects ON projects.id = project_members.project_id
    LEFT JOIN public.project_channel_members
      ON project_channel_members.channel_id = (
        SELECT id FROM public.project_channels WHERE project_id = projects.id
      )
      AND project_channel_members.team_member_id = project_members.team_member_id
    WHERE projects.inquiry_id::text LIKE 'f3000000-%'
      AND project_channel_members.team_member_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Seed integrity failed: project memberships must synchronize to project-channel membership.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.quarterly_reports
    WHERE period_year = extract(year FROM current_date)::smallint
      AND period_quarter = extract(quarter FROM current_date)::smallint
      AND status = 'published'
      AND published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Seed integrity failed: the current-quarter report must publish successfully.';
  END IF;

  SELECT id INTO v_report_id
  FROM public.quarterly_reports
  WHERE period_year = extract(year FROM current_date)::smallint
    AND period_quarter = extract(quarter FROM current_date)::smallint
    AND status = 'published';

  IF NOT EXISTS (
    SELECT 1 FROM public.quarterly_report_lines
    WHERE quarterly_report_lines.report_id = v_report_id
  ) THEN
    RAISE EXCEPTION 'Seed integrity failed: published report must contain generated line items.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.quarterly_report_lines
    WHERE quarterly_report_lines.report_id = v_report_id
  ) < 50 THEN
    RAISE EXCEPTION 'Seed integrity failed: latest report should include the expanded synthetic transactions.';
  END IF;

  IF (SELECT count(*) FROM public.project_revenue) < 30
     OR (SELECT count(*) FROM public.project_payouts) < 25
     OR (SELECT count(*) FROM public.expenses) < 40
     OR (SELECT count(*) FROM public.recurring_expenses) < 15 THEN
    RAISE EXCEPTION 'Seed integrity failed: finance tables do not contain the expected expanded fixture volume.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.inquiry_reference_files
    WHERE inquiry_id IS NOT NULL
  ) < 25 THEN
    RAISE EXCEPTION 'Seed integrity failed: expected attached synthetic reference metadata.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.project_channel_messages
  ) < 80 THEN
    RAISE EXCEPTION 'Seed integrity failed: project channels should contain synthetic collaboration history.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inquiries
    WHERE id::text LIKE 'f3000000-%'
      AND client_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.client_profiles
        WHERE client_profiles.id = inquiries.client_id
      )
  ) THEN
    RAISE EXCEPTION 'Seed integrity failed: client-owned inquiries must reference a client profile.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inquiries
    WHERE id BETWEEN
      'f3000000-0000-4000-8000-000000000011'::uuid
      AND 'f3000000-0000-4000-8000-000000000100'::uuid
      AND (
        position(company IN project_brief) = 0
        OR NOT EXISTS (
          SELECT 1
          FROM public.inquiry_briefs
          WHERE inquiry_briefs.inquiry_id = inquiries.id
            AND inquiry_briefs.brand_message =
              'A useful, memorable experience for ' || inquiries.company || '.'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Seed integrity failed: generated inquiry details must consistently identify the inquiry company.';
  END IF;
END;
$$;
