-- Enable email auto-confirmation so new signups land on /dashboard immediately
-- without requiring users to click a confirmation link.
UPDATE auth.config SET mailer_autoconfirm = true;
