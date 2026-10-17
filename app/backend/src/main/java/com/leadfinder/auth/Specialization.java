package com.leadfinder.auth;

import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Locale;

/**
 * The three fixed profiles a guest can pick. Each sets the services, target industries and the offer text the AI
 * reads, so a guest gets specific leads and drafts while the profile stays free of arbitrary text.
 * Industry names must match the ones in the web app's profile chips.
 */
public enum Specialization {
    FULLSTACK("Full-stack developer",
            List.of("Web development", "Automation"),
            List.of("Dentists and clinics", "Restaurants and cafés", "Hotels and guesthouses", "Gyms and fitness"),
            "Custom websites, booking systems and automation for small local businesses"),
    UXUI("UX/UI designer",
            List.of("UI/UX design", "Branding and logos"),
            List.of("Hotels and guesthouses", "Restaurants and cafés", "Beauty salons", "Law firms"),
            "UX/UI design and website redesign for small local businesses"),
    STRATEGY("Creative strategist",
            List.of("Social media", "Branding and logos", "Copywriting"),
            List.of("Restaurants and cafés", "Bakeries", "Beauty salons", "Gyms and fitness"),
            "Brand and creative strategy, social media and content for small local businesses");

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final String headline;
    private final List<String> services;
    private final List<String> targets;
    private final String offer;

    Specialization(String headline, List<String> services, List<String> targets, String offer) {
        this.headline = headline;
        this.services = services;
        this.targets = targets;
        this.offer = offer;
    }

    /** Parses a value sent by the web app. Empty means the default. */
    public static Specialization parse(String value) {
        if (value == null || value.isBlank()) return FULLSTACK;
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown specialization");
        }
    }

    /** Writes this specialization's profile fields onto the user. */
    public void apply(AppUser u) {
        u.setSpecialization(name());
        u.setHeadline(headline);
        u.setServices(JSON.writeValueAsString(services));
        u.setTargets(JSON.writeValueAsString(targets));
        u.setOffer(offer);
    }
}
