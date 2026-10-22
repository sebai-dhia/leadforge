package com.leadfinder.auth;

import com.leadfinder.settings.RuntimeSettings;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks concurrent active visitor sessions on shared demo accounts.
 * An active session is one that was active within the configured idle window.
 * Admin users are exempt and do not count toward the visitor limit.
 */
@Component
@RequiredArgsConstructor
public class ActiveSessionRegistry {

    public record DemoStatus(boolean demoFull, int activeSessions, int maxSessions, int idleMinutes) {}

    private final RuntimeSettings settings;
    private final Map<String, Instant> demoSessions = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionUsers = new ConcurrentHashMap<>();

    public boolean canAcceptVisitor() {
        if (!isDemoEnabled()) return true;
        cleanIdleSessions();
        return demoSessions.size() < settings.demo().maxSessions();
    }

    public void registerSession(String sessionId, Long userId) {
        registerSession(sessionId);
        if (sessionId != null && userId != null) sessionUsers.put(sessionId, userId);
    }

    /** Users who currently hold an active session. */
    public java.util.Set<Long> activeUserIds() {
        cleanIdleSessions();
        return new java.util.HashSet<>(sessionUsers.values());
    }

    public void registerSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) return;
        demoSessions.put(sessionId, Instant.now());
    }

    public void touchSession(String sessionId, boolean isDemo) {
        if (!isDemo || sessionId == null || sessionId.isBlank()) return;
        demoSessions.put(sessionId, Instant.now());
    }

    /** Forgets every session. Used by tests so one test's sign-ins do not fill the seats of the next. */
    public void reset() {
        demoSessions.clear();
        sessionUsers.clear();
    }

    public void removeSession(String sessionId) {
        if (sessionId != null) {
            demoSessions.remove(sessionId);
            sessionUsers.remove(sessionId);
        }
    }

    /** Frees the seats of a person whose account was removed. */
    public void removeUser(Long userId) {
        if (userId == null) return;
        sessionUsers.entrySet().removeIf(e -> {
            boolean theirs = userId.equals(e.getValue());
            if (theirs) demoSessions.remove(e.getKey());
            return theirs;
        });
    }

    public DemoStatus getStatus() {
        cleanIdleSessions();
        int active = demoSessions.size();
        int max = isDemoEnabled() ? settings.demo().maxSessions() : 5;
        int idle = isDemoEnabled() ? settings.demo().idleMinutes() : 15;
        return new DemoStatus(active >= max, active, max, idle);
    }

    private boolean isDemoEnabled() {
        return settings.demo() != null && settings.demo().enabled();
    }

    private void cleanIdleSessions() {
        int idleMinutes = isDemoEnabled() ? settings.demo().idleMinutes() : 15;
        Instant cutoff = Instant.now().minus(Duration.ofMinutes(idleMinutes));
        demoSessions.entrySet().removeIf(entry -> {
            boolean idle = entry.getValue().isBefore(cutoff);
            if (idle) sessionUsers.remove(entry.getKey());
            return idle;
        });
    }
}
