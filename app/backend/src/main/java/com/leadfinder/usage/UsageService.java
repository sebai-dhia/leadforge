package com.leadfinder.usage;

import com.leadfinder.config.AppProperties;
import com.leadfinder.settings.RuntimeSettings;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** Daily limits per user for the actions that cost money: searches, AI messages and contact lookups. */
@Service
@RequiredArgsConstructor
public class UsageService {
    public enum Kind {
        SEARCH("searches"), DRAFT("messages"), ENRICH("contact lookups");

        final String label;

        Kind(String label) {
            this.label = label;
        }
    }

    public record Usage(int used, int limit) {
        public int remaining() {
            return Math.max(0, limit - used);
        }
    }

    private static final Duration WINDOW = Duration.ofHours(24);

    private final UsageEventRepository events;
    private final RuntimeSettings settings;
    private final com.leadfinder.auth.UserRepository users;
    private final com.leadfinder.alert.AlertService alerts;

    public int limit(Kind kind) {
        AppProperties.Limits l = settings.limits();
        return switch (kind) {
            case SEARCH -> l.searchesPerDay();
            case DRAFT -> l.draftsPerDay();
            case ENRICH -> l.enrichPerDay();
        };
    }

    /** Guests get smaller limits than real accounts. */
    public int limit(Long userId, Kind kind) {
        return limitFor(users.findById(userId).map(com.leadfinder.auth.AppUser::getRole).orElse(null), kind);
    }

    /** The daily limit of an account with this role. */
    public int limitFor(String role, Kind kind) {
        AppProperties.Guest g = settings.guest();
        if (g == null || !"GUEST".equals(role)) return limit(kind);
        return switch (kind) {
            case SEARCH -> g.searchesPerDay();
            case DRAFT -> g.draftsPerDay();
            case ENRICH -> g.enrichPerDay();
        };
    }

    public Usage usage(Long userId, Kind kind) {
        long used = events.countByUserIdAndKindAndRefundedFalseAndCreatedAtAfter(userId, kind.name(), Instant.now().minus(WINDOW));
        return new Usage((int) used, limit(userId, kind));
    }

    public Map<String, Usage> all(Long userId) {
        Map<String, Usage> out = new LinkedHashMap<>();
        for (Kind k : Kind.values()) {
            out.put(k.name().toLowerCase(), usage(userId, k));
        }
        return out;
    }

    /**
     * Counts one use, or throws 429 when the daily limit is reached.
     * Returns the event id so a failed action can be refunded.
     */
    public Long consume(Long userId, Kind kind) {
        checkGlobalCap(userId, kind);
        Usage u = usage(userId, kind);
        if (u.used() >= u.limit()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Daily limit of " + u.limit() + " " + kind.label + " reached. It frees up gradually over 24 hours.");
        }
        return events.save(new UsageEvent(userId, kind.name())).getId();
    }

    /** The ceiling for all users together. The admin is never blocked by it. */
    private void checkGlobalCap(Long userId, Kind kind) {
        AppProperties.Caps c = settings.caps();
        if (c == null) return;
        int cap = switch (kind) {
            case SEARCH -> c.searchesPerDay();
            case DRAFT -> c.draftsPerDay();
            case ENRICH -> c.enrichPerDay();
        };
        if (cap <= 0) return;
        if (events.countByKindAndRefundedFalseAndCreatedAtAfter(kind.name(), Instant.now().minus(WINDOW)) < cap) return;
        if (users.findById(userId).map(com.leadfinder.auth.AppUser::isAdmin).orElse(false)) return;
        alerts.send("cap-" + kind.name(), "The daily cap of " + cap + " " + kind.label + " for all users is reached.");
        throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "The demo has reached its daily limit of " + kind.label + ". Please try again tomorrow.");
    }

    /** Gives a use back when the action failed through no fault of the user. The event stays, marked, for the admin. */
    public void refund(Long eventId) {
        if (eventId == null) return;
        events.findById(eventId).ifPresent(e -> {
            e.setRefunded(true);
            events.save(e);
        });
    }
}
