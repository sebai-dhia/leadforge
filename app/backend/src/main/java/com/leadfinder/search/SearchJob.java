package com.leadfinder.search;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "search_jobs")
@Getter
@Setter
public class SearchJob {
    public enum Status { PENDING, DONE, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    private String niche;
    private String city;
    private String bbox;
    private String service;
    private String sender;

    @Enumerated(EnumType.STRING)
    private Status status = Status.PENDING;

    /** Businesses this search returned, and how many of them the user had not seen before. */
    @Column(name = "found_count")
    private Integer foundCount;

    @Column(name = "new_count")
    private Integer newCount;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
