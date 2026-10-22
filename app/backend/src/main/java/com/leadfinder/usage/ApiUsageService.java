package com.leadfinder.usage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Keeps what the workflows report spending on Gemini, Serper and Geoapify, for the admin's statistics. */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApiUsageService {
    /** Sanity limits: a workflow run never makes this many calls, so a bigger number is a mistake and is cut. */
    static final long MAX_CALLS = 1_000;
    static final long MAX_TOKENS = 10_000_000;

    private final JdbcTemplate jdbc;

    /**
     * Saves one row for each service that was used. Never throws: the user's request must not fail because
     * the statistics could not be written. userId is empty when the account is already gone.
     */
    public void record(Long userId, String action, ApiMeter meter) {
        if (meter == null) return;
        try {
            save(userId, action, "GEMINI", meter.gemini());
            save(userId, action, "SERPER", meter.serper());
            save(userId, action, "GEOAPIFY", meter.geoapify());
        } catch (RuntimeException e) {
            log.warn("Could not record API usage for {}: {}", action, e.getMessage());
        }
    }

    private void save(Long userId, String action, String provider, ApiMeter.Part part) {
        if (part == null) return;
        long calls = clamp(part.calls(), MAX_CALLS);
        long in = clamp(part.inputTokens(), MAX_TOKENS);
        long out = clamp(part.outputTokens(), MAX_TOKENS);
        if (calls == 0 && in == 0 && out == 0) return;
        jdbc.update("insert into api_usage (user_id, action, provider, calls, input_tokens, output_tokens) values (?, ?, ?, ?, ?, ?)",
                userId, action, provider, (int) calls, in, out);
    }

    private static long clamp(Long v, long max) {
        return v == null ? 0 : Math.max(0, Math.min(v, max));
    }
}
