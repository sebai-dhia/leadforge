package com.leadfinder.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * Keeps revoked sessions and users in the database, so a restart does not accept their tokens again.
 * {@link ActiveSessionRegistry} still answers every request from memory; this is only read once at startup.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RevokedTokenStore {

    public static final String SESSION = "SESSION";
    public static final String USER = "USER";

    public record Revoked(String kind, String key, Instant revokedAt) {}

    private final JdbcTemplate jdbc;

    /** Never throws: the revocation already holds in memory, a database hiccup only means it would not survive a restart. */
    public void save(String kind, String key, Instant at) {
        try {
            jdbc.update("insert into revoked_tokens (kind, key, revoked_at) values (?, ?, ?) "
                    + "on conflict (kind, key) do update set revoked_at = excluded.revoked_at", kind, key, Timestamp.from(at));
        } catch (RuntimeException e) {
            log.warn("Could not save the revoked {} {}: {}", kind, key, e.getMessage());
        }
    }

    public List<Revoked> loadSince(Instant cutoff) {
        return jdbc.query("select kind, key, revoked_at from revoked_tokens where revoked_at >= ?",
                (rs, i) -> new Revoked(rs.getString(1), rs.getString(2), rs.getTimestamp(3).toInstant()),
                Timestamp.from(cutoff));
    }

    public void deleteBefore(Instant cutoff) {
        try {
            jdbc.update("delete from revoked_tokens where revoked_at < ?", Timestamp.from(cutoff));
        } catch (RuntimeException e) {
            log.warn("Could not prune revoked tokens: {}", e.getMessage());
        }
    }

    /** Used by tests. */
    public void deleteAll() {
        jdbc.update("delete from revoked_tokens");
    }
}
