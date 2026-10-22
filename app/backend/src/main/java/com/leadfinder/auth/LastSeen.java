package com.leadfinder.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Records when each person last made a request, for the admin. Written at most every few minutes per person. */
@Component
@RequiredArgsConstructor
public class LastSeen {
    static final Duration EVERY = Duration.ofMinutes(5);

    private final UserRepository users;
    private final Map<Long, Instant> written = new ConcurrentHashMap<>();

    public void touch(Long userId) {
        if (userId == null) return;
        Instant now = Instant.now();
        Instant prev = written.get(userId);
        if (prev != null && prev.isAfter(now.minus(EVERY))) return;
        written.put(userId, now);
        users.touchLastSeen(userId, now);
    }

    /** Forgets what was written. Used by tests. */
    public void reset() {
        written.clear();
    }
}
