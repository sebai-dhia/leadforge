package com.leadfinder.auth;

import com.leadfinder.settings.RuntimeSettings;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Slows down password guessing and mass sign-ups. Failed logins are counted per client address and per
 * address plus email, so one address cannot try many passwords and a victim's email is not locked from elsewhere.
 * State is in memory, which is right for one backend instance. Behind several instances use a shared store.
 */
@Component
@RequiredArgsConstructor
public class AuthThrottle {
    private final RuntimeSettings settings;
    private final Map<String, Deque<Instant>> events = new ConcurrentHashMap<>();

    public void checkLogin(String ip, String email) {
        Duration window = Duration.ofMinutes(settings.limits().loginWindowMinutes());
        int max = settings.limits().loginFailures();
        if (count("lf-ip:" + ip, window) >= max * 6 || count("lf:" + ip + "|" + email, window) >= max) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many failed logins. Try again in " + window.toMinutes() + " minutes.");
        }
    }

    public void recordLoginFailure(String ip, String email) {
        record("lf-ip:" + ip);
        record("lf:" + ip + "|" + email);
    }

    public void clearLogin(String ip, String email) {
        events.remove("lf:" + ip + "|" + email);
    }

    /** Counts every sign-up attempt, successful or not. */
    public void checkAndRecordRegister(String ip) {
        Duration window = Duration.ofHours(1);
        if (count("reg:" + ip, window) >= settings.limits().registerPerHour()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many sign-ups from this address. Try again later.");
        }
        record("reg:" + ip);
    }

    /** Counts every guest account created from an address. */
    public void checkAndRecordGuest(String ip) {
        Duration window = Duration.ofHours(1);
        if (count("guest:" + ip, window) >= settings.guest().perIpPerHour()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many guest sessions from this address. Try again later or sign in with Google.");
        }
        record("guest:" + ip);
    }

    private void record(String key) {
        Deque<Instant> q = events.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            q.addLast(Instant.now());
        }
    }

    private int count(String key, Duration window) {
        Deque<Instant> q = events.get(key);
        if (q == null) return 0;
        Instant cutoff = Instant.now().minus(window);
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst().isBefore(cutoff)) {
                q.removeFirst();
            }
            return q.size();
        }
    }

    /** Forgets every counter. Used by tests so one test does not use up the next one's allowance. */
    public void reset() {
        events.clear();
    }

    /** Drops idle entries so the map cannot grow without bound. */
    @Scheduled(fixedDelay = 600_000, initialDelay = 600_000)
    void cleanup() {
        Instant cutoff = Instant.now().minus(Duration.ofHours(2));
        events.entrySet().removeIf(e -> {
            Deque<Instant> q = e.getValue();
            synchronized (q) {
                return q.isEmpty() || q.peekLast().isBefore(cutoff);
            }
        });
    }
}
