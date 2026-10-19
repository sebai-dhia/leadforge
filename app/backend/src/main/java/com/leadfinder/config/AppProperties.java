package com.leadfinder.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String jwtSecret, String corsOrigin, String publicBaseUrl, N8n n8n, Limits limits, Demo demo, Google google, Guest guest,
                            Caps caps, Alerts alerts) {

    public record N8n(String webhookUrl, String draftUrl, String enrichUrl, String webhookSecret, String callbackSecret) {}

    /** Daily limits are per user over a rolling 24 hours. Login limits are per client address. */
    public record Limits(int searchesPerDay, int draftsPerDay, int enrichPerDay,
                         int loginFailures, int loginWindowMinutes, int registerPerHour) {}

    /** Settings for demo mode and concurrency limits */
    public record Demo(boolean enabled, int maxSessions, int idleMinutes, boolean allowRegistration) {}

    /** The OAuth client ID is public (it is also in the web page); no client secret is used. */
    public record Google(String clientId) {}

    /** One-click temporary accounts: smaller daily limits than a real account, and a cap on creation per address. */
    public record Guest(boolean enabled, int searchesPerDay, int draftsPerDay, int enrichPerDay, int perIpPerHour) {}

    /** Ceilings for everyone together over a rolling 24 hours, so a busy day cannot use up the free API credits. 0 turns a cap off. */
    public record Caps(int searchesPerDay, int draftsPerDay, int enrichPerDay) {}

    /** Telegram bot that tells the admin when something breaks, and the chat that gets new-lead alerts. Empty turns alerts off. */
    public record Alerts(String telegramBotToken, String telegramChatId) {}
}
