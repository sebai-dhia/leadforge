-- Settings the admin changes from the app. A row overrides the value from the environment (.env); no row means the environment value is used.
CREATE TABLE app_settings (
    setting_key   VARCHAR(80) PRIMARY KEY,
    setting_value VARCHAR(200) NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
