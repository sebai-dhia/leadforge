package com.leadfinder.settings;

import com.leadfinder.config.AppProperties;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The limits, caps and demo settings as they are right now: the value the admin saved in the database, or else the
 * one from the environment (.env). Changes apply at once, without a restart. Secrets never go through here.
 */
@Service
@RequiredArgsConstructor
public class RuntimeSettings {
    public enum Type { INT, BOOL }

    /** group is for the admin page; min and max are for numbers. */
    public record Def(String key, String group, Type type, int min, int max) {}

    public record Entry(String key, String group, Type type, int min, int max, String value, String defaultValue, boolean overridden) {}

    static final List<Def> DEFS = List.of(
            num("limits.searchesPerDay", "limits", 0, 10_000),
            num("limits.draftsPerDay", "limits", 0, 10_000),
            num("limits.enrichPerDay", "limits", 0, 10_000),
            num("caps.searchesPerDay", "caps", 0, 100_000),
            num("caps.draftsPerDay", "caps", 0, 100_000),
            num("caps.enrichPerDay", "caps", 0, 100_000),
            bool("guest.enabled", "guests"),
            num("guest.searchesPerDay", "guests", 0, 10_000),
            num("guest.draftsPerDay", "guests", 0, 10_000),
            num("guest.enrichPerDay", "guests", 0, 10_000),
            num("guest.perIpPerHour", "guests", 1, 10_000),
            num("demo.maxSessions", "demo", 1, 1_000),
            num("demo.idleMinutes", "demo", 1, 1_440),
            num("limits.loginFailures", "throttle", 1, 1_000),
            num("limits.loginWindowMinutes", "throttle", 1, 1_440),
            num("limits.registerPerHour", "throttle", 1, 10_000));

    private static Def num(String key, String group, int min, int max) {
        return new Def(key, group, Type.INT, min, max);
    }

    private static Def bool(String key, String group) {
        return new Def(key, group, Type.BOOL, 0, 0);
    }

    private final AppProperties props;
    private final AppSettingRepository repo;

    private volatile Map<String, String> overrides = Map.of();

    @PostConstruct
    public void load() {
        overrides = repo.findAll().stream().collect(Collectors.toUnmodifiableMap(AppSetting::getKey, AppSetting::getValue));
    }

    public AppProperties.Limits limits() {
        AppProperties.Limits b = props.limits();
        return new AppProperties.Limits(
                i("limits.searchesPerDay", b.searchesPerDay()), i("limits.draftsPerDay", b.draftsPerDay()), i("limits.enrichPerDay", b.enrichPerDay()),
                i("limits.loginFailures", b.loginFailures()), i("limits.loginWindowMinutes", b.loginWindowMinutes()),
                i("limits.registerPerHour", b.registerPerHour()));
    }

    /** Null when the environment has no caps at all (only in tests). */
    public AppProperties.Caps caps() {
        AppProperties.Caps b = props.caps();
        if (b == null) return null;
        return new AppProperties.Caps(i("caps.searchesPerDay", b.searchesPerDay()), i("caps.draftsPerDay", b.draftsPerDay()),
                i("caps.enrichPerDay", b.enrichPerDay()));
    }

    public AppProperties.Guest guest() {
        AppProperties.Guest b = props.guest();
        if (b == null) return null;
        return new AppProperties.Guest(bool("guest.enabled", b.enabled()), i("guest.searchesPerDay", b.searchesPerDay()),
                i("guest.draftsPerDay", b.draftsPerDay()), i("guest.enrichPerDay", b.enrichPerDay()), i("guest.perIpPerHour", b.perIpPerHour()));
    }

    /** "enabled" is not editable: turning the demo on or off changes how the whole app behaves, so it stays in .env. */
    public AppProperties.Demo demo() {
        AppProperties.Demo b = props.demo();
        if (b == null) return null;
        return new AppProperties.Demo(b.enabled(), i("demo.maxSessions", b.maxSessions()), i("demo.idleMinutes", b.idleMinutes()));
    }

    /** Every editable setting that the environment defines, with its current and default value. */
    public List<Entry> entries() {
        Map<String, String> defaults = defaults();
        Map<String, String> now = overrides;
        return DEFS.stream().filter(d -> defaults.containsKey(d.key())).map(d -> {
            String def = defaults.get(d.key());
            String set = now.get(d.key());
            return new Entry(d.key(), d.group(), d.type(), d.min(), d.max(), set != null ? set : def, def, set != null);
        }).toList();
    }

    /**
     * Saves changes: a value sets the setting, a null or empty value goes back to the .env value. A value equal to the
     * .env value is not stored, so a later .env change still applies. Nothing is saved when any value is not valid.
     */
    @Transactional
    public void save(Map<String, String> changes) {
        Map<String, String> defaults = defaults();
        Map<String, String> clean = new LinkedHashMap<>();
        for (Map.Entry<String, String> c : changes.entrySet()) {
            Def d = DEFS.stream().filter(x -> x.key().equals(c.getKey())).findFirst()
                    .filter(x -> defaults.containsKey(x.key()))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown setting: " + c.getKey()));
            clean.put(d.key(), c.getValue() == null || c.getValue().isBlank() ? null : normalize(d, c.getValue().trim()));
        }
        for (Map.Entry<String, String> c : clean.entrySet()) {
            String value = c.getValue();
            if (value == null || value.equals(defaults.get(c.getKey()))) {
                if (repo.existsById(c.getKey())) repo.deleteById(c.getKey());
            } else {
                repo.save(new AppSetting(c.getKey(), value));
            }
        }
        repo.flush();
        load();
    }

    private static String normalize(Def d, String v) {
        if (d.type() == Type.BOOL) {
            if (!v.equals("true") && !v.equals("false")) throw bad(d, "must be true or false");
            return v;
        }
        int n;
        try {
            n = Integer.parseInt(v);
        } catch (NumberFormatException e) {
            throw bad(d, "must be a whole number");
        }
        if (n < d.min() || n > d.max()) throw bad(d, "must be between " + d.min() + " and " + d.max());
        return String.valueOf(n);
    }

    private static ResponseStatusException bad(Def d, String what) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, d.key() + " " + what);
    }

    private Map<String, String> defaults() {
        Map<String, String> m = new HashMap<>();
        AppProperties.Limits l = props.limits();
        m.put("limits.searchesPerDay", s(l.searchesPerDay()));
        m.put("limits.draftsPerDay", s(l.draftsPerDay()));
        m.put("limits.enrichPerDay", s(l.enrichPerDay()));
        m.put("limits.loginFailures", s(l.loginFailures()));
        m.put("limits.loginWindowMinutes", s(l.loginWindowMinutes()));
        m.put("limits.registerPerHour", s(l.registerPerHour()));
        AppProperties.Caps c = props.caps();
        if (c != null) {
            m.put("caps.searchesPerDay", s(c.searchesPerDay()));
            m.put("caps.draftsPerDay", s(c.draftsPerDay()));
            m.put("caps.enrichPerDay", s(c.enrichPerDay()));
        }
        AppProperties.Guest g = props.guest();
        if (g != null) {
            m.put("guest.enabled", s(g.enabled()));
            m.put("guest.searchesPerDay", s(g.searchesPerDay()));
            m.put("guest.draftsPerDay", s(g.draftsPerDay()));
            m.put("guest.enrichPerDay", s(g.enrichPerDay()));
            m.put("guest.perIpPerHour", s(g.perIpPerHour()));
        }
        AppProperties.Demo d = props.demo();
        if (d != null) {
            m.put("demo.maxSessions", s(d.maxSessions()));
            m.put("demo.idleMinutes", s(d.idleMinutes()));
        }
        return m;
    }

    private static String s(Object o) {
        return String.valueOf(o);
    }

    private int i(String key, int base) {
        String v = overrides.get(key);
        if (v == null) return base;
        try {
            return Integer.parseInt(v);
        } catch (NumberFormatException e) {
            return base;
        }
    }

    private boolean bool(String key, boolean base) {
        String v = overrides.get(key);
        return v == null ? base : Boolean.parseBoolean(v);
    }
}
