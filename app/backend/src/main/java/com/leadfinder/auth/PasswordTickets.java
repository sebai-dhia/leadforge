package com.leadfinder.auth;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * What a Google sign-in proved, kept for the few minutes it takes to choose a password. A ticket is not a session:
 * the API does not accept it, it works once, and it ends after ten minutes. Kept in memory (one running backend).
 */
@Component
public class PasswordTickets {

    /** CREATE: a new account. SET: a Google account without a password yet. RESET: forgotten password. */
    public enum Purpose { CREATE, SET, RESET }

    /** userId is null for CREATE. */
    public record Ticket(Purpose purpose, String googleSub, String email, String name, Long userId, Instant expires) {}

    static final Duration LIFETIME = Duration.ofMinutes(10);

    private final SecureRandom random = new SecureRandom();
    private final Map<String, Ticket> tickets = new ConcurrentHashMap<>();

    public String issue(Purpose purpose, String googleSub, String email, String name, Long userId) {
        Instant now = Instant.now();
        tickets.values().removeIf(t -> t.expires().isBefore(now));
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String id = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tickets.put(id, new Ticket(purpose, googleSub, email, name, userId, now.plus(LIFETIME)));
        return id;
    }

    /** The ticket, left in place: a refused password can be corrected without signing in with Google again. */
    public Optional<Ticket> peek(String id) {
        Ticket t = id == null ? null : tickets.get(id);
        return t == null || t.expires().isBefore(Instant.now()) ? Optional.empty() : Optional.of(t);
    }

    /** The ticket, removed so it cannot be used again; empty when unknown, used or expired. */
    public Optional<Ticket> take(String id) {
        Ticket t = id == null ? null : tickets.remove(id);
        return t == null || t.expires().isBefore(Instant.now()) ? Optional.empty() : Optional.of(t);
    }

    public void reset() {
        tickets.clear();
    }
}
