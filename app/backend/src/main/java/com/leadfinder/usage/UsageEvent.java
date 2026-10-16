package com.leadfinder.usage;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "usage_events")
@Getter
@Setter
@NoArgsConstructor
public class UsageEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String kind;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public UsageEvent(Long userId, String kind) {
        this.userId = userId;
        this.kind = kind;
    }
}
