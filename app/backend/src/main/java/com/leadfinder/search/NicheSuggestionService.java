package com.leadfinder.search;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/**
 * Maps freelancer service offerings into targeted local business niches.
 * Results are cached in the database by service hash to preserve $0 AI quota.
 */
@Service
@RequiredArgsConstructor
public class NicheSuggestionService {

    private final ServiceNicheCacheRepository cache;

    /** Search terms for the industries a person picked in their profile. */
    private static final java.util.Map<String, String> TARGET_NICHES = java.util.Map.ofEntries(
            java.util.Map.entry("dentists and clinics", "dental clinics"),
            java.util.Map.entry("doctors and clinics", "doctors and clinics"),
            java.util.Map.entry("pharmacies", "pharmacies"),
            java.util.Map.entry("restaurants and cafés", "restaurants"),
            java.util.Map.entry("hotels and guesthouses", "hotels"),
            java.util.Map.entry("gyms and fitness", "gyms"),
            java.util.Map.entry("beauty salons", "beauty salons"),
            java.util.Map.entry("hair salons", "hair salons"),
            java.util.Map.entry("law firms", "lawyers"),
            java.util.Map.entry("car repair", "car repair"),
            java.util.Map.entry("bakeries", "bakeries"),
            java.util.Map.entry("schools and training", "schools"));

    /** The person's own picks first, then guesses from what they offer. */
    public List<String> suggestFor(String offer, List<String> targets) {
        Set<String> out = new LinkedHashSet<>();
        for (String t : targets) {
            if (t == null || t.isBlank()) continue;
            out.add(TARGET_NICHES.getOrDefault(t.trim().toLowerCase(Locale.ROOT), t.trim().toLowerCase(Locale.ROOT)));
        }
        if (out.size() < 5) out.addAll(suggestNiches(offer));
        return out.stream().limit(8).toList();
    }

    public List<String> suggestNiches(String serviceOffer) {
        if (serviceOffer == null || serviceOffer.isBlank()) {
            return defaultNiches();
        }

        String normalized = serviceOffer.trim().toLowerCase(Locale.ROOT);
        String hash = hash(normalized);

        Optional<ServiceNicheCache> hit = cache.findById(hash);
        if (hit.isPresent()) {
            return Arrays.stream(hit.get().getNichesCsv().split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .toList();
        }

        List<String> suggested = mapServiceToNiches(normalized);
        String csv = String.join(", ", suggested);
        cache.save(new ServiceNicheCache(hash, serviceOffer.trim(), csv));
        return suggested;
    }

    private List<String> mapServiceToNiches(String text) {
        Set<String> matched = new LinkedHashSet<>();

        if (text.contains("book") || text.contains("reserv") || text.contains("rendez-vous")) {
            matched.add("dental clinics");
            matched.add("hair salons");
            matched.add("doctors and clinics");
            matched.add("car repair");
        }
        if (text.contains("clinic") || text.contains("health") || text.contains("santé") || text.contains("medic")) {
            matched.add("dental clinics");
            matched.add("doctors and clinics");
            matched.add("pharmacies");
        }
        if (text.contains("design") || text.contains("vitrine") || text.contains("redesign") || text.contains("refonte")) {
            matched.add("lawyers");
            matched.add("hair salons");
            matched.add("hotels");
            matched.add("restaurants");
        }
        if (text.contains("order") || text.contains("food") || text.contains("menu") || text.contains("restau")) {
            matched.add("restaurants");
            matched.add("cafes");
            matched.add("bakeries");
        }
        if (text.contains("fitness") || text.contains("sport") || text.contains("gym") || text.contains("coach")) {
            matched.add("gyms");
            matched.add("hair salons");
        }
        if (text.contains("law") || text.contains("avocat") || text.contains("jurid") || text.contains("legal")) {
            matched.add("lawyers");
            matched.add("doctors and clinics");
        }

        if (matched.isEmpty()) {
            return defaultNiches();
        }
        return new ArrayList<>(matched);
    }

    private List<String> defaultNiches() {
        return List.of("dental clinics", "hair salons", "lawyers", "restaurants", "car repair");
    }

    private String hash(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return Integer.toHexString(input.hashCode());
        }
    }
}
