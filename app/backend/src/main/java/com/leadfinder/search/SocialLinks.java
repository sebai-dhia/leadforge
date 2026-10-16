package com.leadfinder.search;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Keeps only real Facebook and Instagram pages, and drops share buttons, trackers and policy links. */
final class SocialLinks {
    private static final Set<String> NOT_A_PAGE = Set.of(
            "sharer", "sharer.php", "share", "share.php", "plugins", "dialog", "tr", "login", "login.php",
            "recover", "policies", "help", "privacy", "terms", "legal", "ads", "business", "about", "explore",
            "accounts", "p", "reel", "reels", "stories", "hashtag", "direct", "developers", "watch", "gaming");

    private static final int MAX = 3;

    private SocialLinks() {}

    static List<String> normalize(List<String> raw) {
        Map<String, String> unique = new LinkedHashMap<>();
        if (raw != null) {
            for (String r : raw) {
                String clean = normalizeOne(r);
                if (clean != null) unique.putIfAbsent(clean.toLowerCase(Locale.ROOT), clean);
            }
        }
        return new ArrayList<>(unique.values()).subList(0, Math.min(MAX, unique.size()));
    }

    static String normalizeOne(String raw) {
        if (raw == null) return null;
        try {
            URI uri = URI.create(raw.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (host == null || scheme == null || !(scheme.equals("http") || scheme.equals("https"))) return null;
            host = host.toLowerCase(Locale.ROOT).replaceFirst("^(www|m|web|mobile|l)\\.", "");
            String site = host.equals("facebook.com") || host.equals("fb.com") ? "facebook.com"
                    : host.equals("instagram.com") ? "instagram.com" : null;
            if (site == null) return null;

            String path = uri.getPath() == null ? "" : uri.getPath().replaceAll("/+$", "");
            if (path.isEmpty()) return null;
            String first = path.substring(1).split("/")[0].toLowerCase(Locale.ROOT);
            if (NOT_A_PAGE.contains(first)) return null;

            String query = "";
            if (first.equals("profile.php")) {
                // A profile link is only meaningful with a numeric id; without one it points nowhere.
                if (uri.getQuery() != null) {
                    for (String part : uri.getQuery().split("&")) {
                        if (part.startsWith("id=") && part.substring(3).matches("\\d{5,20}")) query = "?" + part;
                    }
                }
                if (query.isEmpty()) return null;
            }
            return "https://www." + site + path + query;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
