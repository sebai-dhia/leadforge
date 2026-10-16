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

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    /** What the freelancer sells, reused by every search and draft. */
    @Column(nullable = false)
    private String offer = "";

    @Column(name = "display_name", nullable = false)
    private String displayName = "";

    /** Preferred draft language: en, fr or ar. */
    @Column(nullable = false)
    private String language = "en";

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
