package com.leadfinder.admin;

import com.leadfinder.auth.ActiveSessionRegistry;
import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import com.leadfinder.config.AppProperties;
import com.leadfinder.settings.RuntimeSettings;
import com.leadfinder.usage.UsageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Read-only numbers for the admin: accounts, usage against the limits, and searches that failed. */
@Service
@RequiredArgsConstructor
public class AdminService {
    static final int DAYS = 30;
    static final int MIN_PASSWORD = 8;
    private static final Duration DAY = Duration.ofHours(24);

    public record Seats(int active, int max) {}

    public record Users(long total, Map<String, Long> byRole, long new7Days, long new30Days, Seats seats) {}

    /** used: uses that counted; refunded: attempts given back because they failed. cap 0 means no cap. */
    public record KindUsage(long used, long refunded, int cap) {}

    public record Searches(long last24h, long failed24h, long pending) {}

    public record Day(LocalDate day, long search, long draft, long enrich) {}

    /** Registered accounts only (guests are counted apart). active*: seen in the last 10 minutes, 24 hours, 7 and 30 days. */
    public record Active(long now, long last24h, long last7d, long last30d, long registered, long guests,
                         long registeredNew30d, long registeredPrev30d) {}

    /** What one outside service was used for: requests, and for Gemini the tokens too. */
    /**
     * lastAnswered: when the service last answered a request (null if never). silent: work that needs the service was
     * done in the last 24 hours (after the workflows started reporting) but it answered nothing, which usually means its
     * key expired or its credits ran out.
     */
    public record Provider(long calls24h, long callsPrev24h, long calls30d, long inputTokens24h, long outputTokens24h,
                           long inputTokens30d, long outputTokens30d, long tokensPrev24h, Instant lastAnswered, boolean silent) {
        Provider withStatus(Instant last, boolean silentNow) {
            return new Provider(calls24h, callsPrev24h, calls30d, inputTokens24h, outputTokens24h, inputTokens30d, outputTokens30d,
                    tokensPrev24h, last, silentNow);
        }
    }

    public record ApiDay(LocalDate day, long gemini, long geminiTokens, long serper, long geoapify) {}

    /** tracked is false until the workflows have reported something once (they must be deployed again to report). */
    public record Api(boolean tracked, Provider gemini, Provider serper, Provider geoapify, List<ApiDay> daily) {}

    public record Overview(Users users, Map<String, KindUsage> usage24h, Searches searches, List<Day> daily, Active active, Api api) {}

    public record Used(long used, int limit) {}

    public record UserRow(long id, String email, String displayName, String role, boolean demo, boolean google,
                          Instant createdAt, Instant lastSeenAt, long searches, Map<String, Used> usage24h) {}

    /**
     * How a search ran, not what it was about: the niche, the area and the leads found are left out.
     * userEmail and userRole are empty when the account was deleted (idle guests).
     */
    public record SearchRow(long id, Instant createdAt, String status, String failureReason,
                            Integer foundCount, Long userId, String userEmail, String userRole) {}

    /** generatedPassword is only set when the admin left the password empty, and it is shown once. */
    public record Created(long id, String email, String generatedPassword) {}

    public record Page<T>(List<T> items, long total, int page, int size) {}

    private final NamedParameterJdbcTemplate db;
    private final ActiveSessionRegistry sessions;
    private final UsageService usage;
    private final RuntimeSettings settings;
    private final UserRepository users;
    private final PasswordEncoder encoder;

    public Overview overview() {
        Instant now = Instant.now();
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("d1", ts(now.minus(DAY)))
                .addValue("d7", ts(now.minus(Duration.ofDays(7))))
                .addValue("d30", ts(now.minus(Duration.ofDays(30))));

        Map<String, Long> byRole = new LinkedHashMap<>();
        db.query("select role, count(*) n from users group by role order by role", p,
                rs -> { byRole.put(rs.getString("role"), rs.getLong("n")); });
        long total = byRole.values().stream().mapToLong(Long::longValue).sum();
        Map<String, Object> fresh = db.queryForMap("select count(*) filter (where created_at > :d7) d7,"
                + " count(*) filter (where created_at > :d30) d30 from users", p);
        ActiveSessionRegistry.DemoStatus seats = sessions.getStatus();
        Users users = new Users(total, byRole, num(fresh.get("d7")), num(fresh.get("d30")),
                new Seats(seats.activeSessions(), seats.maxSessions()));

        Map<String, KindUsage> usage24h = new LinkedHashMap<>();
        for (UsageService.Kind k : UsageService.Kind.values()) {
            usage24h.put(key(k), new KindUsage(0, 0, cap(k)));
        }
        db.query("select kind, count(*) filter (where not refunded) used, count(*) filter (where refunded) refunded"
                + " from usage_events where created_at > :d1 group by kind", p, rs -> {
            UsageService.Kind k = kind(rs.getString("kind"));
            if (k != null) usage24h.put(key(k), new KindUsage(rs.getLong("used"), rs.getLong("refunded"), cap(k)));
        });

        Map<String, Object> s = db.queryForMap("select count(*) filter (where created_at > :d1) last24,"
                + " count(*) filter (where created_at > :d1 and status = 'FAILED') failed24,"
                + " count(*) filter (where status = 'PENDING') pending from search_jobs", p);
        Searches searches = new Searches(num(s.get("last24")), num(s.get("failed24")), num(s.get("pending")));

        return new Overview(users, usage24h, searches, daily(now), active(now), api(now));
    }

    private Active active(Instant now) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("m10", ts(now.minus(Duration.ofMinutes(10))))
                .addValue("d1", ts(now.minus(DAY)))
                .addValue("d7", ts(now.minus(Duration.ofDays(7))))
                .addValue("d30", ts(now.minus(Duration.ofDays(30))))
                .addValue("d60", ts(now.minus(Duration.ofDays(60))));
        Map<String, Object> r = db.queryForMap("select"
                + " count(*) filter (where role <> 'GUEST') registered,"
                + " count(*) filter (where role = 'GUEST') guests,"
                + " count(*) filter (where role <> 'GUEST' and created_at > :d30) new30,"
                + " count(*) filter (where role <> 'GUEST' and created_at > :d60 and created_at <= :d30) prev30,"
                + " count(*) filter (where role <> 'GUEST' and last_seen_at > :m10) online,"
                + " count(*) filter (where role <> 'GUEST' and last_seen_at > :d1) a1,"
                + " count(*) filter (where role <> 'GUEST' and last_seen_at > :d7) a7,"
                + " count(*) filter (where role <> 'GUEST' and last_seen_at > :d30) a30"
                + " from users", p);
        return new Active(num(r.get("online")), num(r.get("a1")), num(r.get("a7")), num(r.get("a30")), num(r.get("registered")),
                num(r.get("guests")), num(r.get("new30")), num(r.get("prev30")));
    }

    /** Calls and tokens the workflows reported, per outside service, for the last 24 hours (and the 24 before) and 30 days. */
    private Api api(Instant now) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("d1", ts(now.minus(DAY)))
                .addValue("d2", ts(now.minus(DAY.multipliedBy(2))))
                .addValue("d30", ts(now.minus(Duration.ofDays(30))));
        Map<String, Provider> by = new LinkedHashMap<>();
        db.query("select provider,"
                + " coalesce(sum(calls) filter (where created_at > :d1), 0) c24,"
                + " coalesce(sum(calls) filter (where created_at > :d2 and created_at <= :d1), 0) cprev,"
                + " coalesce(sum(calls), 0) c30,"
                + " coalesce(sum(input_tokens + output_tokens) filter (where created_at > :d2 and created_at <= :d1), 0) tprev,"
                + " coalesce(sum(input_tokens) filter (where created_at > :d1), 0) i24,"
                + " coalesce(sum(output_tokens) filter (where created_at > :d1), 0) o24,"
                + " coalesce(sum(input_tokens), 0) i30, coalesce(sum(output_tokens), 0) o30"
                + " from api_usage where created_at > :d30 group by provider", p, rs -> {
            by.put(rs.getString("provider"), new Provider(rs.getLong("c24"), rs.getLong("cprev"), rs.getLong("c30"),
                    rs.getLong("i24"), rs.getLong("o24"), rs.getLong("i30"), rs.getLong("o30"), rs.getLong("tprev"), null, false));
        });
        Provider none = new Provider(0, 0, 0, 0, 0, 0, 0, 0, null, false);
        boolean tracked = Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from api_usage)", new MapSqlParameterSource(), Boolean.class));

        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        LocalDate first = today.minusDays(DAYS - 1);
        Map<LocalDate, long[]> days = new LinkedHashMap<>();
        for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) days.put(d, new long[4]);
        db.query("select (created_at at time zone 'UTC')::date d, provider, sum(calls) c, sum(input_tokens + output_tokens) t from api_usage"
                + " where created_at >= :since group by 1, 2",
                new MapSqlParameterSource("since", ts(first.atStartOfDay(ZoneOffset.UTC).toInstant())), rs -> {
            long[] row = days.get(rs.getObject("d", LocalDate.class));
            if (row == null) return;
            switch (rs.getString("provider")) {
                case "GEMINI" -> { row[0] = rs.getLong("c"); row[1] = rs.getLong("t"); }
                case "SERPER" -> row[2] = rs.getLong("c");
                case "GEOAPIFY" -> row[3] = rs.getLong("c");
                default -> { }
            }
        });
        List<ApiDay> daily = new ArrayList<>();
        days.forEach((d, c) -> daily.add(new ApiDay(d, c[0], c[1], c[2], c[3])));
        Provider gemini = by.getOrDefault("GEMINI", none);
        Provider serper = by.getOrDefault("SERPER", none);
        Provider geoapify = by.getOrDefault("GEOAPIFY", none);

        Map<String, Instant> last = new LinkedHashMap<>();
        db.query("select provider, max(created_at) m from api_usage where calls > 0 group by provider", new MapSqlParameterSource(), rs -> {
            Timestamp t = rs.getTimestamp("m");
            if (t != null) last.put(rs.getString("provider"), t.toInstant());
        });

        // Only work done after the workflows began reporting counts: older work has no numbers to compare with.
        boolean silentGemini = false, silentSerper = false, silentGeoapify = false;
        Timestamp since = db.queryForObject("select min(created_at) from api_usage", new MapSqlParameterSource(), Timestamp.class);
        if (since != null) {
            MapSqlParameterSource q = new MapSqlParameterSource().addValue("d1", ts(now.minus(DAY))).addValue("since", since);
            String done = "select count(*) from search_jobs where status = 'DONE' and created_at > :d1 and created_at > :since";
            String kindOk = "select count(*) from usage_events where not refunded and created_at > :d1 and created_at > :since and kind = ";
            long searches = count(done, q);
            long citySearches = count(done + " and bbox is null", q); // a drawn area has no geocoding step
            long messages = count(kindOk + "'DRAFT'", q);
            long lookups = count(kindOk + "'ENRICH'", q);
            silentSerper = searches + lookups > 0 && serper.calls24h() == 0;
            silentGeoapify = citySearches > 0 && geoapify.calls24h() == 0;
            silentGemini = messages > 0 && gemini.calls24h() == 0;
        }
        return new Api(tracked, gemini.withStatus(last.get("GEMINI"), silentGemini), serper.withStatus(last.get("SERPER"), silentSerper),
                geoapify.withStatus(last.get("GEOAPIFY"), silentGeoapify), daily);
    }

    private long count(String sql, MapSqlParameterSource params) {
        return num(db.queryForObject(sql, params, Long.class));
    }

    /** One row per day (UTC) for the last 30 days, oldest first, with days without any use as zeros. */
    private List<Day> daily(Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        LocalDate first = today.minusDays(DAYS - 1);
        Map<LocalDate, long[]> counts = new LinkedHashMap<>();
        for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) counts.put(d, new long[3]);
        MapSqlParameterSource p = new MapSqlParameterSource("since", ts(first.atStartOfDay(ZoneOffset.UTC).toInstant()));
        db.query("select (created_at at time zone 'UTC')::date d, kind, count(*) n from usage_events"
                + " where not refunded and created_at >= :since group by 1, 2", p, rs -> {
            long[] row = counts.get(rs.getObject("d", LocalDate.class));
            UsageService.Kind k = kind(rs.getString("kind"));
            if (row != null && k != null) row[k.ordinal()] = rs.getLong("n");
        });
        List<Day> out = new ArrayList<>();
        counts.forEach((d, c) -> out.add(new Day(d, c[UsageService.Kind.SEARCH.ordinal()],
                c[UsageService.Kind.DRAFT.ordinal()], c[UsageService.Kind.ENRICH.ordinal()])));
        return out;
    }

    /** Most recently active first. q matches the email or the name; role is one exact role or empty for all. */
    public Page<UserRow> users(String q, String role, int page, int size) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("q", likePattern(q))
                .addValue("role", role == null ? "" : role.trim().toUpperCase(Locale.ROOT))
                .addValue("d1", ts(Instant.now().minus(DAY)))
                .addValue("size", size)
                .addValue("offset", (long) page * size);
        String where = " where (:q = '' or lower(u.email) like :q escape '\\' or lower(u.display_name) like :q escape '\\')"
                + " and (:role = '' or u.role = :role)";
        long total = num(db.queryForObject("select count(*) from users u" + where, p, Long.class));
        List<UserRow> rows = db.query("select u.id, u.email, u.display_name, u.role, u.is_demo, u.google_sub is not null google,"
                + " u.created_at, u.last_seen_at,"
                + " (select count(*) from search_jobs j where j.user_id = u.id) searches,"
                + " (select count(*) from usage_events e where e.user_id = u.id and e.kind = 'SEARCH' and not e.refunded and e.created_at > :d1) used_search,"
                + " (select count(*) from usage_events e where e.user_id = u.id and e.kind = 'DRAFT' and not e.refunded and e.created_at > :d1) used_draft,"
                + " (select count(*) from usage_events e where e.user_id = u.id and e.kind = 'ENRICH' and not e.refunded and e.created_at > :d1) used_enrich"
                + " from users u" + where
                + " order by coalesce(u.last_seen_at, u.created_at) desc, u.id desc limit :size offset :offset", p, this::userRow);
        return new Page<>(rows, total, page, size);
    }

    private UserRow userRow(ResultSet rs, int i) throws SQLException {
        String role = rs.getString("role");
        Map<String, Used> used = new LinkedHashMap<>();
        for (UsageService.Kind k : UsageService.Kind.values()) {
            used.put(key(k), new Used(rs.getLong("used_" + key(k)), usage.limitFor(role, k)));
        }
        return new UserRow(rs.getLong("id"), rs.getString("email"), rs.getString("display_name"), role,
                rs.getBoolean("is_demo"), rs.getBoolean("google"), instant(rs, "created_at"), instant(rs, "last_seen_at"),
                rs.getLong("searches"), used);
    }

    /** Newest first. status is FAILED, PENDING or DONE, or empty for all. */
    public Page<SearchRow> searches(String status, int page, int size) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("status", status == null ? "" : status.trim().toUpperCase(Locale.ROOT))
                .addValue("size", size)
                .addValue("offset", (long) page * size);
        String where = " where (:status = '' or j.status = :status)";
        long total = num(db.queryForObject("select count(*) from search_jobs j" + where, p, Long.class));
        List<SearchRow> rows = db.query("select j.id, j.created_at, j.status, j.failure_reason, j.found_count,"
                + " j.user_id, u.email, u.role from search_jobs j left join users u on u.id = j.user_id" + where
                + " order by j.created_at desc, j.id desc limit :size offset :offset", p, (rs, i) -> new SearchRow(
                rs.getLong("id"), instant(rs, "created_at"), rs.getString("status"),
                rs.getString("failure_reason"), (Integer) rs.getObject("found_count"), (Long) rs.getObject("user_id"),
                rs.getString("email"), rs.getString("role")));
        return new Page<>(rows, total, page, size);
    }

    /** A normal account the person signs in to with this email and password; they set up their profile on the first sign-in. */
    @Transactional
    public Created createUser(String email, String displayName, String password) {
        String mail = email.trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmail(mail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This email is already used by another account");
        }
        boolean generated = password == null || password.isEmpty();
        if (!generated && password.length() < MIN_PASSWORD) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The password needs at least " + MIN_PASSWORD + " characters");
        }
        String plain = generated ? randomPassword() : password;
        AppUser u = new AppUser();
        u.setEmail(mail);
        u.setPasswordHash(encoder.encode(plain));
        u.setRole("USER");
        u.setDisplayName(displayName == null ? "" : displayName.trim());
        users.save(u);
        return new Created(u.getId(), mail, generated ? plain : null);
    }

    /**
     * Removes an account with what is personal to it: leads, searches and profile. Its use stays in the daily counts, without
     * the account. The admin cannot remove their own account or another admin.
     */
    @Transactional
    public void deleteUser(long id, long actingAdminId) {
        AppUser u = users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (id == actingAdminId) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You cannot remove your own account");
        }
        if (u.isAdmin()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Admin accounts cannot be removed here");
        }
        db.update("delete from search_jobs where user_id = :id", new MapSqlParameterSource("id", id));
        users.delete(u); // leads and the do-not-show list go with it
        sessions.removeUser(id);
    }

    private static String randomPassword() {
        byte[] b = new byte[15];
        new SecureRandom().nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private int cap(UsageService.Kind k) {
        AppProperties.Caps c = settings.caps();
        if (c == null) return 0;
        return switch (k) {
            case SEARCH -> c.searchesPerDay();
            case DRAFT -> c.draftsPerDay();
            case ENRICH -> c.enrichPerDay();
        };
    }

    private static String key(UsageService.Kind k) {
        return k.name().toLowerCase(Locale.ROOT);
    }

    private static UsageService.Kind kind(String name) {
        try {
            return UsageService.Kind.valueOf(name);
        } catch (IllegalArgumentException | NullPointerException e) {
            return null;
        }
    }

    /** A lowercase LIKE pattern with backslash as the escape character, or "" for no filter. */
    static String likePattern(String q) {
        if (q == null || q.isBlank()) return "";
        String escaped = q.trim().toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private static Timestamp ts(Instant i) {
        return Timestamp.from(i);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    private static long num(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }
}
