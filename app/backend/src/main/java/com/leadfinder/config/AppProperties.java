package com.leadfinder.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String jwtSecret, String corsOrigin, String publicBaseUrl, N8n n8n) {
    public record N8n(String webhookUrl, String draftUrl, String webhookSecret, String callbackSecret) {}
}
