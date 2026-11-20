BEGIN;

-- These names can still exist in environments where the older migration was
-- only partially applied. Favorites now maintains likes via its trigger.
DROP FUNCTION IF EXISTS public.increment_likes(text);
DROP FUNCTION IF EXISTS public.decrement_likes(text);

-- Triggers execute under their existing definitions. The Data API never
-- needs to call the trigger functions as RPCs.
REVOKE EXECUTE ON FUNCTION
  public.enforce_article_insert_rules(),
  public.enforce_article_update_rules(),
  public.enforce_comment_rate_limit(),
  public.enforce_comment_update_rules_and_history(),
  public.enforce_contact_rate_limit(),
  public.enforce_profile_initial_role(),
  public.enforce_series_update_rules(),
  public.handle_new_user(),
  public.prevent_self_role_escalation(),
  public.sync_article_likes_on_favorite(),
  public.validate_article_content()
  FROM PUBLIC, anon, authenticated, service_role;

-- Browser RPCs and the editor RLS helper need only client grants.
REVOKE EXECUTE ON FUNCTION
  public.admin_change_user_role(text, text),
  public.admin_get_all_profiles(),
  public.admin_set_user_roles(text, text[]),
  public.check_is_editor(),
  public.clean_unverified_mfa_factors(),
  public.get_follow_counts(uuid),
  public.increment_views(text),
  public.publish_due_scheduled_articles(),
  public.submit_contact_message(text, text, text, text, text)
  FROM service_role;

COMMIT;
