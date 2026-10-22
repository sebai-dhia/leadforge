package com.leadfinder.auth;

import com.leadfinder.settings.RuntimeSettings;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.SmartInitializingSingleton;
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
public class ActiveSessionRegistry implements SmartInitializingSingleton {

    public record DemoStatus(boolean demoFull, int activeSessions, int maxSessions, int idleMinutes) {}

    private final RuntimeSettings settings;
    private final RevokedTokenStore revokedStore;
    private final Map<String, Instant> demoSessions = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionUsers = new ConcurrentHashMap<>();
    /**
     * Tokens that must no longer be accepted. An entry is useless once the token would have expired anyway.
     * Requests are checked against these maps; the database copy only brings them back after a restart.
     */
    private final Map<String, Instant> revokedSessions = new ConcurrentHashMap<>();
    private final Map<Long, Instant> revokedUsers = new ConcurrentHashMap<>();

    /** Runs once every bean is ready (Flyway included), before the server takes requests. */
    @Override
    public void afterSingletonsInstantiated() {
        for (RevokedTokenStore.Revoked r : revokedStore.loadSince(revokedCutoff())) {
            if (RevokedTokenStore.USER.equals(r.kind())) revokedUsers.put(Long.valueOf(r.key()), r.revokedAt());
            else revokedSessions.put(r.key(), r.revokedAt());
        }
    }

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
        revokedSessions.clear();
        revokedUsers.clear();
        revokedStore.deleteAll();
    }

    /** Logout: the token with this session id is refused from now on, and its seat is freed. */
    public void revokeSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) return;
        pruneRevoked();
        Instant now = Instant.now();
        revokedSessions.put(sessionId, now);
        revokedStore.save(RevokedTokenStore.SESSION, sessionId, now);
        removeSession(sessionId);
    }

    /** Every token of a removed account is refused (user ids are never reused). */
    public void revokeUser(Long userId) {
        if (userId == null) return;
        pruneRevoked();
        Instant now = Instant.now();
        revokedUsers.put(userId, now);
        revokedStore.save(RevokedTokenStore.USER, userId.toString(), now);
    }

    public boolean isRevoked(String sessionId, Long userId) {
        return (sessionId != null && revokedSessions.containsKey(sessionId))
                || (userId != null && revokedUsers.containsKey(userId));
    }

    private void pruneRevoked() {
        Instant cutoff = revokedCutoff();
        revokedSessions.values().removeIf(t -> t.isBefore(cutoff));
        revokedUsers.values().removeIf(t -> t.isBefore(cutoff));
        revokedStore.deleteBefore(cutoff);
    }

    private static Instant revokedCutoff() {
        return Instant.now().minus(TokenService.LIFETIME).minusSeconds(60);
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
        revokeUser(userId);
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
