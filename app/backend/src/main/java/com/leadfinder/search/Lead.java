package com.leadfinder.search;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** One business, owned by a user. Searches that find it again update it but keep status and message. */
@Entity
@Table(name = "leads")
@Getter
@Setter
public class Lead {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    private String niche;
    private String city;
    private String name;
    private String address;
    private String phone;
    private Double rating;
    private Integer reviews;
    private String website;
    private String emails;
    private Integer score;
    private String reason;
    private String subject;

    @Column(name = "email_body")
    private String emailBody;

    private String status = "NEW";

    @Column(name = "draft_language")
    private String draftLanguage;

    @Column(name = "draft_channel")
    private String draftChannel;

    /** Stable id from the place provider. The strongest dedupe key. */
    @Column(name = "place_id")
    private String placeId;

    /** Last 8 digits of the phone number, to match the same business listed with different formatting. */
    @Column(name = "phone_key")
    private String phoneKey;

    @Column(name = "website_host")
    private String websiteHost;

    /** Facebook and Instagram pages, comma separated. */
    private String social;

    /** When the on-demand contact lookup last ran for this lead. */
    @Column(name = "contact_checked_at")
    private Instant contactCheckedAt;

    @Column(name = "first_seen_at", insertable = false, updatable = false)
    private Instant firstSeenAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt = Instant.now();
}
