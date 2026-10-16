package com.leadfinder.usage;

import com.leadfinder.config.AppProperties;
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
    private final AppProperties props;

    public int limit(Kind kind) {
        AppProperties.Limits l = props.limits();
        return switch (kind) {
            case SEARCH -> l.searchesPerDay();
            case DRAFT -> l.draftsPerDay();
            case ENRICH -> l.enrichPerDay();
        };
    }

    public Usage usage(Long userId, Kind kind) {
        long used = events.countByUserIdAndKindAndCreatedAtAfter(userId, kind.name(), Instant.now().minus(WINDOW));
        return new Usage((int) used, limit(kind));
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
        Usage u = usage(userId, kind);
        if (u.used() >= u.limit()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Daily limit of " + u.limit() + " " + kind.label + " reached. It frees up gradually over 24 hours.");
        }
        return events.save(new UsageEvent(userId, kind.name())).getId();
    }

    /** Gives a use back when the action failed through no fault of the user. */
    public void refund(Long eventId) {
        if (eventId != null) {
            events.deleteById(eventId);
        }
    }
}
