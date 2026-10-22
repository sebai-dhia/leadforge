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

    /** What the draft workflow read on the person's links, and for which links (hash) and when. See SenderKnowledge. */
    @Column(name = "links_knowledge")
    private String linksKnowledge;

    @Column(name = "links_knowledge_hash")
    private String linksKnowledgeHash;

    @Column(name = "links_knowledge_at")
    private java.time.Instant linksKnowledgeAt;

    /** Guests only: FULLSTACK, UXUI or STRATEGY. */
    @Column
    private String specialization;

    /** True once the first-run picker was completed or skipped. */
    @Column(nullable = false)
    private boolean onboarded = false;

    @Column(nullable = false)
    private String role = "USER";

    @Column(name = "is_demo", nullable = false)
    private boolean isDemo = false;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    /** Written by LastSeen, at most every few minutes. Read-only here so saving a user never overwrites it. */
    @Column(name = "last_seen_at", insertable = false, updatable = false)
    private Instant lastSeenAt;

    /** The connected Telegram chat, and its settings. Written only by UserRepository's telegram queries, so saving a user never overwrites them. */
    @Column(name = "telegram_chat_id", insertable = false, updatable = false)
    private Long telegramChatId;

    @Column(name = "telegram_notify", insertable = false, updatable = false)
    private boolean telegramNotify = true;

    @Column(name = "telegram_language", insertable = false, updatable = false)
    private String telegramLanguage = "en";

    @Column(name = "telegram_link_code", insertable = false, updatable = false)
    private String telegramLinkCode;

    @Column(name = "telegram_link_expires_at", insertable = false, updatable = false)
    private Instant telegramLinkExpiresAt;

    /** An IANA zone such as Africa/Tunis: the follow-up reminder goes out in the person's morning. */
    @Column(name = "telegram_timezone", insertable = false, updatable = false)
    private String telegramTimezone = "UTC";

    @Column(name = "telegram_reminded_on", insertable = false, updatable = false)
    private java.time.LocalDate telegramRemindedOn;

    /** Shared demo accounts and guests cannot connect a chat: someone else would get the messages. */
    public boolean canUseTelegram() {
        return !isDemo && !"GUEST".equalsIgnoreCase(role);
    }

    public boolean isAdmin() {
        return "ADMIN".equalsIgnoreCase(role);
    }
}
