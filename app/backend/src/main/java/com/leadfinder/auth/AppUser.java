package com.leadfinder.auth;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "users")
@Getter
@Setter
public class AppUser {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    /** Empty for accounts created through Google sign-in. */
    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "google_sub", unique = true)
    private String googleSub;

    /** What the freelancer sells, reused by every search and draft. */
    @Column(nullable = false)
    private String offer = "";

    @Column(name = "display_name", nullable = false)
    private String displayName = "";

    /** Preferred draft language: en, fr or ar. */
    @Column(nullable = false)
    private String language = "en";

    /** One line under the name, like "Designer for local businesses". */
    @Column(nullable = false)
    private String headline = "";

    @Column(nullable = false)
    private String city = "";

    /** A short sentence the AI uses to sign messages. */
    @Column(nullable = false)
    private String about = "";

    /** JSON lists. Chosen services, target industries and links. */
    @Column(nullable = false)
    private String services = "[]";

    @Column(nullable = false)
    private String targets = "[]";

    @Column(nullable = false)
    private String links = "[]";

    /** Guests only: FULLSTACK, UXUI or STRATEGY. */
    @Column
    private String specialization;

    /** True once the first-run picker was completed or skipped. */
    @Column(nullable = false)
    private boolean onboarded = false;

    @Column(nullable = false)
    private String role = "DEMO_USER";

    @Column(name = "is_demo", nullable = false)
    private boolean isDemo = false;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    public boolean isAdmin() {
        return "ADMIN".equalsIgnoreCase(role);
    }
}
