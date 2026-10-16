package com.leadfinder.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String jwtSecret, String corsOrigin, String publicBaseUrl, N8n n8n, Limits limits) {

    public record N8n(String webhookUrl, String draftUrl, String enrichUrl, String webhookSecret, String callbackSecret) {}

    /** Daily limits are per user over a rolling 24 hours. Login limits are per client address. */
    public record Limits(int searchesPerDay, int draftsPerDay, int enrichPerDay,
                         int loginFailures, int loginWindowMinutes, int registerPerHour) {}
}
